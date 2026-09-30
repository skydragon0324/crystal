/*
 * What jsdom does not have, and this console needs to render.
 *
 * Neither of these is an application concern - both exist in every browser
 * the console will ever run in - but jsdom implements neither, so without
 * them a mounted component throws before it has drawn anything and the
 * failure looks like a bug in the app.
 *
 * Loaded automatically by react-scripts before any test file.
 */

/*
 * Chakra reads the viewport through matchMedia: `useBreakpointValue`, the
 * responsive props on every component, and the colour-mode listener all go
 * through it.  The stub answers "no" to every query, which is jsdom's
 * effective viewport anyway - it has no layout - so components settle on
 * their base breakpoint.
 */
if (!window.matchMedia) {
  window.matchMedia = function (query) {
    return {
      matches: false,
      media: query,
      onchange: null,
      addListener: function () {},        // deprecated, still called by some libs
      removeListener: function () {},
      addEventListener: function () {},
      removeEventListener: function () {},
      dispatchEvent: function () { return false; }
    };
  };
}

/*
 * Recharts measures its container with a ResizeObserver before it draws.
 * jsdom reports every element as 0x0 regardless, so this only has to exist -
 * a chart in a test renders at nothing, which is fine, because what is being
 * checked is that it renders at all.
 */
if (typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = function ResizeObserver() {
    return {
      observe: function () {},
      unobserve: function () {},
      disconnect: function () {}
    };
  };
  global.ResizeObserver = window.ResizeObserver;
}
