/*
 * THE APPSTORE PAGES, WITH DATA IN THEM.
 *
 * pages.test.js mounts every route against an empty reply, which reaches none
 * of the markup below. What is held here is the handful of facts that are
 * easy to get wrong and silent when wrong:
 *
 *   A PURCHASE IS NOT ALWAYS AN APP. The store sells five things and each
 *   names itself in a different field; an avatar names itself in none of
 *   them, and a blank cell reads as data that failed to load.
 *
 *   THE KEY BUTTON IS OFFERED ONLY WHERE THERE IS A KEY. A button that
 *   answers "there is no licence" is a button that lied.
 *
 *   A COMMENT SAYS WHETHER IT IS APPROVED. A member whose comment is waiting
 *   is otherwise shown it as though it were live.
 *
 * Rows arrive through the API mock rather than by stubbing useList - see the
 * note in eshop.test.js for why replacing the hook does not work here.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';

import theme from './theme';
import { I18nProvider } from './i18n';
import {
  AppstoreComments,
  AppstoreFavourites,
  AppstorePurchases,
  AppstoreWallet
} from './pages/account/storefront/Appstore';

const mockState = {
  purchases: [], comments: [], favourites: [], transactions: [], licence: null, asked: []
};

jest.mock('./api', () => {
  const page = (rows) => Promise.resolve({
    data: { rows: rows, total: rows.length, page: 1, limit: 12, summary: { linked: true } }
  });

  return {
    __esModule: true,
    default: {
      account: {
        appstorePurchases: () => page(mockState.purchases),
        appstoreComments: () => page(mockState.comments),
        appstoreFavourites: () => page(mockState.favourites),
        appstoreTransactions: (params) => {
          mockState.asked.push(params);
          return page(mockState.transactions);
        },
        appstoreBalance: () => Promise.resolve({ data: { coins: 120, frozen: 8, linked: true } }),
        appstoreLicense: () => Promise.resolve({ data: mockState.licence })
      }
    },
    fileUrl: (p) => p || ''
  };
});

const PURCHASES = [
  {
    id: 'PH1', kind: 'APP', name: 'Crystal Karaoke',
    url: 'https://store.example/app/1', app_version: '2.4.1',
    device_no: 'CR100200300', currency: 'COMPANY', price: 48,
    status: 'PURCHASED', status_reason: null,
    licence_state: 'ISSUED', licence_available: true, at: '2026-09-01 15:00:00'
  },
  {
    /* No name of its own - the store sends none for an avatar. */
    id: 'PH2', kind: 'AVATAR', name: null, url: null, app_version: null,
    device_no: 'CR100200301', currency: 'IMMATERIAL', price: 12,
    status: 'CANCELLED', status_reason: null,
    licence_state: 'NONE', licence_available: false, at: '2026-08-28 10:00:00'
  },
  {
    id: 'PH3', kind: 'DIAMOND', name: '500 diamonds', url: 'https://store.example/others/diamonds',
    app_version: null, device_no: 'CR100200302', currency: 'COMPANY', price: 90,
    status: 'FAILED', status_reason: 'Not enough coins',
    licence_state: 'NONE', licence_available: false, at: '2026-08-20 09:00:00'
  }
];

const COMMENTS = [
  {
    id: 1, app_name: 'Crystal Notes', icon_url: null, rating: 5,
    content: 'Exactly what I needed.', approved: true, at: '2026-09-01 09:00:00'
  },
  {
    id: 2, app_name: 'Crystal Files', icon_url: null, rating: 3,
    content: 'Needs a dark theme.', approved: false, at: '2026-08-30 09:00:00'
  }
];

const FAVOURITES = [
  { id: 'FV1', app_name: 'Crystal Radio', icon_url: null, approved: true, at: '2026-09-02 09:00:00' },
  { id: 'FV2', app_name: 'Crystal Weather', icon_url: null, approved: false, at: '2026-08-11 09:00:00' }
];

const TRANSACTIONS = [
  {
    id: 'AW1', amount: 120, currency: 'COMPANY', currency_id: 1,
    kind: 'TOPUP', kind_id: 1, reference: 'TX9001',
    detail: 'Coin top up', at: '2026-09-01 13:00:00'
  },
  {
    id: 'AW2', amount: -40, currency: 'FOREIGN', currency_id: 2,
    /* A code this build has never heard of; it must not print. */
    kind: null, kind_id: 9, reference: 'TX9002',
    detail: 'Something new', at: '2026-08-29 13:00:00'
  }
];

async function mount(element) {
  const host = document.createElement('div');
  document.body.appendChild(host);

  await act(async () => {
    ReactDOM.render(
      <ChakraProvider theme={theme}>
        <I18nProvider>
          <MemoryRouter>{element}</MemoryRouter>
        </I18nProvider>
      </ChakraProvider>,
      host
    );
  });

  return {
    host,
    text: () => host.textContent,
    headers: () => Array.prototype.map.call(
      host.querySelectorAll('thead th'), (th) => th.textContent
    ),
    async done() {
      await act(async () => { ReactDOM.unmountComponentAtNode(host); });
      document.body.removeChild(host);
    }
  };
}

afterEach(() => {
  mockState.purchases = [];
  mockState.comments = [];
  mockState.favourites = [];
  mockState.transactions = [];
  mockState.licence = null;
  mockState.asked = [];
  document.body.innerHTML = '';
});

test('the columns are in the vendor\'s order, on all four tables', async () => {
  /*
   * The order is the requirement rather than a preference, and it is the kind
   * of thing quietly rearranged by whoever next adds a column - nothing else
   * anywhere would complain.
   */
  mockState.purchases = PURCHASES;
  mockState.comments = COMMENTS;
  mockState.favourites = FAVOURITES;
  mockState.transactions = TRANSACTIONS;

  const purchases = await mount(<AppstorePurchases />);
  expect(purchases.headers()).toEqual([
    'No.', 'Type', 'Name', 'Device', 'Paid', 'Bought', 'Status', 'Licence'
  ]);
  await purchases.done();

  const comments = await mount(<AppstoreComments />);
  expect(comments.headers()).toEqual([
    'No.', 'Commented app', 'Rating', 'Comment', 'Posted', 'Status'
  ]);
  await comments.done();

  const favourites = await mount(<AppstoreFavourites />);
  expect(favourites.headers()).toEqual(['No.', 'Image', 'App', 'Saved']);
  await favourites.done();

  const wallet = await mount(<AppstoreWallet />);
  expect(wallet.headers()).toEqual([
    'No.', 'Coins', 'Wallet', 'Transaction type', 'Transaction no.', 'Detail', 'When'
  ]);
  await wallet.done();
});

test('a purchase that is not an app still says what it was', async () => {
  mockState.purchases = PURCHASES;

  const ui = await mount(<AppstorePurchases />);
  const text = ui.text();

  expect(text).toContain('Crystal Karaoke');
  expect(text).toContain('500 diamonds');

  /* And a failure explains itself, in the store's own words. */
  expect(text).toContain('Not enough coins');

  /*
   * THE AVATAR FALLS BACK TO ITS KIND, and the NAME CELL is where that has
   * to be checked. Asserting on the page text passes either way - "Avatar"
   * is already in the Type column of the same row - so an assertion written
   * that way holds nothing, which is how it was written the first time.
   */
  const headers = Array.prototype.map.call(
    ui.host.querySelectorAll('thead th'), (th) => th.textContent
  );
  const nameAt = headers.indexOf('Name');
  expect(nameAt).toBeGreaterThan(-1);

  const rows = Array.prototype.filter.call(
    ui.host.querySelectorAll('tbody tr'),
    (tr) => tr.textContent.indexOf('CR100200301') > -1
  );
  expect(rows.length).toBe(1);
  expect(rows[0].querySelectorAll('td')[nameAt].textContent).toBe('Avatar');

  await ui.done();
});

test('the key is offered only on a purchase that has one', async () => {
  mockState.purchases = PURCHASES;

  const ui = await mount(<AppstorePurchases />);

  /*
   * SCOPED TO THE TABLE. DataTable renders its rows TWICE - once as a
   * table and once as cards for phones, with one of the two hidden by a
   * media query. Counting across the whole tree counts everything twice,
   * which reads as a bug in the page rather than in the query.
   */
  const buttons = Array.prototype.filter.call(
    ui.host.querySelectorAll('tbody button'),
    (el) => el.textContent === 'Show key'
  );

  /* One of the three: the other two are cancelled and failed. */
  expect(buttons.length).toBe(1);

  const row = buttons[0].closest('tr');
  expect(row.textContent).toContain('Crystal Karaoke');

  await ui.done();
});

test('a comment that is waiting for approval says so', async () => {
  mockState.comments = COMMENTS;

  const ui = await mount(<AppstoreComments />);

  const rows = Array.prototype.filter.call(
    ui.host.querySelectorAll('tbody tr'),
    (tr) => tr.textContent.indexOf('Needs a dark theme') > -1
  );
  expect(rows.length).toBe(1);
  expect(rows[0].textContent).toContain('pending');

  const live = Array.prototype.filter.call(
    ui.host.querySelectorAll('tbody tr'),
    (tr) => tr.textContent.indexOf('Exactly what I needed') > -1
  );
  expect(live[0].textContent).toContain('approved');

  await ui.done();
});

test('the wallet asks the server to filter, and names what it can', async () => {
  mockState.transactions = TRANSACTIONS;

  const ui = await mount(<AppstoreWallet />);

  /* The type reaches the request rather than being applied to the rows. */
  expect(mockState.asked.length).toBeGreaterThan(0);
  expect(mockState.asked[0].type).toBe(0);

  const text = ui.text();
  expect(text).toContain('Top-up');
  expect(text).toContain('Company coins');
  expect(text).toContain('Foreign currency');

  /* The unknown code prints nothing rather than itself. */
  expect(text).toContain('Something new');
  expect(text).not.toContain('TRANSFER_OUT');

  await ui.done();
});
