/**
 * LIGHT ONLY, FOR NOW - AND ONE FLAG DECIDES IT.
 *
 * The storefront is not designed in two colour schemes. It HAS a night mode,
 * inherited from the component library and offered in two places (the
 * settings drawer and the phone's menu), and the dark surfaces were never
 * reviewed against the photography, the brand blues or the certificate
 * scans. So it is switched off rather than drawn badly.
 *
 * SWITCHED OFF, NOT REMOVED, which is the point of doing it this way. Every
 * `useColorModeValue` in the codebase still has its dark half, the drawer
 * still has the control, and turning `ALLOW_NIGHT_MODE` to true is the whole
 * of what it takes to offer it again once somebody has designed it.
 *
 * WHY A STORAGE MANAGER RATHER THAN A DEFAULT.
 *
 * `initialColorMode: 'light'` only decides what a visitor with NO stored
 * preference gets. Chakra writes the choice to localStorage under
 * `chakra-ui-color-mode`, so anybody who ever pressed the dark button is
 * still dark, on every visit, for as long as that key survives - and no
 * amount of changing the default reaches them. Forcing it in an effect would
 * reach them, one paint late, as a flash of the wrong scheme.
 *
 * So the stored value is not read at all while night mode is off: the manager
 * below answers `light` to every question and throws writes away. There is
 * nothing left that can make the page dark, including a stale key from last
 * month and a visitor who finds the control in a cached bundle.
 *
 * THE KEY IS NOT DELETED. It costs nothing to leave, and it means a reader
 * who had chosen dark gets their choice back the day the flag flips rather
 * than being quietly reset to light.
 */
import { localStorageManager } from '@chakra-ui/react';

/** Whether the night scheme may be used at all. */
export const ALLOW_NIGHT_MODE = false;

/** What a visitor gets when nothing has been chosen - and, for now, always. */
export const DEFAULT_COLOUR_MODE = 'light';

/**
 * Answers `light` and forgets every write.
 *
 * `type` still says localStorage: it is what Chakra reads to decide whether
 * it may touch storage during server rendering, and lying about it would be
 * a different bug.
 */
const lightOnlyManager = {
  type: 'localStorage',
  get: () => DEFAULT_COLOUR_MODE,
  set: () => {}
};

/**
 * The manager ChakraProvider is given. The real one once night mode is
 * allowed; the fixed one until then.
 */
export const colourModeManager = ALLOW_NIGHT_MODE
  ? localStorageManager
  : lightOnlyManager;
