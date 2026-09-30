import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Flex,
  Heading,
  SimpleGrid,
  Stack,
  Text
} from '@chakra-ui/react';

import { ErrorState, Loading, Section, SectionHeading } from '@/components/common';
import HeroCarousel, { ADVERT_RATIO } from '@/components/product/HeroCarousel';
import ProductCard from '@/components/product/ProductCard';
import SeriesCard, { SeriesGrid } from '@/components/product/SeriesCard';
import { IntegrityMessage } from '@/components/security/IntegrityState';
import VerifiedFAQ from '@/components/security/VerifiedFAQ';
import VerifiedBackground from '@/components/security/VerifiedBackground';
import SectionAgencies from '@/components/support/SectionAgencies';
import api from '@/api';
import { useApi } from '@/hooks/useApi';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * One landing page, parameterised by section.
 *
 * `/api/smartphones/home` and `/api/sections/:type/home` return the same
 * shape, so the Smartphone landing and every Eproduct landing are this one
 * component with a different `type`. Five near-identical pages would drift
 * within a month.
 *
 * Sections in spec order: Hero, Series, Featured, Crystal OS, Compare,
 * Support.
 */

/** How many products the Latest band will ever show. See the note on it below. */
const LATEST_LIMIT = 4;
export default function SectionLanding({ type, sectionPath, title }) {
  const t = useT();

  const surface = useSurface();

  const home = useApi(
    () => (type === 'SMARTPHONE' ? api.catalog.smartphoneHome() : api.catalog.sectionHome(type)),
    [type]
  );

  if (home.loading) {
    return (
      <Section py={{ base: 6, md: 8 }}>
        <Loading variant="block" height="380px" />
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
   * The API already chose which artwork to send - it read the device from the
   * request and returned only the assets that suit it - so this maps rows to
   * slides and does not filter.
   */
  /*
   * THE SECTION'S OWN ADVERTISING, not a product's photographs.
   *
   * `hero_slides` is the smartphone page's advert run (the console's
   * Smartphone adverts page), or an eproduct section's HERO run on its
   * CATEGORY - pictures of a range,
   * with their copy burnt into the artwork, which is what belongs at the
   * top of a landing page. The API has already narrowed them to the
   * requesting device, so a phone gets the tall crops.
   *
   * A section with none falls back to the flagged product below, so the
   * page still opens with something rather than a hole - and that fallback
   * is the only reason the product hero is still read at all.
   */
  /*
   * BOTH RUNS ARE VERIFIED (CONTRACT §7). Each slide carries its image's
   * `integrity` envelope and the carousel is told to check it: only bytes
   * whose size, SHA-256 and type match a trusted signature are ever drawn,
   * and a slide that fails is left out of the deck - see HeroCarousel. The
   * alt text and the link are the row's own, and are not signed.
   */
  const sectionSlides = (data.hero_slides || []).map((asset) => ({
    id: asset.id,
    path: asset.file_path,
    altText: asset.alt_text,
    linkUrl: asset.link_url,
    /* image or video - the server decided, from what the stored bytes are. */
    mediaType: asset.media_type,
    integrity: asset.integrity
  }));

  const productSlides = (hero && hero.media ? hero.media : []).map((asset) => ({
    id: asset.id,
    path: asset.file_path,
    altText: asset.alt_text,
    integrity: asset.integrity
  }));

  const isSmartphones = type === 'SMARTPHONE';

  // What the support links and the centres band both mean by "section".
  const sectionKey = isSmartphones ? 'SMARTPHONE' : 'EPRODUCT';

  return (
    <>
      <Section py={{ base: 4, md: 6 }}>
        <Flex align="baseline" justify="space-between" gap="4" data-gap="16" data-gap-wrap mb="5" wrap="wrap">
          <Heading size="xl" letterSpacing="-0.03em" color={surface.text}>
            {title || data.category.name}
          </Heading>
          <Button as={RouterLink} to={`${sectionPath}/products`} variant="quiet" size="sm">
            {t('common.all')} {(title || data.category.name).toLowerCase()}
          </Button>
        </Flex>

        {/*
          The section run when there is one, and it stands on its own: the
          copy is in the picture, so there is no headline laid over it and
          nothing to get in the way of the artwork.
        */}
        {sectionSlides.length > 0 && (
          <HeroCarousel
            verified
            slides={sectionSlides}
            interval={7000}
            ratio={ADVERT_RATIO}
            ariaLabel={`${title || data.category.name} highlights`}
          />
        )}

        {sectionSlides.length === 0 && productSlides.length > 0 && hero && (
          <Box position="relative">
            <HeroCarousel verified slides={productSlides} interval={7000} ratio="38%" />
            <Flex
              position="absolute"
              insetX="0" insetY="0"
              align="center"
              px={{ base: 6, md: 14 }}
              bgGradient="linear(to-r, blackAlpha.600, transparent)"
              borderRadius="16px"
              pointerEvents="none"
            >
              <Stack spacing="3" maxW="420px" pointerEvents="auto">
                <Heading size="xl" color="white" letterSpacing="-0.02em">
                  {hero.name}
                </Heading>
                <Text color="whiteAlpha.900" noOfLines={2}>
                  {hero.tagline}
                </Text>
                <Button
                  as={RouterLink}
                  to={`${sectionPath}/products/${hero.slug}`}
                  variant="brand"
                  alignSelf="flex-start"
                >
                  {t('common.learnMore')}
                </Button>
              </Stack>
            </Flex>
          </Box>
        )}
      </Section>

      {/*
        A LINE-UP NEEDS MORE THAN ONE LINE.
        
        Televisions, set-top boxes and computers each sit under a single
        placeholder series that means nothing - it exists because the schema
        allowed one, not because the range has lines. A band inviting you to
        choose between one option is furniture, so it is drawn only where
        there is a genuine choice. Smartphones have four; cameras have their
        own split between IP cameras and recorders.
      */}
      {data.series && data.series.length > 1 && (
        <Section tinted>
          <SectionHeading title={t('common.sectionlanding.series')} subtitle={data.category.description} />
          {/*
            * A line is its banner and its name; the products themselves are
            * one click away, and the API sends a count rather than a nested
            * grid precisely so this page does not become the whole catalogue.
            * The server has already dropped any line with nothing published in
            * it.
            *
            * The card and the grid are the homepage's, imported rather than
            * repeated - see components/product/SeriesCard.js for why a series
            * that looked wide here and square there was a picture problem.
            */}
          <SeriesGrid>
            {data.series.map((series) => (
              <SeriesCard
                key={series.id}
                series={series}
                to={`${sectionPath}/products?series=${series.slug}`}
              />
            ))}
          </SeriesGrid>
        </Section>
      )}

      {data.featured && data.featured.length > 0 && (
        <Section>
          <SectionHeading
            title={t('common.featured')}
            moreTo={`${sectionPath}/products?featured=true`}
            moreLabel={t('common.sectionlanding.seeAllFeatured')}
          />
          <SimpleGrid columns={{ base: 2, md: 3, lg: 4 }} spacing={{ base: 4, md: 6 }}>
            {data.featured.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                sectionPath={sectionPath}
                showCompare={isSmartphones}
              />
            ))}
          </SimpleGrid>
        </Section>
      )}

      {/*
        FOUR AT MOST, AND THE PAGE SAYS SO AS WELL AS THE API.

        "Latest" is a promise about recency, not about quantity: a band that
        runs to eleven products is not the newest ones, it is the catalogue
        in date order, and it pushes Crystal OS and the support cards off
        the bottom of a landing page that is meant to be scannable.

        The API orders and limits this list too. The slice here is not
        distrust of it - it is that a landing page's shape must not depend
        on a query parameter somewhere else: one row of four on a desktop,
        whatever arrives. Deliberately a bare slice rather than anything
        cleverer, so there is nothing to keep in step with the server.
      */}
      {data.latest && data.latest.length > 0 && (
        <Section>
          <SectionHeading
            title={t('common.sectionlanding.latest')}
            subtitle={t('common.sectionlanding.theMostRecentlyReleasedNewest')}
            moreTo={`${sectionPath}/products?sort=newest`}
            moreLabel={t('common.sectionlanding.seeAll')}
          />
          {/* One clean row from md up, because there are never more than four. */}
          <SimpleGrid columns={{ base: 2, md: 4 }} spacing={{ base: 4, md: 6 }}>
            {data.latest.slice(0, LATEST_LIMIT).map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                sectionPath={sectionPath}
                showCompare={isSmartphones}
              />
            ))}
          </SimpleGrid>
        </Section>
      )}

      {/*
        CRYSTAL OS IS A SMARTPHONE PRODUCT.

        A television reports a firmware build that has nothing to do with it,
        so a Crystal OS band on the eproduct landing page is advertising an
        operating system those devices do not run.
      */}
      {isSmartphones && data.os && (
        <Section tinted>
          <Flex
            direction={{ base: 'column', md: 'row' }}
            gap={{ base: 6, md: 12 }} data-gap="24" data-gap-md="48" data-gap-row-from="md"
            align="center"
            borderRadius="20px"
            overflow="hidden"
            bg={surface.card}
            border="1px solid"
            borderColor={surface.border}
          >
            <VerifiedBackground
              w={{ base: '100%', md: '42%' }}
              minH={{ base: '160px', md: '280px' }}
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
              <Button as={RouterLink} to="/support/os" variant="outlineBrand" alignSelf="flex-start">
                {t('common.sectionlanding.releaseNotes')}
              </Button>
            </Stack>
          </Flex>
        </Section>
      )}

      {/*
        The centres that serve THIS section, with only this section services.
        A phone customer and an eproduct customer are served at different
        counters, often by different staff, so the same building can appear
        on both pages offering two different lists.
      */}
      <SectionAgencies section={sectionKey} />

      {isSmartphones && (
        <Section>
          <Flex
            direction={{ base: 'column', md: 'row' }}
            align="center"
            justify="space-between"
            gap="6" data-gap="24" data-gap-row-from="md"
            p={{ base: 6, md: 10 }}
            borderRadius="20px"
            bgGradient="linear(to-r, brand.500, brand.700)"
          >
            <Box>
              <Heading size="lg" color="white">
                {t('common.sectionlanding.notSureWhichOne')}
              </Heading>
              <Text color="whiteAlpha.900" mt="2" maxW="520px">
                {t('common.sectionlanding.putTwoToFourHandsets')}
              </Text>
            </Box>
            <Button
              as={RouterLink}
              to="/smartphones/compare"
              size="lg"
              bg="white"
              color="brand.600"
              _hover={{ bg: 'whiteAlpha.900' }}
              flexShrink={0}
            >
              {t('common.comparePhones')}
            </Button>
          </Flex>
        </Section>
      )}

      {/*
        SUPPORT FOR THIS SECTION, and everything in it is scoped.

        A smartphone customer and an eproduct customer are served by
        different people, from different price lists, under different
        warranty terms - so the three cards carry the section with them and
        the questions are the ones this section's customers actually ask.

        The centres are NOT here: they are a band of their own above, with
        the services each one offers in this section.
      */}
      {data.support && (
        <Section tinted>
          <SectionHeading
            title={t('common.support')}
            subtitle={t('common.sectionlanding.repairsWarrantyAndTheAnswers')}
          />

          {/* The questions this section's customers actually ask - the API
              narrows them by category, so a television owner is not shown a
              question about a SIM tray. */}
          {/*
            * SIGNED, like the FAQ page they lead to: the question, the answer
            * and the id the link opens are the verified ones. A card that has
            * not verified keeps its place with the neutral state in it and
            * links nowhere - sending a visitor to open an answer this page
            * would not show them is not a link worth offering.
            */}
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={{ base: 3, md: 4 }}>
            {(data.support.faqs || []).map((row) => (
              <VerifiedFAQ key={row.id} faq={row}>
                {({ state, faq }) => (faq ? (
                  <Box
                    as={RouterLink}
                    to={`/support/faq?open=${faq.id}`}
                    p="4"
                    borderRadius="12px"
                    bg={surface.card}
                    border="1px solid"
                    borderColor={surface.border}
                    _hover={{ borderColor: 'brand.500' }}
                  >
                    <Text fontWeight="600" color={surface.text} noOfLines={1}>
                      {faq.question}
                    </Text>
                    <Text fontSize="sm" color={surface.muted} noOfLines={2} mt="1">
                      {faq.answer}
                    </Text>
                  </Box>
                ) : (
                  <Box
                    p="4"
                    borderRadius="12px"
                    bg={surface.card}
                    border="1px solid"
                    borderColor={surface.border}
                  >
                    <IntegrityMessage state={state} />
                  </Box>
                ))}
              </VerifiedFAQ>
            ))}
          </SimpleGrid>
        </Section>
      )}


    </>
  );
}
