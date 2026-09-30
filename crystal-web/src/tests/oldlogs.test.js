/*
 * THE THREE "OLD LOG" PAGES, with data in them.
 *
 * pages.test.js mounts every route against an empty reply and reaches none of
 * this. What is held here:
 *
 *   THE CARRY-FORWARD ROW SAYS SO. The last line of the media log is not a
 *   licence - it is the balance brought in from before the service kept a
 *   log. It has no equipment against it, and unmarked that reads as data
 *   that failed to load rather than as the one row that is different.
 *
 *   POINTS ARE COUNTED, NOT MEASURED. The media carry-forward figure is a
 *   division by fifteen upstream and arrives fractional; a page that printed
 *   it raw would tell a member they hold two thirds of a point.
 *
 *   THE COLUMN ORDER IS THE VENDOR'S, and karaoke has no reason column
 *   because the old system recorded none.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';

import theme from '../theme';
import { I18nProvider } from '../i18n';
import {
  ActivityOldLog,
  KaraokeOldLog,
  MediaOldLog
} from '../pages/account/storefront/OldLogs';

const mockState = { activity: [], karaoke: [], media: [] };

jest.mock('../api', () => {
  const page = (rows) => Promise.resolve({
    data: { rows: rows, total: rows.length, page: 1, limit: 15, summary: { linked: true } }
  });

  return {
    __esModule: true,
    default: {
      account: {
        activityOldLog: () => page(mockState.activity),
        karaokeOldLog: () => page(mockState.karaoke),
        mediaOldLog: () => page(mockState.media)
      }
    },
    fileUrl: (p) => p || ''
  };
});

const ACTIVITY = [
  { points: 250, reason: 'Spring campaign prize', at: '2026-09-05 00:01:00' },
  { points: 75, reason: null, at: '2026-08-25 00:01:00' }
];

const KARAOKE = [
  {
    equipment: 'MK-100000-500000', reason: null,
    paid: 40, awarded: 4, at: '2026-09-03 09:00:00', carried_forward: false
  },
  {
    equipment: 'MK-100001-500001', reason: null,
    paid: 53, awarded: 5, at: '2026-08-22 09:00:00', carried_forward: false
  }
];

const MEDIA = [
  {
    equipment: 'DEV-200000000', reason: 'MRS',
    paid: 25, awarded: 2, at: '2026-09-01 11:00:00', carried_forward: false
  },
  {
    /* Not a licence: the balance brought in from before the log existed.
       `awarded` arrives as a division by fifteen and is fractional. */
    equipment: null, reason: 'Balance carried over',
    paid: 120, awarded: 30.666666666666668, at: '2026-05-11 07:01:00', carried_forward: true
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
  mockState.activity = [];
  mockState.karaoke = [];
  mockState.media = [];
  document.body.innerHTML = '';
});

test('the columns are the vendor\'s, and karaoke has no reason column', async () => {
  mockState.activity = ACTIVITY;
  mockState.karaoke = KARAOKE;
  mockState.media = MEDIA;

  const activity = await mount(<ActivityOldLog />);
  expect(activity.headers()).toEqual(['No.', 'Activity points', 'Reason', 'When']);
  await activity.done();

  const karaoke = await mount(<KaraokeOldLog />);
  expect(karaoke.headers()).toEqual([
    'No.', 'Equipment', 'Points paid', 'Points awarded', 'When'
  ]);
  await karaoke.done();

  /* Media has one column karaoke does not: the broadcaster. */
  const media = await mount(<MediaOldLog />);
  expect(media.headers()).toEqual([
    'No.', 'Equipment', 'Points paid', 'Points awarded', 'Provider', 'When'
  ]);
  await media.done();
});

test('the row that is not a licence says so, and sits last', async () => {
  mockState.media = MEDIA;

  const ui = await mount(<MediaOldLog />);

  const rows = ui.host.querySelectorAll('tbody tr');
  expect(rows.length).toBe(2);

  /* Marked... */
  expect(rows[1].textContent).toContain('Brought forward');
  /* ...and only that one. */
  expect(rows[0].textContent).not.toContain('Brought forward');

  /* It has no equipment, which is why it needs the mark. */
  const headers = ui.headers();
  const equipmentAt = headers.indexOf('Equipment');
  expect(rows[1].querySelectorAll('td')[equipmentAt].textContent).toBe('—');

  await ui.done();
});

test('points keep their fraction, and stop at the ledger\'s own scale', async () => {
  /*
   * THIS USED TO ASSERT THE OPPOSITE, and the opposite was wrong.
   *
   * The page ran every figure through `Math.round` on the grounds that points
   * are counted rather than measured. They are not: the ledger column holds
   * three decimal places, the old systems recorded fractions, and rounding
   * here showed an award of 0.4 as 0 - a closed record rendered as a number
   * it does not hold, on the only page it appears on.
   *
   * The carry-forward figure is `score / 15` upstream and lands as
   * 30.666666666666668. Sixteen digits is not the answer either, so
   * utils/format's `number` is: at most three decimals - the scale the column
   * itself has - with trailing zeros trimmed and thousands spaced.
   */
  mockState.media = MEDIA;

  const ui = await mount(<MediaOldLog />);
  const text = ui.text();

  expect(text).toContain('+30.667');
  /* Neither rounded away to a whole number, nor printed to sixteen digits. */
  expect(text).not.toContain('+31');
  expect(text).not.toContain('30.666666');

  await ui.done();
});

test('a prize with no note still explains itself', async () => {
  mockState.activity = ACTIVITY;

  const ui = await mount(<ActivityOldLog />);
  const text = ui.text();

  expect(text).toContain('Spring campaign prize');
  /* The old system did not always write one; the cell is not left blank. */
  expect(text).toContain('Adjustment');

  await ui.done();
});
