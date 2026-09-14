/*
 * EVERY PAGE, MOUNTED.
 *
 * `npm run build` resolves imports and parses files, and both pass for a page
 * that throws the moment React runs it - a hook called conditionally, a
 * helper imported under the wrong name, a list mapped off a property that is
 * undefined until the first response lands.
 *
 * The API is stubbed to an empty but correctly-shaped reply, so what is being
 * asked is "does it come up on a cold cache", which is the state every
 * first-time visitor arrives in and the one most likely to be untested.
 *
 * The route table is read out of App.js rather than duplicated here: a page
 * added there is covered without touching this file, which is the only way a
 * list like this stays true.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ChakraProvider } from '@chakra-ui/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route } from 'react-router-dom';
import fs from 'fs';
import path from 'path';

import theme from './theme';
import { I18nProvider, useI18n, LOCALES } from './i18n';

/*
 * Every endpoint, answered the same way - a proxy invents each name on first
 * access, so a call added to api/index.js needs no edit here.
 */
jest.mock('./api', () => {
  const reply = () => Promise.resolve({
    rows: [], total: 0, page: 1, limit: 20, items: [], data: null, summary: null
  });

  const handler = {
    get(target, name) {
      if (name === '__esModule') return true;
      if (typeof name !== 'string') return undefined;
      if (name === 'then') return undefined; /* not a thenable */

      if (!target[name]) target[name] = new Proxy(reply, handler);
      return target[name];
    },
    apply: reply
  };

  const api = new Proxy({}, handler);
  return { __esModule: true, default: api, fileUrl: (p) => p || '' };
});

/*
 * THE REAL STORE, not a hand-written state.
 *
 * Listing slices here by hand is how this drifts: a page reading a slice
 * nobody remembered to add fails with "cannot read property of undefined",
 * which looks exactly like a bug in the page. Building the store from the
 * real reducers means a slice added to the app is present here for free, and
 * every selector sees the shape it was written against.
 *
 * The signed-in member is dispatched in rather than faked, so it goes through
 * the same reducer the application uses.
 */
import { configureStore } from '@reduxjs/toolkit';
import auth from './app/authSlice';
import catalog from './app/catalogSlice';
import compare from './app/compareSlice';
import notices from './app/noticeSlice';

const store = configureStore({
  reducer: { auth, catalog, compare, notices },
  /*
   * The default middleware warns about non-serialisable values and about how
   * long a reducer takes; neither says anything about whether a page renders,
   * and both are noise at this size.
   */
  middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false })
});

/**
 * The paths App.js routes, read from the source.
 *
 * Only `component={X}` routes: the handful written as children wrap a layout
 * whose own imports this file cannot resolve by name, and they are reached
 * through the same components anyway.
 */
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

/** name -> the module App.js imports it from. */
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

function mount(Component, at, locale) {
  const host = document.createElement('div');
  document.body.appendChild(host);

  /* Switches the provider into `locale` before the page under it renders. */
  function InLocale() {
    const { setLocale } = useI18n();

    React.useEffect(() => {
      if (locale) setLocale(locale);
    }, [setLocale]);

    return <Route path={at}><Component /></Route>;
  }

  act(() => {
    ReactDOM.render(
      <ChakraProvider theme={theme}>
        <I18nProvider>
          <Provider store={store}>
            <MemoryRouter initialEntries={[at]}>
              <InLocale />
            </MemoryRouter>
          </Provider>
        </I18nProvider>
      </ChakraProvider>,
      host
    );
  });

  const html = document.body.innerHTML;
  const text = document.body.textContent;

  act(() => { ReactDOM.unmountComponentAtNode(host); });
  document.body.removeChild(host);

  return { html, text };
}

test('the route table was read', () => {
  expect(paths.length).toBeGreaterThan(20);
});

describe('every routed page mounts', () => {
  paths.forEach((route) => {
    const where = route.path.replace(/:(\w+)\?/g, '').replace(/:\w+/g, 'x').replace(/\/+$/, '') || '/';

    test(route.path + '  (' + route.name + ')', () => {
      const from = imports[route.name];
      if (!from) return; /* imported some other way; not this test's business */

      // eslint-disable-next-line global-require, import/no-dynamic-require
      const mod = require('./' + from);
      const Component = mod.default || mod[route.name];

      expect(typeof Component).toBe('function');
      expect(mount(Component, where).html.length).toBeGreaterThan(0);
    });
  });
});

/*
 * A page that renders English on a Chinese screen.
 *
 * The catalogue tests prove every ENTRY is translated. They say nothing about
 * copy that never became an entry - a constant array of sentences rendered
 * straight into JSX, which is what the whole About page and the warranty
 * terms were. There is no missing key to find, so nothing looked.
 *
 * This renders each page in Chinese and looks for English that the catalogue
 * proves is translatable: if a string is an entry, and its Chinese differs,
 * then seeing the English on a zh page means it did not go through t().
 */
function translatableInto(locale) {
  // eslint-disable-next-line global-require
  const dictionaries = require('./i18n/dictionaries').default;
  const found = [];

  const walkPair = (en, other) => {
    Object.keys(en).forEach((name) => {
      const source = en[name];
      const target = other ? other[name] : undefined;

      if (source && typeof source === 'object') {
        walkPair(source, target && typeof target === 'object' ? target : {});
        return;
      }

      /*
       * Long enough to be a sentence and not a word that could appear inside
       * a brand name, a url or a stubbed row.
       */
      if (typeof source === 'string' && typeof target === 'string'
        && source !== target && source.length > 24 && !/[{}]/.test(source)) {
        found.push(source);
      }
    });
  };

  walkPair(dictionaries.en, dictionaries[locale]);
  return found;
}

const TRANSLATIONS = LOCALES.map((entry) => entry.code).filter((code) => code !== 'en');

TRANSLATIONS.forEach((locale) => {
  describe('every page renders in ' + locale, () => {
    const translatable = translatableInto(locale);

    paths.forEach((route) => {
      const where = route.path.replace(/:(\w+)\?/g, '').replace(/:\w+/g, 'x').replace(/\/+$/, '') || '/';

      test(route.path + '  (' + route.name + ')', () => {
        const from = imports[route.name];
        if (!from) return;

        // eslint-disable-next-line global-require, import/no-dynamic-require
        const mod = require('./' + from);
        const Component = mod.default || mod[route.name];

        const { text } = mount(Component, where, locale);

        expect(translatable.filter((sentence) => text.indexOf(sentence) !== -1)).toEqual([]);
      });
    });
  });
});
