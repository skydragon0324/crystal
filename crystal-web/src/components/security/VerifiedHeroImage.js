import React from 'react';
import { Image } from '@chakra-ui/react';

import { STATES } from '@/security/verifySignature';
import { useVerifiedImage } from './hooks';
import { ImagePlaceholder } from './IntegrityState';

/**
 * A HERO OR ADVERT PICTURE, drawn only from bytes that verified.
 *
 * Two ways in, because there are two kinds of caller:
 *
 *   `verification`  a result the caller already holds. HeroCarousel verifies
 *                   its whole deck at once - it has to, to know which slides
 *                   to keep - and hands each slide its own answer, so no
 *                   picture is fetched or checked twice.
 *
 *   `integrity`     the envelope, for a picture standing on its own. It is
 *                   verified here and the object URL lives and dies with
 *                   this component.
 *
 * Either way the <img> is given an object URL made from the verified Blob or
 * nothing at all. There is no branch that falls back to the file's public
 * address: that address is exactly what an attacker who replaced the file
 * would like the browser to load.
 *
 * It FILLS ITS BOX. The caller owns the ratio - a carousel track, a banner
 * frame - so a placeholder takes the same space the picture would have.
 *
 * NO loading="lazy". The bytes were downloaded to be verified before there
 * was anything to draw, so there is nothing left for the browser to defer.
 */
function HeroImageView({ result, alt, objectFit }) {
  if (!result || result.state !== STATES.VERIFIED || !result.url) {
    return <ImagePlaceholder state={result ? result.state : STATES.CHECKING} />;
  }

  return (
    <Image
      src={result.url}
      alt={alt || ''}
      w="100%"
      h="100%"
      objectFit={objectFit || 'cover'}
    />
  );
}

function SelfVerifyingHeroImage({ integrity, expectedPath, ...rest }) {
  const result = useVerifiedImage(integrity, { expectedPath: expectedPath });
  return <HeroImageView result={result} {...rest} />;
}

export default function VerifiedHeroImage({ verification, integrity, expectedPath, alt, objectFit }) {
  if (verification) {
    return <HeroImageView result={verification} alt={alt} objectFit={objectFit} />;
  }

  return (
    <SelfVerifyingHeroImage
      integrity={integrity}
      expectedPath={expectedPath}
      alt={alt}
      objectFit={objectFit}
    />
  );
}
