import React, { useEffect, useState } from 'react';
import { IconButton, Icon, Tooltip } from '@chakra-ui/react';
import { FiArrowUp } from 'react-icons/fi';
import { useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';

import { selectCompareItems } from '@/app/compareSlice';
import { isCompareSection } from '@/components/product/CompareTray';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * BACK TO THE TOP, once there is a top to go back to.
 *
 * The pages this site is long on - the catalogue grid, the FAQ, a hundred
 * service centres, an article - all end a long way from the header, and the
 * header is where the navigation is. Without this the way back is a scroll
 * gesture the length of the page, or the Home key, which is not a thing most
 * people reach for in a browser.
 *
 * IT IS NOT ALWAYS THERE. A button floating over a page that has not moved is
 * an offer to undo something nobody did, and it covers the bottom right corner
 * - which on a phone is where a thumb rests. It appears past a screenful and
 * fades out again at the top.
 *
 * IT GETS OUT OF THE COMPARE TRAY'S WAY. The tray is a fixed bar across the
 * bottom of the smartphone pages; a button sitting on top of it would cover
 * the Compare action, which is the one thing that bar exists for.
 */

/** How far down before it is worth offering. Roughly one screenful. */
const SHOW_AFTER = 480;

export default function ScrollToTop() {
  const t = useT();
  const surface = useSurface();
  const location = useLocation();
  const compareItems = useSelector(selectCompareItems);

  const [visible, setVisible] = useState(false);

  useEffect(() => {
    /*
     * The handler is passive and does nothing but compare a number: it runs
     * on every scroll frame, and anything that reads layout in here - an
     * offsetHeight, a getBoundingClientRect - is a forced reflow per frame.
     */
    const onScroll = () => {
      setVisible(window.pageYOffset > SHOW_AFTER);
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* The tray is only up on the smartphone pages, and only once it has
     something in it - the same two conditions the tray itself renders on. */
  const trayIsUp = compareItems.length > 0
    && isCompareSection(location.pathname)
    && location.pathname.indexOf('/compare') === -1;

  return (
    /*
      A TOOLTIP, NOT `title`.

      The native tooltip is drawn by the operating system: it cannot take the
      site's typeface, its colours or its timing, so on a page set in AppFont
      one grey box in the browser's own font appears over it. `aria-label`
      stays - it is what a screen reader announces, and a Tooltip is a visual
      affordance rather than an accessible name.
    */
    <Tooltip label={t('components.scrolltotop.backToTop')} placement="left" openDelay={350} hasArrow>
    <IconButton
      aria-label={t('components.scrolltotop.backToTop')}
      icon={<Icon as={FiArrowUp} boxSize="5" />}
      position="fixed"
      right={{ base: 4, md: 6 }}
      bottom={trayIsUp ? { base: '92px', md: '96px' } : { base: 4, md: 6 }}
      zIndex="1050"
      size="lg"
      borderRadius="full"
      bg={surface.card}
      color={surface.text}
      border="1px solid"
      borderColor={surface.border}
      boxShadow={surface.shadowLifted}
      _hover={{ bg: surface.hover, color: 'brand.500' }}
      /*
       * Faded and lifted out of the way rather than unmounted, so it animates
       * both directions. `pointerEvents` is what stops an invisible button
       * swallowing a click on whatever is underneath it.
       */
      opacity={visible ? 1 : 0}
      transform={visible ? 'translateY(0)' : 'translateY(12px)'}
      pointerEvents={visible ? 'auto' : 'none'}
      transition="opacity 180ms ease, transform 180ms ease, bottom 180ms ease"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    />
    </Tooltip>
  );
}
