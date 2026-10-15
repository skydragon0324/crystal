import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge, Box, Button, Flex, Grid, HStack, Input, Popover, PopoverArrow, PopoverBody,
  PopoverContent, PopoverHeader, PopoverTrigger, Spinner, Stack, Tab, TabList,
  TabPanel, TabPanels, Tabs, Text, useColorMode, useToast
} from '@chakra-ui/react';
import {
  Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';

import Card from '../../components/Card';
import DataTable from '../../components/DataTable';
import ExcelActions from '../../components/ExcelActions';
import FormModal from '../../components/FormModal';
import SelectField from '../../components/SelectField';
import Toolbar from '../../components/Toolbar';
import { useConfirm } from '../../components/ConfirmDialog';
import usePermission from '../../hooks/usePermission';
import { lifecycle } from '../../api';
import { useT } from '../../i18n';
import { vizPalette, vizTooltip } from '../../theme/viz';
import { useSurface } from '../../theme/tokens';
import { date, dateTime, number } from '../../utils/format';
import { localInput } from './shared';
import { Kpi, KpiStrip, Panel } from './ui';

export const PAGE = '/admin/crm/lifecycle';

/**
 * CUSTOMER LIFECYCLE KPIs (CUSTOMER_LIFECYCLE_KPI_REQUIREMENTS.md section 12).
 *
 * Four statuses computed from logins, their history, and the transitions
 * between them. Four surfaces, as tabs: the trend, the transition explorer,
 * the comparison around a business event, and job health.
 *
 * THE ONE THING THIS SCREEN MUST NEVER DO is let a reader mistake a flow for
 * a stock. They are different questions with different arithmetic:
 *
 *   A STOCK is how many customers are in a status at the END of a bucket.
 *   Summing stocks across buckets counts the same person once per bucket -
 *   five 3-day buckets of a 30,000-customer base sum to 152,000 people who
 *   do not exist.
 *
 *   A FLOW is how many status CHANGES happened inside a bucket. Those DO sum,
 *   and one customer can contribute several.
 *
 * So the two are on separate tabs rather than two series on one chart, every
 * reply's `metricType` is shown, and the chart's own caption says which it is
 * drawing. The server labels every payload for the same reason.
 *
 * NOTHING IS COMPUTED HERE. Every number comes from the API, which reads the
 * daily snapshots and the period table; there is no client-side aggregation to
 * disagree with the server, and no mocked figure anywhere (requirement 8 of
 * the implementation prompt).
 *
 * EVERYTHING IS SERVER-SIDE PAGED. A transition list over this dataset is
 * hundreds of thousands of rows; requirement 11 forbids loading it into a
 * browser, so the table asks for one page at a time.
 */

const STATUSES = ['NEW', 'ACTIVE', 'DORMANT', 'CHURNED'];

/**
 * THE FOUR STATUSES ALWAYS IN THIS ORDER AND ALWAYS THE SAME COLOUR, taken
 * from the console's categorical palette by slot - so NEW is the same blue on
 * the chart, in the matrix and on a badge, in both colour modes.
 *
 * The order is the lifecycle's own: a customer moves left to right as they
 * disengage, which is what makes the stacked chart readable at a glance.
 */
const STATUS_SLOT = { NEW: 0, ACTIVE: 1, DORMANT: 2, CHURNED: 3 };

/** The word for each status, which is also its catalogue key here. */
const STATUS_LABEL = {
  NEW: 'New', ACTIVE: 'Active', DORMANT: 'Dormant', CHURNED: 'Churned'
};

function statusColour(palette, status) {
  return palette.categorical[STATUS_SLOT[status]] || palette.other;
}

/** Ranges a reader actually asks for, as days back from today. */
const SPANS = [
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '180', label: 'Last 180 days' },
  { value: '365', label: 'Last 12 months' }
];

const GROUPINGS = [
  { value: 'DAY', label: 'Daily' },
  { value: 'WEEK', label: 'Calendar weekly' },
  { value: 'CUSTOM:2', label: 'Every 2 days' },
  { value: 'CUSTOM:3', label: 'Every 3 days' },
  { value: 'CUSTOM:7', label: 'Every 7 days' },
  { value: 'CUSTOM:14', label: 'Every 14 days' }
];

/** YYYY-MM-DD for an offset from today, which is what the API takes. */
function dayOffset(days) {
  const at = new Date();
  at.setDate(at.getDate() - days);
  return at.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function Lifecycle() {
  const t = useT();
  const toast = useToast();
  const surface = useSurface();
  const { colorMode } = useColorMode();
  const palette = vizPalette(colorMode);
  const may = usePermission(PAGE);

  const [span, setSpan] = useState('90');
  const [grouping, setGrouping] = useState('DAY');

  const [overview, setOverview] = useState(null);
  const [trend, setTrend] = useState(null);
  const [definitions, setDefinitions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(null);

  const window = useMemo(function () {
    return { from: dayOffset(Number(span)), to: today() };
  }, [span]);

  const group = useMemo(function () {
    const parts = String(grouping).split(':');
    return { groupBy: parts[0], intervalDays: parts[1] ? Number(parts[1]) : undefined };
  }, [grouping]);

  const load = useCallback(async function () {
    setLoading(true);
    setFailed(null);

    try {
      const [cards, series, rules] = await Promise.all([
        lifecycle.overview({ asOf: window.to }),
        lifecycle.trend({
          from: window.from,
          to: window.to,
          groupBy: group.groupBy,
          intervalDays: group.intervalDays
        }),
        lifecycle.definitions()
      ]);

      setOverview(cards.data.data);
      setTrend(series.data.data);
      setDefinitions(rules.data.data);
    } catch (err) {
      /*
       * THE MESSAGE THE SERVER GAVE, not a generic one. A refused range or a
       * misspelt status comes back with a reason, and replacing it with
       * "something went wrong" throws away the only thing that helps.
       */
      setFailed((err.response && err.response.data && err.response.data.message)
        || err.message);
    } finally {
      setLoading(false);
    }
  }, [window, group]);

  useEffect(function () { load(); }, [load]);

  const counts = overview && overview.counts;

  return (
    <Box>
      {/*
        THE HEADING IS CONTENT, not a Toolbar prop - Toolbar carries a search
        box, filters and actions. The classification being LOGIN-BASED is
        stated here and not only in the popover: requirement 1 asks for the
        label to be visible wherever the numbers are.
      */}
      <Stack spacing="0.125rem" mb="0.75rem">
        <Text fontSize="lg" fontWeight="800">{t('Customer lifecycle KPIs')}</Text>
        <Text fontSize="xs" color={surface.muted}>
          {t('lifecycle.loginBasedStatusesAndThe')}
        </Text>
      </Stack>

      <Toolbar>
        <HStack spacing="0.5rem" wrap="wrap">
          <Box minW="11rem">
            <SelectField
              size="sm"
              value={span}
              isClearable={false}
              isSearchable={false}
              options={SPANS.map(function (option) {
                return { value: option.value, label: t(option.label) };
              })}
              onChange={setSpan}
            />
          </Box>
          <Box minW="12rem">
            <SelectField
              size="sm"
              value={grouping}
              isClearable={false}
              isSearchable={false}
              options={GROUPINGS.map(function (option) {
                return { value: option.value, label: t(option.label) };
              })}
              onChange={setGrouping}
            />
          </Box>
          <Button size="sm" variant="outline" onClick={load} isLoading={loading}>
            {t('common.refresh')}
          </Button>
          <Definitions definitions={definitions} surface={surface} t={t} />
        </HStack>
      </Toolbar>

      {failed && (
        <Card mb="1rem">
          <Stack spacing="0.5rem">
            <Text fontWeight="700" color="red.400">{t('The report could not be loaded')}</Text>
            <Text fontSize="sm" color={surface.muted}>{failed}</Text>
            <Box><Button size="sm" onClick={load}>{t('common.tryAgain')}</Button></Box>
          </Stack>
        </Card>
      )}

      {/*
        THE FRESHNESS LINE, ABOVE THE NUMBERS AND NOT BURIED IN A TAB.
        Requirement 8 asks for the limitation to be visible: these counts are
        complete as of the last reconciliation, not as of this second, and the
        person reading the cards is the person who needs to know.
      */}
      {overview && (
        <Freshness overview={overview} surface={surface} t={t} />
      )}

{/*
        FIVE CARDS: the population, then the four it divides into. Kpi
        translates its own label, so these are KEYS rather than translated
        text - passing the words would send them through the lookup twice.
      */}
      <Box mb="1rem">
        <KpiStrip>
          <Kpi
            label='Total registered'
            value={counts ? number(counts.TOTAL) : null}
            hint={overview ? t('At the end of {date}', { date: overview.asOf }) : undefined}
          />
          {STATUSES.map(function (status) {
            return (
              <Kpi
                key={status}
                label={STATUS_LABEL[status]}
                value={counts ? number(counts[status]) : null}
                hint={overview && overview.sharePercent[status] !== null
                  ? overview.sharePercent[status] + '%'
                  : undefined}
              />
            );
          })}
        </KpiStrip>
      </Box>

      <Tabs variant="soft-rounded" colorScheme="brand" isLazy>
        <TabList mb="1rem">
          <Tab>{t('Status stock')}</Tab>
          <Tab>{t('Transition explorer')}</Tab>
          <Tab>{t('Event impact')}</Tab>
          <Tab>{t('Job health')}</Tab>
        </TabList>

        <TabPanels>
          <TabPanel p="0">
            <StockTab
              trend={trend}
              window={window}
              group={group}
              loading={loading}
              palette={palette}
              surface={surface}
              t={t}
            />
          </TabPanel>

          <TabPanel p="0">
            <TransitionsTab
              window={window}
              group={group}
              palette={palette}
              surface={surface}
              t={t}
            />
          </TabPanel>

          <TabPanel p="0">
            <ImpactTab
              may={may}
              definitions={definitions}
              palette={palette}
              surface={surface}
              toast={toast}
              t={t}
            />
          </TabPanel>

          <TabPanel p="0">
            <HealthTab may={may} toast={toast} surface={surface} t={t} />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/*  the definitions popover                                            */
/* ------------------------------------------------------------------ */

/**
 * THE RULES, READ FROM THE SERVER.
 *
 * The thresholds and the notes come from /definitions rather than being
 * written out here, because a help text that restates a rule is a help text
 * that will eventually contradict it - and the one thing worse than an
 * unexplained metric is a confidently wrong explanation of it.
 */
function Definitions({ definitions, surface, t }) {
  return (
    <Popover placement="bottom-end">
      <PopoverTrigger>
        <Button size="sm" variant="ghost">{t('How these are counted')}</Button>
      </PopoverTrigger>
      <PopoverContent w="24rem" bg={surface.card}>
        <PopoverArrow bg={surface.card} />
        <PopoverHeader fontWeight="700" fontSize="sm">
          {t('How these are counted')}
        </PopoverHeader>
        <PopoverBody>
          {!definitions ? <Spinner size="sm" /> : (
            <Stack spacing="0.5rem" fontSize="xs" color={surface.muted}>
              <Text>
                {t('lifecycle.newForTheFirstDays', {
                  new: definitions.thresholds.newDays,
                  dormant: definitions.thresholds.dormantDays,
                  churned: definitions.thresholds.churnedDays
                })}
              </Text>
              {definitions.notes.map(function (note, index) {
                return <Text key={index}>• {note}</Text>;
              })}
              <Text pt="0.25rem">
                {t('lifecycle.reportTimezoneIs', { zone: definitions.reportTimezone })}
              </Text>
            </Stack>
          )}
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/*  freshness                                                          */
/* ------------------------------------------------------------------ */

function Freshness({ overview, surface, t }) {
  const fresh = overview.freshness;

  return (
    <Card mb="1rem" py="0.625rem">
      <Flex align="center" wrap="wrap" gap="0.75rem" data-gap="12" data-gap-wrap>
        <Badge colorScheme={fresh.isStale ? 'orange' : 'green'}>
          {fresh.isStale ? t('Data is stale') : t('Data is current')}
        </Badge>
        <Text fontSize="xs" color={surface.muted}>
          {t('Last synchronised')}:{' '}
          {fresh.lastSynchronizedAt ? dateTime(fresh.lastSynchronizedAt) : t('common.never')}
        </Text>
        <Text fontSize="xs" color={surface.muted}>
          {t('Last reconciled')}:{' '}
          {fresh.lastReconciledAt ? dateTime(fresh.lastReconciledAt) : t('common.never')}
        </Text>
        <Text fontSize="xs" color={surface.muted}>
          {t('lifecycle.countsAreCompleteAsOf')}
        </Text>
      </Flex>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  stock                                                             */
/* ------------------------------------------------------------------ */

function StockTab({ trend, window, group, loading, palette, surface, t }) {
  const rows = (trend && trend.buckets) || [];

  const columns = [
    { key: 'periodStart', label: 'Period',
      render: (row) => (row.periodStart === row.periodEnd
        ? date(row.periodStart)
        : date(row.periodStart) + ' – ' + date(row.periodEnd)) },
    { key: 'snapshotDate', label: 'Measured at end of',
      render: (row) => date(row.snapshotDate) },
    { key: 'new', label: 'New', align: 'right',
      render: (row) => (row.new === null ? '—' : number(row.new)) },
    { key: 'active', label: 'Active', align: 'right',
      render: (row) => (row.active === null ? '—' : number(row.active)) },
    { key: 'dormant', label: 'Dormant', align: 'right',
      render: (row) => (row.dormant === null ? '—' : number(row.dormant)) },
    { key: 'churned', label: 'Churned', align: 'right',
      render: (row) => (row.churned === null ? '—' : number(row.churned)) },
    { key: 'total', label: 'Total', align: 'right',
      render: (row) => (row.total === null ? '—' : number(row.total)) },
    /* The one flow on this tab, labelled as one. */
    { key: 'registeredInBucket', label: 'Registered (flow)', align: 'right',
      render: (row) => number(row.registeredInBucket) }
  ];

  const chart = rows.map(function (row) {
    return {
      label: row.periodEnd,
      NEW: row.new,
      ACTIVE: row.active,
      DORMANT: row.dormant,
      CHURNED: row.churned
    };
  });

  return (
    <Stack spacing="1rem">
      <Panel title={t('Status at the end of each bucket')}>
        {/*
          THE SENTENCE THAT STOPS THE COMMONEST MISREADING, in the body rather
          than as a subtitle: these bars are a population at an instant, and
          adding two of them together counts people twice.
        */}
        <Text fontSize="xs" color={surface.muted} px="1rem" pt="0.75rem">
          {t('lifecycle.theseAreStockCountsNever')}
        </Text>
        {loading ? (
          <Flex justify="center" py="3rem"><Spinner /></Flex>
        ) : !chart.length ? (
          <Flex justify="center" py="3rem">
            <Text fontSize="sm" color={surface.muted}>{t('Nothing in this range')}</Text>
          </Flex>
        ) : (
          <Box h="20rem">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke={palette.axis} />
                <YAxis tick={{ fontSize: 11 }} stroke={palette.axis} />
                <Tooltip {...vizTooltip(palette)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {STATUSES.map(function (status) {
                  return (
                    <Area
                      key={status}
                      type="monotone"
                      dataKey={status}
                      /*
                       * STACKED, because the four are mutually exclusive and
                       * exhaustive: the stack's height IS the registered
                       * population, which makes the invariant visible rather
                       * than something a reader has to take on trust.
                       */
                      stackId="stock"
                      stroke={statusColour(palette, status)}
                      fill={statusColour(palette, status)}
                      fillOpacity={0.65}
                    />
                  );
                })}
              </AreaChart>
            </ResponsiveContainer>
          </Box>
        )}
      </Panel>

      <Card>
        {/*
          THE NUMERIC TABLE UNDER THE CHART, AND ITS SPREADSHEET.

          Requirement 12.A asks for both. The export is the server's own
          query - the same buckets, the same grouping - rather than these rows
          serialised here, so a sheet taken from a loading screen is not a
          sheet of nulls. ExcelActions is the console's existing export
          button; `exportOnly` because there is nothing to import into a
          report.
        */}
        {/* No heading: the Panel above already says what these numbers are,
            and the column headers say it again in each column. */}
        <Flex align="center" justify="flex-end" mb="0.75rem">
          <ExcelActions
            resource={lifecycle.stockSheet}
            params={{
              from: window.from,
              to: window.to,
              groupBy: group.groupBy,
              intervalDays: group.intervalDays
            }}
            filename="lifecycle-stock.xlsx"
            exportOnly
            size="sm"
          />
        </Flex>

        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          rowKey={function (row) { return row.snapshotDate; }}
          hidePagination
          emptyText={t('Nothing in this range')}
        />
      </Card>
    </Stack>
  );
}

/* ------------------------------------------------------------------ */
/*  transitions                                                       */
/* ------------------------------------------------------------------ */

/**
 * THE TRANSITION EXPLORER: the matrix, and the records behind a cell.
 *
 * Clicking a cell filters the list below it, which is the whole point of the
 * surface - "forty-one customers went Dormant to Churned last week" is a
 * number nobody can act on until they can see which forty-one.
 */
function TransitionsTab({ window, group, palette, surface, t }) {
  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(true);

  const [fromStatus, setFromStatus] = useState(null);
  const [toStatus, setToStatus] = useState(null);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [loadingRows, setLoadingRows] = useState(false);

  const [subject, setSubject] = useState(null);

  useEffect(function () {
    let alive = true;
    setLoadingSummary(true);

    lifecycle.transitionSummary({
      from: window.from,
      to: window.to,
      groupBy: group.groupBy,
      intervalDays: group.intervalDays
    }).then(function (res) {
      if (alive) setSummary(res.data.data);
    }).finally(function () {
      if (alive) setLoadingSummary(false);
    });

    return function () { alive = false; };
  }, [window, group]);

  const loadRows = useCallback(function () {
    setLoadingRows(true);

    lifecycle.transitions({
      from: window.from,
      to: window.to,
      fromStatus: fromStatus || undefined,
      toStatus: toStatus || undefined,
      page: page,
      pageSize: limit
    }).then(function (res) {
      setRows(res.data.data.rows);
      setTotal(res.data.data.total);
    }).finally(function () {
      setLoadingRows(false);
    });
  }, [window, fromStatus, toStatus, page, limit]);

  useEffect(function () { loadRows(); }, [loadRows]);

  const matrix = (summary && summary.matrix) || [];

  const columns = [
    { key: 'transitionedAt', label: 'When',
      render: (row) => dateTime(row.transitionedAt) },
    { key: 'userId', label: 'Customer',
      render: (row) => (
        <Stack spacing="0">
          <Text fontSize="sm" fontWeight="600">{row.userName || row.userId}</Text>
          <Text fontSize="xs" color={surface.muted}>{row.userId}</Text>
        </Stack>
      ) },
    { key: 'displayPhone', label: 'Phone',
      render: (row) => row.displayPhone || '—' },
    { key: 'birthday', label: 'Birthday',
      render: (row) => (row.birthday ? date(row.birthday) : '—') },
    { key: 'fromStatus', label: 'Previous status',
      render: (row) => <StatusTag status={row.fromStatus} palette={palette} /> },
    { key: 'toStatus', label: 'New status',
      render: (row) => <StatusTag status={row.toStatus} palette={palette} /> },
    { key: 'reason', label: 'Why',
      render: (row) => <Text fontSize="xs" color={surface.muted}>{row.reason}</Text> },
    /* Deliberately beside the event-time status, and labelled differently. */
    { key: 'currentStatus', label: 'Status now',
      render: (row) => <StatusTag status={row.currentStatus} palette={palette} muted /> },
    { key: 'lastLoginAt', label: 'Last login',
      render: (row) => (row.lastLoginAt ? date(row.lastLoginAt) : t('Never logged in')) }
  ];

  return (
    <Stack spacing="1rem">
      <Panel title={t('Transition matrix')}>
        {/* A flow, and flows DO sum - the opposite of the tab beside it. */}
        <Text fontSize="xs" color={surface.muted} px="1rem" pt="0.75rem">
          {t('lifecycle.theseAreFlowCountsOne')}
        </Text>
        {loadingSummary ? (
          <Flex justify="center" py="2rem"><Spinner /></Flex>
        ) : !matrix.length ? (
          <Text fontSize="sm" color={surface.muted}>{t('No transitions in this range')}</Text>
        ) : (
          <Grid templateColumns="repeat(auto-fill, minmax(13rem, 1fr))" gap="0.625rem">
            {matrix.map(function (cell) {
              const chosen = fromStatus === cell.fromStatus && toStatus === cell.toStatus;

              return (
                <Box
                  key={cell.fromStatus + '>' + cell.toStatus}
                  as="button"
                  type="button"
                  textAlign="left"
                  p="0.75rem"
                  borderRadius="0.75rem"
                  borderWidth="1px"
                  borderColor={chosen ? 'brand.500' : surface.border}
                  bg={chosen ? surface.hover : surface.card}
                  onClick={function () {
                    setPage(1);
                    if (chosen) {
                      setFromStatus(null);
                      setToStatus(null);
                    } else {
                      setFromStatus(cell.fromStatus);
                      setToStatus(cell.toStatus);
                    }
                  }}
                >
                  <Flex align="center" gap="0.375rem" mb="0.25rem" data-gap="6">
                    <StatusTag status={cell.fromStatus} palette={palette} />
                    <Text fontSize="xs" color={surface.muted}>→</Text>
                    <StatusTag status={cell.toStatus} palette={palette} />
                  </Flex>
                  <Text fontSize="lg" fontWeight="800">{number(cell.events)}</Text>
                  <Text fontSize="xs" color={surface.muted}>
                    {t('from {customers} customers', {
                      customers: number(cell.uniqueCustomers)
                    })}
                  </Text>
                </Box>
              );
            })}
          </Grid>
        )}
      </Panel>

      <Card>
        <Flex align="center" justify="space-between" mb="0.75rem" wrap="wrap" gap="0.5rem" data-gap="8" data-gap-wrap>
          <Text fontSize="sm" fontWeight="700">
            {fromStatus
              ? t('{from} to {to}', { from: fromStatus, to: toStatus })
              : t('Every transition in the range')}
          </Text>
          <HStack spacing="0.5rem">
            {fromStatus && (
              <Button size="xs" variant="ghost" onClick={function () {
                setFromStatus(null);
                setToStatus(null);
                setPage(1);
              }}>
                {t('Clear the filter')}
              </Button>
            )}
            {/*
              THE EXPORT TAKES THE FILTER ON SCREEN, which is the whole point:
              a matrix cell narrows the list to the customers behind one
              number, and the sheet is that list. Bounded and audited on the
              server - see services/lifecycle/export.service.js.
            */}
            <ExcelActions
              resource={lifecycle.transitionSheet}
              params={{
                from: window.from,
                to: window.to,
                fromStatus: fromStatus || undefined,
                toStatus: toStatus || undefined
              }}
              filename="lifecycle-transitions.xlsx"
              exportOnly
              size="sm"
            />
          </HStack>
        </Flex>

        <DataTable
          columns={columns}
          rows={rows}
          loading={loadingRows}
          page={page}
          limit={limit}
          total={total}
          onPageChange={setPage}
          onLimitChange={function (next) { setLimit(next); setPage(1); }}
          rowKey={function (row) { return row.userPk + '@' + row.transitionedAt; }}
          onRowClick={function (row) { setSubject(row.userPk); }}
          rowHint={t("Open this customer's timeline")}
          emptyText={t('No transitions in this range')}
        />
      </Card>

      {subject && (
        <Timeline
          userPk={subject}
          onClose={function () { setSubject(null); }}
          palette={palette}
          surface={surface}
          t={t}
        />
      )}
    </Stack>
  );
}

/**
 * A status, in its own colour, wherever it appears.
 *
 * `muted` is for the "status now" column, which sits beside the event-time
 * status: the same colour outlined rather than filled, so the two read as the
 * same vocabulary without the current one competing for attention.
 */
function StatusTag({ status, palette, muted }) {
  if (!status) return <Text fontSize="xs">—</Text>;

  const colour = statusColour(palette, status);

  return (
    <Badge
      fontSize="0.625rem"
      variant={muted ? 'outline' : 'subtle'}
      style={muted
        ? { color: colour, borderColor: colour }
        : { background: colour + '22', color: colour }}
    >
      {status}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/*  one customer                                                      */
/* ------------------------------------------------------------------ */

/**
 * ONE CUSTOMER'S WHOLE HISTORY.
 *
 * Handles the three cases requirement 12 names: a customer who has never
 * logged in, one with missing profile fields, and one with thousands of
 * logins - the last of which is why the API returns a bounded list and a
 * count rather than every row.
 */
function Timeline({ userPk, onClose, palette, surface, t }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(null);

  useEffect(function () {
    let alive = true;

    lifecycle.timeline(userPk, {}).then(function (res) {
      if (alive) setData(res.data.data);
    }).catch(function (err) {
      if (alive) {
        setFailed((err.response && err.response.data && err.response.data.message) || err.message);
      }
    });

    return function () { alive = false; };
  }, [userPk]);

  return (
    <Card>
      <Flex align="center" justify="space-between" mb="0.75rem">
        <Text fontSize="sm" fontWeight="700">{t('Customer timeline')}</Text>
        <Button size="xs" variant="ghost" onClick={onClose}>{t('common.close')}</Button>
      </Flex>

      {failed ? (
        <Text fontSize="sm" color="red.400">{failed}</Text>
      ) : !data ? (
        <Flex justify="center" py="2rem"><Spinner /></Flex>
      ) : (
        <Stack spacing="1rem">
          <Grid templateColumns="repeat(auto-fit, minmax(10rem, 1fr))" gap="0.75rem">
            <Field label={t('Customer')} value={data.customer.userName || data.customer.userId} surface={surface} />
            <Field label={t('Login name')} value={data.customer.userId} surface={surface} />
            <Field label={t('Phone')} value={data.customer.displayPhone} surface={surface} />
            <Field label={t('Birthday')} value={data.customer.birthday ? date(data.customer.birthday) : null} surface={surface} />
            <Field label={t('Registered')} value={date(data.customer.registeredAt)} surface={surface} />
            <Field
              label={t('Status now')}
              value={data.current ? data.current.status : null}
              surface={surface}
            />
            <Field
              label={t('Last login')}
              value={data.current && data.current.lastLoginAt
                ? dateTime(data.current.lastLoginAt)
                : t('Never logged in')}
              surface={surface}
            />
            {/*
              THE PLATFORM'S OWN ACCOUNT FLAG, shown beside the lifecycle
              status and never merged with it - requirement 4.
            */}
            <Field
              label={t('Platform account flag')}
              value={data.customer.oracleAccountStatus === null
                ? null
                : String(data.customer.oracleAccountStatus)}
              surface={surface}
            />
            <Field
              label={t('Logins recorded')}
              value={number(data.loginCount)}
              surface={surface}
            />
          </Grid>

          <Box>
            <Text fontSize="xs" fontWeight="700" textTransform="uppercase" color={surface.muted} mb="0.5rem">
              {t('Status periods')}
            </Text>
            <Stack spacing="0.375rem">
              {data.periods.map(function (period, index) {
                return (
                  <Flex
                    key={index}
                    align="center"
                    gap="0.5rem"
                    data-gap="8"
                    data-gap-wrap
                    p="0.5rem"
                    borderRadius="0.5rem"
                    bg={surface.raised}
                    wrap="wrap"
                  >
                    <StatusTag status={period.status} palette={palette} />
                    <Text fontSize="xs" color={surface.muted}>
                      {dateTime(period.validFrom)}
                      {' → '}
                      {period.validTo ? dateTime(period.validTo) : t('still open')}
                    </Text>
                    <Text fontSize="xs" color={surface.muted}>{period.reason}</Text>
                  </Flex>
                );
              })}
            </Stack>
          </Box>

          {data.current && data.current.nextTransitionAt && (
            <Text fontSize="xs" color={surface.muted}>
              {t('lifecycle.ifTheyDoNotLogIn', {
                date: dateTime(data.current.nextTransitionAt)
              })}
            </Text>
          )}
        </Stack>
      )}
    </Card>
  );
}

function Field({ label, value, surface }) {
  return (
    <Stack spacing="0">
      <Text fontSize="0.625rem" textTransform="uppercase" color={surface.muted}>{label}</Text>
      <Text fontSize="sm" fontWeight="600">{value || '—'}</Text>
    </Stack>
  );
}

/* ------------------------------------------------------------------ */
/*  event impact                                                       */
/* ------------------------------------------------------------------ */

/**
 * WHAT HAPPENED AROUND AN INSTANT - three answers, which disagree.
 *
 * Requirement 12.D asks for stock at the chosen boundaries, the flows in each
 * window and a fixed-cohort start/end matrix, with the denominator explained
 * and no claim of causation. All four are here because all four are needed to
 * read the thing honestly:
 *
 *   THE BOUNDARIES are three photographs of the whole population. They are
 *   not a series and are never added up.
 *
 *   THE FLOWS are what changed inside each half. A customer who went DORMANT
 *   and came back inside the window is two of them.
 *
 *   THE COHORT is one pair per customer - the same population at the start
 *   and at the end. That same customer is one unchanged pair.
 *
 * So the flows can say "two things happened" about a population the cohort
 * says is exactly where it began, and both are true. Each block names its own
 * metric type, and the cohort states who is in it and who is not.
 *
 * THE EVENT MANAGER IS ON THIS TAB rather than on a screen of its own,
 * because an event exists only to be compared around: a list of named
 * instants with nothing to compare is a list nobody would open.
 */
function ImpactTab({ may, definitions, palette, surface, toast, t }) {
  const confirm = useConfirm();

  const [events, setEvents] = useState([]);
  const [choice, setChoice] = useState('ad-hoc');
  const [instant, setInstant] = useState(function () { return localInput(new Date()); });
  const [before, setBefore] = useState('7');
  const [after, setAfter] = useState('7');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(null);

  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadEvents = useCallback(function () {
    return lifecycle.events().then(function (res) {
      const rows = res.data.data.rows || [];
      setEvents(rows);
      return rows;
    });
  }, []);

  useEffect(function () {
    let alive = true;

    loadEvents().then(function (rows) {
      /* The newest event is the one somebody is most likely to be asking
         about, so it is the default - but only if there is one. */
      if (alive && rows.length) setChoice(String(rows[0].eventId));
    }).catch(function () { /* the list is not the point of the tab */ });

    return function () { alive = false; };
  }, [loadEvents]);

  const compare = useCallback(function () {
    setLoading(true);
    setFailed(null);

    const params = { beforeDays: Number(before), afterDays: Number(after) };

    /*
     * AN AD-HOC INSTANT IS SENT AS A FULL ISO TIMESTAMP, converted from the
     * box here rather than posted as typed. A datetime-local input carries no
     * zone, so the same text means a different instant to a browser and to a
     * server in another zone - and the whole comparison hangs off which
     * instant it is.
     */
    if (choice === 'ad-hoc') {
      const at = new Date(instant);
      if (isNaN(at.getTime())) {
        setLoading(false);
        setFailed(t('lifecycle.thatIsNotAnInstantYet'));
        return;
      }
      params.eventAt = at.toISOString();
    }

    lifecycle.impact(choice, params).then(function (res) {
      setData(res.data.data);
    }).catch(function (err) {
      setFailed((err.response && err.response.data && err.response.data.message) || err.message);
      setData(null);
    }).finally(function () {
      setLoading(false);
    });
  }, [choice, instant, before, after, t]);

  const save = async function (values) {
    setSaving(true);

    const at = new Date(values.eventAt);

    const body = {
      name: values.name,
      category: values.category || null,
      description: values.description || null,
      eventAt: isNaN(at.getTime()) ? values.eventAt : at.toISOString()
    };

    try {
      if (editing && editing.eventId) await lifecycle.updateEvent(editing.eventId, body);
      else await lifecycle.createEvent(body);

      setEditing(null);
      const rows = await loadEvents();
      if (!editing || !editing.eventId) {
        const newest = rows[0];
        if (newest) setChoice(String(newest.eventId));
      }
    } catch (err) {
      toast({
        status: 'error',
        title: (err.response && err.response.data && err.response.data.message) || err.message,
        isClosable: true
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async function (event) {
    const sure = await confirm({
      title: t('Delete this event?'),
      body: t('lifecycle.anEventNamesTheInstant'),
      tone: 'danger'
    });
    if (!sure) return;

    try {
      await lifecycle.deleteEvent(event.eventId);
      const rows = await loadEvents();
      if (String(event.eventId) === choice) {
        setChoice(rows.length ? String(rows[0].eventId) : 'ad-hoc');
        setData(null);
      }
    } catch (err) {
      toast({
        status: 'error',
        title: (err.response && err.response.data && err.response.data.message) || err.message,
        isClosable: true
      });
    }
  };

  const options = [{ value: 'ad-hoc', label: t('An instant I enter') }].concat(
    events.map(function (event) {
      return {
        value: String(event.eventId),
        label: event.name + ' · ' + dateTime(event.eventAt)
      };
    })
  );

  return (
    <Stack spacing="1rem">
      <Toolbar>
        <HStack spacing="0.5rem" wrap="wrap">
          <Box minW="18rem">
            <SelectField
              size="sm"
              value={choice}
              isClearable={false}
              options={options}
              onChange={setChoice}
            />
          </Box>

          {choice === 'ad-hoc' && (
            <Box minW="13rem">
              <Input
                size="sm"
                type="datetime-local"
                value={instant}
                onChange={function (event) { setInstant(event.target.value); }}
              />
            </Box>
          )}

          <Box w="7rem">
            <Input
              size="sm"
              type="number"
              min="1"
              max="180"
              value={before}
              placeholder={t('Days before')}
              onChange={function (event) { setBefore(event.target.value); }}
            />
          </Box>
          <Box w="7rem">
            <Input
              size="sm"
              type="number"
              min="1"
              max="180"
              value={after}
              placeholder={t('Days after')}
              onChange={function (event) { setAfter(event.target.value); }}
            />
          </Box>

          <Button size="sm" onClick={compare} isLoading={loading}>{t('Compare')}</Button>

          {may.canWrite && (
            <Button size="sm" variant="outline" onClick={function () { setEditing({}); }}>
              {t('Add an event')}
            </Button>
          )}
        </HStack>
      </Toolbar>

      <Text fontSize="xs" color={surface.muted}>
        {t('lifecycle.theInstantIsReadIn', {
          zone: (definitions && definitions.reportTimezone) || '—'
        })}
      </Text>

      {failed && (
        <Card>
          <Stack spacing="0.5rem">
            <Text fontWeight="700" color="red.400">{t('The report could not be loaded')}</Text>
            <Text fontSize="sm" color={surface.muted}>{failed}</Text>
            <Box><Button size="sm" onClick={compare}>{t('common.tryAgain')}</Button></Box>
          </Stack>
        </Card>
      )}

      {events.length > 0 && (
        <EventList
          events={events}
          may={may}
          surface={surface}
          t={t}
          onEdit={setEditing}
          onRemove={remove}
        />
      )}

      {loading && !data ? (
        <Flex justify="center" py="3rem"><Spinner /></Flex>
      ) : !data ? (
        <Card>
          <Text fontSize="sm" color={surface.muted}>{t('Pick an event or an instant, then press Compare')}</Text>
        </Card>
      ) : (
        <Impact data={data} palette={palette} surface={surface} t={t} />
      )}

      <FormModal
        isOpen={!!editing}
        onClose={function () { setEditing(null); }}
        title={editing && editing.eventId ? t('Edit') : t('Add an event')}
        saving={saving}
        onSubmit={save}
        size="lg"
        initial={editing && editing.eventId
          ? {
            name: editing.name,
            category: editing.category || '',
            description: editing.description || '',
            eventAt: localInput(editing.eventAt)
          }
          : { name: '', category: '', description: '', eventAt: localInput(new Date()) }}
        /*
          The lengths are NOT declared here. The server refuses an over-long
          name with a message naming the field and its limit - see
          controllers/lifecycle.controller.js - and a second copy of the
          number in this file is the one that would be forgotten when the
          column changes.
        */
        fields={[
          { name: 'name', label: 'Name', required: true },
          { name: 'eventAt', label: 'When it happened', type: 'datetime-local', required: true },
          { name: 'category', label: 'Category' },
          { name: 'description', label: 'Description', type: 'textarea' }
        ]}
      />
    </Stack>
  );
}

/** The stored events, with the two things an operator does to one. */
function EventList({ events, may, surface, t, onEdit, onRemove }) {
  return (
    <Panel title={t('Business events')}>
      <Stack spacing="0" divider={<Box borderBottomWidth="1px" borderColor={surface.border} />}>
        {events.map(function (event) {
          return (
            <Flex
              key={event.eventId}
              align="center"
              justify="space-between"
              px="1rem"
              py="0.625rem"
              wrap="wrap"
              gap="0.5rem"
              data-gap="8"
              data-gap-wrap
            >
              <Stack spacing="0">
                <Text fontSize="sm" fontWeight="600">{event.name}</Text>
                <Text fontSize="xs" color={surface.muted}>
                  {dateTime(event.eventAt)}
                  {event.category ? ' · ' + event.category : ''}
                </Text>
              </Stack>

              {may.canWrite && (
                <HStack spacing="0.375rem">
                  <Button size="xs" variant="ghost" onClick={function () { onEdit(event); }}>
                    {t('Edit')}
                  </Button>
                  <Button size="xs" variant="ghost" colorScheme="red" onClick={function () { onRemove(event); }}>
                    {t('Delete')}
                  </Button>
                </HStack>
              )}
            </Flex>
          );
        })}
      </Stack>
    </Panel>
  );
}

/** The three answers, each labelled with what kind of number it is. */
function Impact({ data, palette, surface, t }) {
  const boundaries = [
    { key: 'start', label: 'Window start', at: data.window.start, counts: data.boundaries.atWindowStart },
    { key: 'event', label: 'At the event', at: data.eventAt, counts: data.boundaries.atEvent },
    { key: 'end', label: 'Window end', at: data.window.end, counts: data.boundaries.atWindowEnd }
  ];

  const columns = [
    { key: 'label', label: 'Boundary',
      render: (row) => (
        <Stack spacing="0">
          <Text fontSize="sm" fontWeight="600">{t(row.label)}</Text>
          <Text fontSize="xs" color={surface.muted}>{dateTime(row.at)}</Text>
        </Stack>
      ) },
    { key: 'new', label: 'New', align: 'right', render: (row) => number(row.counts.NEW) },
    { key: 'active', label: 'Active', align: 'right', render: (row) => number(row.counts.ACTIVE) },
    { key: 'dormant', label: 'Dormant', align: 'right', render: (row) => number(row.counts.DORMANT) },
    { key: 'churned', label: 'Churned', align: 'right', render: (row) => number(row.counts.CHURNED) },
    { key: 'total', label: 'Total', align: 'right',
      render: (row) => <Text fontWeight="700">{number(row.counts.TOTAL)}</Text> }
  ];

  return (
    <Stack spacing="1rem">
      <Text fontSize="xs" color={surface.muted}>
        {t('lifecycle.theseAreThreeSeparate')}
      </Text>

      <Panel title={t('Status at each boundary')}>
        <Text fontSize="xs" color={surface.muted} px="1rem" pt="0.75rem">
          {t('lifecycle.theseAreStockCountsNever')}
        </Text>
        <DataTable columns={columns} rows={boundaries} rowKey={function (row) { return row.key; }} hidePagination />
      </Panel>

      <Panel title={t('Transition flows in each window')}>
        <Box px="1rem" py="0.75rem">
          <Text fontSize="xs" color={surface.muted} mb="0.75rem">
            {t('lifecycle.theWindowIsHalfOpenAt')}
          </Text>

          <Box mb="0.75rem">
            <KpiStrip>
              <Kpi
                label='Before the event'
                value={number(data.flows.before.events)}
                hint={t('{events} per day', { events: data.flows.difference.beforeEventsPerDay })}
              />
              <Kpi
                label='After the event'
                value={number(data.flows.after.events)}
                hint={t('{events} per day', { events: data.flows.difference.afterEventsPerDay })}
              />
              <Kpi
                label='Difference'
                value={(data.flows.difference.events > 0 ? '+' : '')
                  + number(data.flows.difference.events)}
                tone={data.flows.difference.events > 0 ? 'warn' : undefined}
                hint={t('Events')}
              />
              <Kpi
                label='Unique customers'
                value={number(data.flows.after.uniqueCustomers)}
                hint={t('After the event')}
              />
            </KpiStrip>
          </Box>

          <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap="0.75rem">
            <FlowSide
              title={t('Before the event')}
              side={data.flows.before}
              palette={palette}
              surface={surface}
              t={t}
            />
            <FlowSide
              title={t('After the event')}
              side={data.flows.after}
              palette={palette}
              surface={surface}
              t={t}
            />
          </Grid>
        </Box>
      </Panel>

      <Panel title={t('Where the same customers ended')}>
        <Box px="1rem" py="0.75rem">
          <Box mb="0.75rem">
            <KpiStrip>
              <Kpi label='Cohort size' value={number(data.cohort.size)} />
              <Kpi label='Unchanged' value={number(data.cohort.unchanged)} />
              <Kpi label='Moved' value={number(data.cohort.moved)} />
              <Kpi
                label='Registered during the window'
                value={number(data.cohort.registeredDuringWindow)}
                hint={t('Not in the cohort')}
              />
            </KpiStrip>
          </Box>

          {/*
            THE DENOMINATOR AND THE CAVEAT, BOTH FROM THE SERVER.

            Written where the numbers are, and read from the payload rather
            than restated here - the same reasoning as the definitions
            popover. A caveat kept in the UI is one that can drift from the
            thing it is a caveat about.
          */}
          <Text fontSize="xs" color={surface.muted} mb="0.75rem">{data.cohort.note}</Text>

          <Grid templateColumns="repeat(auto-fill, minmax(12rem, 1fr))" gap="0.625rem">
            {data.cohort.matrix.map(function (pair) {
              return (
                <Box
                  key={pair.fromStatus + '>' + pair.toStatus}
                  p="0.75rem"
                  borderRadius="0.75rem"
                  borderWidth="1px"
                  borderColor={surface.border}
                  bg={pair.unchanged ? surface.raised : surface.card}
                >
                  <Flex align="center" gap="0.375rem" mb="0.25rem" data-gap="6">
                    <StatusTag status={pair.fromStatus} palette={palette} />
                    <Text fontSize="xs" color={surface.muted}>→</Text>
                    <StatusTag status={pair.toStatus} palette={palette} />
                  </Flex>
                  <Text fontSize="lg" fontWeight="800">{number(pair.customers)}</Text>
                  <Text fontSize="xs" color={surface.muted}>
                    {pair.unchanged ? t('Unchanged') : t('Moved')}
                  </Text>
                </Box>
              );
            })}
          </Grid>

          <Text fontSize="xs" color="orange.400" mt="0.75rem">{data.caution}</Text>
        </Box>
      </Panel>
    </Stack>
  );
}

/** One half-window's cells, events beside unique customers. */
function FlowSide({ title, side, palette, surface, t }) {
  return (
    <Box borderWidth="1px" borderColor={surface.border} borderRadius="0.75rem" p="0.75rem">
      <Text fontSize="xs" fontWeight="700" textTransform="uppercase" color={surface.muted} mb="0.5rem">
        {title}
      </Text>

      {!side.matrix.length ? (
        <Text fontSize="sm" color={surface.muted}>{t('No transitions in this range')}</Text>
      ) : (
        <Stack spacing="0.375rem">
          {side.matrix.map(function (cell) {
            return (
              <Flex
                key={cell.fromStatus + '>' + cell.toStatus}
                align="center"
                justify="space-between"
                gap="0.5rem"
                data-gap="8"
                data-gap-wrap
                wrap="wrap"
              >
                <Flex align="center" gap="0.375rem" data-gap="6">
                  <StatusTag status={cell.fromStatus} palette={palette} />
                  <Text fontSize="xs" color={surface.muted}>→</Text>
                  <StatusTag status={cell.toStatus} palette={palette} />
                </Flex>
                <Text fontSize="sm" fontWeight="700">
                  {number(cell.events)}
                  <Text as="span" fontSize="xs" fontWeight="400" color={surface.muted}>
                    {' '}{t('from {customers} customers', {
                      customers: number(cell.uniqueCustomers)
                    })}
                  </Text>
                </Text>
              </Flex>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/*  health                                                            */
/* ------------------------------------------------------------------ */

function HealthTab({ may, toast, surface, t }) {
  const [data, setData] = useState(null);
  const [exceptions, setExceptions] = useState([]);
  const [running, setRunning] = useState(false);

  const load = useCallback(function () {
    lifecycle.health().then(function (res) { setData(res.data.data); });

    /*
     * The exception rows, separately from the counts. A count tells an
     * operator that something is wrong and the rows tell them what - and the
     * list is bounded server-side, because "every malformed row we have ever
     * seen" is not a screen.
     */
    lifecycle.exceptions({ limit: 50 }).then(function (res) {
      setExceptions(res.data.data.rows || []);
    }).catch(function () { /* the counts above are the headline */ });
  }, []);

  useEffect(function () { load(); }, [load]);

  const reconcile = async function () {
    setRunning(true);

    try {
      const res = await lifecycle.reconcile();
      toast({ status: 'success', title: res.data.message, isClosable: true });
      load();
    } catch (err) {
      toast({
        status: 'error',
        title: (err.response && err.response.data && err.response.data.message) || err.message,
        isClosable: true
      });
    } finally {
      setRunning(false);
    }
  };

  if (!data) return <Flex justify="center" py="3rem"><Spinner /></Flex>;

  const runColumns = [
    { key: 'job', label: 'Job' },
    { key: 'status', label: 'Outcome',
      render: (row) => (
        <Badge colorScheme={row.status === 'SUCCEEDED' ? 'green'
          : row.status === 'FAILED' ? 'red'
            : row.status === 'SKIPPED' ? 'gray' : 'blue'}>
          {row.status}
        </Badge>
      ) },
    { key: 'started_at', label: 'Started', render: (row) => dateTime(row.started_at) },
    { key: 'rows_read', label: 'Rows read', align: 'right',
      render: (row) => number(row.rows_read) },
    { key: 'rows_written', label: 'Rows written', align: 'right',
      render: (row) => number(row.rows_written) },
    { key: 'customers_rebuilt', label: 'Customers rebuilt', align: 'right',
      render: (row) => number(row.customers_rebuilt) },
    { key: 'error', label: 'Error',
      render: (row) => (row.error
        ? <Text fontSize="xs" color="red.400">{row.error}</Text>
        : '—') }
  ];

  /*
   * PER JOB: how long it takes and how often it fails - requirement 13 asks
   * for job duration and the time taken to generate snapshots to be
   * observable, and the snapshot sweep is one of the rows here.
   */
  const durationColumns = [
    { key: 'job', label: 'Job' },
    { key: 'lastSeconds', label: 'Last run', align: 'right',
      render: (row) => (row.lastSeconds === null ? '—' : row.lastSeconds + 's') },
    { key: 'averageSeconds', label: 'Average', align: 'right',
      render: (row) => (row.averageSeconds === null ? '—' : row.averageSeconds + 's') },
    { key: 'slowestSeconds', label: 'Slowest', align: 'right',
      render: (row) => (row.slowestSeconds === null ? '—' : row.slowestSeconds + 's') },
    { key: 'runs', label: 'Runs', align: 'right', render: (row) => number(row.runs) },
    { key: 'failed', label: 'Failed', align: 'right',
      render: (row) => (row.failed
        ? <Text color="red.400" fontWeight="700">{number(row.failed)}</Text>
        : number(0)) },
    { key: 'lastStartedAt', label: 'Started',
      render: (row) => (row.lastStartedAt ? dateTime(row.lastStartedAt) : '—') }
  ];

  const exceptionColumns = [
    { key: 'kind', label: 'Kind',
      render: (row) => <Badge colorScheme="orange">{row.kind}</Badge> },
    { key: 'user_pk', label: 'Customer', render: (row) => row.user_pk || '—' },
    { key: 'source_table_pk', label: 'Source key', render: (row) => row.source_table_pk || '—' },
    { key: 'action_at', label: 'When',
      render: (row) => (row.action_at ? dateTime(row.action_at) : '—') },
    { key: 'detail', label: 'Detail',
      render: (row) => <Text fontSize="xs" color={surface.muted}>{row.detail || '—'}</Text> },
    { key: 'noticed_at', label: 'Noticed',
      render: (row) => dateTime(row.noticed_at) }
  ];

  const pool = data.pool;

  return (
    <Stack spacing="1rem">
      <KpiStrip>
        <Kpi label='Logins imported' value={number(data.journalRows)} />
        <Kpi label='Daily snapshots' value={number(data.snapshotDays)} />
        <Kpi
          label='Open exceptions'
          value={number(data.openExceptions)}
          tone={data.openExceptions ? 'warn' : undefined}
          hint={data.exceptionsByKind && data.exceptionsByKind.length
            ? data.exceptionsByKind.map(function (row) {
              return row.kind + ' ' + row.open;
            }).join(', ')
            : undefined}
        />
        <Kpi
          label='Freshness'
          value={data.isStale ? t('Stale') : t('Current')}
          tone={data.isStale ? 'warn' : 'good'}
          hint={data.lastSynchronizedAt ? dateTime(data.lastSynchronizedAt) : t('common.never')}
        />

        {/*
          THE TWO LAGS ARE SEPARATE NUMBERS because they fail separately. The
          sync lag is how long since a poll succeeded, which is a job problem;
          the source lag is how old the newest login is, which on a quiet
          night is just how long since anybody logged in. One number for both
          is how a dashboard ends up alarming at four in the morning.
        */}
        <Kpi
          label='Sync lag'
          value={data.syncLagMinutes === null
            ? null
            : t('{minutes} min', { minutes: number(data.syncLagMinutes) })}
          tone={data.isStale ? 'warn' : undefined}
        />
        <Kpi
          label='Source lag'
          value={data.sourceLagMinutes === null
            ? null
            : t('{minutes} min', { minutes: number(data.sourceLagMinutes) })}
          hint={t('Newest login')}
        />
        <Kpi
          label='Snapshot built'
          value={data.snapshots && data.snapshots.latestDay
            ? date(data.snapshots.latestDay)
            : null}
          hint={data.snapshots && data.snapshots.builtAt
            ? dateTime(data.snapshots.builtAt)
            : undefined}
        />
        {/*
          POOL USAGE. The number that matters is not how many connections are
          busy - a busy pool is a working pool - but how many requests are
          WAITING for one, which is what a long job holding connections looks
          like from the outside.
        */}
        <Kpi
          label='Pool in use'
          value={pool ? pool.used + ' / ' + pool.max : null}
          tone={pool && pool.pendingAcquires ? 'warn' : undefined}
          hint={pool
            ? t('{waiting} waiting', { waiting: number(pool.pendingAcquires) })
            : undefined}
        />
      </KpiStrip>

      {/*
        THE CAVEAT, IN FULL, ON THE SCREEN. Requirement 8 asks for the
        completeness limit of polling a log with no commit-time column to be
        visible to an operator rather than documented somewhere they will
        never read. It is not a warning about a fault - it is what this
        ingestion method can and cannot promise.
      */}
      <Panel title={t('What these numbers can promise')}>
        <Stack spacing="0.5rem" fontSize="xs" color={surface.muted}>
          <Text>{data.completeness.note}</Text>
          <Text>
            {t('lifecycle.theOverlapWindowIs', { rows: number(data.completeness.overlapWindow) })}
          </Text>
          <Text>
            {t('Last reconciled')}:{' '}
            {data.lastReconciledAt ? dateTime(data.lastReconciledAt) : t('common.never')}
          </Text>
        </Stack>

        {may.canWrite && (
          <Box mt="0.75rem">
            <Button size="sm" onClick={reconcile} isLoading={running}>
              {t('Reconcile now')}
            </Button>
            <Text fontSize="xs" color={surface.muted} mt="0.375rem">
              {t('lifecycle.thisReadsEverySourceKey')}
            </Text>
          </Box>
        )}
      </Panel>

      <Card>
        <Text fontSize="sm" fontWeight="700" mb="0.75rem">{t('Job durations')}</Text>
        <DataTable
          columns={durationColumns}
          rows={data.jobDurations || []}
          rowKey={function (row) { return row.job; }}
          hidePagination
          emptyText={t('No jobs have run yet')}
        />
      </Card>

      <Card>
        <Text fontSize="sm" fontWeight="700" mb="0.75rem">{t('Recent job runs')}</Text>
        <DataTable
          columns={runColumns}
          rows={data.recentRuns}
          rowKey={function (row) { return row.id; }}
          hidePagination
          emptyText={t('No jobs have run yet')}
        />
      </Card>

      {/*
        THE MALFORMED AND ORPHAN ROWS THEMSELVES - requirement 14's fixture H.
        A login with no timestamp, one stamped in the future, one belonging to
        a customer who is not in the source: each is recorded rather than
        dropped silently, and this is where an operator sees what was set
        aside and why.
      */}
      <Card>
        <Text fontSize="sm" fontWeight="700" mb="0.75rem">{t('Data quality exceptions')}</Text>
        <DataTable
          columns={exceptionColumns}
          rows={exceptions}
          rowKey={function (row) { return row.id; }}
          hidePagination
          emptyText={t('No exceptions')}
        />
      </Card>
    </Stack>
  );
}
