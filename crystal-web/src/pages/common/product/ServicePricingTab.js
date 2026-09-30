import React, { useEffect, useState } from 'react';
import {
  Box, Flex, Heading, Icon, Input, InputGroup, InputLeftElement, Text
} from '@chakra-ui/react';
import { SearchIcon } from '@chakra-ui/icons';
import { FiInfo } from 'react-icons/fi';
import { DataTable, ErrorState, Section } from '@/components/common';
import api from '@/api';
import { useDebounced, useList } from '@/hooks/useApi';
import { formatPrice, useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * The published repair price list for one product.
 *
 * THIS IS A PUBLISHED DOCUMENT, not a summary. Every line carries the part,
 * what the part costs, what the labour costs, and the reference the figure
 * was approved under - which is why it is served a page at a time rather
 * than as the whole list filtered in the browser.
 *
 * PART AND LABOUR ARE SEPARATE COLUMNS with the total beside them, because
 * that is exactly how a centre quotes the work: a single "price" hides which
 * half a customer could avoid by supplying their own part.
 */
const PAGE_SIZE = 10;

export default function ServicePricingTab({ slug, currency }) {
  const t = useT();

  const surface = useSurface();

  const [term, setTerm] = useState('');
  // Debounced, so typing "screen" is one request rather than six.
  const search = useDebounced(term, 350);

  const pricing = useList(
    (params) => api.catalog.servicePricing(slug, params),
    { initialParams: { page: 1, limit: PAGE_SIZE } }
  );

  /*
   * THE SEARCH RUNS ON THE SERVER, because the list is paged.
   *
   * Filtering the rows already on screen would search ten out of thirty and
   * silently miss the rest, which is the one thing a search box must not do.
   * `setFilter` also returns to page one - staying on page three of a
   * now-single-page result shows an empty table.
   */
  const setFilter = pricing.setFilter;
  useEffect(() => {
    setFilter({ q: search || undefined });
  }, [search, setFilter]);

  const total = pricing.meta ? pricing.meta.total : pricing.rows.length;

  const columns = [
    {
      key: 'part_name',
      label: 'Part or service',
      render: (row) => (
        <Text fontWeight="600" color={surface.text}>
          {row.part_name}
        </Text>
      )
    },
    {
      key: 'part_price',
      label: 'Part price',
      align: 'right',
      render: (row) => (Number(row.part_price) ? formatPrice(row.part_price) : '—')
    },
    {
      key: 'service_price',
      label: 'Service price',
      align: 'right',
      render: (row) => (Number(row.service_price) ? formatPrice(row.service_price) : '—')
    },
    {
      key: 'total',
      label: 'Total',
      align: 'right',
      render: (row) => (
        <Text fontWeight="700" color="brand.500">
          {formatPrice(Number(row.part_price || 0) + Number(row.service_price || 0))}
        </Text>
      )
    },
    {
      key: 'approval_no',
      label: 'Approval number',
      // A string, deliberately, and never arithmetic: the format differs by
      // market, so it is shown exactly as it was approved.
      render: (row) => (row.approval_no
        ? (
          <Text fontSize="sm" color={surface.strong} whiteSpace="nowrap">
            {row.approval_no}
          </Text>
        )
        : <Text color={surface.muted}>—</Text>)
    }
  ];

  return (
    <Section py={{ base: 8, md: 12 }}>
      <Flex
        align={{ base: 'flex-start', md: 'flex-end' }}
        justify="space-between"
        direction={{ base: 'column', md: 'row' }}
        gap="4" data-gap="16" data-gap-row-from="md"
        mb="6"
      >
        <Box>
          <Heading size="lg" color={surface.text}>
            {t('common.product.servicepricingtab.servicePricing')}
          </Heading>
          <Text color={surface.muted} fontSize="sm" mt="1">
            {/*
              THREE ENGLISH FRAGMENTS, one of which was a plural rule.

              This read `{total} {total === 1 ? 'line' : 'lines'}` followed by
              ` matching “x”` or ` published` - none of it translated, and the
              singular/plural switch is English grammar hard-coded into the
              layout. Chinese has no plural form and Russian has three, so the
              only shape that works in all of them is a whole sentence per
              case with the number dropped in.
            */}
            {search
              ? t('common.product.servicepricingtab.linesMatching', { count: total, search: search })
              : t('common.product.servicepricingtab.linesPublished', { count: total })}
            {t('common.product.servicepricingtab.outOfWarrantyRepairsAre')}
          </Text>
        </Box>

        <InputGroup maxW={{ base: '100%', md: '300px' }}>
          <InputLeftElement pointerEvents="none" h="40px">
            <SearchIcon color={surface.muted} boxSize="3.5" />
          </InputLeftElement>
          <Input
            placeholder={t('common.product.servicepricingtab.searchAPartOrApproval')}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
          />
        </InputGroup>
      </Flex>

      {pricing.error ? (
        <ErrorState message={pricing.error} onRetry={pricing.reload} />
      ) : (
        <DataTable
          columns={columns}
          rows={pricing.rows}
          loading={pricing.loading}
          meta={pricing.meta}
          onPage={pricing.setPage}
          emptyTitle={search
            ? t('common.product.nothingMatches', { search: search })
            : t('common.product.noRepairPricesYet')}
          emptyHint={search
            ? t('common.product.tryAShorterSearch')
            : t('common.product.pricesAppearOncePublished')}
        />
      )}

      <Flex
        gap="3" data-gap="12"
        mt="8"
        p="4"
        borderRadius="12px"
        bg={surface.raised}
        align="flex-start"
      >
        <Icon as={FiInfo} color="brand.500" boxSize="5" mt="0.5" flexShrink={0} />
        <Text fontSize="sm" color={surface.muted}>
          {t('common.product.servicepricingtab.pricesAreInAndCover', { currency: currency })}
        </Text>
      </Flex>
    </Section>
  );
}
