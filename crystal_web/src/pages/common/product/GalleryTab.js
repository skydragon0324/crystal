import React from 'react';
import { Box, Image, Text } from '@chakra-ui/react';
import { EmptyState, ErrorState, Loading, Section } from '@/components/common';
import api from '@/api';
import { useApi } from '@/hooks/useApi';
import { fileUrl } from '@/api/client';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * The gallery tab: the product's ADVERTISING RUN.
 *
 * These are not the catalogue shots. The studio set - front, back, three
 * quarter - is already the row of main images at the top of the product page,
 * and showing it again behind a tab is the same photographs twice. What the
 * API returns here is the DETAIL purpose: the full width marketing panels,
 * each one a whole picture with its own copy burnt into the artwork.
 *
 * SO IT IS LAID OUT 1 x n, CONCATENATED. One column, each panel the full
 * width of the page, butted directly against the one above it with no gutter
 * and no card around it. That is what makes a run of panels read as one
 * continuous page rather than as a grid of thumbnails - which is exactly what
 * the previous 2- and 3-column grid turned it into, and why the copy inside
 * each panel was too small to read.
 *
 * There is no lightbox for the same reason: at full page width these are
 * already at their intended size, so a click-to-enlarge would enlarge nothing.
 *
 * `bleed` widens the run past the reading column. An advertising panel is
 * artwork rather than text, and artwork indented to the width of a paragraph
 * looks like a mistake.
 */
export default function GalleryTab({ slug }) {
  const t = useT();

  const surface = useSurface();
  const gallery = useApi(() => api.catalog.gallery(slug), [slug]);

  const panels = gallery.data || [];

  return (
    <Section bleed py={{ base: 0, md: 0 }}>
      {gallery.loading && (
        <Box py={{ base: 8, md: 12 }}>
          <Loading variant="list" count={3} height="320px" />
        </Box>
      )}

      {!gallery.loading && gallery.error && (
        <Box py={{ base: 8, md: 12 }}>
          <ErrorState message={gallery.error} onRetry={gallery.reload} />
        </Box>
      )}

      {!gallery.loading && !gallery.error && panels.length === 0 && (
        <Box py={{ base: 8, md: 12 }}>
          <EmptyState
            title={t('common.product.gallerytab.noGalleryImagesYet')}
            hint={t('common.product.gallerytab.theProductSAdvertisingPanels')}
          />
        </Box>
      )}

      {!gallery.loading && !gallery.error && panels.length > 0 && (
        <Box bg={surface.raised}>
          {panels.map((asset, index) => (
            <Box key={asset.id} position="relative">
              <Image
                src={fileUrl(asset.file_path)}
                alt={asset.alt_text || ''}
                display="block"
                w="100%"
                // No fixed height and no object-fit: each panel keeps its own
                // proportions. Forcing one ratio onto a run of artwork is how
                // the copy inside half of it ends up cropped off.
                h="auto"
                // The first panel is what the tab opens on; the rest are
                // below the fold on every screen this is read on.
                loading={index === 0 ? 'eager' : 'lazy'}
              />

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
          ))}
        </Box>
      )}
    </Section>
  );
}
