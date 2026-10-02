import React, { useCallback, useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import {
  Box, Button, Flex, Grid, HStack, Progress, Stack, Tab, TabList, TabPanel, TabPanels, Tabs, Text, useColorMode, useToast
} from '@chakra-ui/react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import Card from '../../components/Card';
import DataTable from '../../components/DataTable';
import SelectField from '../../components/SelectField';
import Toolbar from '../../components/Toolbar';
import { useConfirm } from '../../components/ConfirmDialog';
import useList from '../../hooks/useList';
import usePermission from '../../hooks/usePermission';
import { crm } from '../../api';
import { useT } from '../../i18n';
import { vizPalette, vizTooltip } from '../../theme/viz';
import { useSurface } from '../../theme/tokens';
import { date, dateTime, money, number } from '../../utils/format';
import { choices, filtersFor, optionsFrom, translateOptions, useCrmMeta } from './shared';
import { Amount, Dot, GradeBadge, InfoList, Kpi, KpiStrip, Panel, ProjectTags, ScoreBreakdown, ScoreMeter } from './ui';

export const PAGE = '/admin/crm/analysis';

const GRADE_FILL = { AAA: '#805ad5', AA: '#3182ce', A: '#319795', B: '#dd6b20', C: '#a0aec0' };

/**
 * ANALYSIS AND CORPORATE GRADES (design 3.7, 3.8, 10).
 *
 * The analysis run writes, for every customer and a reference date, one
 * snapshot per project and one Dream-wide snapshot recalculated from the
 * facts; the Dream-wide one carries the corporate score and grade. This
 * screen is where that run is started and where its result is read: how the
 * customer base spreads across the grades, how active it is, where the spend
 * comes from, every snapshot, every metric value, and how the score is made.
 */
export default function Analysis() {
  const t = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const { canWrite } = usePermission(PAGE);
  const [summary, setSummary] = useState(null);
  const [refDate, setRefDate] = useState(null);
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState(null);

  const load = useCallback(() => {
    crm.analysis.summary(refDate || undefined).then(({ data }) => setSummary(data || {})).catch(() => setSummary({}));
  }, [refDate]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { crm.analysis.model().then(({ data }) => setModel(data || null)).catch(() => setModel(null)); }, []);

  const runNow = async () => {
    const agreed = await confirm({
      tone: 'info', title: t('crm.analysis.runNow'), body: t('crm.analysis.runExplained'), confirmLabel: t('crm.analysis.run')
    });
    if (!agreed) return;
    setBusy(true);
    try {
      const { data } = await crm.analysis.run();
      toast({ title: t('crm.analysis.finished', { n: number((data || {}).snapshots) }), status: 'success', duration: 3000 });
      setRefDate(null);
      load();
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 6000, isClosable: true });
    } finally {
      setBusy(false);
    }
  };

  const summaryData = summary || {};
  const totals = summaryData.totals || {};

  return (
    <Stack spacing={4}>
      <Card bodyProps={false}>
        <Flex px={5} py={4} align="center" justify="space-between" wrap="wrap">
          <Box maxW="46rem" mr={4} mb={{ base: 3, md: 0 }}>
            <Text fontSize="sm">{t('crm.analysis.intro')}</Text>
            {summaryData.reference_date ? (
              <Text fontSize="xs" mt={1}>{t('crm.analysis.lastRun', { date: date(summaryData.reference_date), when: dateTime(totals.calculated_at), model: totals.model_version || '' })}</Text>
            ) : null}
          </Box>
          <HStack spacing={2}>
            <Box w="11rem">
              <SelectField
                size="sm" isClearable={false} isSearchable={false}
                value={refDate || summaryData.reference_date || null}
                options={(summaryData.dates || []).map((referenceDate) => ({ value: referenceDate, label: referenceDate }))}
                placeholder={t('crm.analysis.referenceDate')}
                onChange={(value) => setRefDate(value || null)}
              />
            </Box>
            {canWrite ? <Button size="sm" variant="brand" isLoading={busy} onClick={runNow}>{t('crm.analysis.runNow')}</Button> : null}
          </HStack>
        </Flex>
      </Card>

      <Card bodyProps={false}>
        <Tabs isLazy variant="line" colorScheme="brand">
          <TabList px={4} pt={2}>
            <Tab fontSize="sm">{t('crm.analysis.overview')}</Tab>
            <Tab fontSize="sm">{t('crm.analysis.snapshots')}</Tab>
            <Tab fontSize="sm">{t('crm.analysis.metricValues')}</Tab>
            <Tab fontSize="sm">{t('crm.analysis.howTheScoreWorks')}</Tab>
          </TabList>
          <TabPanels>
            <TabPanel><SummaryTab summaryData={summaryData} /></TabPanel>
            <TabPanel px={0}><SnapshotsTab refDate={refDate || summaryData.reference_date} model={model} /></TabPanel>
            <TabPanel px={0}><MetricsTab refDate={refDate} /></TabPanel>
            <TabPanel><ModelTab model={model} grades={summaryData.grades || []} /></TabPanel>
          </TabPanels>
        </Tabs>
      </Card>
    </Stack>
  );
}

function SummaryTab({ summaryData }) {
  const t = useT();
  const { colorMode } = useColorMode();
  const viz = vizPalette(colorMode);
  const totals = summaryData.totals || {};
  const grades = summaryData.grades || [];
  const activity = summaryData.activity || [];
  const projects = summaryData.projects || [];

  if (!summaryData.reference_date) return <Text fontSize="sm">{t('crm.analysis.notRunYet')}</Text>;

  return (
    <Stack spacing={4}>
      <KpiStrip>
        <Kpi label="Customers analysed" value={number(totals.parties)} />
        <Kpi label="Spend, 12 months" value={money(totals.spend_12m)} />
        <Kpi label="Purchases, 12 months" value={number(totals.transactions_12m)} />
        <Kpi label="Average score" value={number(totals.average_score, 1)} />
        <Kpi label="At risk or lapsed" value={number(totals.at_risk)} tone={totals.at_risk ? 'warn' : null} />
        <Kpi label="Projects" value={number(projects.length)} />
        <Kpi label="Top grade" value={number((grades[0] || {}).parties)} hint={(grades[0] || {}).grade_code} />
        <Kpi label="Reference date" value={date(summaryData.reference_date)} />
      </KpiStrip>

      <Grid templateColumns={{ base: '1fr', xl: '3fr 2fr' }} gridGap={4}>
        <Panel title={t('crm.analysis.gradeDistribution')}>
          <Box h="15rem" px={2} py={3}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={grades} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                <CartesianGrid stroke={viz.grid} vertical={false} />
                <XAxis dataKey="grade_code" tick={{ fontSize: 11, fill: viz.textSecondary }} tickLine={false} axisLine={{ stroke: viz.grid }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: viz.textSecondary }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: viz.grid, fillOpacity: 0.4 }} {...vizTooltip(viz)} />
                <Bar dataKey="parties" name={t('crm.analysis.customers')} radius={[4, 4, 0, 0]} maxBarSize={48}>
                  {grades.map((grade) => <Cell key={grade.grade_code} fill={GRADE_FILL[grade.grade_code] || viz.series1} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Box>
          <DataTable
            hidePagination
            rows={grades}
            rowKey={(row) => row.corporate_grade_id}
            columns={[
              { key: 'grade_code', label: 'Grade', render: (row) => <HStack><GradeBadge code={row.grade_code} /><Text fontSize="sm">{t(row.grade_name)}</Text></HStack> },
              { key: 'min_score', label: 'Score band', render: (row) => number(row.min_score) + ' - ' + (row.max_score === null ? '100' : number(row.max_score)) },
              { key: 'parties', label: 'Customers', isNumeric: true, render: (row) => number(row.parties) },
              { key: 'spend_12m', label: 'Spend, 12 months', isNumeric: true, render: (row) => <Amount value={row.spend_12m} /> }
            ]}
          />
        </Panel>
        <Stack spacing={4}>
          <Panel title={t('crm.analysis.activity')}>
            <Stack spacing={2.5} px={4} py={3}>
              {activity.map((activityRow) => (
                <Box key={activityRow.activity_status}>
                  <Flex justify="space-between" fontSize="sm">
                    <Dot value={activityRow.activity_status} />
                    <Text fontWeight="600" style={{ fontVariantNumeric: 'tabular-nums' }}>{number(activityRow.parties)}</Text>
                  </Flex>
                  <Progress value={totals.parties ? (activityRow.parties / totals.parties) * 100 : 0} size="xs" borderRadius="full" colorScheme="brand" mt="2px" />
                </Box>
              ))}
            </Stack>
          </Panel>
          <Panel title={t('crm.analysis.spendByProject')}>
            <DataTable
              hidePagination
              rows={projects}
              rowKey={(row) => row.project_id}
              columns={[
                { key: 'project_code', label: 'Project', render: (row) => <ProjectTags codes={[row.project_code]} /> },
                { key: 'parties', label: 'Customers', isNumeric: true, render: (row) => number(row.parties) },
                { key: 'spend_12m', label: 'Spend, 12 months', isNumeric: true, render: (row) => <Amount value={row.spend_12m} /> },
                { key: 'cases_12m', label: 'Service cases', isNumeric: true, render: (row) => number(row.cases_12m) }
              ]}
            />
          </Panel>
        </Stack>
      </Grid>
    </Stack>
  );
}

function SnapshotsTab({ refDate, model }) {
  const t = useT();
  const history = useHistory();
  const meta = useCrmMeta();
  const [scope, setScope] = useState('dream');

  const list = useList((params) => crm.analysis.snapshots(params),
    { page: 1, limit: 25, sort: 'corporate_score', dir: 'desc', scope: 'dream' });

  useEffect(() => {
    list.setFilter({ reference_date: refDate || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refDate]);

  const dream = scope === 'dream';

  return (
    <Box>
      <Toolbar
        search={list.params.q}
        onSearch={(searchText) => list.setFilter({ q: searchText })}
        filters={filtersFor(t, [
          { key: 'scope', label: 'Scope', value: scope,
            options: [{ value: 'dream', label: 'Dream-wide' }, { value: 'project', label: 'Per project' }],
            onChange: (value) => { setScope(value || 'dream'); list.setFilter({ scope: value || 'dream', sort: value === 'project' ? 'purchase_amount_12m' : 'corporate_score' }); } },
          dream ? { key: 'corporate_grade_id', label: 'Corporate grade', value: list.params.corporate_grade_id,
            options: optionsFrom(meta.corporate_grades, 'corporate_grade_id', 'grade_code'),
            onChange: (value) => list.setFilter({ corporate_grade_id: value || undefined }) }
            : { key: 'project_id', label: 'Project', value: list.params.project_id,
              options: optionsFrom(meta.projects, 'project_id', 'project_name'),
              onChange: (value) => list.setFilter({ project_id: value || undefined }) },
          { key: 'activity_status', label: 'Activity', value: list.params.activity_status,
            options: choices(['NEW', 'ACTIVE', 'AT_RISK', 'LAPSED', 'NEVER_BOUGHT']),
            onChange: (value) => list.setFilter({ activity_status: value || undefined }) }
        ])}
      />
      <Box px="0.5rem" pb="0.5rem">
        <DataTable
          columns={[
            { key: 'party_name', label: 'Customer', sortable: false, render: (row) => (row.party_name || '-') + '  ' + (row.party_no || '') },
            dream ? { key: 'grade_code', label: 'Grade', sortable: false, render: (row) => <GradeBadge code={row.grade_code} /> }
              : { key: 'project_code', label: 'Project', sortable: false, render: (row) => <ProjectTags codes={[row.project_code]} /> },
            dream ? { key: 'corporate_score', label: 'Score', render: (row) => <ScoreMeter value={row.corporate_score} compact /> } : null,
            { key: 'purchase_amount_12m', label: 'Spend, 12 months', isNumeric: true, render: (row) => <Amount value={row.purchase_amount_12m} /> },
            { key: 'purchase_amount_lifetime', label: 'Lifetime spend', isNumeric: true, render: (row) => <Amount value={row.purchase_amount_lifetime} /> },
            { key: 'transaction_count_12m', label: 'Purchases, 12 months', isNumeric: true, render: (row) => number(row.transaction_count_12m) },
            { key: 'active_purchase_days_12m', label: 'Purchase days', isNumeric: true, render: (row) => number(row.active_purchase_days_12m) },
            { key: 'last_transaction_at', label: 'Last purchase', render: (row) => date(row.last_transaction_at) },
            { key: 'service_case_count_12m', label: 'Service cases', isNumeric: true, render: (row) => number(row.service_case_count_12m) },
            { key: 'registered_device_count', label: 'Products held', isNumeric: true, render: (row) => number(row.registered_device_count) },
            { key: 'activity_status', label: 'Activity', sortable: false, render: (row) => <Dot value={row.activity_status} /> }
          ].filter(Boolean)}
          rows={list.rows}
          loading={list.loading}
          page={list.params.page}
          limit={list.params.limit}
          total={list.total}
          sort={list.params.sort}
          dir={list.params.dir}
          onSort={list.setSort}
          onPageChange={list.setPage}
          onLimitChange={(limit) => list.setFilter({ limit: limit })}
          rowKey={(row) => row.analysis_snapshot_id || row.id}
          renderExpanded={dream ? (row) => <Box maxW="28rem"><ScoreBreakdown components={row.score_components} model={model} /></Box> : undefined}
          onRowDoubleClick={(row) => history.push('/admin/crm/customers/' + row.party_id)}
          rowHint={t('crm.analysis.openCustomerHint')}
          storageKey={PAGE + '/snapshots'}
        />
      </Box>
    </Box>
  );
}

function MetricsTab({ refDate }) {
  const t = useT();
  const meta = useCrmMeta();
  const definitions = meta.metric_definitions || [];
  const [metric, setMetric] = useState(null);
  const chosen = definitions.filter((definition) => String(definition.metric_definition_id) === String(metric))[0] || definitions[0] || {};

  const list = useList((params) => crm.analysis.metrics(params), { page: 1, limit: 25, dir: 'desc' });

  useEffect(() => {
    if (chosen.metric_definition_id) list.setFilter({ metric_definition_id: chosen.metric_definition_id, reference_date: refDate || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen.metric_definition_id, refDate]);

  const show = (row) => {
    if (row.value_type === 'BOOLEAN') return row.boolean_value ? t('common.yes') : '-';
    if (row.value_type === 'DATE') return date(row.date_value);
    if (row.value_type === 'TEXT') return row.text_value;
    return number(row.numeric_value, row.unit_code === 'SCORE' ? 4 : 0);
  };

  return (
    <Box>
      <Flex px={5} py={3} align="center" wrap="wrap">
        <Box w={{ base: '100%', md: '20rem' }} mr={4} mb={{ base: 2, md: 0 }}>
          <SelectField
            size="sm" isClearable={false}
            value={chosen.metric_definition_id || null}
            options={translateOptions(t, definitions.map((definition) => ({ value: definition.metric_definition_id, label: definition.metric_name })))}
            onChange={(value) => setMetric(value)}
          />
        </Box>
        {chosen.description ? <Text fontSize="xs" flex="1" minW="16rem">{t(chosen.description)}</Text> : null}
      </Flex>
      <Box px="0.5rem" pb="0.5rem">
        <DataTable
          columns={[
            { key: 'party_name', label: 'Customer', render: (row) => (row.party_name || '-') + '  ' + (row.party_no || '') },
            { key: 'numeric_value', label: 'Value', isNumeric: true, render: show },
            { key: 'unit_code', label: 'Unit', render: (row) => row.unit_code || '-' },
            { key: 'reference_date', label: 'Reference date', render: (row) => date(row.reference_date) },
            { key: 'model_version', label: 'Model' }
          ]}
          rows={list.rows}
          loading={list.loading}
          page={list.params.page}
          limit={list.params.limit}
          total={list.total}
          dir={list.params.dir}
          sort="numeric_value"
          onSort={() => list.setSort('numeric_value')}
          onPageChange={list.setPage}
          onLimitChange={(limit) => list.setFilter({ limit: limit })}
          rowKey={(row) => row.party_metric_value_id || row.id}
        />
      </Box>
    </Box>
  );
}

function ModelTab({ model, grades }) {
  const t = useT();
  const surface = useSurface();
  const parts = (model && model.parts) || {};
  const rows = [
    ['value', 'crm.analysis.partValue'], ['frequency', 'crm.analysis.partFrequency'], ['recency', 'crm.analysis.partRecency'],
    ['breadth', 'crm.analysis.partBreadth'], ['ownership', 'crm.analysis.partOwnership'], ['care', 'crm.analysis.partCare']
  ];
  return (
    <Grid templateColumns={{ base: '1fr', xl: '3fr 2fr' }} gridGap={4}>
      <Panel title={t('crm.analysis.theSixParts', { model: (model && model.version) || '' })}>
        <Stack spacing={3} p={4}>
          <Text fontSize="sm" color={surface.muted}>{t('crm.analysis.modelIntro')}</Text>
          {rows.map((part) => (
            <Flex key={part[0]} align="flex-start">
              <Box w="3rem" flexShrink={0} fontWeight="700" fontSize="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {parts[part[0]] ? parts[part[0]].weight : '-'}
              </Box>
              <Text fontSize="sm">{t(part[1])}</Text>
            </Flex>
          ))}
        </Stack>
      </Panel>
      <Panel title={t('crm.analysis.gradeBands')}>
        <InfoList items={grades.map((grade) => ({
          label: grade.grade_code + '  ' + t(grade.grade_name),
          value: number(grade.min_score) + ' - ' + (grade.max_score === null ? '100' : number(grade.max_score))
        }))} />
        <Text fontSize="xs" color={surface.muted} px={4} py={3}>{t('crm.analysis.bandsAreBasicData')}</Text>
      </Panel>
    </Grid>
  );
}
