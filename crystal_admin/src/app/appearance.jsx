import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { DEFAULT_PALETTE, PALETTE_NAMES } from '../theme/palettes';

/**
 * HOW THE CONSOLE LOOKS, as opposed to what it says.
 *
 * Three settings, all of them a preference rather than data: the primary
 * colour, how large everything is drawn, and whether the content runs to the
 * full width of the window or stops at a readable measure.
 *
 * KEPT IN localStorage, NOT ON THE ACCOUNT. A scale is a property of the
 * screen somebody is sitting at, not of who they are - the same operator on a
 * laptop and on a 27" monitor wants different answers, and syncing the two
 * would make one of them wrong. The colour mode already worked this way and
 * this sits beside it.
 *
 * THE SCALE IS THE ROOT FONT SIZE, and that decision is worth writing down
 * because the obvious alternatives are worse:
 *
 *   `transform: scale()` takes the layout with it, so `position: fixed` stops
 *   meaning the viewport, hit targets drift from what is painted, and every
 *   `100vh` is suddenly a fraction of the screen.
 *
 *   `zoom` scales pixel values too, which is tempting - but it scales the
 *   coordinates Popper measures with, so menus, tooltips and every select in
 *   the console land beside the control that opened them.
 *
 * Root font size has none of those faults: `100vh` still means the viewport,
 * fixed still means fixed, and Popper still measures what it sees. The catch
 * is that it only moves `rem`, which is why the console's own sizes are
 * written in rem rather than px.
 */

const STORAGE_KEY = 'crystal.admin.appearance';

/** The steps the +/- buttons walk, as percentages. */
export const SCALES = [80, 90, 100, 110, 120];

export const WIDTHS = ['static', 'full'];

const DEFAULTS = {
  palette: DEFAULT_PALETTE,
  scale: 100,
  width: 'static'
};

const AppearanceContext = createContext({
  ...DEFAULTS,
  setPalette: () => {},
  setScale: () => {},
  stepScale: () => {},
  setWidth: () => {}
});

function read() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;

    const saved = JSON.parse(raw);

    /*
     * Validated on the way in, not trusted. This is a string a person can
     * edit; a scale of 4000 would render one letter per screen and there
     * would be no way back to the settings drawer to undo it.
     */
    return {
      palette: PALETTE_NAMES.indexOf(saved.palette) === -1 ? DEFAULTS.palette : saved.palette,
      scale: SCALES.indexOf(Number(saved.scale)) === -1 ? DEFAULTS.scale : Number(saved.scale),
      width: WIDTHS.indexOf(saved.width) === -1 ? DEFAULTS.width : saved.width
    };
  } catch (err) {
    /* Storage disabled, or somebody put something else under this key. */
    return DEFAULTS;
  }
}

function write(value) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch (err) {
    /* Nothing to do - the setting still applies for this page load. */
  }
}

export function AppearanceProvider({ children }) {
  const [state, setState] = useState(read);

  /*
   * 16px is what a browser calls 100%, so the scale is a percentage of it.
   * Written to the documentElement rather than to a stylesheet because it
   * has to beat whatever the stylesheet says without an !important war.
   */
  useEffect(() => {
    const root = document.documentElement;
    root.style.fontSize = (16 * state.scale) / 100 + 'px';

    /*
     * Also published as a custom property. Anything that genuinely has to
     * work in real pixels - a hairline, an icon that must stay crisp - can
     * divide by it, and a stylesheet can read the current scale without
     * going through React.
     */
    root.style.setProperty('--app-scale', String(state.scale / 100));

    return () => {
      root.style.fontSize = '';
      root.style.removeProperty('--app-scale');
    };
  }, [state.scale]);

  useEffect(() => { write(state); }, [state]);

  const setPalette = useCallback((palette) => {
    setState((current) => ({ ...current, palette }));
  }, []);

  const setScale = useCallback((scale) => {
    if (SCALES.indexOf(Number(scale)) === -1) return;
    setState((current) => ({ ...current, scale: Number(scale) }));
  }, []);

  /**
   * One step along SCALES, clamped at both ends.
   *
   * The buttons walk the list rather than adding ten, so the steps are the
   * ones that were chosen and there is no way to land between them.
   */
  const stepScale = useCallback((direction) => {
    setState((current) => {
      const at = SCALES.indexOf(current.scale);
      const next = SCALES[Math.min(SCALES.length - 1, Math.max(0, at + direction))];
      return next === current.scale ? current : { ...current, scale: next };
    });
  }, []);

  const setWidth = useCallback((width) => {
    if (WIDTHS.indexOf(width) === -1) return;
    setState((current) => ({ ...current, width }));
  }, []);

  const value = useMemo(() => ({
    ...state,
    setPalette,
    setScale,
    stepScale,
    setWidth,
    canGrow: state.scale !== SCALES[SCALES.length - 1],
    canShrink: state.scale !== SCALES[0]
  }), [state, setPalette, setScale, stepScale, setWidth]);

  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  return useContext(AppearanceContext);
}

export default AppearanceContext;
