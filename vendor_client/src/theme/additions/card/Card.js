/**
 * Horizon UI card.
 *
 * The defining Horizon surface: white, 20px radius, no border, lifted off
 * the tinted page by a wide soft shadow. The previous theme used a
 * hairline border and no shadow; both are restored to the Horizon values
 * here, and the page background in styles.js is tinted to match - a white
 * card on a white page would have nothing to lift away from.
 */
const Card = {
  baseStyle: {
    p: { base: "16px", md: "20px" },
    display: "flex",
    flexDirection: "column",
    width: "100%",
    position: "relative",
    minWidth: "0px",
    wordWrap: "break-word",
    backgroundClip: "border-box",
    borderRadius: "20px",
    boxShadow: "none",
  },

  variants: {
    panel: (props) => ({
      bg: props.colorMode === "dark" ? "navy.700" : "white",
      boxShadow:
        props.colorMode === "dark"
          ? "14px 17px 40px 4px rgba(12, 44, 55, 0.18)"
          : "14px 17px 40px 4px rgba(112, 144, 176, 0.08)",
    }),

    // For a card nested inside another card, where a second shadow would
    // read as a rendering artefact rather than depth.
    flat: (props) => ({
      bg: props.colorMode === "dark" ? "navy.800" : "secondaryGray.300",
      boxShadow: "none",
    }),

    outlined: (props) => ({
      bg: props.colorMode === "dark" ? "navy.700" : "white",
      boxShadow: "none",
      borderWidth: "1px",
      borderStyle: "solid",
      borderColor: props.colorMode === "dark" ? "whiteAlpha.200" : "secondaryGray.100",
    }),
  },

  defaultProps: {
    variant: "panel",
  },
};

export const CardComponent = {
  components: {
    Card,
  },
};
