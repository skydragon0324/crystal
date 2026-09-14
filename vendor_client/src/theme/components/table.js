import { mode } from "@chakra-ui/theme-tools";

/**
 * Horizon UI table variant.
 *
 * Horizon tables carry no vertical rules and no zebra striping: the header
 * is a row of small uppercase grey labels over a single hairline, and rows
 * are separated by the same hairline. Density comes from padding, so the
 * cells are deliberately roomy.
 *
 * Registered as `horizon` rather than replacing `simple`, so any table
 * still asking for a stock Chakra variant is unaffected.
 */
export const tableStyles = {
  components: {
    Table: {
      variants: {
        horizon: (props) => ({
          th: {
            borderColor: mode("secondaryGray.100", "whiteAlpha.100")(props),
            color: "secondaryGray.600",
            fontWeight: "500",
            fontSize: { sm: "10px", lg: "12px" },
            lineHeight: "150%",
            letterSpacing: "0.02em",
            textTransform: "none",
            paddingInlineStart: "16px",
            paddingInlineEnd: "16px",
            pt: "14px",
            pb: "14px",
          },
          td: {
            borderColor: mode("secondaryGray.100", "whiteAlpha.100")(props),
            fontSize: "sm",
            paddingInlineStart: "16px",
            paddingInlineEnd: "16px",
            pt: "14px",
            pb: "14px",
          },
          // The final row sits flush against the card's own padding, so its
          // rule would double up with the card edge.
          "tbody tr:last-of-type td": {
            borderBottomWidth: "0",
          },
        }),
      },
    },
  },
};
