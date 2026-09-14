/**
 * Horizon UI colour tokens.
 *
 * Taken from the Horizon Chakra theme so that any component written
 * against it - `brand.500`, `secondaryGray.600`, `navy.700` - resolves to
 * the colour the design expects without being restyled per call site.
 *
 * This replaces the previous "Nordic-minimal" palette. The two scales are
 * not interchangeable: Horizon's `gray` is a single near-white used for
 * page chrome, and the greys that carry text live under `secondaryGray`.
 * Chakra's own `gray` ramp is left intact underneath so that anything
 * still asking for `gray.500` keeps working.
 */
export const colors = {
  brand: {
    50: '#E9E3FF',
    100: '#E9E3FF',
    200: '#7551FF',
    300: '#7551FF',
    400: '#7551FF',
    500: '#422AFB',
    600: '#3311DB',
    700: '#2B1AA6',
    800: '#190793',
    900: '#11047A',
  },

  // Used by the colorScheme prop (`colorScheme="brandScheme"`), where
  // Chakra picks .500 for the resting state and .600 for hover.
  brandScheme: {
    50: '#E9E3FF',
    100: '#E9E3FF',
    200: '#7551FF',
    300: '#7551FF',
    400: '#7551FF',
    500: '#422AFB',
    600: '#3311DB',
    700: '#02044A',
    800: '#190793',
    900: '#02044A',
  },

  brandTabs: {
    100: '#E9E3FF',
    200: '#422AFB',
    300: '#422AFB',
    400: '#422AFB',
    500: '#422AFB',
    600: '#3311DB',
    700: '#02044A',
    800: '#190793',
    900: '#02044A',
  },

  // Text and surface greys. secondaryGray.900 is Horizon's near-black for
  // headings; 300 and 400 are the tinted panel fills.
  secondaryGray: {
    100: '#E0E5F2',
    200: '#E1E9F8',
    300: '#F4F7FE',
    400: '#E9EDF7',
    500: '#8F9BBA',
    600: '#A3AED0',
    700: '#707EAE',
    800: '#707EAE',
    900: '#1B2559',
  },

  navy: {
    50: '#d0dcfb',
    100: '#aac0fe',
    200: '#a3b9f8',
    300: '#728fea',
    400: '#3652ba',
    500: '#1b3bbb',
    600: '#24388a',
    700: '#1B254B',
    800: '#111C44',
    900: '#0B1437',
  },

  red: {
    50: '#FEEFEE',
    100: '#FEEFEE',
    500: '#EE5D50',
    600: '#E31A1A',
  },

  blue: {
    50: '#EFF4FB',
    500: '#3965FF',
  },

  orange: {
    50: '#FFF6DA',
    100: '#FFF6DA',
    500: '#FFB547',
  },

  green: {
    50: '#E6FAF5',
    100: '#E6FAF5',
    500: '#01B574',
  },

  // Horizon overrides only gray.100, the tint behind the page. Leaving the
  // rest of Chakra's ramp alone matters: this codebase already reads
  // gray.200 for hairlines and gray.400/500 for muted labels, and blanking
  // those would flatten every border and caption on the site.
  gray: {
    100: '#FAFCFE',
  },
};

/**
 * Horizon's shadow set. `dark` is the lifted card shadow used across the
 * dashboard; `xl`/`2xl` are for popovers and menus.
 */
export const shadows = {
  base: '14px 17px 40px 4px rgba(112, 144, 176, 0.08)',
  dark: '14px 17px 40px 4px rgba(112, 144, 176, 0.08)',
  darkMode: '14px 17px 40px 4px rgba(12, 44, 55, 0.18)',
  xl: '14px 17px 40px 4px rgba(112, 144, 176, 0.18)',
  xlDark: '14px 17px 40px 4px rgba(0, 0, 0, 0.35)',
  '2xl': '0px 18px 40px rgba(112, 144, 176, 0.12)',
  inner: 'inset 0px 4px 4px rgba(0, 0, 0, 0.05)',
  outline: 'none',
};

/**
 * Horizon leans on generous corner radii. These map onto the scale Chakra
 * components already reference, so `borderRadius="md"` picks up the
 * Horizon value rather than Chakra's 6px default.
 */
export const radii = {
  none: '0',
  sm: '8px',
  base: '10px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  '2xl': '20px',
  '3xl': '30px',
  full: '9999px',
};

/**
 * DM Sans is Horizon's typeface. No webfont ships with this project, so
 * the stack degrades to the platform UI font rather than pulling from an
 * external host - add a @font-face to public/fonts/font-family.css and it
 * will be picked up here with no further change.
 */
const FONT_STACK =
  `'DM Sans', 'Plus Jakarta Display', -apple-system, BlinkMacSystemFont, ` +
  `'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;

export const fonts = {
  heading: FONT_STACK,
  body: FONT_STACK,
};
