import { mode } from "@chakra-ui/theme-tools";

/**
 * Horizon UI button variants.
 *
 * The Horizon set is `brand`, `darkBrand`, `lightBrand`, `light`, `outline`
 * and `no-hover`. The variants the app was already using - `dark`, `light`,
 * `primary`, `navy`, `danger`, `outlined`, `no-effects` - are kept and
 * remapped onto the new palette, so no existing call site has to change
 * while the pages are migrated.
 */
export const buttonStyles = {
  components: {
    Button: {
      baseStyle: {
        borderRadius: "16px",
        boxShadow: "45px 76px 113px 7px rgba(112, 144, 176, 0.08)",
        transition: ".25s all ease",
        boxSizing: "border-box",
        fontWeight: "500",
        _focus: { boxShadow: "none" },
        _active: { boxShadow: "none" },
      },

      variants: {
        /* ---------- Horizon ---------- */

        // The solid accent button. Horizon's primary call to action.
        brand: (props) => ({
          bg: mode("brand.500", "brand.400")(props),
          color: "white",
          _focus: { bg: mode("brand.500", "brand.400")(props) },
          _active: { bg: mode("brand.500", "brand.400")(props) },
          _hover: { bg: mode("brand.600", "brand.400")(props) },
        }),

        // Deeper still - used for the confirming action in a dialog, so it
        // outranks `brand` when both are on screen.
        darkBrand: (props) => ({
          bg: mode("brand.900", "brand.400")(props),
          color: "white",
          _focus: { bg: mode("brand.900", "brand.400")(props) },
          _active: { bg: mode("brand.900", "brand.400")(props) },
          _hover: { bg: mode("brand.800", "brand.400")(props) },
        }),

        // Tinted, not solid: a secondary action that still reads as branded.
        lightBrand: (props) => ({
          bg: mode("#F2EFFF", "whiteAlpha.100")(props),
          color: mode("brand.500", "white")(props),
          _focus: { bg: mode("#F2EFFF", "whiteAlpha.100")(props) },
          _active: { bg: mode("secondaryGray.300", "whiteAlpha.100")(props) },
          _hover: { bg: mode("secondaryGray.400", "whiteAlpha.200")(props) },
        }),

        // Neutral secondary - Cancel, Close, Reset.
        light: (props) => ({
          bg: mode("secondaryGray.300", "whiteAlpha.100")(props),
          color: mode("secondaryGray.900", "white")(props),
          _focus: { bg: mode("secondaryGray.300", "whiteAlpha.100")(props) },
          _active: { bg: mode("secondaryGray.300", "whiteAlpha.100")(props) },
          _hover: { bg: mode("secondaryGray.400", "whiteAlpha.200")(props) },
        }),

        outline: () => ({
          borderRadius: "16px",
        }),

        // Carries Horizon's shape but suppresses every state change. Used
        // for icon chrome - pagination arrows, calendar steppers - where a
        // hover wash would fight the icon.
        "no-hover": {
          _hover: { boxShadow: "none" },
        },

        /* ---------- retained from the previous theme ---------- */

        primary: (props) => ({
          fontSize: "13px",
          bg: mode("brand.500", "brand.400")(props),
          color: "#fff",
          _hover: { bg: mode("brand.600", "brand.400")(props) },
          _focus: { bg: mode("brand.600", "brand.400")(props) },
          _active: { bg: mode("brand.700", "brand.400")(props) },
        }),

        navy: {
          fontSize: "12px",
          bg: "navy.700",
          color: "#fff",
          _hover: { bg: "navy.800" },
          _focus: { bg: "navy.800" },
          _active: { bg: "navy.900" },
        },

        dark: (props) => ({
          color: "white",
          bg: mode("navy.700", "brand.400")(props),
          fontSize: "12px",
          _hover: { bg: mode("navy.800", "brand.400")(props) },
          _focus: { bg: mode("navy.800", "brand.400")(props) },
          _active: { bg: mode("navy.900", "brand.400")(props) },
        }),

        danger: () => ({
          color: "white",
          bg: "red.500",
          fontSize: "13px",
          _hover: { bg: "red.600" },
          _focus: { bg: "red.600" },
          _active: { bg: "red.600" },
        }),

        outlined: (props) => ({
          color: mode("brand.500", "white")(props),
          bg: "transparent",
          fontSize: "12px",
          border: "1px solid",
          borderColor: mode("brand.500", "whiteAlpha.400")(props),
          _hover: { bg: mode("brand.50", "whiteAlpha.100")(props) },
          _focus: { bg: mode("brand.50", "whiteAlpha.100")(props) },
          _active: { bg: mode("brand.50", "whiteAlpha.100")(props) },
        }),

        "no-effects": {
          _hover: "none",
          _active: "none",
          _focus: "none",
        },
      },
    },
  },
};
