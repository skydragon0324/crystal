import React from 'react';
import { HStack } from '@chakra-ui/react';
import CrudPage from '../../components/CrudPage';
import StatusBadge from '../../components/StatusBadge';
import useOptions from '../../hooks/useOptions';
import { categories, policies, series } from '../../api';
import { useT } from '../../i18n';
import { money, number } from '../../utils/format';

export const PAGE = '/admin/service/policies';

const KINDS = [
  { value: 'STANDARD', label: 'Standard' },
  { value: 'EXTENDED', label: 'Extension' },
  { value: 'CARE_PLUS', label: 'Care+' }
];

/**
 * The cover Crystal offers.
 *
 * A policy is the OFFER; a warranty is one device's copy of it, taken at the
 * moment it was sold.  That is why editing a policy here does not change what
 * anybody already holds - and why the most specific policy wins when a
 * registration issues one: a rule pinned to the C9 series beats one pinned to
 * Smartphone, because somebody wrote the narrower rule on purpose.
 */
export default function Policies() {
  const t = useT();
  const { options: sections } = useOptions(() => categories.options(), []);
  const { options: lines } = useOptions(() => series.list({ limit: 100 }), []);

  return (
    <CrudPage
      page={PAGE}
      excel={true}
      api={policies}
      defaultSort="sort_order"
      subtitle={t('service.policies.editingAPolicyNeverChanges')}
      columns={[
        { key: 'code', label: 'Code' },
        { key: 'name', label: 'Policy', maxW: '15rem' },
        {
          key: 'kind', label: 'Kind',
          render: (row) => t((KINDS.find((k) => k.value === row.kind) || {}).label || row.kind)
        },
        { key: 'months', label: 'Months', isNumeric: true },
        {
          key: 'covers_parts', label: 'Covers', sortable: false,
          render: (row) => (
            <HStack spacing={1}>
              {row.covers_parts && <StatusBadge value="OK" label={t('service.policies.parts')} />}
              {row.covers_labour && <StatusBadge value="OK" label={t('service.policies.labour')} />}
              {row.covers_accidental && <StatusBadge value="WATCH" label={t('service.policies.accidental')} />}
            </HStack>
          )
        },
        {
          key: 'claim_limit', label: 'Claim limit', isNumeric: true,
          render: (row) => (row.claim_limit ? number(row.claim_limit) : t('service.policies.unlimited'))
        },
        { key: 'price', label: 'Price', isNumeric: true, render: (row) => money(row.price, row.currency) },
        { key: 'points_price', label: 'Or points', isNumeric: true, render: (row) => number(row.points_price) },
        {
          key: 'is_default', label: 'On registration',
          render: (row) => (row.is_default ? <StatusBadge value="OK" label={t('common.yes')} /> : '-')
        }
      ]}
      fields={[
        { name: 'code', label: 'Code', required: true },
        { name: 'name', label: 'Policy', required: true },
        { name: 'kind', label: 'Kind', type: 'select', required: true, options: KINDS },
        { name: 'months', label: 'Months of cover', type: 'number', required: true },
        {
          name: 'category_id', label: 'Section', type: 'select',
          options: sections.map((row) => ({ value: row.id, label: row.name }))
        },
        {
          name: 'series_id', label: 'Series (beats the section)', type: 'select',
          options: lines.map((row) => ({ value: row.id, label: row.name }))
        },
        { name: 'price', label: 'Price', type: 'number', step: '0.01' },
        { name: 'points_price', label: 'Price in points', type: 'number' },
        { name: 'claim_limit', label: 'Claim limit (0 = unlimited)', type: 'number' },
        { name: 'sort_order', label: 'Order', type: 'number' },
        { name: 'covers_parts', label: 'Covers parts', type: 'checkbox' },
        { name: 'covers_labour', label: 'Covers labour', type: 'checkbox' },
        { name: 'covers_accidental', label: 'Covers accidental damage', type: 'checkbox' },
        { name: 'is_default', label: 'Issue this on registration', type: 'checkbox' }
      ]}
    />
  );
}
