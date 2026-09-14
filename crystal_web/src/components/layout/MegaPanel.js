import React, { useRef } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Container,
  Flex,
  Link,
  SimpleGrid,
  Skeleton,
  Stack,
  Text
} from '@chakra-ui/react';
import { useSelector } from 'react-redux';
import { menuColumns } from './siteMenu';
import { selectCatalogStatus, selectCategories } from '@/app/catalogSlice';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * The desktop catalogue menu: a full-bleed panel of text-link columns, in the
 * apple.com manner.
 *
 * Deliberately no product tiles. A grid of thumbnails in a menu is slower to
 * scan than a list of names, needs images loaded before it is usable, and
 * pushes the actual navigation below the fold on a laptop.
 *
 * The columns come from the live category tree (siteMenu.buildMenu), so a
 * category added in the console appears here without a code change.
 */
export default function MegaPanel({ menu, onMouseEnter, onClose }) {
  const t = useT();
  const surface = useSurface();
  const categories = useSelector(selectCategories);
  const status = useSelector(selectCatalogStatus);

  const live = menuColumns(categories, menu);
  const isOpen = !!menu && live.length > 0;

  /*
   * WHAT WAS IN IT IS KEPT WHILE IT CLOSES.
   *
   * The panel collapses over 220ms and `menu` goes null the instant the
   * pointer leaves, so rendering only the live columns empties the box on
   * the first frame of the animation - it does not fold away, it blinks out
   * and then a blank strip folds. Holding the last set means the collapse
   * has something to collapse.
   */
  const held = useRef([]);
  if (isOpen) held.current = live;

  const columns = isOpen ? live : held.current;

  /*
   * Only the two catalogue menus wait on anything. The other four are
   * built from routes this application already knows, so showing them a
   * skeleton would be pretending to fetch something.
   */
  const needsCategories = menu === 'smartphones' || menu === 'eproducts';
  const loading = needsCategories && status === 'loading' && categories.length === 0;

  return (
    <Box
      position="absolute"
      left="0"
      right="0"
      top="100%"
      bg={surface.card}
      borderBottom="1px solid"
      borderColor={surface.border}
      boxShadow={isOpen ? surface.shadowLifted : 'none'}
      // Animating max-height rather than mounting/unmounting keeps the panel
      // out of the layout when closed without a mount cost on every hover.
      maxH={isOpen ? '460px' : '0'}
      opacity={isOpen ? 1 : 0}
      overflow="hidden"
      transition="max-height 220ms ease, opacity 160ms ease"
      pointerEvents={isOpen ? 'auto' : 'none'}
      onMouseEnter={onMouseEnter}
      aria-hidden={!isOpen}
    >
      <Container maxW="container.site" py="8">
        {loading ? (
          <SimpleGrid columns={{ base: 2, lg: 4 }} spacing="8">
            {Array.from({ length: 4 }).map((ignored, index) => (
              <Stack key={index} spacing="3">
                <Skeleton height="14px" width="60%" />
                <Skeleton height="12px" />
                <Skeleton height="12px" />
                <Skeleton height="12px" width="70%" />
              </Stack>
            ))}
          </SimpleGrid>
        ) : (
          <SimpleGrid columns={{ base: 2, lg: 4 }} spacing="8">
            {columns.map((column) => (
              <Stack key={column.key} spacing="3">
                {column.href ? (
                  <Link
                    as={RouterLink}
                    to={column.href}
                    fontSize="xs"
                    fontWeight="700"
                    letterSpacing="0.6px"
                    textTransform="uppercase"
                    color={surface.muted}
                    _hover={{ color: 'brand.500', textDecoration: 'none' }}
                    onClick={onClose}
                  >
                    {t(column.title)}
                  </Link>
                ) : (
                  <Text
                    fontSize="xs"
                    fontWeight="700"
                    letterSpacing="0.6px"
                    textTransform="uppercase"
                    color={surface.muted}
                  >
                    {t(column.title)}
                  </Text>
                )}

                {column.links.map((link) =>
                  link.external ? (
                    <Link
                      key={t(link.label)}
                      href={link.href}
                      isExternal
                      fontSize="md"
                      fontWeight="500"
                      color={surface.text}
                      _hover={{ color: 'brand.500', textDecoration: 'none' }}
                    >
                      {t(link.label)}
                    </Link>
                  ) : (
                    <Flex key={link.to} align="baseline" gap="2" data-gap="8">
                      <Link
                        as={RouterLink}
                        to={link.to}
                        fontSize="md"
                        fontWeight="500"
                        color={surface.text}
                        _hover={{ color: 'brand.500', textDecoration: 'none' }}
                        onClick={onClose}
                      >
                        {t(link.label)}
                      </Link>
                      {link.hint && (
                        <Text fontSize="xs" color={surface.muted}>
                          {link.hint}
                        </Text>
                      )}
                    </Flex>
                  )
                )}
              </Stack>
            ))}
          </SimpleGrid>
        )}
      </Container>
    </Box>
  );
}
