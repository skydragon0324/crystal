import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useHistory } from 'react-router-dom';
import {
  Box, Button, Flex, Grid, HStack, Icon, IconButton, Input, Menu, MenuButton, MenuItem, MenuList, Stack, Text, Textarea,
  useColorMode, useToast
} from '@chakra-ui/react';
import * as Md from 'react-icons/md';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import DataTable from '../../components/DataTable';
import { useConfirm } from '../../components/ConfirmDialog';
import { crm } from '../../api';
import { useT } from '../../i18n';
import { vizPalette, vizTooltip } from '../../theme/viz';
import { useSurface } from '../../theme/tokens';
import { date, dateTime, money, number } from '../../utils/format';
import { Status, amount, rowsOf, word, partyIdLabel } from './shared';
import { Amount, Dot, InfoList, Panel, ProjectTags, ScoreBreakdown, Timeline } from './ui';
import { ChannelLabel, KeyContactsCard, MiniTable, OrganizationInfoCard, RelationshipOwnershipCard, ServiceSummaryCard, useRowSearch } from './c360Cards';
import { TransactionDrawer } from './Transactions';
import { CaseDetail } from './ServiceCases';
import { Card360, Empty360, Initials, Pill, RfmHexagon } from './ui360';

/**
 * THE TABS OF THE CUSTOMER 360 RECORD - everything a card on the overview
 * shows the first few of. Each tab gets the record's rows (`record`, from
 * /crm/parties/:id), its figures (`view`, from /360) and the record's actions
 * (`act`: open a dialog, run a change, ask before one). Notes, files and
 * interactions are read here, page by page, because they grow without end.
 */

const CUSTOMERS = '/admin/crm/customers';

/* ================================================================ accounts */


const REVIEW_STATUS_KEY = {
  PENDING: 'crm.customers.unverifiedPENDING',
  ASSIGNED: 'crm.customers.unverifiedASSIGNED',
  ASSIGNED_ELSEWHERE: 'crm.customers.unverifiedASSIGNED_ELSEWHERE',
  REJECTED: 'crm.customers.unverifiedREJECTED'
};

/**
 * Department identifiers an imported spreadsheet listed for this customer.
 * They are not accounts: nothing links through them until an administrator
 * verifies one under Customers > E-shop assignments. They are shown so that
 * whoever handles an identity inquiry can check what the person used before.
 */
function UnverifiedAccountsCard({ partyId, act }) {
  const translate = useT();
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let live = true;
    crm.parties.unverifiedAccounts(partyId).then(({ data }) => { if (live) setRows(rowsOf(data)); }).catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [partyId, act.version]);
  /* Linking makes it a project account of this customer; rejecting closes its review. Either way it is decided once. */
  const decide = (row, action) => act.ask(
    action === 'LINK' ? 'crm.customers.linkIdentifier' : 'crm.customers.rejectIdentifier',
    action === 'LINK' ? 'crm.customers.linkIdentifierExplained' : 'crm.customers.rejectIdentifierExplained',
    translate(row.project_name || '') + '  ' + (row.external_login || row.external_account_id),
    () => crm.parties.decideUnverified(partyId, { project_id: row.project_id, external_account_id: row.external_account_id, action: action }),
    action === 'LINK' ? 'info' : 'danger');
  if (!rows.length) return null;
  return (
    <Card360 icon={Md.MdHistory} title={translate('crm.customers.unverifiedTitle')}>
      <Text fontSize="xs" mb={2}>{translate('crm.customers.unverifiedExplained')}</Text>
      <MiniTable
        rows={rows}
        rowKey={(row) => row.registration_intake_id + ':' + row.project_id + ':' + row.external_account_id}
        columns={[
          { key: 'project_name', label: 'Project or service', render: (row) => translate(row.project_name || '') },
          { key: 'external_account_id', label: 'Account PK' },
          { key: 'external_login', label: 'Account ID' },
          { key: 'review_status', label: 'Review',
            render: (row) => translate(REVIEW_STATUS_KEY[row.review_status] || 'crm.customers.unverifiedNotStaged') },
          { key: 'recorded_at', label: 'Recorded', render: (row) => date(row.recorded_at) },
          { key: 'decide', label: 'Actions', render: (row) => {
            if (!act.editable || (row.review_status && row.review_status !== 'PENDING')) return null;
            return (
              <HStack spacing={1}>
                <Button size="xs" variant="outline" colorScheme="brand" leftIcon={<Icon as={Md.MdLink} />} onClick={() => decide(row, 'LINK')}>
                  {translate('crm.customers.linkIdentifier')}
                </Button>
                <Button size="xs" variant="ghost" colorScheme="red" leftIcon={<Icon as={Md.MdBlock} />} onClick={() => decide(row, 'REJECT')}>
                  {translate('crm.customers.rejectIdentifier')}
                </Button>
              </HStack>
            );
          } }
        ]}
      />
    </Card360>
  );
}

export function AccountsTab({ record, view, act }) {
  const translate = useT();
  const accounts = record.accounts || [];
  return (
    <Stack spacing={4}>
      <Card360 icon={Md.MdPersonOutline} title={translate('crm.c360.accountsInEachProject')}
        action={act.editable ? <Button size="xs" variant="outline" leftIcon={<Icon as={Md.MdLink} />} onClick={() => act.open('account')}>{translate('crm.c360.linkAccount')}</Button> : null}>
        <MiniTable
          rows={view.accounts || []}
          rowKey={(row) => row.project_code + ':' + (row.project_account_id || 'none')}
          columns={[
            { key: 'project_name', label: 'Project or service', render: (row) => <HStack spacing={2}><ProjectTags codes={[row.project_code]} /><Text as="span">{translate(row.project_name || '')}</Text></HStack> },
            { key: 'external_account_id', label: 'Account PK' },
            { key: 'external_login', label: 'Account ID' },
            { key: 'account_status', label: 'Status', render: (row) => <Pill code={row.account_status} /> },
            { key: 'first_used_at', label: 'First use', render: (row) => date(row.first_used_at) },
            { key: 'last_activity_at', label: 'Last activity', render: (row) => date(row.last_activity_at) },
            { key: 'unlink', label: 'Actions', render: (row) => {
              const account = accounts.filter((candidate) => candidate.project_account_id === row.project_account_id)[0];
              if (!act.editable || !account || account.unlinked_at) return null;
              return (
                <IconButton size="xs" variant="ghost" icon={<Icon as={Md.MdPhonelinkOff} />} aria-label={translate('crm.customer.unlink')}
                  onClick={() => act.ask('crm.customer.unlinkAccount', 'crm.customer.unlinkExplained', account.project_code + '  ' + account.external_account_id,
                    () => crm.parties.unlinkAccount(record.party.party_pk, account.project_account_id))} />
              );
            } }
          ]}
        />
      </Card360>
      <UnverifiedAccountsCard partyId={record.party.party_pk} act={act} />
      <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gridGap={4}>
        <Card360 icon={Md.MdCardMembership} title={translate('crm.customer.memberships')}>
          <MiniTable
            rows={record.memberships || []}
            rowKey={(row) => row.membership_id}
            columns={[
              { key: 'project_code', label: 'Project', filter: true, render: (row) => <ProjectTags codes={[row.project_code]} /> },
              { key: 'tier_name', label: 'Project tier', render: (row) => translate(row.tier_name || '-') },
              { key: 'available_reward_points', label: 'Reward points', isNumeric: true, render: (row) => amount(row.available_reward_points, 2) },
              { key: 'membership_status', label: 'Status', render: (row) => <Pill code={row.membership_status} /> },
              { key: 'joined_at', label: 'Joined', render: (row) => date(row.joined_at) }
            ]}
          />
        </Card360>
        <Card360 icon={Md.MdStars} title={translate('crm.customer.pointBalances')}>
          <MiniTable
            rows={record.point_accounts || []}
            rowKey={(row) => row.point_account_id}
            columns={[
              { key: 'point_type_name', label: 'Points', filter: true, render: (row) => translate(row.point_type_name || row.point_type_code) },
              { key: 'balance', label: 'Balance', isNumeric: true, render: (row) => <Text as="span" fontWeight="700">{amount(row.balance, row.decimal_places)}</Text> }
            ]}
          />
        </Card360>
      </Grid>
      <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gridGap={4}>
        <Card360 icon={Md.MdTrendingUp} title={translate('crm.customer.tierChanges')}>
          <MiniTable
            rows={record.tier_history || []}
            rowKey={(row) => row.membership_tier_history_id}
            columns={[
              { key: 'changed_at', label: 'When', render: (row) => date(row.changed_at) },
              { key: 'project_code', label: 'Project', filter: true, render: (row) => <ProjectTags codes={[row.project_code]} /> },
              { key: 'new_tier_name', label: 'Tier', render: (row) => (row.old_tier_name ? translate(row.old_tier_name) + ' → ' : '') + translate(row.new_tier_name || '-') },
              { key: 'change_reason', label: 'Reason', maxW: '12rem' }
            ]}
          />
        </Card360>
        <Card360 icon={Md.MdHistory} title={translate('crm.customer.recentPoints')}>
          <MiniTable
            rows={record.point_events || []}
            rowKey={(row) => row.point_event_id}
            columns={[
              { key: 'occurred_at', label: 'When', render: (row) => date(row.occurred_at) },
              { key: 'event_code', label: 'Movement', filter: true, render: (row) => word(translate, row.event_code) },
              { key: 'points_delta', label: 'Change', isNumeric: true, render: (row) => <Amount value={row.points_delta} sign /> },
              { key: 'points_balance_after', label: 'Balance', isNumeric: true, render: (row) => amount(row.points_balance_after) }
            ]}
          />
        </Card360>
      </Grid>
    </Stack>
  );
}

/* ================================================================ orders */

const ORDER_COLUMNS = [
  { key: 'external_transaction_id', label: 'Order number', render: (row) => <Text as="span" color="brand.500" fontWeight="600">{row.external_transaction_id}</Text> },
  { key: 'transaction_at', label: 'When', render: (row) => dateTime(row.transaction_at) },
  { key: 'project_code', label: 'Project', filter: true, render: (row) => <ProjectTags codes={[row.project_code]} /> },
  { key: 'transaction_type_code', label: 'Type', filter: true },
  { key: 'transaction_status', label: 'Status', filter: true, render: (row) => <Pill code={row.transaction_status} /> },
  { key: 'net_amount', label: 'Amount', isNumeric: true, render: (row) => <Amount value={row.net_amount} currency={row.currency_code} sign /> },
  { key: 'reporting_net_amount', label: 'Reporting amount', isNumeric: true, render: (row) => <Amount value={row.reporting_net_amount} sign /> },
  { key: 'points_used', label: 'Points used', isNumeric: true, render: (row) => amount(row.points_used, 0) }
];

/* An order opens over the record, not on the Transactions screen: the manager stays with the customer. */
export function OrdersTab({ record }) {
  const translate = useT();
  const [openId, setOpenId] = useState(null);
  const columns = ORDER_COLUMNS.map((column) => (column.key === 'transaction_type_code'
    ? Object.assign({}, column, { render: (row) => word(translate, row.transaction_type_code) }) : column));
  const found = useRowSearch(record.transactions || [], columns, true);
  return (
    <Card360 icon={Md.MdReceipt} title={translate('crm.c360.ordersAndTransactions')} padded={false}>
      <Box px={2} pt={found.bar ? 2 : 0}>
        {found.bar}
        <DataTable
          hidePagination
          rows={found.shown}
          rowKey={(row) => row.transaction_id}
          columns={columns}
          onRowClick={(row) => setOpenId(row.transaction_id)}
          emptyText={translate(found.searchable ? 'crm.ui.noMatches' : 'crm.customer.noPurchases')}
        />
      </Box>
      <TransactionDrawer id={openId} onClose={() => setOpenId(null)} />
    </Card360>
  );
}

/* ================================================================ products */

export function ProductsTab({ record }) {
  const translate = useT();
  const history = useHistory();
  return (
    <Stack spacing={4}>
      <Card360 icon={Md.MdDevicesOther} title={translate('crm.customer.holdings')} padded={false}>
        <Box px={2}>
          <DataTable
            hidePagination
            rows={record.holdings || []}
            rowKey={(row) => row.product_registration_id}
            columns={[
              { key: 'product_name', label: 'Product' },
              { key: 'external_product_instance_id', label: 'Serial or key', render: (row) => row.serial_number || row.imei || row.external_product_instance_id || '-' },
              { key: 'class_name', label: 'Product class', render: (row) => translate(row.class_name || '-') },
              { key: 'relationship_code', label: 'Held as', render: (row) => word(translate, row.relationship_code) },
              { key: 'project_code', label: 'Project', filter: true, render: (row) => <ProjectTags codes={[row.project_code]} /> },
              { key: 'valid_from', label: 'From', render: (row) => date(row.valid_from) },
              { key: 'valid_to', label: 'Until', render: (row) => (row.valid_to ? date(row.valid_to) + '  ' + word(translate, row.end_reason_code) : translate('crm.customer.now')) }
            ]}
            onRowClick={(row) => history.push('/admin/crm/products?instance=' + row.product_instance_id)}
          />
        </Box>
      </Card360>
      <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gridGap={4}>
        <Card360 icon={Md.MdViewModule} title={translate('crm.customer.byClass')}>
          <MiniTable
            rows={record.class_stats || []}
            rowKey={(row) => row.product_class_id}
            columns={[
              { key: 'class_name', label: 'Product class', render: (row) => translate(row.class_name) },
              { key: 'active_owned_count', label: 'Held now', isNumeric: true, render: (row) => number(row.active_owned_count) },
              { key: 'lifetime_registered_count', label: 'Ever registered', isNumeric: true, render: (row) => number(row.lifetime_registered_count) }
            ]}
          />
        </Card360>
        <Card360 icon={Md.MdSwapHoriz} title={translate('crm.customer.transfers')}>
          <MiniTable
            rows={record.transfers || []}
            rowKey={(row) => row.product_transfer_id}
            columns={[
              { key: 'transfer_kind', label: 'What', filter: true, render: (row) => word(translate, row.transfer_kind) },
              { key: 'product_name', label: 'Product' },
              { key: 'status', label: 'Status', filter: true, render: (row) => <Status value={row.status} /> },
              { key: 'requested_at', label: 'Requested', render: (row) => date(row.requested_at) }
            ]}
          />
        </Card360>
      </Grid>
    </Stack>
  );
}

/* ================================================================ service */

/** Interactions page by page, newest first. */
function useInteractions(partyId, version) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [pageNo, setPageNo] = useState(1);
  useEffect(() => {
    if (!partyId) return;
    crm.customer360.interactions(partyId, { page: pageNo, limit: 10 })
      .then(({ data }) => { setRows(rowsOf(data)); setTotal((data && data.total) || rowsOf(data).length); })
      .catch(() => setRows([]));
  }, [partyId, pageNo, version]);
  return { rows: rows, total: total, page: pageNo, setPage: setPageNo };
}

export function ServiceTab({ record, view, act }) {
  const translate = useT();
  const interactions = useInteractions(record.party && record.party.party_pk, act.version);
  const [openCase, setOpenCase] = useState(null);
  const caseColumns = [
    { key: 'external_case_id', label: 'Case', render: (row) => <Text as="span" color="brand.500" fontWeight="600">{row.external_case_id || '#' + row.case_id}</Text> },
    { key: 'case_type_name', label: 'Type', filter: true, filterValue: (row) => row.case_type_name, render: (row) => translate(row.case_type_name || '-') },
    { key: 'title', label: 'Subject', maxW: '14rem' },
    { key: 'status_name', label: 'Status', filter: true, render: (row) => <Pill tone={row.is_terminal ? 'green' : 'orange'}>{translate(row.status_name || '-')}</Pill> },
    { key: 'service_center_name', label: 'Service location' },
    { key: 'project_code', label: 'Project', filter: true, render: (row) => <ProjectTags codes={[row.project_code]} /> },
    { key: 'received_at', label: 'Received', render: (row) => dateTime(row.received_at) },
    { key: 'closed_at', label: 'Closed', render: (row) => dateTime(row.closed_at) }
  ];
  const cases = useRowSearch(record.cases || [], caseColumns, true);
  return (
    <Stack spacing={4}>
      <Grid templateColumns={{ base: '1fr', xl: '2fr 3fr' }} gridGap={4}>
        <ServiceSummaryCard view={view} />
        <Card360 icon={Md.MdForum} title={translate('crm.c360.interactions')} padded={false}
          action={act.editable ? <Button size="xs" variant="outline" leftIcon={<Icon as={Md.MdAdd} />} onClick={() => act.open('interaction', { direction: 'INBOUND', channel_code: 'PHONE', outcome_code: 'ANSWERED' })}>{translate('crm.c360.logInteraction')}</Button> : null}>
          <Box px={2}>
            <DataTable
              rows={interactions.rows}
              rowKey={(row) => row.interaction_id}
              page={interactions.page}
              limit={10}
              total={interactions.total}
              onPageChange={interactions.setPage}
              columns={[
                { key: 'occurred_at', label: 'When', render: (row) => dateTime(row.occurred_at) },
                { key: 'direction', label: 'Direction', render: (row) => word(translate, row.direction) },
                { key: 'channel_code', label: 'Channel', render: (row) => <ChannelLabel code={row.channel_code} /> },
                { key: 'interaction_type', label: 'Type', render: (row) => word(translate, row.interaction_type) },
                { key: 'subject', label: 'Summary', maxW: '14rem' },
                { key: 'external_case_id', label: 'Case' },
                { key: 'agent_name', label: 'Agent' },
                { key: 'outcome_code', label: 'Outcome', render: (row) => <Pill code={row.outcome_code} /> }
              ]}
              renderExpanded={(row) => <Text fontSize="sm" whiteSpace="pre-wrap">{row.body || row.destination_snapshot || '-'}</Text>}
              emptyText={translate('crm.c360.noInteractions')}
            />
          </Box>
        </Card360>
      </Grid>
      <Card360 icon={Md.MdBuild} title={translate('crm.c360.serviceCases')} padded={false}
        action={act.editable ? <Button size="xs" variant="outline" leftIcon={<Icon as={Md.MdAdd} />} onClick={() => act.open('case')}>{translate('crm.c360.newCase')}</Button> : null}>
        <Box px={2} pt={cases.bar ? 2 : 0}>
          {cases.bar}
          <DataTable
            hidePagination
            rows={cases.shown}
            rowKey={(row) => row.case_id}
            columns={caseColumns}
            onRowClick={(row) => setOpenCase(row.case_id)}
            emptyText={translate(cases.searchable ? 'crm.ui.noMatches' : 'crm.customer.noCases')}
          />
        </Box>
      </Card360>
      {/* Changes made in the case (classification, status) show here once the record reloads. */}
      <CaseDetail id={openCase} onClose={() => { setOpenCase(null); act.refresh(); }} />
    </Stack>
  );
}

/* ================================================================ campaigns */

export function CampaignsTab({ record, view }) {
  const translate = useT();
  const history = useHistory();
  return (
    <Stack spacing={4}>
      <Grid templateColumns={{ base: '1fr', lg: '3fr 2fr' }} gridGap={4}>
        <Card360 icon={Md.MdRecordVoiceOver} title={translate('crm.c360.campaignsThatReachedThem')}>
          <MiniTable
            rows={view.campaigns || []}
            rowKey={(row) => row.recipient_id}
            onRowClick={(row) => history.push('/admin/crm/campaigns/' + row.campaign_id)}
            empty="crm.c360.noCampaignsYet"
            columns={[
              { key: 'campaign_name', label: 'Campaign' },
              { key: 'channel_code', label: 'Channel', render: (row) => <ChannelLabel code={row.channel_code} /> },
              { key: 'at', label: 'Date', render: (row) => date(row.at) },
              { key: 'outcome', label: 'Outcome', render: (row) => <Pill code={row.outcome} /> },
              { key: 'skip_reason_code', label: 'Why not sent', render: (row) => (row.skip_reason_code ? word(translate, row.skip_reason_code) : '-') }
            ]}
          />
        </Card360>
        <Card360 icon={Md.MdGroupWork} title={translate('crm.customer.segments')}>
          <MiniTable
            rows={record.segments || []}
            rowKey={(row) => row.segment_id}
            onRowClick={(row) => history.push('/admin/crm/segments?segment=' + row.segment_id)}
            empty="crm.customer.inNoSegment"
            columns={[
              { key: 'segment_name', label: 'Segment' },
              { key: 'matched_at', label: 'Since', render: (row) => date(row.matched_at) }
            ]}
          />
        </Card360>
      </Grid>
      <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr 1fr' }} gridGap={4}>
        <Card360 icon={Md.MdEventAvailable} title={translate('crm.customer.chosenFor')}>
          <MiniTable
            rows={record.targets || []}
            rowKey={(row) => row.activity_target_id}
            onRowClick={(row) => history.push('/admin/crm/events/' + row.event_id)}
            columns={[
              { key: 'event_name', label: 'Event', filter: true },
              { key: 'used_count', label: 'Used', isNumeric: true, render: (row) => number(row.used_count) + ' / ' + number(row.allowed_count) },
              { key: 'status', label: 'Status', filter: true, render: (row) => <Pill code={row.status} /> }
            ]}
          />
        </Card360>
        <Card360 icon={Md.MdConfirmationNumber} title={translate('crm.customer.reservations')}>
          <MiniTable
            rows={record.reservations || []}
            rowKey={(row) => row.reservation_id}
            columns={[
              { key: 'reservation_code', label: 'Number' },
              { key: 'event_name', label: 'Event', filter: true },
              { key: 'status', label: 'Status', filter: true, render: (row) => <Pill code={row.status} /> }
            ]}
          />
        </Card360>
        <Card360 icon={Md.MdCardGiftcard} title={translate('crm.customer.awards')}>
          <MiniTable
            rows={record.awards || []}
            rowKey={(row) => row.award_id}
            columns={[
              { key: 'reward_name', label: 'Reward' },
              { key: 'event_name', label: 'Event', filter: true },
              { key: 'status', label: 'Status', filter: true, render: (row) => <Pill code={row.status} /> }
            ]}
          />
        </Card360>
      </Grid>
    </Stack>
  );
}

/* ================================================================ analytics */

function SpendChart({ monthly }) {
  const { colorMode } = useColorMode();
  const viz = vizPalette(colorMode);
  return (
    <Box h="13rem">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={monthly} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={viz.grid} vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 10, fill: viz.textSecondary }} tickLine={false} axisLine={{ stroke: viz.grid }} />
          <YAxis tick={{ fontSize: 10, fill: viz.textSecondary }} tickLine={false} axisLine={false} />
          <Tooltip {...vizTooltip(viz)} formatter={(value) => money(value)} />
          <Bar dataKey="amount" fill={viz.series1} radius={[3, 3, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}

function ScoreChart({ history }) {
  const { colorMode } = useColorMode();
  const viz = vizPalette(colorMode);
  return (
    <Box h="13rem">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={(history || []).map((row) => ({ label: row.reference_date, score: Number(row.corporate_score) }))} margin={{ top: 8, right: 12, bottom: 0, left: -24 }}>
          <CartesianGrid stroke={viz.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: viz.textSecondary }} tickLine={false} axisLine={{ stroke: viz.grid }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: viz.textSecondary }} tickLine={false} axisLine={false} />
          <Tooltip {...vizTooltip(viz)} />
          <Line type="monotone" dataKey="score" stroke={viz.series1} strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}

function metricValue(metric, translate) {
  if (metric.value_type === 'BOOLEAN') return metric.boolean_value ? translate('common.yes') : '-';
  if (metric.value_type === 'DATE') return date(metric.date_value);
  if (metric.value_type === 'TEXT') return metric.text_value;
  return metric.unit_code === 'SCORE' ? number(Number(metric.numeric_value), 2) : number(Number(metric.numeric_value), 0);
}

export function AnalyticsTab({ record, view, model }) {
  const translate = useT();
  const surface = useSurface();
  const analysis = record.analysis || {};
  const dream = (analysis.latest || []).filter((snapshot) => snapshot.project_id === null)[0] || null;
  const perProject = (analysis.latest || []).filter((snapshot) => snapshot.project_id !== null);
  const rfm = view.rfm;
  return (
    <Stack spacing={4}>
      <Grid templateColumns={{ base: '1fr', xl: '1fr 1fr' }} gridGap={4}>
        <Card360 icon={Md.MdInsertChart} title={translate('crm.c360.spendLast12Months')}>
          <SpendChart monthly={(view.value && view.value.monthly) || []} />
        </Card360>
        <Card360 icon={Md.MdShowChart} title={translate('crm.customer.gradeOverTime')}>
          {(view.score_history || []).length ? <ScoreChart history={view.score_history} /> : <Empty360>{translate('crm.customer.notAnalysedYet')}</Empty360>}
        </Card360>
      </Grid>
      <Grid templateColumns={{ base: '1fr', xl: '1fr 1fr 1fr' }} gridGap={4}>
        <Card360 icon={Md.MdDonutLarge} title={translate('crm.customer.whyThisGrade')}>
          <ScoreBreakdown components={dream && dream.score_components} model={model} />
          {dream ? (
            <Text fontSize="xs" color={surface.muted} mt={2}>{translate('crm.customer.analysedOn', { date: date(dream.reference_date), model: dream.model_version || '' })}</Text>
          ) : null}
        </Card360>
        <Card360 icon={Md.MdTrackChanges} title={translate('crm.c360.rfmScore')}>
          {rfm ? (
            <Flex align="center">
              <RfmHexagon score={rfm.score} />
              <Box ml={4} flex="1">
                <InfoList items={[
                  { label: translate('crm.c360.recency'), value: number(rfm.recency) },
                  { label: translate('crm.c360.frequency'), value: number(rfm.frequency) },
                  { label: translate('crm.c360.monetary'), value: number(rfm.monetary) }
                ]} />
              </Box>
            </Flex>
          ) : <Empty360>{translate('crm.ui.notGradedYet')}</Empty360>}
          <Text fontSize="xs" color={surface.muted} mt={2}>{translate('crm.c360.rfmExplained')}</Text>
        </Card360>
        <Card360 icon={Md.MdFunctions} title={translate('crm.customer.metrics')}>
          {(analysis.metrics || []).length
            ? <InfoList items={analysis.metrics.map((metric) => ({ label: metric.metric_name, value: metricValue(metric, translate) }))} />
            : <Empty360>{translate('crm.customer.notAnalysedYet')}</Empty360>}
        </Card360>
      </Grid>
      <Card360 icon={Md.MdViewList} title={translate('crm.customer.byProject')}>
        <MiniTable
          rows={perProject}
          rowKey={(row) => row.analysis_snapshot_id}
          empty="crm.customer.notAnalysedYet"
          columns={[
            { key: 'project_code', label: 'Project', filter: true, render: (row) => <ProjectTags codes={[row.project_code]} /> },
            { key: 'purchase_amount_12m', label: 'Spend, 12 months', isNumeric: true, render: (row) => <Amount value={row.purchase_amount_12m} /> },
            { key: 'transaction_count_12m', label: 'Purchases, 12 months', isNumeric: true, render: (row) => number(row.transaction_count_12m) },
            { key: 'last_transaction_at', label: 'Last purchase', render: (row) => date(row.last_transaction_at) },
            { key: 'service_case_count_12m', label: 'Service cases', isNumeric: true, render: (row) => number(row.service_case_count_12m) },
            { key: 'registered_device_count', label: 'Products held', isNumeric: true, render: (row) => number(row.registered_device_count) },
            { key: 'activity_status', label: 'Activity', render: (row) => <Dot value={row.activity_status} /> }
          ]}
        />
      </Card360>
    </Stack>
  );
}

/* ================================================================ consent and preferences */

export function ConsentTab({ record, view, act }) {
  const translate = useT();
  const surface = useSurface();
  const reach = view.reach || {};
  return (
    <Stack spacing={4}>
      <Card360 icon={Md.MdTune} title={translate('crm.c360.channelsAtAGlance')}>
        <Flex wrap="wrap">
          {(reach.consent_by_channel || []).map((channel) => (
            <Box key={channel.channel_code} borderWidth="1px" borderColor={surface.border} borderRadius="lg" px={3} py={2} mr={3} mb={2} minW="9rem">
              <ChannelLabel code={channel.channel_code} />
              <Box mt={1.5}>
                <Pill code={channel.granted ? 'GRANTED' : (channel.asked ? 'DENIED' : 'NOT_SENT')}>
                  {channel.granted ? translate('crm.c360.agreed') : (channel.asked ? translate('crm.c360.notAgreed') : translate('crm.customer.notAsked'))}
                </Pill>
              </Box>
              {reach.preferred_channel === channel.channel_code ? <Text fontSize="xs" color="brand.500" mt={1}>{translate('crm.c360.preferred')}</Text> : null}
            </Box>
          ))}
        </Flex>
      </Card360>
      <Card360 icon={Md.MdVerifiedUser} title={translate('crm.customer.consent')} padded={false}>
        <Text fontSize="xs" color={surface.muted} px={4} pb={2}>{translate('crm.customer.consentExplained')}</Text>
        <Box px={2}>
          <DataTable
            hidePagination
            rows={record.consents || []}
            rowKey={(row) => row.project_communication_option_id}
            columns={[
              { key: 'project_code', label: 'Project', filter: true, render: (row) => <ProjectTags codes={[row.project_code]} /> },
              { key: 'purpose_name', label: 'About', render: (row) => translate(row.purpose_name || '-') },
              { key: 'channel_name', label: 'Channel', render: (row) => <ChannelLabel code={row.channel_code} /> },
              { key: 'consent_status', label: 'Consent',
                render: (row) => (row.consent_status ? <Pill code={row.consent_status} />
                  : (row.consent_required ? translate('crm.customer.notAsked') : translate('crm.customer.noConsentNeeded'))) },
              { key: 'contact_value', label: 'Send to' },
              { key: 'captured_at', label: 'Recorded', render: (row) => date(row.captured_at) }
            ]}
            actions={act.editable ? [{
              key: 'change', label: translate('crm.customer.change'),
              onClick: (row) => act.open('consent', {
                project_communication_option_id: row.project_communication_option_id,
                consent_status: row.consent_status || 'GRANTED',
                contact_point_id: row.contact_point_id
              })
            }] : []}
            actionsIconOnly={false}
          />
        </Box>
      </Card360>
    </Stack>
  );
}

/* ================================================================ related parties */

export function RelatedTab({ record, view, act }) {
  const translate = useT();
  const history = useHistory();
  const party = record.party || {};
  const isPerson = party.party_type === 'PERSON';
  const links = record.organization_links || {};
  return (
    <Stack spacing={4}>
      <Card360 icon={Md.MdPeopleOutline} title={translate('crm.c360.relationships')}
        action={act.editable ? <Button size="xs" variant="outline" leftIcon={<Icon as={Md.MdAdd} />} onClick={() => act.open('relationship')}>{translate('crm.c360.addRelationship')}</Button> : null}>
        <MiniTable
          rows={(view.relationships || []).filter((row) => row.side !== 'EMPLOYMENT')}
          rowKey={(row) => String(row.party_relationship_id) + row.side}
          onRowClick={(row) => history.push(CUSTOMERS + '/' + row.other_party_pk)}
          empty="crm.c360.noRelatedParties"
          columns={[
            { key: 'other_name', label: 'Name', render: (row) => <HStack spacing={2}><Initials name={row.other_name} color={row.other_party_type === 'ORGANIZATION' ? 'teal' : 'brand'} /><Text as="span">{row.other_name}</Text></HStack> },
            { key: 'other_party_pk', label: 'Customer number', render: (row) => partyIdLabel(row.other_party_pk) },
            { key: 'relationship_name', label: 'Relationship', render: (row) => translate(row.relationship_name) },
            { key: 'other_party_type', label: 'Type', render: (row) => word(translate, row.other_party_type) },
            { key: 'valid_from', label: 'From', render: (row) => date(row.valid_from) },
            { key: 'status', label: 'Status', filter: true, render: (row) => <Pill code={row.status} /> },
            { key: 'end', label: 'Actions', render: (row) => (act.editable && row.status === 'ACTIVE' ? (
              <Button size="xs" variant="ghost" onClick={(event) => {
                event.stopPropagation();
                act.ask('crm.customer.endRelationship', 'crm.c360.endRelationshipExplained', row.other_name,
                  () => crm.customer360.endRelationship(party.party_pk, row.party_relationship_id));
              }}>{translate('crm.customer.endRelationship')}</Button>
            ) : null) }
          ]}
        />
      </Card360>
      {isPerson ? (
        <Card360 icon={Md.MdBusiness} title={translate('crm.customer.actsFor')}>
          <MiniTable
            rows={links.employers || []}
            rowKey={(row) => row.org_person_relationship_id}
            onRowClick={(row) => history.push(CUSTOMERS + '/' + row.organization_party_pk)}
            empty="crm.customer.actsForNobody"
            columns={[
              { key: 'organization_name', label: 'Organization' },
              { key: 'roles', label: 'Roles', render: (row) => (row.roles || []).map((role) => translate(role.role_name)).join(', ') || '-' },
              { key: 'relationship_status', label: 'Status', render: (row) => <Pill code={row.relationship_status} /> },
              { key: 'valid_from', label: 'From', render: (row) => date(row.valid_from) }
            ]}
          />
        </Card360>
      ) : null}
      <Card360 icon={Md.MdMergeType} title={translate('crm.customer.merges')}>
        <MiniTable
          rows={record.merges || []}
          rowKey={(row) => row.merge_id}
          columns={[
            { key: 'merged_party_pk', label: 'Merged customer', render: (row) => partyIdLabel(row.merged_party_pk) },
            { key: 'surviving_party_pk', label: 'Into', render: (row) => partyIdLabel(row.surviving_party_pk) },
            { key: 'merge_reason', label: 'Reason', maxW: '14rem' },
            { key: 'merged_at', label: 'When', render: (row) => date(row.merged_at) }
          ]}
        />
      </Card360>
    </Stack>
  );
}

/* ================================================================ notes and files */

function NotesList({ partyId, act }) {
  const translate = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const surface = useSurface();
  const [notes, setNotes] = useState([]);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    crm.customer360.notes(partyId, { limit: 100 }).then(({ data }) => setNotes(rowsOf(data))).catch(() => setNotes([]));
  }, [partyId]);
  useEffect(() => { if (partyId) load(); }, [partyId, load]);

  const change = async (work) => {
    setBusy(true);
    try {
      await work();
      load();
      act.refresh();
      return true;
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 5000, isClosable: true });
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card360 icon={Md.MdNote} title={translate('crm.c360.notes')}>
      {act.editable ? (
        <Box mb={3}>
          <Textarea size="sm" rows={3} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={translate('crm.c360.writeANote')} />
          <Flex justify="flex-end" mt={2}>
            <Button size="sm" variant="brand" isLoading={busy} isDisabled={!draft.trim()}
              onClick={async () => { if (await change(() => crm.customer360.addNote(partyId, { note_text: draft }))) setDraft(''); }}>
              {translate('crm.c360.addNote')}
            </Button>
          </Flex>
        </Box>
      ) : null}
      {notes.length ? (
        <Stack spacing={0} divider={<Box borderBottomWidth="1px" borderColor={surface.border} />}>
          {notes.map((note) => (
            <Box key={note.note_id} py={2.5}>
              <Flex justify="space-between" align="center" mb={1}>
                <HStack spacing={2} fontSize="xs" color={surface.muted}>
                  {note.is_pinned ? <Icon as={Md.MdBookmark} color="orange.400" /> : null}
                  <Text>{dateTime(note.created_at)}</Text>
                  <Text>{note.author_name}</Text>
                </HStack>
                {act.editable ? (
                  <Menu placement="bottom-end">
                    <MenuButton as={IconButton} size="xs" variant="ghost" icon={<Icon as={Md.MdMoreVert} />} aria-label={translate('crm.customer.moreActions')} />
                    <MenuList fontSize="sm">
                      <MenuItem onClick={() => change(() => crm.customer360.updateNote(partyId, note.note_id, { is_pinned: !note.is_pinned }))}>
                        {translate(note.is_pinned ? 'crm.c360.unpin' : 'crm.c360.pin')}
                      </MenuItem>
                      <MenuItem onClick={() => setEditing({ note_id: note.note_id, note_text: note.note_text })}>{translate('common.edit')}</MenuItem>
                      <MenuItem color="red.500" onClick={async () => {
                        const agreed = await confirm({ title: translate('crm.c360.removeNote'), body: translate('crm.c360.removeNoteExplained'), confirmLabel: translate('common.remove') });
                        if (agreed) change(() => crm.customer360.removeNote(partyId, note.note_id));
                      }}>{translate('common.remove')}</MenuItem>
                    </MenuList>
                  </Menu>
                ) : null}
              </Flex>
              {editing && editing.note_id === note.note_id ? (
                <Box>
                  <Textarea size="sm" rows={3} value={editing.note_text} onChange={(event) => setEditing({ note_id: note.note_id, note_text: event.target.value })} />
                  <HStack justify="flex-end" mt={2} spacing={2}>
                    <Button size="xs" variant="ghost" onClick={() => setEditing(null)}>{translate('common.cancel')}</Button>
                    <Button size="xs" variant="brand" isLoading={busy}
                      onClick={async () => { if (await change(() => crm.customer360.updateNote(partyId, note.note_id, { note_text: editing.note_text }))) setEditing(null); }}>
                      {translate('common.save')}
                    </Button>
                  </HStack>
                </Box>
              ) : <Text fontSize="sm" whiteSpace="pre-wrap">{note.note_text}</Text>}
            </Box>
          ))}
        </Stack>
      ) : <Empty360>{translate('crm.c360.noNotes')}</Empty360>}
    </Card360>
  );
}

function sizeOf(bytes) {
  const value = Number(bytes || 0);
  if (value >= 1048576) return number(value / 1048576, 1) + ' MB';
  if (value >= 1024) return number(value / 1024, 0) + ' KB';
  return number(value) + ' B';
}

function FilesList({ partyId, act }) {
  const translate = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const picker = useRef(null);
  const [files, setFiles] = useState([]);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    crm.customer360.files(partyId).then(({ data }) => setFiles(rowsOf(data))).catch(() => setFiles([]));
  }, [partyId]);
  useEffect(() => { if (partyId) load(); }, [partyId, load]);

  const upload = async (event) => {
    const chosen = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!chosen) return;
    setBusy(true);
    try {
      await crm.customer360.uploadFile(partyId, chosen, description);
      setDescription('');
      toast({ title: translate('crm.c360.fileAdded'), status: 'success', duration: 2500 });
      load();
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 6000, isClosable: true });
    } finally {
      setBusy(false);
    }
  };

  const download = async (file) => {
    try {
      const { data: blob } = await crm.customer360.downloadFile(partyId, file.file_id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 5000, isClosable: true });
    }
  };

  return (
    <Card360 icon={Md.MdAttachFile} title={translate('crm.c360.files')}>
      {act.editable ? (
        <Flex mb={3} align="center">
          <Input size="sm" mr={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={translate('crm.c360.fileDescription')} />
          <input ref={picker} type="file" hidden onChange={upload} />
          <Button size="sm" variant="outline" leftIcon={<Icon as={Md.MdCloudUpload} />} isLoading={busy} flexShrink={0}
            onClick={() => picker.current && picker.current.click()}>
            {translate('crm.c360.uploadFile')}
          </Button>
        </Flex>
      ) : null}
      <MiniTable
        rows={files}
        rowKey={(row) => row.file_id}
        empty="crm.c360.noFiles"
        columns={[
          { key: 'file_name', label: 'File', maxW: '14rem', render: (row) => <Text as="span" color="brand.500" fontWeight="600" noOfLines={1}>{row.file_name}</Text> },
          { key: 'description', label: 'Description', maxW: '12rem' },
          { key: 'byte_size', label: 'Size', isNumeric: true, render: (row) => sizeOf(row.byte_size) },
          { key: 'uploaded_by_name', label: 'By' },
          { key: 'created_at', label: 'Added', render: (row) => date(row.created_at) },
          { key: 'actions', label: 'Actions', render: (row) => (
            <HStack spacing={1}>
              <IconButton size="xs" variant="ghost" icon={<Icon as={Md.MdFileDownload} />} aria-label={translate('crm.c360.download')} onClick={() => download(row)} />
              {act.editable ? (
                <IconButton size="xs" variant="ghost" colorScheme="red" icon={<Icon as={Md.MdDelete} />} aria-label={translate('common.remove')}
                  onClick={async () => {
                    const agreed = await confirm({ title: translate('crm.c360.removeFile'), body: translate('crm.c360.removeFileExplained'), detail: row.file_name, confirmLabel: translate('common.remove') });
                    if (!agreed) return;
                    try { await crm.customer360.removeFile(partyId, row.file_id); load(); } catch (error) {
                      toast({ title: error.message, status: 'error', duration: 5000, isClosable: true });
                    }
                  }} />
              ) : null}
            </HStack>
          ) }
        ]}
      />
    </Card360>
  );
}

const ENTITY_WORDS = {
  crm_party: 'Customer', crm_contact_point: 'Contact', crm_project_account: 'Account',
  crm_membership: 'Membership', crm_party_communication_consent: 'Consent'
};

export function NotesFilesTab({ record, act }) {
  const translate = useT();
  const history = useHistory();
  const partyId = record.party && record.party.party_pk;
  return (
    <Stack spacing={4}>
      <Grid templateColumns={{ base: '1fr', xl: '1fr 1fr' }} gridGap={4}>
        <NotesList partyId={partyId} act={act} />
        <FilesList partyId={partyId} act={act} />
      </Grid>
      <Grid templateColumns={{ base: '1fr', xl: '1fr 1fr' }} gridGap={4}>
        <Card360 icon={Md.MdTimeline} title={translate('crm.customer.recentActivity')} padded={false}>
          <Timeline items={act.timeline || []} onOpen={(link) => history.push(link)} />
        </Card360>
        <Card360 icon={Md.MdHistory} title={translate('crm.customer.changesByStaff')}>
          <MiniTable
            rows={record.audit || []}
            rowKey={(row) => row.id}
            columns={[
              { key: 'created_at', label: 'When', render: (row) => dateTime(row.created_at) },
              { key: 'manager_name', label: 'By' },
              { key: 'action', label: 'Action', filter: true },
              { key: 'entity', label: 'Record', render: (row) => translate(ENTITY_WORDS[row.entity] || row.entity) }
            ]}
          />
        </Card360>
      </Grid>
    </Stack>
  );
}

/* ================================================================ organization: profile, team, agreements */

export function OrganizationTab({ record, view, act }) {
  const translate = useT();
  const links = record.organization_links || {};
  const party = record.party || {};
  const [team, setTeam] = useState([]);
  const [agreements, setAgreements] = useState([]);
  useEffect(() => {
    if (!party.party_pk) return;
    crm.customer360.team(party.party_pk).then(({ data }) => setTeam(rowsOf(data))).catch(() => setTeam([]));
    crm.customer360.agreements(party.party_pk).then(({ data }) => setAgreements(rowsOf(data))).catch(() => setAgreements([]));
  }, [party.party_pk, act.version]);

  return (
    <Stack spacing={4}>
      <Grid templateColumns={{ base: '1fr', xl: '1fr 1fr' }} gridGap={4}>
        <OrganizationInfoCard view={view} onEdit={act.editable ? () => act.open('profile') : null} />
        <RelationshipOwnershipCard view={view} />
      </Grid>
      <Grid templateColumns={{ base: '1fr', xl: '1fr 1fr' }} gridGap={4}>
        <Card360 icon={Md.MdGroup} title={translate('crm.c360.accountTeam')}
          action={act.editable ? <Button size="xs" variant="outline" leftIcon={<Icon as={Md.MdAdd} />} onClick={() => act.open('team')}>{translate('crm.c360.assign')}</Button> : null}>
          <MiniTable
            rows={team}
            rowKey={(row) => row.team_member_id}
            empty="crm.c360.noTeamYet"
            columns={[
              { key: 'team_role', label: 'Role', filter: true, render: (row) => word(translate, row.team_role) },
              { key: 'manager_name', label: 'Staff member', render: (row) => <HStack spacing={2}><Initials name={row.manager_name} /><Text as="span">{row.manager_name}</Text></HStack> },
              { key: 'assigned_at', label: 'From', render: (row) => date(row.assigned_at) },
              { key: 'ended_at', label: 'Until', render: (row) => (row.ended_at ? date(row.ended_at) : <Pill code="ACTIVE" />) },
              { key: 'end', label: 'Actions', render: (row) => (act.editable && !row.ended_at ? (
                <Button size="xs" variant="ghost" onClick={() => act.run(() => crm.customer360.endTeam(party.party_pk, row.team_member_id))}>{translate('crm.sites.end')}</Button>
              ) : null) }
            ]}
          />
        </Card360>
        <Card360 icon={Md.MdGavel} title={translate('crm.c360.agreements')}
          action={act.editable ? <Button size="xs" variant="outline" leftIcon={<Icon as={Md.MdAdd} />} onClick={() => act.open('agreement', { status: 'ACTIVE' })}>{translate('crm.c360.addAgreement')}</Button> : null}>
          <MiniTable
            rows={agreements}
            rowKey={(row) => row.agreement_id}
            empty="crm.c360.noAgreements"
            onRowClick={act.editable ? (row) => act.open('agreement', row) : undefined}
            columns={[
              { key: 'agreement_type', label: 'Contract type', filter: true, render: (row) => word(translate, row.agreement_type) },
              { key: 'agreement_no', label: 'Number' },
              { key: 'start_date', label: 'Start', render: (row) => date(row.start_date) },
              { key: 'end_date', label: 'End', render: (row) => date(row.end_date) },
              { key: 'renewal_date', label: 'Next renewal', render: (row) => date(row.renewal_date) },
              { key: 'status', label: 'Status', filter: true, render: (row) => <Pill code={row.status} /> }
            ]}
          />
        </Card360>
      </Grid>
      <Grid templateColumns={{ base: '1fr', xl: '1fr 1fr' }} gridGap={4}>
        <Card360 icon={Md.MdLabel} title={translate('crm.customer.organizationTypes')}
          action={act.editable ? <Button size="xs" variant="outline" leftIcon={<Icon as={Md.MdAdd} />} onClick={() => act.open('orgType')}>{translate('crm.event.add')}</Button> : null}>
          <MiniTable
            rows={links.types || []}
            rowKey={(row) => row.organization_type_assignment_id}
            columns={[
              { key: 'type_name', label: 'Type', render: (row) => translate(row.type_name) },
              { key: 'project_code', label: 'Project', filter: true, render: (row) => row.project_code || translate('crm.ui.dreamWide') },
              { key: 'status', label: 'Status', filter: true, render: (row) => <Pill code={row.status} /> },
              { key: 'end', label: 'Actions', render: (row) => (act.editable && row.status === 'ACTIVE' ? (
                <Button size="xs" variant="ghost" onClick={() => act.run(() => crm.organizations.endType(party.party_pk, row.organization_type_assignment_id))}>{translate('crm.sites.end')}</Button>
              ) : null) }
            ]}
          />
        </Card360>
        <Card360 icon={Md.MdDomain} title={translate('crm.customer.industries')}
          action={act.editable ? <Button size="xs" variant="outline" leftIcon={<Icon as={Md.MdAdd} />} onClick={() => act.open('industry')}>{translate('crm.event.add')}</Button> : null}>
          <MiniTable
            rows={links.industries || []}
            rowKey={(row) => row.industry_id}
            columns={[
              { key: 'industry_name', label: 'Industry', render: (row) => translate(row.industry_name) },
              { key: 'is_primary', label: 'Primary', render: (row) => (row.is_primary ? <Pill code="PRIMARY" /> : '-') },
              { key: 'remove', label: 'Actions', render: (row) => (act.editable ? (
                <Button size="xs" variant="ghost" onClick={() => act.run(() => crm.organizations.removeIndustry(party.party_pk, row.industry_id))}>{translate('common.remove')}</Button>
              ) : null) }
            ]}
          />
        </Card360>
      </Grid>
    </Stack>
  );
}

/* ================================================================ organization: contacts */

export function ContactsTab({ record, view, act }) {
  const translate = useT();
  const history = useHistory();
  const links = record.organization_links || {};
  const party = record.party || {};
  return (
    <Stack spacing={4}>
      <Grid templateColumns={{ base: '1fr', xl: '1fr 1fr' }} gridGap={4}>
        <KeyContactsCard view={view} onLink={act.editable ? () => act.open('person') : null} />
        <Card360 icon={Md.MdContactPhone} title={translate('crm.c360.organizationContactPoints')}
          action={act.editable ? <Button size="xs" variant="outline" leftIcon={<Icon as={Md.MdAdd} />} onClick={() => act.open('contact', { contact_type: 'PHONE' })}>{translate('crm.event.add')}</Button> : null}>
          <MiniTable
            rows={record.contacts || []}
            rowKey={(row) => row.contact_point_id}
            columns={[
              { key: 'contact_type', label: 'Type', filter: true, render: (row) => word(translate, row.contact_type) },
              { key: 'contact_value', label: 'Contact' },
              { key: 'is_primary', label: 'Primary', render: (row) => (row.is_primary ? <Pill code="PRIMARY" /> : '-') },
              { key: 'status', label: 'Status', filter: true, render: (row) => <Pill code={row.status} /> }
            ]}
          />
        </Card360>
      </Grid>
      <Panel title={translate('crm.customer.peopleHere')}>
        <DataTable
          hidePagination
          rows={links.people || []}
          rowKey={(row) => row.org_person_relationship_id}
          columns={[
            { key: 'person_name', label: 'Person', render: (row) => row.person_name + '  ' + partyIdLabel(row.person_party_pk) },
            { key: 'roles', label: 'Roles', render: (row) => (row.roles || []).map((role) => translate(role.role_name)).join(', ') || '-' },
            { key: 'project_code', label: 'Project', filter: true, render: (row) => row.project_code || translate('crm.ui.dreamWide') },
            { key: 'relationship_status', label: 'Status', render: (row) => <Pill code={row.relationship_status} /> },
            { key: 'valid_from', label: 'From', render: (row) => date(row.valid_from) }
          ]}
          onRowClick={(row) => history.push(CUSTOMERS + '/' + row.person_party_pk)}
          actions={act.editable ? [{
            key: 'end', label: translate('crm.customer.endRelationship'), hidden: (row) => row.relationship_status !== 'ACTIVE',
            onClick: (row) => act.run(() => crm.organizations.endPerson(party.party_pk, row.org_person_relationship_id))
          }] : []}
          actionsIconOnly={false}
        />
      </Panel>
    </Stack>
  );
}
