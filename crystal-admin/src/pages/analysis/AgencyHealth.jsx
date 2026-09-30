import React from 'react';
import { Box, Grid, HStack, Progress, Text, useColorModeValue } from '@chakra-ui/react';

import Card from '../../components/Card';
import DataTable from '../../components/DataTable';
import Pagination from '../../components/Pagination';
import Toolbar from '../../components/Toolbar';
import StatTile from '../../components/StatTile';
import StatusBadge from '../../components/StatusBadge';

import useList from '../../hooks/useList';
import useOptions from '../../hooks/useOptions';
import { agencies, analysis } from '../../api';
import { useT } from '../../i18n';
import { money, number, percent } from '../../utils/format';

export const PAGE = '/admin/analysis/agency-health';

/**
 * Which service centre to open first.
 *
 * The console could already list every centre; what it could not do is say
 * which of the twelve needs attention, and that is the only question the
 * person looking at this list actually has.  The score is computed in the
 * database - see v_agency_health - so this screen and an export and somebody
 * checking by hand in psql all get the same number.
 *
 * The tiles count the whole estate rather than the filtered page, because
 * they are what somebody CLICKS to apply a filter: counting only what is
 * already filtered would make every tile read zero the moment one was used.
 */
export default function AgencyHealth() {
  const t = useT();
  const { options: provinces } = useOptions(() => agencies.provinces(), []);

  const list = useList(
    (params) => analysis.agencyHealth(params),
    { page: 1, limit: 50, sort: 'risk_score', dir: 'desc' }
  );

  const summary = list.summary || {};

  const columns = [
    {
      key: 'agency_name', label: 'Service centre', maxW: '13.125rem',
      render: (row) => (
        <Box>
          <Text fontSize="xs" fontWeight="600" noOfLines={1}>{row.agency_name}</Text>
          <Text fontSize="0.65rem" color="gray.500">{row.city}, {row.province}</Text>
        </Box>
      )
    },
    {
      key: 'risk_score', label: 'Risk score', width: '9.375rem',
      render: (row) => <RiskBar score={row.risk_score} level={row.risk_level} />
    },
    {
      key: 'health_status', label: 'Why',
      render: (row) => <StatusBadge value={row.health_status} label={t(labelFor(row.health_status))} />
    },
    {
      key: 'open_cnt', label: 'Open', isNumeric: true,
      render: (row) => (
        <HStack justify="flex-end" spacing={1}>
          <Text fontSize="xs" style={{ fontVariantNumeric: 'tabular-nums' }}>{row.open_cnt}</Text>
          {row.overdue_cnt > 0 && (
            <Text fontSize="xs" color="red.400">(+{row.overdue_cnt})</Text>
          )}
        </HStack>
      )
    },
    {
      key: 'avg_turnaround_days', label: 'Turnaround', isNumeric: true,
      render: (row) => number(row.avg_turnaround_days, 1) + 'd'
    },
    {
      key: 'sla_breach_ratio', label: 'SLA breach', isNumeric: true,
      render: (row) => <Ratio value={row.sla_breach_ratio} warnAbove={0.25} />
    },
    {
      key: 'repeat_ratio', label: 'Repeat rate', isNumeric: true,
      render: (row) => <Ratio value={row.repeat_ratio} warnAbove={0.12} />
    },
    {
      key: 'csat', label: 'Satisfaction', isNumeric: true,
      render: (row) => (
        <Text fontSize="xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {/* Fewer than five answers is not a verdict, and the score does not
              count it either - so it is not shown as one. */}
          {row.rating_cnt >= 5 ? number(row.csat, 2) : '-'}
        </Text>
      )
    },
    {
      key: 'out_of_stock_cnt', label: 'Short of parts', isNumeric: true,
      render: (row) => (
        <Text fontSize="xs" color={row.out_of_stock_cnt > 0 ? 'red.400' : undefined}>
          {row.out_of_stock_cnt} / {row.low_stock_cnt}
        </Text>
      )
    },
    {
      key: 'covered_90d', label: 'Covered 90d', isNumeric: true,
      render: (row) => money(row.covered_90d)
    }
  ];

  return (
    <Box>
      <Grid templateColumns={{ base: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', xl: 'repeat(6, 1fr)' }} gap={4} mb={5}>
        <StatTile label="Service centres" value={summary.total} />
        <StatTile
          label="High risk" value={summary.high_risk}
          tone={summary.high_risk > 0 ? 'critical' : 'good'}
          onClick={() => list.setFilter({ risk: 'HIGH' })}
        />
        <StatTile
          label="Missing promises" value={summary.overdue} tone={summary.overdue > 0 ? 'serious' : undefined}
          onClick={() => list.setFilter({ health_status: 'OVERDUE' })}
        />
        <StatTile
          label="Short of parts" value={summary.parts_bound}
          onClick={() => list.setFilter({ health_status: 'PARTS_BOUND' })}
        />
        <StatTile label="Open repairs" value={summary.open_tickets} hint={t('analysis.agencyhealth.overdue', { n: summary.overdue_tickets })} />
        <StatTile
          label="Average turnaround"
          value={summary.avg_turnaround_days === null ? '-' : number(summary.avg_turnaround_days, 1) + 'd'}
          hint={summary.csat === null ? undefined : t('analysis.agencyhealth.satisfaction', { n: number(summary.csat, 2) })}
        />
      </Grid>

      <Card bodyProps={false}>
        <Toolbar
          search={list.params.q}
          onSearch={(value) => list.setFilter({ q: value })}
          filters={[
            {
              key: 'risk', label: 'Risk', value: list.params.risk,
              options: [
                { value: 'HIGH', label: 'High' },
                { value: 'MEDIUM', label: 'Medium' },
                { value: 'LOW', label: 'Low' }
              ],
              onChange: (value) => list.setFilter({ risk: value })
            },
            {
              key: 'province', label: 'Province', value: list.params.province, width: '10.625rem',
              options: provinces.map((row) => ({ value: row.province, label: row.province })),
              onChange: (value) => list.setFilter({ province: value })
            },
            {
              key: 'health_status', label: 'Why', value: list.params.health_status, width: '10.625rem',
              options: [
                { value: 'OVERDUE', label: 'Missing promises' },
                { value: 'PARTS_BOUND', label: 'Waiting on parts' },
                { value: 'OVER_CAPACITY', label: 'Over capacity' },
                { value: 'QUALITY', label: 'Repeat repairs' },
                { value: 'UNSTAFFED', label: 'No technicians' },
                { value: 'CLEAR', label: 'Nothing open' }
              ],
              onChange: (value) => list.setFilter({ health_status: value })
            }
          ]}
        />

        <DataTable
          columns={columns}
          storageKey={PAGE}
          rows={list.rows}
          loading={list.loading}
          sort={list.params.sort}
          dir={list.params.dir}
          onSort={list.setSort}
        />

        <Pagination
          page={list.params.page} limit={list.params.limit} total={list.total}
          onPage={list.setPage} onLimit={(limit) => list.setFilter({ limit })}
        />
      </Card>
    </Box>
  );
}

/**
 * The score as a bar as well as a number.
 *
 * The bar is what makes the list scannable - a column of two-digit numbers
 * all looks the same at a glance - and the number is what makes it precise.
 * Colour follows the risk band, which is a status scale rather than a
 * categorical one, so it is allowed to mean what its colour says.
 */
function RiskBar({ score, level }) {
  const track = useColorModeValue('gray.100', 'whiteAlpha.200');
  const scheme = level === 'HIGH' ? 'red' : (level === 'MEDIUM' ? 'orange' : 'green');

  return (
    <HStack spacing={2}>
      <Text
        fontSize="xs"
        fontWeight="700"
        w="1.625rem"
        textAlign="right"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {score}
      </Text>
      <Progress
        value={score}
        max={100}
        size="xs"
        borderRadius="full"
        colorScheme={scheme}
        bg={track}
        flex="1"
        minW="3.75rem"
      />
    </HStack>
  );
}

/** A ratio, red once it is past the point somebody should look at it. */
function Ratio({ value, warnAbove }) {
  const bad = useColorModeValue('red.500', 'red.300');
  const over = Number(value) >= warnAbove;

  return (
    <Text
      fontSize="xs"
      color={over ? bad : undefined}
      fontWeight={over ? 600 : 400}
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {percent(value)}
    </Text>
  );
}

/** The health status, in words rather than in the enum's spelling. */
function labelFor(status) {
  switch (status) {
    case 'OVERDUE': return 'Missing promises';
    case 'PARTS_BOUND': return 'Waiting on parts';
    case 'OVER_CAPACITY': return 'Over capacity';
    case 'QUALITY': return 'Repeat repairs';
    case 'UNSTAFFED': return 'No technicians';
    case 'CLEAR': return 'Nothing open';
    case 'CLOSED': return 'Closed';
    default: return 'Normal';
  }
}
