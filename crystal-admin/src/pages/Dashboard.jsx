import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory, useLocation } from 'react-router-dom';
import {
  Alert, AlertDescription, AlertIcon, AlertTitle, Box, Button, Center, Flex, Grid, HStack,
  SimpleGrid, Spacer, Spinner, Text, useColorMode, useColorModeValue
} from '@chakra-ui/react';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis
} from 'recharts';
import * as Md from 'react-icons/md';

import Card from '../components/Card';
import StatTile from '../components/StatTile';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import { dashboard } from '../api';
import { loadCertificates, selectCertificates } from '../app/certificatesSlice';
import { useT } from '../i18n';
import { useSurface } from '../theme/tokens';
import { vizPalette, vizTooltip } from '../theme/viz';
import {
  CERTIFICATES_ANCHOR, STATUS_SCHEME, certificatesAsOf, isUrgent
} from '../utils/certificates';
import { dateMinute, money, number, trend } from '../utils/format';

/**
 * The front page.
 *
 * Two charts and no more.  Everything else here is either a stat tile - a
 * number that is the whole story, and would be a one-bar chart if it were
 * drawn - or a table, because "which eight tickets are late" is a list of
 * eight things and no chart says it better.
 */
export default function Dashboard() {
  const t = useT();
  const history = useHistory();
  const { colorMode } = useColorMode();
  const viz = vizPalette(colorMode);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    dashboard.overview()
      .then(({ data: body }) => { if (!cancelled) setData(body); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <Center py={20}><Spinner size="lg" thickness="3px" color="brand.500" /></Center>;
  }
  if (!data) {
    /* The certificates come from their own endpoint, so a failed overview does not take them with it. */
    return (
      <Box>
        <CertificateAlert />
        <Card><Text fontSize="sm">{t('dashboard.theDashboardCouldNotBe')}</Text></Card>
        <Box mt={5}><SigningCertificates /></Box>
      </Box>
    );
  }

  const c = data.counters;

  /*
   * The sparklines come from the SAME thirty days the chart below draws.
   *
   * Nothing here is a second measurement of anything: a tile carries a line
   * only where the API already sends the series behind it, so what the
   * texture shows and what the chart shows can never disagree.
   */
  const sparkOf = (key) => (data.daily || []).map((row) => ({ value: row[key] }));

  return (
    <Box>
      <CertificateAlert />

      <SimpleGrid columns={{ base: 2, md: 3, xl: 6 }} spacing={4} mb={5}>
        <StatTile
          label="Open repairs" value={number(c.open_cnt)} icon={Md.MdBuild}
          series={sparkOf('received_cnt')}
          onClick={() => history.push('/admin/service/tickets?open=1')}
        />
        <StatTile
          label="Overdue" value={number(c.overdue_cnt)} icon={Md.MdWarning}
          tone={c.overdue_cnt > 0 ? 'critical' : 'good'}
          hint={t('dashboard.pastThePromisedDate')}
          onClick={() => history.push('/admin/service/tickets?overdue=1')}
        />
        <StatTile
          label="Waiting for parts" value={number(c.waiting_parts_cnt)} icon={Md.MdStorage}
          tone={c.waiting_parts_cnt > 0 ? 'serious' : undefined}
        />
        <StatTile
          label="Ready for collection" value={number(c.ready_cnt)} icon={Md.MdCheckCircle}
          series={sparkOf('closed_cnt')}
        />
        <StatTile label="Taken in today" value={number(c.today_cnt)} icon={Md.MdInput} />
        <StatTile
          label="Charged this month" value={money(c.revenue_mtd)} icon={Md.MdAttachMoney}
          hint={t('common.covered', { amount: money(c.covered_mtd) })}
          series={sparkOf('charged_amount')}
        />
      </SimpleGrid>

      <Grid templateColumns={{ base: '1fr', xl: '3fr 2fr' }} gap={5} mb={5}>
        <DailyChart rows={data.daily} viz={viz} />
        <StatusChart rows={data.statuses} viz={viz} />
      </Grid>

      <Grid templateColumns={{ base: '1fr', xl: '1fr 1fr' }} gap={5}>
        <OverdueTable rows={data.overdue} onOpen={(row) => history.push('/admin/service/tickets/' + row.id)} />

        <Box>
          {data.risky_agencies.length > 0 && (
            <Box mb={5}><RiskyAgencies rows={data.risky_agencies} /></Box>
          )}
          {data.defect_alerts.length > 0 && <DefectAlerts rows={data.defect_alerts} />}
        </Box>
      </Grid>

      {/*
        * LAST ON THE PAGE WHILE THERE IS NOTHING TO DO. A certificate with
        * months left is a fact to check now and then, not the first thing a
        * service manager should read - and when one is in its last week the
        * banner at the top says so and brings the reader down here.
        */}
      <Box mt={5}><SigningCertificates /></Box>
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/*  the signing certificates                                           */
/* ------------------------------------------------------------------ */

const CERTIFICATE_STATUS = {
  ok: 'dashboard.certificates.statusOk',
  warning: 'dashboard.certificates.statusWarning',
  critical: 'dashboard.certificates.statusCritical',
  expired: 'dashboard.certificates.statusExpired'
};

const CERTIFICATE_ROLE = {
  active: 'dashboard.certificates.roleActive',
  previous: 'dashboard.certificates.rolePrevious',
  'member-ca': 'dashboard.certificates.roleMemberCa'
};

const CERTIFICATE_SOURCE = {
  p12: 'dashboard.certificates.sourceP12',
  'key-dir': 'dashboard.certificates.sourceKeyDir',
  'member-ca-rsa': 'dashboard.certificates.sourceMemberCaRsa',
  'member-ca-ecc': 'dashboard.certificates.sourceMemberCaEcc'
};

const CERTIFICATE_PROBLEM = {
  unreadable: 'dashboard.certificates.problemUnreadable',
  'no-certificates': 'dashboard.certificates.problemNoCertificates',
  'openssl-missing': 'dashboard.certificates.problemOpensslMissing'
};

function showCertificates(history) {
  history.push({ pathname: '/admin/dashboard', hash: '#' + CERTIFICATES_ANCHOR });
}

/**
 * THE ONE THING ON THIS PAGE THAT CAN STOP THE WEBSITE, when it is about to.
 *
 * A signing certificate in its last week, or past it, is not a row to be
 * found at the bottom of a page: after the API's next restart nothing new is
 * signed, and every console save that signs fails. So it is said at the top,
 * in red, before the repair figures - naming which certificate and when - and
 * the button takes the reader to the card with the rest.
 *
 * The active certificate and the member sign-in's CAs only. A PREVIOUS key
 * running out is expected, and changes nothing: what it signed was signed
 * while it was valid, and it keeps verifying.
 *
 * It reads what the card below fetched; it asks for nothing itself.
 */
export function CertificateAlert() {
  const t = useT();
  const history = useHistory();
  const { report, receivedAt } = useSelector(selectCertificates);

  const urgent = certificatesAsOf(report, receivedAt, Date.now())
    .filter((certificate) => certificate.role !== 'previous' && isUrgent(certificate.status));

  if (!urgent.length) return null;

  return (
    <Alert status="error" variant="left-accent" borderRadius="card" mb={5} alignItems="flex-start" data-testid="certificate-alert">
      <AlertIcon mt="0.125rem" />
      <Box flex="1" minW="0">
        <AlertTitle fontSize="sm">{t('dashboard.certificates.alertTitle')}</AlertTitle>
        {urgent.map((certificate) => (
          <AlertDescription
            key={[certificate.role, certificate.keyId, certificate.source, certificate.subject, certificate.notAfter].join('|')}
            display="block"
            fontSize="sm"
          >
            {t(certificate.status === 'expired' ? 'dashboard.certificates.alertExpired' : 'dashboard.certificates.alertCritical', {
              name: certificate.keyId || certificate.subjectCN || certificate.subject,
              date: dateMinute(certificate.notAfter)
            })}
          </AlertDescription>
        ))}
        <Button variant="link" size="sm" colorScheme="red" mt="0.375rem" onClick={() => showCertificates(history)}>
          {t('dashboard.certificates.alertShow')}
        </Button>
      </Box>
    </Alert>
  );
}

/**
 * EVERY CERTIFICATE THE API BELIEVES, AND HOW LONG EACH HAS LEFT.
 *
 * The active one first - it signs - then the previous keys still believed
 * for what they signed, then, when the desktop certificate sign-in is on, the
 * CAs it checks members against. One block each rather than a table: the
 * facts are few, the names are long, and a block wraps on a phone where eight
 * columns would scroll.
 *
 * MOUNTING IT REFRESHES THE REPORT, for the header too. Somebody who comes
 * here to look should see the answer as of now, and one request per visit to
 * the front page is nothing. Arriving from the header's indicator, the url
 * carries #signing-certificates and the card scrolls itself into view once
 * it has something to show.
 */
export function SigningCertificates() {
  const t = useT();
  const dispatch = useDispatch();
  const location = useLocation();
  const surface = useSurface();
  const { status, report, receivedAt } = useSelector(selectCertificates);
  const anchor = useRef(null);

  useEffect(() => {
    dispatch(loadCertificates({ refresh: true }));
  }, [dispatch]);

  const hasReport = !!report;

  useEffect(() => {
    if (!hasReport || location.hash !== '#' + CERTIFICATES_ANCHOR) return;
    const node = anchor.current;
    /* jsdom, and nothing else this console runs in, has no scrollIntoView. */
    if (node && typeof node.scrollIntoView === 'function') node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hasReport, location.hash, location.key]);

  const certificates = certificatesAsOf(report, receivedAt, Date.now());
  const problems = report && Array.isArray(report.problems) ? report.problems : [];
  const hasPrevious = certificates.some((certificate) => certificate.role === 'previous');

  let body;
  if (!report) {
    body = status === 'failed'
      ? <Text fontSize="sm" color={surface.muted} px={5} py={4}>{t('dashboard.certificates.couldNotLoad')}</Text>
      : <Center py={6}><Spinner size="sm" color="brand.500" /></Center>;
  } else {
    body = (
      <Box>
        {certificates.map((certificate, index) => (
          <CertificateRow
            key={[certificate.role, certificate.keyId, certificate.source, certificate.subject, certificate.notAfter, index].join('|')}
            certificate={certificate}
            first={index === 0}
          />
        ))}

        {problems.map((problem) => (
          <Text
            key={problem.source + '|' + problem.problem}
            data-problem={problem.source}
            fontSize="sm" color="red.500" px={5} py={3}
            borderTopWidth="1px" borderTopColor={surface.border}
          >
            {t(CERTIFICATE_PROBLEM[problem.problem] || 'dashboard.certificates.problemUnreadable', {
              chain: t(CERTIFICATE_SOURCE[problem.source] || 'dashboard.certificates.sourceMemberCaRsa')
            })}
          </Text>
        ))}

        <Box px={5} py={3} borderTopWidth="1px" borderTopColor={surface.border}>
          {hasPrevious ? (
            <Text fontSize="xs" color={surface.muted} mb="0.25rem">{t('dashboard.certificates.previousNote')}</Text>
          ) : null}
          <Text fontSize="xs" color={surface.muted}>{t('dashboard.certificates.howToRenew')}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box id={CERTIFICATES_ANCHOR} ref={anchor} data-testid="signing-certificates">
      <Card
        title={t('dashboard.certificates.title')}
        subtitle={t('dashboard.certificates.subtitle')}
        bodyProps={false}
      >
        {body}
      </Card>
    </Box>
  );
}

/** One certificate: whose, until when, and whether its chain was checked. */
function CertificateRow({ certificate, first }) {
  const t = useT();
  const surface = useSurface();
  const urgentBg = useColorModeValue('red.50', 'rgba(245, 101, 101, 0.1)');

  const scheme = STATUS_SCHEME[certificate.status] || 'gray';
  const urgent = isUrgent(certificate.status);
  const expired = certificate.status === 'expired';

  const daysText = certificate.daysLeft === 0
    ? t('dashboard.certificates.lessThanADayLeft')
    : (certificate.daysLeft === 1
      ? t('dashboard.certificates.oneDayLeft')
      : t('dashboard.certificates.daysLeft', { days: number(certificate.daysLeft) }));

  let chainText;
  if (certificate.chainStatus === 'verified') chainText = t('dashboard.certificates.chainVerified');
  else if (certificate.chainStatus === 'failed') {
    chainText = t('dashboard.certificates.chainFailed', { reason: certificate.chainReason || '-' });
  } else if (certificate.chainStatus === 'not-applicable') {
    chainText = t(certificate.role === 'member-ca'
      ? 'dashboard.certificates.chainTrustAnchor'
      : 'dashboard.certificates.chainSelfSigned');
  } else chainText = t('dashboard.certificates.chainNotConfigured');

  const issuer = (certificate.issuerCN || certificate.issuer || '-') +
    (certificate.selfSigned ? ' (' + t('dashboard.certificates.selfSigned') + ')' : '');

  return (
    <Box
      px={5}
      py={4}
      borderTopWidth={first ? 0 : '1px'}
      borderTopColor={surface.border}
      borderLeftWidth="3px"
      borderLeftColor={scheme + '.500'}
      bg={urgent ? urgentBg : undefined}
      data-status={certificate.status}
      data-role={certificate.role}
    >
      <Flex align="center" wrap="wrap" gap="0.5rem" data-gap="8" data-gap-wrap>
        <StatusBadge
          kind="certificate"
          value={certificate.status}
          label={t(CERTIFICATE_STATUS[certificate.status])}
          variant={urgent ? 'solid' : 'subtle'}
        />
        <Text fontFamily="mono" fontSize="sm" fontWeight="600" wordBreak="break-all">
          {certificate.keyId || certificate.subjectCN || certificate.subject}
        </Text>
        <Text fontSize="xs" color={surface.muted}>{t(CERTIFICATE_ROLE[certificate.role] || certificate.role)}</Text>
        <Spacer />
        {expired ? null : (
          <Text
            fontSize="sm" fontWeight="700" color={scheme + '.500'}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {daysText}
          </Text>
        )}
      </Flex>

      <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacingX={6} spacingY={2} mt={3}>
        <CertificateFact label={t('dashboard.certificates.subject')}>
          {certificate.subjectCN || certificate.subject || '-'}
        </CertificateFact>
        <CertificateFact label={t('dashboard.certificates.issuer')}>{issuer}</CertificateFact>
        <CertificateFact label={t(expired ? 'dashboard.certificates.expired' : 'dashboard.certificates.expires')}>
          <Text as="span" color={urgent ? 'red.500' : undefined} fontWeight={urgent ? '600' : undefined}>
            {dateMinute(certificate.notAfter)}
          </Text>
        </CertificateFact>
        <CertificateFact label={t('dashboard.certificates.chain')}>
          <Text as="span" color={certificate.chainStatus === 'failed' ? 'red.500' : undefined}>{chainText}</Text>
        </CertificateFact>
      </SimpleGrid>

      <Text fontSize="0.6875rem" color={surface.muted} mt={2}>
        {certificate.algorithm + ' - ' + t(CERTIFICATE_SOURCE[certificate.source] || certificate.source)}
      </Text>
    </Box>
  );
}

function CertificateFact({ label, children }) {
  const surface = useSurface();

  return (
    <Box minW="0">
      <Text fontSize="0.6875rem" color={surface.muted}>{label}</Text>
      <Text fontSize="sm" wordBreak="break-word">{children}</Text>
    </Box>
  );
}

/**
 * Thirty days of arrivals against completions.
 *
 * Two series on ONE axis, because both are counts of tickets - a second scale
 * would let the two lines cross wherever the axes happened to put them and
 * mean nothing.  The gap between them is the story: arrivals consistently
 * above completions is a queue growing.
 *
 * Each line is labelled at its own end as well as in the legend, so which is
 * which never depends on telling two colours apart.
 */
function DailyChart({ rows, viz }) {
  const t = useT();

  const data = rows.map((row) => ({ ...row, label: row.day.slice(5) }));

  return (
    <Card title={t('dashboard.repairsInAndOut')} subtitle={t('dashboard.theLast30Days')}>
      <Box h="16.25rem">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 46, bottom: 4, left: -18 }}>
            {/* Solid hairlines, one shade off the surface - a dashed grid
                reads as a threshold when it is only a grid. */}
            <CartesianGrid stroke={viz.grid} strokeWidth={1} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: viz.textSecondary }}
              tickLine={false}
              axisLine={{ stroke: viz.grid }}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              tick={{ fontSize: 10, fill: viz.textSecondary }}
              tickLine={false}
              axisLine={false}
              width={44}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ stroke: viz.axis, strokeWidth: 1 }}
              {...vizTooltip(viz)}
            />
            <Legend
              verticalAlign="top"
              align="right"
              height={26}
              iconType="plainline"
              wrapperStyle={{ fontSize: 11, color: viz.textSecondary }}
            />
            <Line
              type="monotone"
              dataKey="received_cnt"
              name={t('common.takenIn')}
              stroke={viz.series1}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: viz.surface }}
              label={<EndLabel colour={viz.series1} text={t('common.takenIn')} last={data.length - 1} />}
            />
            <Line
              type="monotone"
              dataKey="closed_cnt"
              name={t('common.closed')}
              stroke={viz.series2}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: viz.surface }}
              label={<EndLabel colour={viz.series2} text={t('common.closed')} last={data.length - 1} />}
            />
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </Card>
  );
}

/**
 * The series name, once, at the end of its own line.
 *
 * Recharts calls a label renderer for every point, so this draws nothing
 * except at the last index - a number beside every point is chaos and goes
 * unread, and what is wanted here is identity rather than values.
 */
function EndLabel({ x, y, index, last, colour, text }) {
  if (index !== last) return null;
  return (
    <text x={x + 6} y={y} dy={4} fontSize={10} fill={colour} fontWeight="600">
      {text}
    </text>
  );
}

/**
 * The open queue, by the stage each ticket is stuck at.
 *
 * One series, so one hue: the bars are the same colour and the axis says
 * which is which.  Colouring each bar differently would be eight categorical
 * hues carrying no information, which is the most common way a chart misses
 * its point.
 *
 * Horizontal, because the stage names are words rather than dates and a
 * vertical version would tilt every one of them.
 */
function StatusChart({ rows, viz }) {
  const t = useT();

  if (!rows.length) {
    return (
      <Card title={t('dashboard.theOpenQueue')}>
        <Center py={16}>
          <Text fontSize="sm" color={viz.textSecondary}>{t('dashboard.nothingIsOpen')}</Text>
        </Center>
      </Card>
    );
  }

  return (
    <Card title={t('dashboard.theOpenQueue')} subtitle={t('dashboard.byStage')}>
      <Box h="16.25rem">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 34, bottom: 4, left: 8 }}
            barCategoryGap="22%"
          >
            <CartesianGrid stroke={viz.grid} strokeWidth={1} horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: viz.textSecondary }}
              tickLine={false}
              axisLine={{ stroke: viz.grid }}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              tick={{ fontSize: 10, fill: viz.textSecondary }}
              tickLine={false}
              axisLine={false}
              width={116}
            />
            <Tooltip
              cursor={{ fill: viz.grid, fillOpacity: 0.4 }}
              {...vizTooltip(viz)}
            />
            {/* 4px rounded data-end, anchored square to the baseline. */}
            <Bar
              dataKey="cnt"
              name={t('dashboard.tickets')}
              fill={viz.series1}
              radius={[0, 4, 4, 0]}
              label={<BarEndLabel colour={viz.textSecondary} />}
            />
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </Card>
  );
}

/** The count, just past the end of its own bar - never inside it, where a
 *  short bar would clip it. */
function BarEndLabel({ x, y, width, height, value, colour }) {
  return (
    <text
      x={x + width + 6}
      y={y + height / 2}
      dy={3}
      fontSize={10}
      fill={colour}
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {value}
    </text>
  );
}

/** What is late, oldest promise first - the queue somebody works from. */
function OverdueTable({ rows, onOpen }) {
  const t = useT();

  const columns = [
    { key: 'ticket_no', label: 'Ticket', render: (row) => <Text fontFamily="mono" fontSize="xs">{row.ticket_no}</Text> },
    { key: 'customer_name', label: 'Customer', maxW: '9.375rem' },
    { key: 'product_name', label: 'Device', maxW: '9.375rem' },
    { key: 'agency_name', label: 'Service centre', maxW: '9.375rem' },
    {
      key: 'hours_late',
      label: 'Late by',
      isNumeric: true,
      render: (row) => (
        <Text fontSize="xs" color="red.400" fontWeight="600" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {number(Number(row.hours_late) / 24, 1)}d
        </Text>
      )
    },
    { key: 'status', label: 'Status', render: (row) => <StatusBadge kind="ticket" value={row.status} label={String(row.status)} /> }
  ];

  return (
    <Card title={t('dashboard.pastThePromisedDate2')} subtitle={t('dashboard.oldestFirst')} bodyProps={false}>
      <DataTable columns={columns} rows={rows} onRowClick={onOpen} emptyText={t('dashboard.nothingIsLate')} />
    </Card>
  );
}

/** The centres worth opening first, straight off the health view. */
function RiskyAgencies({ rows }) {
  const t = useT();
  const history = useHistory();

  const columns = [
    { key: 'agency_name', label: 'Service centre', maxW: '10rem' },
    { key: 'risk_score', label: 'Risk score', isNumeric: true, render: (row) => (
      <HStack justify="flex-end" spacing={2}>
        <Text fontSize="xs" style={{ fontVariantNumeric: 'tabular-nums' }}>{row.risk_score}</Text>
        <StatusBadge value={row.risk_level} />
      </HStack>
    ) },
    { key: 'health_status', label: 'Why', render: (row) => <StatusBadge value={row.health_status} /> },
    { key: 'open_cnt', label: 'Open', isNumeric: true },
    { key: 'avg_turnaround_days', label: 'Turnaround', isNumeric: true,
      render: (row) => number(row.avg_turnaround_days, 1) + 'd' }
  ];

  return (
    <Card title={t('dashboard.serviceCentresNeedingAttention')} bodyProps={false}>
      <DataTable
        columns={columns}
        rows={rows}
        onRowClick={() => history.push('/admin/analysis/agency-health')}
      />
    </Card>
  );
}

/** Anything the defect watch has raised to ALERT. */
function DefectAlerts({ rows }) {
  const t = useT();
  const history = useHistory();

  const columns = [
    { key: 'product_name', label: 'Device', maxW: '8.75rem' },
    { key: 'symptom_name', label: 'Symptom', maxW: '10rem' },
    { key: 'cnt_90d', label: '90 days', isNumeric: true },
    { key: 'trend_pct', label: 'Trend', isNumeric: true, render: (row) => (
      <Text fontSize="xs" color={Number(row.trend_pct) > 0 ? 'red.400' : undefined}
        style={{ fontVariantNumeric: 'tabular-nums' }}>
        {trend(row.trend_pct)}
      </Text>
    ) },
    { key: 'agency_cnt_90d', label: 'Centres', isNumeric: true }
  ];

  return (
    <Card title={t('dashboard.defectAlerts')} subtitle={t('dashboard.theSameFaultInSeveral')} bodyProps={false}>
      <DataTable
        columns={columns}
        rows={rows}
        onRowClick={() => history.push('/admin/analysis/defect-watch')}
      />
    </Card>
  );
}
