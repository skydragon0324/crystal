import { mode } from "@chakra-ui/theme-tools";

/**
 * Horizon UI input, textarea and select styling.
 *
 * Horizon's fields are tall (44px), heavily rounded (16px) and bordered
 * rather than filled. `main` is the default; `auth` and `search` are kept
 * because pages already reference them by name.
 */
export const inputStyles = {
  components: {
    Input: {
      baseStyle: {
        field: {
          fontWeight: 400,
          borderRadius: "8px",
        },
      },

      variants: {
        main: (props) => ({
          field: {
            bg: mode("transparent", "navy.800")(props),
            border: "1px solid",
            color: mode("secondaryGray.900", "white")(props),
            borderColor: mode("secondaryGray.100", "whiteAlpha.100")(props),
            borderRadius: "16px",
            fontSize: "sm",
            p: "20px",
            _placeholder: { color: "secondaryGray.600", fontWeight: "400" },
          },
        }),

        auth: (props) => ({
          field: {
            bg: mode("white", "navy.700")(props),
            border: "1px solid",
            borderColor: mode("secondaryGray.100", "transparent")(props),
            borderRadius: "16px",
            fontSize: "sm",
            _placeholder: { color: "secondaryGray.600", fontWeight: "400" },
          },
        }),

        search: (props) => ({
          field: {
            border: "none",
            py: "11px",
            borderRadius: "inherit",
            bg: mode("secondaryGray.300", "navy.900")(props),
            _placeholder: { color: "secondaryGray.600", fontWeight: "400" },
          },
        }),
      },
    },

    NumberInput: {
      baseStyle: { field: { fontWeight: 400 } },
      variants: {
        main: () => ({
          field: {
            bg: "transparent",
            border: "1px solid",
            borderColor: "secondaryGray.100",
            borderRadius: "16px",
            _placeholder: { color: "secondaryGray.600", fontWeight: "400" },
          },
        }),
      },
    },

    Select: {
      baseStyle: { field: { fontWeight: 400 } },
      variants: {
        main: (props) => ({
          field: {
            bg: mode("transparent", "navy.800")(props),
            border: "1px solid",
            color: "secondaryGray.600",
            borderColor: mode("secondaryGray.100", "whiteAlpha.100")(props),
            borderRadius: "16px",
            _placeholder: { color: "secondaryGray.600", fontWeight: "400" },
          },
          icon: { color: "secondaryGray.600" },
        }),
      },
    },

    Textarea: {
      baseStyle: { fontWeight: 400 },
      variants: {
        main: (props) => ({
          bg: mode("transparent", "navy.800")(props),
          border: "1px solid",
          borderColor: mode("secondaryGray.100", "whiteAlpha.100")(props),
          borderRadius: "16px",
          fontSize: "sm",
          p: "12px 16px",
          _placeholder: { color: "secondaryGray.600", fontWeight: "400" },
        }),
      },
    },
  },
};
