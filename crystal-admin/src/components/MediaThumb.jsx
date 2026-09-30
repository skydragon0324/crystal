import React from 'react';
import { Box } from '@chakra-ui/react';

import ImagePreview from './ImagePreview';
import { fileUrl } from '../api/client';
import { isVideoPath } from '../utils/media';

/**
 * One advert slide, small, in a list.
 *
 * A picture keeps the lightbox it has always had. A FILM DOES NOT: it shows
 * its first frame and nothing else, because `preload="metadata"` fetches a
 * few kilobytes while opening the file would fetch all sixty megabytes of it,
 * and a list of ten adverts would do that ten times over.
 *
 * Muted and never played - a row in a table is not a place a video should
 * start moving, let alone making noise.
 */
export default function MediaThumb({ path, alt, w, h }) {
  const width = w || '6.5rem';
  const height = h || '3.25rem';

  if (isVideoPath(path)) {
    return (
      <Box
        as="video"
        src={fileUrl(path)}
        muted
        playsInline
        preload="metadata"
        w={width}
        h={height}
        borderRadius="md"
        bg="gray.100"
        sx={{ objectFit: 'cover' }}
      />
    );
  }

  return (
    <ImagePreview path={path} alt={alt} title={alt}>
      <Box
        as="img"
        src={fileUrl(path)}
        alt={alt || ''}
        w={width}
        h={height}
        objectFit="cover"
        borderRadius="md"
        bg="gray.100"
      />
    </ImagePreview>
  );
}
