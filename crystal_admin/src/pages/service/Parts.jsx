import React from 'react';
import { Text } from '@chakra-ui/react';
import CrudPage from '../../components/CrudPage';
import { parts } from '../../api';
import { useT } from '../../i18n';
import { money, number } from '../../utils/format';

export const PAGE = '/admin/service/parts';

const COMPONENTS = ['DISPLAY', 'BATTERY', 'BOARD', 'CAMERA', 'AUDIO',
  'POWER', 'NETWORK', 'SOFTWARE', 'CASING', 'OTHER'];

/**
 * The parts catalogue: what could be on a shelf.
 *
 * What actually IS on one is the stock screen - this is the list of things
 * that exist, their cost, and how long they take to arrive.
 */
export default function Parts() {
  const t = useT();

  return (
    <CrudPage
      page={PAGE}
      excel={true}
      api={parts}
      defaultSort="part_no"
      subtitle={t('service.parts.leadTimeMattersAReorder')}
      columns={[
        {
          key: 'part_no', label: 'Part number',
          render: (row) => <Text fontFamily="mono" fontSize="xs" fontWeight="600">{row.part_no}</Text>
        },
        { key: 'name', label: 'Name', maxW: '17.5rem' },
        { key: 'component', label: 'Component' },
        { key: 'unit_cost', label: 'Unit cost', isNumeric: true, render: (row) => money(row.unit_cost, row.currency) },
        { key: 'warranty_months', label: 'Part warranty', isNumeric: true, render: (row) => row.warranty_months + 'm' },
        { key: 'lead_days', label: 'Lead time', isNumeric: true, render: (row) => row.lead_days + 'd' },
        { key: 'total_on_hand', label: 'In stock', isNumeric: true, render: (row) => number(row.total_on_hand) },
        { key: 'product_cnt', label: 'Fits', isNumeric: true }
      ]}
      fields={[
        { name: 'part_no', label: 'Part number', required: true },
        { name: 'name', label: 'Name', required: true },
        {
          name: 'component', label: 'Component', type: 'select', required: true,
          options: COMPONENTS.map((code) => ({ value: code, label: code }))
        },
        { name: 'unit_cost', label: 'Unit cost', type: 'number', step: '0.01' },
        { name: 'warranty_months', label: 'Warranty on the part (months)', type: 'number' },
        { name: 'lead_days', label: 'Lead time (days)', type: 'number' },
        {
          name: 'status', label: 'Status', type: 'select',
          options: [{ value: 'ACTIVE', label: 'Active' }, { value: 'RETIRED', label: 'Retired' }]
        }
      ]}
    />
  );
}
