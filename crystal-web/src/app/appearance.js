import { useEffect, useState } from 'react';

/**
 * HOW WIDE THE SITE RUNS, kept per browser.
 *
 * THIS IS NOT A REDUX SLICE AND NOT A CONTEXT, deliberately. A preference
 * that nothing on the site reads in JavaScript does not need either: the
 * whole setting is ONE CSS custom property, and the layout follows it without
 * a single component re-rendering.
 *
 *   theme/index.js  sizes.container.site = var(--cr-content-width, 1560px)
 *   this file       writes --cr-content-width onto <html>
 *
 * Every Container on the site already asks for `container.site` - the header
 * bar, the mega panel, the footer, the account layout, the compare tray and
 * every Section - so all of them change together, in the same frame, with no
 * reload and with nothing to keep in step. Threading a value through a
 * provider would have meant editing each of those and re-rendering the whole
 * tree to move a number that CSS was always going to resolve anyway.
 *
 * A PROVIDER WOULD ALSO HAVE TO BE MOUNTED, in App.js, above everything. The
 * module-level store below is read the moment it is imported, which is before
 * React paints, so there is no flash of the default width on the way in.
 *
 * `useAppearance` exists only for the settings drawer, which is the one place
 * that has to show WHICH choice is current.
 *
 * STORAGE CAN THROW. Private windows, a browser with site data blocked, an
 * embedded webview - `localStorage` is not a thing you may assume exists, so
 * every access is guarded and a failure costs the reader their preference on
 * the next visit and nothing else.
 */

const KEY = 'crystal.web.appearance';

/**
 * The choices, in the order the drawer draws them.
 *
 * FOUR, AND EACH ONE IS A DIFFERENT ANSWER TO A DIFFERENT ROOM. Compact is a
 * reading measure for somebody who finds a 1226px line of text too long;
 * standard is mi.com's column and the site's own design; wide is for the
 * 27-inch monitor where the default leaves 600px of empty page either side;
 * full is the escape hatch for anybody who simply wants the window filled.
 *
 * `px: null` means no cap at all, which is not the same as a very large
 * number - a cap of 3000px still centres the column on a wider screen.
 */
export const CONTENT_WIDTHS = [
  { id: 'compact', px: 1024, label: 'components.settingsdrawer.compact' },
  { id: 'standard', px: 1226, label: 'components.settingsdrawer.standard' },
  { id: 'wide', px: 1560, label: 'components.settingsdrawer.wide' },
  { id: 'full', px: null, label: 'components.settingsdrawer.fullWidth' }
];

/*
 * WIDE UNLESS THE READER SAYS OTHERWISE. Standard is the column the site
 * was designed in, but the screens it is actually read on are wider than
 * that design assumed, and at 1226px a desktop visit was mostly margin. A
 * reader who prefers the narrower column still has it one click away in
 * the settings drawer, and their choice is remembered.
 */
export const DEFAULT_CONTENT_WIDTH = 'wide';

function widthById(id) {
  return CONTENT_WIDTHS.filter((entry) => entry.id === id)[0] || null;
}

/**
 * What is in storage, validated on the way in.
 *
 * A hand-edited or stale value is not trusted: an unknown id would resolve to
 * no width at all and leave the site running edge to edge with no way back
 * except to find this key again.
 */
function read() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { contentWidth: DEFAULT_CONTENT_WIDTH };

    const saved = JSON.parse(raw);
    const id = saved && saved.contentWidth;
    return { contentWidth: widthById(id) ? id : DEFAULT_CONTENT_WIDTH };
  } catch (err) {
    return { contentWidth: DEFAULT_CONTENT_WIDTH };
  }
}

function write(value) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(value));
  } catch (err) {
    /* The choice still applies to this page; it just will not survive a reload. */
  }
}

/** Put the choice where the stylesheet can see it. */
function apply(value) {
  try {
    const entry = widthById(value.contentWidth) || widthById(DEFAULT_CONTENT_WIDTH);
    document.documentElement.style.setProperty(
      '--cr-content-width',
      entry.px === null ? '100%' : entry.px + 'px'
    );
  } catch (err) {
    /* No document - the theme's own :root default is already correct. */
  }
}

let state = read();
const listeners = [];

apply(state);

export function getAppearance() {
  return state;
}

export function setContentWidth(id) {
  if (!widthById(id) || id === state.contentWidth) return;

  state = { contentWidth: id };
  apply(state);
  write(state);
  listeners.forEach((listener) => listener(state));
}

/** The current appearance, re-rendering the caller when it changes. */
export function useAppearance() {
  const [value, setValue] = useState(state);

  useEffect(() => {
    /*
     * Re-read on subscribe. Between the first render and this effect another
     * component could have changed the setting, and a drawer showing the
     * wrong tick is worse than one that flickers.
     */
    setValue(state);
    listeners.push(setValue);

    return () => {
      const at = listeners.indexOf(setValue);
      if (at !== -1) listeners.splice(at, 1);
    };
  }, []);

  return value;
}
