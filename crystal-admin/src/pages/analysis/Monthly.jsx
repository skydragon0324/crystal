import React, { useEffect, useState } from 'react';
import {
  Box, Center, Grid, Spinner, Text, useColorMode
} from '@chakra-ui/react';
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';

import Card from '../../components/Card';
import DataTable from '../../components/DataTable';
import { analysis } from '../../api';
import { useT } from '../../i18n';
import { vizPalette, vizTooltip } from '../../theme/viz';
import { money, number, percent } from '../../utils/format';

export const PAGE = '/admin/analysis/monthly';

/**
 * The month, by service centre and across the estate.
 *
 * Two charts rather than one with two scales.  Tickets and money are
 * different units, and putting them on one plot with a second y-axis would
 * let the two series cross wherever the axes happened to put them and mean
 * nothing - so counts are one chart and currency is another.
 */
export default function Monthly() {
  const t = useT();
  const { colorMode } = useColorMode();
  const viz = vizPalette(colorMode);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    analysis.monthly({})
      .then(({ data: body }) => { if (!cancelled) setData(body); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <Center py={20}><Spinner size="lg" thickness="3px" color="brand.500" /></Center>;
  if (!data) return <Card><Text fontSize="sm">{t('table.emptyBrief')}</Text></Card>;

  const totals = data.totals.map((row) => ({
    ...row,
    label: String(row.period_month).slice(0, 7)
  }));

  const columns = [
    { key: 'period_month', label: 'Month', render: (row) => String(row.period_month).slice(0, 7) },
    { key: 'agency_name', label: 'Service centre', maxW: '12.5rem' },
    { key: 'ticket_cnt', label: 'Repairs', isNumeric: true },
    { key: 'closed_cnt', label: 'Closed', isNumeric: true },
    { key: 'warranty_cnt', label: 'Under warranty', isNumeric: true },
    { key: 'repeat_cnt', label: 'Repeats', isNumeric: true },
    {
      key: 'breach_cnt', label: 'Late', isNumeric: true,
      render: (row) => (
        <Text fontSize="xs" color={row.breach_cnt > 0 ? 'red.400' : undefined}
          style={{ fontVariantNumeric: 'tabular-nums' }}>
          {row.breach_cnt}
          {row.closed_cnt > 0 && (
            <Text as="span" color="gray.500"> ({percent(row.breach_cnt / row.closed_cnt)})</Text>
          )}
        </Text>
      )
    },
    {
      key: 'avg_turnaround_days', label: 'Turnaround', isNumeric: true,
      render: (row) => number(row.avg_turnaround_days, 1) + 'd'
    },
    { key: 'charged_amount', label: 'Charged', isNumeric: true, render: (row) => money(row.charged_amount) },
    { key: 'covered_amount', label: 'Covered', isNumeric: true, render: (row) => money(row.covered_amount) },
    {
      key: 'csat', label: 'Satisfaction', isNumeric: true,
      render: (row) => (row.csat === null ? '-' : number(row.csat, 2))
    }
  ];

  return (
    <Box>
      <Grid templateColumns={{ base: '1fr', xl: '1fr 1fr' }} gap={5} mb={5}>
        <MonthChart
          title={t('analysis.monthly.repairsAMonth')}
          rows={totals}
          viz={viz}
          series={[
            { key: 'ticket_cnt', name: t('common.takenIn'), colour: viz.series1 },
            { key: 'closed_cnt', name: t('common.closed'), colour: viz.series2 }
          ]}
        />
        <MonthChart
          title={t('analysis.monthly.whoPaidAMonth')}
          rows={totals}
          viz={viz}
          currency
          series={[
            { key: 'charged_amount', name: t('analysis.monthly.customers'), colour: viz.series1 },
            { key: 'covered_amount', name: t('analysis.monthly.warranty'), colour: viz.series2 }
          ]}
        />
      </Grid>

      <Card title={t('analysis.monthly.byServiceCentre')} bodyProps={false}>
        <DataTable columns={columns} rows={data.rows} />
      </Card>
    </Box>
  );
}

/**
 * Two series a month, side by side.
 *
 * Grouped rather than stacked: the question is how the two compare, and a
 * stack answers a different one (what they add up to).  A 2px surface gap
 * separates adjacent bars instead of a border drawn around them.
 */
function MonthChart({ title, rows, viz, series, currency }) {
  const t = useT();

  if (!rows.length) {
    return (
      <Card title={title}>
        <Center py={16}><Text fontSize="sm" color={viz.textSecondary}>{t('table.emptyBrief')}</Text></Center>
      </Card>
    );
  }

  return (
    <Card title={title}>
      <Box h="17.5rem">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 4, left: -12 }} barGap={2}>
            <CartesianGrid stroke={viz.grid} strokeWidth={1} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: viz.textSecondary }}
              tickLine={false}
              axisLine={{ stroke: viz.grid }}
              minTickGap={16}
            />
            <YAxis
              tick={{ fontSize: 10, fill: viz.textSecondary }}
              tickLine={false}
              axisLine={false}
              width={currency ? 64 : 44}
              tickFormatter={(value) => (currency ? compact(value) : value)}
            />
            <Tooltip
              cursor={{ fill: viz.grid, fillOpacity: 0.4 }}
              formatter={(value) => (currency ? money(value) : value)}
              {...vizTooltip(viz)}
            />
            <Legend
              verticalAlign="top"
              align="right"
              height={26}
              iconType="square"
              wrapperStyle={{ fontSize: 11, color: viz.textSecondary }}
            />
            {series.map((entry) => (
              <Bar
                key={entry.key}
                dataKey={entry.key}
                name={entry.name}
                fill={entry.colour}
                radius={[4, 4, 0, 0]}
                maxBarSize={22}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </Card>
  );
}

/**
 * Axis ticks in thousands, so a money axis does not need eight digits.
 *
 * Rounded through utils/format rather than toFixed, so a round figure loses
 * its trailing zero here too: the tick reads 2M, not 2.0M.
 */
function compact(value) {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1000000) return number(n / 1000000, 1) + 'M';
  if (Math.abs(n) >= 1000) return number(n / 1000, 0) + 'k';
  return number(n);
}
