/*
 * A LIST WITH NO KEY IS A CONSOLE WARNING AND NOTHING ELSE.
 *
 * The page renders, every other test passes, and React quietly falls back to
 * the array index - which is wrong the moment a list is filtered, sorted or
 * appended to, and shows up as items keeping each other's state.
 *
 * The About page had it on every one of its lists at once. Those rows used to
 * come out of three database tables with an `id` column; the copy moved into
 * content.js, the columns did not come with it, and twelve components kept
 * keying on `.id`. Seventeen call sites, every key `undefined`, and the only
 * symptom was a warning in a console nobody had open.
 *
 * A FILE OF ITS OWN, and that is the whole reason this is not in
 * pages.test.js. React emits each key warning ONCE per component, so a page
 * already mounted by an earlier test in the same file has already spent its
 * warning - the check passed against the unfixed code when it lived there.
 * Jest gives each file a fresh module registry, so here the first mount of a
 * page is genuinely its first.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ChakraProvider } from '@chakra-ui/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import fs from 'fs';
import path from 'path';

import theme from './theme';
import { I18nProvider } from './i18n';
import auth from './app/authSlice';
import catalog from './app/catalogSlice';
import compare from './app/compareSlice';
import notices from './app/noticeSlice';

jest.mock('./api', () => {
  /*
   * `data` is an OBJECT, not null - unlike the stub in pages.test.js, which
   * can leave it null because it never lets the promise resolve. This one
   * waits for the answer, so a page that reads `data.hero` on a cold cache
   * actually runs that line.
   */
  const reply = () => Promise.resolve({
    rows: [], total: 0, page: 1, limit: 20, items: [], data: {}, summary: null
  });

  const handler = {
    get(target, name) {
      if (name === '__esModule') return true;
      if (typeof name !== 'string') return undefined;
      if (name === 'then') return undefined;

      if (!target[name]) target[name] = new Proxy(reply, handler);
      return target[name];
    },
    apply: reply
  };

  return { __esModule: true, default: new Proxy({}, handler), fileUrl: (p) => p || '' };
});

const store = configureStore({
  reducer: { auth, catalog, compare, notices },
  middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false })
});

function routedPaths() {
  const app = fs.readFileSync(path.join(__dirname, 'App.js'), 'utf8');
  const found = [];

  const re = /<Route\s+exact\s+path="([^"]+)"\s+component=\{(\w+)\}/g;
  let m = re.exec(app);

  while (m !== null) {
    found.push({ path: m[1], name: m[2] });
    m = re.exec(app);
  }

  return found;
}

function importMap() {
  const app = fs.readFileSync(path.join(__dirname, 'App.js'), 'utf8');
  const map = {};

  const re = /import\s+(\w+)\s+from\s+'@\/([^']+)'/g;
  let m = re.exec(app);

  while (m !== null) {
    map[m[1]] = m[2];
    m = re.exec(app);
  }

  return map;
}

const paths = routedPaths();
const imports = importMap();

/**
 * Mounts a page, lets its first request settle, and returns whatever React
 * complained about keys.
 *
 * AWAITED, and that is load-bearing. A page renders a spinner synchronously
 * and its lists only after the stubbed promise resolves - so a render measured
 * inside a synchronous act() sees no lists at all, and the check passed
 * against code whose every key was undefined.
 */
async function keyComplaintsFrom(Component, at) {
  const host = document.createElement('div');
  document.body.appendChild(host);

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
              <MemoryRouter initialEntries={[at]}>
                <Route path={at}><Component /></Route>
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
  expect(paths.length).toBeGreaterThan(20);
});

describe('every routed page keys its lists', () => {
  paths.forEach((route) => {
    const where = route.path.replace(/:(\w+)\?/g, '').replace(/:\w+/g, 'x').replace(/\/+$/, '') || '/';

    test(route.path + '  (' + route.name + ')', async () => {
      const from = imports[route.name];
      if (!from) return;

      // eslint-disable-next-line global-require, import/no-dynamic-require
      const mod = require('./' + from);
      const Component = mod.default || mod[route.name];

      expect(await keyComplaintsFrom(Component, where)).toEqual([]);
    });
  });
});
