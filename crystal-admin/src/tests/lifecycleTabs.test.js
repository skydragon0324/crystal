/*
 * EVERY TAB OF THE LIFECYCLE SCREEN, OPENED.
 *
 * screens.test.js mounts this page, and that is not enough: the page is a
 * `<Tabs isLazy>`, so mounting it renders the FIRST panel and nothing else.
 * Three of its four surfaces - the transition explorer, the event comparison
 * and job health - are never executed by that test at all, which is exactly
 * where a column renderer reading a property off undefined would sit
 * unnoticed.
 *
 * So this clicks each tab in turn, with payloads in the shape the real API
 * returns, and fails on anything thrown while a panel draws.
 *
 * THE PAYLOADS ARE THE REAL ONES, trimmed. They were taken from the running
 * API rather than written from the component's point of view - a fixture
 * invented to match the code cannot catch the code misreading the server,
 * which is the mistake this file exists to find.
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

const PAGE = '/admin/crm/lifecycle';

const OVERVIEW = {
  asOf: '2026-10-15',
  reportTimezone: 'Asia/Shanghai',
  metricType: 'STOCK_END_OF_DAY',
  computedFrom: 'SNAPSHOT',
  counts: { NEW: 904, ACTIVE: 8155, DORMANT: 4639, CHURNED: 16853, TOTAL: 30551 },
  sharePercent: { NEW: 3, ACTIVE: 26.7, DORMANT: 15.2, CHURNED: 55.2 },
  registeredThatDay: 0,
  rule: { version: 1, newDays: 30, dormantDays: 30, churnedDays: 90, basis: 'LOGIN_BASED' },
  freshness: {
    lastSynchronizedAt: '2026-10-14T22:40:00.199Z',
    lastReconciledAt: '2026-10-14T15:19:17.509Z',
    isStale: false,
    snapshotIsFinal: false
  }
};

const TREND = {
  reportTimezone: 'Asia/Shanghai',
  metricType: 'STOCK_END_OF_BUCKET',
  groupBy: 'DAY',
  intervalDays: null,
  from: '2026-10-08',
  to: '2026-10-09',
  buckets: [
    {
      periodStart: '2026-10-08', periodEnd: '2026-10-08', snapshotDate: '2026-10-08',
      new: 970, active: 8136, dormant: 4721, churned: 16586, total: 30413,
      registeredInBucket: 24, isFinal: false
    },
    /* A bucket with no snapshot: every count is null, and the table has to
       draw it rather than throw. A range that reaches past the last snapshot
       run is the ordinary case, not a broken one. */
    {
      periodStart: '2026-10-09', periodEnd: '2026-10-09', snapshotDate: '2026-10-09',
      new: null, active: null, dormant: null, churned: null, total: null,
      registeredInBucket: 0, isFinal: null
    }
  ],
  lastSynchronizedAt: '2026-10-14T22:40:00.199Z',
  note: 'Stock counts are the state at the end of each bucket.'
};

const DEFINITIONS = {
  basis: 'LOGIN_BASED',
  ruleVersion: 1,
  reportTimezone: 'Asia/Shanghai',
  sourceTimezone: 'Asia/Shanghai',
  thresholds: { newDays: 30, dormantDays: 30, churnedDays: 90, measuredAs: 'ELAPSED_HOURS' },
  statuses: ['NEW', 'ACTIVE', 'DORMANT', 'CHURNED'],
  notes: ['NEW takes precedence.', 'A customer who has never logged in is measured from registration.']
};

const SUMMARY = {
  reportTimezone: 'Asia/Shanghai',
  metricType: 'TRANSITION_FLOW',
  from: '2026-07-16',
  to: '2026-10-14',
  window: '[from, to)',
  matrix: [
    { fromStatus: 'ACTIVE', toStatus: 'DORMANT', events: 10748, uniqueCustomers: 9820 },
    { fromStatus: 'DORMANT', toStatus: 'CHURNED', events: 7431, uniqueCustomers: 7431 },
    { fromStatus: 'DORMANT', toStatus: 'ACTIVE', events: 2180, uniqueCustomers: 1994 }
  ],
  events: 20359,
  uniqueCustomers: 18020,
  buckets: [{ periodStart: '2026-07-16', periodEnd: '2026-07-16', events: 42, flows: { 'ACTIVE->DORMANT': 42 } }]
};

/** One transition row, exactly as the API sends it - nulls included. */
const TRANSITIONS = {
  rows: [
    {
      userPk: 10082940,
      userId: 'mock-005809',
      userName: 'Mock Customer 5809',
      birthday: '2003-01-03',
      displayPhone: null,
      jobCode: 4,
      locationPk: '6',
      oracleAccountStatus: 1,
      transitionedAt: '2026-10-14T15:48:01.684Z',
      fromStatus: 'ACTIVE',
      toStatus: 'DORMANT',
      reason: 'INACTIVITY_30',
      statusAsOfEvent: 'DORMANT',
      currentStatus: 'DORMANT',
      lastLoginAt: '2026-09-14T15:48:01.684Z'
    },
    /* The never-logged-in customer, whose row is mostly nulls. */
    {
      userPk: 10082941,
      userId: 'mock-005810',
      userName: null,
      birthday: null,
      displayPhone: null,
      jobCode: null,
      locationPk: null,
      oracleAccountStatus: null,
      transitionedAt: '2026-10-14T15:48:01.684Z',
      fromStatus: 'NEW',
      toStatus: 'DORMANT',
      reason: 'NEW_WINDOW_ENDED',
      statusAsOfEvent: 'DORMANT',
      currentStatus: 'CHURNED',
      lastLoginAt: null
    }
  ],
  total: 2,
  page: 1,
  limit: 25,
  summary: { metricType: 'TRANSITION_FLOW', reportTimezone: 'Asia/Shanghai', note: 'x' }
};

const HEALTH = {
  reportTimezone: 'Asia/Shanghai',
  sourceTimezone: 'Asia/Shanghai',
  ruleVersion: 1,
  journalRows: 1041989,
  highestSourceKey: 1042128,
  latestLoginAt: '2026-10-14T20:48:01.684Z',
  lastSynchronizedAt: '2026-10-14T22:40:00.199Z',
  isStale: false,
  staleAfterMinutes: 180,
  lastReconciledAt: '2026-10-14T15:19:17.509Z',
  completeness: {
    watermarkIsNotAGuarantee: true,
    note: 'TABLE_PK is assigned before commit.',
    overlapWindow: 10000
  },
  snapshotDays: 1306,
  openExceptions: 0,
  exceptionsByKind: [],
  syncLagMinutes: 5,
  sourceLagMinutes: 112,
  snapshots: {
    days: 1306,
    latestDay: '2026-10-15',
    builtAt: '2026-10-14T22:40:02.022Z',
    builtMinutesAgo: 5
  },
  jobDurations: [
    {
      job: 'lifecycle_poll', runs: 12, failed: 0, skipped: 0,
      averageSeconds: 0.412, slowestSeconds: 1.2, lastSeconds: 0.38,
      lastStartedAt: '2026-10-14T22:40:00.000Z'
    },
    /* A job that has started and not finished has no duration yet. */
    {
      job: 'lifecycle_reconcile', runs: 1, failed: 0, skipped: 0,
      averageSeconds: null, slowestSeconds: null, lastSeconds: null, lastStartedAt: null
    }
  ],
  pool: { used: 0, free: 1, pendingAcquires: 0, pendingCreates: 0, min: 2, max: 10 },
  recentRuns: [
    {
      id: 9, job: 'lifecycle_poll', status: 'SUCCEEDED',
      started_at: '2026-10-14T22:40:00.000Z', finished_at: '2026-10-14T22:40:00.380Z',
      rows_read: 0, rows_written: 0, customers_rebuilt: 0, dates_touched: 0,
      error: null, requested_by: null
    }
  ]
};

const IMPACT = {
  reportTimezone: 'Asia/Shanghai',
  ruleVersion: 1,
  event: null,
  eventAt: '2026-09-15T02:00:00.000Z',
  window: {
    beforeDays: 7,
    afterDays: 7,
    start: '2026-09-08T02:00:00.000Z',
    end: '2026-09-22T02:00:00.000Z',
    convention: '[start, event) and [event, end)'
  },
  boundaries: {
    metricType: 'STOCK_AT_INSTANT',
    atWindowStart: { NEW: 889, ACTIVE: 8421, DORMANT: 4760, CHURNED: 15321, TOTAL: 29391 },
    atEvent: { NEW: 900, ACTIVE: 8390, DORMANT: 4772, CHURNED: 15622, TOTAL: 29684 },
    atWindowEnd: { NEW: 910, ACTIVE: 8360, DORMANT: 4790, CHURNED: 15916, TOTAL: 29976 }
  },
  flows: {
    metricType: 'TRANSITION_FLOW',
    before: {
      matrix: [{ fromStatus: 'ACTIVE', toStatus: 'DORMANT', events: 1200, uniqueCustomers: 1180 }],
      events: 1973,
      uniqueCustomers: 1900
    },
    after: {
      matrix: [{ fromStatus: 'DORMANT', toStatus: 'CHURNED', events: 1100, uniqueCustomers: 1100 }],
      events: 2014,
      uniqueCustomers: 1950
    },
    difference: {
      events: 41, uniqueCustomers: 50, beforeEventsPerDay: 281.86, afterEventsPerDay: 287.71
    }
  },
  cohort: {
    metricType: 'COHORT_ENDPOINT_MIGRATION',
    basis: 'FIXED_AT_WINDOW_START',
    size: 29391,
    unchanged: 26081,
    moved: 3310,
    matrix: [
      { fromStatus: 'CHURNED', toStatus: 'CHURNED', customers: 15321, unchanged: true },
      { fromStatus: 'ACTIVE', toStatus: 'DORMANT', customers: 1200, unchanged: false }
    ],
    registeredDuringWindow: 585,
    note: 'One pair per customer.'
  },
  caution: 'A before/after difference around an instant is a correlation.'
};

const EVENTS = {
  rows: [
    {
      eventId: 3,
      name: 'Autumn campaign',
      description: null,
      category: 'campaign',
      eventAt: '2026-09-15T02:00:00.000Z',
      createdBy: 1,
      createdAt: '2026-10-14T10:00:00.000Z',
      updatedAt: '2026-10-14T10:00:00.000Z'
    }
  ],
  total: 1
};

const envelope = (data) => Promise.resolve({ data: { success: true, message: 'ok', data: data } });

jest.mock('../api', () => ({
  __esModule: true,
  lifecycle: {
    overview: () => envelope(OVERVIEW),
    trend: () => envelope(TREND),
    definitions: () => envelope(DEFINITIONS),
    transitionSummary: () => envelope(SUMMARY),
    transitions: () => envelope(TRANSITIONS),
    customers: () => envelope({ rows: [], total: 0, page: 1, limit: 25, summary: null }),
    timeline: () => envelope(null),
    health: () => envelope(HEALTH),
    exceptions: () => envelope({ rows: [] }),
    events: () => envelope(EVENTS),
    impact: () => envelope(IMPACT),
    reconcile: () => envelope({ job: 'lifecycle_reconcile' }),
    stockSheet: { base: '/customer-lifecycle/trend' },
    transitionSheet: { base: '/customer-lifecycle/transitions' },
    customerSheet: { base: '/customer-lifecycle/customers' }
  }
}));

/* WRITE level, so the event manager and the reconcile button are drawn too. */
const STATE = {
  auth: {
    admin: { id: 1, name: 'Ada', username: 'admin', role_name: 'Administrator', role_id: 1 },
    pages: [{ page_url: PAGE, permission: 3 }],
    permissions: {},
    status: 'signedIn'
  }
};

const store = {
  getState: () => STATE,
  subscribe: () => () => {},
  dispatch: () => {}
};

/**
 * 30551 reaches the screen as "30 551" - utils/format groups thousands with a
 * narrow no-break space rather than a comma, and a test that looked for the
 * comma would report a working page as broken.
 */
function grouped(value) {
  const spaced = String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '\\D?');
  return new RegExp(spaced);
}

/** Lets every queued promise settle inside act(), so state lands. */
async function settle() {
  /*
   * MACROTASKS, NOT JUST MICROTASKS. A panel's load is a chain - request,
   * `.then` that sets state, `.finally` that clears the spinner - and a fixed
   * number of `Promise.resolve()` ticks only reaches as far down that chain as
   * somebody once counted. A real timer flush waits for all of it, which is
   * the difference between a test that passes and a test that passes today.
   */
  for (let round = 0; round < 3; round += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

describe('the lifecycle screen', () => {
  let host;
  let Lifecycle;

  beforeAll(() => {
    // eslint-disable-next-line global-require
    Lifecycle = require('../pages/crm/Lifecycle').default;
  });

  beforeEach(async () => {
    host = document.createElement('div');
    document.body.appendChild(host);

    await act(async () => {
      ReactDOM.render(
        <ChakraProvider theme={theme}>
          <I18nProvider>
            <Provider store={store}>
              <MemoryRouter initialEntries={[PAGE]}>
                <ConfirmProvider><Lifecycle /></ConfirmProvider>
              </MemoryRouter>
            </Provider>
          </I18nProvider>
        </ChakraProvider>,
        host
      );
    });

    await settle();
  });

  afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(host); });
    document.body.removeChild(host);
  });

  /** The tab buttons, in the order they are drawn. */
  function tabs() {
    return Array.prototype.slice.call(host.querySelectorAll('[role="tab"]'));
  }

  /** Clicks one tab and lets its panel draw. */
  async function open(index) {
    const button = tabs()[index];
    expect(button).toBeTruthy();

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await settle();
  }

  test('draws the overview cards from the API, not from zero', () => {
    const text = host.textContent;

    /* The real total, formatted - if the payload were being misread this
       would be the dash the Kpi draws for a missing value. */
    expect(text).toMatch(grouped(30551));
    expect(text).toMatch(grouped(8155));
    expect(text).not.toMatch(/NaN/);
  });

  test('has four tabs', () => {
    expect(tabs().length).toBe(4);
  });

  test('the status stock tab draws its buckets, including one with no snapshot', () => {
    const text = host.textContent;
    expect(text).toMatch(grouped(30413));
    expect(text).not.toMatch(/NaN/);
  });

  test('the transition explorer opens and draws the matrix and the rows', async () => {
    await open(1);

    const text = host.textContent;
    /* A matrix cell, and the unique-customer count beside it. */
    expect(text).toMatch(grouped(10748));
    /* A row from the paginated list. */
    expect(text).toContain('mock-005809');
    /* The row whose profile is mostly null still drew. */
    expect(text).toContain('mock-005810');
    expect(text).not.toMatch(/NaN|undefined/);
  });

  test('the event impact tab opens, and compares when asked', async () => {
    await open(2);

    /* The stored event is listed before anything is compared. */
    expect(host.textContent).toContain('Autumn campaign');

    const compare = Array.prototype.slice.call(host.querySelectorAll('button'))
      .filter((node) => /^Compare$/.test((node.textContent || '').trim()))[0];
    expect(compare).toBeTruthy();

    await act(async () => {
      compare.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await settle();

    const text = host.textContent;
    /* A boundary total, a flow count and the cohort size: one number from
       each of the three metric modes. */
    expect(text).toMatch(grouped(29391));
    expect(text).toMatch(grouped(2014));
    expect(text).toMatch(grouped(26081));
    /* And the caveat the server sends, which must not be dropped. */
    expect(text).toContain('correlation');
    expect(text).not.toMatch(/NaN|undefined/);
  });

  test('the job health tab opens and draws the operations numbers', async () => {
    await open(3);

    const text = host.textContent;
    expect(text).toMatch(grouped(1041989));     // the journal
    expect(text).toMatch(/lifecycle_poll/);  // a job duration row
    expect(text).toMatch(/0 \/ 10/);         // the pool
    expect(text).not.toMatch(/NaN|undefined/);
  });
});
