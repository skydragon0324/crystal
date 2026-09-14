import React from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import {
  Box,
  Button,
  Container,
  Flex,
  HStack,
  IconButton,
  Image,
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
import { fileUrl } from '@/api/client';
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
 */

/** Where comparing exists at all. */
export const COMPARE_SECTION = '/smartphones';

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
    <Box
      position="fixed"
      bottom="0"
      left="0"
      right="0"
      zIndex="1000"
      bg={surface.card}
      borderTop="1px solid"
      borderColor={surface.border}
      boxShadow={surface.shadowLifted}
      py="3"
    >
      <Container maxW="container.site" px={{ base: 4, md: 6 }}>
        <Flex align="center" justify="space-between" gap="4" data-gap="16">
          <HStack spacing="3" overflowX="auto" py="1" flex="1" minW="0">
            {items.map((item) => (
              <Flex
                key={item.id}
                align="center"
                gap="2" data-gap="8"
                pl="1"
                pr="2"
                py="1"
                borderRadius="10px"
                bg={surface.raised}
                flexShrink={0}
              >
                <Image
                  src={fileUrl(item.image)}
                  alt={item.name}
                  boxSize="32px"
                  borderRadius="6px"
                  objectFit="cover"
                />
                <Text fontSize="sm" fontWeight="600" maxW="140px" isTruncated>
                  {item.name}
                </Text>
                <IconButton
                  size="xs"
                  variant="ghost"
                  aria-label={`Remove ${item.name}`}
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
              {ready ? `Compare ${items.length}` : `Pick ${MIN_COMPARE - items.length} more`}
            </Button>
          </HStack>
        </Flex>
      </Container>
    </Box>
  );
}
