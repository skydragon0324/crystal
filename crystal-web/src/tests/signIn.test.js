/*
 * SIGNING IN: THE RIGHT WAY FOR THE DEVICE, AND NOWHERE UNSAFE AFTERWARDS.
 *
 * Four things here fail quietly if they regress:
 *
 *   THE DEVICE. The User-Agent names the form, through the server's own table
 *   held locally (app/authMethods.js). A desktop has no form at all - its
 *   certificate agent signs in - and a phone gets the user ID, password and
 *   CID form. A desktop with certificate sign-in switched off goes to the
 *   password page, as the vendor does in development.
 *
 *   These tests therefore say what MACHINE is visiting rather than mocking an
 *   endpoint, because that is what the page reads. `asDesktop` and `asPhone`
 *   below set the User-Agent, and the certificate build flag with it.
 *
 *   THE AGENT'S HALF. The text the member's certificate signs is
 *   client_rand + server_rand + the host of the server certificate's URL, in
 *   base64 - the vendor's X509Utils exactly. Get one byte of it wrong and every
 *   signature fails on the server with nothing to say why.
 *
 *   THE CID. The phone form must send it: without one the API holds a phone to
 *   the one-time code, and the form would fail with a message about the
 *   device rather than about anything the member typed.
 *
 *   THE REDIRECT. The Eshop and the Appstore send members here with `next` set
 *   to a URL on their own host, so the page follows absolute URLs - and an
 *   unguarded absolute URL is an open redirect off the real sign-in page.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { ChakraProvider } from '@chakra-ui/react';

import safeNext from '../app/safeNext';
import { agentVersion, hostOf } from '../app/x509Agent';
import { signInRoute } from '../hooks/useSignIn';
import { EXTERNAL } from '../components/layout/siteNav';

jest.mock('../api', () => {
  const auth = {
    login: jest.fn(),
    x509PrimaryData: jest.fn(),
    x509Login: jest.fn()
  };
  return { __esModule: true, default: { auth: auth }, auth: auth };
});

/* eslint-disable import/first */
import api from '../api';
import store from '../app/store';
import { signOut } from '../app/authSlice';
import { I18nProvider } from '../i18n';
import SignIn from '../pages/auth/SignIn';
/* eslint-enable import/first */

let seen = null;

/*
 * WHAT KIND OF MACHINE IS VISITING.
 *
 * Two real User-Agents, and the build flag that decides whether the
 * certificate agent is asked at all - `certificateReady()` reads NODE_ENV,
 * the vendor's own rule, and under the test runner that is 'test', so a test
 * that wants the agent path has to say so.
 */
const UA = {
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.121 Safari/537.36',
  phone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1'
};

const realEnv = process.env.NODE_ENV;

function visiting(agent, certificate) {
  Object.defineProperty(window.navigator, 'userAgent', {
    value: agent,
    configurable: true
  });
  process.env.NODE_ENV = certificate ? 'production' : realEnv;
}

/** A PC with the certificate agent available - a deployed build. */
const asDesktop = () => visiting(UA.desktop, true);

/** A PC without it, which is `npm start` and the vendor's dev fallback. */
const asDesktopWithoutAgent = () => visiting(UA.desktop, false);

/** A phone, which gets the user ID, password and CID form. */
const asPhone = () => visiting(UA.phone, false);

async function render(entry) {
  const host = document.createElement('div');
  document.body.appendChild(host);

  await act(async () => {
    ReactDOM.render(
      <ChakraProvider>
        <I18nProvider>
          <Provider store={store}>
            <MemoryRouter initialEntries={[entry || '/login']}>
              <Route path="/login">
                <SignIn />
              </Route>
              <Route
                path="*"
                render={({ location }) => {
                  seen = location;
                  return null;
                }}
              />
            </MemoryRouter>
          </Provider>
        </I18nProvider>
      </ChakraProvider>,
      host
    );
  });

  /* The agent and the API are promises in a row; let them all settle. */
  for (let i = 0; i < 10; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }

  return host;
}

/**
 * A stand-in for the certificate agent on 127.0.0.1:20206. `answer` gets the
 * decoded form fields and returns the JSON the agent would, or null for an
 * agent that is not running.
 */
function fakeAgent(answer) {
  const sent = [];

  function FakeXhr() {
    this.headers = {};
  }
  FakeXhr.prototype.open = function open(method, url) {
    this.method = method;
    this.url = url;
  };
  FakeXhr.prototype.setRequestHeader = function setRequestHeader(name, value) {
    this.headers[name] = value;
  };
  FakeXhr.prototype.send = function send(body) {
    const fields = {};
    String(body).split('&').forEach((pair) => {
      const parts = pair.split('=');
      fields[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1] || '');
    });
    sent.push({ url: this.url, headers: this.headers, fields: fields });

    const reply = answer(fields);
    setTimeout(() => {
      if (reply === null) {
        this.onerror();
      } else {
        this.responseText = JSON.stringify(reply);
        this.onload();
      }
    }, 0);
  };

  const original = window.XMLHttpRequest;
  window.XMLHttpRequest = FakeXhr;
  return {
    sent: sent,
    restore: () => {
      window.XMLHttpRequest = original;
    }
  };
}

async function settle() {
  for (let i = 0; i < 10; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

let agent = null;

/* The app restores the session first; here there is none to restore. */
beforeEach(() => {
  store.dispatch(signOut());
});

afterEach(() => {
  if (agent) agent.restore();
  agent = null;
  process.env.NODE_ENV = realEnv;
  seen = null;
  store.dispatch(signOut());
  jest.clearAllMocks();
  document.body.innerHTML = '';
});

test('a desktop signs in by itself through the certificate agent', async () => {
  asDesktop();
  api.auth.x509PrimaryData.mockResolvedValue({
    data: { url: 'https://crystal.example:8443/certs/server.crt', server_rand: 'SRV', server_sign: 'SIG' }
  });
  api.auth.x509Login.mockResolvedValue({ data: { token: 't', refreshToken: 'r', user: { id: 1 } } });

  agent = fakeAgent((fields) => (fields.request === 'primaryData'
    ? { version: '1.2.1.4', rand: 'CLI', userid: 'iron', err_message: '' }
    : { certData: 'PEM', certType: 'RSA', signData: 'SIGNED', err_message: '' }));

  const host = await render('/login?next=%2Faccount%2Fproducts');
  await settle();

  expect(host.querySelector('input')).toBeNull();

  /* The agent is asked with a plain form post: no header that forces a preflight. */
  expect(agent.sent).toHaveLength(2);
  expect(agent.sent[0].url).toBe('http://127.0.0.1:20206');
  expect(Object.keys(agent.sent[0].headers)).toEqual(['Content-Type']);
  expect(agent.sent[1].fields).toEqual({
    request: 'secondaryData',
    url: 'https://crystal.example:8443/certs/server.crt',
    server_rand: 'SRV',
    server_sign: 'SIG'
  });

  expect(api.auth.x509PrimaryData).toHaveBeenCalledWith('CLI', 'iron', 1214);
  expect(api.auth.x509Login).toHaveBeenCalledWith({
    certData: 'PEM',
    certType: 'RSA',
    signData: 'SIGNED',
    plainData: window.btoa('CLISRVcrystal.example:8443')
  });

  expect(store.getState().auth.status).toBe('authenticated');
  expect(seen.pathname).toBe('/account/products');
});

test('an agent that is not running is said so, with a way to try again', async () => {
  asDesktop();
  agent = fakeAgent(() => null);

  const host = await render();
  await settle();

  expect(api.auth.x509PrimaryData).not.toHaveBeenCalled();
  expect(host.textContent).toMatch(/Communication error/);
  const retry = Array.prototype.filter.call(host.querySelectorAll('button'), (b) => /try again/i.test(b.textContent))[0];
  expect(retry).toBeTruthy();
});

test('the agent\'s own refusals are the vendor\'s messages', async () => {
  asDesktop();
  agent = fakeAgent(() => ({ err_message: 'Cert Not Loaded' }));

  const host = await render();
  await settle();

  expect(host.textContent).toMatch(/Cert not loaded/);
});

test('a desktop without certificate sign-in goes to the password page, keeping next', async () => {
  asDesktopWithoutAgent();
  agent = fakeAgent(() => {
    throw new Error('the agent must not be asked');
  });

  await render('/login?next=%2Faccount');
  await settle();

  expect(agent.sent).toHaveLength(0);
  expect(seen.pathname).toBe('/auth/reganam');
  expect(seen.search).toBe('?next=%2Faccount');
});

test('a phone gets user ID, password and CID, and sends all three', async () => {
  asPhone();
  api.auth.login.mockResolvedValue({ data: { token: 't', refreshToken: 'r', user: { id: 1 } } });

  const host = await render();

  const inputs = host.querySelectorAll('input');
  expect(inputs).toHaveLength(3);

  /* React tracks input values itself, so set them through the native setter. */
  const type = (input, value) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  await act(async () => {
    type(inputs[0], 'iron');
    type(inputs[1], 'crystal1234');
    type(inputs[2], '8613800000001');
  });

  await act(async () => {
    host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });

  expect(api.auth.login).toHaveBeenCalledWith('iron', 'crystal1234', '8613800000001');
});

/* ------------------------------------------------------- the Sign in button */

test('the Sign in button signs a desktop in where it is, and sends everyone else to a page', () => {
  const desktop = { login: 'certificate', certificate: true };
  const desktopOff = { login: 'certificate', certificate: false };
  const phone = { login: 'password', certificate: true };

  expect(signInRoute(desktop, '/support/contact')).toEqual({ certificate: true });
  expect(signInRoute(desktopOff, '/support/contact')).toEqual({ to: '/auth/reganam?next=%2Fsupport%2Fcontact' });
  expect(signInRoute(phone, '/support/contact')).toEqual({ to: '/login?next=%2Fsupport%2Fcontact' });
  /* The home page is where signing in lands anyway. */
  expect(signInRoute(phone, '/')).toEqual({ to: '/login' });
  /* No answer from the API: the /login page, which can say so. */
  expect(signInRoute(null, '/')).toEqual({ to: '/login' });
});

test('the agent\'s version and the signed host are read the vendor\'s way', () => {
  expect(agentVersion('1.2.1.4')).toBe(1214);
  expect(agentVersion('')).toBe(0);
  expect(hostOf('https://crystal.example:8443/certs/server.crt')).toBe('crystal.example:8443');
  expect(hostOf('http://10.0.0.5/server.crt')).toBe('10.0.0.5');
});

/* ------------------------------------------------------------------ next */

test('a path on this site is followed', () => {
  expect(safeNext('/account/eshop/card')).toEqual({ internal: '/account/eshop/card' });
  expect(safeNext('', '/account')).toEqual({ internal: '/account' });
});

test('a page on the Eshop or the Appstore is followed', () => {
  const eshop = EXTERNAL.eshop + '/orders?id=4';
  expect(safeNext(eshop)).toEqual({ external: new URL(eshop).href });
  expect(safeNext(EXTERNAL.appstore + '/')).toEqual({ external: new URL(EXTERNAL.appstore + '/').href });
});

test('anywhere else is not', () => {
  const home = { internal: '/account' };

  expect(safeNext('https://evil.example/login')).toEqual(home);
  /* Protocol-relative, and the backslash form browsers also read as a host. */
  expect(safeNext('//evil.example')).toEqual(home);
  expect(safeNext('/\\evil.example')).toEqual(home);
  expect(safeNext('javascript:alert(1)')).toEqual(home);
  /* A host that merely CONTAINS the Eshop's host is a different host. */
  expect(safeNext('https://' + new URL(EXTERNAL.eshop).host + '.evil.example/')).toEqual(home);
});
