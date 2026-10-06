/**
 * Unit tests for the 401 -> refresh -> retry interceptor.
 *
 * The server-side refresh flow is covered end-to-end by
 * vendor_backend/mock/tests/auth_refresh_test.sh. What that cannot reach is
 * the client half: whether concurrent 401s collapse into one refresh, and
 * whether the retry actually goes back through the configured instance.
 * Both were broken before, and both fail silently rather than loudly, so
 * they are pinned here.
 *
 * axios is mocked at the module boundary because the interceptor is
 * registered when api/axios is first imported.
 */

/** A stand-in axios instance: callable, with get/post and an interceptor slot. */
const buildFakeAxios = () => {
  const calls = { get: [], post: [], direct: [] };
  let rejectionHandler = null;

  // Per-URL queue of canned outcomes.
  const responders = {};

  const respond = (url) => {
    const queue = responders[url];
    const outcome = queue && queue.length ? queue.shift() : { ok: true, data: {} };
    return outcome.ok
      ? Promise.resolve({ data: outcome.data })
      : Promise.reject(outcome.error);
  };

  const instance = function directCall(config) {
    calls.direct.push(config);
    return respond(config.url);
  };

  instance.get = (url, config) => {
    calls.get.push({ url, config });
    return respond(url);
  };
  instance.post = (url, data, config) => {
    calls.post.push({ url, data, config });
    return respond(url);
  };
  instance.interceptors = {
    response: {
      use: (onSuccess, onError) => {
        rejectionHandler = onError;
      },
    },
  };

  return {
    instance,
    calls,
    responders,
    getRejectionHandler: () => rejectionHandler,
  };
};

let fake;

jest.mock('axios', () => ({
  create: () => global.__FAKE_AXIOS__.instance,
}));

const httpError = (status, url, body) => ({
  config: { url },
  response: { status, statusText: 'Error', data: body || {} },
});

let axiosModule;

beforeEach(() => {
  jest.resetModules();
  fake = buildFakeAxios();
  global.__FAKE_AXIOS__ = fake;
  // eslint-disable-next-line global-require
  axiosModule = require('api/axios');
});

const reject = (error) => fake.getRejectionHandler()(error);

describe('401 handling', () => {
  it('refreshes once for concurrent 401s rather than once per request', async () => {
    fake.responders['/auth/refresh_token'] = [{ ok: true, data: { code: 200 } }];
    fake.responders['/a'] = [{ ok: true, data: { code: 200, tag: 'a' } }];
    fake.responders['/b'] = [{ ok: true, data: { code: 200, tag: 'b' } }];
    fake.responders['/c'] = [{ ok: true, data: { code: 200, tag: 'c' } }];

    await Promise.all([
      reject(httpError(401, '/a')),
      reject(httpError(401, '/b')),
      reject(httpError(401, '/c')),
    ]);

    const refreshCalls = fake.calls.get.filter((c) => c.url === '/auth/refresh_token');
    expect(refreshCalls.length).toBe(1);
  });

  it('retries through the configured instance, not a bare axios call', async () => {
    fake.responders['/auth/refresh_token'] = [{ ok: true, data: {} }];
    fake.responders['/orders'] = [{ ok: true, data: { code: 200 } }];

    const result = await reject(httpError(401, '/orders'));

    // The retry must go through the instance that carries baseURL and
    // withCredentials, or the refreshed cookie is never sent.
    expect(fake.calls.direct.length).toBe(1);
    expect(fake.calls.direct[0].url).toBe('/orders');
    expect(result.data.code).toBe(200);
  });

  it('marks the request so a second 401 cannot loop', async () => {
    fake.responders['/auth/refresh_token'] = [{ ok: true, data: {} }];
    fake.responders['/orders'] = [{ ok: true, data: {} }];

    const error = httpError(401, '/orders');
    await reject(error);

    expect(error.config._retry).toBe(true);

    // A already-retried request must not refresh again.
    const before = fake.calls.get.length;
    await expect(reject(error)).rejects.toBeDefined();
    expect(fake.calls.get.length).toBe(before);
  });

  it('notifies the app and rejects when the refresh itself fails', async () => {
    fake.responders['/auth/refresh_token'] = [{ ok: false, error: httpError(401, '/auth/refresh_token') }];

    let expired = 0;
    axiosModule.setSessionExpiredHandler(() => { expired += 1; });

    await expect(reject(httpError(401, '/orders', { code: 401, message: 'Unauthorized' })))
      .rejects.toMatchObject({ code: 401, message: 'Unauthorized' });

    expect(expired).toBe(1);
  });

  it('allows a later refresh after an earlier one failed', async () => {
    fake.responders['/auth/refresh_token'] = [
      { ok: false, error: httpError(401, '/auth/refresh_token') },
      { ok: true, data: {} },
    ];
    fake.responders['/orders'] = [{ ok: true, data: { code: 200 } }];

    await expect(reject(httpError(401, '/first'))).rejects.toBeDefined();
    // The single-flight slot has to clear, or the session can never recover.
    await reject(httpError(401, '/orders'));

    const refreshCalls = fake.calls.get.filter((c) => c.url === '/auth/refresh_token');
    expect(refreshCalls.length).toBe(2);
  });
});

describe('requests that must never trigger a refresh', () => {
  it.each([
    '/auth/refresh_token',
    '/auth/web_auth',
    '/auth/web_login',
    '/auth/web_logout',
  ])('does not refresh on a 401 from %s', async (url) => {
    await expect(reject(httpError(401, url))).rejects.toBeDefined();
    expect(fake.calls.get.filter((c) => c.url === '/auth/refresh_token').length).toBe(0);
  });

  it('does not refresh on a non-401 status', async () => {
    await expect(reject(httpError(500, '/orders'))).rejects.toMatchObject({ code: 500 });
    expect(fake.calls.get.length).toBe(0);
  });

  it('reports a network error without a response as code 0', async () => {
    await expect(reject({ config: { url: '/orders' }, response: undefined }))
      .rejects.toMatchObject({ code: 0, message: 'Network error' });
  });
});

describe('error shape', () => {
  it('prefers the server envelope over the HTTP status line', async () => {
    await expect(reject(httpError(400, '/orders', { code: 4001, message: 'Bad product_pk', data: { field: 'product_pk' } })))
      .rejects.toEqual({ code: 4001, message: 'Bad product_pk', data: { field: 'product_pk' } });
  });

  it('falls back to the HTTP status when the body carries no code', async () => {
    await expect(reject(httpError(404, '/orders', {})))
      .rejects.toMatchObject({ code: 404 });
  });
});
