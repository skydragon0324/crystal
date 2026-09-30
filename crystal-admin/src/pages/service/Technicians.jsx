import React from 'react';
import { Box, Progress, Text } from '@chakra-ui/react';
import CrudPage from '../../components/CrudPage';
import useOptions from '../../hooks/useOptions';
import { agencies, technicians } from '../../api';
import { useT } from '../../i18n';
import { number } from '../../utils/format';

export const PAGE = '/admin/service/technicians';

const GRADES = [
  { value: 1, label: 'Trainee' },
  { value: 2, label: 'Technician' },
  { value: 3, label: 'Senior' },
  { value: 4, label: 'Master' }
];

/**
 * The bench.
 *
 * Load is shown in bench MINUTES against the minutes each technician has, not
 * in ticket counts: counting tickets weighs a screen replacement and a
 * firmware reflash the same, which is how a rota ends up looking balanced and
 * being nothing of the sort.
 */
export default function Technicians() {
  const t = useT();
  const { options: centres } = useOptions(() => agencies.options(), []);

  return (
    <CrudPage
      page={PAGE}
      api={technicians}
      defaultSort="name"
      subtitle={t('service.technicians.loadIsMeasuredInBench')}
      columns={[
        { key: 'code', label: 'Code' },
        { key: 'name', label: 'Name', maxW: '11.25rem' },
        { key: 'agency_name', label: 'Service centre', maxW: '10.625rem' },
        {
          key: 'grade', label: 'Grade',
          render: (row) => t((GRADES.find((g) => g.value === row.grade) || {}).label || '-')
        },
        { key: 'skills', label: 'Skills', maxW: '13.125rem', sortable: false },
        { key: 'open_cnt', label: 'Open', isNumeric: true },
        {
          key: 'assigned_minutes', label: 'Load', width: '8.125rem',
          render: (row) => <Load minutes={row.assigned_minutes} capacity={row.daily_minutes} />
        },
        {
          key: 'csat', label: 'Satisfaction', isNumeric: true,
          render: (row) => (row.csat === null ? '-' : number(row.csat, 2))
        }
      ]}
      fields={[
        { name: 'code', label: 'Code', required: true },
        { name: 'name', label: 'Name', required: true },
        {
          name: 'agency_id', label: 'Service centre', type: 'select', required: true,
          options: centres.map((centre) => ({ value: centre.id, label: centre.name }))
        },
        { name: 'phone', label: 'Phone' },
        { name: 'grade', label: 'Grade', type: 'select', options: GRADES },
        { name: 'daily_minutes', label: 'Bench minutes a day', type: 'number' },
        { name: 'hired_on', label: 'Started', type: 'date' },
        {
          name: 'status', label: 'Status', type: 'select',
          options: [{ value: 'ACTIVE', label: 'Active' }, { value: 'LEFT', label: 'Left' }]
        }
      ]}
    />
  );
}

/** Assigned bench time against what this technician actually has in a day. */
function Load({ minutes, capacity }) {
  const used = Number(minutes) || 0;
  const total = Number(capacity) || 420;
  const share = Math.min(100, Math.round((used / total) * 100));

  return (
    <Box>
      <Progress
        value={share}
        size="xs"
        borderRadius="full"
        colorScheme={share >= 100 ? 'red' : (share >= 75 ? 'orange' : 'green')}
      />
      <Text fontSize="0.62rem" color="gray.500" mt="2px" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {Math.round(used / 60)}h / {Math.round(total / 60)}h
      </Text>
    </Box>
  );
}
