import React, { useEffect, useRef, useState } from 'react';
import { Box, Image, Skeleton } from '@chakra-ui/react';

import { useVerifiedImage } from '@/components/security/hooks';
import { ImagePlaceholder } from '@/components/security/IntegrityState';
import { STATES } from '@/security/verifySignature';
import { useSurface } from '@/theme/tokens';

/**
 * A PICTURE THAT HOLDS ITS PLACE, AND A SKELETON UNTIL IT ARRIVES.
 *
 * Three things were repeated at every <Image> on the site and drifted apart
 * between them - the space a picture reserves, what stands there meanwhile,
 * and when the file is fetched at all. They belong together, because each one
 * is only right in terms of the other two:
 *
 *   THE BOX IS SIZED BEFORE THE FILE ARRIVES. An image with no reserved
 *   height is a page that jumps when it lands - the reader loses the line
 *   they were on, and on a page navigated by anchors they land in the wrong
 *   chapter. The caller gives a `ratio` (width / height) or a fixed height,
 *   and that box exists from the first paint.
 *
 *   A SKELETON, NOT A GREY PANEL. A flat rectangle and a picture that is
 *   still loading look the same, so a slow connection reads as a broken
 *   page. A skeleton says "something is coming here"; it is the same one the
 *   rest of the site uses while it waits (components/common/Loading.js).
 *
 *   LAZY, EVEN WHERE THE BROWSER CANNOT. `loading="lazy"` arrived in Chrome
 *   76 and this site supports 72, so on the oldest browsers it is ignored and
 *   every picture on a long page is fetched at once. Where the attribute is
 *   missing the src is withheld until an IntersectionObserver (Chrome 51)
 *   says the box is near the viewport. A browser with neither simply loads
 *   the picture, which is what it does today.
 *
 * `eager` turns both off, for the one picture that is already on screen when
 * the page opens - a hero. Deferring that one costs a round trip in the place
 * a reader is looking.
 *
 * SIGNED PICTURES COME IN THROUGH `verification`, NEVER THROUGH `src`.
 *
 * A product shot, an advert, a listing tile - anything the content signing
 * covers (CONTRACT §7) - is handed the verifier's ANSWER rather than an
 * address: a result from useVerifiedImage / useVerifiedImages, or the one
 * VerifiedPicture below asks for. Picture then draws the object URL inside
 * that answer ONLY WHEN THE ANSWER SAYS VERIFIED. While the check is out the
 * skeleton stands in the box; when it comes back invalid or unavailable the
 * neutral placeholder from IntegrityState does, and no address of the file
 * is put on an <img> at all. When `verification` is given, `src` IS NOT READ,
 * so a caller cannot pass the public address as a fallback even by mistake -
 * that address is exactly what somebody who replaced the file would like the
 * browser to load (see components/security/VerifiedHeroImage.js).
 *
 * For a signed picture the wait therefore has two halves - the check, then
 * the decode (or, with server-side verification, the download) of the file
 * that passed it - and the reader sees ONE skeleton across both, rather than
 * a skeleton, then a flat panel, then the picture.
 *
 * WHAT IT DOES NOT DO: a plain picture that fails leaves the reserved box
 * empty rather than showing a broken-image mark or its own address.
 */

/** How far outside the viewport a picture starts loading. */
const ROOT_MARGIN = '200px';

function nativeLazy() {
  return typeof HTMLImageElement !== 'undefined'
    && typeof HTMLImageElement.prototype === 'object'
    && 'loading' in HTMLImageElement.prototype;
}

/**
 * What may be drawn for a signed picture: the object URL of a VERIFIED
 * answer, and nothing for any other answer.
 */
function verifiedSource(verification) {
  if (!verification || verification.state !== STATES.VERIFIED) return null;
  return verification.url || null;
}

export default function Picture({
  src,
  verification,
  alt,
  ratio,
  height,
  fit,
  rounded,
  eager,
  skeleton = true,
  onLoad,
  imageProps,
  ...boxProps
}) {
  const surface = useSurface();

  /*
   * `verification` being PRESENT is what makes this a signed picture - a
   * null answer is "not answered yet", not "unsigned, use src instead".
   */
  const signed = verification !== undefined;
  const checking = signed && (!verification || verification.state === STATES.CHECKING);
  const source = signed ? verifiedSource(verification) : (src || null);
  const refused = signed && !checking && !source;

  /*
   * Which file finished loading (or failed), rather than a bare flag. A new
   * file in the same box is then a new wait on the very render it arrives,
   * instead of one frame later when an effect has noticed.
   */
  const [loaded, setLoaded] = useState(null);
  const [failed, setFailed] = useState(null);

  /*
   * `near` is whether the picture may be fetched yet. It starts true when the
   * browser can defer by itself (or the caller said eager), so that the src is
   * on the <img> from the first render and the browser decides - which is
   * better than JavaScript deciding a frame later.
   */
  const [near, setNear] = useState(() => !!eager || nativeLazy());
  const box = useRef(null);

  useEffect(() => {
    if (near || !box.current || typeof IntersectionObserver === 'undefined') {
      if (!near && typeof IntersectionObserver === 'undefined') setNear(true);
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setNear(true);
        observer.disconnect();
      }
    }, { rootMargin: ROOT_MARGIN });

    observer.observe(box.current);
    return () => observer.disconnect();
  }, [near]);

  const isLoaded = !!source && loaded === source;
  const isFailed = !!source && failed === source;
  const waiting = checking || (!!source && !isLoaded && !isFailed);

  let status = 'ready';
  if (refused) status = 'unverified';
  else if (waiting) status = 'waiting';
  else if (isFailed) status = 'failed';

  return (
    <Box
      ref={box}
      position="relative"
      overflow="hidden"
      bg={surface.raised}
      borderRadius={rounded === false ? undefined : (rounded || '12px')}
      /* One of the two reserves the space; a ratio is the padding trick, which works everywhere. */
      h={height}
      pb={height ? undefined : (100 / (ratio || 16 / 10)) + '%'}
      data-picture={status}
      {...boxProps}
    >
      {skeleton && waiting && (
        <Skeleton position="absolute" insetX="0" insetY="0" w="100%" h="100%" speed={1.2} />
      )}

      {/* The neutral note, in the reader's language; the reason is in the console. */}
      {refused && <ImagePlaceholder state={verification.state} />}

      {source && near && (
        <Image
          alt={alt || ''}
          position="absolute"
          insetX="0"
          insetY="0"
          w="100%"
          h="100%"
          objectFit={fit || 'cover'}
          loading={eager ? 'eager' : 'lazy'}
          opacity={isLoaded ? 1 : 0}
          transition="opacity 220ms ease"
          {...imageProps}
          /*
            AFTER the spread, so `imageProps` can restyle the picture but
            never swap the file: for a signed picture `source` is the
            verified object URL or nothing.
          */
          src={source}
          onLoad={(event) => {
            setLoaded(source);
            if (onLoad) onLoad(event);
          }}
          onError={() => setFailed(source)}
        />
      )}
    </Box>
  );
}

/**
 * A SIGNED PICTURE STANDING ON ITS OWN: asks the verifier about one envelope
 * and draws the answer through Picture.
 *
 * The object URL belongs to useVerifiedImage - made only after the size, the
 * SHA-256 and the type have all matched a trusted signature, and revoked when
 * this unmounts or is handed a different picture. A carousel does not use
 * this: it verifies its whole deck with one hook and hands each slide its own
 * answer through `verification`, so no picture is checked twice.
 */
export function VerifiedPicture({ integrity, expectedPath, ...rest }) {
  const result = useVerifiedImage(integrity, { expectedPath: expectedPath });
  return <Picture verification={result} {...rest} />;
}
