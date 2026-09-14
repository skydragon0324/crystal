import { useColorMode } from '@chakra-ui/react';

/**
 * THE RICH TEXT EDITOR'S PALETTE, in both colour modes.
 *
 * It lives here, as literal hex, for one unavoidable reason: half of these
 * colours have to be written into a stylesheet the editor injects into its own
 * IFRAME, and an iframe has its own document that cannot see this page's CSS
 * variables. `useColorModeValue` gives back a Chakra token name - 'navy.800' -
 * which is exactly the thing that means nothing inside that frame.
 *
 * The other half goes into a `<Global>` block, because TinyMCE renders its
 * menus and dialogs into `.tox-tinymce-aux` on document.body, well outside the
 * component's own tree, so a scoped rule would never reach them.
 *
 * WHAT WAS WRONG BEFORE. These were the Horizon palette - #0C1533 navy,
 * #5B3FE0 purple - written when the console was drawn in that style. The
 * console has been Apex for some time: a neutral black dark ramp and one
 * saturated colour, Crystal's. The editor kept the old hexes, so opening an
 * article in night mode put a blue-black purple-accented panel in the middle
 * of a black page - the one component in the console that did not match it.
 *
 * These values ARE the ramps in theme/index.js, by hand:
 *
 *   navy.800 #0A0A0C   the card the editor sits on
 *   navy.700 #161619   a menu, one step above it
 *   navy.600 #242428   the border between them
 *   navy.50  #FAFAFA   text          navy.200 #A1A1AA  muted
 *   brand.500 #0EA5E9  the only saturated colour in the chrome
 *
 * Changing a ramp there means changing it here. That is the cost of a
 * component that has to write CSS into a document it does not own, and it is
 * written down rather than left to be discovered.
 */
export function editorPalette(isDark) {
  return isDark
    ? {
      /* the toolbar and the frame, matched to the card underneath them */
      bg: '#0A0A0C',
      raised: '#161619',
      border: '#242428',
      text: '#FAFAFA',
      muted: '#A1A1AA',
      hover: 'rgba(255, 255, 255, 0.06)',
      active: 'rgba(14, 165, 233, 0.22)',
      brand: '#38BDF8',
      tipBg: '#161619',

      /* inside the iframe */
      paper: '#0A0A0C',
      ink: '#FAFAFA',
      rule: '#242428',
      link: '#38BDF8',
      placeholder: '#6B6B72',
      selection: 'rgba(14, 165, 233, 0.32)'
    }
    : {
      bg: '#F8FAFC',
      raised: '#FFFFFF',
      border: '#E2E8F0',
      text: '#0F172A',
      muted: '#64748B',
      hover: '#F1F5F9',
      active: '#E0F2FE',
      brand: '#0284C7',
      tipBg: '#0F172A',

      paper: '#FFFFFF',
      ink: '#0F172A',
      rule: '#E2E8F0',
      link: '#0284C7',
      placeholder: '#94A3B8',
      selection: 'rgba(14, 165, 233, 0.24)'
    };
}

/** The same palette, following the colour mode the console is in. */
export function useEditorPalette() {
  const { colorMode } = useColorMode();
  const isDark = colorMode === 'dark';
  return { isDark: isDark, ui: editorPalette(isDark) };
}

export default useEditorPalette;
