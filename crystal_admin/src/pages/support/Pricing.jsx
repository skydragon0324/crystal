import React from 'react';
import { Text } from '@chakra-ui/react';
import CrudPage from '../../components/CrudPage';
import useOptions from '../../hooks/useOptions';
import { products, servicePrices } from '../../api';
import { useT } from '../../i18n';
import { money } from '../../utils/format';

export const PAGE = '/admin/support/pricing';
export const SMARTPHONE_PAGE = '/admin/support/pricing/smartphone';
export const EPRODUCT_PAGE = '/admin/support/pricing/eproduct';

/**
 * THE PUBLISHED REPAIR PRICE LIST, and only that.
 *
 * It used to carry the ticket side of a repair as well - the shelf item a line
 * consumed, its bench minutes, how many were covered per repair, an internal
 * costing price beside the counter one, and a table of attached documents.
 * All of that is the REPAIR's business rather than the price list's, and
 * `repair_ticket_items` already keeps its own copy of every figure it charged,
 * so an old ticket still shows the price it quoted.
 *
 * What is left is the four things a customer reads:
 *
 *   part_name      which part, as PUBLISHED. A plain string, deliberately not
 *                  a link to the parts catalogue: the price list names things
 *                  the way a customer would recognise them, and the shelf
 *                  names them the way a technician orders them.
 *   part_price     what the part costs
 *   service_price  what the labour costs
 *   approval_no    the reference the figure was approved under
 *
 * Read by the storefront AND by the ticket screen, deliberately: a customer
 * quoted a figure on the website and charged a different one at the counter is
 * the failure this single list avoids.
 */
export default function Pricing({ section }) {
  const t = useT();

  const scope = section || 'SMARTPHONE';
  const isPhones = scope === 'SMARTPHONE';

  /*
   * The product dropdown only offers what this page owns - a smartphone
   * price list should not be able to name a television.
   */
  const { options: allProducts } = useOptions(() => products.options(), []);

  const catalogue = allProducts.filter((row) => (
    isPhones ? row.category_type === 'SMARTPHONE' : row.category_type !== 'SMARTPHONE'
  ));

  return (
    <CrudPage
      page={isPhones ? SMARTPHONE_PAGE : EPRODUCT_PAGE}
      params={{ section: scope }}
      title={t(isPhones ? 'Smartphone pricing' : 'Eproduct pricing')}
      excel={true}
      api={servicePrices}
      defaultSort="sort_order"
      subtitle={t('support.pricing.oneListForTheWebsite')}
      columns={[
        { key: 'product_name', label: 'Product', maxW: '12.5rem' },
        { key: 'part_name', label: 'Part', maxW: '13.75rem' },
        { key: 'part_price', label: 'Part price', isNumeric: true, render: (row) => money(row.part_price) },
        {
          key: 'service_price', label: 'Service price', isNumeric: true,
          render: (row) => money(row.service_price)
        },
        {
          key: 'total', label: 'Total', isNumeric: true, sortable: false,
          render: (row) => (
            <Text fontSize="xs" fontWeight="600" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {money(Number(row.part_price) + Number(row.service_price))}
            </Text>
          )
        },
        {
          key: 'approval_no', label: 'Approval no',
          render: (row) => (
            <Text fontSize="xs" fontFamily="mono">{row.approval_no || '-'}</Text>
          )
        },
        { key: 'sort_order', label: 'Order', isNumeric: true }
      ]}
      fields={[
        {
          name: 'product_id', label: 'Product', type: 'select', required: true,
          options: catalogue.map((row) => ({ value: row.id, label: row.name })),
          span: 2
        },
        {
          name: 'part_name', label: 'Part', required: true, span: 2,
          help: 'As the customer reads it, not as the parts catalogue names it.'
        },
        { name: 'part_price', label: 'Part price', type: 'number', step: '0.01' },
        { name: 'service_price', label: 'Service price', type: 'number', step: '0.01' },
        {
          name: 'approval_no', label: 'Approval number',
          help: 'The reference this published price was approved under.'
        },
        { name: 'sort_order', label: 'Order', type: 'number' }
      ]}
    />
  );
}

/** The two screens, so the router and the permission grid can name each. */
export function SmartphonePricing() {
  return <Pricing section="SMARTPHONE" />;
}

export function EproductPricing() {
  return <Pricing section="EPRODUCT" />;
}
