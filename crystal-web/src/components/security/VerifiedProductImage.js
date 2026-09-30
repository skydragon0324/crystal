import React from 'react';
import { Box, Image } from '@chakra-ui/react';

import { STATES } from '@/security/verifySignature';
import { useVerifiedImage } from './hooks';
import { ImagePlaceholder } from './IntegrityState';

/**
 * A PRODUCT PICTURE - a studio shot or a gallery panel - drawn only from
 * bytes that verified.
 *
 * TWO SHAPES, because the product page has two kinds of picture:
 *
 *   fill      a studio shot in a square tile. The tile owns the ratio and
 *             this fills it, placeholder included, so a shot that fails
 *             leaves a square with a neutral note in it rather than a hole
 *             that reflows the row.
 *
 *   natural   a gallery panel, which keeps its own proportions (see
 *             GalleryTab - forcing a ratio crops the copy burnt into the
 *             artwork). A panel that has not verified has no proportions to
 *             keep, so it holds `minH` until it does.
 *
 * THE OBJECT URL is made and revoked by useVerifiedImage: made only after the
 * size, the SHA-256 and the type have all matched the signature, and revoked
 * when this unmounts or is handed a different picture.
 */
export default function VerifiedProductImage({ integrity, expectedPath, alt, objectFit, layout, minH }) {
  const result = useVerifiedImage(integrity, { expectedPath: expectedPath });
  const natural = layout === 'natural';

  if (result.state !== STATES.VERIFIED || !result.url) {
    if (!natural) return <ImagePlaceholder state={result.state} />;

    return (
      <Box position="relative" minH={minH || '240px'}>
        <ImagePlaceholder state={result.state} />
      </Box>
    );
  }

  if (natural) {
    return (
      <Image
        src={result.url}
        alt={alt || ''}
        display="block"
        w="100%"
        h="auto"
      />
    );
  }

  return (
    <Image
      src={result.url}
      alt={alt || ''}
      position="absolute"
      top="0" right="0" bottom="0" left="0"
      w="100%"
      h="100%"
      objectFit={objectFit || 'contain'}
    />
  );
}
