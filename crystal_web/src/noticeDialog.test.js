/*
 * THE GREETING DIALOG, in the two shapes it takes.
 *
 * The animation itself is CSS and cannot be seen from here - what a test CAN
 * hold is everything the animation depends on: that the panel carries the
 * class the keyframes are attached to, that the hinges are drawn on the wide
 * shape and not on the narrow one, and that Chakra's own entrance is off so
 * the two are not animating the same element on the same frames.
 *
 * It also covers the footer link, which used to read "{n} more today" - a
 * count of the notices that did NOT fit, which meant nothing to somebody who
 * did not know there was a limit and did not suggest it was a link.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ChakraProvider } from '@chakra-ui/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';

import theme from './theme';
import { I18nProvider } from './i18n';
import NoticeDialog from './components/layout/NoticeDialog';
import notices from './app/noticeSlice';
import auth from './app/authSlice';
import catalog from './app/catalogSlice';
import compare from './app/compareSlice';

jest.mock('./api', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => () => Promise.resolve({ data: null }) }),
  fileUrl: (p) => p || ''
}));

/** Nine live notices, which is more than the dialog's limit of six. */
function noticeRows(count) {
  return Array.from({ length: count }).map((ignored, i) => ({
    id: i + 1,
    title: 'Notice number ' + (i + 1),
    content: '<p>Something happened.</p>',
    origin_name: 'Crystal',
    origin_color: null,
    starts_at: '2026-01-01T00:00:00.000Z',
    ends_at: null,
    sort_order: 100 - i
  }));
}

function mount({ wide, count }) {
  /*
   * A VIEWPORT WIDTH, not a guess at which query means "narrow".
   *
   * Chakra asks matchMedia one RANGE query per breakpoint - "(min-width: 30em)
   * and (max-width: 47.98em)" - and takes the one that matches. Answering
   * "true for anything with max-width in it" makes several of them match at
   * once and Chakra picks the largest, which is how a phone ended up on the
   * two-pane shape. Parsing the bounds and comparing a width answers the
   * question that was actually asked.
   */
  const px = wide ? 1440 : 420;

  window.matchMedia = (query) => {
    const min = query.match(/min-width:\s*([\d.]+)em/);
    const max = query.match(/max-width:\s*([\d.]+)em/);

    const above = !min || px >= Number(min[1]) * 16;
    const below = !max || px <= Number(max[1]) * 16;

    return {
      matches: above && below,
      media: query,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {}
    };
  };

  const store = configureStore({
    reducer: { auth, catalog, compare, notices },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
    preloadedState: {
      notices: {
        items: noticeRows(count),
        total: count,
        status: 'ready',
        silenced: false,
        seen: []
      }
    }
  });

  const host = document.createElement('div');
  document.body.appendChild(host);

  act(() => {
    ReactDOM.render(
      <ChakraProvider theme={theme}>
        <I18nProvider>
          <Provider store={store}>
            <MemoryRouter><NoticeDialog /></MemoryRouter>
          </Provider>
        </I18nProvider>
      </ChakraProvider>,
      host
    );
  });

  /* It waits before appearing, so that the page is read first. */
  act(() => { jest.advanceTimersByTime(1200); });

  return {
    text: () => document.body.textContent,
    panel: () => document.querySelector('.crystal-notice-panel'),
    seams: () => document.querySelectorAll('.crystal-notice-seam'),
    done() {
      act(() => { ReactDOM.unmountComponentAtNode(host); });
      document.body.removeChild(host);
    }
  };
}

/** The keyframes are the only place the motion exists; jsdom runs none. */
function readCss() {
  // eslint-disable-next-line global-require
  const fs = require('fs');
  // eslint-disable-next-line global-require
  const path = require('path');
  return fs.readFileSync(path.join(__dirname, 'styles', 'app.css'), 'utf8');
}

beforeEach(() => { jest.useFakeTimers(); });

afterEach(() => {
  jest.useRealTimers();

  /*
   * A test that fails never reaches its own `ui.done()`, and the checks
   * here query the whole document - so one real failure would leave its
   * dialog standing and print as three or four. Sweeping between tests
   * keeps a failure list honest about how many things are actually wrong.
   */
  document.body.innerHTML = '';
});

test('the panel carries the class the keyframes are attached to', () => {
  const ui = mount({ wide: true, count: 9 });

  expect(ui.panel()).toBeTruthy();
  ui.done();
});

test('the hinges are drawn on the wide shape', () => {
  /*
   * Two seams for a panel that opens in three, which is the whole point of
   * the gesture - one seam would be a single fold.
   */
  const ui = mount({ wide: true, count: 9 });

  expect(ui.seams().length).toBe(2);
  ui.done();
});

test('there are no hinges on a phone', () => {
  /* A phone showing a phone unfolding is a joke that does not land. */
  const ui = mount({ wide: false, count: 9 });

  expect(ui.panel()).toBeTruthy();
  expect(ui.seams().length).toBe(0);
  ui.done();
});

test('every live notice is in the dialog, on both shapes', () => {
  /*
   * THE LIMIT THIS REPLACED.
   *
   * Six were shown and the rest were behind a "See all 9 notifications"
   * link - which is a link only ever offered to somebody who cannot see
   * what it is offering, and which sent a reader to another page to finish
   * reading what they had already opened. All nine are here now, on both
   * shapes, and the columns scroll.
   */
  [true, false].forEach((wide) => {
    const ui = mount({ wide, count: 9 });

    for (let i = 1; i <= 9; i += 1) {
      expect(ui.text()).toContain('Notice number ' + i);
    }

    ui.done();
  });
});

test('nothing links away from the greeting', () => {
  const ui = mount({ wide: true, count: 9 });

  expect(ui.text()).not.toContain('See all');
  expect(document.querySelector('a[href="/notifications"]')).toBeNull();

  ui.done();
});

test('the body gives way rather than capping itself in vh', () => {
  /*
   * THE TRAP THIS AVOIDS.
   *
   * With every notice in the list the body has to be the part that
   * shrinks. It used to be `maxH="58vh"`, a number picked against a tall
   * window: on a short one, 58vh plus a header plus a footer came to more
   * than the 80vh the panel allows, and the panel clips - so the footer
   * and its Got it button were cut off entirely.
   *
   * A flex child that may shrink cannot be wrong about a window it has
   * never seen. The one height in vh belongs on the outer shell, which is
   * the thing actually measured against the viewport.
   */
  const ui = mount({ wide: true, count: 9 });

  const body = document.querySelector('.chakra-modal__body');
  expect(body).toBeTruthy();

  const style = window.getComputedStyle(body);
  expect(style.flexGrow).toBe('1');
  expect(style.minHeight).toBe('0px');
  expect(style.maxHeight === '' || style.maxHeight === 'none').toBe(true);

  ui.done();
});

test('the columns are flexed to their height, never a percentage of it', () => {
  /*
   * THE BUG THIS REPLACED: the list did not scroll.
   *
   * The columns hung off `h="100%"`, and a percentage height only resolves
   * against a parent whose own height is DEFINITE. This one's comes from
   * flexing inside a container that has a max-height and no height - and
   * when that does not resolve, `height: 100%` falls back to `auto`
   * without a word. The column then grows to fit every notice, the panel
   * clips whatever hangs off the bottom, and there is nothing to scroll:
   * no error, no warning, just a list that ends early.
   *
   * The whole chain is flex now, so nothing has to resolve. Which is a
   * structural fact a test can hold, unlike the scrolling itself - jsdom
   * lays nothing out and every box here is zero by zero.
   */
  const ui = mount({ wide: true, count: 9 });

  const body = document.querySelector('.chakra-modal__body');

  const bodyStyle = window.getComputedStyle(body);
  expect(bodyStyle.display).toBe('flex');
  expect(bodyStyle.flexDirection).toBe('column');

  /* Not one percentage height between the body and the scrolling column. */
  const scrollers = [];

  Array.prototype.forEach.call(body.querySelectorAll('*'), (el) => {
    const s = window.getComputedStyle(el);
    expect(s.height).not.toBe('100%');
    if (s.overflowY === 'auto') scrollers.push(el);
  });

  /* The titles and the reading pane, each scrolling on its own. */
  expect(scrollers.length).toBe(2);

  scrollers.forEach((el) => {
    /* `min-height: auto` on a flex item refuses to shrink below its
       content, which is the other way this silently stops scrolling. */
    expect(window.getComputedStyle(el).minHeight).toBe('0px');
  });

  ui.done();
});

test('the dialog is titled for what it is', () => {
  const ui = mount({ wide: true, count: 9 });

  expect(ui.text()).toContain('Notifications');
  expect(ui.text()).not.toContain('From Crystal today');

  ui.done();
});

test('the unfold starts at the centre, not at an edge', () => {
  /*
   * THE BUG THIS REPLACED.
   *
   * The first version revealed left to right - `inset(0 66% 0 0)` - which is
   * a drawer sliding open, not a tri-fold. A real one is folded to the width
   * of its CENTRE panel with the wings tucked behind, so the first frame has
   * to be inset from BOTH sides by the same third.
   *
   * The CSS is read rather than the DOM, because jsdom runs no animations -
   * the keyframes are the only place this fact exists.
   */
  // eslint-disable-next-line global-require
  const fs = require('fs');
  // eslint-disable-next-line global-require
  const path = require('path');

  const css = fs.readFileSync(path.join(__dirname, 'styles', 'app.css'), 'utf8');

  const unfold = css.slice(css.indexOf('@keyframes crystal-notice-unfold'));
  const body = unfold.slice(0, unfold.indexOf('\n}'));

  const first = body.match(/0%\s*\{[\s\S]*?clip-path: inset\(([^)]+)\)/);
  expect(first).toBeTruthy();

  /* "0 33.34% 0 33.34%" - top right bottom left, and the sides must match. */
  const sides = first[1].trim().split(/\s+/);
  expect(sides.length).toBe(4);
  expect(sides[1]).toBe(sides[3]);
  expect(parseFloat(sides[1])).toBeGreaterThan(30);
  expect(parseFloat(sides[1])).toBeLessThan(35);

  /* And it ends fully open. */
  expect(body).toContain('clip-path: inset(0 0 0 0)');
});

test('the two creases do not fade together', () => {
  /*
   * They are separate hinges. Fading both at the end would draw two lines
   * that sit still and then vanish at once, which reads as decoration
   * painted on a box rather than as panels moving.
   */
  // eslint-disable-next-line global-require
  const fs = require('fs');
  // eslint-disable-next-line global-require
  const path = require('path');

  const css = fs.readFileSync(path.join(__dirname, 'styles', 'app.css'), 'utf8');

  const left = css.slice(css.indexOf('@keyframes crystal-notice-seam-left'));
  const right = css.slice(css.indexOf('@keyframes crystal-notice-seam-right'));

  expect(left.slice(0, left.indexOf('\n}'))).not.toBe(right.slice(0, right.indexOf('\n}')));
});

test('the centre never moves - only the wings do', () => {
  /*
   * THE NOTE THAT PROMPTED THIS DESIGN.
   *
   * The lift used to be a translateY on the whole panel, which took the
   * centre with it: the device appeared to hop rather than unfold. On a real
   * tri-fold the centre is the part being held and it does not move at all.
   *
   * So the panel's own keyframes may change its WIDTH and its opacity and
   * nothing else - any transform there moves the middle.
   */
  const css = readCss();

  const unfold = css.slice(css.indexOf('@keyframes crystal-notice-unfold'));
  const body = unfold.slice(0, unfold.indexOf('\n}\n'));

  expect(body).toContain('clip-path');
  expect(body).not.toContain('translateY');
  expect(body).not.toContain('rotate');
});

test('each wing hinges out and arcs on the way', () => {
  /*
   * A wing travels on a hinge: it rotates about its inner edge, and tilts
   * toward the reader through the middle of the swing before settling
   * square. Without that arc the movement is a rectangle widening.
   */
  const css = readCss();

  ['left', 'right'].forEach((side) => {
    const at = css.indexOf('@keyframes crystal-notice-wing-' + side);
    expect(at).toBeGreaterThan(-1);

    const body = css.slice(at, css.indexOf('\n}\n', at));

    /* Folded at the start... */
    expect(body).toMatch(/rotateY\(-?92deg\)/);
    /* ...arced through the middle... */
    expect(body).toMatch(/rotateX\([1-9][\d.]*deg\)/);
    /* ...and square at the end. */
    expect(body.slice(body.lastIndexOf('100%'))).toContain('rotateY(0deg) rotateX(0deg)');
  });
});

test('the wings are the panel colour, not a black slab', () => {
  /*
   * The background does not change while it folds - only the shape does.
   * A dark face was tried and read as a different component appearing.
   */
  const ui = mount({ wide: true, count: 9 });

  const wings = document.querySelectorAll('.crystal-notice-wing');
  expect(wings.length).toBe(2);

  expect(readCss()).not.toContain('crystal-notice-face');

  ui.done();
});

test('the keys stand outside the case, not on it', () => {
  /*
   * Volume up, volume down, power - in that order down the right side,
   * where a phone keeps them.
   *
   * THE POINT IS THAT THEY PROTRUDE. Flush with the edge they are a stripe
   * printed on the back; hanging off it, with the overlay showing around
   * them, they are buttons. So the offset has to be NEGATIVE, and they
   * have to sit outside the panel in the DOM - the panel clips, and a key
   * inside it would be sheared off at the very edge it needs to cross.
   */
  const ui = mount({ wide: true, count: 9 });

  const keys = document.querySelector('.crystal-notice-keys');
  expect(keys).toBeTruthy();
  expect(keys.querySelectorAll('span').length).toBe(3);

  /* Outside the clipping panel. */
  expect(keys.closest('.crystal-notice-panel')).toBeNull();

  const css = readCss();
  const rule = css.slice(css.indexOf('.crystal-notice-keys {'));
  const body = rule.slice(0, rule.indexOf('}'));

  const right = body.match(/right:\s*(-?[\d.]+)rem/);
  expect(right).toBeTruthy();
  expect(parseFloat(right[1])).toBeLessThan(0);

  ui.done();
});

test('a wing stands down once it is flat', () => {
  /*
   * THE BUG THIS REPLACED: the content was readable only down the middle.
   *
   * A wing is an OPAQUE slab in the panel's own colour, laid over its
   * third of the dialog. Ending the swing at rotateY(0) leaves it there
   * for good - square, invisible as a shape, and covering everything
   * behind it. Both wings have to reach zero opacity by the end.
   */
  const css = readCss();

  ['left', 'right'].forEach((side) => {
    const at = css.indexOf('@keyframes crystal-notice-wing-' + side);
    const body = css.slice(at, css.indexOf('\n}\n', at));

    const last = body.slice(body.lastIndexOf('100%'));
    expect(last).toContain('opacity: 0');
  });
});

test('the folded device is not blank - it shows the mark', () => {
  /*
   * The unfold runs for most of a second with the content held back until
   * both wings are flat. With nothing on the panel that is a dialog being
   * slow; with the mark on it, it is a device opening.
   *
   * It must NOT take the content's cue - the content rule is written as a
   * :not() list, so a new child of the panel joins it by default and would
   * be invisible for precisely the stretch it exists to cover.
   */
  const ui = mount({ wide: true, count: 9 });

  const splash = document.querySelector('.crystal-notice-splash');
  expect(splash).toBeTruthy();
  expect(splash.textContent).toContain('Crystal');

  const css = readCss();

  const held = css.slice(css.indexOf('.crystal-notice-panel > :not(.crystal-notice-wing)'));
  expect(held.slice(0, held.indexOf('{'))).toContain(':not(.crystal-notice-splash)');

  /* And it hands over rather than leaving a gap: out before content is in. */
  const at = css.indexOf('@keyframes crystal-notice-splash-out');
  expect(at).toBeGreaterThan(-1);
  expect(css.slice(at, css.indexOf('\n}\n', at))).toContain('opacity: 0');

  ui.done();
});

test('a phone gets no wings, no frame and no placeholder', () => {
  const ui = mount({ wide: false, count: 9 });

  expect(document.querySelectorAll('.crystal-notice-wing').length).toBe(0);
  expect(document.querySelector('.crystal-notice-keys')).toBeNull();
  expect(document.querySelector('.crystal-notice-splash')).toBeNull();

  ui.done();
});
