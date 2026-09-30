/*
 * THE DESKTOP MENU AND THE PHONE MENU ARE THE SAME MENU - checked where it
 * counts, in what each of them DRAWS.
 *
 * They were two components reading two lists, and they drifted: the phone's
 * Eshop opened onto the member's Eshop pages while the desktop's left the
 * site; the phone said "Dashboard" and "My Articles" where the desktop's
 * account dropdown said "Overview" and "Blog", and the desktop sidebar hid
 * "Dashboard" inside a section that had to be opened. Nothing failed.
 *
 * Both now read one list (siteNav.SITE_NAV, accountNav.ACCOUNT_MENU), and
 * this file is what keeps it that way. It does not trust that they do: it
 * mounts the real header - bar, panel and phone sheet - and the real account
 * sidebar, READS the entries, their order, their words and where each one
 * leads out of the DOM, and holds each menu to the other and both to the
 * list. A renderer that skips an entry, reorders one, relabels one or points
 * one somewhere else fails here, whichever of the two it is.
 *
 * And the desktop panel is operable without a mouse: that is at the bottom.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ChakraProvider } from '@chakra-ui/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';

import theme from '@/theme';
import { I18nProvider } from '@/i18n';
import auth from '@/app/authSlice';
import catalog from '@/app/catalogSlice';
import compare from '@/app/compareSlice';
import notices from '@/app/noticeSlice';
import Header from '@/components/layout/Header';
import AccountLayout from '@/components/account/AccountLayout';
import { branchLinks, PHONE_BRANCHES, SITE_BAR, SITE_BRANCHES, SITE_PHONE } from '@/components/layout/siteNav';
import { ACCOUNT_MENU, hrefOf } from '@/components/account/accountNav';

jest.mock('@/api', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => new Proxy({}, { get: () => () => Promise.resolve({ data: [] }) }) }),
  fileUrl: (p) => p || ''
}));

const MEMBER = { id: 1, login: 'demo.crystal', nickname: 'Crystal demo' };

function store(signedIn) {
  return configureStore({
    reducer: { auth, catalog, compare, notices },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
    preloadedState: {
      auth: signedIn
        ? { user: MEMBER, wallet: null, status: 'authenticated', error: null }
        : { user: null, wallet: null, status: 'anonymous', error: null },
      notices: { items: [], status: 'ready', silenced: false, seen: [] }
    }
  });
}

async function mount({ signedIn, at, account }) {
  const host = document.createElement('div');
  document.body.appendChild(host);

  await act(async () => {
    ReactDOM.render(
      <ChakraProvider theme={theme}>
        <I18nProvider>
          <Provider store={store(signedIn)}>
            <MemoryRouter initialEntries={[at || '/']}>
              <Header />
              {account && <AccountLayout><div /></AccountLayout>}
            </MemoryRouter>
          </Provider>
        </I18nProvider>
      </ChakraProvider>,
      host
    );
  });

  return host;
}

let errored;

beforeEach(() => {
  /* Chakra warns about a MenuList with no layout under jsdom; not what is tested here. */
  errored = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errored.mockRestore();
  document.body.innerHTML = '';
});

const text = (element) => element.textContent.replace(/\s+/g, ' ').trim();

/** What a link or a row leads to, as a reader would see it. */
function target(element) {
  if (element.tagName !== 'A') return { label: text(element), opens: true };
  const out = { label: text(element), href: element.getAttribute('href') };
  if (element.getAttribute('target') === '_blank') out.external = true;
  return out;
}

async function click(element, detail) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: detail === undefined ? 1 : detail }));
  });
}

async function key(element, name) {
  await act(async () => {
    element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: name }));
  });
}

/** The rows of a list, the way the phone sheet draws them: links and buttons, in order. */
function rows(stack) {
  return Array.prototype.filter.call(stack.children, (child) => child.tagName === 'A' || child.tagName === 'BUTTON');
}

/* ------------------------------------------------------------------------ */
/*  reading the two site menus                                              */
/* ------------------------------------------------------------------------ */

const desktop = {
  bar(host) {
    return Array.prototype.map.call(
      host.querySelectorAll('nav[aria-label="Main menu"] > ul > li'),
      (item) => target(item.firstElementChild)
    );
  },
  columns(host) {
    return Array.prototype.map.call(host.querySelectorAll('#site-menu-panel [data-menu-column]'), (column) => ({
      key: column.getAttribute('data-menu-column'),
      label: text(column.querySelector('[id]')),
      links: Array.prototype.map.call(column.querySelectorAll('li > a'), target)
    }));
  }
};

const phone = {
  sheet: (host) => host.querySelector('#site-mobile-nav'),
  root(host) {
    return rows(phone.sheet(host).querySelector('[data-level="root"] .chakra-stack'));
  },
  branch(host) {
    const level = phone.sheet(host).querySelector('[data-level="branch"]');
    return {
      title: text(level.querySelector('button')),
      rows: rows(level.querySelector('.chakra-stack')).map(target)
    };
  },
  /**
   * Opens every branch row in turn and reads what it holds. The first row is
   * not a branch - it is the account row, or "Main menu" on the account list -
   * so it is skipped rather than pressed.
   */
  async branches(host) {
    const out = [];
    const openers = () => phone.root(host).slice(1).filter((row) => row.tagName === 'BUTTON');
    const count = openers().length;

    for (let i = 0; i < count; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await click(openers()[i]);
      const seen = phone.branch(host);
      out.push({ label: seen.title, links: seen.rows });
    }
    return out;
  }
};

/** The list, as a reader would see it drawn in English. */
const expected = {
  entry: (entry) => (entry.links
    ? { label: entry.label, opens: true }
    /* A leaf goes to a page here (`to`) or to a store (`href`). */
    : { label: entry.label, href: entry.to || entry.href }),
  link: (link) => ({ label: link.label, href: link.external ? link.href : link.to }),
  /* branchLinks, not entry.links: the section's own page is a row of its column. */
  branch: (entry) => ({ label: entry.label, links: branchLinks(entry).map(expected.link) })
};

describe.each([['signed out', false], ['signed in', true]])('the site menu, %s', (ignored, signedIn) => {
  test('the desktop bar and the phone list the same entries, in the same order, with the same words', async () => {
    const host = await mount({ signedIn });

    /* The phone's first row is the account row - "who is looking" - then the list. */
    const phoneRows = phone.root(host).map(target);
    expect(phoneRows[0].label).toBe(signedIn ? MEMBER.nickname : 'Sign in / Sign up');
    const phoneEntries = phoneRows.slice(1);

    expect(phoneEntries).toEqual(SITE_PHONE.map(expected.entry));

    /*
     * THE TWO MENUS ARE THE SAME LIST, READ THROUGH TWO FLAGS. The bar is
     * every entry but those marked `bar: false`, the sheet is every entry
     * but those marked `phone: false` - so what is on both has to match,
     * and what is on one is what siteNav says is on one.
     */
    expect(desktop.bar(host)).toEqual(SITE_BAR.map(expected.entry));

    const onlyOnThePhone = SITE_PHONE.filter((entry) => SITE_BAR.indexOf(entry) === -1);
    expect(phoneEntries.filter((row) => !desktop.bar(host).some((heading) => heading.label === row.label)))
      .toEqual(onlyOnThePhone.map(expected.entry));
  });

  test('every branch holds the same links on the desktop as on the phone', async () => {
    const host = await mount({ signedIn });

    const onDesktop = desktop.columns(host);
    const onPhone = await phone.branches(host);

    expect(onDesktop.map((column) => column.key)).toEqual(SITE_BRANCHES.map((entry) => entry.key));
    expect(onPhone).toEqual(PHONE_BRANCHES.map(expected.branch));

    /* Every branch the phone drills into holds exactly the panel's column. */
    const panelOf = (key) => onDesktop.filter((column) => column.key === key)[0];
    PHONE_BRANCHES.forEach((entry, index) => {
      expect(onPhone[index]).toEqual({ label: panelOf(entry.key).label, links: panelOf(entry.key).links });
    });

    /*
     * The cases that were asked about, said out loud.
     *
     * NEITHER STORE OPENS: each is one link, to the store, in the bar and
     * on the phone. The member's own Eshop and Appstore pages are in the
     * account menu and are not repeated here.
     *
     * SHOP IS A COLUMN IN THE PANEL, holding those two links, and it is
     * not a row on the phone - where the stores are already rows.
     */
    expect(onDesktop.map((column) => column.key)).not.toContain('eshop');
    expect(onDesktop.map((column) => column.key)).not.toContain('appstore');

    const shop = onDesktop.filter((column) => column.key === 'shop')[0];
    expect(shop.links.map((link) => link.label)).toEqual(['Eshop', 'Appstore']);
    expect(onPhone.map((branch) => branch.label)).not.toContain('Shop');
    expect(onPhone.map((branch) => branch.label)).not.toContain('Support');
  });

  /*
   * NO SECOND TAB, ANYWHERE.
   *
   * The Eshop and the Appstore are Crystal's own shops, so they are followed
   * in place like any other row: a new tab leaves the site sitting behind a
   * window somebody has to find and close, and the browser back button -
   * the way out of a shop - does not work in a tab that was just opened.
   * `read` records target="_blank" as `external`, so were one to come back
   * on any surface, the parity expectations above would fail with it.
   */
  test('a store is followed in place, on every surface', async () => {
    const host = await mount({ signedIn: false });

    const stores = Array.prototype.filter.call(host.querySelectorAll('a[href]'), (link) => (
      /eshop\.crystal\.example|appstore\.crystal\.example/.test(link.getAttribute('href'))
    ));

    /* The bar, the panel column and the phone sheet all draw them. */
    expect(stores.length).toBeGreaterThan(0);
    expect(stores.map((link) => link.getAttribute('target')).filter(Boolean)).toEqual([]);
  });
});

/* ------------------------------------------------------------------------ */
/*  the account menu                                                        */
/* ------------------------------------------------------------------------ */

const sidebar = {
  nav: (host) => host.querySelector('nav[aria-label="My account"]'),
  rows(host) {
    return Array.prototype.map.call(sidebar.nav(host).children, (row) => target(row.firstElementChild));
  },
  async branches(host) {
    const out = [];
    const count = sidebar.nav(host).querySelectorAll(':scope > div > button').length;

    for (let i = 0; i < count; i += 1) {
      const heading = sidebar.nav(host).querySelectorAll(':scope > div > button')[i];
      /* The accordion: open this one if it is not the one already open. */
      if (heading.getAttribute('aria-expanded') !== 'true') {
        // eslint-disable-next-line no-await-in-loop
        await click(heading);
      }
      out.push({
        label: text(heading),
        links: Array.prototype.map.call(heading.parentNode.querySelectorAll('a'), target)
      });
    }
    return out;
  }
};

/** The account list, as a reader would see it drawn in English. */
const account = {
  row: (entry) => (entry.links ? { label: entry.label, opens: true } : { label: entry.label, href: entry.href }),
  branch: (entry) => ({ label: entry.label, links: entry.links.map((item) => ({ label: item.label, href: hrefOf(item) })) })
};

test('the account menu is the same rows on the phone, in the desktop sidebar and in the header dropdown', async () => {
  const host = await mount({ signedIn: true, at: '/account/eshop/card', account: true });

  /* The phone: its account row switches the sheet to the account list. */
  await click(phone.root(host)[0]);
  const phoneRows = phone.root(host).map(target);
  expect(phoneRows[0].label).toBe('Main menu');
  expect(phoneRows.slice(1)).toEqual(ACCOUNT_MENU.map(account.row));

  /* The sidebar: a group of one is a link, not a section to open. */
  expect(sidebar.rows(host)).toEqual(ACCOUNT_MENU.map(account.row));

  /* The header dropdown: the same rows and words; a branch goes to its first page. */
  const button = Array.prototype.filter.call(host.querySelectorAll('button'), (el) => text(el) === MEMBER.nickname)[0];
  await click(button);
  const items = Array.prototype.map.call(host.querySelectorAll('[role="menuitem"]'), (item) => ({
    label: text(item),
    href: item.getAttribute('href')
  }));
  expect(items.filter((item) => item.href)).toEqual(ACCOUNT_MENU.map((entry) => ({ label: entry.label, href: entry.href })));
});

test('every account branch opens onto the same pages on the phone and in the sidebar', async () => {
  const host = await mount({ signedIn: true, at: '/account', account: true });

  await click(phone.root(host)[0]);
  const onPhone = await phone.branches(host);
  const inSidebar = await sidebar.branches(host);

  const branches = ACCOUNT_MENU.filter((entry) => entry.links).map(account.branch);
  expect(onPhone).toEqual(branches);
  expect(inSidebar).toEqual(branches);
});

/* ------------------------------------------------------------------------ */
/*  the desktop panel, from the keyboard                                    */
/* ------------------------------------------------------------------------ */

describe('a desktop heading with links under it', () => {
  const heading = (host, label) => Array.prototype.filter.call(
    host.querySelectorAll('nav[aria-label="Main menu"] button'),
    (el) => text(el) === label
  )[0];
  const panel = (host) => host.querySelector('#site-menu-panel');

  test('is a button that says whether it is open, and which panel it opens', async () => {
    const host = await mount({ signedIn: false });
    const opener = heading(host, 'Smartphones');

    expect(opener.getAttribute('type')).toBe('button');
    expect(opener.getAttribute('aria-expanded')).toBe('false');
    expect(opener.getAttribute('aria-controls')).toBe('site-menu-panel');
    expect(panel(host).getAttribute('aria-hidden')).toBe('true');
    /* Closed is hidden, not only transparent: nothing in it is in the tab order. */
    expect(window.getComputedStyle(panel(host)).visibility).toBe('hidden');
  });

  test('opens from Enter or Space, puts focus in its own column, and Escape hands focus back', async () => {
    const host = await mount({ signedIn: false });
    const opener = heading(host, 'Smartphones');
    opener.focus();

    /* A <button> turns Enter and Space into a click with detail 0. */
    await click(opener, 0);

    expect(opener.getAttribute('aria-expanded')).toBe('true');
    expect(panel(host).getAttribute('aria-hidden')).toBe('false');
    expect(window.getComputedStyle(panel(host)).visibility).toBe('visible');
    /*
     * AND IT BECOMES VISIBLE AT ONCE. jsdom runs no transitions, so the focus
     * below lands here whatever the stylesheet says - in Chrome it did not:
     * a hidden-to-visible transition is still hidden on its first frame, which
     * is the frame focus moves in, and the link refused it. This is the line
     * that stands for the browser.
     */
    expect(window.getComputedStyle(panel(host)).transition).toMatch(/visibility 0s/);
    expect(text(document.activeElement)).toBe('Overview');
    expect(document.activeElement.closest('[data-menu-column]').getAttribute('data-menu-column')).toBe('smartphones');

    await key(document.activeElement, 'Escape');

    expect(opener.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(opener);
  });

  test('opens on a mouse click and stays, and a second click closes it', async () => {
    const host = await mount({ signedIn: false });
    const appstore = heading(host, 'Eproducts');

    await click(appstore, 1);
    expect(appstore.getAttribute('aria-expanded')).toBe('true');
    /* A mouse click does not move focus into the panel. */
    expect(panel(host).contains(document.activeElement)).toBe(false);

    /* The pointer leaving does not close a panel that was clicked open. */
    await act(async () => {
      host.querySelector('header').dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    expect(appstore.getAttribute('aria-expanded')).toBe('true');

    await click(appstore, 1);
    expect(appstore.getAttribute('aria-expanded')).toBe('false');
  });

  test('Arrow Down opens it and goes into the column', async () => {
    const host = await mount({ signedIn: false });
    const smartphones = heading(host, 'Smartphones');
    smartphones.focus();

    await key(smartphones, 'ArrowDown');

    expect(smartphones.getAttribute('aria-expanded')).toBe('true');
    expect(text(document.activeElement)).toBe('Overview');
  });

  test('only one heading is open at a time', async () => {
    const host = await mount({ signedIn: false });

    await click(heading(host, 'Smartphones'), 1);
    await click(heading(host, 'Eproducts'), 1);

    const open = Array.prototype.filter.call(
      host.querySelectorAll('nav[aria-label="Main menu"] button'),
      (el) => el.getAttribute('aria-expanded') === 'true'
    ).map(text);
    expect(open).toEqual(['Eproducts']);
  });
});
