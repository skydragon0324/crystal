/*
 * THE THREE WALLET FORMS: CHARGE, TRANSFER, AND THE PASSWORD.
 *
 * These are the only pages in the member centre that move money, so what is
 * held here is mostly what must NOT happen:
 *
 *   A BAD FORM REACHING THE API. An empty receiver, an amount of nothing, a
 *   fourth decimal place, more than the wallet holds - each is refused under
 *   its field with no request made at all.
 *
 *   A TRANSFER WITHOUT A CONFIRMATION. Continue looks the receiver up; only the
 *   dialog's own button sends, and it sends exactly what was typed.
 *
 *   A BALANCE WORKED OUT BY THE PAGE. After a write the wallet is read again;
 *   the page never adds or subtracts the amount itself.
 *
 * Assertions are on requests and on `aria-invalid`, not on sentences: the
 * words are the catalogue's, and a test that read them would break the day
 * they are translated.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';

import theme from '../theme';
import { I18nProvider } from '../i18n';
import WalletTransfer from '../pages/account/points/WalletTransfer';
import WalletCharge from '../pages/account/points/WalletCharge';
import WalletPassword from '../pages/account/points/WalletPassword';
import { amountProblem } from '../pages/account/points/walletForm';

/* Every wallet call, in order - see the `mock` prefix note in points.test.js. */
// eslint-disable-next-line no-var
var mockCalls = [];
// eslint-disable-next-line no-var
var mockRefuse = {};

jest.mock('../api', () => {
  const record = (name, answer) => (payload) => {
    mockCalls.push({ name, payload });
    if (mockRefuse[name]) {
      const err = new Error('refused');
      err.detail = mockRefuse[name];
      return Promise.reject(err);
    }
    return Promise.resolve({ data: typeof answer === 'function' ? answer(payload) : answer });
  };

  return {
    __esModule: true,
    default: {
      account: {
        appstoreBalance: record('appstoreBalance', { linked: true, coins: 147.48, native_score: 6587.5, foreign_score: 28 }),
        appstoreChargeOptions: record('appstoreChargeOptions', {
          money: [{ key: 'COMPANY', channels: ['SH', 'MM', 'UR', 'SY'] }, { key: 'FOREIGN', channels: ['SH'] }],
          limit: 99999999
        }),
        appstoreWalletReceiver: record('appstoreWalletReceiver', { user_id: 'member1.2', nickname: 'Ming' }),
        appstoreTransfer: record('appstoreTransfer', (payload) => ({
          reference: 'TX1', amount: Number(payload.amount), receiver: { user_id: 'member1.2', nickname: 'Ming' },
          balance: { coins: 147.48, native_score: 6586, foreign_score: 28 }
        })),
        appstoreCharge: record('appstoreCharge', (payload) => ({
          reference: 'TX2', amount: Number(payload.amount),
          balance: { coins: 147.48, native_score: 6589, foreign_score: 28 }
        })),
        appstoreWalletPassword: record('appstoreWalletPassword', { updated: true })
      }
    },
    fileUrl: (p) => p || ''
  };
});

const calls = mockCalls;
const refuse = mockRefuse;

function named(name) {
  return calls.filter((call) => call.name === name);
}

async function mount(Page) {
  const host = document.createElement('div');
  document.body.appendChild(host);

  await act(async () => {
    ReactDOM.render(
      <ChakraProvider theme={theme}>
        <I18nProvider>
          <MemoryRouter>
            <Page />
          </MemoryRouter>
        </I18nProvider>
      </ChakraProvider>,
      host
    );
  });

  const inputs = () => host.querySelectorAll('form input');

  return {
    host,
    inputs,
    async type(index, value) {
      await act(async () => { Simulate.change(inputs()[index], { target: { value } }); });
    },
    async submit() {
      await act(async () => { Simulate.submit(host.querySelector('form')); });
    },
    async click(node) {
      await act(async () => { Simulate.click(node); });
    },
    invalid() {
      return Array.prototype.map.call(inputs(), (input) => input.getAttribute('aria-invalid') === 'true');
    },
    async done() {
      await act(async () => { ReactDOM.unmountComponentAtNode(host); });
    }
  };
}

/** The dialog's own buttons: [cancel, confirm]. It is portalled to the body. */
function dialogButtons() {
  const dialog = document.querySelector('[role="alertdialog"]');
  return dialog ? dialog.querySelectorAll('button') : [];
}

afterEach(() => {
  calls.length = 0;
  Object.keys(refuse).forEach((key) => { delete refuse[key]; });
  document.body.innerHTML = '';
});

/* ------------------------------------------------------------ the amount */

test('an amount is refused, not rounded, and the rules are the API\'s', () => {
  expect(amountProblem('0.4')).toBe(null);
  expect(amountProblem('1 234')).toEqual({ reason: 'AMOUNT_REQUIRED' });
  expect(amountProblem('')).toEqual({ reason: 'AMOUNT_REQUIRED' });
  expect(amountProblem('0')).toEqual({ reason: 'AMOUNT_REQUIRED' });
  expect(amountProblem('1e3')).toEqual({ reason: 'AMOUNT_REQUIRED' });
  expect(amountProblem('12,5')).toEqual({ reason: 'AMOUNT_REQUIRED' });

  /* A fourth decimal place is a different amount; a trailing zero is not. */
  expect(amountProblem('1.0004')).toEqual({ reason: 'AMOUNT_TOO_FINE' });
  expect(amountProblem('1.2340')).toBe(null);

  expect(amountProblem('100000000')).toEqual({ reason: 'AMOUNT_TOO_LARGE', limit: 99999999 });
  expect(amountProblem('6587.6', { available: 6587.5 })).toEqual({ reason: 'OVER_BALANCE', balance: 6587.5 });
  expect(amountProblem('6587.5', { available: 6587.5 })).toBe(null);
});

/* -------------------------------------------------------------- transfer */

test('the transfer page renders its three fields and reads the wallet', async () => {
  const ui = await mount(WalletTransfer);

  expect(ui.inputs().length).toBe(3);
  expect(named('appstoreBalance').length).toBe(1);

  await ui.done();
});

test('a bad transfer is stopped on the page, under its field, with no request', async () => {
  const ui = await mount(WalletTransfer);

  /* Nothing typed at all. */
  await ui.submit();
  expect(ui.invalid()).toEqual([true, true, true]);

  /* A receiver and a password, and an amount the wallet does not hold. */
  await ui.type(0, 'member1.2');
  await ui.type(1, '6588');
  await ui.type(2, 'crystal1234');
  await ui.submit();
  expect(ui.invalid()).toEqual([false, true, false]);

  /* Too fine. */
  await ui.type(1, '1.0004');
  await ui.submit();
  expect(ui.invalid()).toEqual([false, true, false]);

  expect(named('appstoreWalletReceiver')).toEqual([]);
  expect(named('appstoreTransfer')).toEqual([]);

  await ui.done();
});

test('a good transfer looks the receiver up, waits for the confirmation, and sends what was typed', async () => {
  const ui = await mount(WalletTransfer);

  await ui.type(0, ' member1.2 ');
  await ui.type(1, '0.4');
  await ui.type(2, 'crystal1234');
  await ui.submit();

  expect(named('appstoreWalletReceiver').map((call) => call.payload)).toEqual(['member1.2']);
  /* Looked up, not sent: the dialog is open and nothing has moved. */
  expect(named('appstoreTransfer')).toEqual([]);
  expect(dialogButtons().length).toBe(2);

  await ui.click(dialogButtons()[1]);

  expect(named('appstoreTransfer').map((call) => call.payload)).toEqual([
    { receiver: 'member1.2', amount: '0.4', password: 'crystal1234' }
  ]);

  /*
   * The wallet is read again rather than the page doing the arithmetic. This
   * mock wallet answers the same figure every time, so a page that subtracted
   * the 0.4 itself would show 6 587.1 - a balance the wallet never reported.
   */
  expect(named('appstoreBalance').length).toBe(2);
  expect(ui.host.textContent).toContain('6 587.5');
  expect(ui.host.textContent).not.toContain('6 587.1');

  await ui.done();
});

test('a refusal from the API lands under the field it names', async () => {
  refuse.appstoreTransfer = { field: 'password', reason: 'WRONG_PASSWORD' };

  const ui = await mount(WalletTransfer);

  await ui.type(0, 'member1.2');
  await ui.type(1, '5');
  await ui.type(2, 'not-it');
  await ui.submit();
  await ui.click(dialogButtons()[1]);

  expect(named('appstoreTransfer').length).toBe(1);
  expect(ui.invalid()).toEqual([false, false, true]);
  /* And the balance was not re-read: nothing moved. */
  expect(named('appstoreBalance').length).toBe(1);

  await ui.done();
});

test('an unknown receiver is refused under the receiver, before any password is tried', async () => {
  refuse.appstoreWalletReceiver = { field: 'receiver', reason: 'NO_RECEIVER' };

  const ui = await mount(WalletTransfer);

  await ui.type(0, 'nobody');
  await ui.type(1, '5');
  await ui.type(2, 'crystal1234');
  await ui.submit();

  expect(ui.invalid()).toEqual([true, false, false]);
  expect(dialogButtons().length).toBe(0);
  expect(named('appstoreTransfer')).toEqual([]);

  await ui.done();
});

/* ---------------------------------------------------------------- charge */

test('the charge page renders the vendor\'s purses and channels from the API', async () => {
  const ui = await mount(WalletCharge);

  expect(named('appstoreChargeOptions').length).toBe(1);
  /* Two purses, then the company purse's four channels. */
  const choices = ui.host.querySelectorAll('form button[aria-pressed]');
  expect(choices.length).toBe(6);

  await ui.done();
});

test('a charge with no channel or a bad amount is stopped with no request', async () => {
  const ui = await mount(WalletCharge);

  await ui.type(0, '10');
  await ui.submit();
  expect(dialogButtons().length).toBe(0);

  /* Choose MM, then an amount with too many places. */
  const channels = ui.host.querySelectorAll('form button[aria-pressed]');
  await ui.click(channels[3]);
  await ui.type(0, '10.1234');
  await ui.submit();
  expect(ui.invalid()).toEqual([true]);
  expect(dialogButtons().length).toBe(0);

  /* Switching purse forgets the channel, which may not charge the new one. */
  await ui.type(0, '10');
  await ui.click(ui.host.querySelectorAll('form button[aria-pressed]')[1]);
  await ui.submit();
  expect(dialogButtons().length).toBe(0);

  expect(named('appstoreCharge')).toEqual([]);

  await ui.done();
});

test('a good charge is confirmed, then sends the purse, the channel and the amount', async () => {
  const ui = await mount(WalletCharge);

  await ui.click(ui.host.querySelectorAll('form button[aria-pressed]')[3]);
  await ui.type(0, '2.5');
  await ui.submit();

  expect(named('appstoreCharge')).toEqual([]);
  await ui.click(dialogButtons()[1]);

  expect(named('appstoreCharge').map((call) => call.payload)).toEqual([
    { money: 'COMPANY', channel: 'MM', amount: '2.5' }
  ]);
  expect(named('appstoreBalance').length).toBe(2);

  await ui.done();
});

/* -------------------------------------------------------------- password */

test('the password page renders and a mismatch never leaves it', async () => {
  const ui = await mount(WalletPassword);

  expect(ui.inputs().length).toBe(3);

  await ui.type(0, 'crystal1234');
  await ui.type(1, 'abcdef12');
  await ui.type(2, 'abcdef13');
  await ui.submit();
  expect(ui.invalid()).toEqual([false, false, true]);

  await ui.type(1, 'abc');
  await ui.type(2, 'abc');
  await ui.submit();
  expect(ui.invalid()).toEqual([false, true, false]);

  expect(named('appstoreWalletPassword')).toEqual([]);

  await ui.done();
});

test('changing the wallet password sends the current one and the new one, and nothing else', async () => {
  const ui = await mount(WalletPassword);

  await ui.type(0, 'crystal1234');
  await ui.type(1, 'abcdef12');
  await ui.type(2, 'abcdef12');
  await ui.submit();

  expect(named('appstoreWalletPassword').map((call) => call.payload)).toEqual([
    { current: 'crystal1234', next: 'abcdef12' }
  ]);

  await ui.done();
});

test('a wrong current password comes back under the current password', async () => {
  refuse.appstoreWalletPassword = { field: 'current', reason: 'WRONG_PASSWORD' };

  const ui = await mount(WalletPassword);

  await ui.type(0, 'not-it');
  await ui.type(1, 'abcdef12');
  await ui.type(2, 'abcdef12');
  await ui.submit();

  expect(ui.invalid()).toEqual([true, false, false]);

  await ui.done();
});
