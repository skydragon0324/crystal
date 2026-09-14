import React from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  Box,
  Button,
  Container,
  Flex,
  Heading,
  HStack,
  Icon,
  Image,
  SimpleGrid,
  Stack,
  Text
} from '@chakra-ui/react';
import { FiCheck, FiRepeat, FiStar } from 'react-icons/fi';
import { useDispatch, useSelector } from 'react-redux';

import { Breadcrumbs, ErrorState, Loading, Price, Section } from '@/components/common';
import HeroCarousel from '@/components/product/HeroCarousel';
import ProductCard from '@/components/product/ProductCard';
import SpecificationSheet from './product/SpecificationSheet';
import GalleryTab from './product/GalleryTab';
import ServicePricingTab from './product/ServicePricingTab';
import OsHistoryTab from './product/OsHistoryTab';
import api from '@/api';
import { useApi } from '@/hooks/useApi';
import { MAX_COMPARE, selectCompareItems, toggle } from '@/app/compareSlice';
import { fileUrl } from '@/api/client';
import { HEADER_HEIGHT } from '@/components/layout/siteNav';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * The tabs a product actually has.
 *
 * Not a constant, because two of them are conditional:
 *
 *   Service pricing   only where there is a price list to read. A tab that
 *                     opens on "nothing published yet" is a tab that should
 *                     not have been offered - and a product can switch it
 *                     off even when it has prices, which the API applies.
 *
 *   Software updates  SMARTPHONES ONLY. Crystal OS is a handset product;
 *                     a television reports a firmware build that has
 *                     nothing to do with it. Always shown for a handset,
 *                     even before the first update is published, because
 *                     "no updates yet" is a real and reassuring answer to
 *                     the question people open this tab to ask.
 */
function tabsFor(data) {
  const tabs = [{ key: '', label: 'Specification' }];

  tabs.push({ key: 'gallery', label: 'Gallery' });

  if ((data.service_pricing || []).length > 0) {
    tabs.push({ key: 'service-pricing', label: 'Service pricing' });
  }

  if (data.product && data.product.category_type === 'SMARTPHONE') {
    tabs.push({ key: 'os-history', label: 'Software updates' });
  }

  return tabs;
}

/**
 * The product page.
 *
 * The four tabs are ROUTED sub-pages (`/products/:slug/:tab?`), not in-place
 * state: a specification sheet and a repair price list are things people send
 * each other links to, and in-place tabs make that impossible. No tab renders
 * the specification, so the bare product URL is the overview.
 *
 * The tab bar is sticky under the site header. Its offset comes from
 * siteNav.HEADER_HEIGHT rather than a literal - three components depend on
 * that number and none of them can measure it.
 *
 * THE MAIN IMAGES ARE SIDE BY SIDE ON A DESKTOP AND A CAROUSEL ON A PHONE,
 * and neither of them autoplays. A landing-page hero rotates because it is
 * advertising a deck of unrelated things; these are three views of ONE object
 * that somebody is deliberately looking at, so nothing moves on its own and
 * nothing is hidden behind a timer. The phone gets a carousel only because
 * three squares across a 390px screen are three thumbnails.
 *
 * NO BUY BUTTON either. Selling happens on the Crystal Eshop, which is a
 * separate system this site cannot complete a purchase in - a button that
 * cannot buy anything is worse than no button, because it is only discovered
 * to be a link after it has been trusted.
 */
export default function ProductDetail({ sectionPath, sectionTitle }) {
  const t = useT();

  const surface = useSurface();
  const dispatch = useDispatch();
  const { slug, tab, category } = useParams();
  const compareItems = useSelector(selectCompareItems);

  /*
   * WHERE THIS PRODUCT LIVES, worked out from the url rather than taken on
   * trust from the prop.
   *
   * A smartphone is at `/smartphones/products/:slug`, but an eproduct is at
   * `/eproducts/:category/products/:slug` - the category is part of the
   * path. The route passed `/eproducts` as the section, so every tab link
   * this page built came out as `/eproducts/products/...`, which matches no
   * route at all: the gallery tab went to the 404 page, and the 404 page
   * offers to browse SMARTPHONES, which is how an eproduct ended up
   * pointing at the wrong section.
   */
  const base = category ? `${sectionPath}/${category}` : sectionPath;

  /*
   * WHERE "all products" GOES, which is not the same shape in both sections.
   *
   * Smartphones have a list of their own at `/smartphones/products`.
   * Eproducts do not: a category IS its list, at `/eproducts/:category`, so
   * pointing at `/eproducts/tv/products` is another link to the 404 page.
   */
  const listPath = category ? base : `${base}/products`;

  const product = useApi(() => api.catalog.product(slug), [slug]);

  if (product.loading) {
    return (
      <Section py={{ base: 6, md: 10 }}>
        <Loading variant="block" height="420px" />
      </Section>
    );
  }

  if (product.error) {
    return (
      <Section>
        <ErrorState message={product.error} onRetry={product.reload} />
        <Flex justify="center">
          <Button as={RouterLink} to={listPath} variant="quiet">
            {t('common.productdetail.backToAllProducts')}
          </Button>
        </Flex>
      </Section>
    );
  }

  /*
   * The reply is the product ROW plus the lists that hang off it - media,
   * finishes, box contents, sheet, prices, history, related.  Unpacking it
   * here once is what keeps every reference below reading like the API.
   */
  const data = product.data;
  const p = data.product;
  /*
   * A tab this product does not have falls back to the overview.
   *
   * The tabs are routed, so a link to a hidden one - a bookmark, a shared
   * url, the software updates tab while it is switched off - is a real
   * address somebody can arrive at. Showing the specification is a better
   * answer than an empty page.
   */
  const requested = tab || '';
  const inCompare = compareItems.some((item) => item.id === p.id);
  const trayFull = compareItems.length >= MAX_COMPARE;
  const priceCount = (data.service_pricing || []).length;

  // Only the tabs this product has anything to put in - see tabsFor.
  const tabs = tabsFor(data);
  const activeTab = tabs.some((item) => item.key === requested) ? requested : '';

  /*
   * COMPARISON IS A SMARTPHONE FEATURE.
   *
   * It lines two specification sheets up against each other, which is a
   * question people ask about handsets and not about a television and a
   * set-top box. The compare tray, the compare page and this button are all
   * keyed off the same test.
   */
  const comparable = p.category_type === 'SMARTPHONE';

  /*
   * The main images: at most three, and the same studio set the tile on the
   * listing page showed.
   *
   * `data.images` is the MAIN run out of product_images - a real relation of
   * the product's own, narrowed by the API to the artwork for the requesting
   * device. The advertising run (ADVERT) is what the gallery tab shows, and
   * the wide landing-page banner is still a media asset; neither belongs in
   * a row of square shots.
   *
   * Three is the cap because these sit in one row: a fourth either shrinks
   * the other three or wraps on its own, and both read as a mistake.
   */
  const shots = (data.images || [])
    .slice(0, 3)
    .map((asset) => ({
      id: asset.id,
      path: asset.file_path,
      altText: asset.alt_text || p.name
    }));

  // A product with no gallery rows still has the cover image on its own row,
  // so the page never opens with an empty band where the pictures should be.
  const mainImages = shots.length
    ? shots
    : (p.main_image ? [{ id: 'main', path: p.main_image, altText: p.name }] : []);

  const tabHref = (key) => `${base}/products/${p.slug}${key ? `/${key}` : ''}`;

  return (
    <>
      <Section py={{ base: 4, md: 6 }}>
        <Breadcrumbs
          items={[
            { label: sectionTitle, to: sectionPath },
            /*
             * The category, by name, for an eproduct - "Televisions" says
             * where you are in a way that "Products" does not, and it is
             * the page the link actually goes to.
             */
            { label: category ? (p.category_name || 'Products') : 'Products', to: listPath },
            { label: p.name }
          ]}
        />

        {mainImages.length > 0 && (
          /*
           * TWO LAYOUTS FOR THE SAME SHOTS, and the breakpoint is the reason.
           *
           * On a desktop they sit side by side - one column per image, so a
           * product with a single shot gets one big picture rather than one
           * picture and two holes. Nothing is hidden and nothing is timed.
           *
           * On a phone that does not work: three squares across a 390px
           * screen are three thumbnails, and stacking them means scrolling
           * past the front of the phone to reach the back. So the phone gets
           * a CAROUSEL - swipeable, with the indicator row saying how many
           * there are.
           *
           * Autoplay is OFF (`autoPlay={false}`). A landing-page hero rotates
           * because it is advertising a deck of unrelated things; these are
           * three views of ONE object that somebody is deliberately looking
           * at, and moving them under the reader is not helping.
           */
          <>
            <Box display={{ base: 'block', md: 'none' }}>
              <HeroCarousel
                slides={mainImages}
                ratio="100%"
                objectFit="contain"
                autoPlay={false}
                ariaLabel={`${p.name} images`}
              />
            </Box>

            <SimpleGrid
              display={{ base: 'none', md: 'grid' }}
              columns={mainImages.length}
              spacing="4"
            >
              {mainImages.map((shot) => (
                <Box
                  key={shot.id}
                  position="relative"
                  pb="100%"
                  borderRadius="16px"
                  overflow="hidden"
                  bg={surface.raised}
                >
                  <Image
                    src={fileUrl(shot.path)}
                    alt={shot.altText}
                    position="absolute"
                    insetX="0" insetY="0"
                    w="100%"
                    h="100%"
                    // `contain`, not `cover`: these are catalogue shots of a
                    // whole object, and cropping a phone to fill a square is
                    // how the corners of it disappear.
                    objectFit="contain"
                    loading="eager"
                  />
                </Box>
              ))}
            </SimpleGrid>
          </>
        )}
      </Section>

      {/* The tab bar, sticky under the header. */}
      <Box
        position="sticky"
        top={HEADER_HEIGHT}
        zIndex="900"
        bg={surface.page}
        borderY="1px solid"
        borderColor={surface.border}
      >
        <Container maxW="container.site" px={{ base: 4, md: 6 }}>
          <Flex
            align="center"
            justify="space-between"
            gap="4" data-gap="16"
            h="56px"
            overflowX="auto"
            sx={{ '&::-webkit-scrollbar': { height: '0px' } }}
          >
            <HStack spacing={{ base: 4, md: 8 }} h="100%">
              <Text
                fontWeight="800"
                color={surface.text}
                whiteSpace="nowrap"
                display={{ base: 'none', md: 'block' }}
              >
                {p.name}
              </Text>
              {tabs.map((item) => {
                const isActive = activeTab === item.key;
                return (
                  <Box
                    key={item.key || 'overview'}
                    as={RouterLink}
                    to={tabHref(item.key)}
                    h="100%"
                    display="flex"
                    alignItems="center"
                    fontSize="sm"
                    fontWeight={isActive ? 700 : 500}
                    color={isActive ? 'brand.500' : surface.muted}
                    borderBottom="2px solid"
                    borderColor={isActive ? 'brand.500' : 'transparent'}
                    whiteSpace="nowrap"
                    _hover={{ color: 'brand.500' }}
                  >
                    {item.label}
                    {item.key === 'service-pricing' && priceCount > 0 && (
                      <Text as="span" ml="1.5" fontSize="xs" opacity={0.7}>
                        {priceCount}
                      </Text>
                    )}
                  </Box>
                );
              })}
            </HStack>

            {/* The price travels with the tab bar so it stays readable while
                somebody is half way down the specification sheet. There is no
                button beside it - see the note at the top of this file. */}
            <HStack spacing="2" flexShrink={0} display={{ base: 'none', md: 'flex' }}>
              <Price amount={p.price} currency={p.currency} fontSize="lg" />
            </HStack>
          </Flex>
        </Container>
      </Box>

      {/* ---------------------------------------------- specification (default) */}
      {activeTab === '' && (
        <>
          <Section py={{ base: 8, md: 12 }}>
            <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={{ base: 8, md: 12 }}>
              <Stack spacing="4">
                <Heading size="2xl" letterSpacing="-0.03em" color={surface.text}>
                  {p.name}
                </Heading>
                {p.tagline && (
                  <Text fontSize="lg" color={surface.muted}>
                    {p.tagline}
                  </Text>
                )}
                {p.description && (
                  <Text color={surface.strong} whiteSpace="pre-wrap">
                    {p.description}
                  </Text>
                )}

                {/*
                  * The score is a SUMMARY carried from the Eshop, which is a
                  * separate system - so it is shown as a figure with the
                  * number of ratings behind it and does not link anywhere
                  * this site could not follow.
                  */}
                {p.rating_avg && (
                  <Flex align="center" gap="2" data-gap="8">
                    <Icon as={FiStar} color="brand.500" />
                    <Text fontWeight="700" color={surface.text}>
                      {Number(p.rating_avg).toFixed(1)}
                    </Text>
                    <Text fontSize="sm" color={surface.muted}>
                      {t('common.productdetail.ratingsOnTheCrystalEshop', { count: p.rating_count })}
                    </Text>
                  </Flex>
                )}
              </Stack>

              {/* The buy area */}
              <Box
                p={{ base: 5, md: 7 }}
                borderRadius="16px"
                border="1px solid"
                borderColor={surface.border}
                bg={surface.card}
                alignSelf="flex-start"
              >
                <Text fontSize="sm" color={surface.muted}>
                  {p.series_name ? `${p.series_name} series` : p.category_name}
                </Text>
                <Flex align="baseline" gap="3" data-gap="12" mt="1">
                  <Price amount={p.price} currency={p.currency} fontSize="3xl" />
                  {p.release_date && (
                    <Text fontSize="sm" color={surface.muted}>
                      released {p.release_date}
                    </Text>
                  )}
                </Flex>

                {/*
                  * The finishes.  The swatch is the stored colour value rather
                  * than the photograph, so the row is drawable before any
                  * artwork has loaded - which is the whole reason the column
                  * exists beside the image.
                  */}
                {data.colors && data.colors.length > 0 && (
                  <Box mt="5">
                    <Text fontSize="xs" color={surface.muted} textTransform="uppercase" letterSpacing="0.6px">
                      {data.colors.length} {data.colors.length === 1 ? 'finish' : 'finishes'}
                    </Text>
                    <HStack spacing="3" mt="2" wrap="wrap">
                      {data.colors.map((colour) => (
                        <Flex key={colour.id} align="center" gap="2" data-gap="8">
                          <Box
                            boxSize="18px"
                            borderRadius="full"
                            bg={colour.hex}
                            border="1px solid"
                            borderColor={surface.border}
                            flexShrink={0}
                          />
                          <Text fontSize="sm" color={surface.muted}>
                            {colour.name}
                          </Text>
                        </Flex>
                      ))}
                    </HStack>
                  </Box>
                )}

                <Stack spacing="3" mt="6">
                  {/*
                    * Comparison is the only action this page can actually
                    * carry out, so it is the only one offered - and with the
                    * buy button gone it is no longer the second button on a
                    * panel, which is what kept it looking optional.
                    */}
                  {comparable && (
                    <Button
                      size="lg"
                      variant={inCompare ? 'outlineBrand' : 'brand'}
                      leftIcon={<Icon as={inCompare ? FiCheck : FiRepeat} />}
                      isDisabled={!inCompare && trayFull}
                      onClick={() => dispatch(toggle(p))}
                    >
                      {inCompare ? 'In your comparison' : 'Add to comparison'}
                    </Button>
                  )}
                </Stack>

                <Stack spacing="2" mt="6" fontSize="sm" color={surface.muted}>
                  <Flex justify="space-between">
                    <Text>{t('common.warranty')}</Text>
                    <Text color={surface.text}>{p.warranty_months} months</Text>
                  </Flex>
                  <Flex justify="space-between">
                    <Text>{t('common.productdetail.repairablePartsListed')}</Text>
                    <Text color={surface.text}>{priceCount}</Text>
                  </Flex>
                  <Flex justify="space-between">
                    <Text>{t('common.softwareUpdates')}</Text>
                    <Text color={surface.text}>{(data.os_history || []).length}</Text>
                  </Flex>
                </Stack>
              </Box>
            </SimpleGrid>
          </Section>

          <Section tinted py={{ base: 8, md: 12 }}>
            <SpecificationSheet groups={data.specifications} />
          </Section>

          {/*
            * "In the box" USED TO BE A SECTION OF ITS OWN, and is not any
            * more.
            *
            * It was a band of six square tiles, one per boxed item, and there
            * is no photography for any of them - so what it actually drew was
            * six empty grey squares with a caption under each. A section that
            * can only be filled by artwork nobody has is a hole in the page,
            * not a feature waiting for content.
            *
            * The contents themselves have not been dropped: they belong in
            * the specification sheet as their own group, which is a list of
            * words and needs no pictures at all. See specification.txt, the
            * specification-group list - the group is `IN_THE_BOX`, and
            * `product_accessories` stays as the structured copy of the same
            * thing for the console and for whatever needs it row by row.
            */}

          {data.related && data.related.length > 0 && (
            <Section>
              <Heading size="lg" mb="6" color={surface.text}>
                {t('common.productdetail.youMayAlsoLike')}
              </Heading>
              <SimpleGrid columns={{ base: 2, md: 4 }} spacing={{ base: 4, md: 6 }}>
                {data.related.map((item) => (
                  <ProductCard
                    key={item.id}
                    product={item}
                    sectionPath={sectionPath}
                    showCompare={comparable}
                  />
                ))}
              </SimpleGrid>
            </Section>
          )}
        </>
      )}

      {activeTab === 'gallery' && <GalleryTab slug={p.slug} />}
      {activeTab === 'service-pricing' && (
        <ServicePricingTab slug={p.slug} currency={p.currency} />
      )}
      {activeTab === 'os-history' && <OsHistoryTab slug={p.slug} />}
    </>
  );
}
