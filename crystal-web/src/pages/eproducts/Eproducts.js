import React from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Box, Flex, Heading, SimpleGrid, Text } from '@chakra-ui/react';

import { Breadcrumbs, ErrorState, Loading, Section, SectionHeading } from '@/components/common';
import SectionLanding from '@/pages/common/SectionLanding';
import ProductList from '@/pages/common/ProductList';
import api from '@/api';
import { useApi } from '@/hooks/useApi';
import VerifiedBackground from '@/components/security/VerifiedBackground';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * The Eproducts section.
 *
 * `/eproducts` is an index of the non-smartphone categories, and
 * `/eproducts/:category` is that category's landing page - resolved from the
 * live category tree rather than from a hardcoded list, so a category added
 * in the console gets a working page with no code change (development rule 1).
 */
export default function Eproducts() {
  const t = useT();

  const surface = useSurface();
  const { category: slug } = useParams();
  const categories = useApi(() => api.catalog.categories(), []);

  const eproducts = (categories.data || []).filter((row) => row.type !== 'SMARTPHONE');

  if (categories.loading) {
    return (
      <Section>
        <Loading variant="grid" count={4} height="180px" />
      </Section>
    );
  }

  if (categories.error) {
    return (
      <Section>
        <ErrorState message={categories.error} onRetry={categories.reload} />
      </Section>
    );
  }

  /* ------------------------------------------------ one category's landing */
  if (slug) {
    const category = eproducts.filter((row) => row.slug === slug)[0];

    if (!category) {
      return (
        <Section>
          <ErrorState message={t('eproducts.noSectionMatches', { slug: slug })} />
        </Section>
      );
    }

    return (
      <>
        <SectionLanding
          type={category.type}
          sectionPath={`/eproducts/${category.slug}`}
          title={category.name}
        />
        <ProductList
          categoryType={category.type}
          categorySlug={category.slug}
          sectionPath={`/eproducts/${category.slug}`}
          title={t('eproducts.allOfCategory', { name: category.name })}
        />
      </>
    );
  }

  /* ------------------------------------------------------------- the index */
  return (
    <Section py={{ base: 6, md: 10 }}>
      <Breadcrumbs items={[{ label: 'Eproducts' }]} />

      <SectionHeading
        title={t('common.eproducts')}
        subtitle={t('eproducts.eproducts.televisionsSetTopBoxesComputers')}
      />

      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={{ base: 5, md: 8 }}>
        {eproducts.map((category) => (
          <Flex
            key={category.id}
            as={RouterLink}
            to={`/eproducts/${category.slug}`}
            direction={{ base: 'column', sm: 'row' }}
            borderRadius="16px"
            overflow="hidden"
            border="1px solid"
            borderColor={surface.border}
            transition="transform 180ms ease, box-shadow 180ms ease"
            _hover={{ transform: 'translateY(-4px)', boxShadow: surface.shadowLifted }}
          >
            <VerifiedBackground
              w={{ base: '100%', sm: '42%' }}
              minH={{ base: '160px', sm: '200px' }}
              alignSelf="stretch"
              bg={surface.raised}
              integrity={category.banner_integrity}
              expectedPath={category.banner_image}
              alt={category.name}
            />
            <Box p={{ base: 5, md: 7 }} flex="1">
              <Heading size="md" color={surface.text}>
                {category.name}
              </Heading>
              <Text fontSize="sm" color={surface.muted} mt="2" noOfLines={3}>
                {category.description}
              </Text>
              {category.product_cnt !== undefined && (
                <Text fontSize="sm" color="brand.500" fontWeight="600" mt="4">
                  {category.product_cnt}{' '}
                  {Number(category.product_cnt) === 1 ? 'product' : 'products'} →
                </Text>
              )}
            </Box>
          </Flex>
        ))}
      </SimpleGrid>
    </Section>
  );
}
