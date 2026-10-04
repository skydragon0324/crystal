import React, { useCallback, useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { Box, Button, Flex, Grid, HStack, Progress, SimpleGrid, Stack, Text, useToast } from '@chakra-ui/react';
import * as Md from 'react-icons/md';

import Card from '../../components/Card';
import DataTable from '../../components/DataTable';
import StatTile from '../../components/StatTile';
import { useConfirm } from '../../components/ConfirmDialog';
import usePermission from '../../hooks/usePermission';
import { crm } from '../../api';
import { useT } from '../../i18n';
import { date, money, number } from '../../utils/format';
import { amount } from './shared';
import { Amount, Dot, GradeBadge, Kpi, KpiStrip, Panel, ProjectTags } from './ui';

export const PAGE = '/admin/crm/overview';

/**
 * THE CRM AT A GLANCE, and the one button that fills it.
 *
 * Every figure here is read live from the CRM's own tables - the point is to
 * see whether the CRM agrees with the rest of the console, so nothing on this
 * screen is cached or estimated.
 *
 * The top half is the Dream-wide picture from the latest analysis run - how
 * many customers sit in each corporate grade, how active they are and which
 * project their spend comes from. The tiles under it are the day-to-day
 * counts, each opening its own screen.
 *
 * "Import and analyse" runs the project adapters in order - Crystal (members,
 * service centres, products, registrations, points, repair tickets and
 * payments), then the vendor projects (Eshop orders and card levels, Appstore
 * purchases and licences) - and then the analysis. Every adapter only reads
 * its project, and running it twice is the same as running it once.
 */
export default function Overview() {
  const translate = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const history = useHistory();
  const { canWrite } = usePermission(PAGE);

  const [data, setData] = useState(null);
  const [dream, setDream] = useState(null);
  const [busy, setBusy] = useState(false);
  const [lastRun, setLastRun] = useState(null);

  const load = useCallback(() => {
    crm.overview().then(({ data: body }) => setData(body || {})).catch(() => setData({}));
    crm.analysis.summary().then(({ data: body }) => setDream(body || {})).catch(() => setDream({}));
  }, []);

  useEffect(() => { load(); }, [load]);

  const overview = data || {};
  const parties = overview.parties || {};
  const holdings = overview.holdings || {};
  const cases = overview.cases || {};
  const points = overview.points || {};
  const programs = overview.programs || {};
  const sites = overview.sites || {};
  const marketing = overview.marketing || {};

  const runImport = async () => {
    const agreed = await confirm({
      tone: 'info',
      title: translate('crm.overview.importAndAnalyse'),
      body: translate('crm.overview.importExplained'),
      confirmLabel: translate('crm.overview.import')
    });
    if (!agreed) return;

    setBusy(true);
    try {
      const { data: crystal } = await crm.importCrystal();
      const { data: vendor } = await crm.importVendor();
      const { data: analysed } = await crm.analysis.run();
      setLastRun(Object.assign({}, crystal || {}, vendor || {}, { analysis: { added: (analysed || {}).snapshots } }));
      toast({ title: translate('crm.overview.importFinished'), status: 'success', duration: 3000 });
      load();
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 8000, isClosable: true });
    } finally {
      setBusy(false);
    }
  };

  const recalculate = async () => {
    setBusy(true);
    try {
      await crm.recalculate();
      toast({ title: translate('crm.overview.recalculated'), status: 'success', duration: 2500 });
      load();
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 6000, isClosable: true });
    } finally {
      setBusy(false);
    }
  };

  const summaryRows = Object.keys(lastRun || {}).map((step) => {
    const stepResult = lastRun[step] || {};
    return { step: step, added: stepResult.added !== undefined ? stepResult.added : stepResult.rows, updated: stepResult.updated };
  });

  return (
    <Stack spacing={5}>
      <Card bodyProps={false}>
        <HStack px={5} py={4} justify="space-between" wrap="wrap" spacing={4}>
          <Text fontSize="sm" maxW="46rem">{translate('crm.overview.intro')}</Text>
          {canWrite ? (
            <HStack spacing={2}>
              <Button size="sm" variant="subtle" isLoading={busy} onClick={recalculate}>
                {translate('crm.overview.recalculate')}
              </Button>
              <Button size="sm" variant="brand" isLoading={busy} onClick={runImport}>
                {translate('crm.overview.importAndAnalyse')}
              </Button>
            </HStack>
          ) : null}
        </HStack>
      </Card>

      {summaryRows.length ? (
        <Card title={translate('crm.overview.lastImport')}>
          <DataTable
            rows={summaryRows}
            rowKey={(row) => row.step}
            hidePagination
            columns={[
              { key: 'step', label: 'Step', render: (row) => row.step },
              { key: 'added', label: 'Added', isNumeric: true, render: (row) => number(row.added) },
              { key: 'updated', label: 'Updated', isNumeric: true, render: (row) => (row.updated === undefined ? '-' : number(row.updated)) }
            ]}
          />
        </Card>
      ) : null}

      <DreamPicture summaryData={dream || {}} onOpen={(path) => history.push(path)} />

      <SimpleGrid columns={{ base: 1, sm: 2, xl: 4 }} spacing={4}>
        <StatTile
          label="Active customers" value={number(parties.active)} icon={Md.MdPeopleOutline}
          hint={translate('crm.overview.newIn30Days', { n: number(parties.new_30d) })}
          onClick={() => history.push('/admin/crm/customers')}
        />
        <StatTile
          label="Possible duplicates" value={number(parties.duplicates)} icon={Md.MdMergeType}
          tone={parties.duplicates > 0 ? 'serious' : 'good'}
          onClick={() => history.push('/admin/crm/customers?tab=duplicates')}
        />
        <StatTile
          label="Products held" value={number(holdings.current)} icon={Md.MdDevicesOther}
          hint={translate('crm.overview.openTransfers', { n: number(holdings.open_transfers) })}
          onClick={() => history.push('/admin/crm/products')}
        />
        <StatTile
          label="Open service cases" value={number(cases.open)} icon={Md.MdHeadset}
          tone={cases.overdue > 0 ? 'critical' : undefined}
          hint={translate('crm.overview.overdueCount', { n: number(cases.overdue) })}
          onClick={() => history.push('/admin/crm/service-cases')}
        />
        <StatTile
          label="Points outstanding" value={amount(points.outstanding, 0)} icon={Md.MdStars}
          hint={translate('crm.overview.pointsIn30Days', { earned: amount(points.earned_30d, 0), spent: amount(points.spent_30d, 0) })}
          tone={points.drifted > 0 ? 'critical' : undefined}
          onClick={() => history.push('/admin/crm/points')}
        />
        <StatTile
          label="Programs running" value={number(programs.running)} icon={Md.MdEventAvailable}
          hint={translate('crm.overview.openEntries', { n: number(programs.reservations_open), awards: number(programs.awards_open) })}
          onClick={() => history.push('/admin/crm/programs')}
        />
        <StatTile
          label="Location activity (30 days)" value={number(sites.activities_30d)} icon={Md.MdTimeline}
          hint={translate('crm.overview.sitesAndEvents', { sites: number(sites.active), events: number(sites.events_ahead) })}
          onClick={() => history.push('/admin/crm/site-activity')}
        />
        <StatTile
          label="Live campaigns" value={number(marketing.campaigns_live)} icon={Md.MdRecordVoiceOver}
          hint={translate('crm.overview.segmentsCount', { n: number(marketing.segments) })}
          onClick={() => history.push('/admin/crm/campaigns')}
        />
      </SimpleGrid>

      <SimpleGrid columns={{ base: 1, xl: 3 }} spacing={4}>
        <Card title={translate('crm.overview.customersByProject')}>
          <DataTable
            rows={overview.by_project || []}
            rowKey={(row) => row.project_code}
            hidePagination
            columns={[
              { key: 'project_code', label: 'Project' },
              { key: 'parties', label: 'Customers', isNumeric: true, render: (row) => number(row.parties) }
            ]}
          />
        </Card>
        <Card title={translate('crm.overview.holdingsByClass')}>
          <DataTable
            rows={overview.by_class || []}
            rowKey={(row) => row.class_code}
            hidePagination
            columns={[
              { key: 'class_name', label: 'Product class', render: (row) => translate(row.class_name) },
              { key: 'owners', label: 'Owners', isNumeric: true, render: (row) => number(row.owners) },
              { key: 'owned', label: 'Held', isNumeric: true, render: (row) => number(row.owned) }
            ]}
          />
        </Card>
        <Card title={translate('crm.overview.activityIn30Days')}>
          <Box>
            <DataTable
              rows={overview.recent_activity || []}
              rowKey={(row) => row.activity_code}
              hidePagination
              columns={[
                { key: 'activity_name', label: 'Activity', render: (row) => translate(row.activity_name) },
                { key: 'cnt', label: 'Count', isNumeric: true, render: (row) => number(row.cnt) }
              ]}
            />
          </Box>
        </Card>
      </SimpleGrid>
    </Stack>
  );
}

/** The latest analysis run, Dream-wide. */
function DreamPicture({ summaryData, onOpen }) {
  const translate = useT();
  const totals = summaryData.totals || {};
  const grades = summaryData.grades || [];
  const activity = summaryData.activity || [];
  const projects = summaryData.projects || [];
  const most = Math.max.apply(null, grades.map((grade) => grade.parties).concat([1]));

  if (!summaryData.reference_date) {
    return <Card><Text fontSize="sm">{translate('crm.analysis.notRunYet')}</Text></Card>;
  }

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
      <Grid templateColumns={{ base: '1fr', xl: '1fr 1fr 1fr' }} gridGap={4}>
        <Panel title={translate('crm.analysis.gradeDistribution')}
          action={<Button size="xs" variant="ghost" onClick={() => onOpen('/admin/crm/analysis')}>{translate('crm.overview.openAnalysis')}</Button>}>
          <Stack spacing={2.5} px={4} py={3}>
            {grades.map((grade) => (
              <Flex key={grade.grade_code} align="center" cursor="pointer" onClick={() => onOpen('/admin/crm/customers?grade=' + grade.corporate_grade_id)}>
                <Box w="3.2rem"><GradeBadge code={grade.grade_code} /></Box>
                <Box flex="1" mx={2}><Progress value={(grade.parties / most) * 100} size="sm" borderRadius="full" colorScheme="brand" /></Box>
                <Text w="3rem" textAlign="right" fontSize="sm" fontWeight="600" style={{ fontVariantNumeric: 'tabular-nums' }}>{number(grade.parties)}</Text>
              </Flex>
            ))}
          </Stack>
        </Panel>
        <Panel title={translate('crm.analysis.activity')}>
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
        <Panel title={translate('crm.analysis.spendByProject')}>
          <DataTable
            hidePagination
            rows={projects}
            rowKey={(row) => row.project_id}
            columns={[
              { key: 'project_code', label: 'Project', render: (row) => <ProjectTags codes={[row.project_code]} /> },
              { key: 'parties', label: 'Customers', isNumeric: true, render: (row) => number(row.parties) },
              { key: 'spend_12m', label: 'Spend, 12 months', isNumeric: true, render: (row) => <Amount value={row.spend_12m} /> }
            ]}
          />
        </Panel>
      </Grid>
    </Stack>
  );
}
