/*
 * THE SIGNING CERTIFICATES' EXPIRY: the thresholds, the header's indicator
 * and the dashboard's card.
 *
 * The thresholds are tested at their edges because that is the only place
 * they can be wrong - 30 days against 29, the last moment before notAfter
 * against the first after it - and because they have to fall on the same day
 * as the API's own startup warning (crystal-backend/src/services/
 * certificates.service.js, whose tests pin the same edges).
 *
 * The components are mounted against a real store and a stubbed API, because
 * what matters about them happens between the two: one request a session for
 * the header, a fresh one for the card, and silence - not a broken badge -
 * when the request fails.
 *
 * Nothing here asserts English wording. The words are addresses resolved from
 * the catalogue; what is checked is which status, which colour and which rows.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ChakraProvider } from '@chakra-ui/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter, Route } from 'react-router-dom';

import theme from '../theme';
import { I18nProvider } from '../i18n';
import certificates, { loadCertificates } from '../app/certificatesSlice';
import { signedOut } from '../app/authSlice';
import CertificateExpiry from '../components/CertificateExpiry';
import { CertificateAlert, SigningCertificates } from '../pages/Dashboard';
import { dateMinute } from '../utils/format';
import {
  CERTIFICATES_ANCHOR, DAY_MS, STATUS_SCHEME, certificatesAsOf, daysLeft, statusOf
} from '../utils/certificates';

jest.mock('../api', () => ({
  __esModule: true,
  auth: {},
  dashboard: { certificates: (...args) => mockCertificates(...args) }
}));

const mockCertificates = jest.fn();

/* ------------------------------------------------------------------ */
/*  fixtures                                                           */
/* ------------------------------------------------------------------ */

/*
 * Half a day past the whole number, so the few milliseconds between building
 * a report and drawing it can never carry a certificate across a day boundary
 * and make a test flaky. The boundaries themselves are tested exactly, below.
 */
function inDays(days, from) {
  return new Date((from || Date.now()) + days * DAY_MS + DAY_MS / 2).toISOString();
}

function certificate(overrides) {
  return {
    keyId: 'content-key-v2',
    role: 'active',
    algorithm: 'ECDSA-P256-SHA256',
    subject: 'CN=content-key-v2, O=Crystal',
    subjectCN: 'content-key-v2',
    issuer: 'CN=Crystal Content Signing CA, O=Crystal',
    issuerCN: 'Crystal Content Signing CA',
    selfSigned: false,
    source: 'p12',
    notBefore: '2026-01-01T00:00:00.000Z',
    notAfter: inDays(400),
    daysLeft: 400,
    status: 'ok',
    chainStatus: 'verified',
    chainReason: null,
    ...overrides
  };
}

function report(list) {
  return {
    now: new Date().toISOString(),
    thresholds: { warningDays: 30, criticalDays: 7 },
    certificates: list,
    problems: []
  };
}

function answer(body) {
  mockCertificates.mockImplementation(() => Promise.resolve({ data: body }));
}

function refuse(status) {
  mockCertificates.mockImplementation(() => {
    const error = new Error('request failed');
    error.status = status;
    return Promise.reject(error);
  });
}

/* ------------------------------------------------------------------ */
/*  mounting                                                           */
/* ------------------------------------------------------------------ */

let host = null;
let location = null;

function newStore() {
  return configureStore({ reducer: { certificates } });
}

async function mount(element, store, url) {
  host = document.createElement('div');
  document.body.appendChild(host);

  await act(async () => {
    ReactDOM.render(
      <ChakraProvider theme={theme}>
        <I18nProvider>
          <Provider store={store}>
            <MemoryRouter initialEntries={[url || '/admin/service/tickets']}>
              {element}
              <Route render={(props) => { location = props.location; return null; }} />
            </MemoryRouter>
          </Provider>
        </I18nProvider>
      </ChakraProvider>,
      host
    );
  });
  await settle();
}

/* Lets the stubbed request answer and the store update - a thunk is several promise turns. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function unmount() {
  if (!host) return;
  act(() => { ReactDOM.unmountComponentAtNode(host); });
  document.body.removeChild(host);
  host = null;
}

beforeEach(() => {
  mockCertificates.mockReset();
  location = null;
});

afterEach(unmount);

/* ------------------------------------------------------------------ */
/*  the thresholds                                                     */
/* ------------------------------------------------------------------ */

describe('the status thresholds', () => {
  test('warning starts at 29 whole days left, critical at 6, expired below 0 - "fewer than", as the API warns', () => {
    const thresholds = { warningDays: 30, criticalDays: 7 };

    expect(statusOf(400, thresholds)).toBe('ok');
    expect(statusOf(30, thresholds)).toBe('ok');
    expect(statusOf(29, thresholds)).toBe('warning');
    expect(statusOf(7, thresholds)).toBe('warning');
    expect(statusOf(6, thresholds)).toBe('critical');
    expect(statusOf(1, thresholds)).toBe('critical');
    expect(statusOf(0, thresholds)).toBe('critical');
    expect(statusOf(-1, thresholds)).toBe('expired');
    expect(statusOf(-400, thresholds)).toBe('expired');
  });

  test('a day ends at the millisecond: 30 days to go exactly is 30, and one tick later is 29', () => {
    const now = Date.parse('2026-09-16T10:00:00.000Z');
    const notAfter = new Date(now + 30 * DAY_MS).toISOString();

    expect(daysLeft(notAfter, now)).toBe(30);
    expect(daysLeft(notAfter, now + 1)).toBe(29);
    expect(daysLeft(notAfter, now + 23 * DAY_MS + 1)).toBe(6);
    expect(daysLeft(notAfter, now + 30 * DAY_MS)).toBe(0);
    expect(daysLeft(notAfter, now + 30 * DAY_MS + 1)).toBe(-1);

    expect(statusOf(daysLeft(notAfter, now + 30 * DAY_MS), undefined)).toBe('critical');
    expect(statusOf(daysLeft(notAfter, now + 30 * DAY_MS + 1), undefined)).toBe('expired');
  });

  test('the report\'s own thresholds are the ones used, and the defaults only stand in for missing ones', () => {
    expect(statusOf(40, { warningDays: 60, criticalDays: 14 })).toBe('warning');
    expect(statusOf(10, { warningDays: 60, criticalDays: 14 })).toBe('critical');
    expect(statusOf(29, null)).toBe('warning');
    expect(statusOf(29, { warningDays: 'soon' })).toBe('warning');
    expect(statusOf(null)).toBe(null);
  });

  test('a held report is recounted on the server\'s clock, moved on by how long it was held', () => {
    const serverNow = Date.parse('2026-09-16T10:00:00.000Z');
    const body = {
      now: new Date(serverNow).toISOString(),
      thresholds: { warningDays: 30, criticalDays: 7 },
      certificates: [certificate({ notAfter: new Date(serverNow + 30 * DAY_MS).toISOString(), daysLeft: 30, status: 'ok' })]
    };

    /* The reader's own clock is three days out; only the time it held the report counts. */
    const receivedAt = serverNow - 3 * DAY_MS;

    expect(certificatesAsOf(body, receivedAt, receivedAt)[0]).toMatchObject({ daysLeft: 30, status: 'ok' });
    expect(certificatesAsOf(body, receivedAt, receivedAt + 1)[0]).toMatchObject({ daysLeft: 29, status: 'warning' });
    expect(certificatesAsOf(body, receivedAt, receivedAt + 30 * DAY_MS + 1)[0]).toMatchObject({ daysLeft: -1, status: 'expired' });

    /* A clock turned back is not time running backwards. */
    expect(certificatesAsOf(body, receivedAt, receivedAt - DAY_MS)[0]).toMatchObject({ daysLeft: 30 });
  });

  test('anything that is not a report, or a certificate with no readable end date, draws nothing', () => {
    expect(certificatesAsOf(null, 0, 0)).toEqual([]);
    expect(certificatesAsOf({ rows: [{ id: 1 }] }, 0, 0)).toEqual([]);
    expect(certificatesAsOf(report([certificate({ notAfter: 'soon' }), null]), Date.now(), Date.now())).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  the header's indicator                                             */
/* ------------------------------------------------------------------ */

describe('the header indicator', () => {
  const button = () => host.querySelector('button[data-status]');

  [
    ['ok', 400, 'green'],
    ['warning', 20, 'orange'],
    ['critical', 3, 'red'],
    ['expired', -5, 'red']
  ].forEach(([status, days, scheme]) => {
    test('a certificate with ' + days + ' days left is ' + status + ', coloured ' + scheme, async () => {
      answer(report([certificate({ notAfter: inDays(days), daysLeft: days, status: status })]));
      await mount(<CertificateExpiry />, newStore());

      expect(button()).not.toBeNull();
      expect(button().getAttribute('data-status')).toBe(status);
      expect(button().getAttribute('data-scheme')).toBe(scheme);
      expect(STATUS_SCHEME[status]).toBe(scheme);
    });
  });

  test('its colour comes from the count now, not from the status the API sent', async () => {
    /* The API said ok; the dates say it has 3 days. The dates win. */
    answer(report([certificate({ notAfter: inDays(3), daysLeft: 400, status: 'ok' })]));
    await mount(<CertificateExpiry />, newStore());

    expect(button().getAttribute('data-status')).toBe('critical');
    expect(button().getAttribute('data-scheme')).toBe('red');
  });

  test('it shows the ACTIVE certificate, not a previous key that is further along', async () => {
    answer(report([
      certificate({ keyId: 'content-key-v1', role: 'previous', notAfter: inDays(-30), status: 'expired' }),
      certificate({ keyId: 'content-key-v2', role: 'active', notAfter: inDays(200) })
    ]));
    await mount(<CertificateExpiry />, newStore());

    expect(button().getAttribute('data-status')).toBe('ok');
    expect(button().getAttribute('data-key-id')).toBe('content-key-v2');
  });

  test('it takes the reader to the card on the dashboard', async () => {
    answer(report([certificate({ notAfter: inDays(3), status: 'critical' })]));
    await mount(<CertificateExpiry />, newStore());

    await act(async () => { button().click(); });

    expect(location.pathname).toBe('/admin/dashboard');
    expect(location.hash).toBe('#' + CERTIFICATES_ANCHOR);
  });

  [
    ['a role that cannot read the dashboard (403)', () => refuse(403)],
    ['an API that cannot be reached', () => refuse(0)],
    ['a reply that is not a certificate report', () => answer({ rows: [{ id: 1 }], total: 1 })],
    ['a report with no active certificate', () => answer(report([certificate({ role: 'previous' })]))]
  ].forEach(([what, arrange]) => {
    test('it renders nothing, and throws nothing, for ' + what, async () => {
      const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
      try {
        arrange();
        await mount(<CertificateExpiry />, newStore());

        expect(mockCertificates).toHaveBeenCalledTimes(1);
        expect(host.querySelector('button')).toBeNull();
        expect(host.textContent).toBe('');
        expect(errors).not.toHaveBeenCalled();
      } finally {
        errors.mockRestore();
      }
    });
  });

  test('it renders nothing while the first answer is on its way', async () => {
    mockCertificates.mockImplementation(() => new Promise(() => {}));
    await mount(<CertificateExpiry />, newStore());

    expect(host.querySelector('button')).toBeNull();
  });

  test('it asks once a session, however many screens mount it - and not again after a failure', async () => {
    answer(report([certificate()]));
    const store = newStore();

    await mount(<CertificateExpiry />, store);
    unmount();
    await mount(<><CertificateExpiry /><CertificateExpiry /></>, store);
    expect(mockCertificates).toHaveBeenCalledTimes(1);
    unmount();

    refuse(500);
    const failing = newStore();
    await mount(<CertificateExpiry />, failing);
    unmount();
    await mount(<CertificateExpiry />, failing);
    expect(mockCertificates).toHaveBeenCalledTimes(2);
  });

  test('signing out forgets the report, so the next session asks again', async () => {
    answer(report([certificate()]));
    const store = newStore();
    await mount(<CertificateExpiry />, store);
    expect(button()).not.toBeNull();

    await act(async () => { store.dispatch(signedOut()); });
    expect(host.querySelector('button')).toBeNull();

    await act(async () => { await store.dispatch(loadCertificates()); });
    expect(mockCertificates).toHaveBeenCalledTimes(2);
  });
});

/* ------------------------------------------------------------------ */
/*  the dashboard's card                                               */
/* ------------------------------------------------------------------ */

describe('the dashboard card', () => {
  const rows = () => Array.prototype.slice.call(host.querySelectorAll('[data-role]'));

  test('lists the active certificate and a previous key, each with its status and expiry', async () => {
    const activeEnd = inDays(20);
    const previousEnd = inDays(-10);

    answer(report([
      certificate({ keyId: 'content-key-dev-p12', role: 'active', notAfter: activeEnd, status: 'warning' }),
      certificate({
        keyId: 'content-key-dev', role: 'previous', source: 'key-dir', selfSigned: true,
        subject: 'CN=content-key-dev', subjectCN: 'content-key-dev', issuer: 'CN=content-key-dev', issuerCN: 'content-key-dev',
        notAfter: previousEnd, status: 'expired', chainStatus: 'not-applicable'
      })
    ]));
    await mount(<SigningCertificates />, newStore(), '/admin/dashboard');

    expect(rows().map((row) => [row.getAttribute('data-role'), row.getAttribute('data-status')])).toEqual([
      ['active', 'warning'],
      ['previous', 'expired']
    ]);

    const [active, previous] = rows();
    expect(active.textContent).toContain('content-key-dev-p12');
    expect(active.textContent).toContain('Crystal Content Signing CA');
    expect(active.textContent).toContain(dateMinute(activeEnd));
    expect(previous.textContent).toContain('content-key-dev');
    expect(previous.textContent).toContain(dateMinute(previousEnd));
  });

  test('lists a member sign-in CA when the report has one, and names a chain it could not read', async () => {
    const body = report([
      certificate(),
      certificate({
        keyId: null, role: 'member-ca', source: 'member-ca-ecc', subjectCN: 'GovCA ECC Root', subject: 'CN=GovCA ECC Root',
        issuerCN: 'GovCA ECC Root', selfSigned: true, algorithm: 'EC', chainStatus: 'not-applicable', notAfter: inDays(2)
      })
    ]);
    body.problems = [{ source: 'member-ca-rsa', problem: 'unreadable' }];
    answer(body);
    await mount(<SigningCertificates />, newStore(), '/admin/dashboard');

    expect(rows().map((row) => row.getAttribute('data-role'))).toEqual(['active', 'member-ca']);
    expect(rows()[1].getAttribute('data-status')).toBe('critical');
    expect(rows()[1].textContent).toContain('GovCA ECC Root');
    expect(host.querySelectorAll('[data-problem]').length).toBe(1);
    expect(host.querySelector('[data-problem]').getAttribute('data-problem')).toBe('member-ca-rsa');
  });

  test('refreshes the report when it mounts, even though the header already has one', async () => {
    answer(report([certificate()]));
    const store = newStore();

    await mount(<CertificateExpiry />, store);
    expect(mockCertificates).toHaveBeenCalledTimes(1);
    unmount();

    answer(report([certificate({ notAfter: inDays(3) })]));
    await mount(<><CertificateExpiry /><SigningCertificates /></>, store, '/admin/dashboard');

    expect(mockCertificates).toHaveBeenCalledTimes(2);
    expect(host.querySelector('button[data-status]').getAttribute('data-status')).toBe('critical');
  });

  test('says it could not load, rather than showing an empty card, when the request fails', async () => {
    refuse(500);
    await mount(<SigningCertificates />, newStore(), '/admin/dashboard');

    expect(rows()).toEqual([]);
    expect(host.querySelector('[data-testid="signing-certificates"]')).not.toBeNull();
    expect(host.querySelector('.chakra-spinner')).toBeNull();
  });

  test('raises the banner for an active certificate in its last week, and not for an expired previous key', async () => {
    answer(report([
      certificate({ notAfter: inDays(200) }),
      certificate({ keyId: 'content-key-v1', role: 'previous', notAfter: inDays(-100) })
    ]));
    await mount(<><CertificateAlert /><SigningCertificates /></>, newStore(), '/admin/dashboard');
    expect(host.querySelector('[data-testid="certificate-alert"]')).toBeNull();
    unmount();

    answer(report([certificate({ notAfter: inDays(-1) })]));
    await mount(<><CertificateAlert /><SigningCertificates /></>, newStore(), '/admin/dashboard');
    const alert = host.querySelector('[data-testid="certificate-alert"]');
    expect(alert).not.toBeNull();
    expect(alert.querySelectorAll('.chakra-alert__desc').length).toBe(1);
  });
});
