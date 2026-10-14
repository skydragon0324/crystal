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

/* ------------------------------------------------------------------ */
/*  the overview composition                                          */
/* ------------------------------------------------------------------ */

const OVERVIEW_PIECES = {
  sky: { src: '/sky.svg', role: 'sky', alt: 'A clear sky' },
  name: { src: '/name.svg', role: 'name', alt: 'Crystal Trading Company' },
  tagline: { src: '/tagline.svg', role: 'tagline', alt: 'Bluesky is everywhere' },
  'cloud-far': { src: '/c3.svg', role: 'cloud-far', alt: 'A cloud in the distance' },
  'cloud-mid': { src: '/c2.svg', role: 'cloud-mid', alt: 'A drifting cloud' },
  'cloud-near': { src: '/c1.svg', role: 'cloud-near', alt: 'A cloud near the horizon' },
  globe: { src: '/globe.svg', role: 'globe', alt: 'A globe' },
  trail: { src: '/trail.svg', role: 'trail', alt: 'The trail' },
  plane: { src: '/plane.svg', role: 'plane', alt: 'An aeroplane in flight' }
};

const asList = (pieces) => Object.keys(pieces).map((role) => pieces[role]);

test('the overview is one composition: a sky, clouds, a globe, a plane and two lines', () => {
  const overviewLayers = require('../pages/about/overviewScene').default;

  /* 16:5, the desktop frame. */
  const layers = overviewLayers(1200, 375, OVERVIEW_PIECES);

  /*
   * EVERY PIECE IS PLACED, and in the order it is stacked: the sky at the
   * back, the aeroplane in front of its own trail, the words over both.
   */
  expect(layers.map((layer) => layer.id)).toEqual([
    'sky', 'cloud-far', 'cloud-mid', 'cloud-near', 'globe', 'trail', 'plane', 'tagline', 'name'
  ]);
  expect(layers.map((layer) => layer.z)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);

  const at = (id) => layers.filter((layer) => layer.id === id)[0];

  /* The sky is the plate: it fills the frame and covers it. */
  expect(at('sky').fit).toBe('cover');
  expect(at('sky').width).toBeUndefined();
  expect(at('sky').animation.name).toBe('none');

  /* The clouds drift for ever, and lean with the pointer by increasing
     amounts - which is the thing that reads as depth. */
  const clouds = ['cloud-far', 'cloud-mid', 'cloud-near'].map(at);
  clouds.forEach((cloud) => expect(cloud.animation.name).toBe('drifting'));
  expect(clouds[0].parallax).toBeLessThan(clouds[1].parallax);
  expect(clouds[1].parallax).toBeLessThan(clouds[2].parallax);
  /* Different periods, or three clouds move as one object. */
  expect(new Set(clouds.map((cloud) => cloud.animation.duration)).size).toBe(3);

  /*
   * AND THE CLOUDS ARE THE ONLY THING THE POINTER MOVES. The globe and the
   * aeroplane had a little parallax each at first, which did not read as
   * depth - it read as the whole picture tilting.
   */
  const leaning = layers.filter((layer) => layer.parallax).map((layer) => layer.id);
  expect(leaning).toEqual(['cloud-far', 'cloud-mid', 'cloud-near']);

  /* The globe is on the LEFT, and the aeroplane stops to the right of it. */
  expect(at('globe').x).toBeLessThan(1200 * 0.1);
  expect(at('plane').x).toBeGreaterThan(at('globe').x + at('globe').width);

  /*
   * THE AEROPLANE FLIES IN FROM THE RIGHT and decelerates to a stop; the
   * trail dissipates with it. The direction is in the animation's NAME, like
   * `slide-right` - and the artwork is mirrored to match, which no keyframe
   * could do for it.
   */
  expect(at('plane').animation.name).toBe('fly-in-right');
  expect(at('plane').animation.easing).toBe('ease-out');
  expect(at('trail').animation.name).toBe('trailing-right');
  expect(at('trail').animation.delay).toBe(at('plane').animation.delay);
  /* And the trail is BEHIND it - to its RIGHT now, which is where it came
     from - overlapping the tail. */
  expect(at('trail').x).toBeGreaterThan(at('plane').x);

  /*
   * BOTH LINES ARE PICTURES, not text layers: a wordmark and a strapline have
   * their own faces and arrive as files. What they SAY is in the alt text,
   * which is the whole of the accessibility story for a picture of words.
   */
  expect(at('name').type).toBe('image');
  expect(at('name').alt).toBe('Crystal Trading Company');
  expect(at('tagline').type).toBe('image');
  expect(at('tagline').alt).toBe('Bluesky is everywhere');
});

test('the words wait for the aeroplane to stop, and arrive where it left room', () => {
  const overviewLayers = require('../pages/about/overviewScene').default;
  const layers = overviewLayers(1200, 375, OVERVIEW_PIECES);
  const at = (id) => layers.filter((layer) => layer.id === id)[0];

  const plane = at('plane');
  const stops = plane.animation.delay + plane.animation.duration;

  /*
   * THE SEQUENCE IS THE POINT, and it is the thing a hand-counted set of
   * delays gets wrong: the name must not begin before the aeroplane has come
   * to rest, and the line to its right follows the name rather than racing it.
   */
  expect(at('tagline').animation.delay).toBeGreaterThan(stops);

  /* The strapline first, the name after it - not racing it. */
  expect(at('name').animation.delay)
    .toBeGreaterThanOrEqual(at('tagline').animation.delay + at('tagline').animation.duration);

  /* BENEATH the aeroplane, and centred on it. */
  const name = at('name');
  expect(name.y).toBeGreaterThan(plane.y + plane.height);
  expect(Math.round(name.x + name.width / 2)).toBe(Math.round(plane.x + plane.width / 2));

  /* At the artwork's own shape, so `contain` neither crops nor letterboxes. */
  expect(Math.round((name.width / name.height) * 100) / 100)
    .toBe(Math.round((900 / 140) * 100) / 100);

  /* TO THE RIGHT of it, and still inside the frame. */
  const tagline = at('tagline');
  expect(tagline.x).toBeGreaterThan(plane.x + plane.width);
  expect(tagline.x + tagline.width).toBeLessThanOrEqual(1200);
  expect(tagline.animation.name).toBe('fade-in');
});

test('the same composition fits both frame shapes', () => {
  const overviewLayers = require('../pages/about/overviewScene').default;

  /*
   * 16:9 on a phone and 16:5 on a desktop. A composition with its geometry
   * written as numbers would be wrong in one of them - the globe hanging in
   * mid-air, the name running off the bottom - which is the whole reason the
   * positions are derived from the frame.
   */
  const shapes = [[1200, Math.round(1200 / (16 / 9))], [1200, Math.round(1200 / (16 / 5))]];

  shapes.forEach(([width, height]) => {
    const layers = overviewLayers(width, height, OVERVIEW_PIECES);
    expect(layers.length).toBe(9);

    /* Nothing is NaN, which is what a division by an absent frame gives. */
    const numbers = layers.reduce((all, layer) => all.concat(
      ['x', 'y', 'width', 'height'].map((field) => layer[field])
        .filter((value) => value !== undefined)
    ), []);
    expect(numbers.filter((value) => !Number.isFinite(value))).toEqual([]);

    /*
     * EVERY PIECE SITS INSIDE THE FRAME, except the wake.
     *
     * The aeroplane enters from outside the picture by its ANIMATION rather
     * than by its position - it is placed where it STOPS - so a layer whose
     * x is off the plate is a mistake in the composition. The trail is the
     * one exception, and is one on purpose: it is what the aeroplane has
     * flown through, so it reaches back past the RIGHT edge - the side it
     * came from - and is clipped there.
     */
    const overflowing = layers
      .filter((layer) => layer.width !== undefined)
      .filter((layer) => layer.id !== 'trail')
      .filter((layer) => layer.x < 0 || layer.x + layer.width > width + 1)
      .map((layer) => layer.id);
    expect(overflowing).toEqual([]);

    /* And it does reach back behind the aeroplane rather than stopping short. */
    const wake = layers.filter((layer) => layer.id === 'trail')[0];
    const flyer = layers.filter((layer) => layer.id === 'plane')[0];
    expect(wake.x).toBeGreaterThan(flyer.x);

    /*
     * It is NOT required to reach the edge. On the shallow desktop frame it
     * ends inside the picture, and that is invisible: the artwork fades to
     * transparent at the end away from the aircraft, so the wake has no
     * visible tip to give away where it stops.
     */

    /* And the words are on the plate rather than off the bottom of it. */
    const name = layers.filter((layer) => layer.id === 'name')[0];
    expect(name.y + name.height).toBeLessThan(height);
  });
});

test('a piece that has not been drawn yet is left out, not drawn empty', () => {
  const overviewLayers = require('../pages/about/overviewScene').default;

  /*
   * The real artwork is replaced a piece at a time; a missing file must not
   * put an <img> with no src on the page. Now that the two lines are pictures
   * too, they are left out by the same rule rather than being the one thing
   * that always draws.
   */
  const partial = { sky: OVERVIEW_PIECES.sky, plane: OVERVIEW_PIECES.plane };
  const layers = overviewLayers(1200, 375, partial);

  expect(layers.map((layer) => layer.id)).toEqual(['sky', 'plane']);
  layers.forEach((layer) => expect(layer.src).toBeTruthy());
});

test('the overview chapter draws one scene, whatever the width', () => {
  const AboutScene = require('../pages/about/components/AboutScene').default;
  const overviewLayers = require('../pages/about/overviewScene').default;

  const host = mount(
    <AboutScene
      alt="Crystal"
      ratio={{ base: 16 / 9, md: 16 / 5 }}
      layers={asList(OVERVIEW_PIECES)}
      compose={overviewLayers}
    />
  );

  /*
   * ONE, not one per crop: a composition is placed in the frame's own units,
   * so there is nothing to choose between a wide and a narrow cut of it.
   */
  expect(host.querySelectorAll('[data-scene]').length).toBe(1);
  expect(host.querySelectorAll('[data-scene-layer]').length).toBe(9);

  /* The sky covers its frame; the cut-outs over it are never cropped. */
  const sky = host.querySelector('[data-scene-layer="sky"] img');
  expect(window.getComputedStyle(sky).objectFit).toBe('cover');

  const cloud = host.querySelector('[data-scene-layer="cloud-near"] img');
  expect(window.getComputedStyle(cloud).objectFit).toBe('contain');

  /*
   * And the two lines are PICTURES of words, so they are found by what they
   * say in their alt text rather than in the page's text.
   */
  expect(host.querySelector('[data-scene-layer="name"] img').getAttribute('alt'))
    .toBe('Crystal Trading Company');
  expect(host.querySelector('[data-scene-layer="tagline"] img').getAttribute('alt'))
    .toBe('Bluesky is everywhere');
  expect(host.textContent).not.toContain('Crystal Trading Company');
});

test('moving the pointer over a scene does not restart it', () => {
  const AboutScene = require('../pages/about/components/AboutScene').default;

  /* A two-layer composition, the second of which has depth. */
  const compose = (width, height, pieces) => [
    {
      id: 'ground',
      type: 'image',
      src: pieces.sky.src,
      alt: 'ground',
      fit: 'cover',
      x: 0,
      y: 0,
      z: 1,
      animation: { name: 'none', duration: 400 }
    },
    {
      id: 'near',
      type: 'image',
      src: pieces.plane.src,
      alt: 'near',
      x: width * 0.3,
      y: height * 0.2,
      width: width * 0.2,
      height: height * 0.2,
      z: 2,
      parallax: 0.4,
      animation: { name: 'fly-in-right', duration: 900, easing: 'ease-out' }
    }
  ];

  const host = mount(
    <AboutScene
      alt="x"
      ratio={16 / 5}
      layers={asList(OVERVIEW_PIECES)}
      compose={compose}
    />
  );

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
    const layer = host.querySelector('[data-scene-layer="near"]');
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

test('a recognition scan is shown whole, in a frame its own shape', () => {
  const CertificateCard = require('../pages/about/components/CertificateCard').default;

  /*
   * `contain` alone was not enough. The corporate scans are 274x204 -
   * landscape - and the card's frame was 3:4, so a scan was shown uncropped
   * and TINY, in two grey bands. The frame has to be the shape of the thing
   * in it for "shown fully" to mean anything.
   */
  const host = mount(
    <CertificateCard
      certificate={{ id: 'c1', name: 'ISO 9001', issuer: 'SGS', year: 2021, image: '/a.png' }}
      onOpen={() => {}}
      ratio={274 / 204}
    />
  );

  /*
   * UNCROPPED, AND THE ASSERTION HAS TO BE THE COMPUTED STYLE rather than
   * the prop. `objectFit="contain"` was set here for a while and did nothing:
   * the AspectRatio around it emits `& > img { object-fit: cover }`, and a
   * descendant selector beats the class a prop mints. Reading the prop back
   * would have agreed with the code and disagreed with the screen.
   */
  const image = host.querySelector('img');
  expect(window.getComputedStyle(image).objectFit).toBe('contain');

  /*
   * THE FRAME'S SHAPE IS NOT CHECKED HERE, and that is a limit of the runner
   * rather than an oversight: Chakra reserves it as `padding-bottom` on a
   * `::before`, jsdom's getComputedStyle does not resolve pseudo-elements,
   * and Emotion inserts its rules through the CSSOM so the stylesheet cannot
   * be read back either. Asserting the prop instead would prove only that a
   * number was passed, which is what the broken `objectFit` already did.
   *
   * The crop is the half that CAN be measured, and it was the half that was
   * wrong: a scan in the wrong-shaped frame is small, a cropped one has its
   * seal cut off.
   */
});

test('the scene takes the sky plate cut for the frame it is drawing', () => {
  const overviewLayers = require('../pages/about/overviewScene').default;

  const pieces = {
    sky: { src: '/sky-wide.svg', role: 'sky', alt: 'A clear sky' },
    'sky-mobile': { src: '/sky-tall.svg', role: 'sky-mobile', alt: 'A clear sky' }
  };

  const skyOf = (shape) => overviewLayers(1200, Math.round(1200 / shape), pieces)
    .filter((layer) => layer.id === 'sky')[0];

  /*
   * THE WIDE PLATE ACROSS A DESKTOP AND THE TALL ONE ON A PHONE. One plate
   * for both is what made the background a visibly different picture at the
   * two widths - `cover` has to crop something, and whichever shape the file
   * is drawn at, the other frame pays for it.
   */
  expect(skyOf(16 / 5).src).toBe('/sky-wide.svg');
  expect(skyOf(16 / 9).src).toBe('/sky-tall.svg');

  /* Either way the LAYER is called `sky`: which file it came from is not
     something the rest of the scene should have to know. */
  expect(skyOf(16 / 9).id).toBe('sky');
  expect(skyOf(16 / 9).fit).toBe('cover');

  /* And with only the wide file present, a phone still has a sky - cropped,
     which is better than a chapter that opens on nothing. */
  const wideOnly = overviewLayers(1200, 675, { sky: pieces.sky })
    .filter((layer) => layer.id === 'sky')[0];
  expect(wideOnly.src).toBe('/sky-wide.svg');
});

test('the two frame shapes get their own sizes and positions, not one formula', () => {
  const overviewLayers = require('../pages/about/overviewScene').default;
  const { layoutFor } = require('../pages/about/overviewScene');

  const pieces = Object.assign({}, OVERVIEW_PIECES, {
    'sky-mobile': { src: '/sky-tall.svg', role: 'sky-mobile', alt: 'A clear sky' }
  });

  const shareOf = (shape, id) => {
    const layer = overviewLayers(1200, Math.round(1200 / shape), pieces)
      .filter((l) => l.id === id)[0];
    /* As a fraction of the WIDTH, which is the same 1200 in both - the one
       way two differently-shaped frames can be compared at all. */
    return Math.round((layer.width / 1200) * 100);
  };

  /*
   * ONE SET OF FRACTIONS USED TO SERVE BOTH, which looked principled and was
   * not: the frames differ by nearly two to one in height, so the same
   * numbers gave the aeroplane a fifth of the width on a desktop and over a
   * third on a phone - a real difference nobody had chosen. Each shape states
   * its own now, and these are the figures that say so.
   */
  expect(shareOf(16 / 5, 'plane')).toBe(20);
  expect(shareOf(16 / 9, 'plane')).toBe(42);

  /* The wordmark likewise: a narrow viewport needs it to carry more width. */
  expect(shareOf(16 / 9, 'name')).toBeGreaterThan(shareOf(16 / 5, 'name'));

  /* The layouts really are two objects, picked by the frame's shape. */
  expect(layoutFor(1200, 375)).not.toBe(layoutFor(1200, 675));
  expect(layoutFor(1200, 375)).toBe(layoutFor(1920, 600));

  /* DEPTH IS NOT PER-SHAPE, because depth is depth: the clouds lean the same
     amount whichever frame they are in. */
  const depths = (shape) => overviewLayers(1200, Math.round(1200 / shape), pieces)
    .filter((l) => l.parallax)
    .map((l) => l.parallax);
  expect(depths(16 / 9)).toEqual(depths(16 / 5));

  /* And nothing in either layout escapes its frame or lands on the wordmark. */
  [16 / 5, 16 / 9].forEach((shape) => {
    const height = Math.round(1200 / shape);
    const layers = overviewLayers(1200, height, pieces);
    const at = (id) => layers.filter((l) => l.id === id)[0];

    expect(at('name').y + at('name').height).toBeLessThan(height);
    /* The middle cloud sits above the name rather than through it. */
    expect(at('cloud-mid').y + at('cloud-mid').height).toBeLessThan(at('name').y);
  });
});
