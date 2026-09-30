/*
 * THE WALLET LEDGER, OPENED.
 *
 * screens.test.js mounts every screen with its dialogs shut, which is the
 * cheap half of the question. This one opens the thing that carries the
 * actual work: a modal that loads two ledgers, switches between them, and
 * offers the only write on the page.
 *
 * It is worth its own file because everything interesting here happens after
 * a click - effects firing, three requests landing, tabs swapping - and none
 * of that runs when a screen is rendered and thrown away.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ChakraProvider } from '@chakra-ui/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';

import theme from '../theme';
import { I18nProvider } from '../i18n';
import { ConfirmProvider } from '../components/ConfirmDialog';
import Wallets from '../pages/members/Wallets';

const { adjusted } = require('../walletScreen.fixtures');

jest.mock('../api', () => ({
  __esModule: true,
  wallets: {
    list: () => Promise.resolve({
      data: { rows: [require('../walletScreen.fixtures').WALLET], total: 1, page: 1, limit: 20 }
    }),
    detail: () => Promise.resolve({ data: require('../walletScreen.fixtures').WALLET }),
    transactions: () => Promise.resolve({
      data: { rows: [require('../walletScreen.fixtures').MOVEMENT], total: 1, page: 1, limit: 100 }
    }),
    points: () => Promise.resolve({
      data: { rows: [require('../walletScreen.fixtures').POINT], total: 1, page: 1, limit: 100 }
    }),
    pointSummary: () => Promise.resolve({ data: [] }),
    adjust: (userId, body) => {
      require('../walletScreen.fixtures').adjusted.push({ userId, body });
      return Promise.resolve({ data: { id: 2, type: 'COMPENSATION' } });
    }
  },
  media: { upload: () => Promise.resolve({ data: {} }) },
  search: { query: () => Promise.resolve({ data: { groups: [] } }) },
  notifications: { summary: () => Promise.resolve({ data: { total: 0, groups: [] } }) }
}));

const store = {
  getState: () => ({
    auth: {
      admin: { id: 1, name: 'Ada', username: 'admin', role_id: 1 },
      pages: [{ page_url: '/admin/members/wallets', permission: 3 }],
      status: 'signedIn'
    }
  }),
  subscribe: () => () => {},
  dispatch: () => {}
};

let host = null;

async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);

  await act(async () => {
    ReactDOM.render(
      <ChakraProvider theme={theme}>
        <I18nProvider>
          <Provider store={store}>
            <MemoryRouter initialEntries={['/admin/members/wallets']}>
              <ConfirmProvider><Wallets /></ConfirmProvider>
            </MemoryRouter>
          </Provider>
        </I18nProvider>
      </ChakraProvider>,
      host
    );
  });
}

afterEach(() => {
  if (!host) return;
  act(() => { ReactDOM.unmountComponentAtNode(host); });
  document.body.removeChild(host);
  host = null;
  adjusted.length = 0;
});

test('the list shows a member, their balance and their points', async () => {
  await mount();
  const text = document.body.textContent;

  expect(text).toContain('demo-member');
  /*
   * '120.5', not '120.50': money trims its trailing zeros now - see the note
   * on MAX_DECIMALS in utils/format.js for why that is deliberate, including
   * for currency.
   */
  expect(text).toContain('120.5 USD');
  expect(text).toContain('340');
});

test('opening a row loads both ledgers', async () => {
  await mount();

  /* The row, found by the member it names rather than by position. */
  const row = [...document.querySelectorAll('tr')]
    .filter((tr) => tr.textContent.indexOf('demo-member') !== -1)[0];

  expect(row).toBeTruthy();

  await act(async () => {
    row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });

  /* The money ledger is the tab that opens first. */
  expect(document.body.textContent).toContain('Card top-up');

  /*
   * The points panel is lazy, so it is not in the DOM until it is asked for -
   * its DATA was fetched when the modal opened, which is what keeps the
   * switch instant, but the rows only render on the click.
   */
  const pointsTab = [...document.querySelectorAll('[role="tab"]')]
    .filter((tab) => /points/i.test(tab.textContent))[0];

  expect(pointsTab).toBeTruthy();

  await act(async () => {
    pointsTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  expect(document.body.textContent).toContain('Daily sign-in reward');
});

test('an adjustment cannot be recorded without a reason', async () => {
  await mount();

  const row = [...document.querySelectorAll('tr')]
    .filter((tr) => tr.textContent.indexOf('demo-member') !== -1)[0];

  await act(async () => {
    row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });

  const adjust = [...document.querySelectorAll('button')]
    .filter((b) => /adjust balance/i.test(b.textContent))[0];

  expect(adjust).toBeTruthy();

  await act(async () => {
    adjust.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  /*
   * THE BUTTON IS DISABLED, not merely refused on submit. The server checks
   * too - that is the check that matters - but a form that lets somebody
   * type an amount, press the button and be told no has wasted the trip.
   */
  const record = [...document.querySelectorAll('button')]
    .filter((b) => /^record$/i.test(b.textContent.trim()))[0];

  expect(record).toBeTruthy();
  expect(record.disabled).toBe(true);
  expect(adjusted.length).toBe(0);
});
