/*
 * THE TWO SUPPORT PAGES, WITH THE PAYLOADS THE API REALLY SENDS.
 *
 * pages.test.js mounts every page, and that is not enough for either of
 * these. Its stub answers every endpoint with one shape -
 * `{ rows: [], total: 0, ... }` - returned where the real client returns
 * `{ data, message, meta }`, so inside a page `useApi(...).data` is
 * `undefined` on a cold mount. A page that misreads the envelope therefore
 * renders an empty table and passes.
 *
 * Which is exactly what happened. Repair pricing passed the whole paged reply
 * where its table wanted the array of rows, so choosing a product threw
 * `rows.map is not a function` in a browser and nothing at all in jest; and
 * its columns read `name` and `limit_quantity`, which a price line has never
 * had.
 *
 * So this stubs ONLY axios's adapter. The real api/index.js and the real
 * interceptor run, the envelope is unwrapped for real, and a page that reads
 * one level too deep fails here the way it fails on screen.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ChakraProvider } from '@chakra-ui/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';

import theme from '../theme';
import { I18nProvider } from '../i18n';
import client from '../api/client';
import auth from '../app/authSlice';
import catalog from '../app/catalogSlice';
import compare from '../app/compareSlice';
import notices from '../app/noticeSlice';

import RepairPricing from '../pages/support/RepairPricing';
import Faq from '../pages/support/Faq';

/* ---- the payloads, as the endpoints answer them ---- */

const PRODUCTS = {
  rows: [
    {
      id: 7, name: 'Crystal C5', slug: 'c5', model_code: 'CR-C5',
      category_type: 'SMARTPHONE', category_name: 'Smartphones', currency: 'USD'
    },
    {
      id: 9, name: 'Crystal C3', slug: 'c3', model_code: 'CR-C3',
      category_type: 'SMARTPHONE', category_name: 'Smartphones', currency: 'USD'
    }
  ],
  total: 2,
  page: 1,
  limit: 60
};

/* A price line has part_name, two prices and an approval number. Nothing else. */
const PRICING = {
  rows: [
    {
      id: 91, product_id: 7, part_name: 'Screen replacement',
      part_price: '77.00', service_price: '52.00',
      approval_no: 'CR-007-10', sort_order: 10
    },
    {
      id: 92, product_id: 7, part_name: 'Battery',
      part_price: '18.00', service_price: '9.00',
      approval_no: null, sort_order: 20
    }
  ],
  total: 2,
  page: 1,
  limit: 50
};

/* Each category says which family it is in - the website draws two rows from it. */
const FAQ_CATEGORIES = [
  { category: 'SMARTPHONE', count: 46, group: 'PRODUCTS' },
  { category: 'TV', count: 15, group: 'PRODUCTS' },
  { category: 'CRYSTAL_APP', count: 15, group: 'SERVICES' },
  { category: 'ESHOP', count: 14, group: 'SERVICES' }
];

const FAQS = {
  rows: [
    {
      id: 1, category: 'SMARTPHONE',
      question: 'How long is the warranty?',
      answer: 'Twelve months from the date of purchase.',
      view_count: 10, sort_order: 10, status: 'PUBLISHED',
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z'
    }
  ],
  total: 1,
  page: 1,
  limit: 20
};

const ROUTES = [
  ['/products/c5/service-pricing', () => PRICING],
  ['/products', () => PRODUCTS],
  ['/support/faqs/categories', () => FAQ_CATEGORIES],
  ['/support/faqs', () => FAQS]
];

function answer(config) {
  const url = String(config.url || '');

  /* Longest prefix wins, so /support/faqs/categories is not served by /support/faqs. */
  const route = ROUTES.filter((pair) => url.indexOf(pair[0]) === 0)
    .sort((a, b) => b[0].length - a[0].length)[0];

  if (!route) throw new Error('the test has no answer for ' + url);

  return {
    data: { success: true, message: 'ok', data: route[1]() },
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    config
  };
}

const store = configureStore({
  reducer: { auth, catalog, compare, notices },
  middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false })
});

async function settle() {
  for (let round = 0; round < 3; round += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mount(Component, at, path) {
  const host = document.createElement('div');
  document.body.appendChild(host);

  await act(async () => {
    ReactDOM.render(
      <ChakraProvider theme={theme}>
        <I18nProvider>
          <Provider store={store}>
            <MemoryRouter initialEntries={[at]}>
              <Route path={path || at}><Component /></Route>
            </MemoryRouter>
          </Provider>
        </I18nProvider>
      </ChakraProvider>,
      host
    );
  });

  await settle();
  return host;
}

function unmount(host) {
  act(() => { ReactDOM.unmountComponentAtNode(host); });
  document.body.removeChild(host);
}

/** The buttons on screen, by their text. */
function buttons(host) {
  return Array.prototype.slice.call(host.querySelectorAll('button'));
}

async function click(node) {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await settle();
}

beforeAll(() => {
  /* Only the network is replaced; the interceptors are the real ones. */
  client.defaults.adapter = (config) => Promise.resolve(answer(config));
});

describe('repair pricing', () => {
  let host;

  afterEach(() => { if (host) unmount(host); host = null; });

  test('a chosen product lists its price lines', async () => {
    /*
     * MOUNTED AT THE PRODUCT, which is now in the address - so this drives
     * the page the way a link from support does, rather than clicking
     * through a custom select whose internals are not the thing under test.
     */
    host = await mount(RepairPricing, '/support/repair-pricing?product=c5', '/support/repair-pricing');

    /*
     * THE ROWS, OUT OF THE PAGED REPLY. The endpoint answers
     * { rows, total, page, limit }; handing the whole object to the table
     * threw 'rows.map is not a function' and took the page down.
     */
    const text = host.textContent;
    expect(text).toContain('Screen replacement');
    expect(text).toContain('Battery');
    /* The approval number is a string, shown as it was approved. */
    expect(text).toContain('CR-007-10');
    /* Part plus labour, which the server does not send: 77 + 52. */
    expect(text).toMatch(/129/);
    /* And none of the columns that a price line has never had. */
    expect(text).not.toMatch(/NaN|undefined|per repair/);
  });

  test('and lists nothing until one is chosen', async () => {
    host = await mount(RepairPricing, '/support/repair-pricing');
    expect(host.textContent).not.toContain('Screen replacement');
  });
});

describe('the FAQ', () => {
  let host;

  afterEach(() => { if (host) unmount(host); host = null; });

  test('offers the two families first, with their counts', async () => {
    host = await mount(Faq, '/support/faq');

    const labels = buttons(host).map((node) => (node.textContent || '').trim());

    expect(labels.some((text) => text.indexOf('Products') === 0)).toBe(true);
    expect(labels.some((text) => text.indexOf('Crystal services') === 0)).toBe(true);

    /* A family's count is the sum of its categories': 46 + 15, and 15 + 14. */
    expect(host.textContent).toMatch(/Products\s*61/);
    expect(host.textContent).toMatch(/Crystal services\s*29/);

    /* The categories are NOT all on screen before a family is chosen. */
    expect(host.textContent).not.toContain('Smartphones');
  });

  test('choosing a family reveals its categories, and only its own', async () => {
    host = await mount(Faq, '/support/faq');

    const products = buttons(host)
      .filter((node) => (node.textContent || '').trim().indexOf('Products') === 0)[0];
    expect(products).toBeTruthy();

    await click(products);

    const text = host.textContent;
    expect(text).toContain('Smartphones');
    expect(text).toContain('TV');
    /* The other family's categories stay out of this row. */
    expect(text).not.toContain('Eshop');
    /* And the row offers everything in the family as well. */
    expect(text).toMatch(/All Products/);
  });

  test('an unsigned answer is still an item, with its integrity state', async () => {
    /*
     * An FAQ is signed content and this fixture carries no envelope, so
     * VerifiedFAQ refuses to draw it - which is the rule, not a fault. What
     * matters here is that the row is still an ITEM: `defaultIndex` counts
     * items, so a row that vanished would open the wrong answer for a
     * `?open=<id>` link.
     */
    host = await mount(Faq, '/support/faq');

    expect(host.textContent).toContain('could not be verified');
    expect(host.querySelectorAll('button').length).toBeGreaterThan(3);
    expect(host.textContent).not.toMatch(/NaN|undefined/);
  });
});
