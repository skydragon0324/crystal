import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Flex, SimpleGrid, Skeleton, SkeletonText, Text, useColorModeValue,
} from '@chakra-ui/react';
import AnimationScroll from 'components/Animation/AnimationScroll';
import HeroCarousel from 'components/Carousel/HeroCarousel';
import ProductCard from 'components/Product/ProductCard';
import SiteContainer from 'components/Layout/SiteContainer';
import { getProducts } from 'api/client/clientPhoneApi';
import useCustomToast from 'hooks/useCustomToast';
import useLang from 'lang/useLang';
import { RESP_CODES } from 'constants/responseCodes';
import { getPhoneHeroSlides } from 'constants/heroSlides';
import { getProductRanges } from 'constants/intro';
import { getLangText } from 'lang/lang';

const SKELETON_TILES = 8;

/**
 * The phone storefront.
 *
 * Four things changed here beyond the carousel at the top.
 *
 * Images. Every tile drew `getFileUrl(row.image_url)` straight into an
 * <img>. With no upload host configured that URL is unresolvable, so the
 * whole grid was broken-image icons. They go through AppImage now, which
 * falls back to a mock photograph and then to an inline placeholder, so a
 * tile always shows something.
 *
 * Colour. The page was painted in literal hex - #ffffff tiles, #232323
 * bars, #535353 text - which meant it stayed light while the rest of the
 * site went dark. Everything reads from the Horizon tokens instead.
 *
 * Filtering. Switching category emptied `rows` and refilled it from a
 * 50ms setTimeout. That is a visible blank frame, and it kept a second
 * copy of the list in state that could drift from the first. The filter
 * is derived during render now, so it is exact and instant.
 *
 * Loading. A single absolutely-positioned spinner sat over the layout;
 * the grid now shows skeleton tiles in the shape of the content that is
 * coming, which is also what the DataTable does elsewhere.
 */
function ProductsIntroPage() {
  const { toastError } = useCustomToast();
  const { locale } = useLang();

  const [activeId, setActiveId] = useState(0);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const pageBg = useColorModeValue('secondaryGray.300', 'navy.900');
  const cardBg = useColorModeValue('white', 'navy.700');
  const cardShadow = useColorModeValue(
    '14px 17px 40px 4px rgba(112, 144, 176, 0.08)',
    '14px 17px 40px 4px rgba(12, 44, 55, 0.18)'
  );
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const mutedColor = useColorModeValue('secondaryGray.700', 'secondaryGray.500');
  const tabBg = useColorModeValue('white', 'navy.800');
  const tabActiveBg = useColorModeValue('brand.500', 'brand.400');
  const tabInactiveColor = useColorModeValue('secondaryGray.700', 'secondaryGray.400');
  const borderColor = useColorModeValue('secondaryGray.100', 'whiteAlpha.100');

  const slides = useMemo(getPhoneHeroSlides, [locale]);
  const ranges = useMemo(getProductRanges, [locale]);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      const resp = await getProducts();

      // The component can be gone by the time this resolves - navigating
      // away mid-request used to set state on an unmounted tree.
      if (cancelled) return;

      if (resp.code === RESP_CODES.SUCCESS.code) {
        setRows(resp.data.rows || []);
      } else {
        toastError(resp.message);
      }
      setLoading(false);
    };

    fetchData();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** "All" shows every category section; anything else shows just its own. */
  const sections = useMemo(
    () => ranges.filter((menu) => (activeId === 0 ? menu.id !== 0 : menu.id === activeId)),
    [activeId, ranges]
  );

  const rowsFor = (categoryPk) =>
    rows.filter((row) => +row.category_pk === +categoryPk);

  /* ---------------- tiles ---------------- */

  const renderTile = (row, index) => (
    <AnimationScroll key={row.product_pk || index} type="top" delay={Math.min(index, 7) * 0.05}>
      <ProductCard row={row} />
    </AnimationScroll>
  );

  const renderSkeletonTile = (_, index) => (
    <Box key={`sk-${index}`} bg={cardBg} borderRadius="20px" boxShadow={cardShadow} p="14px">
      <Skeleton borderRadius="14px" paddingBottom="100%" />
      <SkeletonText mt="14px" noOfLines={2} spacing="8px" skeletonHeight="10px" />
    </Box>
  );

  return (
    <Box bg={pageBg} pb="60px">
      <SiteContainer pt={{ base: '0px', md: '20px' }}>
        <HeroCarousel slides={slides} interval={5000} />
      </SiteContainer>

      {/* ---- category tabs ---- */}
      <SiteContainer>
        <Flex
          mt={{ base: '20px', md: '28px' }}
          mb={{ base: '16px', md: '24px' }}
          align="center"
          justify={{ base: 'flex-start', md: 'center' }}
          gridGap="10px"
          // Narrow screens scroll the row rather than wrapping it into two
          // lines that push the grid down.
          overflowX="auto"
          className="global-scroll-x"
          py="4px"
        >
          {ranges.map((menu) => {
            const isActive = menu.id === activeId;
            return (
              <Box
                key={menu.id}
                as="button"
                type="button"
                onClick={() => setActiveId(menu.id)}
                flex="0 0 auto"
                px="18px"
                h="38px"
                borderRadius="19px"
                borderWidth="1px"
                borderColor={isActive ? 'transparent' : borderColor}
                bg={isActive ? tabActiveBg : tabBg}
                color={isActive ? 'white' : tabInactiveColor}
                fontSize="sm"
                fontWeight="700"
                transition="background .18s ease, color .18s ease"
                _hover={isActive ? undefined : { color: textColor }}
              >
                {menu.name}
              </Box>
            );
          })}
        </Flex>

        {/* ---- product sections ---- */}
        {loading ? (
          <SimpleGrid columns={{ base: 2, md: 3, lg: 4, xl: 5 }} spacing={{ base: '12px', md: '20px' }}>
            {Array.from({ length: SKELETON_TILES }).map(renderSkeletonTile)}
          </SimpleGrid>
        ) : (
          sections.map((category) => {
            const items = rowsFor(category.category_pk);

            return (
              <Box key={category.category_pk} mb={{ base: '28px', md: '44px' }}>
                <Flex align="baseline" justify="space-between" mb="14px" gridGap="12px">
                  <Text fontSize={{ base: 'lg', md: '2xl' }} fontWeight="800" color={textColor}>
                    {category.name}
                  </Text>
                  <Text fontSize="sm" color={mutedColor}>
                    {items.length}
                  </Text>
                </Flex>

                {items.length ? (
                  <SimpleGrid columns={{ base: 2, md: 3, lg: 4, xl: 5 }} spacing={{ base: '12px', md: '20px' }}>
                    {items.map(renderTile)}
                  </SimpleGrid>
                ) : (
                  <Box
                    bg={cardBg}
                    borderRadius="20px"
                    boxShadow={cardShadow}
                    py="40px"
                    textAlign="center"
                    fontSize="sm"
                    color={mutedColor}
                  >
                    {getLangText('PHONE_EMPTY_CATEGORY')}
                  </Box>
                )}
              </Box>
            );
          })
        )}
      </SiteContainer>
    </Box>
  );
}

export default ProductsIntroPage;
