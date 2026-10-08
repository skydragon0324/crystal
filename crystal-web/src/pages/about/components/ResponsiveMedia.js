import React from 'react';
import { AspectRatio, Box, Image, useColorMode } from '@chakra-ui/react';

import { useSurface } from '@/theme/tokens';

/**
 * ONE PICTURE, FOUR POSSIBLE FILES.
 *
 * Every marketing band on this page can carry a desktop crop, a mobile crop
 * and optionally a dark rendering of each. Choosing between them is four
 * lines of fallback logic, and four lines repeated in nine sections is where
 * the ninth one quietly stops using the mobile image.
 *
 * WHY NOT `<picture>` WITH MEDIA QUERIES. Because the dark variant is not a
 * media query the markup can see: the colour mode here is Chakra's, stored
 * per visitor and switchable without the OS preference changing, so `<picture>`
 * and `prefers-color-scheme` would disagree with the button in the header.
 * The choice has to be made in JavaScript, and once it is, `<img>` is enough.
 *
 * THE ASPECT RATIO IS FIXED BEFORE THE FILE ARRIVES. Every image on this page
 * is lazy-loaded, and a lazy image with no reserved height changes the height
 * of the page as it loads - which on a page navigated entirely by anchors
 * means scrolling to a chapter and landing somewhere else a second later.
 *
 * CROPPED OR WHOLE, PER PICTURE: that is `fit`.
 *
 * The frame has a fixed shape and a photograph rarely has the same one, so
 * something has to give. `cover` fills the frame and trims the overhang,
 * which is right for a photograph - a factory floor, a laboratory - where the
 * edges carry nothing. It is wrong for artwork that must be seen entire: a
 * product shot, a diagram, a certificate with a border. Those pass
 * `fit="contain"` and are shown whole, letterboxed against the frame.
 *
 * `cover` stays the default because eight of the nine chapters are
 * photographs, and changing a default is a change to every caller.
 */
export default function ResponsiveMedia({
  desktop, mobile, desktopDark, mobileDark, alt, ratio, eager, rounded, fit, ...rest
}) {
  const { colorMode } = useColorMode();
  const surface = useSurface();

  const isDark = colorMode === 'dark';

  /*
   * Desktop is the fallback for mobile rather than the other way round: a
   * chapter always has the wide crop, and the narrow one is the addition.
   * The dark file falls back to the light one at each size, so a photograph
   * with no dark version is simply used as it is - never inverted.
   */
  const wide = (isDark && desktopDark) || desktop || null;
  const narrow = (isDark && mobileDark) || mobile || (isDark && desktopDark) || desktop || null;

  if (!wide && !narrow) return null;

  const picture = function (src, display) {
    return (
      <AspectRatio
        ratio={ratio || 16 / 10}
        display={display}
        borderRadius={rounded === false ? '0' : '18px'}
        overflow="hidden"
        bg={surface.raised}
        {...rest}
      >
        <Image
          src={src}
          alt={alt || ''}
          objectFit={fit === 'contain' ? 'contain' : 'cover'}
          w="100%"
          h="100%"
          /*
           * `loading` is an attribute Chrome 72 does not know, and an unknown
           * attribute is ignored rather than breaking - so this is the safe
           * kind of progressive enhancement: newer browsers defer the image,
           * older ones load it as they always did.
           */
          loading={eager ? 'eager' : 'lazy'}
        />
      </AspectRatio>
    );
  };

  /*
   * Both are rendered and one is hidden by CSS, which is the one case where
   * that is right: `display: none` on an <img> stops Chrome fetching it, so
   * the hidden crop costs markup and no bytes - and switching between them on
   * a resize needs no re-render.
   */
  return (
    <Box>
      {narrow && picture(narrow, { base: 'block', md: 'none' })}
      {wide && picture(wide, { base: 'none', md: 'block' })}
    </Box>
  );
}
