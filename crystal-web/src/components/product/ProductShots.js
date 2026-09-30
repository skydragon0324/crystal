import React from 'react';
import { Box, Skeleton } from '@chakra-ui/react';

import HeroCarousel from './HeroCarousel';

/**
 * THE PRODUCT'S MAIN SHOTS, AS ONE CAROUSEL OF A SENSIBLE SIZE.
 *
 * These used to be laid out side by side on a desktop - one column per shot -
 * and a carousel only on a phone. That rule sized a picture by HOW MANY
 * pictures there were, which is backwards: a product with a single shot got
 * one column the full width of the page, and at the standard content width
 * that is a 1178px square, taller than the screen, with the product's name
 * and the tab bar pushed out of sight below it. Every product is now the same
 * carousel on every width, and its size is decided by the SCREEN.
 *
 * THE FRAME IS AT MOST 520px TALL, AND NEVER MORE THAN 60% OF THE WINDOW.
 *
 *   520px   the tallest picture that still leaves the breadcrumbs, the tab
 *           bar and the start of the product's name on the first screen of
 *           a 1440 x 900 laptop. It is also under half the 1200px the
 *           studio shots are made at, so they stay sharp on a 2x display.
 *
 *   60vh    the same promise on a shorter window - a 1366 x 768 laptop, a
 *           phone turned on its side - where 520px alone would fill it.
 *
 * On a phone held upright neither limit is reached and the frame is simply
 * the width of the column, which is what a phone is for.
 *
 * THE LIMITS ARE MAXIMUM WIDTHS, worked out from the frame's proportions,
 * rather than a maximum height. The frame keeps its shape with the padding
 * trick (see Picture.js - Chrome 72 has no aspect-ratio), and a padding box
 * cannot be told how tall to stop; a width it cannot exceed can. Two nested
 * boxes give "the smaller of the two" without CSS min(), which Chrome 72
 * does not have either.
 *
 * THE FRAME TAKES THE SHAPE OF THE FIRST SHOT, between 3:4 and 4:3.
 *
 * The first shot is the one on screen when the page opens - the front of the
 * product, in a studio set - and it is the one most visitors never swipe
 * past, so it is the one the frame fits exactly. A later shot of another
 * shape (the 4:3 "in use" picture after three squares) is shown whole inside
 * that frame with a margin above and below, which costs the picture one
 * swipe away rather than the one on arrival: framing the deck to its widest
 * shot instead was tried, and put grey bands either side of the front of
 * every phone. The clamp keeps one panoramic or very tall first picture from
 * turning the whole deck into a letterbox. A phone's frame is never wider
 * than square: its width is fixed, and a wider frame there only makes every
 * square shot smaller.
 *
 * The shape comes from the width and height on each image ROW, so it is
 * known on the first render - the frame is its final size before a single
 * byte of any picture has arrived, and nothing below it moves when they do.
 *
 * `contain`, never `cover`: these are catalogue shots of a whole object, and
 * cropping a phone to fill a frame is how the corners of it disappear.
 */

/** The tallest the frame is drawn on a large screen, in px. */
export const SHOT_MAX_HEIGHT = 520;

/** The tallest the frame is drawn relative to the window, in vh. */
export const SHOT_MAX_VIEWPORT = 60;

const NARROWEST = 3 / 4;
const WIDEST = 4 / 3;

/** Width / height of the frame on a desktop: the first shot's, clamped; square when it is not known. */
export function frameRatio(shots) {
  const first = (shots || [])[0];
  const ratio = first ? Number(first.width) / Number(first.height) : NaN;

  if (!isFinite(ratio) || ratio <= 0) return 1;
  return Math.min(WIDEST, Math.max(NARROWEST, ratio));
}

const round = (value) => Math.round(value * 100) / 100;

/** The frame's limits and padding for one ratio. */
function limits(ratio) {
  return {
    px: round(SHOT_MAX_HEIGHT * ratio) + 'px',
    vh: round(SHOT_MAX_VIEWPORT * ratio) + 'vh',
    pb: round(100 / ratio) + '%'
  };
}

/** Frame's two nested limits - see THE LIMITS ARE MAXIMUM WIDTHS above. */
function Frame({ phone, desktop, children, ...rest }) {
  return (
    <Box w="100%" mx="auto" maxW={{ base: phone.px, md: desktop.px }} {...rest}>
      <Box w="100%" mx="auto" maxW={{ base: phone.vh, md: desktop.vh }}>
        {children}
      </Box>
    </Box>
  );
}

/**
 * @param shots  [{ id, path, altText, integrity, width, height }] - verified
 *               before a byte of them is drawn (see HeroCarousel)
 * @param label  what the deck is called for a screen reader
 */
export default function ProductShots({ shots, label }) {
  const desktop = frameRatio(shots);
  const phone = Math.min(desktop, 1);

  const wide = limits(desktop);
  const narrow = limits(phone);

  return (
    <Frame phone={narrow} desktop={wide} data-product-shots="">
      {/*
        * IT PLAYS, like the hero decks. The shots were untimed at first, on
        * the grounds that somebody studying one object should not have it
        * move under them - but a product page opens on one view of a phone
        * and the other three are only found by somebody who notices the
        * arrows. Playing shows what there is; the deck pauses on hover, on
        * focus and on touch, and the play/pause button HeroCarousel draws for
        * a timed deck is how it is stopped for good.
        */}
      <HeroCarousel
        verified
        slides={shots}
        ratio={{ base: narrow.pb, md: wide.pb }}
        objectFit="contain"
        interval={5500}
        ariaLabel={label}
      />
    </Frame>
  );
}

/**
 * The frame while the product itself is still being fetched: the same
 * limits, square because no shot's shape is known yet, so the top of the
 * page is already the shape it is about to be.
 */
export function ProductShotsSkeleton() {
  const square = limits(1);

  return (
    <Frame phone={square} desktop={square}>
      <Box position="relative" pb="100%">
        <Skeleton position="absolute" insetX="0" insetY="0" borderRadius="16px" />
      </Box>
    </Frame>
  );
}
