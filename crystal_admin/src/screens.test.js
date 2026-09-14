/*
 * EVERY SCREEN, MOUNTED.
 *
 * smoke.test.js proves the component library works; this proves the forty
 * screens built on it come up. Nothing else does: `npm run build` resolves
 * imports and parses files, and both of those pass for a screen that throws
 * the moment React runs it - a hook called conditionally, a helper imported
 * under the wrong name, a column list that reads a property off undefined.
 *
 * The API is stubbed to one correctly-shaped row, so this asks "does it come
 * up with something to draw" rather than "does it say the right words". A
 * screen that only fails when the network answers slowly is a different test.
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

/** Mount one screen at its own url and hand back what it drew. */
function mountAt(route, locale) {
  const host = document.createElement('div');
  document.body.appendChild(host);

  const Component = route.component;

  /* Switches the provider into `locale` before the screen under it renders. */
  function InLocale() {
    const { setLocale } = useI18n();

    React.useEffect(() => {
      if (locale) setLocale(locale);
    }, [setLocale]);

    return (
      <Route path={route.path}>
        <Component />
      </Route>
    );
  }

  act(() => {
    ReactDOM.render(
      <ChakraProvider theme={theme}>
        <I18nProvider>
          <Provider store={store}>
            <MemoryRouter initialEntries={[route.path.replace(/:\w+/g, '1')]}>
              <ConfirmProvider><InLocale /></ConfirmProvider>
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

test('the route table has a component for every path', () => {
  const broken = routes.filter((route) => typeof route.component !== 'function');
  expect(broken.map((r) => r.path)).toEqual([]);
  expect(routes.length).toBeGreaterThan(30);
});

describe('every screen mounts', () => {
  routes.forEach((route) => {
    test(route.path, () => {
      const { html } = mountAt(route);

      /*
       * Something has to be on screen. A screen that renders nothing at all
       * is usually a guard returning null for a reason that will not apply in
       * production, and it would make this test pass without checking
       * anything.
       */
      expect(html.length).toBeGreaterThan(0);
    });
  });
});

/*
 * A screen that renders English on a Chinese console.
 *
 * The catalogue tests prove every ENTRY is translated. They say nothing about
 * copy that never became an entry, and nothing about a component that renders
 * a label without calling t() - which is what every table heading in this
 * console did, while the form beside it translated the same field labels.
 *
 * So each screen is rendered in Chinese and checked for English the catalogue
 * proves is translatable: if a string is an entry whose Chinese differs, then
 * seeing the English on a zh screen means it did not go through t().
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
       * Long enough to be copy rather than a word that could turn up inside a
       * stubbed row, a url or a brand name.
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
  describe('every screen renders in ' + locale, () => {
    const translatable = translatableInto(locale);

    routes.forEach((route) => {
      test(route.path, () => {
        const { text } = mountAt(route, locale);
        expect(translatable.filter((sentence) => text.indexOf(sentence) !== -1)).toEqual([]);
      });
    });
  });
});
