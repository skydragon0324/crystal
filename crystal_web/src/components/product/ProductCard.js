import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Flex, Icon, IconButton, Image, Text, Tooltip } from '@chakra-ui/react';
import { FiCheck, FiRepeat } from 'react-icons/fi';
import { useDispatch, useSelector } from 'react-redux';
import Price from '@/components/common/Price';
import { MAX_COMPARE, selectCompareItems, toggle } from '@/app/compareSlice';
import { fileUrl } from '@/api/client';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * A product tile.
 *
 * The image box uses padding-bottom to hold its aspect ratio rather than
 * Chakra's AspectRatio, which forces `position:absolute; display:flex;
 * justify-content:center` onto its direct child at a specificity the child
 * cannot override - fine for a single image, wrong for anything that needs to
 * position inside it.
 *
 * The compare toggle is on the card because the compare tray is filled by
 * browsing, not by visiting a separate page.
 */
export default function ProductCard({ product, sectionPath, showCompare }) {
  const t = useT();

  const surface = useSurface();
  const dispatch = useDispatch();
  const compareItems = useSelector(selectCompareItems);

  const inCompare = compareItems.some((item) => item.id === product.id);
  const trayFull = compareItems.length >= MAX_COMPARE;
  const to = `${sectionPath || '/smartphones'}/products/${product.slug}`;

  return (
    <Box
      position="relative"
      borderRadius="14px"
      overflow="hidden"
      bg={surface.card}
      border="1px solid"
      borderColor={surface.border}
      transition="transform 180ms ease, box-shadow 180ms ease"
      _hover={{ transform: 'translateY(-4px)', boxShadow: surface.shadowLifted }}
    >
      {showCompare !== false && (
        <Tooltip
          label={
            inCompare
              ? 'Remove from comparison'
              : trayFull
                ? `You can compare up to ${MAX_COMPARE} products`
                : 'Add to comparison'
          }
          placement="left"
        >
          <IconButton
            position="absolute"
            top="2"
            right="2"
            zIndex="1"
            size="sm"
            borderRadius="full"
            aria-label={t('common.compare')}
            bg={inCompare ? 'brand.500' : surface.card}
            color={inCompare ? 'white' : surface.muted}
            boxShadow={surface.shadow}
            isDisabled={!inCompare && trayFull}
            icon={<Icon as={inCompare ? FiCheck : FiRepeat} boxSize="3.5" />}
            _hover={{ bg: inCompare ? 'brand.600' : surface.hover }}
            onClick={(event) => {
              event.preventDefault();
              dispatch(toggle(product));
            }}
          />
        </Tooltip>
      )}

      <RouterLink to={to}>
        <Box position="relative" pb="100%" bg={surface.raised}>
          <Image
            src={fileUrl(product.main_image)}
            alt={product.name}
            position="absolute"
            insetX="0" insetY="0"
            w="100%"
            h="100%"
            objectFit="cover"
            loading="lazy"
          />
        </Box>

        <Box p={{ base: 3, md: 4 }}>
          <Text fontWeight="700" color={surface.text} noOfLines={1}>
            {product.name}
          </Text>
          <Text fontSize="sm" color={surface.muted} noOfLines={2} minH="40px" mt="1">
            {product.tagline || (product.series_name ? `${product.series_name} series` : '')}
          </Text>
          <Flex align="baseline" gap="2" data-gap="8" mt="2">
            <Price amount={product.price} currency={product.currency} fontSize="lg" />
            {product.release_date && (
              <Text fontSize="xs" color={surface.muted}>
                {String(product.release_date).slice(0, 4)}
              </Text>
            )}
          </Flex>

          {/*
            * The finishes, as dots.
            *
            * They arrive with the row rather than being fetched per tile, and
            * they are drawn from the stored colour value rather than the
            * photograph - so the row is complete before any artwork has
            * loaded, which is the point of a swatch on a listing page.
            */}
          {(product.colors || []).length > 0 && (
            <Flex gap="1.5" data-gap="6" mt="2.5" align="center">
              {product.colors.slice(0, 5).map((colour) => (
                <Tooltip key={colour.id} label={colour.name} placement="top" openDelay={200}>
                  <Box
                    boxSize="12px"
                    borderRadius="full"
                    bg={colour.hex}
                    border="1px solid"
                    borderColor={surface.border}
                  />
                </Tooltip>
              ))}
              {product.colors.length > 5 && (
                <Text fontSize="xs" color={surface.muted}>
                  +{product.colors.length - 5}
                </Text>
              )}
            </Flex>
          )}
        </Box>
      </RouterLink>
    </Box>
  );
}
