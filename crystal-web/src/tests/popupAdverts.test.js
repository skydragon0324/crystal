/*
 * THE ADVERTS THAT OPEN OVER THE HOMEPAGE, AND THE SLIDES THAT MOVE.
 *
 * Four promises are held here, each one a decision somebody could undo by
 * accident:
 *
 *   ONCE PER SESSION. A campaign interrupts a visitor once, not on every
 *   homepage view. The ids it has shown are remembered, so a campaign
 *   published mid-session still appears and a dismissed one does not.
 *
 *   THE CLOSE BUTTON IS THERE FROM THE FIRST ADVERT. Clicking the picture is
 *   how the next one is reached, and clicking past the last one closes the
 *   dialog - but nobody is made to click through the run to escape it.
 *
 *   A PICTURE IS VERIFIED; A FILM IS NOT. The popup and the hero both check
 *   an image's signature against its bytes and refuse a picture that fails.
 *   A video carries no envelope by design - the server does not sign video -
 *   and it is drawn rather than dropped.
 *
 *   A FILM IS A <video>, muted at first because no browser autoplays sound,
 *   with the button that turns the sound on.
 *
 * Verification here is REAL, as in verifiedComponents.test.js: Node's crypto
 * behind the WebCrypto interface, envelopes signed with a key made for this
 * run, and a stubbed fetch.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';

import theme from '@/theme';
import { I18nProvider } from '@/i18n';
import PopupAdverts from '@/components/common/PopupAdverts';
import HeroCarousel from '@/components/product/HeroCarousel';
import { createVerifier } from '@/security/verifyContent';
import { parseTrustedKeys } from '@/security/trustedKeys';
import { SecurityProvider } from '@/components/security/SecurityProvider';

const { createNodeSubtle } = require('@/security/__testing__/nodeSubtle');
const signer = require('@/security/__testing__/signer');

const live = { rows: [] };

jest.mock('@/api', () => ({
  __esModule: true,
  default: {
    site: {
      // eslint-disable-next-line global-require
      popups: () => Promise.resolve({ data: require('@/tests/popupAdverts.test').__rows() })
    }
  },
  fileUrl: (p) => p || ''
}));

/** The mock reads the run through this, so a test can change it per case. */
export function __rows() {
  return live.rows;
}

jest.setTimeout(60000);

const KEY = signer.generateEcdsaKey('popup-adverts-test-key');
const TRUST = parseTrustedKeys(JSON.stringify([KEY.entry()]));

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = (fill) => Uint8Array.from(PNG_HEADER.concat([0, 0, 0, 13, fill, fill, fill, fill, fill, fill]));

function picture(id, path, bytes, extra) {
  return Object.assign({
    id: id,
    file_path: path,
    media_type: 'image',
    alt_text: 'advert ' + id,
    link_url: null,
    sort_order: id,
    integrity: signer.envelope(KEY, 'image', signer.imageContent(path, 'image/png', bytes))
  }, extra || {});
}

function film(id, path, extra) {
  /* A film has no envelope at all - that is the whole point of it. */
  return Object.assign({
    id: id,
    file_path: path,
    media_type: 'video',
    alt_text: 'film ' + id,
    link_url: null,
    sort_order: id,
    integrity: null
  }, extra || {});
}

function verifierFor(files) {
  const fetch = (url) => {
    const bytes = files[url];
    return Promise.resolve(bytes
      ? { ok: true, status: 200, arrayBuffer: () => Promise.resolve(new Uint8Array(bytes).buffer) }
      : { ok: false, status: 404 });
  };
  return createVerifier({
    trust: TRUST, subtle: createNodeSubtle(), fetch: fetch, resolveUrl: (p) => p
  });
}

let warned;

beforeEach(() => {
  let counter = 0;
  URL.createObjectURL = jest.fn((blob) => {
    counter += 1;
    return 'blob:test/' + counter + '/' + blob.type;
  });
  URL.revokeObjectURL = jest.fn();
  warned = jest.spyOn(console, 'warn').mockImplementation(() => {});
  window.sessionStorage.clear();
  live.rows = [];
});

afterEach(() => {
  warned.mockRestore();
  delete URL.createObjectURL;
  delete URL.revokeObjectURL;
  document.body.innerHTML = '';
});

function mount(element, verifier) {
  const host = document.createElement('div');
  document.body.appendChild(host);

  act(() => {
    ReactDOM.render(
      <ChakraProvider theme={theme}>
        <I18nProvider>
          <SecurityProvider verifier={verifier}>
            <MemoryRouter>{element}</MemoryRouter>
          </SecurityProvider>
        </I18nProvider>
      </ChakraProvider>,
      host
    );
  });

  return {
    host: host,
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

/** The dialog is portalled, so it is never inside the mount host. */
function dialog() {
  return document.querySelector('[role="dialog"]');
}

function click(element) {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

function buttonSaying(pattern) {
  return Array.prototype.filter.call(
    document.querySelectorAll('button'),
    (node) => pattern.test((node.textContent || '') + ' ' + (node.getAttribute('aria-label') || ''))
  )[0] || null;
}

describe('the popup adverts', () => {
  test('a live campaign opens over the page, and says which of how many it is', async () => {
    const first = png(0x11);
    const second = png(0x22);
    live.rows = [picture(1, '/uploads/showcase/a.png', first), picture(2, '/uploads/showcase/b.png', second)];

    const view = mount(<PopupAdverts />, verifierFor({
      '/uploads/showcase/a.png': first,
      '/uploads/showcase/b.png': second
    }));
    await settle();

    expect(dialog()).toBeTruthy();
    expect(dialog().textContent).toContain('1');
    /* The close button exists before a single advert has been clicked through. */
    expect(buttonSaying(/close/i)).toBeTruthy();

    view.unmount();
  });

  test('the picture is the way to the next advert, and the last one closes it', async () => {
    const first = png(0x11);
    const second = png(0x22);
    live.rows = [picture(1, '/uploads/showcase/a.png', first), picture(2, '/uploads/showcase/b.png', second)];

    const view = mount(<PopupAdverts />, verifierFor({
      '/uploads/showcase/a.png': first,
      '/uploads/showcase/b.png': second
    }));
    await settle();

    /* The picture itself is a button, and it says what activating it does. */
    const picture1 = document.querySelector('[role="dialog"] button[aria-label*="next"]')
      || document.querySelector('[role="dialog"] button[aria-label*="Next"]');
    expect(picture1).toBeTruthy();

    click(picture1);
    await settle();
    expect(dialog()).toBeTruthy();

    /* On the last one, the same click is the way out. */
    const picture2 = document.querySelector('[role="dialog"] button[aria-label]');
    click(picture2);
    await settle();

    expect(dialog()).toBeFalsy();
    view.unmount();
  });

  test('it interrupts once per session, and a new campaign still gets through', async () => {
    const bytes = png(0x33);
    live.rows = [picture(7, '/uploads/showcase/c.png', bytes)];

    const files = { '/uploads/showcase/c.png': bytes };
    const first = mount(<PopupAdverts />, verifierFor(files));
    await settle();
    expect(dialog()).toBeTruthy();
    first.unmount();

    /* Same run, same session: nothing opens. */
    const again = mount(<PopupAdverts />, verifierFor(files));
    await settle();
    expect(dialog()).toBeFalsy();
    again.unmount();

    /* A campaign published since then is a different id, so it is shown. */
    const later = png(0x44);
    live.rows = live.rows.concat([picture(8, '/uploads/showcase/d.png', later)]);
    files['/uploads/showcase/d.png'] = later;

    const third = mount(<PopupAdverts />, verifierFor(files));
    await settle();
    expect(dialog()).toBeTruthy();
    third.unmount();
  });

  test('a film is shown without being verified, and starts silent with a way to hear it', async () => {
    live.rows = [film(3, '/uploads/showcase/clip.mp4')];

    const view = mount(<PopupAdverts />, verifierFor({}));
    await settle();

    const video = document.querySelector('[role="dialog"] video');
    expect(video).toBeTruthy();
    /* Served from the API origin, as an ordinary file - see docs/serving-uploads.md. */
    expect(video.getAttribute('src')).toContain('/uploads/showcase/clip.mp4');
    /* No browser autoplays sound, so it must begin muted or it does not begin. */
    expect(video.muted).toBe(true);
    expect(buttonSaying(/sound/i)).toBeTruthy();

    view.unmount();
  });
});

describe('the hero carousel', () => {
  test('a film slide is drawn as a video, beside a verified picture', async () => {
    const bytes = png(0x55);
    const slides = [
      {
        id: 1,
        path: '/uploads/showcase/hero.png',
        altText: 'still',
        mediaType: 'image',
        integrity: signer.envelope(KEY, 'image', signer.imageContent('/uploads/showcase/hero.png', 'image/png', bytes))
      },
      { id: 2, path: '/uploads/showcase/hero.mp4', altText: 'film', mediaType: 'video', integrity: null }
    ];

    const view = mount(
      <HeroCarousel verified slides={slides} interval={7000} ariaLabel="Crystal" />,
      verifierFor({ '/uploads/showcase/hero.png': bytes })
    );
    await settle();

    const video = view.host.querySelector('video');
    expect(video).toBeTruthy();
    expect(video.getAttribute('src')).toContain('/uploads/showcase/hero.mp4');

    /* Both slides are in the deck: the film was not dropped for being unsigned. */
    const indicators = view.host.querySelectorAll('button[aria-current]');
    expect(indicators.length).toBe(2);

    view.unmount();
  });

  test('a picture whose bytes do not match its signature is still dropped', async () => {
    const signedBytes = png(0x66);
    const servedBytes = png(0x77);

    const slides = [
      {
        id: 1,
        path: '/uploads/showcase/swapped.png',
        altText: 'tampered',
        mediaType: 'image',
        integrity: signer.envelope(KEY, 'image', signer.imageContent('/uploads/showcase/swapped.png', 'image/png', signedBytes))
      },
      { id: 2, path: '/uploads/showcase/hero.mp4', altText: 'film', mediaType: 'video', integrity: null }
    ];

    const view = mount(
      <HeroCarousel verified slides={slides} interval={7000} ariaLabel="Crystal" />,
      /* The file on disk is not what was signed. */
      verifierFor({ '/uploads/showcase/swapped.png': servedBytes })
    );
    await settle();

    expect(view.host.querySelector('video')).toBeTruthy();
    expect(view.host.querySelector('img')).toBeFalsy();

    view.unmount();
  });
});
