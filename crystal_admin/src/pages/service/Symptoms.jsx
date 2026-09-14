import React from 'react';
import CrudPage from '../../components/CrudPage';
import StatusBadge from '../../components/StatusBadge';
import useOptions from '../../hooks/useOptions';
import { categories, symptoms } from '../../api';
import { useT } from '../../i18n';

export const PAGE = '/admin/service/symptoms';

const COMPONENTS = ['DISPLAY', 'BATTERY', 'BOARD', 'CAMERA', 'AUDIO',
  'POWER', 'NETWORK', 'SOFTWARE', 'CASING', 'OTHER'];

const SEVERITY = [
  { value: 0, label: 'Cosmetic' },
  { value: 1, label: 'Normal' },
  { value: 2, label: 'Unusable' },
  { value: 3, label: 'Safety' }
];

/**
 * What the customer says is wrong, from a list rather than in their own words.
 *
 * The free text is kept on the ticket too, but a hundred ways of writing
 * "screen flickers" cannot be counted - and the defect watch is entirely a
 * matter of counting.
 */
export default function Symptoms() {
  const t = useT();
  const { options: sections } = useOptions(() => categories.options(), []);

  return (
    <CrudPage
      page={PAGE}
      excel={true}
      api={symptoms}
      defaultSort="sort_order"
      subtitle={t('service.symptoms.theFaultCodesATicket')}
      columns={[
        { key: 'code', label: 'Code' },
        { key: 'name', label: 'Symptom', maxW: '16.25rem' },
        { key: 'component', label: 'Component' },
        {
          key: 'severity', label: 'Severity',
          render: (row) => (
            <StatusBadge
              value={row.severity === 3 ? 'ALERT' : (row.severity === 2 ? 'WATCH' : 'NORMAL')}
              label={t((SEVERITY.find((s) => s.value === row.severity) || {}).label || '-')}
            />
          )
        },
        { key: 'sort_order', label: 'Order', isNumeric: true }
      ]}
      fields={[
        { name: 'code', label: 'Code', required: true },
        { name: 'name', label: 'Symptom', required: true },
        {
          name: 'component', label: 'Component', type: 'select', required: true,
          options: COMPONENTS.map((code) => ({ value: code, label: code }))
        },
        { name: 'severity', label: 'Severity', type: 'select', options: SEVERITY },
        {
          name: 'category_id', label: 'Applies to', type: 'select',
          placeholder: 'every section',
          options: sections.map((row) => ({ value: row.id, label: row.name }))
        },
        { name: 'sort_order', label: 'Order', type: 'number' }
      ]}
    />
  );
}
