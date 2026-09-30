/*
 * THE VERIFIED COMPONENTS, MOUNTED (SPEC §12 and §19, the storefront half).
 *
 * security/verification.test.js proves the checks; this proves the screens
 * obey them. Every component here is mounted under a SecurityProvider whose
 * verifier does REAL verification - Node's crypto behind the WebCrypto
 * interface, envelopes signed with a key made for this run, and a stubbed
 * fetch serving bytes the test controls - and then asked the only question a
 * visitor cares about: what ended up on the screen, and what did not.
 *
 * URL.createObjectURL and revokeObjectURL do not exist in jsdom, so they are
 * installed as spies. That is also how the two ordering promises are held:
 * no object URL before every check has passed, and every one revoked when the
 * picture goes away or is replaced.
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
import HeroCarousel from '@/components/product/HeroCarousel';
import Header from '@/components/layout/Header';
import Notifications from '@/pages/Notifications';
import { createVerifier } from '@/security/verifyContent';
import { parseTrustedKeys } from '@/security/trustedKeys';
import { loadedNoticeSanitizer, loadNoticeSanitizer } from '@/security/sanitizeHtml';
import { SecurityProvider } from '../components/security/SecurityProvider';
import VerifiedProductImage from '../components/security/VerifiedProductImage';
import VerifiedFAQ from '../components/security/VerifiedFAQ';

const { createNodeSubtle } = require('@/security/__testing__/nodeSubtle');
const signer = require('@/security/__testing__/signer');

jest.mock('@/api', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => new Proxy({}, { get: () => () => Promise.resolve({ data: [] }) }) }),
  fileUrl: (p) => p || ''
}));

jest.setTimeout(60000);

const KEY = signer.generateEcdsaKey('components-test-key');
const TRUST = parseTrustedKeys(JSON.stringify([KEY.entry()]));

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = (fill) => Uint8Array.from(PNG_HEADER.concat([0, 0, 0, 13, fill, fill, fill, fill, fill, fill]));

/** A signed image: its path, its bytes and its envelope. */
function signedImage(path, bytes) {
  return { path: path, bytes: bytes, integrity: signer.envelope(KEY, 'image', signer.imageContent(path, 'image/png', bytes)) };
}

/** A file server whose answers can be held back, and which counts every request. */
function server(files) {
  const state = { requests: [], held: null };

  const fetch = (url) => {
    state.requests.push(url);

    const answer = () => {
      const bytes = files[url];
      return bytes
        ? { ok: true, status: 200, arrayBuffer: () => Promise.resolve(new Uint8Array(bytes).buffer) }
        : { ok: false, status: 404 };
    };

    if (!state.held) return Promise.resolve(answer());
    return state.held.then(answer);
  };

  return {
    state: state,
    fetch: fetch,
    hold() {
      let release;
      state.held = new Promise((resolve) => { release = resolve; });
      return () => { state.held = null; release(); };
    }
  };
}

function verifierFor(files) {
  const files_ = server(files);
  const verifier = createVerifier({ trust: TRUST, subtle: createNodeSubtle(), fetch: files_.fetch, resolveUrl: (p) => p });
  return { verifier: verifier, server: files_ };
}

let created;
let revoked;
let counter;
let warned;
let errored;

beforeEach(() => {
  counter = 0;
  created = jest.fn((blob) => {
    counter += 1;
    return 'blob:test/' + counter + '/' + blob.type;
  });
  revoked = jest.fn();
  URL.createObjectURL = created;
  URL.revokeObjectURL = revoked;

  /* The technical reasons go to the console - captured here, and asserted where it matters. */
  warned = jest.spyOn(console, 'warn').mockImplementation(() => {});
  errored = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  warned.mockRestore();
  errored.mockRestore();
  delete URL.createObjectURL;
  delete URL.revokeObjectURL;
  document.body.innerHTML = '';
});

function mount(element, verifier, store) {
  const host = document.createElement('div');
  document.body.appendChild(host);

  const wrap = (child) => (
    <ChakraProvider theme={theme}>
      <I18nProvider>
        <Provider store={store || configureStore({ reducer: { auth, catalog, compare, notices } })}>
          <SecurityProvider verifier={verifier}>
            <MemoryRouter>{child}</MemoryRouter>
          </SecurityProvider>
        </Provider>
      </I18nProvider>
    </ChakraProvider>
  );

  act(() => { ReactDOM.render(wrap(element), host); });

  return {
    host: host,
    rerender(next) { act(() => { ReactDOM.render(wrap(next), host); }); },
    unmount() { act(() => { ReactDOM.unmountComponentAtNode(host); }); }
  };
}

/** Lets the promise chains of real verification run to the end. */
async function settle() {
  for (let i = 0; i < 12; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }
}

const images = (host) => Array.prototype.slice.call(host.querySelectorAll('img'));

/* ------------------------------------------------------------------ images */

describe('a verified product image', () => {
  const front = signedImage('/uploads/products/front.png', png(1));
  const back = signedImage('/uploads/products/back.png', png(2));

  test('creates no object URL until every check has passed', async () => {
    const { verifier, server: files } = verifierFor({ [front.path]: front.bytes });
    const release = files.hold();

    const ui = mount(<VerifiedProductImage integrity={front.integrity} expectedPath={front.path} alt="Front" />, verifier);
    await settle();

    /* The signature has verified and the download is under way - and there is still nothing. */
    expect(files.state.requests).toEqual([front.path]);
    expect(created).not.toHaveBeenCalled();
    expect(images(ui.host)).toEqual([]);

    release();
    await settle();

    expect(created).toHaveBeenCalledTimes(1);
    expect(created.mock.calls[0][0].type).toBe('image/png');
    expect(images(ui.host).map((img) => img.getAttribute('src'))).toEqual([created.mock.results[0].value]);

    ui.unmount();
  });

  test('revokes its object URL when it unmounts', async () => {
    const { verifier } = verifierFor({ [front.path]: front.bytes });
    const ui = mount(<VerifiedProductImage integrity={front.integrity} expectedPath={front.path} />, verifier);
    await settle();

    const url = created.mock.results[0].value;
    expect(revoked).not.toHaveBeenCalled();

    ui.unmount();
    expect(revoked).toHaveBeenCalledWith(url);
  });

  test('revokes the old object URL when its source changes', async () => {
    const { verifier } = verifierFor({ [front.path]: front.bytes, [back.path]: back.bytes });
    const ui = mount(<VerifiedProductImage integrity={front.integrity} expectedPath={front.path} />, verifier);
    await settle();
    const first = created.mock.results[0].value;

    ui.rerender(<VerifiedProductImage integrity={back.integrity} expectedPath={back.path} />);
    expect(revoked).toHaveBeenCalledWith(first);
    /* Not the previous picture under the new envelope, even for a frame. */
    expect(images(ui.host)).toEqual([]);

    await settle();
    expect(created).toHaveBeenCalledTimes(2);
    expect(images(ui.host)[0].getAttribute('src')).toBe(created.mock.results[1].value);

    ui.unmount();
    expect(revoked).toHaveBeenCalledWith(created.mock.results[1].value);
  });

  test('a modified file never becomes an object URL, and shows the neutral placeholder', async () => {
    const tampered = front.bytes.slice();
    tampered[tampered.length - 1] ^= 0xff;

    const { verifier } = verifierFor({ [front.path]: tampered });
    const ui = mount(<VerifiedProductImage integrity={front.integrity} expectedPath={front.path} />, verifier);
    await settle();

    expect(created).not.toHaveBeenCalled();
    expect(images(ui.host)).toEqual([]);
    expect(ui.host.querySelector('[role="img"]')).toBeTruthy();
    /* Nothing technical reaches the page; the console has the reason. */
    expect(ui.host.textContent).not.toMatch(/sha|hash|signature|mismatch/i);
    expect(warned.mock.calls.map((call) => call[0]).join(' | ')).toMatch(/sha256 mismatch/);

    ui.unmount();
  });

  test('an unsigned image is never downloaded at all', async () => {
    const { verifier, server: files } = verifierFor({ [front.path]: front.bytes });
    const ui = mount(<VerifiedProductImage integrity={null} expectedPath={front.path} />, verifier);
    await settle();

    expect(files.state.requests).toEqual([]);
    expect(created).not.toHaveBeenCalled();
    expect(ui.host.querySelector('[role="img"]')).toBeTruthy();
    ui.unmount();
  });
});

describe('a verified carousel', () => {
  const one = signedImage('/uploads/adverts/one.png', png(11));
  const two = signedImage('/uploads/adverts/two.png', png(12));
  const three = signedImage('/uploads/adverts/three.png', png(13));

  const slides = [one, two, three].map((image, index) => ({
    id: index + 1, path: image.path, altText: 'Advert ' + (index + 1), integrity: image.integrity
  }));

  test('shows only the slides that verified, and leaves a failed one out of the deck', async () => {
    const tampered = two.bytes.slice();
    tampered[9] ^= 0x10;

    const { verifier } = verifierFor({ [one.path]: one.bytes, [two.path]: tampered, [three.path]: three.bytes });
    const ui = mount(<HeroCarousel verified slides={slides} autoPlay={false} />, verifier);
    await settle();

    expect(images(ui.host).map((img) => img.getAttribute('alt'))).toEqual(['Advert 1', 'Advert 3']);
    images(ui.host).forEach((img) => expect(img.getAttribute('src')).toMatch(/^blob:test\//));
    /* Two indicators for two slides - the failed one is not a stop in the deck. */
    expect(ui.host.querySelectorAll('[aria-current]').length).toBe(2);

    ui.unmount();
    expect(revoked).toHaveBeenCalledTimes(2);
  });

  test('fetches each slide once, however many layouts show it', async () => {
    const { verifier, server: files } = verifierFor({ [one.path]: one.bytes, [two.path]: two.bytes, [three.path]: three.bytes });

    const ui = mount(
      <>
        <HeroCarousel verified slides={slides} autoPlay={false} />
        <HeroCarousel verified slides={slides} autoPlay={false} />
      </>,
      verifier
    );
    await settle();

    expect(images(ui.host).length).toBe(6);
    expect(files.state.requests.slice().sort()).toEqual([one.path, three.path, two.path].sort());

    ui.unmount();
  });

  test('with nothing verified, the frame shows the neutral placeholder and no picture', async () => {
    const unsigned = slides.map((slide) => Object.assign({}, slide, { integrity: null }));
    const { verifier, server: files } = verifierFor({});

    const ui = mount(<HeroCarousel verified slides={unsigned} />, verifier);
    await settle();

    expect(images(ui.host)).toEqual([]);
    expect(ui.host.querySelector('[role="img"]')).toBeTruthy();
    expect(files.state.requests).toEqual([]);
    ui.unmount();
  });

  test('an unverified carousel (the About page) is unchanged', () => {
    const { verifier, server: files } = verifierFor({});
    const ui = mount(<HeroCarousel slides={[{ id: 1, path: '/about/shop.jpg', alt: 'Shop' }]} />, verifier);

    const src = images(ui.host).map((img) => img.getAttribute('src'));
    expect(src.length).toBe(1);
    /*
     * The plain address, whatever fileUrl makes of it - a path that is not
     * an upload is now left exactly as it came (see fileUrl.test.js), where
     * it used to be given the API's host.
     */
    expect(src[0]).toMatch(/(^|\/)about\/shop\.jpg$/);
    expect(files.state.requests).toEqual([]);
    ui.unmount();
  });
});

/* ------------------------------------------------------------------- text */

const NOTICE = {
  id: 5,
  title: 'Holiday opening hours',
  content: '<p>We open at <strong>ten</strong>.</p><img src="x" onerror="window.__pwned=1"><script>window.__pwned=2</script><a href="javascript:alert(1)">tap</a>',
  originId: 2,
  status: 'PUBLISHED',
  startsAt: '2026-09-01T00:00:00.000Z',
  endsAt: null,
  sortOrder: 5,
  createdAt: '2026-08-30T00:00:00.000Z',
  updatedAt: '2026-08-31T00:00:00.000Z'
};

function noticeRow(content, overrides) {
  return Object.assign({
    id: content.id,
    title: content.title,
    content: content.content,
    origin_id: content.originId,
    origin_name: 'Service',
    origin_colour: '#3366FF',
    starts_at: content.startsAt,
    integrity: signer.envelope(KEY, 'notification', content)
  }, overrides);
}

/**
 * A day's live rows: one genuine notice, and three that must never be listed -
 * a signed notice edited afterwards, one nobody signed, and a genuine
 * signature attached to a row joined to somebody else's origin.
 */
function todaysNotices() {
  const good = noticeRow(NOTICE);

  const tampered = noticeRow(Object.assign({}, NOTICE, { id: 6, title: 'Real title' }));
  tampered.integrity.content.title = 'Send your password to support';
  tampered.title = 'Send your password to support';

  const unsigned = noticeRow(Object.assign({}, NOTICE, { id: 7, title: 'Nobody signed this' }), { integrity: null });

  /* The row says one origin, the signature another. */
  const misattributed = noticeRow(Object.assign({}, NOTICE, { id: 8, title: 'From somebody else' }), { origin_id: 9 });

  return { good: good, bad: [tampered, unsigned, misattributed] };
}

function noticeStore(items, seen) {
  return configureStore({
    reducer: { auth, catalog, compare, notices },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
    preloadedState: { notices: { items: items, status: 'ready', silenced: false, seen: seen || [] } }
  });
}

/** Node's crypto, with every signature check held back until the test lets it through. */
function heldCrypto() {
  const inner = createNodeSubtle();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });

  return {
    subtle: Object.assign({}, inner, {
      verify: (algorithm, key, signature, data) => gate.then(() => inner.verify(algorithm, key, signature, data))
    }),
    release: () => release()
  };
}

describe('the notification page', () => {
  const cards = (host) => host.querySelectorAll('button[aria-expanded]');

  test('lists the verified notice from its signature, sanitised, and nothing at all of the others', async () => {
    const day = todaysNotices();
    const store = noticeStore([day.good].concat(day.bad));

    window.__pwned = 0;
    const { verifier } = verifierFor({});
    const ui = mount(<Notifications />, verifier, store);
    await settle();

    const text = ui.host.textContent;
    expect(text).toContain('Holiday opening hours');
    expect(text).toContain('We open at ten.');
    expect(text).not.toContain('Send your password to support');
    expect(text).not.toContain('Real title');
    expect(text).not.toContain('Nobody signed this');
    expect(text).not.toContain('From somebody else');

    /* Verified is not safe: the signed body still went through the sanitiser. */
    expect(ui.host.querySelector('script')).toBeNull();
    expect(ui.host.innerHTML).not.toMatch(/onerror|javascript:/);
    expect(window.__pwned).toBe(0);

    /*
     * ONE card, for the one notice that verified. The other three are not
     * there at all - no card kept in their place, and no neutral message
     * standing in for their words.
     */
    expect(cards(ui.host).length).toBe(1);
    expect(ui.host.querySelectorAll('[role="note"]').length).toBe(0);
    expect(text).not.toMatch(/could not be verified|cannot be shown/i);

    /* Reading the page marks what it listed as read - and nothing it did not. */
    expect(store.getState().notices.seen).toEqual([NOTICE.id]);

    ui.unmount();
  });

  test('draws no card while the notices are being checked - the loading state instead', async () => {
    const day = todaysNotices();
    const store = noticeStore([day.good].concat(day.bad));
    const held = heldCrypto();
    const verifier = createVerifier({ trust: TRUST, subtle: held.subtle, resolveUrl: (p) => p });

    const ui = mount(<Notifications />, verifier, store);
    await settle();

    /* Every check is in progress: nothing that might yet disappear is on screen. */
    expect(cards(ui.host).length).toBe(0);
    expect(ui.host.textContent).toContain('Looking for anything new');
    expect(ui.host.textContent).not.toContain('Holiday opening hours');
    expect(ui.host.textContent).not.toContain('Send your password to support');
    expect(ui.host.textContent).not.toContain('Nothing new today');
    expect(store.getState().notices.seen).toEqual([]);

    held.release();
    await settle();

    expect(cards(ui.host).length).toBe(1);
    expect(ui.host.textContent).toContain('Holiday opening hours');
    expect(ui.host.textContent).not.toContain('Looking for anything new');
    expect(store.getState().notices.seen).toEqual([NOTICE.id]);

    ui.unmount();
  });

  test('a day on which nothing verifies is the page\'s ordinary empty state, not an error', async () => {
    const store = noticeStore(todaysNotices().bad);
    const { verifier } = verifierFor({});

    const ui = mount(<Notifications />, verifier, store);
    await settle();

    const text = ui.host.textContent;
    expect(cards(ui.host).length).toBe(0);
    expect(text).toContain('Nothing new today');
    expect(text).not.toContain('Notifications are unavailable right now');
    expect(ui.host.querySelectorAll('[role="note"]').length).toBe(0);
    expect(text).not.toContain('Nobody signed this');
    expect(store.getState().notices.seen).toEqual([]);

    ui.unmount();
  });
});

describe('the bell', () => {
  const bell = (host) => host.querySelector('a[href="/notifications"]');

  test('counts only the notices the page would list, and only until they are read', async () => {
    const day = todaysNotices();
    const held = heldCrypto();
    const verifier = createVerifier({ trust: TRUST, subtle: held.subtle, resolveUrl: (p) => p });

    const unread = mount(<Header />, verifier, noticeStore([day.good].concat(day.bad)));
    await settle();

    /* Still being checked: no number yet, rather than four that is about to become one. */
    expect(bell(unread.host).getAttribute('aria-label')).toBe('Notifications');

    /* Four live rows, one of them genuine: one unread, not four. */
    held.release();
    await settle();
    expect(bell(unread.host).getAttribute('aria-label')).toBe('Notifications, 1 unread');
    unread.unmount();

    /* The genuine one read: nothing left to count, whatever else is live. */
    const read = mount(<Header />, verifier, noticeStore([day.good].concat(day.bad), [NOTICE.id]));
    await settle();
    expect(bell(read.host).getAttribute('aria-label')).toBe('Notifications');
    read.unmount();
  });
});

describe('an FAQ', () => {
  const FAQ = {
    id: 3,
    category: 'STB',
    question: 'Does the box need the internet?',
    answer: 'Only for updates.',
    sortOrder: 2,
    status: 'PUBLISHED',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z'
  };

  const draw = ({ state, faq }) => (faq
    ? <p data-state={state}>{faq.question} / {faq.answer}</p>
    : <p data-state={state}>not shown</p>);

  test('renders from the signature, never from the row beside it', async () => {
    const row = { id: 3, question: 'Row question', answer: 'Row answer', view_count: 99, integrity: signer.envelope(KEY, 'faq', FAQ) };
    const { verifier } = verifierFor({});

    const ui = mount(<VerifiedFAQ faq={row}>{draw}</VerifiedFAQ>, verifier);
    expect(ui.host.textContent).toBe('not shown');   // checking
    await settle();

    expect(ui.host.textContent).toBe('Does the box need the internet? / Only for updates.');
    ui.unmount();
  });

  test('an edited answer is not shown', async () => {
    const integrity = signer.envelope(KEY, 'faq', FAQ);
    integrity.content.answer = 'Always.';
    const { verifier } = verifierFor({});

    const ui = mount(<VerifiedFAQ faq={{ id: 3, integrity: integrity }}>{draw}</VerifiedFAQ>, verifier);
    await settle();

    expect(ui.host.textContent).toBe('not shown');
    expect(ui.host.querySelector('p').getAttribute('data-state')).toBe('invalid');
    ui.unmount();
  });
});

describe('the notice sanitiser', () => {
  test('keeps the editor\'s formatting and removes everything that could run', async () => {
    const sanitizeNoticeHtml = await loadNoticeSanitizer();
    expect(loadedNoticeSanitizer()).toBe(sanitizeNoticeHtml);

    const out = sanitizeNoticeHtml(
      '<h2 style="position:fixed">Title</h2><p onclick="x()">A <a href="https://crystal.example" target="_blank">link</a>'
      + ' and <a href="javascript:alert(1)">bad</a></p><ul><li>one</li></ul>'
      + '<img src="data:image/svg+xml;base64,PHN2Zz4=" alt="d"><img src="/uploads/articles/a.png" alt="ok">'
      + '<iframe src="https://evil.example"></iframe><svg onload="x()"><circle/></svg><style>body{display:none}</style>'
      + '<form action="/steal"><input name="p"></form><table><tr><td colspan="2">cell</td></tr></table>'
    );

    expect(out).toContain('<h2>Title</h2>');
    expect(out).toContain('<a href="https://crystal.example" target="_blank" rel="noopener noreferrer">link</a>');
    expect(out).toContain('<a>bad</a>');
    expect(out).toContain('<ul><li>one</li></ul>');
    expect(out).toContain('<img src="/uploads/articles/a.png" alt="ok" />');
    expect(out).toContain('<td colspan="2">cell</td>');
    expect(out).not.toMatch(/style|onclick|onload|javascript:|data:|iframe|svg|form|input|display:none/);
  });
});
