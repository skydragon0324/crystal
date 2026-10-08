import React, { useCallback, useEffect, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  Box, Button, SimpleGrid, Stack, Tab, TabList, TabPanel, TabPanels, Tabs, Text, useDisclosure, useToast
} from '@chakra-ui/react';

import Card from '../../components/Card';
import DataTable from '../../components/DataTable';
import FormModal from '../../components/FormModal';
import StatTile from '../../components/StatTile';
import Toolbar from '../../components/Toolbar';
import { useConfirm } from '../../components/ConfirmDialog';
import useList from '../../hooks/useList';
import usePermission from '../../hooks/usePermission';
import { crm } from '../../api';
import { useT } from '../../i18n';
import { dateTime, number } from '../../utils/format';
import {
  Fact, Facts, InstancePicker, PartyPicker, Pending, RecordHeader, Status, amount, choices, localInput,
  optionsFrom, rowsOf, useCatalogOptions, useCrmMeta, useSiteOptions, word, filtersFor, partyIdLabel } from './shared';
import { useEventFields } from './eventFields';

const PAGE = '/admin/crm/events';

const SETUP = ['DRAFT', 'APPROVED'];
const LIVE = ['DRAFT', 'APPROVED', 'TARGETS_FROZEN', 'OPEN'];

/* The buttons each status offers, in the order they are shown. */
const MOVES = {
  DRAFT: [['APPROVED', 'crm.events.approve'], ['CANCELLED', 'crm.events.cancelEvent']],
  APPROVED: [['TARGETS_FROZEN', 'crm.events.freezeTargets'], ['DRAFT', 'crm.events.backToDraft'], ['CANCELLED', 'crm.events.cancelEvent']],
  TARGETS_FROZEN: [['OPEN', 'crm.events.open'], ['CANCELLED', 'crm.events.cancelEvent']],
  OPEN: [['CLOSED', 'crm.events.close'], ['CANCELLED', 'crm.events.cancelEvent']],
  CLOSED: [['FULFILLED', 'crm.events.markFulfilled']]
};

const MOVE_EXPLAINED = {
  APPROVED: 'crm.events.approveExplained',
  TARGETS_FROZEN: 'crm.events.freezeExplained',
  OPEN: 'crm.events.openExplained',
  CLOSED: 'crm.events.closeExplained',
  FULFILLED: 'crm.events.fulfilExplained',
  CANCELLED: 'crm.events.cancelExplained',
  DRAFT: 'crm.events.backToDraftExplained'
};

/**
 * ONE ACTIVITY EVENT, from setup to the last prize handed over.
 *
 * SETUP is the tiers a target can fall in, the sites taking part, the quotas
 * that cap how many entries exist, and the rewards. TARGETS are who may take
 * part and how many times. ENTRIES are the numbered reservations or lottery
 * numbers, each with the identity used to collect it. AWARDS are what was
 * handed out and how it reaches the winner.
 *
 * Every limit is enforced by the server, under locks - the buttons here are
 * hidden when the event's status would refuse them, which is a courtesy,
 * not the rule.
 */
export default function EventDetail() {
  const translate = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const history = useHistory();
  const { id } = useParams();
  const meta = useCrmMeta();
  const sites = useSiteOptions();
  const catalog = useCatalogOptions();
  const currentManager = useSelector((state) => (state.auth && state.auth.admin) || {});
  const { canWrite } = usePermission(PAGE);

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null);
  const [saving, setSaving] = useState(false);
  const [tick, setTick] = useState(0);
  const modal = useDisclosure();

  const record = detail || {};
  const event = record.event;
  const editFields = useEventFields(!event || event.status === 'DRAFT');

  const load = useCallback(() => {
    setLoading(true);
    crm.events.get(id)
      .then(({ data }) => setDetail(data || null))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (!event) return <Card><Pending loading={loading} /></Card>;

  const counts = record.counts || {};
  const tiers = record.tiers || [];
  const status = event.status;
  const inSetup = SETUP.indexOf(status) !== -1;
  const live = LIVE.indexOf(status) !== -1;
  const tierOptions = tiers.map((tier) => ({ value: tier.event_tier_id, label: tier.tier_name }));
  const eventSites = (record.locations || []).map((eventLocation) => ({ value: eventLocation.service_center_id, label: eventLocation.service_center_name }));

  const ask = (title, fields, initial, submit) => { setDialog({ title: title, fields: fields, initial: initial || {}, submit: submit }); modal.onOpen(); };

  const run = async (work, done) => {
    setSaving(true);
    try {
      const result = await work();
      toast({ title: done ? translate(done) : translate('Saved'), status: 'success', duration: 2500 });
      modal.onClose();
      load();
      setTick(tick + 1);
      return result || true;
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 6000, isClosable: true });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const move = async (next, verb) => {
    const agreed = await confirm({
      tone: next === 'CANCELLED' ? 'danger' : 'info',
      title: translate(verb),
      body: translate(MOVE_EXPLAINED[next]),
      confirmLabel: translate(verb)
    });
    if (agreed) run(() => crm.events.transition(event.event_id, next));
  };

  const remove = async (title, detailText, work) => {
    const agreed = await confirm({ tone: 'danger', title: translate(title), body: translate('crm.events.removeExplained'), detail: detailText, confirmLabel: translate('common.remove') });
    if (agreed) run(work);
  };

  const pid = event.event_id;
  const mine = String(event.created_by_manager_id) === String(currentManager.id);

  const moves = (MOVES[status] || []).filter((transition) => !(transition[0] === 'APPROVED' && mine));

  return (
    <Box>
      <RecordHeader
        onBack={() => history.push(PAGE)}
        title={event.event_name}
        subtitle={event.event_code + '  ·  ' + word(translate, event.event_type) + '  ·  ' +
          translate('crm.events.chosenBy', { basis: word(translate, event.eligibility_basis) })}
        badges={<Status value={status} />}
        actions={canWrite ? (
          <>
            {status === 'DRAFT' || live ? (
              <Button size="sm" variant="subtle" onClick={() => ask(translate('crm.events.editEvent'), editFields,
                Object.assign({}, event, {
                  eligibility_rule: event.eligibility_rule ? JSON.stringify(event.eligibility_rule) : '',
                  display_at: localInput(event.display_at),
                  starts_at: localInput(event.starts_at),
                  ends_at: localInput(event.ends_at),
                  fulfilment_ends_at: localInput(event.fulfilment_ends_at),
                  ranking_cutoff_at: localInput(event.ranking_cutoff_at)
                }),
                (values) => run(() => crm.events.update(pid, values)))}
              >
                {translate('common.edit')}
              </Button>
            ) : null}
            {moves.map((transition) => (
              <Button key={transition[0]} size="sm" variant={transition[0] === 'CANCELLED' || transition[0] === 'DRAFT' ? 'ghost' : 'brand'}
                colorScheme={transition[0] === 'CANCELLED' ? 'red' : undefined}
                onClick={() => move(transition[0], transition[1])}>
                {translate(transition[1])}
              </Button>
            ))}
          </>
        ) : null}
      />

      {status === 'DRAFT' && mine && canWrite ? (
        <Card mb={4}><Text fontSize="sm">{translate('crm.events.needsAnotherApprover')}</Text></Card>
      ) : null}

      <SimpleGrid columns={{ base: 2, md: 3, xl: 6 }} spacing={4} mb={4}>
        <StatTile label="Targets" value={number(counts.targets)} />
        <StatTile label="Entries allowed" value={number(counts.entries_allowed)} />
        <StatTile label="Open entries" value={number(counts.reservations_open)} />
        <StatTile label="Collected" value={number(counts.reservations_fulfilled)} />
        <StatTile label="Released" value={number(counts.reservations_released)} />
        <StatTile label="Awards" value={number(counts.awards)} />
      </SimpleGrid>

      <Card bodyProps={false}>
        <Tabs isLazy variant="line" colorScheme="brand">
          <TabList px={4} pt={2}>
            <Tab fontSize="sm">{translate('crm.events.setup')}</Tab>
            <Tab fontSize="sm">{translate('crm.events.targets')}</Tab>
            <Tab fontSize="sm">{translate('crm.events.entries')}</Tab>
            <Tab fontSize="sm">{translate('crm.events.awards')}</Tab>
          </TabList>
          <TabPanels>
            {/* ---- setup ---- */}
            <TabPanel>
              <Stack spacing={6}>
                <Facts>
                  <Fact label="Project">{event.project_code}</Fact>
                  <Fact label="Approval number">{event.approval_no}</Fact>
                  <Fact label="Product being reserved">{event.reserved_product_name}</Fact>
                  <Fact label="Segment">{event.segment_name}</Fact>
                  <Fact label="Costs">{event.cost_points ? amount(event.cost_points) + ' ' + (event.cost_point_type_code || '') : null}</Fact>
                  <Fact label="Numbers">
                    {(event.number_prefix || '') + (event.number_start === null ? '' : event.number_start) +
                      (event.number_end === null || event.number_end === undefined ? '' : ' - ' + event.number_end) + (event.number_suffix || '')}
                  </Fact>
                  <Fact label="Opens">{dateTime(event.starts_at)}</Fact>
                  <Fact label="Closes">{dateTime(event.ends_at)}</Fact>
                  <Fact label="Written by">{event.created_by_name}</Fact>
                  <Fact label="Approved by">{event.approved_by_name ? event.approved_by_name + '  ' + dateTime(event.approved_at) : null}</Fact>
                  <Fact label="Ranked by">{event.ranking_point_type_code ? event.ranking_point_type_code + '  ' + dateTime(event.ranking_cutoff_at) : null}</Fact>
                  <Fact label="Top how many">{event.ranking_top_n}</Fact>
                </Facts>
                {event.description ? <Text fontSize="sm" whiteSpace="pre-wrap">{event.description}</Text> : null}

                <Block
                  title={translate('crm.events.tiers')}
                  hint={translate('crm.events.tiersExplained')}
                  add={canWrite && inSetup ? () => ask(translate('crm.events.addTier'), tierFields(), { rank_no: tiers.length + 1, min_value: 0, entries_per_target: 1 },
                    (values) => run(() => crm.events.saveTier(pid, null, values))) : null}
                >
                  <DataTable
                    hidePagination
                    rows={tiers}
                    rowKey={(row) => row.event_tier_id}
                    columns={[
                      { key: 'tier_code', label: 'Code' },
                      { key: 'tier_name', label: 'Tier' },
                      { key: 'rank_no', label: 'Rank', isNumeric: true },
                      { key: 'min_value', label: 'From value', isNumeric: true, render: (row) => amount(row.min_value) },
                      { key: 'max_value', label: 'Below value', isNumeric: true, render: (row) => amount(row.max_value) },
                      { key: 'entries_per_target', label: 'Entries each', isNumeric: true },
                      { key: 'number_range_start', label: 'Numbers', render: (row) => (row.number_range_start === null ? '-' : row.number_range_start + ' - ' + (row.number_range_end === null ? '' : row.number_range_end)) }
                    ]}
                    actions={canWrite && inSetup ? [
                      { key: 'edit', label: translate('common.edit'), onClick: (row) => ask(translate('crm.events.editTier'), tierFields(), row,
                        (values) => run(() => crm.events.saveTier(pid, row.event_tier_id, values))) },
                      { key: 'remove', label: translate('common.remove'), onClick: (row) => remove('crm.events.removeTier', row.tier_name,
                        () => crm.events.removeTier(pid, row.event_tier_id)) }
                    ] : []}
                    actionsIconOnly={false}
                  />
                </Block>

                <Block
                  title={translate('crm.events.sites')}
                  hint={translate('crm.events.sitesExplained')}
                  add={canWrite && live ? () => ask(translate('crm.events.addSite'), [
                    { name: 'service_center_id', label: 'Service location', type: 'select', required: true, options: sites, isSearchable: true },
                    { name: 'service_center_role', label: 'Role', type: 'select', required: true, isClearable: false,
                      options: choices(['PICKUP', 'SALE', 'EVENT_VENUE', 'DELIVERY_HUB']) }
                  ], { service_center_role: 'PICKUP' }, (values) => run(() => crm.events.addLocation(pid, values))) : null}
                >
                  <DataTable
                    hidePagination
                    rows={record.locations || []}
                    rowKey={(row) => row.event_service_center_id}
                    columns={[
                      { key: 'service_center_code', label: 'Code' },
                      { key: 'service_center_name', label: 'Service location' },
                      { key: 'service_center_role', label: 'Role', render: (row) => word(translate, row.service_center_role) }
                    ]}
                    actions={canWrite && live ? [
                      { key: 'remove', label: translate('common.remove'), onClick: (row) => remove('crm.events.removeSite', row.service_center_name,
                        () => crm.events.removeLocation(pid, row.event_service_center_id)) }
                    ] : []}
                    actionsIconOnly={false}
                  />
                </Block>

                <Block
                  title={translate('crm.events.quotas')}
                  hint={translate('crm.events.quotasExplained')}
                  add={canWrite && live ? () => ask(translate('crm.events.addQuota'), quotaFields(), { entry_type: 'NORMAL' },
                    (values) => run(() => crm.events.saveQuota(pid, null, values))) : null}
                >
                  <DataTable
                    hidePagination
                    rows={record.quotas || []}
                    rowKey={(row) => row.event_quota_id}
                    columns={[
                      { key: 'entry_type', label: 'Entry', render: (row) => word(translate, row.entry_type) },
                      { key: 'tier_name', label: 'Tier', render: (row) => row.tier_name || translate('crm.events.everyTier') },
                      { key: 'service_center_name', label: 'Service location', render: (row) => row.service_center_name || translate('crm.events.everySite') },
                      { key: 'used_count', label: 'Used', isNumeric: true, render: (row) => number(row.used_count) + ' / ' + number(row.quota_count) }
                    ]}
                    actions={canWrite && live ? [
                      { key: 'edit', label: translate('common.edit'), onClick: (row) => ask(translate('crm.events.editQuota'), quotaFields(), row,
                        (values) => run(() => crm.events.saveQuota(pid, row.event_quota_id, values))) },
                      { key: 'remove', label: translate('common.remove'), hidden: (row) => row.used_count > 0,
                        onClick: (row) => remove('crm.events.removeQuota', word(translate, row.entry_type), () => crm.events.removeQuota(pid, row.event_quota_id)) }
                    ] : []}
                    actionsIconOnly={false}
                  />
                </Block>

                <Block
                  title={translate('crm.events.rewards')}
                  add={canWrite && status !== 'FULFILLED' && status !== 'CANCELLED' ? () => ask(translate('crm.events.addReward'), rewardFields(), { reward_type: 'PICKUP_GOODS', quantity_total: 1 },
                    (values) => run(() => crm.events.saveReward(pid, null, values))) : null}
                >
                  <DataTable
                    hidePagination
                    rows={record.rewards || []}
                    rowKey={(row) => row.reward_id}
                    columns={[
                      { key: 'reward_name', label: 'Reward' },
                      { key: 'reward_type', label: 'Kind', render: (row) => word(translate, row.reward_type) },
                      { key: 'tier_name', label: 'Tier', render: (row) => row.tier_name || translate('crm.events.everyTier') },
                      { key: 'points', label: 'Points', render: (row) => (row.points ? amount(row.points) + ' ' + (row.point_type_code || '') : '-') },
                      { key: 'product_name', label: 'Product' },
                      { key: 'quantity_awarded', label: 'Awarded', isNumeric: true, render: (row) => number(row.quantity_awarded) + ' / ' + number(row.quantity_total) }
                    ]}
                    actions={canWrite ? [
                      { key: 'edit', label: translate('common.edit'), onClick: (row) => ask(translate('crm.events.editReward'), rewardFields(), row,
                        (values) => run(() => crm.events.saveReward(pid, row.reward_id, values))) },
                      { key: 'remove', label: translate('common.remove'), hidden: (row) => row.quantity_awarded > 0,
                        onClick: (row) => remove('crm.events.removeReward', row.reward_name, () => crm.events.removeReward(pid, row.reward_id)) }
                    ] : []}
                    actionsIconOnly={false}
                  />
                </Block>
              </Stack>
            </TabPanel>

            <TabPanel px={0}>
              <Targets event={event} tierOptions={tierOptions} ask={ask} run={run} tick={tick} />
            </TabPanel>
            <TabPanel px={0}>
              <Entries event={event} eventSites={eventSites.length ? eventSites : sites} ask={ask} run={run} tick={tick} />
            </TabPanel>
            <TabPanel px={0}>
              <Awards event={event} rewards={record.rewards || []} sites={eventSites.length ? eventSites : sites} ask={ask} run={run} tick={tick} />
            </TabPanel>
          </TabPanels>
        </Tabs>
      </Card>

      {dialog ? (
        <FormModal
          isOpen={modal.isOpen}
          onClose={modal.onClose}
          title={dialog.title}
          fields={dialog.fields}
          initial={dialog.initial}
          onSubmit={dialog.submit}
          saving={saving}
          size={dialog.fields.length > 8 ? '3xl' : undefined}
        />
      ) : null}
    </Box>
  );

  function tierFields() {
    return [
      { name: 'tier_code', label: 'Code', required: true },
      { name: 'tier_name', label: 'Tier', required: true },
      { name: 'rank_no', label: 'Rank', type: 'number', required: true, help: 'Higher ranks win when a value fits two tiers.' },
      { name: 'entries_per_target', label: 'Entries each', type: 'number', required: true },
      { name: 'min_value', label: 'From value', type: 'number', step: '0.0001', required: true },
      { name: 'max_value', label: 'Below value', type: 'number', step: '0.0001' },
      { name: 'number_range_start', label: 'First number', type: 'number' },
      { name: 'number_range_end', label: 'Last number', type: 'number' }
    ];
  }

  function quotaFields() {
    return [
      { name: 'entry_type', label: 'Entry', type: 'select', required: true, isClearable: false, options: choices(['NORMAL', 'REWARD']) },
      { name: 'quota_count', label: 'How many', type: 'number', required: true },
      { name: 'event_tier_id', label: 'Only for tier', type: 'select', options: tierOptions },
      { name: 'service_center_id', label: 'Only at service location', type: 'select', options: eventSites.length ? eventSites : sites, isSearchable: true }
    ];
  }

  function rewardFields() {
    return [
      { name: 'reward_name', label: 'Reward', required: true, colSpan: 'full' },
      { name: 'reward_type', label: 'Kind', type: 'select', required: true, isClearable: false,
        options: choices(['PICKUP_GOODS', 'DELIVERABLE_GOODS', 'PRODUCT_COUPON', 'POINTS', 'WALLET_CREDIT']) },
      { name: 'quantity_total', label: 'How many there are', type: 'number', required: true },
      { name: 'event_tier_id', label: 'Only for tier', type: 'select', options: tierOptions },
      { name: 'product_id', label: 'Product', type: 'select', options: catalog, isSearchable: true },
      { name: 'point_type_id', label: 'Point type', type: 'select', options: optionsFrom(meta.point_types, 'point_type_id', 'point_type_name') },
      { name: 'points', label: 'Points', type: 'number', step: '0.001' },
      { name: 'unit_value', label: 'Value each', type: 'number', step: '0.01' },
      { name: 'sort_order', label: 'Order', type: 'number' },
      { name: 'note', label: 'Note', type: 'textarea', colSpan: 'full' }
    ];
  }
}

/** A titled table on the setup tab, with its add button. */
function Block({ title, hint, add, children }) {
  const translate = useT();
  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="flex-end" mb={2}>
        <Box>
          <Text fontSize="sm" fontWeight="600">{title}</Text>
          {hint ? <Text fontSize="xs">{hint}</Text> : null}
        </Box>
        {add ? <Button size="xs" variant="subtle" onClick={add}>{translate('crm.common.add')}</Button> : null}
      </Box>
      {children}
    </Box>
  );
}

function Targets({ event, tierOptions, ask, run, tick }) {
  const translate = useT();
  const { canWrite } = usePermission(PAGE);
  const pid = event.event_id;
  const inSetup = SETUP.indexOf(event.status) !== -1;
  const list = useList((params) => crm.events.targets(pid, params), { page: 1, limit: 20 });
  const buildable = ['SEGMENT', 'POINT_RANKING', 'CORPORATE_GRADE', 'PRODUCT_REGISTRATION', 'SERVICE_CENTER_ACTIVITY']
    .indexOf(event.eligibility_basis) !== -1;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (tick) list.reload(); }, [tick]);

  return (
    <Box>
      <Toolbar
        search={list.params.q}
        onSearch={(searchText) => list.setFilter({ q: searchText })}
        filters={filtersFor(translate, [
          { key: 'status', label: 'Status', value: list.params.status, options: choices(['ELIGIBLE', 'NOTIFIED', 'EXHAUSTED', 'REVOKED']),
            onChange: (value) => list.setFilter({ status: value || undefined }) },
          { key: 'entry_type', label: 'Entry', value: list.params.entry_type, options: choices(['NORMAL', 'REWARD']),
            onChange: (value) => list.setFilter({ entry_type: value || undefined }) }
        ])}
        actions={canWrite && inSetup ? (
          <>
            {buildable ? (
              <Button size="sm" variant="subtle" onClick={() => run(() => crm.events.buildTargets(pid).then(({ data }) => {
                list.reload();
                return data;
              }), 'crm.events.targetsBuilt')}>
                {translate('crm.events.buildFromRule')}
              </Button>
            ) : null}
            <Button size="sm" variant="brand" onClick={() => ask(translate('crm.events.addTarget'), [
              { name: 'party_pk', label: 'Customer', type: 'custom', required: true, colSpan: 'full',
                render: (values, set) => <PartyPicker value={values.party_pk} onChange={(value) => set('party_pk', value)} /> },
              { name: 'entry_type', label: 'Entry', type: 'select', isClearable: false, options: choices(['NORMAL', 'REWARD']) },
              { name: 'event_tier_id', label: 'Tier', type: 'select', options: tierOptions },
              { name: 'allowed_count', label: 'Entries allowed', type: 'number' },
              { name: 'qualification_value', label: 'Qualifying value', type: 'number', step: '0.0001' },
              { name: 'note', label: 'Why', colSpan: 'full' }
            ], { entry_type: 'NORMAL', allowed_count: 1 }, (values) => run(() => crm.events.addTarget(pid, values).then(() => list.reload())))}
            >
              {translate('crm.events.addTarget')}
            </Button>
          </>
        ) : null}
      />
      <Box px="0.5rem" pb="0.5rem">
        <DataTable
          columns={[
            { key: 'party_name', label: 'Customer', render: (row) => (row.party_name || '-') + '  ' + partyIdLabel(row.party_pk) },
            { key: 'tier_name', label: 'Tier' },
            { key: 'entry_type', label: 'Entry', render: (row) => word(translate, row.entry_type) },
            { key: 'used_count', label: 'Used', isNumeric: true, render: (row) => number(row.used_count) + ' / ' + number(row.allowed_count) },
            { key: 'qualification_value', label: 'Qualifying value', isNumeric: true, render: (row) => amount(row.qualification_value) },
            { key: 'qualification_rank', label: 'Rank', isNumeric: true },
            { key: 'source', label: 'Chosen by', render: (row) => word(translate, row.source) },
            { key: 'status', label: 'Status', render: (row) => <Status value={row.status} /> }
          ]}
          rows={list.rows}
          loading={list.loading}
          page={list.params.page}
          limit={list.params.limit}
          total={list.total}
          onPageChange={list.setPage}
          onLimitChange={(limit) => list.setFilter({ limit: limit })}
          rowKey={(row) => row.activity_target_id || row.id}
          actions={canWrite && event.status !== 'FULFILLED' && event.status !== 'CANCELLED' ? [
            { key: 'revoke', label: translate('crm.events.revoke'), hidden: (row) => row.status === 'REVOKED',
              onClick: (row) => run(() => crm.events.revokeTarget(pid, row.activity_target_id).then(() => list.reload())) }
          ] : []}
          actionsIconOnly={false}
        />
      </Box>
    </Box>
  );
}

/* What can be done to an entry in each status. */
const ENTRY_MOVES = {
  PENDING: ['RESERVED', 'CANCELLED', 'FAILED'],
  RESERVED: ['PAID', 'FULFILLED', 'CANCELLED', 'EXPIRED'],
  PAID: ['FULFILLED', 'CANCELLED']
};
const ENTRY_VERBS = {
  RESERVED: 'crm.events.confirmEntry', PAID: 'crm.events.markPaid', FULFILLED: 'crm.events.markCollected',
  CANCELLED: 'crm.events.cancelEntry', EXPIRED: 'crm.events.markExpired', FAILED: 'crm.events.markFailed'
};

function Entries({ event, eventSites, ask, run, tick }) {
  const translate = useT();
  const { canWrite } = usePermission(PAGE);
  const pid = event.event_id;
  const list = useList((params) => crm.events.reservations(pid, params), { page: 1, limit: 20, dir: 'asc' });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (tick) list.reload(); }, [tick]);

  const moveEntry = (row, status) => {
    const fields = [];
    if (status === 'FULFILLED') {
      fields.push({ name: 'service_center_id', label: 'Collected at', type: 'select', options: eventSites, isSearchable: true });
      fields.push({ name: 'product_instance_id', label: 'The unit handed over', type: 'custom', colSpan: 'full',
        render: (values, set) => <InstancePicker value={values.product_instance_id} onChange={(value) => set('product_instance_id', value)} /> });
    }
    fields.push({ name: 'note', label: 'Note', type: 'textarea', colSpan: 'full', required: status === 'CANCELLED' });
    ask(translate(ENTRY_VERBS[status]) + '  ' + row.reservation_code, fields, { service_center_id: row.service_center_id },
      (values) => run(() => crm.events.moveReservation(row.reservation_id, Object.assign({ status: status }, values)).then(() => list.reload())));
  };

  const actions = canWrite ? Object.keys(ENTRY_VERBS).map((status) => ({
    key: status,
    label: translate(ENTRY_VERBS[status]),
    hidden: (row) => (ENTRY_MOVES[row.status] || []).indexOf(status) === -1,
    onClick: (row) => moveEntry(row, status)
  })) : [];

  return (
    <Box>
      <Toolbar
        search={list.params.q}
        onSearch={(searchText) => list.setFilter({ q: searchText })}
        filters={filtersFor(translate, [
          { key: 'status', label: 'Status', value: list.params.status,
            options: choices(['PENDING', 'RESERVED', 'PAID', 'FULFILLED', 'CANCELLED', 'EXPIRED', 'FAILED']),
            onChange: (value) => list.setFilter({ status: value || undefined }) },
          { key: 'service_center_id', label: 'Service location', value: list.params.service_center_id, width: '14rem',
            options: eventSites, onChange: (value) => list.setFilter({ service_center_id: value || undefined }) }
        ])}
        actions={canWrite && event.status === 'OPEN' ? (
          <Button size="sm" variant="brand" onClick={() => ask(translate('crm.events.takeAnEntry'), [
            { name: 'party_pk', label: 'Customer', type: 'custom', required: true, colSpan: 'full',
              render: (values, set) => <PartyPicker value={values.party_pk} onChange={(value) => set('party_pk', value)} /> },
            { name: 'entry_type', label: 'Entry', type: 'select', isClearable: false, options: choices(['NORMAL', 'REWARD']) },
            { name: 'service_center_id', label: 'Collect at', type: 'select', options: eventSites, isSearchable: true },
            { name: 'holder_name', label: 'Name on the entry' },
            { name: 'holder_phone', label: 'Phone' },
            { name: 'holder_id_card', label: 'ID card number',
              help: 'Kept only as a fingerprint and a masked copy. One ID card, one entry per event.' }
          ], { entry_type: 'NORMAL' }, (values) => run(() => crm.events.reserve(pid, values).then(() => list.reload()), 'crm.events.entryTaken'))}
          >
            {translate('crm.events.takeAnEntry')}
          </Button>
        ) : null}
      />
      <Box px="0.5rem" pb="0.5rem">
        <DataTable
          columns={[
            { key: 'reservation_code', label: 'Number' },
            { key: 'party_name', label: 'Customer', render: (row) => (row.party_name || '-') + '  ' + partyIdLabel(row.party_pk) },
            { key: 'holder_name', label: 'Name on the entry' },
            { key: 'holder_id_card_masked', label: 'ID card' },
            { key: 'tier_name', label: 'Tier' },
            { key: 'entry_type', label: 'Entry', render: (row) => word(translate, row.entry_type) },
            { key: 'service_center_name', label: 'Service location' },
            { key: 'status', label: 'Status', render: (row) => <Status value={row.status} /> },
            { key: 'reserved_at', label: 'Taken', render: (row) => dateTime(row.reserved_at) },
            { key: 'fulfilled_at', label: 'Collected', render: (row) => dateTime(row.fulfilled_at) }
          ]}
          rows={list.rows}
          loading={list.loading}
          page={list.params.page}
          limit={list.params.limit}
          total={list.total}
          onPageChange={list.setPage}
          onLimitChange={(limit) => list.setFilter({ limit: limit })}
          rowKey={(row) => row.reservation_id || row.id}
          renderExpanded={(row) => <EntryHistory reservationId={row.reservation_id} />}
          actions={actions}
          actionsMode="menu"
        />
      </Box>
    </Box>
  );
}

function EntryHistory({ reservationId }) {
  const translate = useT();
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!reservationId) return;
    crm.events.reservationEvents(reservationId).then(({ data }) => setRows(rowsOf(data))).catch(() => setRows([]));
  }, [reservationId]);
  return (
    <DataTable
      hidePagination
      rows={rows}
      rowKey={(row) => row.reservation_event_id}
      columns={[
        { key: 'occurred_at', label: 'When', render: (row) => dateTime(row.occurred_at) },
        { key: 'new_status', label: 'Status', render: (row) => word(translate, row.new_status) },
        { key: 'manager_name', label: 'By' },
        { key: 'service_center_name', label: 'Service location' },
        { key: 'note', label: 'Note' }
      ]}
    />
  );
}

const AWARD_MOVES = {
  PENDING: ['READY', 'DISPATCHED', 'CREDITED', 'FAILED', 'CANCELLED'],
  READY: ['PICKED_UP', 'DISPATCHED', 'FAILED', 'CANCELLED'],
  DISPATCHED: ['DELIVERED', 'FAILED'],
  FAILED: ['PENDING', 'CANCELLED']
};
const AWARD_VERBS = {
  READY: 'crm.events.readyToCollect', DISPATCHED: 'crm.events.dispatched', DELIVERED: 'crm.events.delivered',
  PICKED_UP: 'crm.events.pickedUp', CREDITED: 'crm.events.credited', FAILED: 'crm.events.markFailed',
  PENDING: 'crm.events.tryAgain', CANCELLED: 'crm.events.cancelAward'
};

function Awards({ event, rewards, sites, ask, run, tick }) {
  const translate = useT();
  const { canWrite } = usePermission(PAGE);
  const pid = event.event_id;
  const list = useList((params) => crm.events.awards(pid, params), { page: 1, limit: 20, dir: 'desc' });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (tick) list.reload(); }, [tick]);

  const moveAward = (row, status) => {
    const fields = [];
    if (status === 'DISPATCHED') fields.push({ name: 'delivery_address', label: 'Delivery address', required: !row.delivery_address, colSpan: 'full' });
    if (status === 'CREDITED') fields.push({ name: 'external_credit_ref', label: 'Wallet transaction reference', required: true, colSpan: 'full' });
    if (!fields.length) {
      return run(() => crm.events.moveAward(row.award_id, { status: status }).then(() => list.reload()));
    }
    return ask(translate(AWARD_VERBS[status]), fields, { delivery_address: row.delivery_address },
      (values) => run(() => crm.events.moveAward(row.award_id, Object.assign({ status: status }, values)).then(() => list.reload())));
  };

  return (
    <Box>
      <Toolbar
        search={list.params.q}
        onSearch={(searchText) => list.setFilter({ q: searchText })}
        filters={filtersFor(translate, [
          { key: 'status', label: 'Status', value: list.params.status,
            options: choices(['PENDING', 'READY', 'DISPATCHED', 'DELIVERED', 'PICKED_UP', 'CREDITED', 'FAILED', 'CANCELLED']),
            onChange: (value) => list.setFilter({ status: value || undefined }) }
        ])}
        actions={canWrite && (event.status === 'OPEN' || event.status === 'CLOSED') ? (
          <Button size="sm" variant="brand" onClick={() => ask(translate('crm.events.giveAReward'), [
            { name: 'reward_id', label: 'Reward', type: 'select', required: true,
              options: rewards.map((reward) => ({ value: reward.reward_id, label: reward.reward_name + '  (' + number(reward.quantity_total - reward.quantity_awarded) + ')' })) },
            { name: 'party_pk', label: 'Customer', type: 'custom', colSpan: 'full',
              render: (values, set) => <PartyPicker value={values.party_pk} onChange={(value) => set('party_pk', value)} /> },
            { name: 'fulfilment_method', label: 'How it reaches them', type: 'select', isClearable: false,
              options: choices(['PICKUP', 'DELIVERY']), help: 'Points and wallet credit ignore this.' },
            { name: 'pickup_service_center_id', label: 'Collect at', type: 'select', options: sites, isSearchable: true },
            { name: 'recipient_name', label: 'Recipient' },
            { name: 'recipient_phone', label: 'Phone' },
            { name: 'delivery_address', label: 'Delivery address', colSpan: 'full' }
          ], { fulfilment_method: 'PICKUP' }, (values) => run(() => crm.events.award(pid, values).then(() => list.reload())))}
          >
            {translate('crm.events.giveAReward')}
          </Button>
        ) : null}
      />
      <Box px="0.5rem" pb="0.5rem">
        <DataTable
          columns={[
            { key: 'party_name', label: 'Customer', render: (row) => (row.party_name || '-') + '  ' + partyIdLabel(row.party_pk) },
            { key: 'reward_name', label: 'Reward' },
            { key: 'reward_type', label: 'Kind', render: (row) => word(translate, row.reward_type) },
            { key: 'reservation_code', label: 'Entry' },
            { key: 'fulfilment_method', label: 'How', render: (row) => word(translate, row.fulfilment_method) },
            { key: 'pickup_location_name', label: 'Collect at' },
            { key: 'status', label: 'Status', render: (row) => <Status value={row.status} /> },
            { key: 'awarded_at', label: 'Awarded', render: (row) => dateTime(row.awarded_at) },
            { key: 'fulfilled_at', label: 'Done', render: (row) => dateTime(row.fulfilled_at) }
          ]}
          rows={list.rows}
          loading={list.loading}
          page={list.params.page}
          limit={list.params.limit}
          total={list.total}
          onPageChange={list.setPage}
          onLimitChange={(limit) => list.setFilter({ limit: limit })}
          rowKey={(row) => row.award_id || row.id}
          actions={canWrite ? Object.keys(AWARD_VERBS).map((status) => ({
            key: status,
            label: translate(AWARD_VERBS[status]),
            hidden: (row) => (AWARD_MOVES[row.status] || []).indexOf(status) === -1 ||
              (status === 'CREDITED' && row.fulfilment_method !== 'WALLET') ||
              (status === 'PICKED_UP' && row.fulfilment_method !== 'PICKUP') ||
              (status === 'DISPATCHED' && row.fulfilment_method !== 'DELIVERY'),
            onClick: (row) => moveAward(row, status)
          })) : []}
          actionsMode="menu"
        />
      </Box>
    </Box>
  );
}
