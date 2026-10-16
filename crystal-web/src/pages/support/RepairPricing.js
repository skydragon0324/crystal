import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Flex, Heading, Icon, Text } from '@chakra-ui/react';
import { FiInfo } from 'react-icons/fi';

import {
  Breadcrumbs,
  DataTable,
  EmptyState,
  ErrorState,
  Loading,
  Section,
  SelectField
} from '@/components/common';
import api from '@/api';
import { useHistory, useLocation } from 'react-router-dom';
import { useApi } from '@/hooks/useApi';
import { formatPrice, useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * Repair pricing, entered from Support rather than from a product page.
 *
 * A customer arriving here knows their device, not its URL, so the page leads
 * with a product picker and then shows that product's price list - the same
 * endpoint the product page's tab reads, which answers one model's whole list
 * in a single reply.
 */
export default function RepairPricing() {
  const t = useT();

  const surface = useSurface();
  const history = useHistory();

  /*
   * SCOPED TO A SECTION when one is asked for.
   *
   * Smartphone and eproduct price lists are published by different people
   * and read by different customers, so the section pages link here with
   * their own. Without it the picker offers a television to somebody who
   * arrived from the smartphone page.
   */
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  const section = String(search.get('section') || '').toUpperCase();

  /*
   * THE CHOSEN PRODUCT IS IN THE ADDRESS, like the section beside it.
   *
   * It was local state, so this page could not be linked to at a product: a
   * customer asking support about a price had no address to send, and a
   * refresh went back to "pick a product". The product page's own pricing tab
   * has always been linkable; this is the same list and should be too.
   *
   * `replace`, not `push`: trying three models is choosing one thing three
   * times, not three pages to walk back through.
   */
  const [slug, setSlug] = useState(search.get('product') || null);

  const choose = (next) => {
    setSlug(next || null);

    const params = new URLSearchParams(location.search);
    if (next) params.set('product', next);
    else params.delete('product');

    const query = params.toString();
    history.replace({ pathname: location.pathname, search: query ? '?' + query : '' });
  };
  const isPhones = section === 'SMARTPHONE';
  const scoped = !!section;

  // The catalogue answers { rows, total, ... }; the picker wants the rows.
  const products = useApi(
    () => api.catalog.products(scoped && isPhones ? { type: 'SMARTPHONE', limit: 60 } : { limit: 60 }),
    [scoped, isPhones]
  );

  const catalogue = ((products.data && products.data.rows) || []).filter((row) => (
    !scoped || (isPhones ? row.category_type === 'SMARTPHONE' : row.category_type !== 'SMARTPHONE')
  ));

  const pricing = useApi(
    () => (slug
      /*
       * 50 is the endpoint's own ceiling, not a guess: it clamps `limit` to
       * 50 (controllers/storefront.controller.js), so asking for 200 got 50
       * and claimed to have asked for everything. A product with more price
       * lines than that is read on its own page, which pages properly.
       */
      ? api.catalog.servicePricing(slug, { limit: 50 })
      : Promise.resolve({ data: [] })),
    [slug]
  );

  const options = catalogue.map((product) => ({
    value: product.slug,
    label: product.name,
    hint: product.category_name
  }));

  const selected = catalogue.filter((product) => product.slug === slug)[0];

  /** Part plus labour. The API sends the two halves, not the sum. */
  const totalOf = (row) => Number(row.part_price || 0) + Number(row.service_price || 0);

  /*
   * THE COLUMNS THE ENDPOINT ACTUALLY ANSWERS - the same five the product
   * page's own tab draws (pages/common/product/ServicePricingTab.js), because
   * it is the same list from the same endpoint and a customer who checked a
   * price here and again there must not see two different tables.
   *
   * They were `name`, `limit_quantity` and a per-row `currency`, and a price
   * line has none of those: it has `part_name`, `part_price`, `service_price`
   * and `approval_no`. So the first column was blank, the last read
   * "undefined per repair", and the money was formatted against an undefined
   * currency.
   */
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
      label: 'Part',
      align: 'right',
      render: (row) => (Number(row.part_price) ? formatPrice(row.part_price) : '—')
    },
    {
      key: 'service_price',
      label: 'Labour',
      align: 'right',
      render: (row) => (Number(row.service_price) ? formatPrice(row.service_price) : '—')
    },
    {
      key: 'total',
      label: 'Total',
      align: 'right',
      render: (row) => (
        <Text fontWeight="700" color="brand.500">
          {formatPrice(totalOf(row))}
        </Text>
      )
    },
    {
      key: 'approval_no',
      // A string, never arithmetic: the format differs by market, so it is
      // shown exactly as it was approved.
      label: 'Approval number',
      render: (row) => (row.approval_no
        ? <Text fontSize="sm" color={surface.strong} whiteSpace="nowrap">{row.approval_no}</Text>
        : <Text color={surface.muted}>—</Text>)
    }
  ];

  return (
    <Section py={{ base: 6, md: 10 }}>
      <Breadcrumbs items={[{ label: 'Support' }, { label: 'Repair pricing' }]} />

      <Heading size="lg" color={surface.text} letterSpacing="-0.02em">
        {t('support.repairpricing.repairPricing')}
      </Heading>
      <Text color={surface.muted} mt="1" mb="8">
        {t('support.repairpricing.partAndLabourPricesAre')}
      </Text>

      <Box maxW="420px" mb="8">
        {products.loading ? (
          <Loading variant="list" count={1} height="40px" />
        ) : (
          <SelectField
            label={t('support.repairpricing.chooseYourProduct')}
            value={slug}
            onChange={choose}
            options={options}
            placeholder={t('support.repairpricing.searchForYourModel')}
          />
        )}
      </Box>

      {!slug && (
        <EmptyState
          title={t('support.repairpricing.pickAProductToSee')}
          hint={t('support.repairpricing.everyModelHasItsOwn')}
        />
      )}

      {slug && (
        <>
          {selected && (
            <Flex align="baseline" justify="space-between" gap="4" data-gap="16" data-gap-wrap mb="4" wrap="wrap">
              <Heading size="md" color={surface.text}>
                {selected.name}
              </Heading>
              <Button
                as={RouterLink}
                to={`/smartphones/products/${selected.slug}`}
                size="sm"
                variant="ghost"
                color="brand.500"
              >
                {t('support.repairpricing.viewProduct')}
              </Button>
            </Flex>
          )}

          {pricing.error ? (
            <ErrorState message={pricing.error} onRetry={pricing.reload} />
          ) : (
            <DataTable
              columns={columns}
              /*
               * THE ROWS, OUT OF THE PAGED REPLY.
               *
               * This endpoint answers `{ rows, total, page, limit }` - it
               * takes a page and a limit - and this passed the whole object
               * where the table wanted the array. DataTable maps over what it
               * is given, so choosing a product threw `rows.map is not a
               * function` and took the page down with it, which is the error
               * reported from this screen.
               */
              rows={(pricing.data && pricing.data.rows) || []}
              loading={pricing.loading}
              emptyTitle={t('support.repairpricing.noRepairPricesPublishedFor')}
              emptyHint={t('support.repairpricing.askAnyServiceCentreFor')}
            />
          )}
        </>
      )}

      <Flex gap="3" data-gap="12" mt="10" p="5" borderRadius="12px" bg={surface.raised} align="flex-start">
        <Icon as={FiInfo} color="brand.500" boxSize="5" mt="0.5" flexShrink={0} />
        <Box>
          <Text fontWeight="600" color={surface.text}>
            {t('support.repairpricing.repairsUnderWarrantyAreFree')}
          </Text>
          <Text fontSize="sm" color={surface.muted} mt="1">
            {t('support.repairpricing.thesePricesApplyToOut')}
          </Text>
        </Box>
      </Flex>
    </Section>
  );
}
