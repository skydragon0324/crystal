/*
 * THE CONTENT WIDTH IS A CSS VARIABLE, AND THAT IS THE WHOLE DESIGN.
 *
 * Ten components ask the theme for `container.site` - the header bar, the
 * mega panel, the footer, the account layout, the compare tray and every
 * Section - and the token resolves to `var(--cr-content-width, 1560px)`. So
 * changing the preference is one `setProperty` call on <html> and every one
 * of them follows in the same frame, with no reload and nothing re-rendered.
 *
 * Two things can quietly break that, and neither shows up in a diff:
 *
 *   THE TOKEN STOPS BEING A VARIABLE. Somebody "simplifies" it back to
 *   '1560px' and the drawer's controls do nothing at all - they still tick,
 *   they still persist, and the page never moves.
 *
 *   STORAGE HOLDS SOMETHING UNEXPECTED. A stale id from an older build, or a
 *   hand-edited value, resolving to no width would leave the site running
 *   edge to edge with no way back except finding the key again.
 */
import theme from '../theme';

/* The store keeps module-level state, so each test gets a fresh copy of it. */
function load() {
  let module;
  jest.isolateModules(() => {
    module = require('../app/appearance');
  });
  return module;
}

const KEY = 'crystal.web.appearance';

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.style.removeProperty('--cr-content-width');
});

test('the theme resolves its content column through the variable', () => {
  expect(theme.sizes.container.site).toBe('var(--cr-content-width, 1560px)');
});

test('a fresh browser gets the wide column, written out as a real length', () => {
  const appearance = load();

  expect(appearance.getAppearance().contentWidth).toBe('wide');
  expect(document.documentElement.style.getPropertyValue('--cr-content-width')).toBe('1560px');
});

test('choosing a width applies it and remembers it', () => {
  const appearance = load();

  /* Standard, because wide is the default and choosing it changes nothing. */
  appearance.setContentWidth('standard');

  expect(document.documentElement.style.getPropertyValue('--cr-content-width')).toBe('1226px');
  expect(JSON.parse(window.localStorage.getItem(KEY))).toEqual({ contentWidth: 'standard' });

  /* And a second browser session picks it back up. */
  const again = load();
  expect(again.getAppearance().contentWidth).toBe('standard');
  expect(document.documentElement.style.getPropertyValue('--cr-content-width')).toBe('1226px');
});

test('full width is no cap at all, not a very large one', () => {
  /*
   * A cap of 3000px still CENTRES the column on a wider screen, which is not
   * what "full width" means to anybody who chose it.
   */
  const appearance = load();
  appearance.setContentWidth('full');

  expect(document.documentElement.style.getPropertyValue('--cr-content-width')).toBe('100%');
});

test('a value that is not one of the choices falls back to the default', () => {
  window.localStorage.setItem(KEY, JSON.stringify({ contentWidth: 'enormous' }));
  expect(load().getAppearance().contentWidth).toBe('wide');

  window.localStorage.setItem(KEY, 'not json at all');
  expect(load().getAppearance().contentWidth).toBe('wide');

  /* And setting an unknown id is ignored rather than stored. */
  const appearance = load();
  appearance.setContentWidth('enormous');
  expect(appearance.getAppearance().contentWidth).toBe('wide');
});

test('a browser with storage switched off still renders and still switches', () => {
  /*
   * Private windows, blocked site data and some embedded webviews throw on
   * the first getItem. Losing the preference between visits is acceptable;
   * a blank page is not.
   */
  const real = window.localStorage.getItem;
  window.localStorage.getItem = () => {
    throw new Error('denied');
  };

  try {
    const appearance = load();
    expect(appearance.getAppearance().contentWidth).toBe('wide');

    const write = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      throw new Error('denied');
    };

    appearance.setContentWidth('compact');
    expect(document.documentElement.style.getPropertyValue('--cr-content-width')).toBe('1024px');

    window.localStorage.setItem = write;
  } finally {
    window.localStorage.getItem = real;
  }
});

test('every choice the drawer offers has a label the catalogue can answer', () => {
  const { CONTENT_WIDTHS } = load();

  expect(CONTENT_WIDTHS.length).toBeGreaterThan(1);
  CONTENT_WIDTHS.forEach((option) => {
    expect(typeof option.id).toBe('string');
    expect(option.label).toMatch(/^components\.settingsdrawer\./);
    expect(option.px === null || option.px > 0).toBe(true);
  });
});
