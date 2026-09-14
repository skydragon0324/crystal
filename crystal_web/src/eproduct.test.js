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
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';

import theme from './theme';
import { I18nProvider } from './i18n';
import {
  BmediaKeygen,
  EprodRegistrations,
  KaraokeKeygen
} from './pages/account/storefront/Eproduct';

const mockState = { registrations: [], karaoke: [], bmedia: [] };

jest.mock('./api', () => {
  const page = (rows) => Promise.resolve({
    data: { rows: rows, total: rows.length, page: 1, limit: 12, summary: { linked: true } }
  });

  return {
    __esModule: true,
    default: {
      account: {
        eprodBalance: () => Promise.resolve({
          data: { linked: true, balance: 9968, used: 6630, registered: 6 }
        }),
        eprodRegistrations: () => page(mockState.registrations),
        karaokeKeygen: () => page(mockState.karaoke),
        manbangKeygen: () => page([]),
        bmediaKeygen: () => page(mockState.bmedia)
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

  const karaoke = await mount(<KaraokeKeygen />);
  expect(karaoke.headers()).toEqual([
    'No.', 'Machine key', 'Reference', 'Points paid', 'Outcome', 'Keyed by', 'Issued'
  ]);
  await karaoke.done();

  const bmedia = await mount(<BmediaKeygen />);
  expect(bmedia.headers()).toEqual([
    'No.', 'Device', 'Provider', 'Keyed by', 'Points paid', 'Points back', 'Issued'
  ]);
  await bmedia.done();
});

test('the registration balance is shown above its own log', async () => {
  /*
   * The two are one story: registering earns points, and the log below is
   * where they came from. A balance with no log is a number nobody can check.
   */
  mockState.registrations = REGISTRATIONS;

  const ui = await mount(<EprodRegistrations />);
  const text = ui.text();

  expect(text).toContain('9,968');
  expect(text).toContain('6,630');
  expect(text).toContain('CR415070376');

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
  expect(cell).toContain('issued');
  /* The service said "Issued" too; the cell must not carry it twice. */
  expect(cell).not.toContain('Issued');

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
