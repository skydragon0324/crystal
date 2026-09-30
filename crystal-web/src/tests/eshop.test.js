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

import theme from '../theme';
import { I18nProvider } from '../i18n';
import EshopLog from '../pages/account/storefront/EshopLog';
import EshopOrders from '../pages/account/storefront/EshopOrders';
import { formatAmount, tenderOf } from '../pages/account/storefront/eshopTerms';
import { MONEY_COLOR, POINT_COLOR } from '../theme/tokens';

/* Mutable, and read by the mock below - hence the `mock` prefix jest wants. */
const mockState = { orders: [], log: [], lines: [], asked: [] };

jest.mock('../api', () => {
  const page = (rows) => Promise.resolve({
    data: { rows: rows, total: rows.length, page: 1, limit: 12, summary: { linked: true } }
  });

  return {
    __esModule: true,
    default: {
      account: {
        eshopOrders: () => page(mockState.orders),
        /* The params are kept so a test can see WHAT was asked for, which is
           the only way to catch a list that never re-asks - see below. */
        eshopLog: (params) => {
          mockState.asked.push(params);
          return page(mockState.log);
        },
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

/*
 * `kind` IS THE MONEY TYPE, and the numbers are the vendor's: 0 experience,
 * 3 the wallet, 4 the bonus purse (ESHOP_MONEY_TYPES). The wallet screen
 * genuinely mixes 3 and 4, which is the whole reason it carries the column.
 */
const LOG = [
  { id: 1, amount: -541.08, kind: 3, fill: 'PAY', remark: 'Order payment', at: '2026-09-01 09:00:00' },
  { id: 2, amount: 413.44, kind: 4, fill: 'BONUS', remark: 'Wallet topped up', at: '2026-08-30 09:00:00' },
  /* A code this build has never heard of. It must not print as a label. */
  { id: 3, amount: 12, kind: 3, fill: 'SOMETHING_NEW', remark: 'Unrecognised', at: '2026-08-29 09:00:00' }
];

const POINTS = [
  { id: 4, amount: 563, kind: 1, fill: 'BONUS', remark: 'Review bonus', at: '2026-09-01 09:00:00' }
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
  mockState.asked = [];
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
  )).toEqual(['No.', 'When', 'Amount', 'Money type', 'Type', 'Detail']);
  await log.done();

  /*
   * AND THE MONEY TYPE IS ON THE WALLET SCREEN ONLY, which is the vendor's
   * arrangement: the wallet holds more than one purse, so the column tells
   * two rows apart; experience and commerce value are each a single balance,
   * where it would be the same word two hundred times. The vendor commented
   * it out on both, and a column that reappears there is a regression nothing
   * else would notice.
   */
  const experience = await mount(<EshopLog view="EXPERIENCE" />);
  expect(Array.prototype.map.call(
    experience.host.querySelectorAll('thead th'), (th) => th.textContent
  )).toEqual(['No.', 'When', 'Points', 'Type', 'Detail']);
  await experience.done();
});

test('money and points are written the same way as every other figure', () => {
  /*
   * 383.17 experience points is not a quantity that exists. One helper
   * decides both units, so the log and the orders cannot come to different
   * conclusions about the same figure.
   *
   * THE SHAPE CHANGED, and the reason it changed is worth writing down: this
   * used to assert "1099.50", because formatPrice forced two decimals and a
   * comma for thousands. The site now has ONE number format - space-grouped,
   * at most three decimals, trailing zeros trimmed (utils/format) - and this
   * helper goes through it like everything else. A price is 1 099.5 here and
   * on the product page and in the wallet, which is what the rule was for.
   */
  expect(formatAmount(1099.5, true)).toBe('1 099.5');
  expect(formatAmount(640, false)).toBe('640');
  expect(formatAmount(-541.08, true)).toBe('-541.08');
});

test('an order shows every tender it was paid in, and never a total', async () => {
  mockState.orders = ORDERS;

  const ui = await mount(<EshopOrders />);
  const text = ui.text();

  /* Both tenders, each in its own unit. */
  expect(text).toContain('1 099.5');
  expect(text).toContain('640');

  /*
   * AND NOT THE SUM. 1099.5 + 640 = 1739.5, which is the figure a "Total"
   * column would print - foreign currency and points added together as
   * though the result were a quantity of anything.
   */
  expect(text).not.toContain('1 739.5');

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

  /*
   * `bonus` READS AS "CHARGE", AND THE WIRE CODE DID NOT MOVE.
   *
   * The row still arrives as `fill: 'BONUS'` - that is the service's word and
   * nothing here sends or expects anything else. What changed is the word a
   * member reads: the vendor's own English is "Bonus", which describes a gift
   * rather than what the row actually is, which is money going into the
   * wallet. Both stores now call that a charge.
   *
   * Read out of THE FILL CELL rather than off the whole page: "Bonus" is
   * also the name of one of the purses in the money-type column of the very
   * same row, so a page-wide assertion would be answered by the wrong
   * column and hold nothing.
   */
  const at = Array.prototype.map.call(
    ui.host.querySelectorAll('thead th'), (th) => th.textContent
  ).indexOf('Type');

  const charged = ui.host.querySelectorAll('tbody tr')[1].querySelectorAll('td')[at];
  expect(charged.textContent).toBe('Charge');

  /*
   * The third row's code is not in the set. A page that passed it through
   * would print `SOMETHING_NEW` at a member; the column is left blank.
   */
  expect(text).toContain('Unrecognised');
  expect(text).not.toContain('SOMETHING_NEW');

  await ui.done();
});

test('the fill type is a tag, and the money type names which purse moved', async () => {
  /*
   * TWO COLUMNS, TWO QUESTIONS. `money_type` is WHICH balance moved and
   * `fill_type` is WHAT moved it, and the vendor's wallet screen gave them a
   * column each because "-541.08 off the wallet" and "-541.08 paid for an
   * order" are not the same statement.
   *
   * The fill is a TAG rather than a line of text: it is the one field on the
   * row out of a closed set, and the tag is what says so next to the shop's
   * prose in the column beside it.
   */
  mockState.log = LOG;

  const ui = await mount(<EshopLog view="TRANSACTIONS" />);

  const headers = Array.prototype.map.call(
    ui.host.querySelectorAll('thead th'), (th) => th.textContent
  );
  const moneyAt = headers.indexOf('Money type');
  const fillAt = headers.indexOf('Type');
  expect(moneyAt).toBeGreaterThan(-1);
  /* The vendor's order: which balance, then what moved it. */
  expect(fillAt).toBe(moneyAt + 1);

  const rows = ui.host.querySelectorAll('tbody tr');
  const paid = rows[0].querySelectorAll('td');
  expect(paid[moneyAt].textContent).toBe('Wallet');

  /*
   * A TAG IS A <span>, A LINE OF TEXT IS A <p>, and that is what is asserted
   * here: Chakra's Tag carries no stable class name of its own, so the
   * element it renders is the only thing about it a test can hold on to. It
   * is enough for the distinction that matters - a tag or not a tag.
   */
  expect(paid[fillAt].firstElementChild.tagName).toBe('SPAN');

  /* A row off a different purse says so rather than repeating the first. */
  expect(rows[1].querySelectorAll('td')[moneyAt].textContent).toBe('Bonus');

  /* And an unrecognised fill gets no tag at all, rather than an empty one. */
  const unknown = rows[2].querySelectorAll('td')[fillAt];
  expect(unknown.firstElementChild.tagName).toBe('P');
  expect(unknown.textContent).toBe('—');

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

test('switching between the three log views asks the server for the new one', async () => {
  /*
   * THE BUG THIS TEST EXISTS TO KEEP FIXED, and it was invisible from inside
   * the page: transactions, experience and commerce value are three routes
   * rendering ONE component with a different `view` prop, and React Router's
   * <Switch> hands React the same element type in the same slot each time.
   * React reconciles rather than remounting, so the component's state -
   * including the params useList fetches from - survived the navigation, and
   * `initialParams` is by definition only read once.
   *
   * The screen therefore showed the previous view's rows under the new
   * view's headings and made NO REQUEST AT ALL, which is why the network
   * panel had nothing in it to explain what was on the page.
   *
   * So the assertion is on what was ASKED FOR, not on what was rendered.
   * Rendering the right rows is something a stale list can do by accident;
   * asking for them is not. Re-rendering into the same host with the same
   * component is exactly what Switch does to it.
   */
  mockState.log = LOG;

  const host = document.createElement('div');
  document.body.appendChild(host);

  const draw = async (view) => {
    await act(async () => {
      ReactDOM.render(
        <ChakraProvider theme={theme}>
          <I18nProvider>
            <MemoryRouter><EshopLog view={view} /></MemoryRouter>
          </I18nProvider>
        </ChakraProvider>,
        host
      );
    });
  };

  await draw('TRANSACTIONS');
  /* ONE request on load, not two - the view is already in the first params,
     so the effect that pushes it back must find nothing to do. */
  expect(mockState.asked.length).toBe(1);
  expect(mockState.asked[0].view).toBe('TRANSACTIONS');

  await draw('EXPERIENCE');
  expect(mockState.asked.length).toBe(2);
  expect(mockState.asked[1].view).toBe('EXPERIENCE');

  await draw('COMMERCE');
  expect(mockState.asked.length).toBe(3);
  expect(mockState.asked[2].view).toBe('COMMERCE');

  /* And it settles: a view that has not changed asks nothing again. */
  await draw('COMMERCE');
  expect(mockState.asked.length).toBe(3);

  await act(async () => { ReactDOM.unmountComponentAtNode(host); });
  document.body.removeChild(host);
});

test('an order status is a word out of the catalogue, not the code lower-cased', async () => {
  /*
   * A STATUS IS A CODE, SO IT TRANSLATES. `status` is one of ten names the
   * API decodes the service's numeric codes into, and the badge was printing
   * the code itself with its underscores swapped for spaces - which puts
   * "delivering" in front of a reader who has chosen Russian.
   *
   * Read positionally, because "Cancelled" also appears in two column
   * HEADINGS on this table and a page-wide assertion would be satisfied by
   * either of them.
   */
  mockState.orders = ORDERS;

  const ui = await mount(<EshopOrders />);

  const headers = Array.prototype.map.call(
    ui.host.querySelectorAll('thead th'), (th) => th.textContent
  );
  const at = headers.indexOf('Status');
  expect(at).toBeGreaterThan(-1);

  const cells = Array.prototype.map.call(
    ui.host.querySelectorAll('tbody tr'),
    (tr) => tr.querySelectorAll('td')[at].textContent
  );

  expect(cells).toEqual(['Delivering', 'Cancelled']);
});

test('the paid column counts the goods and colours the amount by its tender', async () => {
  /*
   * "2 goods (1 099.5)", not "1099.50 Foreign currency · 2".
   *
   * THE SENTENCE IS TRANSLATED WHOLE, both halves of the plural, rather than
   * built here out of a number and a noun - English puts the count first and
   * pluralises the noun and Russian does neither, so a layout that
   * concatenates can only be right in the language it was written in. That is
   * why the singular and the plural are two catalogue entries and not an
   * `if` in the JSX.
   */
  mockState.orders = ORDERS;

  const ui = await mount(<EshopOrders />);

  const headers = Array.prototype.map.call(
    ui.host.querySelectorAll('thead th'), (th) => th.textContent
  );
  const at = headers.indexOf('Paid with');

  const rows = ui.host.querySelectorAll('tbody tr');
  const first = rows[0].querySelectorAll('td')[at].textContent;

  /* Two tenders on one order, each with its own count and its own figure. */
  expect(first).toContain('2 goods');
  expect(first).toContain('(1 099.5)');
  expect(first).toContain('1 good');
  expect(first).toContain('(640)');

  /* One item, so the singular - and not "1 goods". */
  const second = rows[1].querySelectorAll('td')[at].textContent;
  expect(second).toContain('1 good');
  expect(second).not.toContain('1 goods');

  await ui.done();
});

test('the colour of an amount says which tender it is in', async () => {
  /*
   * FOREIGN CURRENCY RED, NATIVE CURRENCY BLUE - the site's rule, the same
   * one the Appstore draws its foreign and native point balances with. It is
   * asserted on the table rather than on a rendered pixel because a colour
   * that has been resolved to a class name tells a test nothing: what is
   * worth holding is that the three tenders do not all agree.
   *
   * Points are blue AS WELL, which is why they keep their word beside the
   * figure: two colours cannot name three units, and blue alone would claim
   * a point balance was money.
   */
  expect(tenderOf('FOREIGN').colour).toBe(MONEY_COLOR);
  expect(tenderOf('NATIVE').colour).toBe(POINT_COLOR);
  expect(tenderOf('FOREIGN').colour).not.toBe(tenderOf('NATIVE').colour);

  expect(tenderOf('POINT').money).toBe(false);
  expect(tenderOf('FOREIGN').money).toBe(true);
});
