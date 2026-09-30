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
 * THIS IS THE STOREFRONT'S COPY. The console has one of its own, in its own
 * ramps; the two editors are the same component in two colour schemes, and
 * neither can import the other. These values ARE the ramps in
 * theme/index.js, by hand:
 *
 *   ink.900 #0E121C   the dark page ground
 *   ink.800 #161B29   the dark card the editor sits on
 *   ink.700 #1E2436   a menu, one step above it
 *   ink.600 #2C3348   the hairline between them
 *   ink.50  #F5F6F8   the light ground   ink.100 #E9EBF0  its hairline
 *   brand.500 #0EA5E9 the one saturated colour in the chrome
 *
 * Changing a ramp there means changing it here. That is the cost of a
 * component that has to write CSS into a document it does not own, and it is
 * written down rather than left to be discovered.
 */
export function editorPalette(isDark) {
  return isDark
    ? {
      /* the toolbar and the frame, matched to the card underneath them */
      bg: '#161B29',
      raised: '#1E2436',
      border: '#2C3348',
      text: '#F5F6F8',
      muted: '#A8AFC0',
      hover: 'rgba(255, 255, 255, 0.06)',
      active: 'rgba(14, 165, 233, 0.22)',
      brand: '#38BDF8',
      tipBg: '#0E121C',

      /* inside the iframe */
      paper: '#161B29',
      ink: '#F5F6F8',
      rule: '#2C3348',
      link: '#38BDF8',
      placeholder: '#7A8296',
      selection: 'rgba(14, 165, 233, 0.32)'
    }
    : {
      bg: '#F5F6F8',
      raised: '#FFFFFF',
      border: '#E9EBF0',
      text: '#0E121C',
      muted: '#7A8296',
      hover: '#E9EBF0',
      active: '#E0F2FE',
      brand: '#0284C7',
      tipBg: '#0E121C',

      paper: '#FFFFFF',
      ink: '#0E121C',
      rule: '#E9EBF0',
      link: '#0284C7',
      placeholder: '#A8AFC0',
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
