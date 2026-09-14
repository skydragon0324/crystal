/**
 * THE THREE PRIMARY COLOURS THE CONSOLE CAN WEAR.
 *
 * A full 50-900 scale each, because `brand.500` is not the only rung the app
 * reaches for: a hover uses 600, a selected row uses 50, a badge uses 100, and
 * a chart series walks several of them. Supplying one hex and generating the
 * rest is how a palette ends up with a 50 nobody can read text on.
 *
 * Each is a real ramp rather than opacity over one colour - the light end is
 * desaturated so it works as a background, and the dark end keeps enough
 * chroma to be recognisable rather than turning to slate.
 *
 * `focus` travels with the palette. It is the ring the theme paints around a
 * focused control, and a sky-blue ring around a violet button is the kind of
 * thing nobody reports and everybody notices.
 */

const PALETTES = {
  sky: {
    label: 'Sky',
    swatch: '#0EA5E9',
    focus: 'rgba(14, 165, 233, 0.35)',
    scale: {
      50: '#F0F9FF',
      100: '#E0F2FE',
      200: '#BAE6FD',
      300: '#7DD3FC',
      400: '#38BDF8',
      500: '#0EA5E9',
      600: '#0284C7',
      700: '#0369A1',
      800: '#075985',
      900: '#0C4A6E'
    }
  },

  violet: {
    label: 'Violet',
    swatch: '#7C3AED',
    focus: 'rgba(124, 58, 237, 0.35)',
    scale: {
      50: '#F5F3FF',
      100: '#EDE9FE',
      200: '#DDD6FE',
      300: '#C4B5FD',
      400: '#A78BFA',
      500: '#8B5CF6',
      600: '#7C3AED',
      700: '#6D28D9',
      800: '#5B21B6',
      900: '#4C1D95'
    }
  },

  emerald: {
    label: 'Emerald',
    swatch: '#059669',
    focus: 'rgba(5, 150, 105, 0.35)',
    scale: {
      50: '#ECFDF5',
      100: '#D1FAE5',
      200: '#A7F3D0',
      300: '#6EE7B7',
      400: '#34D399',
      500: '#10B981',
      600: '#059669',
      700: '#047857',
      800: '#065F46',
      900: '#064E3B'
    }
  }
};

/** The one the console wears unless somebody has chosen otherwise. */
export const DEFAULT_PALETTE = 'sky';

/** The choices, in the order the drawer offers them. */
export const PALETTE_NAMES = Object.keys(PALETTES);

export function paletteOf(name) {
  return PALETTES[name] || PALETTES[DEFAULT_PALETTE];
}

export default PALETTES;
