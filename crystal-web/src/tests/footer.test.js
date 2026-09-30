/*
 * THE FOOTER, which the operations console owns.
 *
 * Every word on it comes from `GET /site/footer` now - it used to be four
 * columns hardcoded in the component, which meant a moved phone number
 * needed a deployment. What is held here:
 *
 *   THE NUMBERS ARE DIALLABLE. Half the people reading a footer are holding
 *   a phone, and the alternative to a `tel:` link is copying digits by hand.
 *
 *   A SITE BUTTON WITH NO ADDRESS IS NOT DRAWN. The console always has two
 *   rows to type into, so an unfilled one reaches the page - and a button
 *   that goes nowhere is worse than an empty corner.
 *
 *   IT SURVIVES A REPLY THAT HAS NOT ARRIVED. The footer is on every page,
 *   so a component that threw before its request resolved would take down
 *   the whole site rather than the bottom of it.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';

import theme from '../theme';
import { I18nProvider } from '../i18n';
import Footer from '../components/layout/Footer';

const mockState = { doc: null };

jest.mock('../api', () => ({
  __esModule: true,
  default: {
    site: { footer: () => Promise.resolve({ data: mockState.doc }) }
  },
  fileUrl: (p) => p || ''
}));

const DOC = {
  downloads: {
    title: 'Downloads',
    items: [
      { label: 'Crystal App', href: '/downloads/crystal-app.apk' },
      { label: 'Eshop App', href: '/downloads/eshop-app.apk' },
      { label: 'Appstore App', href: '/downloads/appstore-app.apk' }
    ]
  },
  contacts: {
    title: 'Contact us',
    phones: ['0191-200-1000', '0191-200-1001', '0191-200-1002']
  },
  support: {
    title: 'Support',
    links: [
      { label: 'FAQ', to: '/support/faq' },
      { label: 'Contact us', to: '/support/contact' }
    ]
  },
  company: {
    title: 'Crystal',
    email: 'admin@crystal.example',
    address: 'Crystal Electronics, Ryomyong Street 1, Pyongyang'
  },
  /* One filled in, one not - which is the case the corner has to handle. */
  sites: [
    { label: 'Site A', href: 'https://a.example' },
    { label: 'Site B', href: '' }
  ]
};

async function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);

  await act(async () => {
    ReactDOM.render(
      <ChakraProvider theme={theme}>
        <I18nProvider>
          <MemoryRouter><Footer /></MemoryRouter>
        </I18nProvider>
      </ChakraProvider>,
      host
    );
  });

  return {
    host,
    text: () => host.textContent,
    hrefs: () => Array.prototype.map.call(host.querySelectorAll('a'), (a) => a.getAttribute('href')),
    async done() {
      await act(async () => { ReactDOM.unmountComponentAtNode(host); });
      document.body.removeChild(host);
    }
  };
}

afterEach(() => {
  mockState.doc = null;
  document.body.innerHTML = '';
});

test('every section comes from the document, not from the code', async () => {
  mockState.doc = DOC;

  const ui = await mount();
  const text = ui.text();

  expect(text).toContain('Crystal App');
  expect(text).toContain('0191-200-1000');
  expect(text).toContain('FAQ');
  expect(text).toContain('admin@crystal.example');
  expect(text).toContain('Ryomyong Street 1');

  await ui.done();
});

test('a phone number is diallable and an email is mailable', async () => {
  mockState.doc = DOC;

  const ui = await mount();
  const hrefs = ui.hrefs();

  /* Punctuation is stripped from the dialled number, not from the shown one. */
  expect(hrefs).toContain('tel:01912001000');
  expect(ui.text()).toContain('0191-200-1000');

  expect(hrefs).toContain('mailto:admin@crystal.example');

  await ui.done();
});

test('a number says what it is for, and one saved before labels still shows', async () => {
  /*
   * BOTH SHAPES REACH THIS COMPONENT. A document saved since labels arrived
   * holds { label, number }; one saved before holds a bare string, and every
   * site that has not re-opened the console still does. Dropping those would
   * take the numbers off a working footer at deploy time, so they render as
   * they always did - the number, with nothing written above it.
   */
  mockState.doc = {
    ...DOC,
    contacts: {
      title: 'Contact us',
      phones: [
        { label: 'Service line', number: '400-820-1668' },
        '0191-200-1000'
      ]
    }
  };

  const ui = await mount();
  const text = ui.text();

  expect(text).toContain('Service line');
  expect(text).toContain('400-820-1668');
  expect(ui.hrefs()).toContain('tel:4008201668');

  /* The old row: still there, still diallable, and no label invented for it. */
  expect(text).toContain('0191-200-1000');
  expect(ui.hrefs()).toContain('tel:01912001000');

  await ui.done();
});

test('a site button with no address is not drawn', async () => {
  /*
   * The console keeps two rows whatever is in them, so an empty one reaches
   * the page. A button that goes nowhere is worse than an empty corner.
   */
  mockState.doc = DOC;

  const ui = await mount();
  const text = ui.text();

  expect(text).toContain('Site A');
  expect(text).not.toContain('Site B');

  await ui.done();
});

test('the footer still renders before the reply arrives', async () => {
  /*
   * It is on every page, so the first paint of the whole site happens with
   * this answer outstanding. The bottom bar is the part that must survive:
   * the copyright line is there whether or not the document ever lands.
   */
  mockState.doc = null;

  const ui = await mount();

  expect(ui.text()).toContain(String(new Date().getFullYear()));

  await ui.done();
});
