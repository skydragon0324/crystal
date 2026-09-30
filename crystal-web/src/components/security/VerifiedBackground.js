import React from 'react';
import { Box, Image } from '@chakra-ui/react';

import { STATES } from '@/security/verifySignature';
import { useVerifiedImage } from './hooks';
import { ImagePlaceholder } from './IntegrityState';

/** A cover-style image used by cards and marketing bands, rendered only
 * after its signed bytes verify. Layout props belong to the outer box. */
export default function VerifiedBackground({ integrity, expectedPath, alt, ...boxProps }) {
  const result = useVerifiedImage(integrity, { expectedPath: expectedPath });

  return (
    <Box position="relative" overflow="hidden" {...boxProps}>
      {result.state === STATES.VERIFIED && result.url ? (
        <Image
          src={result.url} alt={alt || ''}
          position="absolute" top="0" right="0" bottom="0" left="0"
          w="100%" h="100%" objectFit="cover"
        />
      ) : (
        <ImagePlaceholder state={result.state} />
      )}
    </Box>
  );
}
