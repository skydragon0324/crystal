/**
 * The chart palette.
 *
 * These are the first two slots of the reference categorical palette,
 * unchanged, plus the surfaces and ink the charts sit on.  Two slots is all
 * the console needs: every chart here carries either one series or two, and a
 * third would be a chart that should have been a table.
 *
 * The dark column is the same two hues re-stepped for the dark surface, not a
 * separate palette and not an automatic flip - a light-mode blue on a dark
 * card is either invisible or glaring.
 *
 * Both slots clear the contrast floor on both surfaces, which is why the
 * light-mode relief rule (visible labels required for the low-contrast slots)
 * does not apply to them.  The palette they come from documents its own
 * validation for slots 1-3 in both modes on the all-pairs list; nothing here
 * re-steps or re-orders them, so that result carries over.
 */
export const VIZ = {
  light: {
    series1: '#2a78d6',
    series2: '#eb6834',
    grid: '#e6e6e3',
    axis: '#a3a29c',
    surface: '#ffffff',
    textPrimary: '#0b0b0b',
    textSecondary: '#52514e',
    tooltipSurface: '#ffffff',
    tooltipBorder: '#d8d8d4'
  },
  dark: {
    series1: '#3987e5',
    series2: '#d95926',
    grid: '#2e2e2c',
    axis: '#6d6c66',
    surface: '#1a202c',
    textPrimary: '#ffffff',
    textSecondary: '#c3c2b7',
    // A tooltip floats above the card, and the console's dark card is very
    // nearly black - so this steps UP from the surface rather than matching it.
    tooltipSurface: '#242428',
    tooltipBorder: '#3f3f46'
  }
};

/** The palette for the current colour mode. */
export function vizPalette(colorMode) {
  return colorMode === 'dark' ? VIZ.dark : VIZ.light;
}

/**
 * The three style objects a recharts <Tooltip> needs, in one place.
 *
 * These are PLAIN CSS and they have to be: recharts puts them straight into an
 * inline `style`, where nothing resolves a theme token. Every chart in this
 * console was passing `useColorModeValue('white', 'gray.800')` into
 * `contentStyle.background` - a token name the browser cannot parse, so it was
 * dropped, and recharts' own hard-coded `backgroundColor: #fff` was left
 * showing through in BOTH colour modes. On a dark page that is a white box
 * with near-white text on it.
 *
 * `color` is the other half of the same bug. recharts colours each ITEM with
 * its series colour but leaves the LABEL - the x-axis value at the top of the
 * tooltip - to inherit, and what it inherits is the page's text colour, which
 * is the one colour guaranteed to be wrong against a surface chosen to
 * contrast with the page. So it is set here, explicitly, from the palette.
 */
export function vizTooltip(palette) {
  return {
    contentStyle: {
      background: palette.tooltipSurface,
      border: '1px solid ' + palette.tooltipBorder,
      borderRadius: 10,
      boxShadow: '0 10px 30px rgba(0, 0, 0, 0.12)',
      fontSize: 12,
      color: palette.textPrimary
    },
    labelStyle: {
      color: palette.textPrimary,
      fontWeight: 600,
      marginBottom: 4
    },
    itemStyle: {
      // Padding only. The colour is deliberately left to recharts, which
      // paints each row in its own series colour - that is what ties a row of
      // the tooltip to the line or bar it describes.
      paddingTop: 2,
      paddingBottom: 2
    }
  };
}

export default VIZ;
