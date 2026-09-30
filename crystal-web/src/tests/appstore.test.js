/*
 * THE APPSTORE PAGES, WITH DATA IN THEM.
 *
 * pages.test.js mounts every route against an empty reply, which reaches none
 * of the markup below. What is held here is the handful of facts that are
 * easy to get wrong and silent when wrong:
 *
 *   A PURCHASE IS NOT ALWAYS AN APP. The store sells five things and each
 *   names itself in a different field; an avatar names itself in none of
 *   them, and a blank cell reads as data that failed to load.
 *
 *   THE KEY BUTTON IS OFFERED ONLY WHERE THERE IS A KEY. A button that
 *   answers "there is no licence" is a button that lied.
 *
 *   A COMMENT SAYS WHETHER IT IS APPROVED. A member whose comment is waiting
 *   is otherwise shown it as though it were live.
 *
 *   EVERY PAGE OPENS ON THIS MONTH, as the vendor's do, and the first request
 *   already carries it - with an empty state that says a filter is why.
 *
 *   THE LICENCE IS THE VENDOR'S TWO SCREENS: the QR and a way to save it when
 *   the store has one, the key and a way to copy it when it does not.
 *
 * Rows arrive through the API mock rather than by stubbing useList - see the
 * note in eshop.test.js for why replacing the hook does not work here.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';

import theme from '../theme';
import { I18nProvider } from '../i18n';
import { toISODate } from '../components/common/DatePicker';
import {
  AppstoreComments,
  AppstoreFavourites,
  AppstorePurchases,
  AppstoreWallet,
  thisMonth
} from '../pages/account/storefront/Appstore';

const mockState = {
  purchases: [], comments: [], favourites: [], transactions: [], licence: null, asked: [],
  /* Rows for a request, when a test needs the answer to depend on the question. */
  purchasesFor: null,
  /* Every licence asked for, and a way to make the next one fail. */
  licenceAsked: [], licenceFails: null
};

jest.mock('../api', () => {
  const page = (rows) => Promise.resolve({
    data: { rows: rows, total: rows.length, page: 1, limit: 12, summary: { linked: true } }
  });

  return {
    __esModule: true,
    default: {
      account: {
        /*
         * EVERY LIST KEEPS ITS PARAMS. What a filter control does is send a
         * different request; whether the rows on screen changed afterwards is
         * the mock's business, not the page's, so the params are the only
         * thing worth asserting on.
         */
        appstorePurchases: (params) => {
          mockState.asked.push(params);
          return page(mockState.purchasesFor ? mockState.purchasesFor(params) : mockState.purchases);
        },
        appstoreComments: (params) => {
          mockState.asked.push(params);
          return page(mockState.comments);
        },
        appstoreFavourites: (params) => {
          mockState.asked.push(params);
          return page(mockState.favourites);
        },
        appstoreTransactions: (params) => {
          mockState.asked.push(params);
          return page(mockState.transactions);
        },
        appstoreBalance: () => Promise.resolve({ data: { coins: 120, native_score: 3400, foreign_score: 12, linked: true } }),
        appstoreLicense: (id) => {
          mockState.licenceAsked.push(id);
          if (mockState.licenceFails) return Promise.reject(new Error(mockState.licenceFails));
          return Promise.resolve({ data: mockState.licence });
        }
      }
    },
    fileUrl: (p) => p || ''
  };
});

const PURCHASES = [
  {
    id: 'PH1', kind: 'APP', name: 'Crystal Karaoke',
    url: 'https://store.example/app/1', app_version: '2.4.1',
    device_no: 'CR100200300', currency: 'COMPANY', price: 48,
    status: 'PURCHASED', status_reason: null,
    licence_state: 'ISSUED', licence_available: true, at: '2026-09-01 15:00:00'
  },
  {
    /* No name of its own - the store sends none for an avatar. */
    id: 'PH2', kind: 'AVATAR', name: null, url: null, app_version: null,
    device_no: 'CR100200301', currency: 'IMMATERIAL', price: 12,
    status: 'CANCELLED', status_reason: null,
    licence_state: 'NONE', licence_available: false, at: '2026-08-28 10:00:00'
  },
  {
    id: 'PH3', kind: 'DIAMOND', name: '500 diamonds', url: 'https://store.example/others/diamonds',
    app_version: null, device_no: 'CR100200302', currency: 'COMPANY', price: 90,
    status: 'FAILED', status_reason: 'Not enough coins',
    licence_state: 'NONE', licence_available: false, at: '2026-08-20 09:00:00'
  }
];

const COMMENTS = [
  {
    /*
     * THE WHOLE ICON SET, with the two largest sizes missing - which is the
     * ordinary case: the store generates whichever sizes an app supplied, and
     * a small app has only the little ones. Reading one size by name shows a
     * blank tile for every app that lacks that particular one.
     */
    id: 1, app_name: 'Crystal Notes', rating: 5,
    icon_urls: {
      icon_144_144_url: 'https://store.example/icons/1_144.png',
      icon_96_96_url: 'https://store.example/icons/1_96.png',
      icon_48_48_url: 'https://store.example/icons/1_48.png'
    },
    icon_url: 'https://store.example/icons/1_48.png',
    content: 'Exactly what I needed.', approved: true, at: '2026-09-01 09:00:00'
  },
  {
    /* Nothing but the single url the API picks today - it still has to work. */
    id: 2, app_name: 'Crystal Files', icon_url: null, rating: 3,
    content: 'Needs a dark theme.', approved: false, at: '2026-08-30 09:00:00'
  }
];

const FAVOURITES = [
  { id: 'FV1', app_name: 'Crystal Radio', icon_url: null, approved: true, at: '2026-09-02 09:00:00' },
  { id: 'FV2', app_name: 'Crystal Weather', icon_url: null, approved: false, at: '2026-08-11 09:00:00' }
];

const TRANSACTIONS = [
  {
    id: 'AW1', amount: 120, currency: 'COMPANY', currency_id: 1,
    kind: 'TOPUP', kind_id: 1, reference: 'TX9001',
    detail: 'Coin top up', at: '2026-09-01 13:00:00'
  },
  {
    id: 'AW2', amount: -40, currency: 'FOREIGN', currency_id: 2,
    /* A code this build has never heard of; it must not print. */
    kind: null, kind_id: 9, reference: 'TX9002',
    detail: 'Something new', at: '2026-08-29 13:00:00'
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
  mockState.purchases = [];
  mockState.comments = [];
  mockState.favourites = [];
  mockState.transactions = [];
  mockState.licence = null;
  mockState.asked = [];
  mockState.purchasesFor = null;
  mockState.licenceAsked = [];
  mockState.licenceFails = null;
  document.body.innerHTML = '';
});

test('the columns are in the vendor\'s order, on all four tables', async () => {
  /*
   * The order is the requirement rather than a preference, and it is the kind
   * of thing quietly rearranged by whoever next adds a column - nothing else
   * anywhere would complain.
   */
  mockState.purchases = PURCHASES;
  mockState.comments = COMMENTS;
  mockState.favourites = FAVOURITES;
  mockState.transactions = TRANSACTIONS;

  const purchases = await mount(<AppstorePurchases />);
  expect(purchases.headers()).toEqual([
    'No.', 'Type', 'Name', 'Device', 'Paid', 'Bought', 'Status', 'Licence'
  ]);
  await purchases.done();

  const comments = await mount(<AppstoreComments />);
  expect(comments.headers()).toEqual([
    'No.', 'Commented app', 'Rating', 'Comment', 'Posted', 'Status'
  ]);
  await comments.done();

  const favourites = await mount(<AppstoreFavourites />);
  expect(favourites.headers()).toEqual(['No.', 'Image', 'App', 'Saved']);
  await favourites.done();

  const wallet = await mount(<AppstoreWallet />);
  expect(wallet.headers()).toEqual([
    'No.', 'Coins', 'Wallet', 'Transaction type', 'Transaction no.', 'Detail', 'When'
  ]);
  await wallet.done();
});

test('a purchase that is not an app still says what it was', async () => {
  mockState.purchases = PURCHASES;

  const ui = await mount(<AppstorePurchases />);
  const text = ui.text();

  expect(text).toContain('Crystal Karaoke');
  expect(text).toContain('500 diamonds');

  /* And a failure explains itself, in the store's own words. */
  expect(text).toContain('Not enough coins');

  /*
   * THE AVATAR FALLS BACK TO ITS KIND, and the NAME CELL is where that has
   * to be checked. Asserting on the page text passes either way - "Avatar"
   * is already in the Type column of the same row - so an assertion written
   * that way holds nothing, which is how it was written the first time.
   */
  const headers = Array.prototype.map.call(
    ui.host.querySelectorAll('thead th'), (th) => th.textContent
  );
  const nameAt = headers.indexOf('Name');
  expect(nameAt).toBeGreaterThan(-1);

  const rows = Array.prototype.filter.call(
    ui.host.querySelectorAll('tbody tr'),
    (tr) => tr.textContent.indexOf('CR100200301') > -1
  );
  expect(rows.length).toBe(1);
  expect(rows[0].querySelectorAll('td')[nameAt].textContent).toBe('Avatar');

  await ui.done();
});

test('the key is an icon button, named, and offered only where there is a key', async () => {
  /*
   * THE WORD MOVED, IT DID NOT GO. An icon button with no accessible name is
   * a button a screen reader announces as "button", so the label is queried
   * by `aria-label` rather than by text - which is also what proves the name
   * is there at all. It was a text button reading "Show key"; a query for
   * that text now finds nothing, and a test written against the text would
   * have passed for the wrong reason before and failed for the right one now.
   *
   * SCOPED TO THE TABLE. DataTable renders its rows TWICE - once as a table
   * and once as cards for phones, with one of the two hidden by a media
   * query. Counting across the whole tree counts everything twice, which
   * reads as a bug in the page rather than in the query.
   */
  mockState.purchases = PURCHASES;

  const ui = await mount(<AppstorePurchases />);

  const buttons = ui.host.querySelectorAll('tbody button[aria-label="Show key"]');

  /* One of the three: the other two are cancelled and failed. */
  expect(buttons.length).toBe(1);

  const row = buttons[0].closest('tr');
  expect(row.textContent).toContain('Crystal Karaoke');

  /* And the glyph replaced the word rather than sitting beside it. */
  expect(buttons[0].textContent).toBe('');

  await ui.done();
});

test('the purchase state comes off the purchase, and a failure says why', async () => {
  /*
   * `spd_state_id` ANSWERS TWO QUESTIONS and this column is the first one.
   * The page used to read only the licence half of that number, so the status
   * column was describing the key rather than the purchase.
   *
   * Read positionally, because "Cancelled" and "Failed" are ordinary enough
   * words to appear somewhere else on a page by accident.
   */
  mockState.purchases = PURCHASES;

  const ui = await mount(<AppstorePurchases />);

  const headers = ui.headers();
  const at = headers.indexOf('Status');
  const licenceAt = headers.indexOf('Licence');
  expect(at).toBeGreaterThan(-1);

  const rows = ui.host.querySelectorAll('tbody tr');

  /* A word out of the catalogue, not the code lower-cased. */
  expect(rows[0].querySelectorAll('td')[at].textContent).toBe('Purchased');
  expect(rows[1].querySelectorAll('td')[at].textContent).toBe('Cancelled');

  /* A failure explains itself, in the store's own words, under the badge. */
  const failed = rows[2].querySelectorAll('td')[at].textContent;
  expect(failed).toContain('Failed');
  expect(failed).toContain('Not enough coins');

  /* And the licence column is a separate reading of the same number. */
  expect(rows[0].querySelectorAll('td')[licenceAt].textContent).toContain('Issued');

  await ui.done();
});

test('the store lists send the period and the search rather than filtering rows', async () => {
  /*
   * THE STORE DOES THE FILTERING. Its endpoints have always taken a window
   * and a search term and the API has always forwarded them - the web simply
   * never sent any of the three, so a member with two years of purchases
   * could only page through them.
   *
   * It has to be server-side: the table holds one page, and filtering twelve
   * of two hundred rows would quietly answer a different question than the
   * one the control asks.
   */
  mockState.purchases = PURCHASES;

  const ui = await mount(<AppstorePurchases />);

  /* The window opens on THIS MONTH, the vendor's default, and asks for it. */
  const month = thisMonth();
  expect(mockState.asked.length).toBe(1);
  expect(mockState.asked[0].from).toBe(month.from);
  expect(mockState.asked[0].to).toBe(month.to);
  expect(mockState.asked[0].q).toBe(undefined);

  /* Two pickers - the site's own, not the browser's <input type="date">. */
  expect(ui.host.querySelectorAll('input[type="date"]').length).toBe(0);
  const pickers = ui.host.querySelectorAll('button[aria-haspopup="dialog"]');
  expect(pickers.length).toBe(2);
  /* And a search box, which the wallet deliberately does not get - see below. */
  expect(ui.host.querySelectorAll('input[aria-label="Search this list…"]').length).toBe(1);

  /*
   * THE PERIOD IS MOVED WITH THE PICKER: open "From", step back one day from
   * the 1st - the last day of last month - and pick it. The request is what
   * is asserted; the picker's own behaviour is datePicker.test.js's.
   */
  await act(async () => { pickers[0].click(); });
  await act(async () => {
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  });
  const first = new Date();
  const lastMonthEnd = toISODate(new Date(first.getFullYear(), first.getMonth(), 0));
  expect(document.activeElement.getAttribute('data-date')).toBe(lastMonthEnd);
  await act(async () => { document.activeElement.click(); });

  const last = mockState.asked[mockState.asked.length - 1];
  expect(last.from).toBe(lastMonthEnd);
  expect(last.to).toBe(month.to);
  /* A filter change goes back to page one - page 7 of a now two-page result
     set is an empty table. */
  expect(last.page).toBe(1);

  await ui.done();
});

test('the wallet offers a period and a type, and no search box', async () => {
  /*
   * NOT AN OMISSION. The wallet's endpoint takes a window and a transaction
   * type and no search term - the vendor's wallet screen offers the same two
   * - and a box that changed nothing would be worse than no box at all.
   */
  mockState.transactions = TRANSACTIONS;

  const ui = await mount(<AppstoreWallet />);

  expect(ui.host.querySelectorAll('button[aria-haspopup="dialog"]').length).toBe(2);
  expect(ui.host.querySelectorAll('input[aria-label="Search this list…"]').length).toBe(0);

  await ui.done();
});

test('a comment icon takes the largest size the store actually sent', async () => {
  /*
   * An app's icon record carries up to six sizes and fills in whichever ones
   * were generated. Reading one by name - the API reads the 48 - shows a
   * blank tile for every app that does not have that particular size, and a
   * 48 stretched into the tile is soft on a retina screen when a 144 was
   * sitting right there. So: largest present wins.
   */
  mockState.comments = COMMENTS;

  const ui = await mount(<AppstoreComments />);

  const images = ui.host.querySelectorAll('tbody img');
  expect(images.length).toBe(1);
  expect(images[0].getAttribute('src')).toBe('https://store.example/icons/1_144.png');

  await ui.done();
});

test('a comment that is waiting for approval says so', async () => {
  mockState.comments = COMMENTS;

  const ui = await mount(<AppstoreComments />);

  const rows = Array.prototype.filter.call(
    ui.host.querySelectorAll('tbody tr'),
    (tr) => tr.textContent.indexOf('Needs a dark theme') > -1
  );
  expect(rows.length).toBe(1);
  /* A word out of the catalogue - it was the badge's own code lower-cased,
     which is English on a Chinese page. */
  expect(rows[0].textContent).toContain('Waiting for approval');

  const live = Array.prototype.filter.call(
    ui.host.querySelectorAll('tbody tr'),
    (tr) => tr.textContent.indexOf('Exactly what I needed') > -1
  );
  expect(live[0].textContent).toContain('Approved');

  await ui.done();
});

test('the wallet asks the server to filter, and names what it can', async () => {
  mockState.transactions = TRANSACTIONS;

  const ui = await mount(<AppstoreWallet />);

  /* The type reaches the request rather than being applied to the rows. */
  expect(mockState.asked.length).toBeGreaterThan(0);
  expect(mockState.asked[0].type).toBe(0);

  const text = ui.text();
  expect(text).toContain('Top-up');
  expect(text).toContain('Company coins');
  expect(text).toContain('Foreign currency');

  /* The unknown code prints nothing rather than itself. */
  expect(text).toContain('Something new');
  expect(text).not.toContain('TRANSFER_OUT');

  await ui.done();
});

/* ------------------------------------------------------------------ */
/*  the opening period                                                 */
/* ------------------------------------------------------------------ */

test('every Appstore page opens on this month, and its first request says so', async () => {
  /*
   * The vendor opens all four on `firstDateOfMonth(moment())` to `moment()`.
   * Asserted on the REQUEST, not on the pickers: a picker showing the month
   * while the list was fetched unfiltered is the bug this would otherwise
   * let through.
   */
  const month = thisMonth();
  expect(month.from.slice(8)).toBe('01');
  expect(month.to).toBe(toISODate(new Date()));

  const pages = [AppstorePurchases, AppstoreComments, AppstoreFavourites, AppstoreWallet];

  for (let i = 0; i < pages.length; i += 1) {
    const Page = pages[i];
    mockState.asked = [];

    /* eslint-disable no-await-in-loop */
    const ui = await mount(<Page />);
    expect(mockState.asked[0].from).toBe(month.from);
    expect(mockState.asked[0].to).toBe(month.to);
    await ui.done();
    /* eslint-enable no-await-in-loop */
  }
});

/* ------------------------------------------------------------------ */
/*  the search box                                                     */
/* ------------------------------------------------------------------ */

const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

/**
 * Typing, as React hears it. React 16 drops a change event whose value
 * matches what its tracker last saw, so the native setter has to move the
 * tracker too - `input.value = x` alone updates the DOM and React never knows.
 */
async function type(input, text) {
  await act(async () => {
    setValue.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function wait(ms) {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
}

function searchBox(ui) {
  return ui.host.querySelector('input[aria-label="Search this list…"]');
}

test('Enter searches at once, as the vendor\'s box does', async () => {
  mockState.purchases = PURCHASES;
  const ui = await mount(<AppstorePurchases />);

  await type(searchBox(ui), '  karaoke ');
  await act(async () => {
    searchBox(ui).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });

  /* No 350ms wait - and trimmed, because the store matches a term as written. */
  const last = mockState.asked[mockState.asked.length - 1];
  expect(last.q).toBe('karaoke');
  expect(last.page).toBe(1);

  /* The debounce catching up afterwards does not send it a second time. */
  const count = mockState.asked.length;
  await wait(450);
  expect(mockState.asked.length).toBe(count);

  await ui.done();
});

test('nothing is sent while a Chinese word is still being composed', async () => {
  /*
   * During IME composition the box holds pinyin on its way to characters.
   * Searching for "kala" empties the table under the member several times
   * per word; the finished word is what should be sent, once.
   */
  mockState.purchases = PURCHASES;
  const ui = await mount(<AppstorePurchases />);
  const box = searchBox(ui);

  await act(async () => { box.dispatchEvent(new Event('compositionstart', { bubbles: true })); });
  await type(box, 'kala');
  await wait(450);

  expect(mockState.asked.some((params) => params.q === 'kala')).toBe(false);

  await type(box, '卡拉');
  await act(async () => { box.dispatchEvent(new Event('compositionend', { bubbles: true })); });
  await wait(450);

  expect(mockState.asked[mockState.asked.length - 1].q).toBe('卡拉');

  await ui.done();
});

test('an empty search says why it is empty, and one press clears it', async () => {
  /*
   * "No purchases yet" to a member whose purchases were merely filtered out
   * is the sentence that made the search look broken. A filtered empty names
   * the term and offers the way back - which clears the box as well.
   */
  mockState.purchasesFor = (params) => (params.q ? [] : PURCHASES);
  const ui = await mount(<AppstorePurchases />);

  await type(searchBox(ui), 'zzz');
  await act(async () => {
    searchBox(ui).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });

  expect(ui.text()).toContain('Nothing matches “zzz”');
  expect(ui.text()).not.toContain('No purchases yet');

  const clear = Array.prototype.filter.call(
    ui.host.querySelectorAll('button'), (button) => button.textContent === 'Clear the filters'
  );
  expect(clear.length).toBeGreaterThan(0);
  await act(async () => { clear[0].click(); });

  const last = mockState.asked[mockState.asked.length - 1];
  expect(last.q).toBe(undefined);
  expect(last.from).toBe(undefined);
  expect(last.to).toBe(undefined);
  expect(searchBox(ui).value).toBe('');

  /* And the old word does not come back when the debounce catches up. */
  await wait(450);
  expect(mockState.asked[mockState.asked.length - 1].q).toBe(undefined);

  await ui.done();
});

test('the × in the box clears the search', async () => {
  mockState.purchases = PURCHASES;
  const ui = await mount(<AppstorePurchases />);

  await type(searchBox(ui), 'karaoke');
  await wait(450);
  expect(mockState.asked[mockState.asked.length - 1].q).toBe('karaoke');

  await act(async () => { ui.host.querySelector('button[aria-label="Clear the search"]').click(); });
  expect(mockState.asked[mockState.asked.length - 1].q).toBe(undefined);
  expect(searchBox(ui).value).toBe('');

  await ui.done();
});

test('a period with nothing in it says so, rather than "no purchases yet"', async () => {
  mockState.purchases = [];
  const ui = await mount(<AppstorePurchases />);

  expect(ui.text()).toContain('Nothing in this period');

  const all = Array.prototype.filter.call(
    ui.host.querySelectorAll('button'), (button) => button.textContent === 'Show every date'
  );
  await act(async () => { all[0].click(); });

  const last = mockState.asked[mockState.asked.length - 1];
  expect(last.from).toBe(undefined);
  expect(last.to).toBe(undefined);

  /* Unfiltered and still empty: now it really is "no purchases yet". */
  expect(ui.text()).toContain('No purchases yet');

  await ui.done();
});

/* ------------------------------------------------------------------ */
/*  the licence states                                                 */
/* ------------------------------------------------------------------ */

test('every licence state the store sends has a word, and an unknown one is said so', async () => {
  /*
   * The store's seven (vendor APPSTORE_LICENSE_STATES). Six of them used to
   * fall through to the badge's last resort - the code lower-cased - which
   * printed "success" in English on a Chinese page.
   */
  const states = {
    SUCCESS: 'Issued',
    UNUSED: 'Not activated yet',
    USED: 'Activated',
    FAIL: 'Failed',
    REFUND: 'Refunded',
    PENDING: 'Pending',
    ACCEPT_PENDING: 'Awaiting acceptance',
    SOMETHING_NEW: 'Unknown state'
  };

  mockState.purchases = Object.keys(states).map((code, index) => Object.assign({}, PURCHASES[0], {
    id: 'PHS' + index, licence_state: code, licence_available: false
  }));

  const ui = await mount(<AppstorePurchases />);
  const at = ui.headers().indexOf('Licence');
  const rows = ui.host.querySelectorAll('tbody tr');

  Object.keys(states).forEach((code, index) => {
    expect(rows[index].querySelectorAll('td')[at].textContent).toBe(states[code]);
  });

  /* The unknown code is still there for whoever reads it out to support. */
  expect(rows[7].querySelector('td:nth-child(' + (at + 1) + ') [title]').getAttribute('title')).toBe('SOMETHING_NEW');

  await ui.done();
});

/* ------------------------------------------------------------------ */
/*  the licence itself                                                 */
/* ------------------------------------------------------------------ */

async function openLicence(ui) {
  const button = ui.host.querySelector('tbody button[aria-label="Show key"]');
  await act(async () => { button.click(); });
  await wait(20);
  return document.body.querySelector('[data-licence-state]');
}

test('a licence with a QR shows the code and saves the picture', async () => {
  mockState.purchases = PURCHASES;
  mockState.licence = {
    state: 'SUCCESS', purchase_state: 'PURCHASED',
    licence: 'CR-1111-2222-3333-4444',
    qr: '/9j/4AAQSkZJRg', qr_type: 'image/jpeg',
    download_url: null
  };

  const ui = await mount(<AppstorePurchases />);
  const drawer = await openLicence(ui);

  expect(mockState.licenceAsked).toEqual(['PH1']);
  expect(drawer.getAttribute('data-licence-state')).toBe('ready');

  const image = drawer.querySelector('img[data-licence-qr]');
  expect(image.getAttribute('src')).toBe('data:image/jpeg;base64,/9j/4AAQSkZJRg');
  expect(image.getAttribute('alt')).toBe('QR code for this licence');

  /* Saved from the bytes on screen, under a name that says what it is. */
  const save = drawer.querySelector('a[download]');
  expect(save.getAttribute('download')).toBe('licence-PH1.jpg');
  expect(save.getAttribute('href')).toBe(image.getAttribute('src'));
  expect(save.textContent).toContain('Save the QR image');

  /* The vendor's order: with a QR, the QR - not the key as well. */
  expect(drawer.querySelector('[data-licence-key]')).toBe(null);

  await ui.done();
});

test('a licence without a QR shows the key, and copies it', async () => {
  mockState.purchases = PURCHASES;
  mockState.licence = {
    state: 'SUCCESS', purchase_state: 'PURCHASED',
    licence: 'CR-5250-6869-8488-6155',
    qr: null, qr_type: null, download_url: null
  };

  /* jsdom has no clipboard; what matters is that a copy was asked for. */
  const execCommand = document.execCommand;
  document.execCommand = jest.fn(() => true);

  const ui = await mount(<AppstorePurchases />);
  const drawer = await openLicence(ui);

  expect(drawer.querySelector('img[data-licence-qr]')).toBe(null);
  expect(drawer.querySelector('[data-licence-key]').textContent).toBe('CR-5250-6869-8488-6155');

  const copy = Array.prototype.filter.call(
    drawer.querySelectorAll('button'), (button) => button.textContent === 'Copy the key'
  );
  expect(copy.length).toBe(1);
  await act(async () => { copy[0].click(); });

  expect(document.execCommand).toHaveBeenCalledWith('copy');
  /* Said, not only shown: the word on a button changing is not announced. */
  expect(drawer.querySelector('[role="status"]').textContent).toBe('Copied to the clipboard');

  document.execCommand = execCommand;
  await ui.done();
});

test('a purchase still going through says so, and shows no key', async () => {
  /*
   * The vendor refuses anything but PURCHASED and warns "fail to get
   * license". A purchase that is merely not finished is not a failure.
   */
  mockState.purchases = PURCHASES;
  mockState.licence = {
    state: 'UNUSED', purchase_state: 'PURCHASING',
    licence: 'CR-9159-5016-3397-4302', qr: null, qr_type: null, download_url: null
  };

  const ui = await mount(<AppstorePurchases />);
  const drawer = await openLicence(ui);

  expect(drawer.textContent).toContain('This licence is still being issued');
  expect(drawer.textContent).not.toContain('CR-9159-5016-3397-4302');

  await ui.done();
});

test('a licence that fails to load says so, and tries again', async () => {
  mockState.purchases = PURCHASES;
  mockState.licenceFails = 'The Appstore did not answer';

  const ui = await mount(<AppstorePurchases />);
  const drawer = await openLicence(ui);

  expect(drawer.getAttribute('data-licence-state')).toBe('error');
  expect(drawer.textContent).toContain('The Appstore did not answer');

  mockState.licenceFails = null;
  mockState.licence = {
    state: 'SUCCESS', purchase_state: 'PURCHASED',
    licence: 'CR-1', qr: null, qr_type: null, download_url: null
  };

  const retry = Array.prototype.filter.call(
    drawer.querySelectorAll('button'), (button) => button.textContent === 'Try again'
  );
  await act(async () => { retry[0].click(); });
  await wait(20);

  expect(mockState.licenceAsked).toEqual(['PH1', 'PH1']);
  expect(document.body.querySelector('[data-licence-key]').textContent).toBe('CR-1');

  await ui.done();
});
