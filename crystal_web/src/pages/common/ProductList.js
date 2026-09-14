import React, { useEffect, useState } from 'react';
import { Link as RouterLink, useHistory, useLocation } from 'react-router-dom';
import { Box, Button, Flex, Heading, Icon, SimpleGrid, Text } from '@chakra-ui/react';
import { FiRepeat } from 'react-icons/fi';
import { useSelector } from 'react-redux';

import {
  Breadcrumbs,
  EmptyState,
  ErrorState,
  Loading,
  Pagination,
  Section,
  SelectField
} from '@/components/common';
import ProductCard from '@/components/product/ProductCard';
import api from '@/api';
import { selectCompareItems } from '@/app/compareSlice';
import { useApi, useList } from '@/hooks/useApi';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/*
 * The values are the API's own sort tokens, not column names.
 *
 * The catalogue endpoint sorts off a whitelist rather than off whatever the
 * query string names, so a select that offered `price:asc` would be offering
 * a sort the server has no word for - and would silently fall back to the
 * recommended order instead.
 */
const SORT_OPTIONS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'newest', label: 'Newest first' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'name', label: 'Name A-Z' },
  { value: 'rating', label: 'Best rated' }
];

/**
 * The catalogue grid, shared by every section.
 *
 * Filters live in the QUERY STRING rather than in component state, so a
 * filtered view can be linked, bookmarked and shared - which is the whole
 * point of a catalogue URL. The header's search box lands here by writing
 * `?q=`.
 */
export default function ProductList({ categoryType, sectionPath, title, categorySlug }) {
  const t = useT();

  const surface = useSurface();
  const history = useHistory();
  const location = useLocation();

  const query = new URLSearchParams(location.search);
  const initialSeries = query.get('series') || null;
  const initialQ = query.get('q') || '';
  const initialFeatured = query.get('featured') === 'true';

  const [series, setSeries] = useState(initialSeries);
  const [sort, setSort] = useState('recommended');

  // Only read to put a count on the compare button below; the tray owns it.
  const compareItems = useSelector(selectCompareItems);

  const seriesList = useApi(
    () => api.catalog.series(categorySlug || categoryType),
    [categorySlug, categoryType]
  );

  const list = useList(
    (params) => api.catalog.products(params),
    {
      /*
       * The section is named by SLUG when the caller has one and by type
       * otherwise, which is the same choice the API offers - and the filters
       * are the API's own parameter names, so what is on screen and what is
       * in the URL are the same words.
       */
      initialParams: {
        page: 1,
        limit: 12,
        type: categorySlug ? undefined : categoryType,
        category: categorySlug || undefined,
        series: initialSeries || undefined,
        q: initialQ || undefined,
        featured: initialFeatured ? 'true' : undefined
      }
    }
  );

  // Keep the URL in step with the filters, so back/forward and a copied link
  // both reproduce what is on screen.
  useEffect(() => {
    const next = new URLSearchParams();
    if (series) next.set('series', series);
    if (list.params.q) next.set('q', list.params.q);
    if (list.params.featured) next.set('featured', 'true');
    const search = next.toString();
    history.replace({ pathname: location.pathname, search: search ? `?${search}` : '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, list.params.q, list.params.featured]);

  const onSeries = (value) => {
    setSeries(value);
    list.setFilter({ series: value || undefined });
  };

  const onSort = (value) => {
    setSort(value);
    list.setFilter({ sort: value });
  };

  const seriesOptions = (seriesList.data || []).map((item) => ({
    value: item.slug,
    label: item.name,
    hint: item.product_cnt === undefined ? undefined : String(item.product_cnt)
  }));

  return (
    <Section py={{ base: 6, md: 10 }}>
      <Breadcrumbs
        items={[{ label: title, to: sectionPath }, { label: 'All products' }]}
      />

      <Flex
        align={{ base: 'flex-start', md: 'flex-end' }}
        justify="space-between"
        direction={{ base: 'column', md: 'row' }}
        gap="4" data-gap="16" data-gap-row-from="md"
        mb="8"
      >
        <Box>
          <Heading size="lg" color={surface.text} letterSpacing="-0.02em">
            {title}
          </Heading>
          {list.meta && (
            <Text color={surface.muted} fontSize="sm" mt="1">
              {list.meta.total} {list.meta.total === 1 ? 'product' : 'products'}
              {list.params.q ? ` matching “${list.params.q}”` : ''}
            </Text>
          )}
        </Box>

        <Flex gap="3" data-gap="12" w={{ base: '100%', md: 'auto' }} align="center">
          {/*
            THE WAY IN TO COMPARING, on the page that has things to compare.

            It used to be an icon in the site header, which offered it on the
            Eproducts index, the blog and the about page - none of which can
            compare anything, and all of which it navigated a visitor away
            from. Comparing is a smartphone feature: the matrix is pivoted
            from the smartphone specification groups and the tray only ever
            holds handsets. So the entry point sits beside the handsets, next
            to the checkbox on every card that fills it.
          */}
          {categoryType === 'SMARTPHONE' && (
            <Button
              as={RouterLink}
              to="/smartphones/compare"
              size="sm"
              variant={compareItems.length ? 'brand' : 'quiet'}
              leftIcon={<Icon as={FiRepeat} />}
              flexShrink={0}
            >
              {compareItems.length
                ? t('common.productlist.compare', { count: compareItems.length })
                : t('common.compare')}
            </Button>
          )}

          {seriesOptions.length > 0 && (
            <Box minW={{ base: '50%', md: '190px' }}>
              <SelectField
                size="sm"
                value={series}
                onChange={onSeries}
                options={seriesOptions}
                allowEmpty
                emptyLabel={t('common.productlist.allSeries')}
                isSearchable={seriesOptions.length > 8}
              />
            </Box>
          )}
          <Box minW={{ base: '50%', md: '200px' }}>
            <SelectField
              size="sm"
              value={sort}
              onChange={onSort}
              options={SORT_OPTIONS}
              isSearchable={false}
            />
          </Box>
        </Flex>
      </Flex>

      {list.loading && <Loading variant="grid" count={8} />}

      {!list.loading && list.error && <ErrorState message={list.error} onRetry={list.reload} />}

      {!list.loading && !list.error && list.rows.length === 0 && (
        <EmptyState
          title={t('common.productlist.nothingMatchesThoseFilters')}
          hint={t('common.productlist.tryClearingTheSeriesFilter')}
        />
      )}

      {!list.loading && !list.error && list.rows.length > 0 && (
        <>
          <SimpleGrid columns={{ base: 2, md: 3, lg: 4 }} spacing={{ base: 4, md: 6 }}>
            {list.rows.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                sectionPath={sectionPath}
                showCompare={categoryType === 'SMARTPHONE'}
              />
            ))}
          </SimpleGrid>
          <Pagination meta={list.meta} onPage={list.setPage} />
        </>
      )}
    </Section>
  );
}
