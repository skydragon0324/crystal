/*
 * THE PRODUCT PAGE'S PICTURES, MOUNTED.
 *
 * Three complaints are held here, each as the question a visitor would ask:
 *
 *   ONE SHOT WAS DRAWN THE WIDTH OF THE PAGE. A product with a single main
 *   image got a 1178px square, taller than the screen. It is now a plain
 *   picture - no arrows, no indicators, no carousel role - in a frame whose
 *   width is capped by ProductShots' limits.
 *
 *   SEVERAL SHOTS ARE ONE CAROUSEL ON EVERY WIDTH: next, previous (wrapping
 *   at both ends), the keyboard arrows, an indicator per shot - and it
 *   PLAYS, like the hero decks, so the views past the first one are seen
 *   rather than waiting behind an arrow. A timed deck carries the
 *   play/pause button that stops it for good.
 *
 *   A TILE WAITED AS A FLAT GREY SQUARE. A product card now shows a skeleton
 *   through the whole wait - the signature check, then the decode - and only
 *   the verified object URL is ever put on its <img>.
 *
 * And the advertising run: in the content column, never wider than the
 * standard measure, each panel's box reserved from its row's own proportions.
 *
 * Every picture goes through REAL verification, as in
 * verifiedComponents.test.js: Node's crypto behind the WebCrypto interface,
 * envelopes signed with a key made for this run, and a stubbed fetch.
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
import compare from '@/app/compareSlice';
import ProductShots, { SHOT_MAX_HEIGHT, frameRatio } from '@/components/product/ProductShots';
import ProductCard from '@/components/product/ProductCard';
import GalleryTab, { ADVERT_RUN_MAX } from '@/pages/common/product/GalleryTab';
import { createVerifier } from '@/security/verifyContent';
import { parseTrustedKeys } from '@/security/trustedKeys';
import { SecurityProvider } from '@/components/security/SecurityProvider';

const { createNodeSubtle } = require('@/security/__testing__/nodeSubtle');
const signer = require('@/security/__testing__/signer');

const mockGallery = { rows: [] };

jest.mock('@/api', () => ({
  __esModule: true,
  default: {
    catalog: {
      gallery: () => Promise.resolve({ data: mockGallery.rows })
    }
  },
  fileUrl: (p) => p || ''
}));

jest.setTimeout(60000);

const KEY = signer.generateEcdsaKey('product-images-test-key');
const TRUST = parseTrustedKeys(JSON.stringify([KEY.entry()]));

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = (fill) => Uint8Array.from(PNG_HEADER.concat([0, 0, 0, 13, fill, fill, fill, fill, fill, fill]));

function signedImage(path, bytes) {
  return { path: path, bytes: bytes, integrity: signer.envelope(KEY, 'image', signer.imageContent(path, 'image/png', bytes)) };
}

function verifierFor(files) {
  const requests = [];
  const fetch = (url) => {
    requests.push(url);
    const bytes = files[url];
    return Promise.resolve(bytes
      ? { ok: true, status: 200, arrayBuffer: () => Promise.resolve(new Uint8Array(bytes).buffer) }
      : { ok: false, status: 404 });
  };
  return {
    verifier: createVerifier({ trust: TRUST, subtle: createNodeSubtle(), fetch: fetch, resolveUrl: (p) => p }),
    requests: requests
  };
}

let created;
let warned;

beforeEach(() => {
  let counter = 0;
  created = jest.fn((blob) => {
    counter += 1;
    return 'blob:test/' + counter + '/' + blob.type;
  });
  URL.createObjectURL = created;
  URL.revokeObjectURL = jest.fn();
  warned = jest.spyOn(console, 'warn').mockImplementation(() => {});
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
  const store = configureStore({ reducer: { compare } });

  act(() => {
    ReactDOM.render(
      <ChakraProvider theme={theme}>
        <I18nProvider>
          <Provider store={store}>
            <SecurityProvider verifier={verifier}>
              <MemoryRouter>{element}</MemoryRouter>
            </SecurityProvider>
          </Provider>
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

const images = (host) => Array.prototype.slice.call(host.querySelectorAll('img'));
const style = (node) => window.getComputedStyle(node);

function click(node) {
  act(() => { node.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

function fire(node, type) {
  act(() => { node.dispatchEvent(new Event(type)); });
}

/* ------------------------------------------------------------ main shots */

const front = signedImage('/uploads/products/c9/front.png', png(1));
const back = signedImage('/uploads/products/c9/back.png', png(2));
const angle = signedImage('/uploads/products/c9/angle.png', png(3));
const lifestyle = signedImage('/uploads/products/c9/lifestyle.png', png(4));

const shot = (image, id, width, height) => ({
  id: id, path: image.path, altText: 'Shot ' + id, integrity: image.integrity, width: width, height: height
});

describe('the main shots', () => {
  test('one shot is a plain picture, with no carousel chrome, inside the size limit', async () => {
    const { verifier } = verifierFor({ [front.path]: front.bytes });
    const ui = mount(<ProductShots shots={[shot(front, 1, 1200, 1200)]} label="Pictures of C9 Pro" />, verifier);
    await settle();

    /* The picture, from its verified bytes. */
    expect(images(ui.host).map((img) => img.getAttribute('src'))).toEqual([created.mock.results[0].value]);

    /* Nothing that belongs to a deck: no arrows, no indicators, no play button, no carousel role, no dead tab stop. */
    expect(ui.host.querySelectorAll('button').length).toBe(0);
    expect(ui.host.querySelector('[aria-roledescription]')).toBe(null);
    expect(ui.host.querySelector('[tabindex]')).toBe(null);

    /*
     * THE SIZE LIMIT. The frame may never be wider than its maximum height
     * times its shape - square here, so 520px - nor wider than 60% of the
     * window's height, which the inner box holds.
     */
    const frame = ui.host.querySelector('[data-product-shots]');
    expect(style(frame).maxWidth).toBe(SHOT_MAX_HEIGHT + 'px');
    expect(style(frame.firstChild).maxWidth).toBe('60vh');
    /* ...and the frame is square before any picture has arrived. */
    expect(Array.prototype.some.call(
      ui.host.querySelectorAll('div'), (div) => style(div).paddingBottom === '100%'
    )).toBe(true);

    ui.unmount();
  });

  test('several shots are a carousel the visitor turns: next, previous, keyboard, indicators', async () => {
    const { verifier } = verifierFor({
      [front.path]: front.bytes, [back.path]: back.bytes, [angle.path]: angle.bytes, [lifestyle.path]: lifestyle.bytes
    });
    const shots = [shot(front, 1, 1200, 1200), shot(back, 2, 1200, 1200), shot(angle, 3, 1200, 1200), shot(lifestyle, 4, 1600, 1200)];
    const ui = mount(<ProductShots shots={shots} label="Pictures of C9" />, verifier);
    await settle();

    const deck = ui.host.querySelector('[aria-roledescription="carousel"]');
    expect(deck).not.toBe(null);
    expect(deck.getAttribute('aria-label')).toBe('Pictures of C9');
    expect(deck.getAttribute('tabindex')).toBe('0');

    /* Every shot is a slide, drawn from its own verified bytes. */
    expect(images(ui.host).length).toBe(4);
    images(ui.host).forEach((img) => expect(img.getAttribute('src')).toMatch(/^blob:test\//));

    const current = () => {
      const marks = Array.prototype.slice.call(ui.host.querySelectorAll('[aria-current]'));
      return marks.map((mark) => mark.getAttribute('aria-current')).indexOf('true');
    };
    const visible = () => Array.prototype.slice.call(ui.host.querySelectorAll('[aria-roledescription="slide"]'))
      .map((slide) => slide.getAttribute('aria-hidden')).indexOf('false');

    expect(ui.host.querySelectorAll('[aria-current]').length).toBe(4);
    expect(current()).toBe(0);

    const next = ui.host.querySelector('button[aria-label="Next slide"]');
    const previous = ui.host.querySelector('button[aria-label="Previous slide"]');

    click(next);
    expect(current()).toBe(1);
    expect(visible()).toBe(1);

    click(previous);
    click(previous);
    /* Previous from the first shot wraps to the last, rather than stopping. */
    expect(current()).toBe(3);
    expect(visible()).toBe(3);

    act(() => { deck.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    expect(current()).toBe(0);

    /* An indicator is a button that goes straight to its shot. */
    click(ui.host.querySelector('button[aria-label="Go to slide 3"]'));
    expect(current()).toBe(2);

    /*
     * IT RUNS ON A CLOCK, and the clock can be stopped: a timed deck draws
     * one pause button, which is the only control that is not a way of
     * moving between shots.
     */
    const clock = ui.host.querySelector('button[aria-pressed]');
    expect(clock).not.toBe(null);
    expect(clock.getAttribute('aria-label')).toMatch(/pause/i);

    ui.unmount();
  });

  test('the frame fits the first shot, between 3:4 and 4:3', () => {
    expect(frameRatio([{ width: 1200, height: 1200 }])).toBe(1);
    /* The front of the phone fills the frame; the 4:3 picture after it is the one with margins. */
    expect(frameRatio([{ width: 1200, height: 1200 }, { width: 1600, height: 1200 }])).toBe(1);
    expect(frameRatio([{ width: 1600, height: 1200 }, { width: 1200, height: 1200 }])).toBeCloseTo(4 / 3);
    expect(frameRatio([{ width: 3200, height: 1000 }])).toBeCloseTo(4 / 3);
    expect(frameRatio([{ width: 600, height: 1200 }])).toBeCloseTo(3 / 4);
    /* A row that does not know its shape is framed square rather than guessed. */
    expect(frameRatio([{}])).toBe(1);
    expect(frameRatio([])).toBe(1);
  });

  test('a first shot wider than square is framed to it on a desktop, and square on a phone', async () => {
    const { verifier } = verifierFor({ [lifestyle.path]: lifestyle.bytes });
    const ui = mount(<ProductShots shots={[shot(lifestyle, 4, 1600, 1200)]} label="Pictures" />, verifier);
    await settle();

    /*
     * The phone's limit is the base value, the one jsdom reports: square,
     * 520px. The desktop's 693px (520 x 4/3) is the md value in the same
     * rule, which jsdom does not apply - it is proved in the browser.
     */
    const frame = ui.host.querySelector('[data-product-shots]');
    expect(style(frame).maxWidth).toBe('520px');

    ui.unmount();
  });
});

/* ----------------------------------------------------------- product card */

describe('a product card', () => {
  const product = {
    id: 7,
    slug: 'c9',
    name: 'Crystal C9',
    price: 899,
    currency: 'USD',
    main_image: front.path,
    main_image_integrity: front.integrity
  };

  test('shows a skeleton through the check and the decode, then only the verified picture', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const { verifier } = verifierFor({ [front.path]: front.bytes });
    const held = Object.assign({}, verifier, {
      verifyImage: (integrity, options) => gate.then(() => verifier.verifyImage(integrity, options))
    });

    const ui = mount(<ProductCard product={product} sectionPath="/smartphones" />, held);
    const box = () => ui.host.querySelector('[data-picture]');
    await settle();

    /* Being checked: a skeleton in a box already the tile's square, and no <img> at all. */
    expect(box().getAttribute('data-picture')).toBe('waiting');
    expect(style(box()).paddingBottom).toBe('100%');
    expect(ui.host.querySelector('.chakra-skeleton')).not.toBe(null);
    expect(images(ui.host)).toEqual([]);

    release();
    await settle();

    /* Verified and decoding: still the skeleton, the picture invisible under it. */
    const img = images(ui.host)[0];
    expect(img.getAttribute('src')).toBe(created.mock.results[0].value);
    expect(box().getAttribute('data-picture')).toBe('waiting');
    expect(ui.host.querySelector('.chakra-skeleton')).not.toBe(null);
    expect(style(img).opacity).toBe('0');

    fire(img, 'load');

    expect(box().getAttribute('data-picture')).toBe('ready');
    expect(ui.host.querySelector('.chakra-skeleton')).toBe(null);
    expect(style(img).opacity).toBe('1');

    ui.unmount();
  });

  test('a tile whose picture fails its signature shows the neutral note and never the file', async () => {
    const tampered = front.bytes.slice();
    tampered[tampered.length - 1] ^= 0xff;
    const { verifier } = verifierFor({ [front.path]: tampered });

    const ui = mount(<ProductCard product={product} sectionPath="/smartphones" />, verifier);
    await settle();

    expect(images(ui.host)).toEqual([]);
    expect(created).not.toHaveBeenCalled();
    expect(ui.host.querySelector('[data-picture]').getAttribute('data-picture')).toBe('unverified');
    expect(ui.host.querySelector('[role="img"]')).not.toBe(null);
    expect(ui.host.querySelector('.chakra-skeleton')).toBe(null);

    ui.unmount();
  });
});

/* ------------------------------------------------------- advertising run */

describe('the advertising run', () => {
  const one = signedImage('/uploads/products/c9/detail-display.png', png(21));
  const two = signedImage('/uploads/products/c9/detail-camera.png', png(22));

  test('sits in the content column, no wider than the standard measure, each panel its own shape', async () => {
    mockGallery.rows = [
      { id: 1, file_path: one.path, integrity: one.integrity, width: 1600, height: 900, alt_text: '' },
      { id: 2, file_path: two.path, integrity: two.integrity, width: 1080, height: 1350, alt_text: '' }
    ];
    const { verifier } = verifierFor({ [one.path]: one.bytes, [two.path]: two.bytes });

    const ui = mount(<GalleryTab slug="c9" />, verifier);
    await settle();

    const run = ui.host.querySelector('[data-advert-run]');
    expect(run).not.toBe(null);
    expect(style(run).maxWidth).toBe(ADVERT_RUN_MAX);

    /* The boxes are the panels' own proportions from the first paint - 16:9 and 4:5. */
    const boxes = Array.prototype.slice.call(run.querySelectorAll('[data-picture]'));
    expect(boxes.map((node) => style(node).paddingBottom)).toEqual(['56.25%', '125%']);

    /* Verified bytes, and nothing else. */
    expect(images(ui.host).map((img) => img.getAttribute('src'))).toEqual(created.mock.results.map((r) => r.value));

    ui.unmount();
  });
});
