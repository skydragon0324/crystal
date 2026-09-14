/*
 * THE ESHOP PAGES, WITH DATA IN THEM.
 *
 * pages.test.js mounts every route against an empty reply, which catches a
 * page that throws on a cold cache and nothing else. Everything interesting
 * about these two only exists once a row arrives: the tender breakdown, the
 * struck-through original price, the line that says who cancelled an order.
 * On an empty list none of that markup is ever reached.
 *
 * The facts held here are the ones that are easy to get wrong and silent
 * when wrong:
 *
 *   MONEY AND POINTS ARE NOT FORMATTED THE SAME. Two decimal places on a
 *   points balance says a tenth of a point is a thing somebody can hold.
 *
 *   THE TENDERS ARE NEVER SUMMED. Foreign currency, native currency and
 *   points are three units; one figure covering all three is arithmetic on
 *   inches, litres and Tuesdays.
 *
 *   A CANCELLED ORDER SAYS WHO CANCELLED IT. The service says so only by
 *   which of two fields carries the reason, and collapsing them loses the
 *   one fact the member opened the page for.
 *
 * The rows arrive through the API MOCK rather than by stubbing useList.
 * Replacing the hook meant requiring the page after jest.resetModules(),
 * which loads a second copy of React and fails with "invalid hook call" -
 * a failure about the test harness, not about the page.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';

import theme from './theme';
import { I18nProvider } from './i18n';
import EshopLog from './pages/account/storefront/EshopLog';
import EshopOrders from './pages/account/storefront/EshopOrders';
import { formatAmount } from './pages/account/storefront/eshopTerms';

/* Mutable, and read by the mock below - hence the `mock` prefix jest wants. */
const mockState = { orders: [], log: [], lines: [] };

jest.mock('./api', () => {
  const page = (rows) => Promise.resolve({
    data: { rows: rows, total: rows.length, page: 1, limit: 12, summary: { linked: true } }
  });

  return {
    __esModule: true,
    default: {
      account: {
        eshopOrders: () => page(mockState.orders),
        eshopLog: () => page(mockState.log),
        eshopOrder: () => Promise.resolve({
          data: { order: mockState.orders[0] || null, lines: mockState.lines }
        })
      }
    },
    fileUrl: (p) => p || ''
  };
});

const ORDERS = [
  {
    order_id: 'ES10000001',
    order_no: 'ES-20260901-100',
    status: 'DELIVERING',
    goods_name: 'Crystal C9 Pro 256GB',
    goods_count: 3,
    /* Two tenders on one order, which is the case a total would destroy. */
    tenders: [
      { kind: 'FOREIGN', qty: 2, price: 1099.5 },
      { kind: 'POINT', qty: 1, price: 640 }
    ],
    pay_type: 'Wallet',
    address: {
      line: 'Ryomyong Street 12',
      building: 'Block 4, Flat 902',
      contact: '0191-234-5678',
      receiver: 'Crystal member'
    },
    cancelled_by: null,
    cancel_reason: null,
    at: '2026-09-01 11:00:00'
  },
  {
    order_id: 'ES10000002',
    order_no: 'ES-20260828-101',
    status: 'CANCELLED',
    goods_name: 'Crystal Buds Air',
    goods_count: 1,
    tenders: [{ kind: 'NATIVE', qty: 1, price: 168 }],
    pay_type: 'Card',
    address: { line: null, building: null, contact: null, receiver: null },
    cancelled_by: 'SHOP',
    cancel_reason: 'Out of stock',
    at: '2026-08-28 09:00:00'
  }
];

const LOG = [
  { id: 1, amount: -541.08, kind: 0, fill: 'PAY', remark: 'Order payment', at: '2026-09-01 09:00:00' },
  { id: 2, amount: 413.44, kind: 0, fill: 'REFUND', remark: 'Order refunded', at: '2026-08-30 09:00:00' },
  /* A code this build has never heard of. It must not print as a label. */
  { id: 3, amount: 12, kind: 0, fill: 'SOMETHING_NEW', remark: 'Unrecognised', at: '2026-08-29 09:00:00' }
];

const POINTS = [
  { id: 4, amount: 563, kind: 1, fill: 'AWARD', remark: 'Review bonus', at: '2026-09-01 09:00:00' }
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
    async done() {
      await act(async () => { ReactDOM.unmountComponentAtNode(host); });
      document.body.removeChild(host);
    }
  };
}

afterEach(() => {
  mockState.orders = [];
  mockState.log = [];
  mockState.lines = [];
  document.body.innerHTML = '';
});

test('the columns are in the vendor\'s order, on both tables', async () => {
  /*
   * THE ORDER IS THE REQUIREMENT, not a preference this file happens to
   * hold. Members read these screens in the vendor's console for years; a
   * statement whose columns have moved is one they have to learn again, and
   * nothing about the old arrangement was wrong.
   *
   * It is also the kind of thing that gets quietly rearranged by whoever
   * next adds a column, because nothing anywhere else would complain.
   */
  mockState.orders = ORDERS;
  mockState.log = LOG;

  const orders = await mount(<EshopOrders />);
  expect(Array.prototype.map.call(
    orders.host.querySelectorAll('thead th'), (th) => th.textContent
  )).toEqual([
    'No.', 'Ordered', 'Status', 'Paid with', 'Address',
    'Cancelled by you', 'Cancelled by the shop', ''
  ]);
  await orders.done();

  const log = await mount(<EshopLog view="TRANSACTIONS" />);
  expect(Array.prototype.map.call(
    log.host.querySelectorAll('thead th'), (th) => th.textContent
  )).toEqual(['No.', 'When', 'Amount', 'Type', 'Detail']);
  await log.done();
});

test('money keeps two decimal places and points keep none', () => {
  /*
   * 383.17 experience points is not a quantity that exists, and 1099.5
   * printed as "1099.5" is not a price. One helper decides both, so the log
   * and the orders cannot come to different conclusions about it.
   */
  expect(formatAmount(1099.5, true)).toBe('1099.50');
  expect(formatAmount(640, false)).toBe('640');
  expect(formatAmount(-541.08, true)).toBe('-541.08');
});

test('an order shows every tender it was paid in, and never a total', async () => {
  mockState.orders = ORDERS;

  const ui = await mount(<EshopOrders />);
  const text = ui.text();

  /* Both tenders, each in its own unit. */
  expect(text).toContain('1099.50');
  expect(text).toContain('640');

  /*
   * AND NOT THE SUM. 1099.50 + 640 = 1739.50, which is the figure a "Total"
   * column would print - foreign currency and points added together as
   * though the result were a quantity of anything.
   */
  expect(text).not.toContain('1739.50');

  await ui.done();
});

test('a cancellation reason lands in the column that names who did it', async () => {
  /*
   * THE COLUMN IS THE CLAIM. "Cancelled by you" and "Cancelled by the shop"
   * are separate columns, so a reason in the wrong one is not a formatting
   * slip - it tells a member they cancelled an order the shop cancelled.
   *
   * Asserting on the page text alone cannot see this: "Out of stock" is
   * present either way. So the cells are read positionally.
   */
  mockState.orders = ORDERS;

  const ui = await mount(<EshopOrders />);

  const headers = Array.prototype.map.call(
    ui.host.querySelectorAll('thead th'),
    (th) => th.textContent
  );

  const mine = headers.indexOf('Cancelled by you');
  const theirs = headers.indexOf('Cancelled by the shop');

  expect(mine).toBeGreaterThan(-1);
  expect(theirs).toBeGreaterThan(-1);
  /* The vendor's order: the member's reason, then the shop's. */
  expect(theirs).toBe(mine + 1);

  const rows = Array.prototype.filter.call(
    ui.host.querySelectorAll('tbody tr'),
    (tr) => tr.textContent.indexOf('ES-20260828-101') > -1
  );
  expect(rows.length).toBe(1);

  const cells = rows[0].querySelectorAll('td');
  expect(cells[theirs].textContent).toContain('Out of stock');
  /* And nothing is attributed to the member. */
  expect(cells[mine].textContent).not.toContain('Out of stock');

  await ui.done();
});

test('the log names what moved the balance, and leaves unknown codes blank', async () => {
  mockState.log = LOG;

  const ui = await mount(<EshopLog view="TRANSACTIONS" />);
  const text = ui.text();

  expect(text).toContain('Payment');
  expect(text).toContain('Refund');

  /*
   * The third row's code is not in the set. A page that passed it through
   * would print `SOMETHING_NEW` at a member; the column is left blank.
   */
  expect(text).toContain('Unrecognised');
  expect(text).not.toContain('SOMETHING_NEW');

  await ui.done();
});

test('the points views do not print a balance with decimals', async () => {
  mockState.log = POINTS;

  const ui = await mount(<EshopLog view="EXPERIENCE" />);
  const text = ui.text();

  expect(text).toContain('+563');
  expect(text).not.toContain('563.00');

  await ui.done();
});
