/*
 * WHAT JSDOM DOES NOT IMPLEMENT.
 *
 * Create React App loads this before every test file. What lands here is
 * strictly browser APIs jsdom leaves out - never application behaviour, which
 * would make a test pass against a stub of the thing it is testing.
 *
 * `matchMedia` is the one that matters. Chakra reads it for `useMediaQuery`
 * and `usePrefersReducedMotion`, and jsdom has never had it, so any component
 * that adapts to a viewport threw on mount - which meant those components
 * were the ones no test could reach.
 *
 * It answers "does not match" for everything. That is the right default: it
 * is what a narrow viewport and "no stated preference" both look like, so a
 * page renders its base case rather than a breakpoint nobody asked about.
 */
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = function matchMedia(query) {
    return {
      matches: false,
      media: query,
      onchange: null,

      /* Both spellings: the modern pair and the deprecated one Chakra still
         falls back to on older browsers, which is the path this app takes. */
      addEventListener: function () {},
      removeEventListener: function () {},
      addListener: function () {},
      removeListener: function () {},
      dispatchEvent: function () { return false; }
    };
  };
}

/*
 * jsdom has no layout, so anything measuring itself gets zeros rather than an
 * exception. Scrolling is the other half of that: a page that scrolls a
 * newly rendered element into view should not fail for it.
 */
if (typeof window !== 'undefined' && !window.scrollTo) {
  window.scrollTo = function scrollTo() {};
}

if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
