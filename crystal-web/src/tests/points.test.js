/*
 * THREE POINTS PAGES, EACH READING ITS OWN LEDGER.
 *
 * There was one page for six ledgers behind `?source=`, and it was fixed once
 * already for not reading the address at all: arriving with a source showed
 * every system, and moving between two menu entries changed the query string
 * and fetched nothing. That fix is still held here, on the page it still
 * applies to.
 *
 * The page was then split, because Crystal's own points and the activity log
 * are not the same kind of ledger as the Appstore's - and a split has its own
 * ways to go wrong, which are what the rest of this file holds still:
 *
 *   A PAGE ASKING FOR ANOTHER PAGE'S LEDGER. Each page names one source on
 *   every request, and the software page never names CRYSTAL or ACTIVITY -
 *   not even once, on the way to redirecting.
 *
 *   AN OLD LINK LANDING NOWHERE. `?source=CRYSTAL` and `?source=ACTIVITY` were
 *   in the menu, on the dashboard and in messages people sent support; they
 *   have to arrive at the page that now shows what they named.
 *
 *   A FIGURE ROUNDED. Points are numeric(14,3). A 0.4 award shown as 0 is a
 *   different movement from the one recorded.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter, Route, Switch, useHistory, useLocation } from 'react-router-dom';

import theme from '../theme';
import { I18nProvider } from '../i18n';
import SoftwarePoints, { SOFTWARE_LEDGERS } from '../pages/account/points/SoftwarePoints';
import CrystalPoints from '../pages/account/points/CrystalPoints';
import ActivityPoints from '../pages/account/points/ActivityPoints';

/*
 * Every set of params /account/points was asked for, in order, and the rows
 * each source answers with.
 *
 * `var`, and names starting with `mock`: jest hoists the factory below above
 * every import in this file, and that prefix is its allow-list for reaching
 * outwards. Nothing reads them until a test runs.
 */
// eslint-disable-next-line no-var
var mockAsked = [];
// eslint-disable-next-line no-var
var mockRows = {};

jest.mock('../api', () => ({
  __esModule: true,
  default: {
    account: {
      pointSystems: () => Promise.resolve({
        data: [
          { key: 'CRYSTAL', label: 'Crystal', balance: 10.4, cap: null, spent: null },
          { key: 'ACTIVITY', label: 'Activity', balance: 704.5, cap: 3000, spent: 12.25 },
          { key: 'SOFTWARE', label: 'Software', balance: -112.125, cap: 5000, spent: null },
          { key: 'APPSTORE', label: 'Appstore', balance: 1234.567, cap: 5000, spent: null },
          { key: 'KARAOKE', label: 'Karaoke', balance: 214, cap: 5000, spent: null },
          { key: 'MEDIA', label: 'Media', balance: 242, cap: 5000, spent: null }
        ]
      }),
      pointSummary: () => Promise.resolve({
        data: [
          { type: 'LOGIN', entry_cnt: '2', earned: '20.000', spent: '0' },
          { type: 'ADJUST', entry_cnt: '18', earned: '3.600', spent: '3.600' }
        ]
      }),
      points: (params) => {
        mockAsked.push(params);
        const rows = mockRows[params.source] || [];
        return Promise.resolve({ data: { rows, total: rows.length, page: 1, limit: params.limit } });
      }
    }
  },
  fileUrl: (p) => p || ''
}));

const asked = mockAsked;

let push = null;
let where = null;

/** The three routes as App.js declares them, and a way to move and look. */
async function mount(at) {
  const host = document.createElement('div');
  document.body.appendChild(host);

  function Probe() {
    push = useHistory().push;
    const location = useLocation();
    where = location.pathname + location.search;
    return null;
  }

  await act(async () => {
    ReactDOM.render(
      <ChakraProvider theme={theme}>
        <I18nProvider>
          <MemoryRouter initialEntries={[at]}>
            <Probe />
            <Switch>
              <Route exact path="/account/points" component={SoftwarePoints} />
              <Route exact path="/account/points/crystal" component={CrystalPoints} />
              <Route exact path="/account/points/activity" component={ActivityPoints} />
            </Switch>
          </MemoryRouter>
        </I18nProvider>
      </ChakraProvider>,
      host
    );
  });

  return {
    host,
    text: () => host.textContent,
    where: () => where,
    async go(to) {
      await act(async () => { push(to); });
    },
    async done() {
      await act(async () => { ReactDOM.unmountComponentAtNode(host); });
      document.body.removeChild(host);
    }
  };
}

/** Every source requested so far, deduplicated, in order. */
function sources() {
  return asked.map((params) => params.source).filter((value, index, all) => all.indexOf(value) === index);
}

afterEach(() => {
  asked.length = 0;
  Object.keys(mockRows).forEach((key) => { delete mockRows[key]; });
  push = null;
  where = null;
  document.body.innerHTML = '';
});

/* ------------------------------------------------------ software points */

test('the software page is the four software ledgers, in the menu\'s order', () => {
  expect(SOFTWARE_LEDGERS.map((ledger) => ledger.source)).toEqual(['APPSTORE', 'KARAOKE', 'MEDIA', 'SOFTWARE']);
});

test('the source in the address is on the first request', async () => {
  /*
   * The FIRST one, not a correction afterwards - seeding empty and fixing it
   * in an effect would fetch the wrong ledger and throw it away.
   */
  const ui = await mount('/account/points?source=KARAOKE');

  expect(asked.length).toBe(1);
  expect(asked[0].source).toBe('KARAOKE');

  await ui.done();
});

test('moving between two of the four refetches, and asks for nothing else', async () => {
  /*
   * THE ORIGINAL BUG. Both entries are this route and React Router does not
   * remount for a query-string change, so without the address being read the
   * second choice made no request at all.
   */
  const ui = await mount('/account/points?source=APPSTORE');
  expect(asked.length).toBe(1);

  await ui.go('/account/points?source=MEDIA');

  expect(asked.length).toBe(2);
  expect(asked[1].source).toBe('MEDIA');
  expect(sources()).toEqual(['APPSTORE', 'MEDIA']);

  await ui.done();
});

test('no source, or one that is not a software ledger, opens the first of the four', async () => {
  /*
   * There is no "all four" view: the API's unfiltered ledger is all SIX, and
   * Crystal's rows on this page are what the split undid. So the bare address
   * and a mistyped one both land on the first ledger - and never ask for all.
   */
  const bare = await mount('/account/points');

  expect(bare.where()).toBe('/account/points?source=APPSTORE');
  expect(sources()).toEqual(['APPSTORE']);
  await bare.done();

  asked.length = 0;

  const wrong = await mount('/account/points?source=ESHOP');
  expect(wrong.where()).toBe('/account/points?source=APPSTORE');
  expect(asked.every((params) => params.source === 'APPSTORE')).toBe(true);
  await wrong.done();
});

test('the software page refuses CRYSTAL and ACTIVITY, and the old links land on the new pages', async () => {
  /*
   * NOT ONE REQUEST FOR EITHER from the software page - the redirect happens
   * before its list exists - and then exactly the request the new page makes.
   * Lower case too: `source` was upper-cased by the API, so links were written
   * both ways.
   */
  const crystal = await mount('/account/points?source=CRYSTAL');

  expect(crystal.where()).toBe('/account/points/crystal');
  expect(sources()).toEqual(['CRYSTAL']);
  await crystal.done();

  asked.length = 0;

  const activity = await mount('/account/points?source=activity');

  expect(activity.where()).toBe('/account/points/activity');
  expect(sources()).toEqual(['ACTIVITY']);
  await activity.done();
});

test('a software row keeps its fractions, and so do the four balances', async () => {
  mockRows.APPSTORE = [
    { id: 1, source: 'APPSTORE', at: '2026-09-15T23:32:52.889Z', amount: 0.4, charged: 189.125, reason: 'Licence issued', reference: 'APP-705559', status: 'CHARGE', by_agency: false },
    { id: 2, source: 'APPSTORE', at: '2026-09-12T23:32:52.889Z', amount: -14.1, charged: 0, reason: 'Manual deduction', reference: 'APP-224442', status: 'MINUS', by_agency: false }
  ];

  const ui = await mount('/account/points?source=APPSTORE');
  const text = ui.text();

  expect(text).toContain('+0.4');
  expect(text).toContain('189.125');
  expect(text).toContain('-14.1');
  /* The card: grouped with a space, three decimals kept. */
  expect(text).toContain('1 234.567');
  expect(text).toContain('-112.125');

  await ui.done();
});

/* ------------------------------------------------------- crystal points */

test('the Crystal page asks for Crystal\'s own ledger and nothing else', async () => {
  const ui = await mount('/account/points/crystal');

  expect(asked.length).toBe(1);
  expect(sources()).toEqual(['CRYSTAL']);
  /* No category: that word belongs to the activity log. */
  expect(asked[0].category).toBe(undefined);

  await ui.done();
});

test('Crystal\'s balance, its movements and the balance after each are exact', async () => {
  mockRows.CRYSTAL = [
    { id: 209, source: 'CRYSTAL', type: 'ADJUST', at: '2026-09-17T05:27:12.298Z', amount: -0.4, reason: 'check script fraction reversal', reference: null, balance_after: 520 },
    { id: 208, source: 'CRYSTAL', type: 'ADJUST', at: '2026-09-17T05:27:12.287Z', amount: 0.4, reason: 'check script fraction', reference: null, balance_after: 520.4 }
  ];

  const ui = await mount('/account/points/crystal');
  const text = ui.text();

  expect(text).toContain('10.4');
  expect(text).toContain('+0.4');
  expect(text).toContain('-0.4');
  expect(text).toContain('520.4');
  /* The summary keeps earned and spent apart, to the decimal. */
  expect(text).toContain('+3.6');
  expect(text).toContain('-3.6');

  await ui.done();
});

/* ------------------------------------------------------ activity points */

test('the activity page asks for the activity log and nothing else', async () => {
  const ui = await mount('/account/points/activity');

  expect(asked.length).toBe(1);
  expect(sources()).toEqual(['ACTIVITY']);
  expect(asked[0].type).toBe(undefined);

  await ui.done();
});

test('an activity award keeps its fraction, and its article comes before its reason', async () => {
  mockRows.ACTIVITY = [
    { id: 1, source: 'ACTIVITY', at: '2026-09-15T23:32:52.950Z', amount: 0.5, reason: 'Blog · Posted a topic', article_title: 'How the C9 camera was tuned', category: 'BLOG' },
    { id: 2, source: 'ACTIVITY', at: '2026-09-13T23:32:52.950Z', amount: 184, reason: 'Survey completed', article_title: null, category: 'OTHER' }
  ];

  const ui = await mount('/account/points/activity');
  const text = ui.text();

  expect(text).toContain('+0.5');
  expect(text).toContain('704.5');
  expect(text).toContain('12.25');
  expect(text.indexOf('How the C9 camera was tuned')).toBeGreaterThan(-1);
  expect(text.indexOf('How the C9 camera was tuned')).toBeLessThan(text.indexOf('Blog · Posted a topic'));

  await ui.done();
});

test('leaving the software page for Crystal\'s does not carry its source along', async () => {
  const ui = await mount('/account/points?source=KARAOKE');
  await ui.go('/account/points/crystal');
  await ui.go('/account/points/activity');

  expect(sources()).toEqual(['KARAOKE', 'CRYSTAL', 'ACTIVITY']);

  await ui.done();
});
