import React from 'react';
import { Box, Container } from '@chakra-ui/react';
import { useSurface } from '@/theme/tokens';

/**
 * A full-width band with the site's content column inside it.
 *
 * Every section of every page is one of these, so the content column and the
 * vertical rhythm are defined once rather than being retyped per page - which
 * is what makes sections stack cleanly whatever order a page puts them in.
 *
 * THE COLUMN IS NO LONGER A FIXED 1226px, and nothing here had to change for
 * that. `container.site` resolves to a CSS custom property that the settings
 * drawer writes, so a reader who has chosen a wider or narrower site gets it
 * here, in the header bar and in the footer at the same instant - see
 * app/appearance.js. This file asks for the token, which is the whole point
 * of there being a token.
 *
 * `bleed` drops the column and the side padding for the one kind of content
 * that should not sit inside a reading measure: a run of full-width artwork.
 * A section that needs it keeps the band, the background and the rhythm, and
 * only gives up the 1226px limit - which is why it is a flag here rather than
 * a page reaching around Section with a bare <Box>.
 */
export default function Section({ children, tinted, py, bleed, containerProps, ...rest }) {
  const surface = useSurface();

  return (
    <Box
      as="section"
      bg={tinted ? surface.raised : 'transparent'}
      py={py === undefined ? { base: 10, md: 16 } : py}
      {...rest}
    >
      <Container
        maxW={bleed ? '100%' : 'container.site'}
        px={bleed ? '0' : { base: 4, md: 6 }}
        {...containerProps}
      >
        {children}
      </Container>
    </Box>
  );
}
