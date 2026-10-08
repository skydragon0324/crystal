/*
 * THE FOUR CHAPTERS THAT STOPPED BEING WALLS.
 *
 * History, Recognition, the technology block and the factory's quality marks
 * all showed their whole set at once - eleven years of prose, thirteen
 * certificates, seven titles beside an unrelated carousel. Each is now a
 * control with ONE thing on show, which is a behaviour rather than a layout:
 * what is open, what moves it, and what moving it must not break.
 *
 * NONE OF THIS IS VISIBLE IN A SCREENSHOT, which is why it is here. A folded
 * year that cannot be unfolded, a carousel whose dots do not match its stops
 * and a technology list that highlights the wrong line all look correct.
 *
 * jsdom reports every media query as "does not match" (setupTests), so these
 * render the BASE case: the phone layout, and one card at a time. Both
 * layouts are in the document - they are hidden with `display`, so a resize
 * does not restart a rotation - so a desktop-only control can still be found
 * and driven here.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ChakraProvider } from '@chakra-ui/react';

import HistorySection from '../pages/about/components/HistorySection';
import CertificateCarousel from '../pages/about/components/CertificateCarousel';
import TechnologyShowcase from '../pages/about/components/TechnologyShowcase';
import { I18nProvider } from '../i18n';

function mount(element) {
  const host = document.createElement('div');
  document.body.appendChild(host);

  act(() => {
    ReactDOM.render(
      <ChakraProvider><I18nProvider>{element}</I18nProvider></ChakraProvider>,
      host
    );
  });

  return host;
}

function click(node) {
  act(() => {
    node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
}

/* ------------------------------------------------------------------ */
/*  history                                                           */
/* ------------------------------------------------------------------ */

const EVENTS = [
  { id: 'a', year: 2015, description: 'The company was founded.' },
  { id: 'b', year: 2019, description: 'The second factory opened.' },
  { id: 'c', year: 2025, description: 'Crystal OS shipped on every line.' },
  { id: 'd', year: 2025, description: 'And a second thing that year.' }
];

/** The fold buttons, in the order they are shown. */
function folds(host) {
  return [...host.querySelectorAll('[aria-expanded]')];
}

test('the years run newest first, and two events in one year share it', () => {
  const host = mount(<HistorySection events={EVENTS} />);

  const shown = folds(host).map((button) => button.textContent.replace(/\D/g, ''));
  expect(shown).toEqual(['2025', '2019', '2015']);

  /* Four events, three years: the two in 2025 are one entry with both. */
  const open = folds(host)[0].getAttribute('aria-controls');
  const panel = host.querySelector('#' + open);
  expect(panel.textContent).toContain('Crystal OS shipped');
  expect(panel.textContent).toContain('a second thing');
});

test('the newest year is open to begin with, and no other is', () => {
  const host = mount(<HistorySection events={EVENTS} />);
  const open = folds(host).map((button) => button.getAttribute('aria-expanded'));

  /* The request was for 2025 open by default and the rest collapsed. */
  expect(open).toEqual(['true', 'false', 'false']);
});

test('opening a year folds the one that was open, and only one is ever open', () => {
  const host = mount(<HistorySection events={EVENTS} />);

  click(folds(host)[1]);                       /* 2019 */
  expect(folds(host).map((b) => b.getAttribute('aria-expanded')))
    .toEqual(['false', 'true', 'false']);

  click(folds(host)[2]);                       /* 2015 */
  expect(folds(host).map((b) => b.getAttribute('aria-expanded')))
    .toEqual(['false', 'false', 'true']);

  /* And the open one folds away, which a default-open accordion must allow
     or the newest year can never be dismissed. */
  click(folds(host)[2]);
  expect(folds(host).map((b) => b.getAttribute('aria-expanded')))
    .toEqual(['false', 'false', 'false']);
});

test('a folded year is still in the document, so find-in-page reaches it', () => {
  const host = mount(<HistorySection events={EVENTS} />);
  const folded = folds(host)[2];

  expect(folded.getAttribute('aria-expanded')).toBe('false');
  const panel = host.querySelector('#' + folded.getAttribute('aria-controls'));
  expect(panel.textContent).toContain('The company was founded');
});

/* ------------------------------------------------------------------ */
/*  the certificate carousel                                          */
/* ------------------------------------------------------------------ */

const CERTIFICATES = [
  { id: 'c1', name: 'ISO 9001', issuer: 'SGS', year: 2021, image: '/a.png' },
  { id: 'c2', name: 'ISO 14001', issuer: 'SGS', year: 2022, image: '/b.png' },
  { id: 'c3', name: 'RoHS', issuer: 'TUV', year: 2023, image: null },
  { id: 'c4', name: 'REACH', issuer: 'TUV', year: 2024, image: '/d.png' }
];

/** The dots, which are one per stop. */
function stops(host) {
  return [...host.querySelectorAll('[aria-current], [aria-label^="Go to slide"]')]
    .filter((node) => node.getAttribute('aria-label') && node.getAttribute('aria-label').indexOf('Go to') === 0);
}

test('one card is on screen at a phone width, and there is a stop for each', () => {
  const host = mount(<CertificateCarousel certificates={CERTIFICATES} ariaLabel="Marks" />);

  /*
   * The track holds every card and is SHIFTED, rather than rendering only
   * the visible one: that is what lets the next card be seen arriving.
   */
  expect(host.querySelectorAll('[aria-label="Marks"] button').length).toBeGreaterThan(4);
  expect(stops(host).length).toBe(CERTIFICATES.length);
});

test('moving the row shifts the track by exactly one card', () => {
  const host = mount(<CertificateCarousel certificates={CERTIFICATES} ariaLabel="Marks" />);
  const track = host.querySelector('[aria-label="Marks"] > div > div');

  /* One on screen, so one card is the whole frame. */
  expect(track.style.transform).toBe('translateX(0%)');

  click(host.querySelector('[aria-label="Next slide"]'));
  expect(track.style.transform).toBe('translateX(-100%)');

  click(stops(host)[3]);
  expect(track.style.transform).toBe('translateX(-300%)');

  /* Past the end is the beginning again, not an empty frame. */
  click(host.querySelector('[aria-label="Next slide"]'));
  expect(track.style.transform).toBe('translateX(0%)');

  /* And backwards from the first is the last. */
  click(host.querySelector('[aria-label="Previous slide"]'));
  expect(track.style.transform).toBe('translateX(-300%)');
});

test('a certificate with no scan still opens, showing its name', () => {
  const host = mount(<CertificateCarousel certificates={CERTIFICATES} ariaLabel="Marks" />);

  /* RoHS has no image: the card falls back to its name, and must still be
     a button that opens the dialog. */
  const cards = [...host.querySelectorAll('[aria-label="Marks"] button')]
    .filter((button) => button.textContent.indexOf('RoHS') !== -1);
  expect(cards.length).toBe(1);

  click(cards[0]);

  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog).toBeTruthy();
  expect(dialog.textContent).toContain('RoHS');
  expect(dialog.textContent).toContain('TUV');
});

/* ------------------------------------------------------------------ */
/*  the technology block                                              */
/* ------------------------------------------------------------------ */

const TECH = [
  { id: 't1', title: 'Crystal OS', images: [{ src: '/os.svg', alt: 'Crystal OS' }] },
  { id: 't2', title: 'SmartTV OS', images: [{ src: '/tv.svg', alt: 'SmartTV OS' }] },
  { id: 't3', title: 'Computer BIOS', images: [] }
];

test('the technology whose picture is showing is the one highlighted', () => {
  const host = mount(<TechnologyShowcase items={TECH} title="Our own technology" />);

  /*
   * THE PAIRING IS THE POINT. The old block cycled four certificates beside
   * seven titles and connected nothing; `aria-current` on exactly one row -
   * the row whose picture is on screen - is that connection, and is what a
   * screen reader is told as well.
   */
  const rows = [...host.querySelectorAll('li button')];
  expect(rows.length).toBe(TECH.length);
  expect(rows.filter((row) => row.getAttribute('aria-current')).length).toBe(1);
  expect(rows[0].getAttribute('aria-current')).toBe('true');

  /* Choosing a line shows its picture and moves the highlight to it. */
  click(rows[2]);
  const after = [...host.querySelectorAll('li button')];
  expect(after[0].getAttribute('aria-current')).toBeNull();
  expect(after[2].getAttribute('aria-current')).toBe('true');
});

test('the name is under the picture, which is what the phone layout shows', () => {
  const host = mount(<TechnologyShowcase items={TECH} title="Our own technology" />);

  /* The phone layout is a picture, a name and the dots - no list of seven. */
  const phone = host.querySelector('[role="group"]');
  expect(phone.textContent).toContain('Crystal OS');
  expect(phone.textContent).not.toContain('SmartTV OS');

  click(host.querySelector('[aria-label="Next slide"]'));
  expect(phone.textContent).toContain('SmartTV OS');
});

test('a technology with no picture yet is a placeholder, not a broken image', () => {
  const host = mount(<TechnologyShowcase items={TECH} title="Our own technology" />);

  /* Computer BIOS has no file. Choosing it must not put an <img> with an
     empty src on the page, which is a request for the current URL. */
  click([...host.querySelectorAll('li button')][2]);

  [...host.querySelectorAll('img')].forEach((image) => {
    expect(image.getAttribute('src')).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/*  the overview picture, as a scene                                  */
/* ------------------------------------------------------------------ */

test('a chapter picture fills the frame and animates without a signature', () => {
  const AboutScene = require('../pages/about/components/AboutScene').default;

  const host = mount(
    <AboutScene
      desktop="/wide.svg"
      mobile="/narrow.svg"
      alt="Crystal designs and builds the electronics it sells"
      ratio={4 / 3}
    />
  );

  /*
   * ONE SCENE PER CROP, both mounted and one hidden - a scene is not a pair
   * of <img> elements that CSS can choose between, so the crop is chosen in
   * JavaScript and the other is display:none.
   */
  const scenes = host.querySelectorAll('[data-scene]');
  expect(scenes.length).toBe(2);

  /*
   * THE PICTURE IS DRAWN, which is the part that needed the `verified` prop:
   * these files are bundled into the build rather than uploaded, so there is
   * no signature to check and refusing them would leave the chapter blank.
   */
  const sources = [...host.querySelectorAll('img')].map((image) => image.getAttribute('src'));
  expect(sources.filter((src) => src && src.indexOf('narrow.svg') !== -1).length).toBe(1);
  expect(sources.filter((src) => src && src.indexOf('wide.svg') !== -1).length).toBe(1);

  /* And it covers its frame rather than being letterboxed inside it - the
     answer to "the overview image was not stretched to the width". */
  [...host.querySelectorAll('[data-scene-layer] img')].forEach((image) => {
    expect(window.getComputedStyle(image).objectFit).toBe('cover');
  });
});

test('pausing a chapter picture stops both crops, not just the mounted one', () => {
  const AboutScene = require('../pages/about/components/AboutScene').default;
  const handle = React.createRef();

  const host = mount(
    <AboutScene ref={handle} desktop="/wide.svg" mobile="/narrow.svg" alt="x" ratio={4 / 3} />
  );

  const playing = () => [...host.querySelectorAll('[data-scene-playing]')]
    .map((node) => node.getAttribute('data-scene-playing'));

  expect(playing()).toEqual(['yes', 'yes']);

  /*
   * "Repeat infinitely, but it can be stopped by code" - and both crops are
   * mounted with one hidden, so a handle that reached only the last of them
   * would leave the phone's scene running on a phone.
   */
  act(() => { handle.current.pause(); });
  expect(playing()).toEqual(['no', 'no']);

  act(() => { handle.current.play(); });
  expect(playing()).toEqual(['yes', 'yes']);
});

test('the overview reads heading, then picture, then prose', () => {
  const OverviewSection = require('../pages/about/components/OverviewSection').default;

  const host = mount(
    <OverviewSection
      section={{
        eyebrow: 'Overview',
        title: 'Crystal',
        subtitle: 'Crystal designs and builds the electronics it sells',
        description: 'A longer paragraph.',
        image_desktop: '/wide.svg',
        image_mobile: '/narrow.svg'
      }}
      facts={[{ id: 'f1', value: '2015', title: 'Founded' }]}
    />
  );

  /*
   * DOCUMENT ORDER IS THE PHONE'S ORDER, since that layout is a single
   * column - and it is also what a screen reader follows on both. The
   * picture goes UNDER THE HEADING: a chapter that opens with a photograph
   * and no words has nothing to say what is being looked at, and this
   * chapter carries the page's h1.
   */
  const marks = [...host.querySelectorAll('h1, [data-scene], p')];
  const shape = marks.map((node) => (
    node.tagName === 'H1' ? 'heading'
      : node.hasAttribute('data-scene') ? 'picture'
        : node.textContent.indexOf('designs and builds') !== -1 ? 'subtitle' : 'other'
  )).filter((name) => name !== 'other');

  expect(shape.indexOf('heading')).toBeLessThan(shape.indexOf('picture'));
  expect(shape.indexOf('picture')).toBeLessThan(shape.indexOf('subtitle'));
});

/* ------------------------------------------------------------------ */
/*  what stops a carousel                                            */
/* ------------------------------------------------------------------ */

/*
 * HOVER MUST STOP IT, and this is the kind of thing that silently stops
 * working: the pause is a boolean threaded from a mouse handler through
 * useRotation into a timer, and every link in that chain is invisible on the
 * page. A carousel that moves while somebody is reading a certificate looks
 * exactly like one that does not.
 */
function hover(node, over) {
  act(() => {
    node.dispatchEvent(new window.MouseEvent(over ? 'mouseover' : 'mouseout', { bubbles: true }));
  });
}

test('a certificate row advances on its own, and stops under the pointer', () => {
  jest.useFakeTimers();

  try {
    const host = mount(<CertificateCarousel certificates={CERTIFICATES} ariaLabel="Marks" />);
    const row = host.querySelector('[aria-label="Marks"]');
    const track = host.querySelector('[aria-label="Marks"] > div > div');

    expect(track.style.transform).toBe('translateX(0%)');

    /* It moves by itself. */
    act(() => { jest.advanceTimersByTime(4000); });
    expect(track.style.transform).toBe('translateX(-100%)');

    /* And it does not while the pointer is on it - however long you wait. */
    hover(row, true);
    act(() => { jest.advanceTimersByTime(4000 * 3); });
    expect(track.style.transform).toBe('translateX(-100%)');

    /* Taking the pointer away starts it again. */
    hover(row, false);
    act(() => { jest.advanceTimersByTime(4000); });
    expect(track.style.transform).toBe('translateX(-200%)');
  } finally {
    jest.useRealTimers();
  }
});

test('the technology row advances on its own, and stops under the pointer', () => {
  jest.useFakeTimers();

  try {
    const host = mount(<TechnologyShowcase items={TECH} title="Our own technology" />);
    const current = () => [...host.querySelectorAll('li button')]
      .map((row) => row.getAttribute('aria-current')).indexOf('true');

    expect(current()).toBe(0);

    act(() => { jest.advanceTimersByTime(4500); });
    expect(current()).toBe(1);

    hover(host.firstChild, true);
    act(() => { jest.advanceTimersByTime(4500 * 3); });
    expect(current()).toBe(1);

    hover(host.firstChild, false);
    act(() => { jest.advanceTimersByTime(4500); });
    expect(current()).toBe(2);
  } finally {
    jest.useRealTimers();
  }
});

test('an overview slot of three files is drawn as three layers', () => {
  const AboutScene = require('../pages/about/components/AboutScene').default;

  const host = mount(
    <AboutScene
      alt="x"
      ratio={4 / 3}
      layers={[
        { src: '/ground.svg', alt: 'ground', layer: { fit: 'cover', animation: 'zoom-out' } },
        { src: '/mid.svg', alt: 'mid', layer: { x: 0, y: 600, width: 1200, height: 300, animation: 'slide-bottom', delay: 300 } },
        { src: '/fore.svg', alt: 'fore', layer: { x: 790, y: 170, width: 300, height: 553, animation: 'zoom-in', delay: 1000, sheen: true } }
      ]}
    />
  );

  /*
   * ONE scene, not one per crop: a composition is placed in the frame's own
   * units, so there is nothing to choose between a wide and a narrow cut.
   */
  expect(host.querySelectorAll('[data-scene]').length).toBe(1);

  const drawn = [...host.querySelectorAll('[data-scene-layer]')];
  expect(drawn.length).toBe(3);

  /* Each layer keeps the animation it declared, in the order declared. */
  expect(drawn.map((node) => node.getAttribute('data-animation')))
    .toEqual(['zoom-out', 'slide-bottom', 'zoom-in']);

  /* The ground fills the frame; the two cut-outs sit where they were put. */
  expect(drawn[1].style.top).toBe('600px');
  expect(drawn[2].style.left).toBe('790px');

  /* And the ground covers while a cut-out is never cropped. */
  const fits = drawn.map((node) => {
    const image = node.querySelector('img');
    return image ? window.getComputedStyle(image).objectFit : null;
  });
  expect(fits[0]).toBe('cover');
  expect(fits.slice(1)).toEqual(['contain', 'contain']);
});

test('moving the pointer over a scene does not restart it', () => {
  const AboutScene = require('../pages/about/components/AboutScene').default;

  const host = mount(
    <AboutScene
      alt="x"
      ratio={4 / 3}
      layers={[
        { src: '/ground.svg', alt: 'ground', layer: { fit: 'cover', animation: 'zoom-out' } },
        { src: '/fore.svg', alt: 'fore', layer: { x: 790, y: 170, width: 300, height: 553, animation: 'zoom-in', parallax: 0.4 } }
      ]}
    />
  );

  /*
   * A REMOUNT IS HOW THIS ENGINE REPLAYS AN ANIMATION ON PURPOSE (`runId`),
   * so any accidental remount is an accidental replay. The parallax wrapper
   * used to be rendered only while a pointer existed: the first mouse move
   * wrapped the layer and leaving unwrapped it, which restarted the scene
   * twice per hover.
   *
   * Node identity is the assertion, because it is the thing that decides it -
   * the same element, still in place, has not replayed.
   */
  const frame = host.querySelector('[data-scene]');

  /*
   * THE FRAME HAS TO HAVE A SIZE or this proves nothing: the pointer tracker
   * measures the frame and gives up on a zero-sized one, which every element
   * in jsdom is - so without this the mouse move is swallowed and the test
   * passes with no hover having happened.
   */
  frame.getBoundingClientRect = () => ({
    left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600
  });

  const depthOf = () => {
    const layer = host.querySelector('[data-scene-layer="layer-2"]');
    /* The parallax wrapper is the layer's parent - see AnimationLayer. */
    return layer.parentNode.style.transform;
  };

  const before = [...host.querySelectorAll('[data-scene-layer]')];
  expect(before.length).toBe(2);
  /* At rest the wrapper is at the origin, and the wrapper EXISTS. */
  expect(depthOf()).toBe('translate3d(0px, 0px, 0)');

  act(() => {
    frame.dispatchEvent(new window.MouseEvent('mousemove', {
      bubbles: true, clientX: 40, clientY: 30
    }));
  });

  /* The pointer really moved it, so the rest of this is about a real hover. */
  expect(depthOf()).not.toBe('translate3d(0px, 0px, 0)');

  act(() => {
    frame.dispatchEvent(new window.MouseEvent('mouseout', { bubbles: true }));
  });

  /* And it comes back to the origin rather than keeping the last position. */
  expect(depthOf()).toBe('translate3d(0px, 0px, 0)');

  /* Through all of which the layers are the same elements: no replay. */
  const after = [...host.querySelectorAll('[data-scene-layer]')];
  expect(after.length).toBe(2);
  expect(after[0]).toBe(before[0]);
  expect(after[1]).toBe(before[1]);
});

test('the eyebrows and the between-chapter links are switched off, not deleted', () => {
  const { SHOW_EYEBROWS, SHOW_CHAPTER_NAVIGATION } = require('../pages/about/constants');
  const SectionHeading = require('../pages/about/components/SectionHeading').default;

  /*
   * The switches are the contract - a later change that deletes the markup
   * instead of honouring them should fail here rather than quietly agree.
   */
  expect(SHOW_EYEBROWS).toBe(false);
  expect(SHOW_CHAPTER_NAVIGATION).toBe(false);

  const host = mount(
    <SectionHeading number="03" eyebrow="Growth" title="Eleven years" description="A line." />
  );

  /* The heading and its standfirst stay; the eyebrow row goes entirely, so
     there is no empty flex box with a bottom margin left behind. */
  expect(host.textContent).toContain('Eleven years');
  expect(host.textContent).toContain('A line.');
  expect(host.textContent).not.toContain('Growth');
  expect(host.textContent).not.toContain('03');
});
