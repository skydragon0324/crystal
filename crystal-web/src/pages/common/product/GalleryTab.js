import React from 'react';
import { Box, Text } from '@chakra-ui/react';
import { EmptyState, ErrorState, Loading, Section } from '@/components/common';
import { VerifiedPicture } from '@/components/common/Picture';
import ImageAnimator from '@/components/ImageAnimator/ImageAnimator';
import api from '@/api';
import { useApi } from '@/hooks/useApi';
import VerifiedProductImage from '@/components/security/VerifiedProductImage';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * The gallery tab: the product's ADVERTISING RUN.
 *
 * These are not the catalogue shots. The studio set - front, back, three
 * quarter - is already the carousel at the top of the product page, and
 * showing it again behind a tab is the same photographs twice. What the API
 * returns here is the DETAIL purpose: the marketing panels, each one a whole
 * picture with its own copy burnt into the artwork.
 *
 * SO IT IS LAID OUT 1 x n, CONCATENATED. One column, each panel butted
 * directly against the one above it with no gutter and no card between them.
 * That is what makes a run of panels read as one continuous page rather than
 * as a grid of thumbnails - which is exactly what the previous 2- and
 * 3-column grid turned it into, and why the copy inside each panel was too
 * small to read.
 *
 * THE RUN IS THE WIDTH OF THE CONTENT COLUMN, AND NO WIDER THAN 1178px.
 *
 * It used to bleed edge to edge, and that was the opposite mistake: a 16:9
 * panel as wide as a 1920px window is 1080px tall, so no panel was ever
 * seen whole, and on a wide screen the copy was larger than the page's own
 * headings. In the column the run lines up with the specification sheet and
 * the tab bar above it, and a panel fits under the sticky header and tab bar
 * of an ordinary laptop screen.
 *
 * 1178px is the standard column's measure (1226px less its gutters). A
 * reader who widens the site with the settings drawer gets wider TEXT; the
 * artwork stays at the size it reads best at, centred, rather than growing
 * back into the problem - `wide` would make a panel 850px tall and `full` is
 * the window again.
 *
 * ON A PHONE THE RUN IS STILL FULL WIDTH, gutters included. 390px is
 * already narrower than the panels were drawn for, and a 16px margin either
 * side would only make their copy smaller.
 *
 * There is no lightbox: in the column the panels are close to the size they
 * were made at, so a click-to-enlarge would enlarge very little.
 */

/** The widest the run is drawn - the standard column's measure. */
export const ADVERT_RUN_MAX = '1178px';

export default function GalleryTab({ slug }) {
  const t = useT();

  const surface = useSurface();
  const gallery = useApi(() => api.catalog.gallery(slug), [slug]);

  const panels = gallery.data || [];

  return (
    <Section
      py={{ base: 0, md: 8 }}
      /* The column on a desktop; its gutters dropped on a phone - see ON A PHONE above. */
      containerProps={{ px: { base: 0, md: 6 } }}
    >
      {gallery.loading && (
        <Box py={{ base: 8, md: 4 }} px={{ base: 4, md: 0 }} maxW={ADVERT_RUN_MAX} mx="auto">
          <Loading variant="list" count={3} height="320px" />
        </Box>
      )}

      {!gallery.loading && gallery.error && (
        <Box py={{ base: 8, md: 4 }} px={{ base: 4, md: 0 }}>
          <ErrorState message={gallery.error} onRetry={gallery.reload} />
        </Box>
      )}

      {!gallery.loading && !gallery.error && panels.length === 0 && (
        <Box py={{ base: 8, md: 4 }} px={{ base: 4, md: 0 }}>
          <EmptyState
            title={t('common.product.gallerytab.noGalleryImagesYet')}
            hint={t('common.product.gallerytab.theProductSAdvertisingPanels')}
          />
        </Box>
      )}

      {!gallery.loading && !gallery.error && panels.length > 0 && (
        <Box
          data-advert-run=""
          maxW={ADVERT_RUN_MAX}
          mx="auto"
          bg={surface.raised}
          /* The run's outer corners match the carousel above it; the panels inside still butt together. */
          borderRadius={{ base: 0, md: '16px' }}
          overflow="hidden"
        >
          {panels.map((asset) => {
            const ratio = Number(asset.width) / Number(asset.height);
            const known = isFinite(ratio) && ratio > 0;

            return (
              <Box key={asset.id} position="relative">
                {/*
                  * VERIFIED, byte for byte, before it is drawn (CONTRACT §7).
                  *
                  * EACH PANEL KEEPS ITS OWN PROPORTIONS, taken from the width
                  * and height on its row - so its box is the right size from
                  * the first paint, with a skeleton in it, and the run does
                  * not jump down the page as the panels arrive. `contain`
                  * rather than `cover`, so a row whose numbers are slightly
                  * off costs a hairline of margin and never the copy at the
                  * edge of the artwork.
                  *
                  * A row with no numbers keeps the old natural layout, which
                  * holds a fixed height until the picture verifies and then
                  * takes the picture's own.
                  *
                  * THE WHOLE RUN IS DOWNLOADED to be checked. A panel's bytes
                  * cannot be shown before they are hashed, and the hash
                  * cannot be taken of bytes the browser has not fetched.
                  */}
                {asset.scene ? (
                  /*
                   * AN ANIMATED PANEL (spec section 2D). An advertising run
                   * is where a scene earns its keep - a product revealing
                   * itself, copy arriving after it - and the panel keeps its
                   * own proportions, so a run of scenes and stills sits in
                   * one column without the page jumping as they arrive.
                   *
                   * It plays by itself here, unlike a hero slide: there is no
                   * carousel around it to own the clock, and a panel somebody
                   * has scrolled to is a panel they are looking at.
                   */
                  <ImageAnimator
                    scene={asset.scene}
                    ariaLabel={asset.alt_text || ''}
                    borderRadius="0"
                  />
                ) : known ? (
                  <VerifiedPicture
                    integrity={asset.integrity}
                    expectedPath={asset.file_path}
                    alt={asset.alt_text || ''}
                    ratio={ratio}
                    fit="contain"
                    rounded={false}
                  />
                ) : (
                  <VerifiedProductImage
                    layout="natural"
                    integrity={asset.integrity}
                    expectedPath={asset.file_path}
                    alt={asset.alt_text || ''}
                    minH={{ base: '200px', md: '320px' }}
                  />
                )}

                {/*
                  The caption is for screen readers first - it is the alt text
                  spelt out - and it is only drawn when a panel actually carries
                  one, so a run of untitled artwork stays a clean column.
                */}
                {asset.alt_text && (
                  <Text
                    position="absolute"
                    bottom="0"
                    left="0"
                    right="0"
                    px={{ base: 4, md: 8 }}
                    py="2"
                    fontSize="xs"
                    color="whiteAlpha.800"
                    bgGradient="linear(to-t, blackAlpha.600, transparent)"
                    pointerEvents="none"
                    noOfLines={1}
                  >
                    {asset.alt_text}
                  </Text>
                )}
              </Box>
            );
          })}
        </Box>
      )}
    </Section>
  );
}
