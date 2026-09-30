/*
 * THE HIGHLIGHT, DRAWN - not only computed.
 *
 * accountNav.test.js proves findAccountPage names the right entry for every
 * address. This mounts the layout that reads it, at the addresses the points
 * split and the Crystal Points group added, and looks at what a member sees:
 * the one link in the sidebar drawn as the open one, and the heading above
 * the page - which on a phone, where the sidebar is not drawn, is the whole
 * of "you are here".
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';

import theme from '../theme';
import { I18nProvider } from '../i18n';
import AccountLayout from '../components/account/AccountLayout';

jest.mock('react-redux', () => ({
  useSelector: () => ({ login: 'demo.1', nickname: 'Demo' })
}));

async function mount(address) {
  const host = document.createElement('div');
  document.body.appendChild(host);

  await act(async () => {
    ReactDOM.render(
      <ChakraProvider theme={theme}>
        <I18nProvider>
          <MemoryRouter initialEntries={[address]}>
            <AccountLayout><div /></AccountLayout>
          </MemoryRouter>
        </I18nProvider>
      </ChakraProvider>,
      host
    );
  });

  return host;
}

/** The heading, and the href of every sidebar link drawn as the open one. */
function read(host) {
  const heading = host.querySelector('h2');
  const open = Array.prototype.filter.call(host.querySelectorAll('a[href]'), (link) => (
    window.getComputedStyle(link).fontWeight === '700'
  ));

  return {
    heading: heading ? heading.textContent : null,
    open: open.map((link) => link.getAttribute('href'))
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

test.each([
  ['/account/points?source=MEDIA', 'Media'],
  ['/account/points/crystal', 'Point Log'],
  ['/account/points/activity', 'Activity Point Log'],
  ['/account/wallet', 'Wallet'],
  ['/account/wallet/transfer', 'Transfer'],
  ['/account/wallet/charge', 'Charge'],
  ['/account/wallet/password', 'Wallet Password']
])('at %s exactly that entry is open, and the heading is %s', async (address, label) => {
  const host = await mount(address);
  const seen = read(host);

  expect(seen.open).toEqual([address]);
  /*
   * The heading is t(label): English is matched by value, so a label with no
   * catalogue entry yet still reads as itself.
   */
  expect(seen.heading).toBe(label);

  await act(async () => { ReactDOM.unmountComponentAtNode(host); });
});
