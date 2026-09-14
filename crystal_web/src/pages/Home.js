import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Flex,
  Heading,
  Icon,
  SimpleGrid,
  Stack,
  Text
} from '@chakra-ui/react';
import { FiCheckSquare, FiDownloadCloud, FiMapPin, FiTruck } from 'react-icons/fi';

import { EmptyState, ErrorState, Loading, Section, SectionHeading } from '@/components/common';
import HeroCarousel from '@/components/product/HeroCarousel';
import ProductCard from '@/components/product/ProductCard';
import api from '@/api';
import { useApi } from '@/hooks/useApi';
import { fileUrl } from '@/api/client';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * The homepage.
 *
 * It is built entirely from `/smartphones/home` plus the blog and category
 * lists - nothing on it is hardcoded (development rule 1). The hero, the
 * series strip, the featured products and the Crystal OS block all come from
 * that one call, which is also why the page settles in one go rather than
 * resolving section by section.
 */

const PROMISES = [
  { icon: FiTruck, title: 'Free delivery', body: 'On every order from the Crystal Eshop.' },
  { icon: FiCheckSquare, title: '12-month warranty', body: 'Register your device to skip the receipt.' },
  { icon: FiDownloadCloud, title: 'Five years of updates', body: 'On every model, whatever it cost.' },
  { icon: FiMapPin, title: 'Service centres', body: 'Walk in - no appointment needed.' }
];

export default function Home() {
  const t = useT();

  const surface = useSurface();
  const home = useApi(() => api.catalog.smartphoneHome(), []);
  const posts = useApi(() => api.blog.featured(3), []);
  const categories = useApi(() => api.catalog.categories(), []);

  if (home.loading) {
    return (
      <Section py={{ base: 6, md: 8 }}>
        <Loading variant="block" height="420px" />
        <Box mt="10">
          <Loading variant="grid" count={4} />
        </Box>
      </Section>
    );
  }

  if (home.error) {
    return (
      <Section>
        <ErrorState message={home.error} onRetry={home.reload} />
      </Section>
    );
  }

  const data = home.data;
  const hero = data.hero;
  /*
   * A release's highlights are stored as free text, one point per line - that
   * is what the console's editor writes into, and turning it into a
   * structured list would stop somebody pasting release notes straight in.
   */
  const osHighlights = String((data.os && data.os.highlights) || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const heroSlides = (hero && hero.media && hero.media.length ? hero.media : []).map((asset) => ({
    id: asset.id,
    path: asset.file_path,
    altText: asset.alt_text
  }));

  return (
    <>
      {/* ------------------------------------------------------------ hero */}
      <Section py={{ base: 4, md: 6 }}>
        {heroSlides.length > 0 ? (
          <Box position="relative">
            <HeroCarousel slides={heroSlides} interval={7000} ratio="38%" />
            {hero && (
              <Flex
                position="absolute"
                insetX="0" insetY="0"
                align="center"
                px={{ base: 6, md: 16 }}
                pointerEvents="none"
                bgGradient="linear(to-r, blackAlpha.600, transparent)"
                borderRadius="16px"
              >
                <Stack spacing="4" maxW="440px" pointerEvents="auto">
                  <Heading size="2xl" color="white" letterSpacing="-0.03em">
                    {hero.name}
                  </Heading>
                  <Text color="whiteAlpha.900" fontSize={{ base: 'sm', md: 'lg' }} noOfLines={3}>
                    {hero.tagline || hero.description}
                  </Text>
                  <Flex gap="3" data-gap="12">
                    <Button
                      as={RouterLink}
                      to={`/smartphones/products/${hero.slug}`}
                      variant="brand"
                      size="lg"
                    >
                      {t('common.learnMore')}
                    </Button>
                    {/*
                      NOT a compare link, which is what sat here.

                      Comparing is a smartphone feature - the matrix is built
                      from the smartphone specification groups and the tray
                      only ever holds handsets - and the homepage is not a
                      smartphone page. Offering it here sent a visitor
                      straight past the range into an empty comparison they
                      then had to go back and fill. The section itself is
                      where the phones to compare actually are.
                    */}
                    <Button
                      as={RouterLink}
                      to="/smartphones"
                      size="lg"
                      bg="whiteAlpha.300"
                      color="white"
                      _hover={{ bg: 'whiteAlpha.400' }}
                    >
                      {t('home.allSmartphones')}
                    </Button>
                  </Flex>
                </Stack>
              </Flex>
            )}
          </Box>
        ) : (
          <EmptyState
            title={t('home.noHeroProductYet')}
            hint={t('home.flagAProductAsThe')}
          />
        )}
      </Section>

      {/* --------------------------------------------------------- promises */}
      <Section tinted py={{ base: 8, md: 10 }}>
        <SimpleGrid columns={{ base: 2, md: 4 }} spacing={{ base: 6, md: 8 }}>
          {PROMISES.map((item) => (
            <Flex key={item.title} gap="3" data-gap="12" align="flex-start">
              <Icon as={item.icon} boxSize="6" color="brand.500" flexShrink={0} mt="0.5" />
              <Box minW="0">
                <Text fontWeight="700" color={surface.text} fontSize="sm">
                  {item.title}
                </Text>
                <Text fontSize="xs" color={surface.muted}>
                  {item.body}
                </Text>
              </Box>
            </Flex>
          ))}
        </SimpleGrid>
      </Section>

      {/* ----------------------------------------------------------- series */}
      {data.series && data.series.length > 0 && (
        <Section>
          <SectionHeading
            title={t('common.smartphones')}
            subtitle={t('home.fourSeriesFromTheFlagship')}
            moreTo="/smartphones"
            moreLabel={t('home.exploreSmartphones')}
          />
          <SimpleGrid columns={{ base: 2, md: 4 }} spacing={{ base: 4, md: 6 }}>
            {data.series.map((series) => (
              <Box
                key={series.id}
                as={RouterLink}
                to={`/smartphones/products?series=${series.slug}`}
                borderRadius="14px"
                overflow="hidden"
                bg={surface.raised}
                position="relative"
                transition="transform 180ms ease"
                _hover={{ transform: 'translateY(-4px)' }}
              >
                <Box
                  position="relative"
                  pb="120%"
                  backgroundImage={`url(${fileUrl(series.banner_image)})`}
                  backgroundSize="cover"
                  backgroundPosition="center"
                />
                <Flex
                  position="absolute"
                  insetX="0" insetY="0"
                  direction="column"
                  justify="flex-end"
                  p="4"
                  bgGradient="linear(to-t, blackAlpha.700, transparent 55%)"
                >
                  <Text fontWeight="800" color="white" fontSize="xl">
                    {series.name}
                  </Text>
                  <Text fontSize="xs" color="whiteAlpha.800" noOfLines={2}>
                    {series.description}
                  </Text>
                </Flex>
              </Box>
            ))}
          </SimpleGrid>
        </Section>
      )}

      {/* --------------------------------------------------------- featured */}
      {data.featured && data.featured.length > 0 && (
        <Section tinted>
          <SectionHeading
            title={t('common.featured')}
            subtitle={t('home.whatTheProductTeamsAre')}
            moreTo="/smartphones/products"
            moreLabel={t('home.allSmartphones')}
          />
          <SimpleGrid columns={{ base: 2, md: 3, lg: 4 }} spacing={{ base: 4, md: 6 }}>
            {data.featured.slice(0, 8).map((product) => (
              <ProductCard key={product.id} product={product} sectionPath="/smartphones" />
            ))}
          </SimpleGrid>
        </Section>
      )}

      {/* ------------------------------------------------------- eproducts */}
      {categories.data && categories.data.filter((c) => c.type !== 'SMARTPHONE').length > 0 && (
        <Section>
          <SectionHeading
            title={t('common.eproducts')}
            subtitle={t('home.televisionsSetTopBoxesComputers')}
            moreTo="/eproducts"
          />
          <SimpleGrid columns={{ base: 2, md: 4 }} spacing={{ base: 4, md: 6 }}>
            {categories.data
              .filter((category) => category.type !== 'SMARTPHONE')
              .map((category) => (
                <Flex
                  key={category.id}
                  as={RouterLink}
                  to={`/eproducts/${category.slug}`}
                  direction="column"
                  p="6"
                  borderRadius="14px"
                  border="1px solid"
                  borderColor={surface.border}
                  minH="150px"
                  justify="space-between"
                  transition="border-color 160ms ease, transform 160ms ease"
                  _hover={{ borderColor: 'brand.500', transform: 'translateY(-3px)' }}
                >
                  <Text fontWeight="700" fontSize="lg" color={surface.text}>
                    {category.name}
                  </Text>
                  <Box>
                    <Text fontSize="sm" color={surface.muted} noOfLines={2}>
                      {category.description}
                    </Text>
                    {category.product_cnt !== undefined && (
                      <Text fontSize="xs" color="brand.500" mt="2" fontWeight="600">
                        {category.product_cnt}{' '}
                        {Number(category.product_cnt) === 1 ? 'product' : 'products'}
                      </Text>
                    )}
                  </Box>
                </Flex>
              ))}
          </SimpleGrid>
        </Section>
      )}

      {/* -------------------------------------------------------- crystal os */}
      {data.os && (
        <Section tinted>
          <Flex
            direction={{ base: 'column', md: 'row' }}
            align="center"
            gap={{ base: 6, md: 12 }} data-gap="24" data-gap-md="48" data-gap-row-from="md"
            borderRadius="20px"
            overflow="hidden"
            bg={surface.card}
            border="1px solid"
            borderColor={surface.border}
          >
            <Box
              w={{ base: '100%', md: '45%' }}
              minH={{ base: '180px', md: '300px' }}
              backgroundImage={`url(${fileUrl(data.os.cover_image)})`}
              backgroundSize="cover"
              backgroundPosition="center"
              alignSelf="stretch"
            />
            <Stack spacing="4" p={{ base: 6, md: 10 }} flex="1">
              <Text fontSize="xs" fontWeight="700" color="brand.500" letterSpacing="1px">
                {t('common.crystalOs')} {data.os.version}
              </Text>
              <Heading size="lg" color={surface.text}>
                {data.os.title}
              </Heading>
              <Text color={surface.muted}>{data.os.description}</Text>
              {osHighlights.length > 0 && (
                <Stack spacing="1.5" pt="1">
                  {osHighlights.slice(0, 3).map((line) => (
                    <Flex key={line} gap="2" data-gap="8" align="flex-start">
                      <Box mt="7px" boxSize="5px" borderRadius="full" bg="brand.500" flexShrink={0} />
                      <Text fontSize="sm" color={surface.strong}>
                        {line}
                      </Text>
                    </Flex>
                  ))}
                </Stack>
              )}
              <Button as={RouterLink} to="/support/os" variant="outlineBrand" alignSelf="flex-start">
                {t('home.whatIsNew')}
              </Button>
            </Stack>
          </Flex>
        </Section>
      )}

      {/* ------------------------------------------------------------- blog */}
      {posts.data && posts.data.length > 0 && (
        <Section>
          <SectionHeading title={t('home.fromTheBlog')} moreTo="/blog" moreLabel={t('common.allArticles')} />
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={{ base: 5, md: 6 }}>
            {posts.data.map((article) => (
              <Box
                key={article.id}
                as={RouterLink}
                to={`/blog/${article.slug}`}
                borderRadius="14px"
                overflow="hidden"
                border="1px solid"
                borderColor={surface.border}
                transition="transform 180ms ease, box-shadow 180ms ease"
                _hover={{ transform: 'translateY(-4px)', boxShadow: surface.shadowLifted }}
              >
                <Box
                  pb="56%"
                  backgroundImage={`url(${fileUrl(article.cover_image)})`}
                  backgroundSize="cover"
                  backgroundPosition="center"
                  bg={surface.raised}
                />
                <Box p="5">
                  <Text fontSize="xs" fontWeight="700" color="brand.500" letterSpacing="0.6px">
                    {article.category}
                  </Text>
                  <Text fontWeight="700" color={surface.text} mt="1" noOfLines={2}>
                    {article.title}
                  </Text>
                  <Text fontSize="sm" color={surface.muted} mt="2" noOfLines={2}>
                    {article.summary}
                  </Text>
                </Box>
              </Box>
            ))}
          </SimpleGrid>
        </Section>
      )}
    </>
  );
}
