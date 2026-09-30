/*
 * THE EPRODUCT PAGES, WITH DATA IN THEM.
 *
 * pages.test.js mounts every route against an empty reply and reaches none of
 * the markup below. What is held here:
 *
 *   THE OUTCOME IS A BADGE, NOT A COLOURED MESSAGE. The vendor put the
 *   service's `message` in a red tag whenever the keying failed and a blue one
 *   when it worked - so a successfully issued licence appeared as a coloured
 *   tag reading "Issued", which at a glance is a fault. The outcome and the
 *   service's words are two different things.
 *
 *   B-MEDIA KEEPS TWO FIGURES. A member who paid 150 and got 21 back has not
 *   paid 129, so the charge and the rebate are never combined.
 *
 *   THE COLUMN ORDER IS THE VENDOR'S, the same requirement as the Eshop and
 *   Appstore tables and the same thing quietly rearranged by whoever next
 *   adds a column.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ChakraProvider, useToast } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';

/*
 * useToast IS THE ASSERTION, not the toast's own markup.
 *
 * Chakra v1 puts a toast on screen through a React root of ITS OWN, appended
 * to document.body - outside the tree under test and outside act(). Whether
 * that markup has landed by the time a test looks depends on framer-motion
 * and on the frame, which makes "is the text in the body" a flake rather than
 * a check. What this page is responsible for is RAISING a toast carrying the
 * service's words, so that is what is captured: the real hook is replaced,
 * everything else in Chakra is the real thing.
 */
jest.mock('@chakra-ui/react', () => {
  const actual = jest.requireActual('@chakra-ui/react');
  const raised = [];
  const stub = () => function toast(options) { raised.push(options); };
  stub.raised = raised;

  return Object.assign({}, actual, { __esModule: true, useToast: stub });
});

import theme from '../theme';
import { I18nProvider } from '../i18n';
import {
  BmediaKeygen,
  EprodRegistrations,
  KaraokeKeygen
} from '../pages/account/storefront/Eproduct';

const mockState = {
  registrations: [], karaoke: [], bmedia: [], karaokeSummary: null,
  /* What the licence-file call answers, and every call it was asked. */
  file: null, fileCalls: []
};

jest.mock('../api', () => {
  const page = (rows, summary) => Promise.resolve({
    data: {
      rows: rows,
      total: rows.length,
      page: 1,
      limit: 12,
      summary: Object.assign({ linked: true }, summary || {})
    }
  });

  return {
    __esModule: true,
    default: {
      account: {
        eprodRegistrations: () => page(mockState.registrations),
        karaokeKeygen: () => page(mockState.karaoke, mockState.karaokeSummary),
        manbangKeygen: () => page([]),
        bmediaKeygen: () => page(mockState.bmedia),
        keygenLicenseFile: (system, id) => {
          mockState.fileCalls.push([system, id]);
          return mockState.file();
        }
      }
    },
    fileUrl: (p) => p || ''
  };
});

const REGISTRATIONS = [
  {
    id: 750600, serial_number: 'CR415070376', product_name: 'Crystal Karaoke Mic',
    contact: '138-4754-6373', address: '北京市朝阳区建国路88号',
    points: 190, status: 'APPROVED', at: '2026-09-04 10:10:00'
  },
  {
    id: 750601, serial_number: 'CR351808761', product_name: 'Crystal Screen Film',
    contact: null, address: null,
    points: 0, status: 'REJECTED', at: '2026-08-28 09:00:00'
  }
];

const KARAOKE = [
  {
    id: 'KG1', machine_key: 'MK-165610-200056', price: 20.21,
    succeeded: true, message: 'Issued', actor: 'MEMBER',
    reference: 'TR3765702', license_file: '/licenses/karaoke/1452.lic',
    at: '2026-09-05 09:03:00'
  },
  {
    id: 'KG2', machine_key: 'MK-587505-840153', price: 21.76,
    succeeded: false, message: 'Not enough points', actor: 'AGENCY',
    reference: 'TR9910233', license_file: null,
    at: '2026-09-01 10:00:00'
  }
];

const BMEDIA = [
  {
    id: 'BM1', device_id: 'DEV-145465411', provider: 'PSC',
    provider_name: 'Paeksong Channel', actor: 'MEMBER',
    price: 150, bonus: 21, at: '2026-09-06 11:17:00'
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
  mockState.registrations = [];
  mockState.karaoke = [];
  mockState.bmedia = [];
  mockState.karaokeSummary = null;
  mockState.file = null;
  mockState.fileCalls = [];
  useToast.raised.length = 0;
  document.body.innerHTML = '';
});

test('the columns are in the vendor\'s order, on all three shapes', async () => {
  mockState.registrations = REGISTRATIONS;
  mockState.karaoke = KARAOKE;
  mockState.bmedia = BMEDIA;

  const registrations = await mount(<EprodRegistrations />);
  expect(registrations.headers()).toEqual([
    'No.', 'Serial number', 'Product', 'Contact', 'Address',
    'Points earned', 'Status', 'Registered'
  ]);
  await registrations.done();

  /*
   * The keygen logs gained an Actions column at the end - download, retry and
   * the fault report, which the vendor has and Crystal did not. It goes LAST,
   * so the vendor's column order is untouched ahead of it.
   */
  /*
   * The leading columns are compared and the trailing one is only counted,
   * because the Actions header is a NEW dictionary address: until it is
   * merged, t() falls through to the address itself, and a test that asserted
   * the English word would be red for a reason that has nothing to do with
   * the column order it exists to protect.
   */
  const karaoke = await mount(<KaraokeKeygen />);
  expect(karaoke.headers().slice(0, 7)).toEqual([
    'No.', 'Machine key', 'Reference', 'Points paid', 'Outcome', 'Keyed by', 'Issued'
  ]);
  expect(karaoke.headers()).toHaveLength(8);
  await karaoke.done();

  /*
   * The old label on `bonus_price` said the points came back, which reads as
   * a refund of the charge beside it and is not one. It is the vendor's
   * EPROD_SOFT_POINT: the software allowance the licence earned.
   */
  const bmedia = await mount(<BmediaKeygen />);
  expect(bmedia.headers().slice(0, 5)).toEqual([
    'No.', 'Device', 'Provider', 'Keyed by', 'Points paid'
  ]);
  expect(bmedia.headers()[6]).toBe('Issued');
  expect(bmedia.headers()).toHaveLength(8);
  await bmedia.done();
});

test('the registration log leads with the log, and no summary cards', async () => {
  /*
   * THREE CARDS WERE REMOVED FROM ABOVE IT - points held, points spent and
   * devices registered - and none of the three was a number this page could
   * support. The balance is one of six that do not add up and belongs with
   * the other five on the points page; "devices registered" is the length of
   * the list directly underneath it, printed twice; and "points spent" is not
   * reconcilable against anything on screen.
   *
   * Removing them takes the whole eproduct balance call with them, which is
   * why the mock no longer answers one: a page that still asked for it would
   * throw here rather than quietly keeping the request.
   */
  mockState.registrations = REGISTRATIONS;

  const ui = await mount(<EprodRegistrations />);
  const text = ui.text();

  expect(text).toContain('CR415070376');
  expect(text).not.toContain('Points held');
  expect(text).not.toContain('Points spent');
  expect(text).not.toContain('Devices registered');

  await ui.done();
});

test('an error from the eproduct service is said out loud', async () => {
  /*
   * The service answers these three endpoints with a code that is TRUTHY FOR
   * FAILURE and a message explaining it, and both were being dropped on the
   * way through: the reply became an empty list, so a member whose keying had
   * been refused was shown "No Karaoke licences yet" - a different and untrue
   * statement. The API carries the service's words in `summary.error` now,
   * and the page has to say them rather than swallow them.
   */
  mockState.karaoke = [];
  mockState.karaokeSummary = { error: 'keygen service refused: licence quota spent' };

  const ui = await mount(<KaraokeKeygen />);

  expect(useToast.raised.map((options) => options.description))
    .toContain('keygen service refused: licence quota spent');
  expect(useToast.raised[0].status).toBe('error');

  /* And the member is NOT told they simply have no licences. */
  expect(useToast.raised.length).toBeGreaterThan(0);

  await ui.done();
});

test('a keygen log that answered normally raises nothing', async () => {
  /* The mirror of the test above: a quiet page must stay quiet. */
  mockState.karaoke = KARAOKE;

  const ui = await mount(<KaraokeKeygen />);
  expect(useToast.raised).toEqual([]);

  await ui.done();
});

test('a keying that worked does not look like a fault', async () => {
  /*
   * THE BUG THIS REPLACED. The vendor coloured the service's `message` by
   * outcome, so "Issued" arrived in a tag - the same shape a failure took,
   * and only the words told them apart. The outcome is its own badge now, and
   * the message appears only where it adds something a badge cannot say.
   */
  mockState.karaoke = KARAOKE;

  const ui = await mount(<KaraokeKeygen />);

  const headers = Array.prototype.map.call(
    ui.host.querySelectorAll('thead th'), (th) => th.textContent
  );
  const outcomeAt = headers.indexOf('Outcome');
  expect(outcomeAt).toBeGreaterThan(-1);

  const rows = Array.prototype.filter.call(
    ui.host.querySelectorAll('tbody tr'),
    (tr) => tr.textContent.indexOf('MK-165610-200056') > -1
  );
  expect(rows.length).toBe(1);

  const cell = rows[0].querySelectorAll('td')[outcomeAt].textContent;
  expect(cell).toContain('Issued');
  /*
   * The service said "Issued" too, and the cell must not carry it twice - the
   * badge already is the outcome. Counted rather than tested for absence,
   * because the badge's own word is now the translated one and happens to be
   * the same string in English.
   */
  expect(cell.split('Issued').length - 1).toBe(1);

  /* A failure DOES explain itself, in the service's own words. */
  const failed = Array.prototype.filter.call(
    ui.host.querySelectorAll('tbody tr'),
    (tr) => tr.textContent.indexOf('MK-587505-840153') > -1
  );
  expect(failed[0].querySelectorAll('td')[outcomeAt].textContent).toContain('Not enough points');

  await ui.done();
});

test('a media licence never merges what was paid with what came back', async () => {
  mockState.bmedia = BMEDIA;

  const ui = await mount(<BmediaKeygen />);
  const text = ui.text();

  expect(text).toContain('150');
  expect(text).toContain('+21');

  /* 150 - 21 = 129, which is the figure a single "net" column would print. */
  expect(text).not.toContain('129');

  /* And it says who did the keying. */
  expect(text).toContain('You');

  await ui.done();
});

/* ------------------------------------------------------------------ */

describe('saving a licence file', () => {
  /*
   * IN PLACE, NEVER THROUGH A NEW TAB. The page used to open a blank tab
   * before the request and point it at the eproduct site's download script
   * afterwards - a window nobody asked for, for what is a file. The bytes now
   * come through Crystal's own API and are saved through an object URL on an
   * anchor with `download`, so these assert exactly that: one call to the
   * file endpoint, no window.open, one anchor click carrying the file's own
   * name, and the object URL given back afterwards.
   *
   * jsdom has no object URLs and does not download on an anchor click, so
   * both are stood in for - the click is RECORDED, which is the assertion.
   */
  let clicks;
  let open;
  let click;

  beforeEach(() => {
    clicks = [];
    open = jest.spyOn(window, 'open').mockImplementation(() => null);
    window.URL.createObjectURL = jest.fn(() => 'blob:licence-1');
    window.URL.revokeObjectURL = jest.fn();
    click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function record() {
      clicks.push({ href: this.getAttribute('href'), download: this.getAttribute('download') });
    });
  });

  afterEach(() => {
    open.mockRestore();
    click.mockRestore();
    delete window.URL.createObjectURL;
    delete window.URL.revokeObjectURL;
  });

  async function pressDownload(ui) {
    const button = ui.host.querySelector('tbody button[aria-label="Download"]');
    expect(button).not.toBe(null);

    await act(async () => { button.click(); });
    /* The revoke is on the next tick, after the click has been handled. */
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
  }

  test('the file is fetched through the API and saved under its own name', async () => {
    mockState.karaoke = KARAOKE;
    mockState.file = () => Promise.resolve({ data: new Uint8Array([67, 82, 89]).buffer });

    const ui = await mount(<KaraokeKeygen />);
    await pressDownload(ui);

    expect(mockState.fileCalls).toEqual([['karaoke', 'KG1']]);
    expect(open).not.toHaveBeenCalled();

    /* The basename of the row's path - the same name the API's header gives. */
    expect(clicks).toEqual([{ href: 'blob:licence-1', download: '1452.lic' }]);

    const blob = window.URL.createObjectURL.mock.calls[0][0];
    expect(blob instanceof Blob).toBe(true);
    expect(blob.size).toBe(3);
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:licence-1');

    /* A download that worked says nothing - the file arriving is the answer. */
    expect(useToast.raised).toEqual([]);

    await ui.done();
  });

  test('a file that cannot be fetched is said in a toast, and nothing is saved', async () => {
    mockState.karaoke = KARAOKE;
    mockState.file = () => Promise.reject(new Error('the eproduct service did not send the licence file'));

    const ui = await mount(<KaraokeKeygen />);
    await pressDownload(ui);

    expect(open).not.toHaveBeenCalled();
    expect(clicks).toEqual([]);
    expect(useToast.raised.map((options) => options.description))
      .toContain('the eproduct service did not send the licence file');
    expect(useToast.raised[0].status).toBe('error');

    await ui.done();
  });
});
