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
import PopupAdverts from '@/components/common/PopupAdverts';
import HeroCarousel, { ADVERT_RATIO } from '@/components/product/HeroCarousel';
import ProductCard from '@/components/product/ProductCard';
import SeriesCard, { SeriesGrid } from '@/components/product/SeriesCard';
import VerifiedBackground from '@/components/security/VerifiedBackground';
import api from '@/api';
import { useApi } from '@/hooks/useApi';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';
import { date as formatDate, number } from '@/utils/format';

/**
 * The homepage.
 *
 * It is built entirely from the API - nothing on it is hardcoded (development
 * rule 1). The hero is the homepage's own advert run (`/site/showcase/home`);
 * the series strip, the featured products and the Crystal OS block come from
 * `/smartphones/home`; the rest from the blog and category lists.
 */

/**
 * WHAT CRYSTAL PROMISES, in the band under the hero.
 *
 * Every one of these eight strings is an ADDRESS now rather than the English
 * itself. They were written here as literals, so the first words a visitor
 * reads after the artwork stayed in English on a Chinese or a Russian page
 * while everything above and below them translated - which does not look
 * like a missing translation, it looks like a styling accident, and gets
 * reported as one if it gets reported at all.
 *
 * THREE OF THE TITLES ARE ADDRESSED WHERE THE CATALOGUE ALREADY HAS THEM.
 * home.freeDelivery, home.fiveYearsOfUpdates and common.serviceCentres are
 * existing entries, translated into all three languages, and kept alive
 * only by the literal text that used to sit in this array. Minting new keys
 * beside them would have orphaned three working translations to gain
 * nothing but a tidier column in this file.
 */
const PROMISES = [
  { icon: FiTruck, title: 'home.freeDelivery', body: 'home.promises.freeDeliveryBody' },
  { icon: FiCheckSquare, title: 'home.promises.warranty', body: 'home.promises.warrantyBody' },
  { icon: FiDownloadCloud, title: 'home.fiveYearsOfUpdates', body: 'home.promises.updatesBody' },
  { icon: FiMapPin, title: 'common.serviceCentres', body: 'home.promises.centresBody' }
];

export default function Home() {
  const t = useT();

  const surface = useSurface();
  const home = useApi(() => api.catalog.smartphoneHome(), []);
  const adverts = useApi(() => api.site.adverts('home'), []);
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
  /*
   * A release's highlights are stored as free text, one point per line - that
   * is what the console's editor writes into, and turning it into a
   * structured list would stop somebody pasting release notes straight in.
   */
  const osHighlights = String((data.os && data.os.highlights) || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  /*
   * THE HOMEPAGE'S OWN ADVERTISING, run from the console's Homepage adverts
   * page - not the smartphone page's, and not a product's photographs.
   *
   * This used to be the flagged smartphone's studio shots with its name laid
   * over them, because the homepage had nothing of its own to show. An advert
   * carries its copy in the artwork and says where it goes, so there is no
   * headline over it. The API has already picked this device's crops.
   *
   * EVERY ADVERT IS VERIFIED BEFORE IT IS DRAWN (CONTRACT §7). The artwork is
   * the first thing a visitor sees and the easiest file on the server to
   * swap, so each slide carries its image's signed `integrity` and the
   * carousel shows only bytes that match it. The alt text and the link are
   * the advert row's own, and are not signed.
   */
  const heroSlides = (adverts.data || []).map((advert) => ({
    id: advert.id,
    path: advert.file_path,
    altText: advert.alt_text,
    linkUrl: advert.link_url,
    /* image or video - the server decided, from what the stored bytes are. */
    mediaType: advert.media_type,
    integrity: advert.integrity
  }));

  return (
    <>
      {/*
        * THE CAMPAIGNS THAT OPEN OVER THE PAGE, when any are running today and
        * this browser has not been shown them yet. It renders nothing at all
        * the rest of the time, which is most of the time.
        */}
      <PopupAdverts />

      {/* ------------------------------------------------------------ hero */}
      <Section py={{ base: 4, md: 6 }}>
        {adverts.loading && <Loading variant="block" height="320px" />}

        {!adverts.loading && heroSlides.length > 0 && (
          <HeroCarousel
            verified
            slides={heroSlides}
            interval={7000}
            /* A phone is sent the tall crops, so its box is tall too. */
            ratio={ADVERT_RATIO}
            ariaLabel="Crystal"
          />
        )}

        {!adverts.loading && heroSlides.length === 0 && (
          <EmptyState
            title={t('home.noAdvertsYet')}
            hint={t('home.addThemOnTheConsole')}
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
                  {t(item.title)}
                </Text>
                <Text fontSize="xs" color={surface.muted}>
                  {t(item.body)}
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
          <SeriesGrid>
            {data.series.map((series) => (
              <SeriesCard
                key={series.id}
                series={series}
                to={`/smartphones/products?series=${series.slug}`}
              />
            ))}
          </SeriesGrid>
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
                        {number(category.product_cnt)}{' '}
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
            <VerifiedBackground
              w={{ base: '100%', md: '45%' }}
              minH={{ base: '180px', md: '300px' }}
              alignSelf="stretch"
              integrity={data.os.cover_image_integrity}
              expectedPath={data.os.cover_image}
              alt={data.os.title}
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
      {/*
        * THE BLOG STRIP CARRIES NO PICTURES, and that is the blog's decision
        * rather than this page's. Articles have no artwork to publish, so the
        * 56% box at the top of each card drew the empty raised surface three
        * times in a row - a hole where a photograph is supposed to be, which
        * reads as a page that failed to load rather than as a design.
        *
        * So the card is the article: the section and the day it went out,
        * then the headline at a size that can be scanned across three
        * columns, then the standfirst. It matches /blog, which is where
        * these three lead.
        */}
      {posts.data && posts.data.length > 0 && (
        <Section>
          <SectionHeading title={t('home.fromTheBlog')} moreTo="/blog" moreLabel={t('common.allArticles')} />
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={{ base: 5, md: 6 }}>
            {posts.data.map((article) => (
              <Stack
                key={article.id}
                as={RouterLink}
                to={`/blog/${article.slug}`}
                spacing="3"
                h="100%"
                p={{ base: 5, md: 6 }}
                borderRadius="14px"
                border="1px solid"
                borderColor={surface.border}
                bg={surface.card}
                transition="transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease"
                _hover={{
                  transform: 'translateY(-4px)',
                  boxShadow: surface.shadowLifted,
                  borderColor: 'brand.500',
                  textDecoration: 'none'
                }}
              >
                <Text
                  fontSize="xs"
                  fontWeight="700"
                  color="brand.500"
                  letterSpacing="0.08em"
                  textTransform="uppercase"
                >
                  {/* The vendor's shelf, as /blog labels it; Crystal's topic word only if there is none. */}
                  {(article.subject && article.subject.name) || article.category}
                  {article.published_at ? ' \u00b7 ' + formatDate(article.published_at) : ''}
                </Text>
                <Heading
                  size="md"
                  color={surface.text}
                  letterSpacing="-0.01em"
                  lineHeight="1.3"
                  noOfLines={3}
                >
                  {article.title}
                </Heading>
                <Text fontSize="sm" color={surface.muted} lineHeight="1.7" noOfLines={3}>
                  {article.summary}
                </Text>
              </Stack>
            ))}
          </SimpleGrid>
        </Section>
      )}
    </>
  );
}
