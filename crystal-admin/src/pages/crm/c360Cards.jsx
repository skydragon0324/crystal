import React, { useState } from 'react';
import { useHistory } from 'react-router-dom';
import {
  Box, Button, Collapse, Flex, Grid, HStack, Icon, Input, InputGroup, InputLeftElement, Link, Select, SimpleGrid, Stack, Table, Tbody, Td,
  Text, Th, Thead, Tr, Wrap, WrapItem
} from '@chakra-ui/react';
import * as Md from 'react-icons/md';

import { useT } from '../../i18n';
import { useSurface } from '../../theme/tokens';
import { date, money, number } from '../../utils/format';
import { homeAddress, word } from './shared';
import { ProjectTags } from './ui';
import { usePeek } from './peek';
import { Card360, Empty360, Facts360, Initials, MiniBars, Pill, RfmHexagon, Sparkline, Tile, TrendBadge } from './ui360';

/**
 * THE CARDS OF THE CUSTOMER 360 OVERVIEW.
 *
 * Each card shows the first few of something and a "View all" that opens the
 * tab holding all of it. They read `view` - the record's figures from
 * /crm/parties/:id/360 - and never fetch on their own, so the overview opens
 * with one request whatever the number of cards.
 */

const CUSTOMERS = '/admin/crm/customers';

/** A compact table for a card: no paging, no settings, a row may open something. */
/*
 * A list longer than a card's six rows gets a search box, and a column marked
 * `filter: true` a choice of its values; the table keeps a fixed height and
 * scrolls under a header that stays in view.
 */
const SEARCH_FROM = 7;

/** Everything a row says, as lower-case text to search: its plain values, nested ones included. */
function rowText(row) {
  return Object.keys(row).map((key) => {
    const value = row[key];
    if (value === null || value === undefined) return '';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }).join(' ').toLowerCase();
}

function filterValue(column, row) {
  const value = column.filterValue ? column.filterValue(row) : row[column.key];
  return value === null || value === undefined || value === '' ? '' : String(value);
}

/**
 * A search box and a choice per `filter: true` column over rows already
 * loaded. `always` shows it however few the rows; otherwise it appears from
 * SEARCH_FROM rows up. Returns the rows that pass and the bar to render.
 */
export function useRowSearch(rows, columns, always) {
  const translate = useT();
  const surface = useSurface();
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState({});
  const list = rows || [];

  const searchable = list.length > 0 && (always || list.length >= SEARCH_FROM);
  const filterColumns = searchable ? columns.filter((column) => column.filter) : [];
  const term = search.trim().toLowerCase();
  const shown = list.filter((row) => (!term || rowText(row).indexOf(term) !== -1)
    && filterColumns.every((column) => !chosen[column.key] || filterValue(column, row) === chosen[column.key]));

  const bar = searchable ? (
    <Flex mb={2} gap="0.5rem" data-gap="8" data-gap-wrap wrap="wrap" align="center">
      <InputGroup size="sm" maxW="16rem">
        <InputLeftElement pointerEvents="none"><Icon as={Md.MdSearch} color={surface.muted} /></InputLeftElement>
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={translate('crm.ui.searchThese')}
          aria-label={translate('crm.ui.searchThese')} borderRadius="md" />
      </InputGroup>
      {filterColumns.map((column) => {
        const values = Array.from(new Set(list.map((row) => filterValue(column, row)).filter(Boolean))).sort();
        return (
          <Select key={column.key} size="sm" maxW="12rem" borderRadius="md" value={chosen[column.key] || ''}
            aria-label={translate('crm.ui.filterBy', { column: translate(column.label) })}
            onChange={(event) => setChosen(Object.assign({}, chosen, { [column.key]: event.target.value }))}>
            <option value="">{translate(column.label)}: {translate('crm.ui.allValues')}</option>
            {values.map((value) => <option key={value} value={value}>{word(translate, value)}</option>)}
          </Select>
        );
      })}
      <Text fontSize="xs" color={surface.muted} ml="auto">{translate('crm.ui.shownOf', { shown: shown.length, total: list.length })}</Text>
    </Flex>
  ) : null;

  return { shown: shown, searchable: searchable, bar: bar };
}

export function MiniTable({ columns, rows, rowKey, onRowClick, empty, maxH = '24rem' }) {
  const translate = useT();
  const surface = useSurface();
  const { shown, searchable, bar } = useRowSearch(rows, columns);
  if (!rows || !rows.length) return <Empty360>{translate(empty || 'crm.ui.nothingYet')}</Empty360>;

  return (
    <Box>
      {bar}
      {!shown.length ? <Empty360>{translate('crm.ui.noMatches')}</Empty360> : (
    <Box overflow="auto" maxH={maxH} borderWidth={searchable ? '1px' : 0} borderColor={surface.border} borderRadius="md">
      <Table size="sm" variant="simple">
        <Thead position="sticky" top={0} zIndex={1} bg={surface.card}>
          <Tr>
            {columns.map((column) => (
              <Th key={column.key} px={2} py={2} fontSize="0.68rem" color={surface.muted} textTransform="none" letterSpacing="normal"
                isNumeric={column.isNumeric} borderColor={surface.border}>
                {translate(column.label)}
              </Th>
            ))}
          </Tr>
        </Thead>
        <Tbody>
          {shown.map((row) => (
            <Tr key={rowKey(row)} cursor={onRowClick ? 'pointer' : undefined} onClick={onRowClick ? () => onRowClick(row) : undefined}
              _hover={onRowClick ? { bg: surface.hover } : undefined}>
              {columns.map((column) => (
                <Td key={column.key} px={2} py={2} fontSize="sm" isNumeric={column.isNumeric} borderColor={surface.border} maxW={column.maxW}>
                  {column.render ? column.render(row) : (row[column.key] === null || row[column.key] === undefined || row[column.key] === '' ? '-' : row[column.key])}
                </Td>
              ))}
            </Tr>
          ))}
        </Tbody>
      </Table>
    </Box>
      )}
    </Box>
  );
}

const CHANNEL_ICON = {
  EMAIL: Md.MdMailOutline, PHONE: Md.MdPhone, PHONE_CALL: Md.MdPhone, SMS: Md.MdSms, CHAT: Md.MdChatBubbleOutline,
  PUSH: Md.MdNotificationsNone, IN_APP: Md.MdInbox, APP: Md.MdPhoneIphone, WEB: Md.MdLanguage, IN_PERSON: Md.MdPerson, LETTER: Md.MdDrafts,
  WALK_IN: Md.MdStore, MAIL_IN: Md.MdLocalShipping, ON_SITE: Md.MdHome, COURIER: Md.MdLocalShipping, AGENCY: Md.MdStore
};

export function ChannelLabel({ code }) {
  const translate = useT();
  return (
    <HStack spacing={1.5}>
      <Icon as={CHANNEL_ICON[code] || Md.MdForum} color="gray.500" boxSize="0.95rem" />
      <Text as="span" fontSize="sm">{word(translate, code)}</Text>
    </HStack>
  );
}

/* ================================================================ shared by both layouts */

export function AccountsCard({ view, onViewAll, title, icon, action }) {
  const translate = useT();
  return (
    <Card360 icon={icon || Md.MdPersonOutline} title={title || translate('crm.c360.identityAndAccounts')} onViewAll={onViewAll} action={action}>
      <MiniTable
        rows={(view.accounts || []).slice(0, 6)}
        rowKey={(row) => row.project_code + ':' + (row.project_account_id || 'none')}
        columns={[
          { key: 'project_name', label: 'Project or service',
            render: (row) => <HStack spacing={2}><ProjectTags codes={[row.project_code]} /><Text as="span" fontSize="sm" noOfLines={1}>{translate(row.project_name || '')}</Text></HStack> },
          { key: 'external_account_id', label: 'Account ID', render: (row) => row.external_login || row.external_account_id || '-' },
          { key: 'account_status', label: 'Status', render: (row) => <Pill code={row.account_status} /> },
          { key: 'last_activity_at', label: 'Last activity', render: (row) => date(row.last_activity_at) }
        ]}
      />
    </Card360>
  );
}

export function RecentOrdersCard({ view, onViewAll }) {
  const translate = useT();
  const peek = usePeek();
  return (
    <Card360 icon={Md.MdReceipt} title={translate('crm.c360.recentOrders')} onViewAll={onViewAll}>
      <MiniTable
        rows={view.recent_orders || []}
        rowKey={(row) => row.transaction_id}
        onRowClick={(row) => peek('TRANSACTION', row.transaction_id)}
        empty="crm.customer.noPurchases"
        columns={[
          { key: 'external_transaction_id', label: 'Order number', maxW: '10rem',
            render: (row) => <Text as="span" color="brand.500" fontWeight="600" noOfLines={1}>{row.external_transaction_id}</Text> },
          { key: 'transaction_at', label: 'Date', render: (row) => date(row.transaction_at) },
          { key: 'project_code', label: 'Project', render: (row) => <ProjectTags codes={[row.project_code]} /> },
          { key: 'transaction_status', label: 'Status', render: (row) => <Pill code={row.refunded ? 'REFUNDED' : row.transaction_status} /> },
          { key: 'net_amount', label: 'Amount', isNumeric: true, render: (row) => money(row.net_amount, row.currency_code) }
        ]}
      />
    </Card360>
  );
}

export function ProductsCard({ view, onViewAll, title }) {
  const translate = useT();
  const peek = usePeek();
  return (
    <Card360 icon={Md.MdDevicesOther} title={title || translate('crm.c360.products')} onViewAll={onViewAll}>
      <MiniTable
        rows={view.products || []}
        rowKey={(row) => row.product_registration_id}
        onRowClick={(row) => peek('PRODUCT', row.product_instance_id)}
        columns={[
          { key: 'product_name', label: 'Product', maxW: '11rem',
            render: (row) => (
              <HStack spacing={2}>
                <Icon as={row.product_domain === 'SOFTWARE' || row.product_domain === 'LICENCE' ? Md.MdApps : Md.MdSmartphone} color="gray.500" />
                <Text as="span" fontSize="sm" noOfLines={1}>{row.product_name}</Text>
              </HStack>
            ) },
          { key: 'serial_number', label: 'Serial number', render: (row) => row.serial_number || row.imei || row.external_product_instance_id || '-' },
          { key: 'project_code', label: 'Project', render: (row) => <ProjectTags codes={[row.project_code]} /> },
          { key: 'valid_from', label: 'Since', render: (row) => date(row.valid_from) },
          { key: 'instance_status', label: 'Status', render: (row) => <Pill code={row.instance_status} /> }
        ]}
      />
    </Card360>
  );
}

/** Interactions, open and resolved cases, response and resolution times, satisfaction. */
export function ServiceSummaryCard({ view, onViewAll, withRecentCases }) {
  const translate = useT();
  const peek = usePeek();
  const service = view.service || {};
  const monthly = service.monthly || [];
  return (
    <Card360 icon={Md.MdHeadsetMic} title={translate('crm.c360.serviceSummary')} onViewAll={onViewAll}>
      <SimpleGrid columns={3} spacing={2}>
        <Tile label={translate('crm.c360.totalInteractions')} value={number(service.total_interactions)}
          chart={<MiniBars values={monthly.map((month) => month.opened)} color="brand.300" />} />
        <Tile label={translate('crm.c360.openCases')} value={number(service.open_cases)} tone={service.open_cases ? 'red' : null}
          chart={<MiniBars values={monthly.map((month) => Math.max(0, month.opened - month.resolved))} color="red.300" />} />
        <Tile label={translate('crm.c360.resolvedCases')} value={number(service.resolved_cases)} tone="green"
          chart={<MiniBars values={monthly.map((month) => month.resolved)} color="green.300" />} />
        <Tile label={translate('crm.c360.avgResponseTime')}
          value={service.avg_response_hours === null || service.avg_response_hours === undefined ? null : translate('crm.c360.hours', { n: number(service.avg_response_hours, 1) })} />
        <Tile label={translate('crm.c360.avgResolutionTime')}
          value={service.avg_resolution_days === null || service.avg_resolution_days === undefined ? null : translate('crm.c360.days', { n: number(service.avg_resolution_days, 1) })} />
        <Tile label={translate('crm.c360.csat')} tone="green"
          value={service.csat === null || service.csat === undefined ? null : number(service.csat, 1) + ' / 5.0'} />
      </SimpleGrid>
      {withRecentCases ? (
        <Box mt={3}>
          <Text fontSize="sm" fontWeight="700" mb={1}>{translate('crm.c360.recentCases')}</Text>
          <MiniTable
            rows={service.recent_cases || []}
            rowKey={(row) => row.case_id}
            onRowClick={(row) => peek('CASE', row.case_id)}
            empty="crm.customer.noCases"
            columns={[
              { key: 'external_case_id', label: 'Case', render: (row) => <Text as="span" color="brand.500" fontWeight="600">{row.external_case_id || '#' + row.case_id}</Text> },
              { key: 'received_at', label: 'Date', render: (row) => date(row.received_at) },
              { key: 'reception_channel_code', label: 'Channel', render: (row) => (row.reception_channel_code ? word(translate, row.reception_channel_code) : '-') },
              { key: 'title', label: 'Subject', maxW: '10rem', render: (row) => <Text as="span" noOfLines={1}>{row.title || translate(row.case_type_name || '-')}</Text> },
              { key: 'status_name', label: 'Status', render: (row) => <Pill tone={row.is_terminal ? 'green' : 'orange'}>{translate(row.status_name || '-')}</Pill> }
            ]}
          />
        </Box>
      ) : null}
    </Card360>
  );
}

/* ================================================================ the individual layout */

export function ValueMetricsCard({ view, onViewAll }) {
  const translate = useT();
  const surface = useSurface();
  const value = view.value || {};
  const rfm = view.rfm;
  return (
    <Card360 icon={Md.MdDonutLarge} title={translate('crm.c360.customerValue')} onViewAll={onViewAll}>
      <Grid templateColumns="minmax(0, 1.3fr) minmax(0, 1fr)" gridGap={3}>
        <Stack spacing={3}>
          <Box>
            <Text fontSize="xs" color={surface.muted}>{translate('crm.c360.lifetimeValue')}</Text>
            <HStack spacing={2} align="center">
              <Text fontSize="xl" fontWeight="800" style={{ fontVariantNumeric: 'tabular-nums' }}>{money(value.lifetime_value)}</Text>
              <TrendBadge value={value.spend_trend_pct} />
            </HStack>
            <Sparkline values={(value.monthly || []).map((month) => month.amount)} />
          </Box>
          <Box>
            <Text fontSize="xs" color={surface.muted}>{translate('crm.c360.avgOrderValue')}</Text>
            <HStack spacing={2}>
              <Text fontSize="lg" fontWeight="800">{value.average_order_value === null || value.average_order_value === undefined ? '-' : money(value.average_order_value)}</Text>
              <TrendBadge value={value.average_order_trend_pct} />
            </HStack>
          </Box>
          <Box>
            <Text fontSize="xs" color={surface.muted}>{translate('crm.c360.purchaseFrequency')}</Text>
            <HStack spacing={2}>
              <Text fontSize="lg" fontWeight="800">
                {value.purchase_frequency_per_year === null || value.purchase_frequency_per_year === undefined
                  ? '-' : translate('crm.c360.perYear', { n: number(value.purchase_frequency_per_year, 1) })}
              </Text>
              <TrendBadge value={value.frequency_trend_pct} />
            </HStack>
          </Box>
        </Stack>
        <Box borderWidth="1px" borderColor={surface.border} borderRadius="lg" p={3}>
          <Text fontSize="xs" color={surface.muted} mb={2}>{translate('crm.c360.rfmScore')}</Text>
          {rfm ? (
            <Flex align="center" wrap="wrap">
              <RfmHexagon score={rfm.score} />
              <Stack spacing={1.5} ml={3} fontSize="xs" flex="1" minW="5rem">
                {[['crm.c360.recency', rfm.recency], ['crm.c360.frequency', rfm.frequency], ['crm.c360.monetary', rfm.monetary]].map((part) => (
                  <Flex key={part[0]} justify="space-between">
                    <Text color={surface.muted}>{translate(part[0])}</Text>
                    <Text fontWeight="700">{number(part[1])}</Text>
                  </Flex>
                ))}
              </Stack>
            </Flex>
          ) : <Empty360>{translate('crm.ui.notGradedYet')}</Empty360>}
        </Box>
      </Grid>
    </Card360>
  );
}

export function ContactPointsCard({ view, record, onManage }) {
  const translate = useT();
  const surface = useSurface();
  const reach = view.reach || {};
  const person = (record && record.person) || {};
  const address = homeAddress(person.address_line, view.profile && view.profile.home_full_name);
  const consentRow = (channel) => (
    <Flex key={channel.channel_code} justify="space-between" align="center" py={0.5}>
      <ChannelLabel code={channel.channel_code} />
      <Pill code={channel.granted ? 'YES' : 'NO'}>{channel.granted ? translate('common.yes') : translate('crm.c360.no')}</Pill>
    </Flex>
  );
  const channels = reach.consent_by_channel || [];
  return (
    <Card360 icon={Md.MdContactPhone} title={translate('crm.c360.contactPoints')}
      action={onManage ? <Button size="xs" variant="link" colorScheme="brand" fontWeight="600" onClick={onManage}>{translate('crm.c360.manage')}</Button> : null}>
      <Stack spacing={2.5} fontSize="sm">
        {[
          { icon: Md.MdMailOutline, caption: translate('crm.c360.email'), contact: reach.email },
          { icon: Md.MdPhone, caption: translate('crm.c360.phone'), contact: reach.phone }
        ].map((line) => (
          <Flex key={line.caption} align="center">
            <Icon as={line.icon} color={surface.muted} mr={2} />
            <Text color={surface.muted} w="5.5rem" flexShrink={0}>{line.caption}</Text>
            <Text flex="1" minW={0} noOfLines={1}>{line.contact ? line.contact.contact_value : '-'}</Text>
            {line.contact && line.contact.is_primary ? <Pill code="PRIMARY" /> : null}
          </Flex>
        ))}
        <Flex align="flex-start">
          <Icon as={Md.MdPlace} color={surface.muted} mr={2} mt={0.5} />
          <Text color={surface.muted} w="5.5rem" flexShrink={0}>{translate('crm.c360.address')}</Text>
          <Text flex="1" minW={0}>{address || '-'}</Text>
        </Flex>
        <Flex align="center">
          <Icon as={Md.MdStarBorder} color={surface.muted} mr={2} />
          <Text color={surface.muted} w="9rem" flexShrink={0}>{translate('crm.c360.preferredContact')}</Text>
          <Text>{reach.preferred_channel ? word(translate, reach.preferred_channel) : '-'}</Text>
        </Flex>
        <Box>
          <Text color={surface.muted} mb={1}>{translate('crm.c360.communicationConsent')}</Text>
          <SimpleGrid columns={2} spacingX={4}>{channels.map(consentRow)}</SimpleGrid>
        </Box>
      </Stack>
    </Card360>
  );
}

export function InteractionsCard({ view, onViewAll, onLog }) {
  const translate = useT();
  return (
    <Card360 icon={Md.MdForum} title={translate('crm.c360.recentInteractions')} onViewAll={onViewAll}
      action={onLog ? <Button size="xs" variant="ghost" leftIcon={<Icon as={Md.MdAdd} />} onClick={onLog}>{translate('crm.c360.log')}</Button> : null}>
      <MiniTable
        rows={view.interactions || []}
        rowKey={(row) => row.interaction_id}
        empty="crm.c360.noInteractions"
        columns={[
          { key: 'occurred_at', label: 'Date', render: (row) => date(row.occurred_at) },
          { key: 'channel_code', label: 'Channel', render: (row) => <ChannelLabel code={row.channel_code} /> },
          { key: 'interaction_type', label: 'Type', render: (row) => word(translate, row.interaction_type) },
          { key: 'subject', label: 'Summary', maxW: '11rem', render: (row) => <Text as="span" noOfLines={1}>{row.subject}</Text> },
          { key: 'external_case_id', label: 'Case', render: (row) => (row.external_case_id ? <Text as="span" color="brand.500">{row.external_case_id}</Text> : '-') },
          { key: 'agent_name', label: 'Agent' },
          { key: 'outcome_code', label: 'Outcome', render: (row) => <Pill code={row.outcome_code} /> }
        ]}
      />
    </Card360>
  );
}

export function MarketingCard({ view, onViewAll }) {
  const translate = useT();
  const surface = useSurface();
  const segments = view.segments || [];
  const shown = segments.slice(0, 4);
  return (
    <Card360 icon={Md.MdRecordVoiceOver} title={translate('crm.c360.marketingAndCampaigns')} onViewAll={onViewAll}>
      <Text fontSize="sm" fontWeight="700" mb={1}>{translate('crm.c360.recentCampaigns')}</Text>
      {(view.campaigns || []).length ? (
        <Stack spacing={1.5} mb={3}>
          {view.campaigns.slice(0, 4).map((campaign) => (
            <Grid key={campaign.recipient_id} templateColumns="minmax(0, 1fr) auto auto auto" gridGap={2} alignItems="center" fontSize="sm">
              <Text noOfLines={1} color={surface.muted}>{campaign.campaign_name}</Text>
              <ChannelLabel code={campaign.channel_code} />
              <Text fontSize="xs" color={surface.muted}>{date(campaign.at)}</Text>
              <Pill code={campaign.outcome} />
            </Grid>
          ))}
        </Stack>
      ) : <Empty360>{translate('crm.c360.noCampaignsYet')}</Empty360>}
      <Text fontSize="sm" fontWeight="700" mb={1.5}>{translate('crm.c360.segmentMemberships')}</Text>
      {segments.length ? (
        <Wrap spacing={1.5}>
          {shown.map((segment) => <WrapItem key={segment.segment_id}><Pill tone="green">{segment.segment_name}</Pill></WrapItem>)}
          {segments.length > shown.length ? <WrapItem><Pill tone="gray">{translate('crm.c360.nMore', { n: segments.length - shown.length })}</Pill></WrapItem> : null}
        </Wrap>
      ) : <Empty360>{translate('crm.customer.inNoSegment')}</Empty360>}
    </Card360>
  );
}

export function RelatedPartiesCard({ view, onViewAll }) {
  const translate = useT();
  const history = useHistory();
  return (
    <Card360 icon={Md.MdPeopleOutline} title={translate('crm.c360.relatedParties')} onViewAll={onViewAll}>
      <MiniTable
        rows={(view.relationships || []).filter((row) => row.status === 'ACTIVE').slice(0, 5)}
        rowKey={(row) => String(row.party_relationship_id) + row.side}
        onRowClick={(row) => history.push(CUSTOMERS + '/' + row.other_party_pk)}
        empty="crm.c360.noRelatedParties"
        columns={[
          { key: 'other_name', label: 'Name',
            render: (row) => <HStack spacing={2}><Initials name={row.other_name} color={row.other_party_type === 'ORGANIZATION' ? 'teal' : 'brand'} /><Text as="span" noOfLines={1}>{row.other_name}</Text></HStack> },
          { key: 'relationship_name', label: 'Relationship', render: (row) => translate(row.relationship_name) },
          { key: 'other_party_type', label: 'Type', render: (row) => word(translate, row.other_party_type) }
        ]}
      />
    </Card360>
  );
}

export function NotesCard({ view, onViewAll }) {
  const translate = useT();
  const surface = useSurface();
  const notes = view.notes || [];
  return (
    <Card360 icon={Md.MdNote} title={translate('crm.c360.notes')} onViewAll={onViewAll}>
      {notes.length ? (
        <Stack spacing={2}>
          {notes.map((note) => (
            <Grid key={note.note_id} templateColumns="5.5rem minmax(0, 1fr) auto" gridGap={2} fontSize="sm" alignItems="flex-start">
              <Text color={surface.muted} fontSize="xs" mt={0.5}>{date(note.created_at)}</Text>
              <Text noOfLines={2}>{note.is_pinned ? <Icon as={Md.MdBookmark} color="orange.400" mr={1} /> : null}{note.note_text}</Text>
              <Text color={surface.muted} fontSize="xs" mt={0.5}>{note.author_name}</Text>
            </Grid>
          ))}
        </Stack>
      ) : <Empty360>{translate('crm.c360.noNotes')}</Empty360>}
    </Card360>
  );
}

/* ================================================================ the organization layout */

const BAND_WORDS = { '1-10': '1 - 10', '11-50': '11 - 50', '51-200': '51 - 200', '201-1000': '201 - 1,000', '1001-5000': '1,001 - 5,000', '5001+': '5,001+' };

export function companySize(band) {
  return band ? (BAND_WORDS[band] || band) : null;
}

export function OrganizationInfoCard({ view, onEdit }) {
  const translate = useT();
  const profile = view.profile || {};
  const industries = view.industries || [];
  const reach = view.reach || {};
  const representative = (view.key_contacts || []).filter((contact) => (contact.roles || []).some((role) => role.role_code === 'REPRESENTATIVE' || role.role_code === 'OWNER'))[0];
  const hierarchy = view.hierarchy || {};
  const root = (hierarchy.nodes || []).filter((node) => node.depth === 0)[0];
  const groupName = root && String(root.party_pk) !== String(view.party_pk) ? root : null;
  const history = useHistory();
  const [more, setMore] = useState(false);
  return (
    <Card360 icon={Md.MdBusiness} title={translate('crm.c360.organizationInformation')}
      action={onEdit ? <Button size="xs" variant="link" colorScheme="brand" fontWeight="600" onClick={onEdit}>{translate('common.edit')}</Button> : null}>
      <Facts360 rows={[
        { label: 'Legal name', value: profile.legal_name },
        { label: 'Local name', value: profile.local_name },
        { label: 'Registration number', value: profile.registration_number },
        { label: 'Industry', value: industries.map((industry) => translate(industry.industry_name)).join(', ') },
        { label: 'Company size', value: companySize(profile.employee_count_band) },
        { label: 'Established', value: date(profile.founded_date) },
        { label: 'Website', value: profile.website_url ? <Link href={profile.website_url} isExternal color="brand.500">{profile.website_url}<Icon as={Md.MdOpenInNew} ml={1} /></Link> : null },
        { label: 'Location', value: [profile.headquarters_address, profile.location_full_name || profile.location_name].filter(Boolean).join(', ') },
        { label: 'Main phone', value: reach.phone ? reach.phone.contact_value : null },
        { label: 'Representative', value: representative ? representative.display_name : null },
        { label: 'Corporate group', value: groupName
          ? <Link color="brand.500" onClick={() => history.push(CUSTOMERS + '/' + groupName.party_pk)}>{groupName.display_name}</Link> : null },
        { label: 'Business description', value: profile.description ? (
          <Box>
            <Collapse startingHeight="2.6rem" in={more}><Text fontSize="sm">{profile.description}</Text></Collapse>
            {profile.description.length > 90 ? (
              <Button size="xs" variant="link" colorScheme="brand" mt={1} onClick={() => setMore(!more)}>{translate(more ? 'crm.c360.showLess' : 'crm.c360.showMore')}</Button>
            ) : null}
          </Box>
        ) : null }
      ]} />
    </Card360>
  );
}

export function KeyMetricsCard({ view, onViewAll }) {
  const translate = useT();
  const value = view.value || {};
  const header = view.header || {};
  const service = view.service || {};
  return (
    <Card360 icon={Md.MdInsertChart} title={translate('crm.c360.keyMetrics')} onViewAll={onViewAll}>
      <SimpleGrid columns={3} spacing={2} mb={2}>
        <Tile label={translate('crm.c360.annualSpend')} value={money(value.spend_12m)} trend={value.spend_trend_pct}
          chart={<MiniBars values={(value.monthly || []).map((month) => month.amount)} />} />
        <Tile label={translate('crm.c360.lifetimeSpend')} value={money(value.lifetime_value)}
          chart={<MiniBars values={(value.yearly || []).map((year) => year.amount)} />} />
        <Tile label={translate('crm.c360.orders24m')} value={number(value.orders_24m)} trend={value.orders_24m_trend_pct}
          chart={<MiniBars values={(value.monthly || []).map((month) => month.amount)} color="green.300" />} />
      </SimpleGrid>
      <SimpleGrid columns={4} spacing={2}>
        <Tile label={translate('crm.c360.activeProjects')} value={number(view.projects_active) + ' / ' + number(view.projects_total)} />
        <Tile label={translate('crm.c360.activeProducts')} value={number(header.products_registered)} />
        <Tile label={translate('crm.c360.openCases')} value={number(header.open_cases)} tone={header.open_cases ? 'red' : null} />
        <Tile label={translate('crm.c360.csatOrg')} tone="green" value={service.csat === null || service.csat === undefined ? null : number(service.csat, 1) + ' / 5.0'} />
      </SimpleGrid>
    </Card360>
  );
}

export function RelationshipOwnershipCard({ view, onEdit }) {
  const translate = useT();
  const team = view.team || [];
  const agreement = view.agreement;
  const member = (role) => {
    const found = team.filter((row) => row.team_role === role)[0];
    return found ? <HStack spacing={2}><Initials name={found.manager_name} /><Text as="span" fontWeight="600">{found.manager_name}</Text></HStack> : null;
  };
  const renewalDays = agreement && agreement.renewal_date
    ? Math.ceil((new Date(agreement.renewal_date).getTime() - Date.now()) / 86400000) : null;
  return (
    <Card360 icon={Md.MdPeople} title={translate('crm.c360.relationshipAndOwnership')}
      action={onEdit ? <Button size="xs" variant="link" colorScheme="brand" fontWeight="600" onClick={onEdit}>{translate('common.edit')}</Button> : null}>
      <Facts360 rows={[
        { label: 'Relationship type', value: (view.organization_types || []).map((type) => translate(type.type_name)).join(', ') },
        { label: 'Account manager', value: member('ACCOUNT_MANAGER') },
        { label: 'Sales rep', value: member('SALES_REP') },
        { label: 'Support manager', value: member('SUPPORT_MANAGER') },
        { label: 'Contract type', value: agreement ? word(translate, agreement.agreement_type) : null },
        { label: 'Contract start', value: agreement ? date(agreement.start_date) : null },
        { label: 'Contract end', value: agreement ? date(agreement.end_date) : null },
        { label: 'Status', value: agreement ? <Pill code={agreement.status} /> : null },
        { label: 'Next renewal', value: agreement && agreement.renewal_date
          ? date(agreement.renewal_date) + (renewalDays !== null && renewalDays >= 0 ? '  ' + translate('crm.c360.inDays', { n: renewalDays }) : '') : null }
      ]} />
    </Card360>
  );
}

export function KeyContactsCard({ view, onViewAll, onLink }) {
  const translate = useT();
  const surface = useSurface();
  const history = useHistory();
  const contacts = view.key_contacts || [];
  return (
    <Card360 icon={Md.MdPersonOutline} title={translate('crm.c360.keyContacts')} onViewAll={onViewAll}
      action={onLink ? <Button size="xs" variant="outline" leftIcon={<Icon as={Md.MdAdd} />} onClick={onLink}>{translate('crm.c360.linkContact')}</Button> : null}>
      {contacts.length ? (
        <Stack spacing={3}>
          {contacts.slice(0, 5).map((contact) => (
            <Grid key={contact.org_person_relationship_id} templateColumns="auto minmax(0, 1fr) minmax(0, 1.2fr)" gridGap={3} alignItems="flex-start" fontSize="sm">
              <Initials name={contact.display_name} />
              <Box minW={0}>
                <Link fontWeight="700" textDecoration="underline" onClick={() => history.push(CUSTOMERS + '/' + contact.person_party_pk)}>{contact.display_name}</Link>
                <Text fontSize="xs" color={surface.muted} noOfLines={1}>{contact.job_title_name || contact.department_name || ''}</Text>
                <Wrap spacing={1} mt={1}>
                  {contact.is_primary ? <WrapItem><Pill code="PRIMARY" /></WrapItem> : null}
                  {(contact.roles || []).map((role) => <WrapItem key={role.role_code}><Pill tone="blue">{translate(role.role_name)}</Pill></WrapItem>)}
                </Wrap>
              </Box>
              <Stack spacing={0.5} minW={0}>
                {contact.email ? <HStack spacing={1}><Icon as={Md.MdMailOutline} color="brand.400" /><Text fontSize="xs" noOfLines={1}>{contact.email}</Text></HStack> : null}
                {contact.phone ? <HStack spacing={1}><Icon as={Md.MdPhone} color="brand.400" /><Text fontSize="xs" noOfLines={1}>{contact.phone}</Text></HStack> : null}
              </Stack>
            </Grid>
          ))}
        </Stack>
      ) : <Empty360>{translate('crm.c360.noKeyContacts')}</Empty360>}
    </Card360>
  );
}

export function HierarchyCard({ view, onViewAll }) {
  const translate = useT();
  const surface = useSurface();
  const history = useHistory();
  const hierarchy = view.hierarchy || {};
  const nodes = hierarchy.nodes || [];
  const affiliates = hierarchy.affiliates || [];
  const childrenOf = (parentId) => nodes.filter((node) => String(node.parent_id) === String(parentId));
  const root = nodes.filter((node) => node.depth === 0)[0];

  const branch = (node, label) => (
    <Box key={node.party_pk + ':' + label}>
      <Flex align="center" px={2} py={1.5} borderRadius="md" borderWidth="1px" mb={1.5}
        borderColor={String(node.party_pk) === String(view.party_pk) ? 'brand.300' : surface.border}
        bg={String(node.party_pk) === String(view.party_pk) ? 'brand.50' : undefined}
        cursor="pointer" onClick={() => history.push(CUSTOMERS + '/' + node.party_pk)}>
        <Icon as={Md.MdBusiness} color="brand.500" mr={2} />
        <Text fontSize="sm" fontWeight="600" flex="1" noOfLines={1}>{node.display_name}</Text>
        <Pill tone={String(node.party_pk) === String(view.party_pk) ? 'green' : 'gray'}>
          {String(node.party_pk) === String(view.party_pk) ? translate('crm.c360.thisCustomer') : translate(label)}
        </Pill>
      </Flex>
      <Box pl={5}>{childrenOf(node.party_pk).map((child) => branch(child, 'crm.c360.subsidiary'))}</Box>
    </Box>
  );

  return (
    <Card360 icon={Md.MdDeviceHub} title={translate('crm.c360.hierarchyAndRelated')} onViewAll={onViewAll}>
      {root && (nodes.length > 1 || affiliates.length) ? (
        <Box>
          {branch(root, 'crm.c360.groupCompany')}
          {affiliates.map((affiliate) => (
            <Flex key={'affiliate:' + affiliate.party_pk} align="center" px={2} py={1.5} borderRadius="md" borderWidth="1px" borderColor={surface.border} mb={1.5}
              ml={5} cursor="pointer" onClick={() => history.push(CUSTOMERS + '/' + affiliate.party_pk)}>
              <Icon as={Md.MdBusiness} color="gray.500" mr={2} />
              <Text fontSize="sm" flex="1" noOfLines={1}>{affiliate.display_name}</Text>
              <Pill tone="gray">{translate('crm.c360.affiliate')}</Pill>
            </Flex>
          ))}
        </Box>
      ) : <Empty360>{translate('crm.c360.notInAGroup')}</Empty360>}
    </Card360>
  );
}

/* ================================================================ the header's key segments */

export function KeySegments({ view }) {
  const translate = useT();
  const segments = view.segments || [];
  const shown = segments.slice(0, 4);
  if (!segments.length) return null;
  return (
    <Flex align="center" wrap="wrap">
      <Icon as={Md.MdGroupWork} color="brand.500" mr={2} />
      <Text fontSize="sm" fontWeight="700" mr={3}>{translate('crm.c360.keySegments')}</Text>
      <Wrap spacing={1.5}>
        {shown.map((segment) => <WrapItem key={segment.segment_id}><Pill tone="green">{segment.segment_name}</Pill></WrapItem>)}
        {segments.length > shown.length ? <WrapItem><Pill tone="gray">{'+' + (segments.length - shown.length)}</Pill></WrapItem> : null}
      </Wrap>
    </Flex>
  );
}

