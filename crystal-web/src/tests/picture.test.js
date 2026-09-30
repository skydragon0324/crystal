/*
 * A PICTURE'S WAIT, which is most of what a reader sees of it.
 *
 * Three things go wrong with an <img> on a slow connection, and all three are
 * invisible on a developer's machine: the page jumps when the file lands, the
 * space where it will be looks like a finished empty panel, and every picture
 * on a long page is fetched at once on a browser too old for loading="lazy"
 * (Chrome 72-75, which this site supports). components/common/Picture.js
 * exists for those three, so they are what is held here.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ChakraProvider } from '@chakra-ui/react';

import theme from '../theme';
import Picture from '../components/common/Picture';

const SRC = '/uploads/products/c9-pro.jpg';

/** Whatever jsdom does, these tests decide whether the browser can defer by itself. */
function nativeLazySupport(present) {
  if (present) {
    Object.defineProperty(HTMLImageElement.prototype, 'loading', {
      configurable: true, get: function () { return this.getAttribute('loading'); }
    });
  } else if ('loading' in HTMLImageElement.prototype) {
    delete HTMLImageElement.prototype.loading;
  }
}

/** An IntersectionObserver whose callback the test fires by hand. */
function watchObserver() {
  const observers = [];

  window.IntersectionObserver = function (callback, options) {
    const instance = {
      callback: callback,
      options: options,
      targets: [],
      observe: function (node) { instance.targets.push(node); },
      disconnect: function () { instance.disconnected = true; }
    };
    observers.push(instance);
    return instance;
  };

  return observers;
}

function mount(element) {
  const host = document.createElement('div');
  document.body.appendChild(host);

  act(() => {
    ReactDOM.render(<ChakraProvider theme={theme}>{element}</ChakraProvider>, host);
  });

  return {
    host,
    box: () => host.querySelector('[data-picture]'),
    img: () => host.querySelector('img'),
    skeleton: () => host.querySelector('.chakra-skeleton'),
    fire: (type) => act(() => {
      const image = host.querySelector('img');
      const event = new Event(type);
      image.dispatchEvent(event);
    }),
    done: () => act(() => { ReactDOM.unmountComponentAtNode(host); })
  };
}

const originalObserver = window.IntersectionObserver;

afterEach(() => {
  window.IntersectionObserver = originalObserver;
  nativeLazySupport(false);
  document.body.innerHTML = '';
});

test('the space is reserved and a skeleton stands in it until the file lands', () => {
  nativeLazySupport(true);
  const ui = mount(<Picture src={SRC} alt="C9 Pro" ratio={1} />);

  /* The box is the picture's shape before there is a picture: 1:1 here. */
  expect(window.getComputedStyle(ui.box()).paddingBottom).toBe('100%');
  expect(ui.box().getAttribute('data-picture')).toBe('waiting');
  expect(ui.skeleton()).not.toBe(null);

  /* The file is being fetched meanwhile, and is invisible until it is whole. */
  expect(ui.img().getAttribute('src')).toBe(SRC);
  expect(window.getComputedStyle(ui.img()).opacity).toBe('0');

  ui.fire('load');

  expect(ui.box().getAttribute('data-picture')).toBe('ready');
  expect(ui.skeleton()).toBe(null);
  expect(window.getComputedStyle(ui.img()).opacity).toBe('1');

  ui.done();
});

test('a browser without loading="lazy" is given the file only when the box comes near', () => {
  nativeLazySupport(false);
  const observers = watchObserver();

  const ui = mount(<Picture src={SRC} alt="C9 Pro" ratio={16 / 9} />);

  /* Nothing is fetched yet - this is the whole point on Chrome 72. */
  expect(ui.img()).toBe(null);
  expect(ui.skeleton()).not.toBe(null);
  expect(observers.length).toBe(1);
  expect(observers[0].targets[0]).toBe(ui.box());

  act(() => { observers[0].callback([{ isIntersecting: true }]); });

  expect(ui.img().getAttribute('src')).toBe(SRC);
  expect(observers[0].disconnected).toBe(true);

  ui.done();
});

test('an eager picture is asked for at once, whatever the browser can do', () => {
  nativeLazySupport(false);
  const observers = watchObserver();

  const ui = mount(<Picture src={SRC} alt="Hero" ratio={16 / 9} eager />);

  expect(ui.img().getAttribute('src')).toBe(SRC);
  expect(ui.img().getAttribute('loading')).toBe('eager');
  expect(observers.length).toBe(0);

  ui.done();
});

test('a picture that fails leaves its box empty rather than showing a broken mark', () => {
  nativeLazySupport(true);
  const ui = mount(<Picture src={SRC} alt="C9 Pro" ratio={1} />);

  ui.fire('error');

  expect(ui.box().getAttribute('data-picture')).toBe('failed');
  expect(ui.skeleton()).toBe(null);

  ui.done();
});

/* ------------------------------------------------------- signed pictures */

/*
 * A SIGNED PICTURE IS DRAWN FROM THE VERIFIER'S ANSWER OR NOT AT ALL.
 *
 * `verification` is the answer; `src` is not read once it is given, so the
 * public address of a signed file cannot reach an <img> as a fallback - not
 * while the check is running, and not after it has said no.
 */
test('while a signed picture is being checked there is a skeleton and no file at all', () => {
  nativeLazySupport(true);
  const ui = mount(<Picture verification={{ state: 'checking', url: null }} src={SRC} ratio={1} />);

  expect(ui.box().getAttribute('data-picture')).toBe('waiting');
  expect(ui.skeleton()).not.toBe(null);
  expect(ui.img()).toBe(null);

  ui.done();
});

test('a signed picture that did not verify shows the neutral note, never its address', () => {
  nativeLazySupport(true);
  const ui = mount(<Picture verification={{ state: 'invalid', url: null }} src={SRC} ratio={1} />);

  expect(ui.box().getAttribute('data-picture')).toBe('unverified');
  expect(ui.img()).toBe(null);
  expect(ui.host.querySelector('[role="img"]')).not.toBe(null);
  expect(ui.host.innerHTML).not.toContain(SRC);

  ui.done();
});

test('a verified picture is drawn from its object URL, and imageProps cannot swap the file', () => {
  nativeLazySupport(true);
  const ui = mount(
    <Picture
      verification={{ state: 'verified', url: 'blob:test/1' }}
      src={SRC}
      imageProps={{ src: SRC }}
      ratio={1}
    />
  );

  expect(ui.img().getAttribute('src')).toBe('blob:test/1');
  expect(ui.skeleton()).not.toBe(null);

  ui.fire('load');
  expect(ui.box().getAttribute('data-picture')).toBe('ready');
  expect(ui.skeleton()).toBe(null);

  ui.done();
});
