import React, { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { Box, Flex, Grid, HStack, Icon, SimpleGrid, Stack, Text, useColorMode, useColorModeValue } from '@chakra-ui/react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis
} from 'recharts';
import * as Md from 'react-icons/md';

import Card from '../../components/Card';
import SelectField from '../../components/SelectField';
import { crm } from '../../api';
import { useT } from '../../i18n';
import { useSurface, trendOf } from '../../theme/tokens';
import { vizPalette, vizTooltip } from '../../theme/viz';
import { number, percent, since } from '../../utils/format';
import { Pending, optionsFrom, useCrmMeta } from './shared';

export const PAGE = '/admin/crm/overview';

const CUSTOMERS = '/admin/crm/customers';
const CASES = '/admin/crm/service-cases';

/**
 * THE COMPANY AT A GLANCE, for a period and optionally one project.
 *
 *   six headline figures, each against the period before
 *   how the customer base grew, who deals with which project, the grades
 *   what is waiting on a person
 *   transactions per project, service cases in and out
 *   what happened lately, and whether every project's data is still arriving
 *
 * Every figure is read live and opens the screen that lists it. Projects are
 * whatever Settings > Projects holds; a project keeps its colour on every
 * chart because colours follow the project's place in that list.
 */
export default function Overview() {
  const translate = useT();
  const history = useHistory();
  const surface = useSurface();
  const meta = useCrmMeta();
  const [days, setDays] = useState(30);
  const [projectId, setProjectId] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    crm.overview({ days: days, project_id: projectId || undefined })
      .then(({ data: body }) => setData(body || {})).catch(() => setData({}));
  }, [days, projectId]);

  const open = (path) => history.push(path);

  const periods = [
    { value: 7, label: translate('crm.overview.last7Days') },
    { value: 30, label: translate('crm.overview.last30Days') },
    { value: 90, label: translate('crm.overview.last90Days') },
    { value: 365, label: translate('crm.overview.last12Months') }
  ];

  return (
    <Stack spacing={4}>
      <Flex justify="space-between" align="center" wrap="wrap" gap={3} data-gap="12" data-gap-wrap>
        <Text fontSize="sm" color={surface.muted}>{translate('crm.overview.lead')}</Text>
        <HStack spacing={2}>
          <Box minW="9.5rem">
            <SelectField size="sm" options={periods} value={days} onChange={(value) => setDays(value || 30)} />
          </Box>
          <Box minW="10.5rem">
            <SelectField size="sm" isClearable placeholder={translate('crm.overview.allProjects')}
              options={optionsFrom(meta.projects, 'project_id', 'project_name')} value={projectId}
              onChange={(value) => setProjectId(value || null)} />
          </Box>
        </HStack>
      </Flex>

      {!data ? <Pending loading /> : <Board data={data} onOpen={open} />}
    </Stack>
  );
}

function Board({ data, onOpen }) {
  const translate = useT();
  const surface = useSurface();
  const projects = data.projects || [];

  if (!projects.length) {
    return <Card><Text fontSize="sm" color={surface.muted}>{translate('crm.overview.noProjects')}</Text></Card>;
  }

  return (
    <Stack spacing={4}>
      <Kpis kpis={data.kpis || {}} onOpen={onOpen} />
      <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr', '2xl': '1.35fr 1fr 1fr 1fr' }} gridGap={4}>
        <GrowthChart trends={data.trends || {}} />
        <ProjectDonut projects={projects} total={(data.kpis || {}).customers} />
        <GradeDonut grades={data.grades || []} onOpen={onOpen} />
        <NeedsAttention attention={data.attention || {}} onOpen={onOpen} />
      </Grid>
      <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr', '2xl': '1.35fr 1fr 1fr 1fr' }} gridGap={4}>
        <TransactionsChart trends={data.trends || {}} projects={projects} />
        <CasesChart trends={data.trends || {}} />
        <RecentActivities recent={data.recent || []} />
        <IntegrationStatus projects={projects} onOpen={onOpen} />
      </Grid>
    </Stack>
  );
}

/* ------------------------------------------------------------------ headline figures */

/** A change in percent against the period before, or nothing when there is no earlier figure. */
function change(current, prior) {
  const before = Number(prior);
  if (!before) return null;
  return Math.round(((Number(current) - before) / before) * 1000) / 10;
}

function Kpis({ kpis, onOpen }) {
  const translate = useT();
  const items = [
    { address: 'crm.overview.activeCustomers', note: 'crm.overview.totalUniqueCustomers', icon: Md.MdPeopleOutline, scheme: 'blue',
      value: kpis.customers, prior: kpis.customers_prior, path: CUSTOMERS },
    { address: 'crm.overview.totalTransactions', note: 'crm.overview.inThePeriod', icon: Md.MdShoppingCart, scheme: 'blue',
      value: kpis.transactions, prior: kpis.transactions_prior, path: '/admin/crm/transactions' },
    { address: 'crm.overview.productRegistrations', note: 'crm.overview.activeHoldings', icon: Md.MdDevicesOther, scheme: 'blue',
      value: kpis.registrations, prior: kpis.registrations_prior, path: '/admin/crm/products' },
    { address: 'crm.overview.memberships', note: 'crm.overview.activeMemberships', icon: Md.MdCardMembership, scheme: 'orange',
      value: kpis.memberships, prior: kpis.memberships_prior, path: '/admin/crm/memberships' },
    { address: 'crm.overview.serviceCases', note: 'crm.overview.newCases', icon: Md.MdHeadset, scheme: 'purple',
      value: kpis.cases, prior: kpis.cases_prior, path: CASES, higherIsBetter: false },
    { address: 'crm.overview.campaignReach', note: 'crm.overview.customersReached', icon: Md.MdRecordVoiceOver, scheme: 'pink',
      value: kpis.reach, prior: kpis.reach_prior, path: '/admin/crm/campaigns' }
  ];
  return (
    <SimpleGrid columns={{ base: 1, sm: 2, lg: 3, '2xl': 6 }} spacing={4}>
      {items.map((item) => (
        <KpiCard key={item.address} item={item} label={translate(item.address)} caption={translate(item.note)} onOpen={onOpen} />
      ))}
    </SimpleGrid>
  );
}

function KpiCard({ item, label, caption, onOpen }) {
  const surface = useSurface();
  const tint = useColorModeValue(item.scheme + '.50', 'whiteAlpha.100');
  const ink = useColorModeValue(item.scheme + '.500', item.scheme + '.300');
  const delta = change(item.value, item.prior);
  const trend = delta === null ? null : trendOf(delta, item.higherIsBetter !== false);

  return (
    <Flex bg={surface.card} borderWidth="1px" borderColor={surface.border} borderRadius="card" p={4} gap={3} data-gap="12"
      cursor="pointer" onClick={() => onOpen(item.path)} _hover={{ borderColor: 'brand.400' }} transition="border-color 120ms ease">
      <Flex w="2.75rem" h="2.75rem" flexShrink={0} align="center" justify="center" borderRadius="lg" bg={tint}>
        <Icon as={item.icon} boxSize="1.4rem" color={ink} />
      </Flex>
      <Box minW={0}>
        <Text fontSize="xs" color={surface.muted} noOfLines={1}>{label}</Text>
        <Text fontSize="1.5rem" fontWeight="700" lineHeight="1.2" letterSpacing="-0.02em">{number(item.value)}</Text>
        <Box minH="1.1rem" mt={0.5}>
          {trend && trend.value !== 0 ? (
            <HStack spacing={0.5} color={trend.tone + '.500'}>
              <Icon as={trend.value > 0 ? Md.MdArrowDropUp : Md.MdArrowDropDown} boxSize="1.1rem" />
              <Text fontSize="xs" fontWeight="700">{Math.abs(trend.value)}%</Text>
            </HStack>
          ) : null}
        </Box>
        <Text fontSize="xs" color={surface.muted} noOfLines={1}>{caption}</Text>
      </Box>
    </Flex>
  );
}

/* ------------------------------------------------------------------ charts */

/** Month buckets read '25.11', week buckets '10.05' - the day the week starts. */
function bucketLabel(unit) {
  return function (bucket) { return unit === 'month' ? String(bucket).slice(2, 7).replace('-', '.') : String(bucket).slice(5).replace('-', '.'); };
}

/** The Monthly / Weekly switch every time chart carries. */
function useUnit() {
  const translate = useT();
  const [unit, setUnit] = useState('month');
  const control = (
    <Box minW="7.5rem">
      <SelectField size="sm" value={unit} onChange={(value) => setUnit(value || 'month')}
        options={[{ value: 'month', label: translate('crm.overview.monthly') }, { value: 'week', label: translate('crm.overview.weekly') }]} />
    </Box>
  );
  return [unit, control];
}

function useViz() {
  const { colorMode } = useColorMode();
  return vizPalette(colorMode);
}

/** A project's colour: its place in the project list, so it is the same on every chart. */
function projectColour(viz, projects, projectId) {
  const index = projects.findIndex((project) => project.project_id === projectId);
  return index >= 0 && index < viz.categorical.length ? viz.categorical[index] : viz.other;
}

function axes(viz, unit) {
  return [
    <CartesianGrid key="grid" stroke={viz.grid} strokeWidth={1} vertical={false} />,
    <XAxis key="x" dataKey="bucket" tick={{ fontSize: 10, fill: viz.textSecondary }} tickLine={false} axisLine={{ stroke: viz.grid }}
      tickFormatter={bucketLabel(unit)} interval="preserveStartEnd" minTickGap={16} />,
    <YAxis key="y" tick={{ fontSize: 10, fill: viz.textSecondary }} tickLine={false} axisLine={false} width={48}
      allowDecimals={false} tickFormatter={(value) => number(value)} />
  ];
}

function GrowthChart({ trends }) {
  const translate = useT();
  const viz = useViz();
  const [unit, control] = useUnit();
  const rows = (trends[unit] || {}).series || [];
  return (
    <Card title={translate('crm.overview.customerGrowth')} actions={control}>
      <Box h="14rem">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={viz.series1} stopOpacity={0.28} />
                <stop offset="100%" stopColor={viz.series1} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            {axes(viz, unit)}
            <Tooltip {...vizTooltip(viz)} labelFormatter={bucketLabel(unit)}
              formatter={(value) => [number(value), translate('crm.overview.customers')]} />
            <Area type="monotone" dataKey="customers" stroke={viz.series1} strokeWidth={2} fill="url(#growthFill)"
              dot={{ r: 3, fill: viz.series1, stroke: viz.surface, strokeWidth: 2 }} activeDot={{ r: 5, stroke: viz.surface, strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </Box>
    </Card>
  );
}

/** A ring with the total in its middle and a legend of shares beside it. */
function Donut({ slices, total, centre, onPick }) {
  const viz = useViz();
  const surface = useSurface();
  const sum = slices.reduce((all, slice) => all + slice.value, 0);
  return (
    <Flex align="center" gap={4} data-gap="16" wrap="wrap" data-gap-wrap>
      <Box position="relative" w="9.5rem" h="9.5rem" flexShrink={0}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="label" innerRadius="64%" outerRadius="98%" startAngle={90} endAngle={-270}
              stroke={viz.surface} strokeWidth={2} isAnimationActive={false}>
              {slices.map((slice) => (
                <Cell key={slice.key} fill={slice.colour} cursor={onPick ? 'pointer' : 'default'} onClick={onPick ? () => onPick(slice) : undefined} />
              ))}
            </Pie>
            <Tooltip {...vizTooltip(viz)} formatter={(value, name) => [number(value), name]} />
          </PieChart>
        </ResponsiveContainer>
        <Flex position="absolute" top={0} left={0} right={0} bottom={0} direction="column" align="center" justify="center" pointerEvents="none">
          <Text fontSize="lg" fontWeight="700" lineHeight="1.1">{number(total)}</Text>
          <Text fontSize="xs" color={surface.muted}>{centre}</Text>
        </Flex>
      </Box>
      <Stack spacing={1.5} flex="1" minW="9rem">
        {slices.map((slice) => (
          <Flex key={slice.key} align="center" fontSize="sm" cursor={onPick ? 'pointer' : 'default'} onClick={onPick ? () => onPick(slice) : undefined}>
            <Box w="0.6rem" h="0.6rem" borderRadius="full" bg={slice.colour} mr={2} flexShrink={0} />
            <Text flex="1" noOfLines={1}>{slice.label}</Text>
            <Text color={surface.muted} ml={2} style={{ fontVariantNumeric: 'tabular-nums' }}>{sum ? percent(slice.value / sum) : '-'}</Text>
          </Flex>
        ))}
      </Stack>
    </Flex>
  );
}

function ProjectDonut({ projects, total }) {
  const translate = useT();
  const surface = useSurface();
  const viz = useViz();
  const slices = projects.filter((project) => project.customers > 0).map((project) => ({
    key: project.project_id, label: translate(project.project_name), value: project.customers,
    colour: projectColour(viz, projects, project.project_id)
  }));
  return (
    <Card title={translate('crm.overview.customersByProject')} subtitle={translate('crm.overview.customersByProjectHint')}>
      {slices.length ? <Donut slices={slices} total={total} centre={translate('crm.overview.customers')} />
        : <Text fontSize="sm" color={surface.muted}>{translate('crm.overview.nothingYet')}</Text>}
    </Card>
  );
}

/* Grades are ranked, so one hue from dark (the top grade) to light. */
const GRADE_STEPS = ['#0d366b', '#1c5aa6', '#2a78d6', '#6fa6e6', '#b5d0f2', '#dbe8f8'];

function GradeDonut({ grades, onOpen }) {
  const translate = useT();
  const surface = useSurface();
  const slices = grades.filter((grade) => grade.parties > 0).map((grade, index) => ({
    key: grade.corporate_grade_id, label: grade.grade_code + '  ' + translate(grade.grade_name), value: grade.parties,
    colour: GRADE_STEPS[Math.min(index, GRADE_STEPS.length - 1)]
  }));
  const total = slices.reduce((all, slice) => all + slice.value, 0);
  return (
    <Card title={translate('crm.overview.gradeDistribution')}>
      {slices.length
        ? <Donut slices={slices} total={total} centre={translate('crm.overview.customers')} onPick={(slice) => onOpen(CUSTOMERS + '?grade=' + slice.key)} />
        : <Text fontSize="sm" color={surface.muted}>{translate('crm.overview.notAnalysedYet')}</Text>}
    </Card>
  );
}

function TransactionsChart({ trends, projects }) {
  const translate = useT();
  const surface = useSurface();
  const viz = useViz();
  const [unit, control] = useUnit();
  const series = (trends[unit] || {}).series || [];
  const counts = (trends[unit] || {}).transactions || [];
  const shown = projects.filter((project) => counts.some((row) => row.project_id === project.project_id));
  const rows = series.map((bucket) => {
    const row = { bucket: bucket.bucket };
    shown.forEach((project) => {
      const found = counts.filter((count) => count.bucket === bucket.bucket && count.project_id === project.project_id)[0];
      row['p' + project.project_id] = found ? found.transactions : 0;
    });
    return row;
  });
  return (
    <Card title={translate('crm.overview.transactionsByProject')} actions={control}>
      {shown.length ? (
        <Flex gap={3} data-gap="12" align="center">
          <Box h="14rem" flex="1" minW={0}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                {axes(viz, unit)}
                <Tooltip {...vizTooltip(viz)} cursor={{ fill: viz.grid }} labelFormatter={bucketLabel(unit)} />
                {shown.map((project, index) => (
                  <Bar key={project.project_id} dataKey={'p' + project.project_id} name={translate(project.project_name)} stackId="all"
                    fill={projectColour(viz, projects, project.project_id)} stroke={viz.surface} strokeWidth={1} maxBarSize={22}
                    radius={index === shown.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </Box>
          <Stack spacing={1.5} minW="7rem" display={{ base: 'none', md: 'flex' }}>
            {shown.map((project) => (
              <HStack key={project.project_id} spacing={2} fontSize="xs">
                <Box w="0.6rem" h="0.6rem" borderRadius="sm" bg={projectColour(viz, projects, project.project_id)} />
                <Text noOfLines={1}>{translate(project.project_name)}</Text>
              </HStack>
            ))}
          </Stack>
        </Flex>
      ) : <Text fontSize="sm" color={surface.muted}>{translate('crm.overview.nothingYet')}</Text>}
    </Card>
  );
}

function CasesChart({ trends }) {
  const translate = useT();
  const viz = useViz();
  const [unit, control] = useUnit();
  const rows = (trends[unit] || {}).series || [];
  return (
    <Card title={translate('crm.overview.serviceCasesTrend')} actions={control}>
      <HStack spacing={4} fontSize="xs" mb={1}>
        <HStack spacing={1.5}><Box w="0.9rem" h="2px" bg={viz.series1} /><Text>{translate('crm.overview.received')}</Text></HStack>
        <HStack spacing={1.5}><Box w="0.9rem" h="2px" bg={viz.series2} /><Text>{translate('crm.overview.closed')}</Text></HStack>
      </HStack>
      <Box h="13rem">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            {axes(viz, unit)}
            <Tooltip {...vizTooltip(viz)} cursor={{ stroke: viz.axis, strokeWidth: 1 }} labelFormatter={bucketLabel(unit)} />
            <Line type="monotone" dataKey="received" name={translate('crm.overview.received')} stroke={viz.series1} strokeWidth={2}
              dot={{ r: 3, fill: viz.series1, stroke: viz.surface, strokeWidth: 2 }} activeDot={{ r: 5 }} />
            <Line type="monotone" dataKey="closed" name={translate('crm.overview.closed')} stroke={viz.series2} strokeWidth={2}
              dot={{ r: 3, fill: viz.series2, stroke: viz.surface, strokeWidth: 2 }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </Card>
  );
}

/* ------------------------------------------------------------------ lists */

/** A tinted square holding an icon, as the mockup's list rows have. */
function Badge({ icon, scheme }) {
  const tint = useColorModeValue(scheme + '.50', 'whiteAlpha.100');
  const ink = useColorModeValue(scheme + '.500', scheme + '.300');
  return (
    <Flex w="1.9rem" h="1.9rem" borderRadius="md" bg={tint} align="center" justify="center" mr={3} flexShrink={0}>
      <Icon as={icon} color={ink} boxSize="1.05rem" />
    </Flex>
  );
}

function NeedsAttention({ attention, onOpen }) {
  const translate = useT();
  const surface = useSurface();
  const items = [
    { address: 'crm.overview.pendingRegistrations', n: attention.registrations, icon: Md.MdWarning, scheme: 'red', path: CUSTOMERS + '?tab=pending' },
    { address: 'crm.overview.accountAssignments', n: attention.assignments, icon: Md.MdPeopleOutline, scheme: 'blue', path: CUSTOMERS + '?tab=assignments' },
    { address: 'crm.overview.possibleDuplicates', n: attention.duplicates, icon: Md.MdMergeType, scheme: 'orange', path: CUSTOMERS + '?tab=duplicates' },
    { address: 'crm.overview.openServiceCases', n: attention.open_cases, icon: Md.MdHeadset, scheme: 'purple', path: CASES },
    { address: 'crm.overview.overdueServiceCases', n: attention.overdue_cases, icon: Md.MdAlarm, scheme: 'red', path: CASES + '?overdue=1' },
    { address: 'crm.overview.importErrors', n: attention.import_errors, icon: Md.MdErrorOutline, scheme: 'green', path: CUSTOMERS + '?tab=import-errors' }
  ];
  return (
    <Card title={translate('crm.overview.needsAttention')}>
      <Stack spacing={0}>
        {items.map((item) => (
          <Flex key={item.address} align="center" py={2} px={1} borderRadius="md" cursor="pointer" onClick={() => onOpen(item.path)}
            _hover={{ bg: surface.hover }}>
            <Badge icon={item.icon} scheme={item.scheme} />
            <Text fontSize="sm" flex="1" noOfLines={1}>{translate(item.address)}</Text>
            <Text fontSize="sm" fontWeight="700" ml={2} style={{ fontVariantNumeric: 'tabular-nums' }}>{number(item.n)}</Text>
          </Flex>
        ))}
      </Stack>
    </Card>
  );
}

const RECENT = {
  CUSTOMER: { icon: Md.MdPersonAdd, scheme: 'blue', text: 'crm.overview.activityCustomer' },
  CASE: { icon: Md.MdHeadset, scheme: 'purple', text: 'crm.overview.activityCase' },
  REGISTRATION: { icon: Md.MdDevicesOther, scheme: 'green', text: 'crm.overview.activityRegistration' },
  TIER: { icon: Md.MdCardMembership, scheme: 'orange', text: 'crm.overview.activityTier' },
  CAMPAIGN: { icon: Md.MdRecordVoiceOver, scheme: 'pink', text: 'crm.overview.activityCampaign' }
};

function RecentActivities({ recent }) {
  const translate = useT();
  const surface = useSurface();
  return (
    <Card title={translate('crm.overview.recentActivities')}>
      {recent.length ? (
        <Stack spacing={0}>
          {recent.map((row, index) => {
            const look = RECENT[row.kind] || RECENT.CUSTOMER;
            return (
              <Flex key={row.kind + index} align="center" py={1.5}>
                <Badge icon={look.icon} scheme={look.scheme} />
                <Text fontSize="xs" color={surface.muted} w="4.5rem" flexShrink={0}>{translate('crm.overview.ago', { ago: since(row.at) })}</Text>
                <Text fontSize="sm" noOfLines={1}>{translate(look.text, { name: row.label || '-', project: row.project_code || '-' })}</Text>
              </Flex>
            );
          })}
        </Stack>
      ) : <Text fontSize="sm" color={surface.muted}>{translate('crm.overview.nothingYet')}</Text>}
    </Card>
  );
}

const DAY = 86400000;

/** How fresh a project's data is: within two days healthy, within a week a warning, older stale. */
function health(project) {
  if (project.status === 'INACTIVE') return { colour: 'gray.400', address: 'crm.overview.inactive' };
  if (!project.last_data_at) return { colour: 'gray.400', address: 'crm.overview.noData' };
  const age = Date.now() - new Date(project.last_data_at).getTime();
  if (age <= 2 * DAY) return { colour: 'green.400', address: 'crm.overview.healthy' };
  if (age <= 7 * DAY) return { colour: 'orange.400', address: 'crm.overview.warning' };
  return { colour: 'red.400', address: 'crm.overview.stale' };
}

function IntegrationStatus({ projects, onOpen }) {
  const translate = useT();
  const surface = useSurface();
  return (
    <Card title={translate('crm.overview.integrationStatus')}
      actions={<Text as="button" fontSize="xs" color="brand.500" fontWeight="600" onClick={() => onOpen('/admin/crm/settings')}>{translate('crm.overview.viewAll')}</Text>}>
      <Grid templateColumns="1.4fr 1fr 1fr" fontSize="xs" color={surface.muted} pb={1.5} borderBottomWidth="1px" borderColor={surface.border}>
        <Text>{translate('crm.overview.project')}</Text>
        <Text>{translate('crm.overview.status')}</Text>
        <Text>{translate('crm.overview.lastRegistration')}</Text>
      </Grid>
      {projects.map((project) => {
        const state = health(project);
        return (
          <Grid key={project.project_id} templateColumns="1.4fr 1fr 1fr" fontSize="sm" py={1.5} alignItems="center">
            <Text noOfLines={1}>{translate(project.project_name)}</Text>
            <HStack spacing={1.5}>
              <Box w="0.5rem" h="0.5rem" borderRadius="full" bg={state.colour} />
              <Text>{translate(state.address)}</Text>
            </HStack>
            <Text color={surface.muted} fontSize="xs">
              {project.last_registration_at ? translate('crm.overview.ago', { ago: since(project.last_registration_at) }) : '-'}
            </Text>
          </Grid>
        );
      })}
    </Card>
  );
}
