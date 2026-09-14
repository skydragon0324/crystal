/**
 * THE TEN CHAPTERS, in the order the story is told.
 *
 * The ids are the anchors - /about#factory - so they are a contract with
 * every link anybody has ever pasted, and they are the keys the API answers
 * under. The labels are the SHORT ones the navigator uses; the real heading
 * of each chapter is editorial copy and comes from the API with the rest of
 * it, which is why there is no title in this file.
 *
 * The numbers are written rather than derived from the index, because they
 * are shown to the reader as "06 / 10" and a chapter hidden for having no
 * content must not renumber the ones after it.
 */
export const ABOUT_SECTIONS = [
  { id: 'overview', label: 'Overview', number: '01' },
  { id: 'businesses', label: 'Businesses', number: '02' },
  /*
   * GROWTH SITS AFTER BUSINESSES, which is where it earns its place: the
   * reader has just been told what the company does, and this is how much of
   * it there now is. Putting it after Recognition would make it read as
   * another award.
   */
  { id: 'growth', label: 'Growth', number: '03' },
  { id: 'recognition', label: 'Recognition', number: '04' },
  { id: 'history', label: 'History', number: '05' },
  { id: 'institute', label: 'Institute', number: '06' },
  { id: 'factory', label: 'Factory', number: '07' },
  { id: 'manufacturing', label: 'Manufacturing', number: '08' },
  { id: 'shop', label: 'Shop', number: '09' },
  { id: 'service', label: 'Service', number: '10' },
  { id: 'presence', label: 'Presence', number: '11' }
];

/**
 * How far down the viewport a section has to be before it counts as "the one
 * being read".
 *
 * The top margin is negative by roughly the height of the two sticky bars, so
 * a heading scrolled up behind them is no longer the active chapter; the
 * bottom one is large so that the section a reader is part-way into wins over
 * the one just entering from below. Without the bottom margin the active item
 * jumps forward the instant the next heading appears, which is a chapter
 * ahead of where anybody is actually reading.
 */
export const OBSERVER_MARGIN = '-25% 0px -60% 0px';

/**
 * What a scroll has to clear: the site header plus the About navigator.
 *
 * Measured rather than hardcoded would be better, and is not worth it here -
 * both bars are fixed heights declared in siteNav and below, and a scroll
 * that lands twenty pixels off is a scroll nobody notices.
 */
export const SCROLL_OFFSET = { base: 116, md: 148 };

/** The About navigator's own height, on each of the two layouts. */
export const NAV_HEIGHT = { base: '52px', md: '56px' };
