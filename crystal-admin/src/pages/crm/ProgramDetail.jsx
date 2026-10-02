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
  optionsFrom, rowsOf, useCatalogOptions, useCrmMeta, useSiteOptions, word, filtersFor } from './shared';
import { useProgramFields } from './programFields';

const PAGE = '/admin/crm/programs';

const SETUP = ['DRAFT', 'APPROVED'];
const LIVE = ['DRAFT', 'APPROVED', 'TARGETS_FROZEN', 'OPEN'];

/* The buttons each status offers, in the order they are shown. */
const MOVES = {
  DRAFT: [['APPROVED', 'crm.program.approve'], ['CANCELLED', 'crm.program.cancelProgram']],
  APPROVED: [['TARGETS_FROZEN', 'crm.program.freezeTargets'], ['DRAFT', 'crm.program.backToDraft'], ['CANCELLED', 'crm.program.cancelProgram']],
  TARGETS_FROZEN: [['OPEN', 'crm.program.open'], ['CANCELLED', 'crm.program.cancelProgram']],
  OPEN: [['CLOSED', 'crm.program.close'], ['CANCELLED', 'crm.program.cancelProgram']],
  CLOSED: [['FULFILLED', 'crm.program.markFulfilled']]
};

const MOVE_EXPLAINED = {
  APPROVED: 'crm.program.approveExplained',
  TARGETS_FROZEN: 'crm.program.freezeExplained',
  OPEN: 'crm.program.openExplained',
  CLOSED: 'crm.program.closeExplained',
  FULFILLED: 'crm.program.fulfilExplained',
  CANCELLED: 'crm.program.cancelExplained',
  DRAFT: 'crm.program.backToDraftExplained'
};

/**
 * ONE ACTIVITY PROGRAM, from setup to the last prize handed over.
 *
 * SETUP is the tiers a target can fall in, the sites taking part, the quotas
 * that cap how many entries exist, and the rewards. TARGETS are who may take
 * part and how many times. ENTRIES are the numbered reservations or lottery
 * numbers, each with the identity used to collect it. AWARDS are what was
 * handed out and how it reaches the winner.
 *
 * Every limit is enforced by the server, under locks - the buttons here are
 * hidden when the program's status would refuse them, which is a courtesy,
 * not the rule.
 */
export default function ProgramDetail() {
  const t = useT();
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
  const program = record.program;
  const editFields = useProgramFields(!program || program.status === 'DRAFT');

  const load = useCallback(() => {
    setLoading(true);
    crm.programs.get(id)
      .then(({ data }) => setDetail(data || null))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (!program) return <Card><Pending loading={loading} /></Card>;

  const counts = record.counts || {};
  const tiers = record.tiers || [];
  const status = program.status;
  const inSetup = SETUP.indexOf(status) !== -1;
  const live = LIVE.indexOf(status) !== -1;
  const tierOptions = tiers.map((tier) => ({ value: tier.program_tier_id, label: tier.tier_name }));
  const programSites = (record.locations || []).map((programLocation) => ({ value: programLocation.service_location_id, label: programLocation.location_name }));

  const ask = (title, fields, initial, submit) => { setDialog({ title: title, fields: fields, initial: initial || {}, submit: submit }); modal.onOpen(); };

  const run = async (work, done) => {
    setSaving(true);
    try {
      const result = await work();
      toast({ title: t(done || 'Saved'), status: 'success', duration: 2500 });
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
      title: t(verb),
      body: t(MOVE_EXPLAINED[next]),
      confirmLabel: t(verb)
    });
    if (agreed) run(() => crm.programs.transition(program.activity_program_id, next));
  };

  const remove = async (title, detailText, work) => {
    const agreed = await confirm({ tone: 'danger', title: t(title), body: t('crm.program.removeExplained'), detail: detailText, confirmLabel: t('common.remove') });
    if (agreed) run(work);
  };

  const pid = program.activity_program_id;
  const mine = String(program.created_by_manager_id) === String(currentManager.id);

  const moves = (MOVES[status] || []).filter((transition) => !(transition[0] === 'APPROVED' && mine));

  return (
    <Box>
      <RecordHeader
        onBack={() => history.push(PAGE)}
        title={program.program_name}
        subtitle={program.program_code + '  ·  ' + word(t, program.program_type) + '  ·  ' +
          t('crm.program.chosenBy', { basis: word(t, program.eligibility_basis) })}
        badges={<Status value={status} />}
        actions={canWrite ? (
          <>
            {status === 'DRAFT' || live ? (
              <Button size="sm" variant="subtle" onClick={() => ask(t('crm.program.editProgram'), editFields,
                Object.assign({}, program, {
                  eligibility_rule: program.eligibility_rule ? JSON.stringify(program.eligibility_rule) : '',
                  display_at: localInput(program.display_at),
                  starts_at: localInput(program.starts_at),
                  ends_at: localInput(program.ends_at),
                  fulfilment_ends_at: localInput(program.fulfilment_ends_at),
                  ranking_cutoff_at: localInput(program.ranking_cutoff_at)
                }),
                (values) => run(() => crm.programs.update(pid, values)))}
              >
                {t('common.edit')}
              </Button>
            ) : null}
            {moves.map((transition) => (
              <Button key={transition[0]} size="sm" variant={transition[0] === 'CANCELLED' || transition[0] === 'DRAFT' ? 'ghost' : 'brand'}
                colorScheme={transition[0] === 'CANCELLED' ? 'red' : undefined}
                onClick={() => move(transition[0], transition[1])}>
                {t(transition[1])}
              </Button>
            ))}
          </>
        ) : null}
      />

      {status === 'DRAFT' && mine && canWrite ? (
        <Card mb={4}><Text fontSize="sm">{t('crm.program.needsAnotherApprover')}</Text></Card>
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
            <Tab fontSize="sm">{t('crm.program.setup')}</Tab>
            <Tab fontSize="sm">{t('crm.program.targets')}</Tab>
            <Tab fontSize="sm">{t('crm.program.entries')}</Tab>
            <Tab fontSize="sm">{t('crm.program.awards')}</Tab>
          </TabList>
          <TabPanels>
            {/* ---- setup ---- */}
            <TabPanel>
              <Stack spacing={6}>
                <Facts>
                  <Fact label="Project">{program.project_code}</Fact>
                  <Fact label="Approval number">{program.approval_no}</Fact>
                  <Fact label="Product being reserved">{program.reserved_product_name}</Fact>
                  <Fact label="Segment">{program.segment_name}</Fact>
                  <Fact label="Costs">{program.cost_points ? amount(program.cost_points) + ' ' + (program.cost_point_type_code || '') : null}</Fact>
                  <Fact label="Numbers">
                    {(program.number_prefix || '') + (program.number_start === null ? '' : program.number_start) +
                      (program.number_end === null || program.number_end === undefined ? '' : ' - ' + program.number_end) + (program.number_suffix || '')}
                  </Fact>
                  <Fact label="Opens">{dateTime(program.starts_at)}</Fact>
                  <Fact label="Closes">{dateTime(program.ends_at)}</Fact>
                  <Fact label="Written by">{program.created_by_name}</Fact>
                  <Fact label="Approved by">{program.approved_by_name ? program.approved_by_name + '  ' + dateTime(program.approved_at) : null}</Fact>
                  <Fact label="Ranked by">{program.ranking_point_type_code ? program.ranking_point_type_code + '  ' + dateTime(program.ranking_cutoff_at) : null}</Fact>
                  <Fact label="Top how many">{program.ranking_top_n}</Fact>
                </Facts>
                {program.description ? <Text fontSize="sm" whiteSpace="pre-wrap">{program.description}</Text> : null}

                <Block
                  title={t('crm.program.tiers')}
                  hint={t('crm.program.tiersExplained')}
                  add={canWrite && inSetup ? () => ask(t('crm.program.addTier'), tierFields(), { rank_no: tiers.length + 1, min_value: 0, entries_per_target: 1 },
                    (values) => run(() => crm.programs.saveTier(pid, null, values))) : null}
                >
                  <DataTable
                    hidePagination
                    rows={tiers}
                    rowKey={(row) => row.program_tier_id}
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
                      { key: 'edit', label: t('common.edit'), onClick: (row) => ask(t('crm.program.editTier'), tierFields(), row,
                        (values) => run(() => crm.programs.saveTier(pid, row.program_tier_id, values))) },
                      { key: 'remove', label: t('common.remove'), onClick: (row) => remove('crm.program.removeTier', row.tier_name,
                        () => crm.programs.removeTier(pid, row.program_tier_id)) }
                    ] : []}
                    actionsIconOnly={false}
                  />
                </Block>

                <Block
                  title={t('crm.program.sites')}
                  hint={t('crm.program.sitesExplained')}
                  add={canWrite && live ? () => ask(t('crm.program.addSite'), [
                    { name: 'service_location_id', label: 'Service location', type: 'select', required: true, options: sites, isSearchable: true },
                    { name: 'location_role', label: 'Role', type: 'select', required: true, isClearable: false,
                      options: choices(['PICKUP', 'SALE', 'EVENT_VENUE', 'DELIVERY_HUB']) }
                  ], { location_role: 'PICKUP' }, (values) => run(() => crm.programs.addLocation(pid, values))) : null}
                >
                  <DataTable
                    hidePagination
                    rows={record.locations || []}
                    rowKey={(row) => row.program_location_id}
                    columns={[
                      { key: 'location_code', label: 'Code' },
                      { key: 'location_name', label: 'Service location' },
                      { key: 'location_role', label: 'Role', render: (row) => word(t, row.location_role) }
                    ]}
                    actions={canWrite && live ? [
                      { key: 'remove', label: t('common.remove'), onClick: (row) => remove('crm.program.removeSite', row.location_name,
                        () => crm.programs.removeLocation(pid, row.program_location_id)) }
                    ] : []}
                    actionsIconOnly={false}
                  />
                </Block>

                <Block
                  title={t('crm.program.quotas')}
                  hint={t('crm.program.quotasExplained')}
                  add={canWrite && live ? () => ask(t('crm.program.addQuota'), quotaFields(), { entry_type: 'NORMAL' },
                    (values) => run(() => crm.programs.saveQuota(pid, null, values))) : null}
                >
                  <DataTable
                    hidePagination
                    rows={record.quotas || []}
                    rowKey={(row) => row.program_quota_id}
                    columns={[
                      { key: 'entry_type', label: 'Entry', render: (row) => word(t, row.entry_type) },
                      { key: 'tier_name', label: 'Tier', render: (row) => row.tier_name || t('crm.program.everyTier') },
                      { key: 'location_name', label: 'Service location', render: (row) => row.location_name || t('crm.program.everySite') },
                      { key: 'used_count', label: 'Used', isNumeric: true, render: (row) => number(row.used_count) + ' / ' + number(row.quota_count) }
                    ]}
                    actions={canWrite && live ? [
                      { key: 'edit', label: t('common.edit'), onClick: (row) => ask(t('crm.program.editQuota'), quotaFields(), row,
                        (values) => run(() => crm.programs.saveQuota(pid, row.program_quota_id, values))) },
                      { key: 'remove', label: t('common.remove'), hidden: (row) => row.used_count > 0,
                        onClick: (row) => remove('crm.program.removeQuota', word(t, row.entry_type), () => crm.programs.removeQuota(pid, row.program_quota_id)) }
                    ] : []}
                    actionsIconOnly={false}
                  />
                </Block>

                <Block
                  title={t('crm.program.rewards')}
                  add={canWrite && status !== 'FULFILLED' && status !== 'CANCELLED' ? () => ask(t('crm.program.addReward'), rewardFields(), { reward_type: 'PICKUP_GOODS', quantity_total: 1 },
                    (values) => run(() => crm.programs.saveReward(pid, null, values))) : null}
                >
                  <DataTable
                    hidePagination
                    rows={record.rewards || []}
                    rowKey={(row) => row.reward_id}
                    columns={[
                      { key: 'reward_name', label: 'Reward' },
                      { key: 'reward_type', label: 'Kind', render: (row) => word(t, row.reward_type) },
                      { key: 'tier_name', label: 'Tier', render: (row) => row.tier_name || t('crm.program.everyTier') },
                      { key: 'points', label: 'Points', render: (row) => (row.points ? amount(row.points) + ' ' + (row.point_type_code || '') : '-') },
                      { key: 'product_name', label: 'Product' },
                      { key: 'quantity_awarded', label: 'Awarded', isNumeric: true, render: (row) => number(row.quantity_awarded) + ' / ' + number(row.quantity_total) }
                    ]}
                    actions={canWrite ? [
                      { key: 'edit', label: t('common.edit'), onClick: (row) => ask(t('crm.program.editReward'), rewardFields(), row,
                        (values) => run(() => crm.programs.saveReward(pid, row.reward_id, values))) },
                      { key: 'remove', label: t('common.remove'), hidden: (row) => row.quantity_awarded > 0,
                        onClick: (row) => remove('crm.program.removeReward', row.reward_name, () => crm.programs.removeReward(pid, row.reward_id)) }
                    ] : []}
                    actionsIconOnly={false}
                  />
                </Block>
              </Stack>
            </TabPanel>

            <TabPanel px={0}>
              <Targets program={program} tierOptions={tierOptions} ask={ask} run={run} tick={tick} />
            </TabPanel>
            <TabPanel px={0}>
              <Entries program={program} programSites={programSites.length ? programSites : sites} ask={ask} run={run} tick={tick} />
            </TabPanel>
            <TabPanel px={0}>
              <Awards program={program} rewards={record.rewards || []} sites={programSites.length ? programSites : sites} ask={ask} run={run} tick={tick} />
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
      { name: 'program_tier_id', label: 'Only for tier', type: 'select', options: tierOptions },
      { name: 'service_location_id', label: 'Only at service location', type: 'select', options: programSites.length ? programSites : sites, isSearchable: true }
    ];
  }

  function rewardFields() {
    return [
      { name: 'reward_name', label: 'Reward', required: true, colSpan: 'full' },
      { name: 'reward_type', label: 'Kind', type: 'select', required: true, isClearable: false,
        options: choices(['PICKUP_GOODS', 'DELIVERABLE_GOODS', 'PRODUCT_COUPON', 'POINTS', 'WALLET_CREDIT']) },
      { name: 'quantity_total', label: 'How many there are', type: 'number', required: true },
      { name: 'program_tier_id', label: 'Only for tier', type: 'select', options: tierOptions },
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
  const t = useT();
  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="flex-end" mb={2}>
        <Box>
          <Text fontSize="sm" fontWeight="600">{title}</Text>
          {hint ? <Text fontSize="xs">{hint}</Text> : null}
        </Box>
        {add ? <Button size="xs" variant="subtle" onClick={add}>{t('crm.program.add')}</Button> : null}
      </Box>
      {children}
    </Box>
  );
}

function Targets({ program, tierOptions, ask, run, tick }) {
  const t = useT();
  const { canWrite } = usePermission(PAGE);
  const pid = program.activity_program_id;
  const inSetup = SETUP.indexOf(program.status) !== -1;
  const list = useList((params) => crm.programs.targets(pid, params), { page: 1, limit: 20 });
  const buildable = ['SEGMENT', 'POINT_RANKING', 'CORPORATE_GRADE', 'PRODUCT_REGISTRATION', 'LOCATION_ACTIVITY']
    .indexOf(program.eligibility_basis) !== -1;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (tick) list.reload(); }, [tick]);

  return (
    <Box>
      <Toolbar
        search={list.params.q}
        onSearch={(searchText) => list.setFilter({ q: searchText })}
        filters={filtersFor(t, [
          { key: 'status', label: 'Status', value: list.params.status, options: choices(['ELIGIBLE', 'NOTIFIED', 'EXHAUSTED', 'REVOKED']),
            onChange: (value) => list.setFilter({ status: value || undefined }) },
          { key: 'entry_type', label: 'Entry', value: list.params.entry_type, options: choices(['NORMAL', 'REWARD']),
            onChange: (value) => list.setFilter({ entry_type: value || undefined }) }
        ])}
        actions={canWrite && inSetup ? (
          <>
            {buildable ? (
              <Button size="sm" variant="subtle" onClick={() => run(() => crm.programs.buildTargets(pid).then(({ data }) => {
                list.reload();
                return data;
              }), 'crm.program.targetsBuilt')}>
                {t('crm.program.buildFromRule')}
              </Button>
            ) : null}
            <Button size="sm" variant="brand" onClick={() => ask(t('crm.program.addTarget'), [
              { name: 'party_id', label: 'Customer', type: 'custom', required: true, colSpan: 'full',
                render: (values, set) => <PartyPicker value={values.party_id} onChange={(value) => set('party_id', value)} /> },
              { name: 'entry_type', label: 'Entry', type: 'select', isClearable: false, options: choices(['NORMAL', 'REWARD']) },
              { name: 'program_tier_id', label: 'Tier', type: 'select', options: tierOptions },
              { name: 'allowed_count', label: 'Entries allowed', type: 'number' },
              { name: 'qualification_value', label: 'Qualifying value', type: 'number', step: '0.0001' },
              { name: 'note', label: 'Why', colSpan: 'full' }
            ], { entry_type: 'NORMAL', allowed_count: 1 }, (values) => run(() => crm.programs.addTarget(pid, values).then(() => list.reload())))}
            >
              {t('crm.program.addTarget')}
            </Button>
          </>
        ) : null}
      />
      <Box px="0.5rem" pb="0.5rem">
        <DataTable
          columns={[
            { key: 'party_name', label: 'Customer', render: (row) => (row.party_name || '-') + '  ' + (row.party_no || '') },
            { key: 'tier_name', label: 'Tier' },
            { key: 'entry_type', label: 'Entry', render: (row) => word(t, row.entry_type) },
            { key: 'used_count', label: 'Used', isNumeric: true, render: (row) => number(row.used_count) + ' / ' + number(row.allowed_count) },
            { key: 'qualification_value', label: 'Qualifying value', isNumeric: true, render: (row) => amount(row.qualification_value) },
            { key: 'qualification_rank', label: 'Rank', isNumeric: true },
            { key: 'source', label: 'Chosen by', render: (row) => word(t, row.source) },
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
          actions={canWrite && program.status !== 'FULFILLED' && program.status !== 'CANCELLED' ? [
            { key: 'revoke', label: t('crm.program.revoke'), hidden: (row) => row.status === 'REVOKED',
              onClick: (row) => run(() => crm.programs.revokeTarget(pid, row.activity_target_id).then(() => list.reload())) }
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
  RESERVED: 'crm.program.confirmEntry', PAID: 'crm.program.markPaid', FULFILLED: 'crm.program.markCollected',
  CANCELLED: 'crm.program.cancelEntry', EXPIRED: 'crm.program.markExpired', FAILED: 'crm.program.markFailed'
};

function Entries({ program, programSites, ask, run, tick }) {
  const t = useT();
  const { canWrite } = usePermission(PAGE);
  const pid = program.activity_program_id;
  const list = useList((params) => crm.programs.reservations(pid, params), { page: 1, limit: 20, dir: 'asc' });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (tick) list.reload(); }, [tick]);

  const moveEntry = (row, status) => {
    const fields = [];
    if (status === 'FULFILLED') {
      fields.push({ name: 'service_location_id', label: 'Collected at', type: 'select', options: programSites, isSearchable: true });
      fields.push({ name: 'product_instance_id', label: 'The unit handed over', type: 'custom', colSpan: 'full',
        render: (values, set) => <InstancePicker value={values.product_instance_id} onChange={(value) => set('product_instance_id', value)} /> });
    }
    fields.push({ name: 'note', label: 'Note', type: 'textarea', colSpan: 'full', required: status === 'CANCELLED' });
    ask(t(ENTRY_VERBS[status]) + '  ' + row.reservation_code, fields, { service_location_id: row.service_location_id },
      (values) => run(() => crm.programs.moveReservation(row.reservation_id, Object.assign({ status: status }, values)).then(() => list.reload())));
  };

  const actions = canWrite ? Object.keys(ENTRY_VERBS).map((status) => ({
    key: status,
    label: t(ENTRY_VERBS[status]),
    hidden: (row) => (ENTRY_MOVES[row.status] || []).indexOf(status) === -1,
    onClick: (row) => moveEntry(row, status)
  })) : [];

  return (
    <Box>
      <Toolbar
        search={list.params.q}
        onSearch={(searchText) => list.setFilter({ q: searchText })}
        filters={filtersFor(t, [
          { key: 'status', label: 'Status', value: list.params.status,
            options: choices(['PENDING', 'RESERVED', 'PAID', 'FULFILLED', 'CANCELLED', 'EXPIRED', 'FAILED']),
            onChange: (value) => list.setFilter({ status: value || undefined }) },
          { key: 'service_location_id', label: 'Service location', value: list.params.service_location_id, width: '14rem',
            options: programSites, onChange: (value) => list.setFilter({ service_location_id: value || undefined }) }
        ])}
        actions={canWrite && program.status === 'OPEN' ? (
          <Button size="sm" variant="brand" onClick={() => ask(t('crm.program.takeAnEntry'), [
            { name: 'party_id', label: 'Customer', type: 'custom', required: true, colSpan: 'full',
              render: (values, set) => <PartyPicker value={values.party_id} onChange={(value) => set('party_id', value)} /> },
            { name: 'entry_type', label: 'Entry', type: 'select', isClearable: false, options: choices(['NORMAL', 'REWARD']) },
            { name: 'service_location_id', label: 'Collect at', type: 'select', options: programSites, isSearchable: true },
            { name: 'holder_name', label: 'Name on the entry' },
            { name: 'holder_phone', label: 'Phone' },
            { name: 'holder_id_card', label: 'ID card number',
              help: 'Kept only as a fingerprint and a masked copy. One ID card, one entry per program.' }
          ], { entry_type: 'NORMAL' }, (values) => run(() => crm.programs.reserve(pid, values).then(() => list.reload()), 'crm.program.entryTaken'))}
          >
            {t('crm.program.takeAnEntry')}
          </Button>
        ) : null}
      />
      <Box px="0.5rem" pb="0.5rem">
        <DataTable
          columns={[
            { key: 'reservation_code', label: 'Number' },
            { key: 'party_name', label: 'Customer', render: (row) => (row.party_name || '-') + '  ' + (row.party_no || '') },
            { key: 'holder_name', label: 'Name on the entry' },
            { key: 'holder_id_card_masked', label: 'ID card' },
            { key: 'tier_name', label: 'Tier' },
            { key: 'entry_type', label: 'Entry', render: (row) => word(t, row.entry_type) },
            { key: 'location_name', label: 'Service location' },
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
  const t = useT();
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!reservationId) return;
    crm.programs.reservationEvents(reservationId).then(({ data }) => setRows(rowsOf(data))).catch(() => setRows([]));
  }, [reservationId]);
  return (
    <DataTable
      hidePagination
      rows={rows}
      rowKey={(row) => row.reservation_event_id}
      columns={[
        { key: 'occurred_at', label: 'When', render: (row) => dateTime(row.occurred_at) },
        { key: 'new_status', label: 'Status', render: (row) => word(t, row.new_status) },
        { key: 'manager_name', label: 'By' },
        { key: 'location_name', label: 'Service location' },
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
  READY: 'crm.program.readyToCollect', DISPATCHED: 'crm.program.dispatched', DELIVERED: 'crm.program.delivered',
  PICKED_UP: 'crm.program.pickedUp', CREDITED: 'crm.program.credited', FAILED: 'crm.program.markFailed',
  PENDING: 'crm.program.tryAgain', CANCELLED: 'crm.program.cancelAward'
};

function Awards({ program, rewards, sites, ask, run, tick }) {
  const t = useT();
  const { canWrite } = usePermission(PAGE);
  const pid = program.activity_program_id;
  const list = useList((params) => crm.programs.awards(pid, params), { page: 1, limit: 20, dir: 'desc' });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (tick) list.reload(); }, [tick]);

  const moveAward = (row, status) => {
    const fields = [];
    if (status === 'DISPATCHED') fields.push({ name: 'delivery_address', label: 'Delivery address', required: !row.delivery_address, colSpan: 'full' });
    if (status === 'CREDITED') fields.push({ name: 'external_credit_ref', label: 'Wallet transaction reference', required: true, colSpan: 'full' });
    if (!fields.length) {
      return run(() => crm.programs.moveAward(row.award_id, { status: status }).then(() => list.reload()));
    }
    return ask(t(AWARD_VERBS[status]), fields, { delivery_address: row.delivery_address },
      (values) => run(() => crm.programs.moveAward(row.award_id, Object.assign({ status: status }, values)).then(() => list.reload())));
  };

  return (
    <Box>
      <Toolbar
        search={list.params.q}
        onSearch={(searchText) => list.setFilter({ q: searchText })}
        filters={filtersFor(t, [
          { key: 'status', label: 'Status', value: list.params.status,
            options: choices(['PENDING', 'READY', 'DISPATCHED', 'DELIVERED', 'PICKED_UP', 'CREDITED', 'FAILED', 'CANCELLED']),
            onChange: (value) => list.setFilter({ status: value || undefined }) }
        ])}
        actions={canWrite && (program.status === 'OPEN' || program.status === 'CLOSED') ? (
          <Button size="sm" variant="brand" onClick={() => ask(t('crm.program.giveAReward'), [
            { name: 'reward_id', label: 'Reward', type: 'select', required: true,
              options: rewards.map((reward) => ({ value: reward.reward_id, label: reward.reward_name + '  (' + number(reward.quantity_total - reward.quantity_awarded) + ')' })) },
            { name: 'party_id', label: 'Customer', type: 'custom', colSpan: 'full',
              render: (values, set) => <PartyPicker value={values.party_id} onChange={(value) => set('party_id', value)} /> },
            { name: 'fulfilment_method', label: 'How it reaches them', type: 'select', isClearable: false,
              options: choices(['PICKUP', 'DELIVERY']), help: 'Points and wallet credit ignore this.' },
            { name: 'pickup_location_id', label: 'Collect at', type: 'select', options: sites, isSearchable: true },
            { name: 'recipient_name', label: 'Recipient' },
            { name: 'recipient_phone', label: 'Phone' },
            { name: 'delivery_address', label: 'Delivery address', colSpan: 'full' }
          ], { fulfilment_method: 'PICKUP' }, (values) => run(() => crm.programs.award(pid, values).then(() => list.reload())))}
          >
            {t('crm.program.giveAReward')}
          </Button>
        ) : null}
      />
      <Box px="0.5rem" pb="0.5rem">
        <DataTable
          columns={[
            { key: 'party_name', label: 'Customer', render: (row) => (row.party_name || '-') + '  ' + (row.party_no || '') },
            { key: 'reward_name', label: 'Reward' },
            { key: 'reward_type', label: 'Kind', render: (row) => word(t, row.reward_type) },
            { key: 'reservation_code', label: 'Entry' },
            { key: 'fulfilment_method', label: 'How', render: (row) => word(t, row.fulfilment_method) },
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
            label: t(AWARD_VERBS[status]),
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
