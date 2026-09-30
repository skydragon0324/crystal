import React from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import {
  Box,
  Button,
  Container,
  Flex,
  HStack,
  IconButton,
  Text
} from '@chakra-ui/react';
import { CloseIcon } from '@chakra-ui/icons';
import { useDispatch, useSelector } from 'react-redux';
import {
  MIN_COMPARE,
  clear,
  remove,
  selectCompareItems
} from '@/app/compareSlice';
import { VerifiedPicture } from '@/components/common/Picture';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * The compare tray: a bar that appears once something is in it.
 *
 * It is rendered by Layout, so it survives moving between product pages -
 * which is how it gets filled in the first place. It hides itself on the
 * compare page, where it would duplicate what the page already shows.
 *
 * AND ON EVERY PAGE THAT IS NOT A SMARTPHONE PAGE.
 *
 * Comparing is a smartphone feature: the specification matrix is pivoted from
 * the smartphone specification groups, the tray only ever holds handsets, and
 * "Add to comparison" is only offered on smartphone products. A bar across
 * the bottom of the Eproducts index, the blog or the about page was
 * advertising something none of those pages can do - and covering their last
 * 60 pixels to do it.
 *
 * The tray does not EMPTY off-section, only hides: somebody who wandered from
 * a handset to the blog and back should find their comparison where they left
 * it, which is the whole reason it is in Redux and mirrored to storage.
 *
 * IT WAS "NOT SHOWN" ON PHONES, AND IT WAS NOT THE TRAY. The product list's
 * filter row was wider than a 390px screen, and a page wider than the phone
 * makes the browser widen its LAYOUT viewport to fit - while the phone goes on
 * showing only its own width of it. `bottom: 0` is the bottom of the layout
 * viewport, so the tray was drawn, correctly, somewhere below the glass. The
 * row is fixed in pages/common/ProductList.js (and the same overflow on the
 * compare page in Compare.js); what is here makes sure the tray itself can
 * never be the thing that is too wide - on a phone a chip is its picture and
 * its remove button, the name is for wider screens and for screen readers,
 * and the row of chips scrolls inside the bar rather than widening it.
 */

/** Where comparing exists at all. */
export const COMPARE_SECTION = '/smartphones';

/**
 * THE BAR'S HEIGHT, FIXED, and the reason it is a number at all.
 *
 * A bar fixed to the bottom of the screen sits ON TOP of whatever is at the
 * bottom of the page - here the footer's last lines, including its links -
 * and nothing can scroll them out from under it. So the tray also puts a
 * spacer of exactly its own height at the end of the page, which only works
 * if the height is known rather than whatever the contents came to. 72px
 * holds one row of 40px chips and small buttons with room either side, and
 * layout/ScrollToTop lifts its button to 92px above the bottom (72 + 20)
 * while the tray is up.
 *
 * ON A PHONE WITH NO HOME BUTTON the bottom of the screen is the home
 * indicator's (index.html asks for viewport-fit=cover), so the bar and its
 * spacer both grow by env(safe-area-inset-bottom) - zero everywhere else,
 * and understood since Chrome 69.
 */
export const TRAY_HEIGHT = 72;

const SAFE_BOTTOM = 'env(safe-area-inset-bottom, 0px)';

export function isCompareSection(pathname) {
  const path = String(pathname || '');
  return path === COMPARE_SECTION || path.indexOf(COMPARE_SECTION + '/') === 0;
}

export default function CompareTray() {
  const t = useT();

  const surface = useSurface();
  const dispatch = useDispatch();
  const history = useHistory();
  const location = useLocation();
  const items = useSelector(selectCompareItems);

  const onComparePage = location.pathname.indexOf('/compare') !== -1;
  if (!items.length || onComparePage) return null;
  if (!isCompareSection(location.pathname)) return null;

  const ready = items.length >= MIN_COMPARE;

  return (
    <>
      {/* The end of the page, lifted clear of the bar - see TRAY_HEIGHT. */}
      <Box
        aria-hidden="true"
        flexShrink={0}
        /*
          The bar's row and its 1px top border, plus - as padding outside
          that height - the same safe area the bar pads by.
        */
        boxSizing="content-box"
        h={`${TRAY_HEIGHT + 1}px`}
        pb={SAFE_BOTTOM}
        data-compare-tray-spacer=""
      />

    <Box
      position="fixed"
      bottom="0"
      left="0"
      right="0"
      /* Under the site header (1200) and the phone's menu (1100), which must cover it when open. */
      zIndex="1000"
      bg={surface.card}
      borderTop="1px solid"
      borderColor={surface.border}
      boxShadow={surface.shadowLifted}
      pb={SAFE_BOTTOM}
      role="region"
      aria-label={t('common.compare')}
      data-compare-tray=""
    >
      <Container maxW="container.site" px={{ base: 4, md: 6 }}>
        {/*
          8px between the chips and the buttons, and between chips on a
          phone: at 360px that is what lets two chips - the smallest real
          comparison - sit beside Clear and Compare without scrolling. On a
          wider screen the chips' strip takes all the room there is, so the
          gap is only ever a minimum.
        */}
        <Flex align="center" justify="space-between" gap="2" data-gap="8" h={`${TRAY_HEIGHT}px`} minW="0">
          <HStack spacing={{ base: 2, md: 3 }} overflowX="auto" py="1" flex="1" minW="0">
            {items.map((item) => (
              <Flex
                key={item.id}
                align="center"
                gap="2" data-gap="8"
                pl="1"
                pr={{ base: 1, sm: 2 }}
                py="1"
                borderRadius="10px"
                bg={surface.raised}
                flexShrink={0}
              >
                <Box boxSize="32px" flexShrink={0}>
                  {/* A skeleton until the verified picture has decoded - see Picture. */}
                  <VerifiedPicture
                    integrity={item.imageIntegrity}
                    expectedPath={item.image}
                    alt={item.name}
                    ratio={1}
                    fit="cover"
                    rounded="6px"
                  />
                </Box>
                <Text
                  fontSize="sm"
                  fontWeight="600"
                  maxW="140px"
                  isTruncated
                  display={{ base: 'none', sm: 'block' }}
                >
                  {item.name}
                </Text>
                <IconButton
                  size="xs"
                  variant="ghost"
                  aria-label={t('components.product.removeItem', { name: item.name })}
                  icon={<CloseIcon boxSize="2" />}
                  onClick={() => dispatch(remove(item.id))}
                />
              </Flex>
            ))}
          </HStack>

          <HStack spacing="2" flexShrink={0}>
            <Button size="sm" variant="ghost" onClick={() => dispatch(clear())}>
              {t('common.clear')}
            </Button>
            <Button
              size="sm"
              variant="brand"
              isDisabled={!ready}
              onClick={() => history.push('/smartphones/compare')}
            >
              {ready
                ? t('common.productlist.compare', { count: items.length })
                : t('components.product.pickMore', { count: MIN_COMPARE - items.length })}
            </Button>
          </HStack>
        </Flex>
      </Container>
    </Box>
    </>
  );
}
