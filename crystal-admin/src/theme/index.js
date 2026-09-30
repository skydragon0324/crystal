import { extendTheme } from '@chakra-ui/react';
import { cssVar, mode } from '@chakra-ui/theme-tools';
import { DEFAULT_PALETTE, paletteOf } from './palettes';

/*
 * The two CSS variables a Chakra tooltip is actually drawn from.
 *
 * `bg` on its own colours the BOX and nothing else: the arrow is a separate
 * element that reads `--popper-arrow-bg`, so a tooltip whose base style sets
 * only `bg` gets a correctly coloured bubble with a colourless spike hanging
 * off it. Pointing both at one variable is how Chakra's own base style keeps
 * them together, and it is what this theme has to keep doing.
 */
const $tooltipBg = cssVar('tooltip-bg');
const $arrowBg = cssVar('popper-arrow-bg');

/**
 * The console's surface system.
 *
 * Modelled on the Apex admin template rather than on Horizon, which the
 * specification named: flat neutral surfaces separated by a one pixel border
 * instead of tinted cards floating on a soft blue shadow, tighter radii, a
 * charcoal sidebar that stays charcoal in both colour modes, and a denser
 * type scale.  The trade is deliberate - a screen that is mostly table reads
 * better when the chrome recedes - and it is the one place this build departs
 * from the spec's stated UI, which the README says out loud.
 *
 * THE RAMP NAMES ARE DELIBERATELY UNCHANGED.  Thirty-six screens and every
 * component already say `secondaryGray.100` for a border and `navy.800` for a
 * dark surface; re-pointing those names at the new palette restyles all of
 * them at once, where renaming the tokens would have meant touching every
 * file to achieve the same pixels.  So `navy` is no longer navy - it is the
 * neutral dark ramp - and `secondaryGray` is a slate ramp.  The names are
 * historical; the values are what the console looks like.
 */

const colors = {
  /*
   * The console's identity: SKY BLUE, and the only saturated colour in the
   * chrome.
   *
   * Deliberately not the storefront's orange.  These are two different tools
   * for two different people, and an operator with both open should be able
   * to tell at a glance which window they are typing into - which the shared
   * layout and the shared component library otherwise make surprisingly hard.
   *
   * 500 is the button and the active menu item; 400 is the same hue lifted
   * for dark mode, where the 500 sits too close to the page to read as a
   * control.
   */
  brand: {
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
  },

  /*
   * The dark ramp: neutral BLACK, not blue and not charcoal.
   *
   * 900 is the page and it is true black, which is what the template does -
   * a dark console that bottoms out at #18181B reads as very dark grey, and
   * beside a real black one it looks washed out.  The card sits one step up
   * from the page so a panel is still legible as a panel, and the border is
   * what actually separates them.
   */
  navy: {
    50: '#FAFAFA',
    100: '#E4E4E7',
    200: '#A1A1AA',
    300: '#6B6B72',
    400: '#3F3F46',
    500: '#2E2E33',
    600: '#242428',
    700: '#161619',
    800: '#0A0A0C',
    900: '#000000'
  },

  /* The light ramp: slate. 100 is a border, 300 a hover, 900 the text. */
  secondaryGray: {
    100: '#E2E8F0',
    200: '#E2E8F0',
    300: '#F1F5F9',
    400: '#E2E8F0',
    500: '#94A3B8',
    600: '#64748B',
    700: '#475569',
    800: '#334155',
    900: '#0F172A'
  },

  /*
   * The sidebar follows the COLOUR MODE, like everything else.
   *
   * It was charcoal in both modes on the theory that navigation is furniture
   * - but a black column down the side of an otherwise white console reads
   * as a panel that failed to load, not as a deliberate one.  The light mode
   * gets a light menu; see theme/tokens.js, where the two sets live.
   */

  /* Trend colours, used on the KPI tiles and nowhere decorative. */
  green: {
    50: '#F0FDF4', 100: '#DCFCE7', 200: '#BBF7D0', 300: '#86EFAC',
    400: '#4ADE80', 500: '#16A34A', 600: '#15803D', 700: '#166534',
    800: '#14532D', 900: '#052E16'
  },
  red: {
    50: '#FEF2F2', 100: '#FEE2E2', 200: '#FECACA', 300: '#FCA5A5',
    400: '#F87171', 500: '#DC2626', 600: '#B91C1C', 700: '#991B1B',
    800: '#7F1D1D', 900: '#450A0A'
  },
  orange: {
    50: '#FFF7ED', 100: '#FFEDD5', 200: '#FED7AA', 300: '#FDBA74',
    400: '#FB923C', 500: '#F97316', 600: '#EA580C', 700: '#C2410C',
    800: '#9A3412', 900: '#7C2D12'
  },
  blue: {
    50: '#EFF6FF', 100: '#DBEAFE', 200: '#BFDBFE', 300: '#93C5FD',
    400: '#60A5FA', 500: '#2563EB', 600: '#1D4ED8', 700: '#1E40AF',
    800: '#1E3A8A', 900: '#172554'
  }
};

/*
 * Inter, the face this whole family of templates is drawn in, with the system
 * stack behind it so a machine without it still gets something proportioned
 * the same way rather than falling back to Times.
 */
const SYSTEM_STACK =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const fonts = { heading: SYSTEM_STACK, body: SYSTEM_STACK };

/** One radius scale, and it is small. */
const radii = {
  none: '0',
  sm: '0.25rem',
  base: '0.375rem',
  md: '0.5rem',
  lg: '0.625rem',
  xl: '0.75rem',
  card: '0.625rem',
  control: '0.5rem'
};

/**
 * Shadows are for things that FLOAT - a menu, a popover, a dialog - and for
 * nothing else.  A card does not float; it is a region of the page, and it is
 * marked out by its border.
 */
const shadows = {
  card: 'none',
  cardDark: 'none',
  raised: '0 4px 12px rgba(15, 23, 42, 0.08)',
  overlay: '0 10px 30px rgba(15, 23, 42, 0.12)',
  overlayDark: '0 10px 30px rgba(0, 0, 0, 0.55)',
  brand: 'none',
  focus: '0 0 0 2px rgba(14, 165, 233, 0.35)'
};

const styles = {
  global: (props) => ({
    body: {
      bg: mode('#F8FAFC', 'navy.900')(props),
      color: mode('secondaryGray.900', 'navy.50')(props),
      fontFamily: fonts.body,
      fontSize: '0.875rem',
      // The console is a data tool; a tabular figure keeps a column of
      // numbers from shifting as values change.
      fontVariantNumeric: 'tabular-nums',
      WebkitFontSmoothing: 'antialiased'
    },
    '*::placeholder': {
      color: mode('secondaryGray.500', 'navy.300')(props)
    },
    // A thin, unobtrusive scrollbar - the Windows default is a wide grey bar
    // that reads as part of the page rather than as chrome.
    '::-webkit-scrollbar': { width: '0.625rem', height: '0.625rem' },
    '::-webkit-scrollbar-track': { background: 'transparent' },
    '::-webkit-scrollbar-thumb': {
      background: mode('#CBD5E1', '#3F3F46')(props),
      borderRadius: '0.5rem',
      border: '3px solid transparent',
      backgroundClip: 'content-box'
    },
    '::-webkit-scrollbar-thumb:hover': {
      background: mode('#94A3B8', '#52525B')(props),
      backgroundClip: 'content-box',
      border: '3px solid transparent'
    }
  })
};

/** Every input in the console is the same box, so they are described once. */
const field = (props) => ({
  bg: mode('white', 'navy.800')(props),
  border: '1px solid',
  borderColor: mode('secondaryGray.100', 'navy.600')(props),
  borderRadius: radii.control,
  fontSize: 'sm',
  _hover: { borderColor: mode('secondaryGray.500', 'navy.500')(props) },
  _placeholder: { color: mode('secondaryGray.500', 'navy.300')(props) },
  _focus: { borderColor: 'brand.500', boxShadow: shadows.focus },
  _focusVisible: { borderColor: 'brand.500', boxShadow: shadows.focus },
  _disabled: { opacity: 0.5, cursor: 'not-allowed' }
});

const components = {
  Button: {
    baseStyle: { borderRadius: radii.control, fontWeight: 500 },
    variants: {
      /* The one filled button on a screen: the action the screen is for. */
      brand: {
        bg: 'brand.500',
        color: 'white',
        _hover: { bg: 'brand.600', _disabled: { bg: 'brand.500' } },
        _active: { bg: 'brand.700' },
        _disabled: { opacity: 0.5 }
      },
      /* Everything else: a bordered button that recedes until it is wanted. */
      subtle: (props) => ({
        bg: mode('white', 'navy.800')(props),
        color: mode('secondaryGray.900', 'navy.50')(props),
        border: '1px solid',
        borderColor: mode('secondaryGray.100', 'navy.600')(props),
        _hover: { bg: mode('secondaryGray.300', 'navy.700')(props) },
        _active: { bg: mode('secondaryGray.400', 'navy.600')(props) }
      }),
      quiet: (props) => ({
        bg: 'transparent',
        color: mode('secondaryGray.700', 'navy.200')(props),
        _hover: { bg: mode('secondaryGray.300', 'navy.700')(props) }
      }),
      /*
       * A button that carries its own background and must keep it.
       *
       * The pagination arrows and the calendar's cells set `bg` themselves to
       * say what state they are in; a hover style would paint over the very
       * thing they are using the background to communicate.
       */
      'no-hover': {
        _hover: {},
        _active: {},
        _focus: { boxShadow: 'none' }
      },
      danger: {
        bg: 'red.500',
        color: 'white',
        _hover: { bg: 'red.600' },
        _active: { bg: 'red.700' }
      }
    }
  },

  Input: {
    baseStyle: { field: { borderRadius: radii.control } },
    variants: { main: (props) => ({ field: field(props) }) },
    defaultProps: { variant: 'main' }
  },
  Textarea: {
    variants: { main: (props) => field(props) },
    defaultProps: { variant: 'main' }
  },
  Select: {
    variants: { main: (props) => ({ field: field(props) }) },
    defaultProps: { variant: 'main' }
  },
  NumberInput: {
    variants: { main: (props) => ({ field: field(props) }) },
    defaultProps: { variant: 'main' }
  },

  Table: {
    variants: {
      console: (props) => ({
        th: {
          borderColor: mode('secondaryGray.100', 'navy.600')(props),
          color: mode('secondaryGray.600', 'navy.200')(props),
          fontSize: '0.6875rem',
          fontWeight: 500,
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
          py: '0.625rem'
        },
        td: {
          borderColor: mode('secondaryGray.100', 'navy.600')(props),
          fontSize: 'sm',
          py: '0.625rem'
        }
      })
    },
    defaultProps: { variant: 'console' }
  },

  Modal: {
    baseStyle: (props) => ({
      dialog: {
        bg: mode('white', 'navy.800')(props),
        borderRadius: radii.xl,
        border: '1px solid',
        borderColor: mode('secondaryGray.100', 'navy.600')(props),
        boxShadow: mode(shadows.overlay, shadows.overlayDark)(props)
      }
    })
  },

  Menu: {
    baseStyle: (props) => ({
      list: {
        bg: mode('white', 'navy.800')(props),
        border: '1px solid',
        borderColor: mode('secondaryGray.100', 'navy.600')(props),
        borderRadius: radii.md,
        boxShadow: mode(shadows.overlay, shadows.overlayDark)(props),
        py: '0.25rem',
        minW: '11.25rem'
      },
      item: {
        bg: 'transparent',
        fontSize: 'sm',
        borderRadius: radii.base,
        mx: '0.25rem',
        px: '0.5rem',
        py: '0.375rem',
        w: 'auto',
        _hover: { bg: mode('secondaryGray.300', 'navy.700')(props) },
        _focus: { bg: mode('secondaryGray.300', 'navy.700')(props) }
      }
    })
  },

  Popover: {
    baseStyle: (props) => ({
      content: {
        bg: mode('white', 'navy.800')(props),
        border: '1px solid',
        borderColor: mode('secondaryGray.100', 'navy.600')(props),
        borderRadius: radii.md,
        boxShadow: mode(shadows.overlay, shadows.overlayDark)(props),
        _focus: { boxShadow: mode(shadows.overlay, shadows.overlayDark)(props), outline: 'none' }
      }
    })
  },

  /**
   * A tooltip.
   *
   * `extendTheme` REPLACES a component's baseStyle rather than merging into
   * it, so everything Chakra's own base style did has to be restated here or
   * it is silently lost. This one used to declare six properties and drop six,
   * and every one of the six mattered:
   *
   *   --tooltip-bg / --popper-arrow-bg   the arrow reads the second of these.
   *        Setting only `bg` left the arrow with no colour at all, which is
   *        what made every `hasArrow` tooltip in the console look broken.
   *
   *   zIndex   the tooltip is PORTALLED to <body>. With no z-index it stacks
   *        by document order against a sticky table header, a frozen action
   *        column, the navbar and any open dialog - all of which carry one -
   *        so it appeared behind them, or not at all.
   *
   *   maxW     without it a long label is one unbroken line across the page.
   *
   *   boxShadow  a tooltip floats; in this design that is exactly what a
   *        shadow is reserved for.
   */
  Tooltip: {
    baseStyle: (props) => {
      // navy.600 rather than 700 in dark mode: the console's page is true
      // black, and a tooltip has to sit clearly ABOVE the card it covers.
      const bg = mode('secondaryGray.900', 'navy.600')(props);

      return {
        [$tooltipBg.variable]: `colors.${bg}`,
        bg: $tooltipBg.reference,
        [$arrowBg.variable]: $tooltipBg.reference,
        color: mode('white', 'navy.50')(props),
        borderRadius: radii.base,
        fontSize: 'xs',
        fontWeight: 500,
        px: '0.5rem',
        py: '0.25rem',
        maxW: '20rem',
        boxShadow: mode(shadows.overlay, shadows.overlayDark)(props),
        zIndex: 'tooltip'
      };
    }
  },

  Badge: {
    baseStyle: {
      borderRadius: radii.base,
      textTransform: 'none',
      fontWeight: 500,
      fontSize: '0.6875rem',
      px: '0.375rem',
      py: '2px'
    }
  }
};

/**
 * The theme, in whichever primary colour the console is set to.
 *
 * `brand` and the focus ring are the only two things a palette moves - every
 * other colour in this file is a neutral, and a console that changed its
 * greys with its accent would be three consoles to maintain.
 *
 * Rebuilt rather than patched at runtime: Chakra resolves the palette into
 * CSS variables when the theme object is created, so handing ChakraProvider
 * a NEW object is what actually changes anything.
 */
export function buildTheme(paletteName) {
  const palette = paletteOf(paletteName);

  return extendTheme({
    config: { initialColorMode: 'light', useSystemColorMode: false },
    colors: { ...colors, brand: palette.scale },
    fonts,
    radii,
    styles,
    shadows: { ...shadows, focus: '0 0 0 2px ' + palette.focus },
    components
  });
}

const theme = buildTheme(DEFAULT_PALETTE);

export default theme;
