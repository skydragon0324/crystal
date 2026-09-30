import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AspectRatio, Box, Image, Skeleton, useColorModeValue,
} from '@chakra-ui/react';
import { placeholderDataUri } from 'utils/mockImage';

/**
 * An <img> that cannot end up blank.
 *
 * Three things a bare Chakra <Image> does not do, all of which the
 * storefront needs:
 *
 *   1. A fallback CHAIN rather than a single fallback. The real upload is
 *      tried first; a mock photograph second; an inline SVG last. Chakra's
 *      own `fallbackSrc` is one deep, and if that one also fails - offline,
 *      blocked host - you are back to a broken icon.
 *   2. A skeleton that covers the load. `fallback` in Chakra replaces the
 *      image until it decides, which collapses the layout and makes the
 *      page jump when the picture arrives. This keeps the box at its final
 *      size and cross-fades.
 *   3. A placeholder that follows the colour mode. The light placeholder
 *      is a near-white panel; dropped into dark mode it reads as a lamp.
 *
 * Usage:
 *   <AppImage src={getFileUrl(row.image_url)} mock={mockProductImage(row)}
 *             label={row.product_name} ratio={1} />
 */
const AppImage = (props) => {
  const {
    src,
    mock,
    label,
    ratio,
    // `fill` is for a picture that has to cover a box sized by something
    // else - a hero slide, a banner. Height cannot come from the image
    // there, so the wrapper is taken out of flow and pinned to the parent
    // instead of trying to size itself from content it does not have.
    fill,
    objectFit = 'cover',
    borderRadius,
    skeleton = true,
    ...rest
  } = props;

  const tone = useColorModeValue('light', 'dark');

  const placeholder = useMemo(
    () => placeholderDataUri({ label, tone, width: 640, height: ratio ? Math.round(640 / ratio) : 420 }),
    [label, tone, ratio]
  );

  /*
   * The chain is rebuilt whenever its parts change, and empty entries are
   * dropped here rather than checked at every step. getFileUrl now returns
   * "" when the upload host is not configured, so an unconfigured
   * environment starts at the mock without ever issuing a doomed request.
   */
  const sources = useMemo(
    () => [src, mock, placeholder].filter(Boolean),
    [src, mock, placeholder]
  );

  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // A new row in the same mounted cell - a table page change, a filter -
  // has to start the chain over, or the previous row's fallback state
  // hides the new row's perfectly good image.
  useEffect(() => {
    setIndex(0);
    setLoaded(false);
  }, [sources[0]]); // eslint-disable-line react-hooks/exhaustive-deps

  const onError = useCallback(() => {
    setIndex((current) => (current < sources.length - 1 ? current + 1 : current));
  }, [sources.length]);

  const onLoad = useCallback(() => setLoaded(true), []);

  const image = (
    <Image
      src={sources[index]}
      alt={label || ''}
      objectFit={objectFit}
      w="100%"
      // Inside a fixed ratio or a filled box the image covers it; on its
      // own it keeps its natural proportions, which is what the long
      // marketing images on the product pages need.
      h={ratio || fill ? '100%' : 'auto'}
      borderRadius={borderRadius}
      opacity={loaded ? 1 : 0}
      transition="opacity .25s ease"
      draggable="false"
      onError={onError}
      onLoad={onLoad}
      {...rest}
    />
  );

  const framed = (
    <Box
      position={fill ? 'absolute' : 'relative'}
      top={fill ? '0' : undefined}
      left={fill ? '0' : undefined}
      w="100%"
      h={ratio || fill ? '100%' : undefined}
      // Without a ratio the wrapper has no height until the image loads,
      // so the skeleton would be a zero-pixel strip. This gives it
      // something to fill and is dropped the moment the image is in.
      minH={!ratio && !fill && skeleton && !loaded ? '120px' : undefined}
      borderRadius={borderRadius}
      overflow="hidden"
    >
      {skeleton && !loaded ? (
        <Skeleton
          position="absolute"
          top="0"
          left="0"
          w="100%"
          h="100%"
          borderRadius={borderRadius}
        />
      ) : null}
      {image}
    </Box>
  );

  // AspectRatio reserves the box before the bytes arrive, so a grid of
  // these does not reflow as they land one by one.
  return ratio ? <AspectRatio ratio={ratio}>{framed}</AspectRatio> : framed;
};

export default AppImage;
