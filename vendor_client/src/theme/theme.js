import { extendTheme } from "@chakra-ui/react";
import { globalStyles } from "./styles";
import { breakpoints } from "./foundations/breakpoints";
import { buttonStyles } from "./components/button";
import { badgeStyles } from "./components/badge";
import { linkStyles } from "./components/link";
import { inputStyles } from "./components/input";
import { tableStyles } from "./components/table";
import { CardComponent } from "./additions/card/Card";
import { MainPanelComponent } from "./additions/layout/MainPanel";
import { PanelContentComponent } from "./additions/layout/PanelContent";
import { PanelContainerComponent } from "./additions/layout/PanelContainer";
// import { mode } from "@chakra-ui/theme-tools";

/**
 * Colour mode.
 *
 * The site ships light and follows the visitor's own choice from then on -
 * Chakra keeps it in localStorage under `chakra-ui-color-mode`, and
 * <ColorModeScript> in index.js applies it before the first paint so a
 * dark-mode visitor never sees a white flash on load.
 *
 * `useSystemColorMode` is deliberately false. Reading the OS preference
 * on every load would override a visitor who explicitly picked the other
 * one, which is the more surprising behaviour of the two.
 */
const config = {
  initialColorMode: "light",
  useSystemColorMode: false,
};

export default extendTheme(
  { config },
  { breakpoints }, // Breakpoints
  globalStyles,
  buttonStyles, // Button styles
  badgeStyles, // Badge styles
  linkStyles, // Link styles
  inputStyles, // Input styles
  tableStyles, // Table styles (the Horizon variant)
  CardComponent, // Card component
  MainPanelComponent, // Main Panel component
  PanelContentComponent, // Panel Content component
  PanelContainerComponent // Panel Container component
);
