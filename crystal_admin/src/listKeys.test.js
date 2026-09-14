/*
 * A LIST WITH NO KEY IS A CONSOLE WARNING AND NOTHING ELSE.
 *
 * The screen renders, every other test passes, and React quietly falls back
 * to the array index - which is wrong the moment a list is filtered, sorted
 * or appended to, and shows up as rows keeping each other's state.
 *
 * TWO THINGS MAKE THIS ITS OWN FILE, and both were learned by writing it
 * wrong first:
 *
 *   REACT WARNS ONCE PER COMPONENT. A screen already mounted by an earlier
 *   test in the same file has spent its warning, so the check passed against
 *   code whose keys were undefined. Jest gives each file a fresh module
 *   registry, so here every mount is genuinely a first mount.
 *
 *   THE MOUNT HAS TO BE AWAITED. A screen renders a spinner synchronously
 *   and its rows only once the stubbed request resolves - a check measured
 *   inside a synchronous act() sees no rows at all.
 *
 * The setup below is copied from screens.test.js by a script rather than by
 * hand; see the note at the top of that file for what it stubs and why.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ChakraProvider } from '@chakra-ui/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route } from 'react-router-dom';

import theme from './theme';
import { I18nProvider, useI18n, LOCALES } from './i18n';
import { ConfirmProvider } from './components/ConfirmDialog';
import routes from './routes';

jest.mock('./components/RichTextEditor', () => ({
  __esModule: true,
  default: function RichTextEditorStub(props) {
    return <div data-testid="richtext">{props.value}</div>;
  }
}));

/**
 * EVERY endpoint, answered the same way.
 *
 * The screens call dozens of differently named functions, and listing them
 * would mean editing this file every time one is added - so the module is
 * replaced by a proxy that invents each one on first access. Each returns the
 * envelope the client unwraps: a page holding the row below.
 */
jest.mock('./api', () => {
  /*
   * ONE ROW, NOT NONE.
   *
   * An empty list renders the empty state, and the empty state exercises none
   * of the per-row code: column renderers, row actions, the expanded panel.
   * The wallets screen passed this test with zero rows while `rowActions` was
   * an array where CrudPage calls a function - it threw on the first row a
   * real server returned, and nothing here noticed.
   *
   * Declared INSIDE the factory: jest.mock is hoisted above every const in
   * the file, so a row defined at module scope is still in its temporal dead
   * zone when the factory runs.
   *
   * Deliberately generic. This asks whether a screen survives having
   * something to draw, not whether it draws the right thing.
   */
  const PAGE_OF_ONE = {
    rows: [{
      id: 1,
      name: 'Row',
      code: 'R1',
      title: 'Row',
      status: 'ACTIVE',
      permission: 1,
      is_deleted: false,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    }],
    total: 1,
    page: 1,
    limit: 20,
    summary: null
  };

  const handler = {
    get: function (target, name) {
      if (name === '__esModule') return true;
      if (name === 'default') return new Proxy({}, handler);
      if (typeof name !== 'string') return undefined;

      if (!target[name]) {
        /*
         * Both shapes at once: `api.things(params)` and `api.things.list()`
         * are both written in this codebase, so the stub has to be callable
         * AND have callable properties.
         */
        const fn = function () {
          return Promise.resolve({ data: PAGE_OF_ONE, meta: { total: 0 } });
        };
        target[name] = new Proxy(fn, handler);
      }
      return target[name];
    },
    apply: function () {
      return Promise.resolve({ data: PAGE_OF_ONE, meta: { total: 0 } });
    }
  };

  return new Proxy({}, handler);
});

const STATE = {
  auth: {
    admin: { id: 1, name: 'Ada', username: 'admin', role_name: 'Administrator', role_id: 1 },
    /* Super, so no screen is skipped for want of a permission. */
    pages: [],
    permissions: {},
    status: 'signedIn'
  }
};

const store = {
  getState: () => STATE,
  subscribe: () => () => {},
  dispatch: () => {}
};

/** Mounts a screen, lets its first request settle, and returns key warnings. */
async function keyComplaintsFrom(route) {
  const host = document.createElement('div');
  document.body.appendChild(host);

  const Component = route.component;

  const complaints = [];
  const real = console.error;

  console.error = (...args) => {
    const text = args.map((a) => String(a)).join(' ');
    if (text.indexOf('unique "key" prop') !== -1) complaints.push(text.split('\n')[0].trim());
  };

  try {
    await act(async () => {
      ReactDOM.render(
        <ChakraProvider theme={theme}>
          <I18nProvider>
            <Provider store={store}>
              <MemoryRouter initialEntries={[route.path.replace(/:\w+/g, '1')]}>
                <ConfirmProvider>
                  <Route path={route.path}><Component /></Route>
                </ConfirmProvider>
              </MemoryRouter>
            </Provider>
          </I18nProvider>
        </ChakraProvider>,
        host
      );

      /* One turn of the microtask queue: the stubbed API answers here. */
      await Promise.resolve();
    });
  } finally {
    console.error = real;
  }

  act(() => { ReactDOM.unmountComponentAtNode(host); });
  document.body.removeChild(host);

  return complaints;
}

test('the route table was read', () => {
  expect(routes.length).toBeGreaterThan(20);
});

/**
 * Screens the generic stub cannot drive far enough to check.
 *
 * The proxy answers every endpoint with the same page-of-one envelope, which
 * is enough for a list screen and not enough for these: a dashboard reads
 * `counts.open_cnt`, a monthly report reads its own series shape. They crash
 * on the stub rather than on anything real - screens.test.js never sees it
 * because it does not wait for the answer.
 *
 * NAMED rather than skipped silently. A screen that stops being drivable
 * fails this list until somebody decides it belongs on it, which is the
 * difference between a known gap and a check that quietly covers less than
 * it claims.
 */
const CANNOT_BE_DRIVEN = [
  '/admin/dashboard',
  '/admin/analysis/monthly',
  '/admin/base/settings'
];

describe('every screen keys its lists', () => {
  routes.forEach((route) => {
    test(route.path, async () => {
      /*
       * Skipped BEFORE mounting, not after catching. React re-throws a render
       * error from places a try block around the mount does not cover, so the
       * only reliable way not to fail on one is not to provoke it.
       *
       * A screen that starts crashing without being on this list still fails
       * loudly - it just fails with its own error rather than with a tidy
       * message, which is the right amount of noise for something that broke.
       */
      if (CANNOT_BE_DRIVEN.indexOf(route.path) !== -1) return;

      expect(await keyComplaintsFrom(route)).toEqual([]);
    });
  });
});
