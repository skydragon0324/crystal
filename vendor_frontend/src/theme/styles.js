import { mode } from "@chakra-ui/theme-tools";
import { colors, fonts, radii, shadows } from "./foundations/colors";

/**
 * Horizon UI global styles.
 *
 * The page sits on a very light tinted ground (secondaryGray.300) with
 * white cards floating on it - that contrast is what makes Horizon's
 * shadowed cards read as raised. A pure white body would flatten them,
 * so the body background is deliberately not #fff.
 *
 * Note on scope: these tokens apply site-wide, storefront included. The
 * storefront keeps its mi.com STRUCTURE - announcement strip, mega-menu,
 * footer columns - but is painted from this palette, so there is one set
 * of colours to maintain rather than two that drift.
 */
export const globalStyles = {
  colors,
  fonts,
  radii,
  shadows,

  styles: {
    global: (props) => ({
      body: {
        overflowX: "hidden",
        bg: mode("secondaryGray.300", "navy.900")(props),
        color: mode("secondaryGray.900", "white")(props),
        fontFamily: fonts.body,
        letterSpacing: "-0.5px",
        lineHeight: 1.6,
        WebkitFontSmoothing: "antialiased",

        /*
         * Mode-aware surface variables.
         *
         * Chakra emits a CSS variable for every colour in the theme, but
         * those are fixed values - `--chakra-colors-white` is white in
         * both modes. useColorModeValue is the usual answer, and it is a
         * hook, so it cannot be used from a page that paints its surfaces
         * inline: `bgColor="white"` on a storefront panel stays white in
         * dark mode and swallows the white text on top of it.
         *
         * These flip with the mode and can be written straight into a
         * style prop, which is what lets the older marketing pages become
         * theme-aware one token at a time instead of being restructured.
         */
        "--vendor-surface": mode("#FFFFFF", "#1B254B")(props),
        "--vendor-surface-soft": mode("#F4F7FE", "#111C44")(props),
        "--vendor-surface-sunken": mode("#E9EDF7", "#0B1437")(props),
        "--vendor-ink": mode("#1B2559", "#FFFFFF")(props),
        "--vendor-ink-muted": mode("#707EAE", "#A3AED0")(props),
        "--vendor-border": mode("#E0E5F2", "rgba(255, 255, 255, 0.12)")(props),
        "--vendor-card-shadow": mode(
          "14px 17px 40px 4px rgba(112, 144, 176, 0.08)",
          "14px 17px 40px 4px rgba(12, 44, 55, 0.18)"
        )(props),
        // The dark editorial bands on the company intro page. They are
        // meant to be dark in both modes; this only deepens them so they
        // still separate from a dark page behind them.
        "--vendor-band": mode("#343434", "#0B1437")(props),
      },
      html: {
        fontFamily: fonts.body,
      },
      // A flat `color: gray.700` here beat every field's own colour, so
      // dark-mode text was near-black on a navy field. Now it follows the
      // mode like everything else.
      input: {
        color: mode("gray.700", "white")(props),
      },
      "*::placeholder": {
        color: "secondaryGray.600",
      },
      // Horizon draws separators with its own light border rather than
      // Chakra's default, which is a shade too dark against the tinted
      // page and makes every card look outlined.
      "*, *::before, *::after": {
        borderColor: mode("secondaryGray.100", "whiteAlpha.200")(props),
      },
      // Slim scrollbars so a horizontally scrolling table does not gain a
      // heavy grey band across its foot.
      "::-webkit-scrollbar": {
        width: "8px",
        height: "8px",
      },
      "::-webkit-scrollbar-track": {
        background: "transparent",
      },
      "::-webkit-scrollbar-thumb": {
        background: mode("#E0E5F2", "rgba(255,255,255,0.16)")(props),
        borderRadius: "8px",
      },
      "::-webkit-scrollbar-thumb:hover": {
        background: mode("#C9D0E3", "rgba(255,255,255,0.28)")(props),
      },
    }),
  },
};
