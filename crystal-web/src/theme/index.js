import { extendTheme } from '@chakra-ui/react';
import { mode } from '@chakra-ui/theme-tools';

/**
 * The storefront theme.
 *
 * Two things are deliberate here:
 *
 *   - `ink` is the surface ramp, and it is the DARK half of every
 *     useColorModeValue pair on the site. Keeping it as a named ramp rather
 *     than literal hex values means dark mode is retuned in one place instead
 *     of across every page.
 *   - the brand ramp is SKY BLUE, and it is used for actions only.  A
 *     storefront that tints its surfaces with the brand colour reads as a
 *     sale banner rather than as a product page.
 *
 *     The ramp is the only place the colour is written down - thirty-seven
 *     files say `brand.500`, none of them say a hex - so the storefront
 *     changes colour by editing these ten lines and nothing else.
 *
 * The site targets 1280px on desktop and breaks to a single column at 768px
 * (spec's UI Requirements), which is Chakra's `md`.
 */

const colors = {
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
  ink: {
    50: '#F5F6F8',
    100: '#E9EBF0',
    200: '#D4D8E1',
    300: '#A8AFC0',
    400: '#7A8296',
    500: '#525A6E',
    600: '#2C3348',   // hairline in dark mode
    700: '#1E2436',   // raised / hover on a dark card
    800: '#161B29',   // dark card
    900: '#0E121C'    // dark page ground
  },
  accent: {
    50: '#EDF6FF', 100: '#D3E8FF', 200: '#A8D0FF', 300: '#74B2FF',
    400: '#3F92FF', 500: '#1B74F2', 600: '#0F5AC4', 700: '#0A4496',
    800: '#073268', 900: '#04203F'
  },
  success: {
    50: '#E8F8F1', 100: '#C4EEDC', 200: '#8DDCBB', 300: '#52C696',
    400: '#26AF78', 500: '#0F9960', 600: '#0B7B4D', 700: '#085E3B',
    800: '#05412A', 900: '#032618'
  }
};

const fonts = {
  heading: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  body: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
};

const styles = {
  global: (props) => ({
    body: {
      bg: mode('white', 'ink.900')(props),
      color: mode('ink.900', 'ink.50')(props),
      fontFamily: fonts.body
    },
    '*::placeholder': { color: mode('ink.400', 'ink.400')(props) },
    // A CSS variable mirror of the surface tokens, for the few places that
    // need a colour inside a plain style object where a hook cannot be called.
    ':root': {
      '--cr-brand': colors.brand[500],
      '--cr-surface': mode('#FFFFFF', colors.ink[800])(props),
      '--cr-page': mode('#FFFFFF', colors.ink[900])(props),
      '--cr-border': mode(colors.ink[100], colors.ink[600])(props),
      '--cr-muted': mode(colors.ink[400], colors.ink[300])(props),
      // The default the sizes token below falls back to; app/appearance.js
      // overrides it inline on <html> once a reader has chosen a width.
      '--cr-content-width': '1560px'
    },
    '::-webkit-scrollbar': { width: '10px', height: '10px' },
    '::-webkit-scrollbar-track': { background: 'transparent' },
    '::-webkit-scrollbar-thumb': {
      background: mode(colors.ink[200], colors.ink[600])(props),
      borderRadius: '8px'
    },
    // The sticky header offsets in-page anchors; without this a jump to a
    // spec section lands under it.
    'html': { scrollBehavior: 'smooth', scrollPaddingTop: '110px' }
  })
};

const components = {
  Button: {
    baseStyle: { borderRadius: '8px', fontWeight: 600 },
    variants: {
      brand: {
        bg: 'brand.500',
        color: 'white',
        _hover: { bg: 'brand.600', _disabled: { bg: 'brand.500' } },
        _active: { bg: 'brand.700' }
      },
      outlineBrand: (props) => ({
        bg: 'transparent',
        color: 'brand.500',
        border: '1px solid',
        borderColor: 'brand.500',
        _hover: { bg: mode('brand.50', 'whiteAlpha.100')(props) }
      }),
      quiet: (props) => ({
        bg: mode('ink.50', 'ink.700')(props),
        color: mode('ink.900', 'ink.50')(props),
        _hover: { bg: mode('ink.100', 'ink.600')(props) }
      })
    }
  },
  Input: {
    variants: {
      site: (props) => ({
        field: {
          bg: mode('white', 'ink.800')(props),
          border: '1px solid',
          borderColor: mode('ink.200', 'ink.600')(props),
          borderRadius: '8px',
          _focus: { borderColor: 'brand.500', boxShadow: '0 0 0 1px var(--chakra-colors-brand-500)' }
        }
      })
    },
    defaultProps: { variant: 'site' }
  },
  Textarea: {
    variants: {
      site: (props) => ({
        bg: mode('white', 'ink.800')(props),
        border: '1px solid',
        borderColor: mode('ink.200', 'ink.600')(props),
        borderRadius: '8px',
        _focus: { borderColor: 'brand.500', boxShadow: '0 0 0 1px var(--chakra-colors-brand-500)' }
      })
    },
    defaultProps: { variant: 'site' }
  },
  Select: {
    variants: {
      site: (props) => ({
        field: {
          bg: mode('white', 'ink.800')(props),
          border: '1px solid',
          borderColor: mode('ink.200', 'ink.600')(props),
          borderRadius: '8px'
        }
      })
    },
    defaultProps: { variant: 'site' }
  },
  Table: {
    variants: {
      site: (props) => ({
        th: {
          borderColor: mode('ink.100', 'ink.600')(props),
          color: mode('ink.400', 'ink.300')(props),
          fontSize: 'xs',
          letterSpacing: '0.4px'
        },
        td: { borderColor: mode('ink.100', 'ink.600')(props), fontSize: 'sm' }
      })
    },
    defaultProps: { variant: 'site' }
  }
};

const theme = extendTheme({
  config: { initialColorMode: 'light', useSystemColorMode: false },
  colors,
  fonts,
  styles,
  components,
  sizes: {
    /*
     * MI.COM'S CONTENT COLUMN, AND IT IS A PREFERENCE NOW.
     *
     * Ten components ask for `container.site` - the header bar, the mega
     * panel, the footer, the account layout, the compare tray, the product
     * detail page and every Section on the site - which is exactly what makes
     * the whole storefront line up to one measure. Making that measure
     * adjustable therefore had two possible shapes: thread a number through
     * all ten from a provider and re-render the tree to move it, or change
     * what this ONE token resolves to.
     *
     * It is a CSS custom property, so the second: app/appearance.js writes
     * --cr-content-width onto <html> and every one of those ten containers
     * follows in the same frame, with no reload and no re-render. The
     * fallback is the default setting, so a browser that has never had the
     * property set - and the server-rendered first paint - is 1560px, the
     * same "wide" that app/appearance.js starts every new reader on.
     */
    container: { site: 'var(--cr-content-width, 1560px)' }
  }
});

export default theme;
