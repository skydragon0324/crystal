/*
 * THE ANIMATION ENGINE, MOUNTED.
 *
 * What is held here is the handful of decisions that would be invisible if
 * they broke - a scene would still render, it would just render wrongly:
 *
 *   ONE SCENE, ANY WIDTH. The layers are placed in the scene's own frame and
 *   the frame is scaled once. A scene that stopped scaling would look correct
 *   on the developer's monitor and be cropped on every phone.
 *
 *   THE DELAYS ARE REAL. A layer's delay, duration and easing reach the
 *   element as CSS, and `both` fill mode holds the from-state through the
 *   delay - without it a stagger plays as everything at once.
 *
 *   THE CLOCK BELONGS TO THE CALLER. `isPlaying` decides whether the layers
 *   run; the scene does not start itself when the carousel is paused.
 *
 *   A LAYER THAT FAILS ITS SIGNATURE IS NOT DRAWN, and the rest of the scene
 *   still plays. A background that fails takes the scene with it, because
 *   cut-outs floating on nothing is not a fallback.
 *
 *   THE TWO VOCABULARIES AGREE. The server's list of animation names and the
 *   browser's registry are written out separately on purpose; a name in one
 *   and not the other is a scene that saves and then will not draw.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ChakraProvider } from '@chakra-ui/react';

import theme from '@/theme';
import { I18nProvider } from '@/i18n';
import ImageAnimator from '@/components/ImageAnimator/ImageAnimator';
import { normaliseScene } from '@/components/ImageAnimator/scene';
import { ANIMATION_NAMES, resolve } from '@/components/ImageAnimator/animationRegistry';
import { PRESETS, applyPreset } from '@/components/ImageAnimator/presets';
import { createVerifier } from '@/security/verifyContent';
import { parseTrustedKeys } from '@/security/trustedKeys';
import { SecurityProvider } from '@/components/security/SecurityProvider';

const { createNodeSubtle } = require('@/security/__testing__/nodeSubtle');
const signer = require('@/security/__testing__/signer');

jest.mock('@/api', () => ({
  __esModule: true,
  default: {},
  fileUrl: (p) => p || ''
}));

jest.setTimeout(60000);

const KEY = signer.generateEcdsaKey('scene-test-key');
const TRUST = parseTrustedKeys(JSON.stringify([KEY.entry()]));

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = (fill) => Uint8Array.from(PNG_HEADER.concat([0, 0, 0, 13, fill, fill, fill, fill, fill, fill]));

const SKY = png(0x11);
const CLOUD = png(0x22);
const PLANE = png(0x33);

function envelope(path, bytes) {
  return signer.envelope(KEY, 'image', signer.imageContent(path, 'image/png', bytes));
}

/** The scene the tests use: a background and two layers with different motion. */
function sampleScene() {
  return {
    sceneId: 'test-001',
    width: 1000,
    height: 500,
    duration: 4000,
    background: {
      src: '/uploads/showcase/sky.png',
      integrity: envelope('/uploads/showcase/sky.png', SKY),
      animation: { name: 'zoom-out', duration: 4000 }
    },
    layers: [
      {
        id: 'cloud',
        src: '/uploads/showcase/cloud.png',
        integrity: envelope('/uploads/showcase/cloud.png', CLOUD),
        x: 100, y: 50, width: 300, height: 150, z: 1,
        animation: { name: 'slide-left', delay: 250, duration: 900, easing: 'ease-out' }
      },
      {
        id: 'plane',
        src: '/uploads/showcase/plane.png',
        integrity: envelope('/uploads/showcase/plane.png', PLANE),
        x: 600, y: 120, width: 200, height: 80, z: 2,
        animation: { name: 'slide-right', delay: 700, duration: 800 }
      }
    ]
  };
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

const EVERYTHING = {
  '/uploads/showcase/sky.png': SKY,
  '/uploads/showcase/cloud.png': CLOUD,
  '/uploads/showcase/plane.png': PLANE
};

let warned;
let stubbedWidth = 500;

beforeEach(() => {
  let counter = 0;
  URL.createObjectURL = jest.fn((blob) => {
    counter += 1;
    return 'blob:scene/' + counter + '/' + blob.type;
  });
  URL.revokeObjectURL = jest.fn();
  warned = jest.spyOn(console, 'warn').mockImplementation(() => {});

  /*
   * jsdom lays nothing out, so every element reports a width of zero and
   * the scene would scale to nothing. This is the only way to test the
   * scaling at all without a real browser - and the browser check is in
   * the flow that drives the homepage.
   */
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() { return stubbedWidth; }
  });
});

afterEach(() => {
  warned.mockRestore();
  delete HTMLElement.prototype.clientWidth;
  delete URL.createObjectURL;
  delete URL.revokeObjectURL;
  document.body.innerHTML = '';
});

function mount(element, verifier, width) {
  const host = document.createElement('div');
  document.body.appendChild(host);

  stubbedWidth = width || 500;

  act(() => {
    ReactDOM.render(
      <ChakraProvider theme={theme}>
        <I18nProvider>
          <SecurityProvider verifier={verifier}>{element}</SecurityProvider>
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

async function settle() {
  for (let i = 0; i < 12; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }
}

function layers(host) {
  return Array.prototype.slice.call(host.querySelectorAll('[data-scene-layer]'));
}

describe('a scene is laid out in its own frame', () => {
  test('every layer is placed in scene units and the whole frame is scaled once', async () => {
    const view = mount(<ImageAnimator scene={sampleScene()} isPlaying />, verifierFor(EVERYTHING));
    await settle();

    const cloud = view.host.querySelector('[data-scene-layer="cloud"]');
    expect(cloud).toBeTruthy();

    /* The numbers on the layer are the author's, untouched. */
    expect(cloud.style.left).toBe('100px');
    expect(cloud.style.top).toBe('50px');
    expect(cloud.style.width).toBe('300px');

    /* And the scaling is one transform on the frame that holds them all. */
    const inner = view.host.querySelector('[data-scene]').firstElementChild;
    expect(inner.style.width).toBe('1000px');
    /* 500 of frame over 1000 of scene: the scene is drawn at half size. */
    expect(inner.style.transform).toBe('scale(0.5)');

    view.unmount();
  });

  test('the same scene keeps its proportions at a phone width', async () => {
    const wide = mount(<ImageAnimator scene={sampleScene()} isPlaying />, verifierFor(EVERYTHING), 1000);
    await settle();
    const wideTransform = wide.host.querySelector('[data-scene]').firstElementChild.style.transform;
    wide.unmount();

    const narrow = mount(<ImageAnimator scene={sampleScene()} isPlaying />, verifierFor(EVERYTHING), 390);
    await settle();
    const narrowTransform = narrow.host.querySelector('[data-scene]').firstElementChild.style.transform;

    /* Same scene, two widths, two scales - and the layers never moved. */
    expect(wideTransform).toBe('scale(1)');
    expect(narrowTransform).toBe('scale(0.39)');
    expect(narrow.host.querySelector('[data-scene-layer="cloud"]').style.left).toBe('100px');

    narrow.unmount();
  });
});

describe('the timing reaches the browser', () => {
  test("each layer carries its own delay, duration and easing, and holds its from-state", async () => {
    const view = mount(<ImageAnimator scene={sampleScene()} isPlaying />, verifierFor(EVERYTHING));
    await settle();

    const cloud = view.host.querySelector('[data-scene-layer="cloud"]');
    expect(cloud.style.animationDelay).toBe('250ms');
    expect(cloud.style.animationDuration).toBe('900ms');
    expect(cloud.style.animationTimingFunction).toBe('ease-out');

    /*
     * `both` is the whole reason a stagger looks like a stagger: without it
     * the layer waits out its delay in its FINAL position.
     */
    expect(cloud.style.animationFillMode).toBe('both');

    const plane = view.host.querySelector('[data-scene-layer="plane"]');
    expect(plane.style.animationDelay).toBe('700ms');

    view.unmount();
  });

  test('the caller owns the clock: a paused scene does not run', async () => {
    const view = mount(<ImageAnimator scene={sampleScene()} isPlaying={false} />, verifierFor(EVERYTHING));
    await settle();

    layers(view.host).forEach((layer) => {
      expect(layer.style.animationPlayState).toBe('paused');
    });
    expect(view.host.querySelector('[data-scene]').getAttribute('data-scene-playing')).toBe('no');

    view.unmount();
  });

  test('a scene reports how long it lasts, so a carousel can wait for it', async () => {
    const heard = [];
    const scene = sampleScene();
    /* The last layer settles at 1500ms; the scene says 4000 and wins. */
    const view = mount(
      <ImageAnimator scene={scene} isPlaying onDuration={(ms) => heard.push(ms)} />,
      verifierFor(EVERYTHING)
    );
    await settle();

    expect(heard[0]).toBe(4000);
    view.unmount();
  });

  test('a scene that outlasts its stated duration is not cut off', () => {
    const scene = sampleScene();
    scene.duration = 1000;
    /* The plane alone needs 700 + 800. */
    expect(normaliseScene(scene).duration).toBe(1500);
  });
});

describe('what a scene refuses to draw', () => {
  test('a layer whose bytes do not match its signature is left out; the rest plays', async () => {
    const swapped = Object.assign({}, EVERYTHING, { '/uploads/showcase/cloud.png': png(0x99) });

    const view = mount(<ImageAnimator scene={sampleScene()} isPlaying />, verifierFor(swapped));
    await settle();

    expect(view.host.querySelector('[data-scene-layer="cloud"]')).toBeFalsy();
    expect(view.host.querySelector('[data-scene-layer="plane"]')).toBeTruthy();

    view.unmount();
  });

  test('a background that fails takes the scene with it', async () => {
    const swapped = Object.assign({}, EVERYTHING, { '/uploads/showcase/sky.png': png(0x99) });

    const view = mount(<ImageAnimator scene={sampleScene()} isPlaying />, verifierFor(swapped));
    await settle();

    expect(view.host.querySelector('[data-scene]')).toBeFalsy();
    view.unmount();
  });
});

describe('the scene format', () => {
  test('a layer with nothing said about it still has a place and a motion', () => {
    const scene = normaliseScene({ layers: [{ src: '/uploads/a.png' }] });
    const layer = scene.layers[0];

    expect(layer.id).toBe('layer-1');
    expect(layer.animation.name).toBe('none');
    expect(layer.width).toBe(null);      /* fills the frame */
    expect(scene.width).toBe(1920);
  });

  test('a cut-out is never cropped, and a full-frame layer never letterboxed', () => {
    const scene = normaliseScene({
      layers: [
        { src: '/uploads/cloud.png' },
        { src: '/uploads/photo.jpg', fit: 'cover' },
        { src: '/uploads/odd.jpg', fit: 'stretch' }
      ]
    });

    /* The default protects the cut-out, which is the common layer. */
    expect(scene.layers[0].fit).toBe('contain');
    expect(scene.layers[1].fit).toBe('cover');
    /* Anything else is not a choice the engine offers. */
    expect(scene.layers[2].fit).toBe('contain');
  });

  test('a stagger spaces the layers that did not ask for a delay', () => {
    const scene = normaliseScene({
      stagger: 200,
      layers: [
        { src: '/uploads/a.png', animation: { name: 'fade-in' } },
        { src: '/uploads/b.png', animation: { name: 'fade-in' } },
        { src: '/uploads/c.png', animation: { name: 'fade-in', delay: 50 } }
      ]
    });

    expect(scene.layers[0].animation.delay).toBe(0);
    expect(scene.layers[1].animation.delay).toBe(200);
    /* A layer that named its own delay keeps it. */
    expect(scene.layers[2].animation.delay).toBe(50);
  });

  test("the spec's two names for the same motion both work", () => {
    expect(resolve('slide-up')).toBe('slide-bottom');
    expect(resolve('slide-bottom')).toBe('slide-bottom');
    /* And a name that is not one at all is refused rather than guessed. */
    expect(resolve('somersault')).toBe('none');
  });

  test('the server and the browser know the same animations', () => {
    // eslint-disable-next-line global-require
    const server = require('../../../crystal-backend/src/utils/scene');

    expect(server.ANIMATION_NAMES.slice().sort()).toEqual(ANIMATION_NAMES.slice().sort());
    expect(Object.keys(server.ALIASES).sort())
      .toEqual(Object.keys(require('@/components/ImageAnimator/animationRegistry').ALIASES).sort());
  });
});

describe('the presets', () => {
  test('every preset names animations that exist', () => {
    PRESETS.forEach((preset) => {
      preset.layers.forEach((layer) => {
        expect(ANIMATION_NAMES).toContain(resolve(layer.animation.name));
      });
    });
  });

  test('a preset plus pictures is a scene', () => {
    const preset = PRESETS[0];
    const scene = applyPreset(preset, {
      background: '/uploads/showcase/sky.png',
      product: '/uploads/showcase/product.png'
    });

    expect(scene.background.src).toBe('/uploads/showcase/sky.png');
    expect(scene.layers[0].src).toBe('/uploads/showcase/product.png');
    /* A layer with no picture yet keeps its place, so a scene can be finished later. */
    expect(scene.layers[1].src).toBe('');
  });
});
