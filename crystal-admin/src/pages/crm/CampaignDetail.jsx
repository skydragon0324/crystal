import React, { useCallback, useEffect, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Box, Button, SimpleGrid, Stack, Text, useDisclosure, useToast } from '@chakra-ui/react';

import Card from '../../components/Card';
import DataTable from '../../components/DataTable';
import FormModal from '../../components/FormModal';
import StatTile from '../../components/StatTile';
import { useConfirm } from '../../components/ConfirmDialog';
import usePermission from '../../hooks/usePermission';
import { crm } from '../../api';
import { useT } from '../../i18n';
import { dateTime, money, number } from '../../utils/format';
import { Fact, Facts, Pending, RecordHeader, Status, choices, localInput, optionsFrom, useCrmMeta, word } from './shared';
import { RuleEditor } from './Segments';
import { CAMPAIGN_TYPES } from './Campaigns';

const PAGE = '/admin/crm/campaigns';

const MOVES = {
  DRAFT: [['APPROVED', 'crm.campaign.approve'], ['CANCELLED', 'crm.campaign.cancelCampaign']],
  APPROVED: [['ACTIVE', 'crm.campaign.start'], ['DRAFT', 'crm.campaign.backToDraft'], ['CANCELLED', 'crm.campaign.cancelCampaign']],
  ACTIVE: [['COMPLETED', 'crm.campaign.complete'], ['CANCELLED', 'crm.campaign.cancelCampaign']]
};

/**
 * ONE CAMPAIGN: its audiences, its messages and what they cost.
 *
 * An AUDIENCE is frozen the moment it is added - the list of customers it
 * names is copied, so a segment re-evaluated tomorrow does not change who
 * this campaign was for. An ACTION is one message to one audience; preparing
 * it decides per customer whether they may be contacted, and why not when
 * they may not. The counts beside each action are that decision, summed.
 */
export default function CampaignDetail() {
  const t = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const history = useHistory();
  const { id } = useParams();
  const meta = useCrmMeta();
  const currentManager = useSelector((state) => (state.auth && state.auth.admin) || {});
  const { canWrite } = usePermission(PAGE);

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null);
  const [saving, setSaving] = useState(false);
  const [segments, setSegments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [rule, setRule] = useState({ all: [] });
  const modal = useDisclosure();

  const load = useCallback(() => {
    setLoading(true);
    crm.campaigns.get(id)
      .then(({ data }) => setDetail(data || null))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    crm.segments.options().then(({ data }) => setSegments(Array.isArray(data) ? data : [])).catch(() => {});
    crm.programs.options().then(({ data }) => setPrograms(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  const record = detail || {};
  const campaign = record.campaign;
  if (!campaign) return <Card><Pending loading={loading} /></Card>;

  const funnel = record.funnel || {};
  const open = ['COMPLETED', 'CANCELLED'].indexOf(campaign.campaign_status) === -1;
  const mine = String(campaign.created_by_manager_id) === String(currentManager.id);
  const audiences = record.audiences || [];

  const ask = (title, fields, initial, submit) => { setDialog({ title: title, fields: fields, initial: initial || {}, submit: submit }); modal.onOpen(); };

  const run = async (work, done) => {
    setSaving(true);
    try {
      const result = await work();
      toast({ title: t(done || 'Saved'), status: 'success', duration: 2500 });
      modal.onClose();
      load();
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
      tone: next === 'CANCELLED' ? 'danger' : 'info', title: t(verb),
      body: t(next === 'APPROVED' ? 'crm.campaign.approveExplained' : 'crm.campaign.moveExplained'),
      confirmLabel: t(verb)
    });
    if (agreed) run(() => crm.campaigns.transition(campaign.campaign_id, next));
  };

  const prepare = async (row) => {
    const agreed = await confirm({
      tone: 'info', title: t('crm.campaign.prepare'), body: t('crm.campaign.prepareExplained'),
      detail: row.action_name || word(t, row.channel_code), confirmLabel: t('crm.campaign.prepare')
    });
    if (agreed) run(() => crm.campaigns.prepareAction(campaign.campaign_id, row.action_id), 'crm.campaign.prepared');
  };

  const audienceForm = () => {
    setRule({ all: [] });
    ask(t('crm.campaign.addAudience'), [
      { name: 'audience_name', label: 'Audience', required: true, colSpan: 'full' },
      { name: 'audience_type', label: 'Taken from', type: 'select', required: true, isClearable: false,
        options: choices(['SEGMENT', 'PROGRAM_TARGETS', 'RULE', 'MANUAL']) },
      { name: 'source_segment_id', label: 'Segment', type: 'select',
        options: segments.map((segment) => ({ value: segment.segment_id, label: segment.segment_name + '  (' + number(segment.member_count) + ')' })) },
      { name: 'source_activity_program_id', label: 'Program', type: 'select',
        options: programs.map((program) => ({ value: program.activity_program_id, label: program.program_name })) },
      { name: 'party_ids', label: 'Customer ids, for a list by hand', type: 'textarea', colSpan: 'full' },
      { name: 'rule', label: 'Rule, for a rule audience', type: 'custom', colSpan: 'full',
        render: () => <RuleEditor value={rule} onChange={setRule} /> }
    ], { audience_type: 'SEGMENT' }, (values) => run(() => crm.campaigns.addAudience(campaign.campaign_id,
      Object.assign({}, values, { rule_expression: values.audience_type === 'RULE' ? rule : undefined }))));
  };

  const actionFields = [
    { name: 'action_name', label: 'Message', required: true, colSpan: 'full' },
    { name: 'audience_id', label: 'Audience', type: 'select', required: true,
      options: audiences.map((audience) => ({ value: audience.audience_id, label: audience.audience_name + '  (' + number(audience.member_count) + ')' })) },
    { name: 'channel_id', label: 'Channel', type: 'select', required: true,
      options: optionsFrom(meta.channels, 'channel_id', 'channel_name') },
    { name: 'purpose_id', label: 'About', type: 'select', required: true,
      options: optionsFrom(meta.communication_purposes, 'purpose_id', 'purpose_name') },
    { name: 'scheduled_at', label: 'Send at', type: 'datetime-local' },
    { name: 'execution_order', label: 'Order', type: 'number' },
    { name: 'attribution_window_days', label: 'Days a result counts for', type: 'number' },
    { name: 'content_title', label: 'Title', colSpan: 'full' },
    { name: 'content_body', label: 'Text', type: 'textarea', rows: 5, colSpan: 'full' },
    { name: 'landing_page_url', label: 'Link', colSpan: 'full' }
  ];

  return (
    <Box>
      <RecordHeader
        onBack={() => history.push(PAGE)}
        title={campaign.campaign_name}
        subtitle={campaign.campaign_code + '  ·  ' + word(t, campaign.campaign_type) + (campaign.project_code ? '  ·  ' + campaign.project_code : '')}
        badges={<Status value={campaign.campaign_status} />}
        actions={canWrite ? (
          <>
            {open ? (
              <Button size="sm" variant="subtle" onClick={() => ask(t('crm.campaign.editCampaign'), [
                { name: 'campaign_name', label: 'Campaign', required: true },
                { name: 'campaign_type', label: 'Type', type: 'select', isClearable: false, options: choices(CAMPAIGN_TYPES) },
                { name: 'start_at', label: 'Starts', type: 'datetime-local' },
                { name: 'end_at', label: 'Ends', type: 'datetime-local' },
                { name: 'description', label: 'Description', type: 'textarea', colSpan: 'full' }
              ], Object.assign({}, campaign, { start_at: localInput(campaign.start_at), end_at: localInput(campaign.end_at) }),
              (values) => run(() => crm.campaigns.update(campaign.campaign_id, values)))}
              >
                {t('common.edit')}
              </Button>
            ) : null}
            {(MOVES[campaign.campaign_status] || []).filter((transition) => !(transition[0] === 'APPROVED' && mine)).map((transition) => (
              <Button key={transition[0]} size="sm" variant={transition[0] === 'CANCELLED' || transition[0] === 'DRAFT' ? 'ghost' : 'brand'}
                colorScheme={transition[0] === 'CANCELLED' ? 'red' : undefined} onClick={() => move(transition[0], transition[1])}>
                {t(transition[1])}
              </Button>
            ))}
          </>
        ) : null}
      />

      <SimpleGrid columns={{ base: 2, md: 4, xl: 7 }} spacing={4} mb={4}>
        <StatTile label="Audience" value={number(funnel.audience)} />
        <StatTile label="Can be reached" value={number(funnel.reachable)} />
        <StatTile label="Sent" value={number(funnel.sent)} />
        <StatTile label="Responses" value={number(funnel.interactions)} />
        <StatTile label="Results" value={number(funnel.conversions)} />
        <StatTile label="Result value" value={money(funnel.conversion_value)} />
        <StatTile label="Cost" value={money(funnel.cost)} />
      </SimpleGrid>

      <Stack spacing={4}>
        <Card>
          <Facts>
            <Fact label="Owner">{campaign.owner_name}</Fact>
            <Fact label="Written by">{campaign.created_by_name}</Fact>
            <Fact label="Approved by">{campaign.approved_by_name ? campaign.approved_by_name + '  ' + dateTime(campaign.approved_at) : null}</Fact>
            <Fact label="Runs">{dateTime(campaign.start_at) + ' - ' + dateTime(campaign.end_at)}</Fact>
          </Facts>
          {campaign.description ? <Text fontSize="sm" mt={4} whiteSpace="pre-wrap">{campaign.description}</Text> : null}
          {campaign.campaign_status === 'DRAFT' && mine && canWrite ? (
            <Text fontSize="sm" mt={4}>{t('crm.campaign.needsAnotherApprover')}</Text>
          ) : null}
        </Card>

        <Card
          title={t('crm.campaign.audiences')}
          actions={canWrite && open ? <Button size="xs" variant="subtle" onClick={audienceForm}>{t('crm.campaign.addAudience')}</Button> : null}
        >
          <DataTable
            hidePagination
            rows={audiences}
            rowKey={(row) => row.audience_id}
            columns={[
              { key: 'audience_name', label: 'Audience' },
              { key: 'audience_type', label: 'Taken from', render: (row) => word(t, row.audience_type) },
              { key: 'segment_name', label: 'Source', render: (row) => row.segment_name || row.program_name || '-' },
              { key: 'member_count', label: 'Members', isNumeric: true, render: (row) => number(row.member_count) },
              { key: 'snapshot_at', label: 'Frozen', render: (row) => dateTime(row.snapshot_at) }
            ]}
          />
        </Card>

        <Card
          title={t('crm.campaign.messages')}
          actions={canWrite && open && audiences.length ? (
            <Button size="xs" variant="subtle" onClick={() => ask(t('crm.campaign.addMessage'), actionFields, { attribution_window_days: 14 },
              (values) => run(() => crm.campaigns.saveAction(campaign.campaign_id, null, values)))}>
              {t('crm.campaign.addMessage')}
            </Button>
          ) : null}
        >
          <Text fontSize="xs" mb={3}>{t('crm.campaign.noGateway')}</Text>
          <DataTable
            hidePagination
            rows={record.actions || []}
            rowKey={(row) => row.action_id}
            columns={[
              { key: 'action_name', label: 'Message' },
              { key: 'audience_name', label: 'Audience' },
              { key: 'channel_name', label: 'Channel', render: (row) => t(row.channel_name || '-') },
              { key: 'purpose_name', label: 'About', render: (row) => t(row.purpose_name || '-') },
              { key: 'scheduled_at', label: 'Send at', render: (row) => dateTime(row.scheduled_at) },
              { key: 'recipients', label: 'Prepared', render: (row) => tally(t, row.recipients) },
              { key: 'skipped', label: 'Skipped because', render: (row) => tally(t, row.skipped) },
              { key: 'action_status', label: 'Status', render: (row) => <Status value={row.action_status} /> }
            ]}
            actions={canWrite && open ? [
              { key: 'edit', label: t('common.edit'), hidden: (row) => row.action_status !== 'DRAFT',
                onClick: (row) => ask(t('crm.campaign.editMessage'), actionFields,
                  Object.assign({}, row, { content_title: row.content_title, content_body: row.content_body, scheduled_at: localInput(row.scheduled_at) }),
                  (values) => run(() => crm.campaigns.saveAction(campaign.campaign_id, row.action_id, values))) },
              { key: 'prepare', label: t('crm.campaign.prepare'), hidden: (row) => row.action_status !== 'DRAFT', onClick: prepare },
              { key: 'running', label: t('crm.campaign.markSending'), hidden: (row) => row.action_status !== 'READY',
                onClick: (row) => run(() => crm.campaigns.setActionStatus(campaign.campaign_id, row.action_id, 'RUNNING')) },
              { key: 'complete', label: t('crm.campaign.markSent'), hidden: (row) => row.action_status !== 'RUNNING',
                onClick: (row) => run(() => crm.campaigns.setActionStatus(campaign.campaign_id, row.action_id, 'COMPLETE')) },
              { key: 'cancel', label: t('common.cancel'), hidden: (row) => ['COMPLETE', 'CANCELLED'].indexOf(row.action_status) !== -1,
                onClick: (row) => run(() => crm.campaigns.setActionStatus(campaign.campaign_id, row.action_id, 'CANCELLED')) }
            ] : []}
            actionsMode="menu"
          />
        </Card>

        <Card
          title={t('crm.campaign.costs')}
          actions={canWrite ? (
            <Button size="xs" variant="subtle" onClick={() => ask(t('crm.campaign.addCost'), [
              { name: 'cost_type', label: 'Kind', type: 'select', required: true, isClearable: false,
                options: choices(['MEDIA', 'SMS', 'EMAIL_PROVIDER', 'COUPON', 'AGENCY', 'PRIZE', 'OTHER']) },
              { name: 'amount', label: 'Amount', type: 'number', step: '0.01', required: true },
              { name: 'currency_code', label: 'Currency', type: 'select', options: optionsFrom(meta.currencies, 'currency_code', 'currency_code') },
              { name: 'occurred_at', label: 'When', type: 'datetime-local' },
              { name: 'action_id', label: 'For message', type: 'select',
                options: (record.actions || []).map((action) => ({ value: action.action_id, label: action.action_name || String(action.action_id) })) }
            ], { cost_type: 'MEDIA', currency_code: 'USD' }, (values) => run(() => crm.campaigns.addCost(campaign.campaign_id, values)))}
            >
              {t('crm.campaign.addCost')}
            </Button>
          ) : null}
        >
          <DataTable
            hidePagination
            rows={record.costs || []}
            rowKey={(row) => row.campaign_cost_id}
            columns={[
              { key: 'cost_type', label: 'Kind', render: (row) => word(t, row.cost_type) },
              { key: 'amount', label: 'Amount', isNumeric: true, render: (row) => money(row.amount, row.currency_code) },
              { key: 'occurred_at', label: 'When', render: (row) => dateTime(row.occurred_at) },
              { key: 'created_by_name', label: 'By' }
            ]}
            actions={canWrite ? [
              { key: 'remove', label: t('common.remove'),
                onClick: (row) => run(() => crm.campaigns.removeCost(campaign.campaign_id, row.campaign_cost_id), 'Deleted') }
            ] : []}
            actionsIconOnly={false}
          />
        </Card>
      </Stack>

      {dialog ? (
        <FormModal
          isOpen={modal.isOpen}
          onClose={modal.onClose}
          title={dialog.title}
          fields={dialog.fields}
          initial={dialog.initial}
          onSubmit={dialog.submit}
          saving={saving}
          size="3xl"
        />
      ) : null}
    </Box>
  );
}

/** { ELIGIBLE: 40, SKIPPED: 3 } as "Eligible 40, Skipped 3". */
function tally(t, counts) {
  const keys = Object.keys(counts || {});
  if (!keys.length) return '-';
  return keys.map((key) => word(t, key) + ' ' + number(counts[key])).join(', ');
}
