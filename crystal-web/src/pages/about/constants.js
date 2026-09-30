/**
 * THE TEN CHAPTERS, in the order the story is told.
 *
 * The ids are the anchors - /about#factory - so they are a contract with
 * every link anybody has ever pasted, and they are the keys the local content
 * map answers under. The labels are the SHORT ones the navigator uses; the
 * real heading of each chapter lives in content.js.
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
  /*
   * MANUFACTURING IS PART OF THE FACTORY CHAPTER, not a chapter of its own.
   * They were two numbered bands describing one building - where it is, then
   * what happens in it - and a reader following the numbers met the same
   * factory twice. Its old anchor still lands here; see CHAPTER_ALIASES.
   */
  { id: 'factory', label: 'Factory', number: '07' },
  { id: 'shop', label: 'Shop', number: '08' },
  { id: 'service', label: 'Service', number: '09' },
  { id: 'presence', label: 'Presence', number: '10' }
];

/**
 * Anchors that used to be chapters, and the chapter that now holds them.
 *
 * An anchor is a contract with every link anybody has pasted, so a chapter
 * that is folded into another keeps its old address working - it lands on
 * the chapter that took it in, rather than on the top of the page.
 */
export const CHAPTER_ALIASES = {
  manufacturing: 'factory'
};

/**
 * A chapter's number, by its id.
 *
 * THE NUMBERS WERE WRITTEN INTO EVERY COMPONENT, and they had drifted: the
 * navigator called History "05" while its own heading said "04", and four
 * other chapters disagreed the same way. The navigator is the thing a reader
 * uses to find a chapter, so a heading that shows a different number is
 * pointing them at the wrong one. One list decides both now.
 */
export function chapterNumber(id) {
  const found = ABOUT_SECTIONS.filter((section) => section.id === id)[0];
  return found ? found.number : null;
}

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
