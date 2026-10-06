import React, { useCallback, useEffect, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import {
  Box, Button, HStack, IconButton, Input, Modal, ModalBody, ModalCloseButton, ModalContent, ModalFooter,
  ModalHeader, ModalOverlay, Stack, Text, useDisclosure, useToast
} from '@chakra-ui/react';
import { AddIcon, DeleteIcon } from '@chakra-ui/icons';

import Card from '../../components/Card';
import DataTable from '../../components/DataTable';
import FormModal from '../../components/FormModal';
import SelectField from '../../components/SelectField';
import Toolbar from '../../components/Toolbar';
import useList from '../../hooks/useList';
import usePermission from '../../hooks/usePermission';
import { crm } from '../../api';
import { useT } from '../../i18n';
import { dateTime, number } from '../../utils/format';
import { Fact, Facts, Status, choices, optionsFrom, rowsOf, useCrmMeta, filtersFor, translateOptions, partyIdLabel } from './shared';

export const PAGE = '/admin/crm/segments';

/* What each condition the server understands is called on screen. */
const FIELD_WORDS = {
  party_type: 'Customer type is',
  project_member: 'Has an account in project',
  tier: 'Holds tier in project',
  owns_class: 'Owns products of class',
  owns_no_class: 'Owns no product of class',
  points_balance: 'Point balance at least',
  service_cases: 'Service cases in the last days',
  no_service_cases: 'No service case in the last days',
  site_visits: 'Service location visits in the last days',
  registered_within: 'Registered a product in the last days',
  corporate_grade: 'Corporate grade rank at least',
  has_contact: 'Has a contact of type',
  consented: 'Agreed to be contacted'
};

const PARAM_WORDS = {
  value: 'Value', project: 'Project', tier: 'Tier', class: 'Class', min: 'At least', point_type: 'Point type',
  days: 'Days', activity: 'Activity', min_rank: 'Rank', type: 'Type', purpose: 'Purpose', channel: 'Channel'
};

/**
 * SEGMENTS - named rules over customers, kept as membership with dates.
 *
 * A rule is a list of conditions that must all (or any) hold. It is compiled
 * on the server from a fixed list of conditions - this editor offers exactly
 * those - and evaluated into membership: who joined, who left and when. A
 * changed rule is a new version, so the members a program or a campaign took
 * can always be traced back to the rule that chose them.
 */
export default function Segments() {
  const translate = useT();
  const toast = useToast();
  const history = useHistory();
  const location = useLocation();
  const meta = useCrmMeta();
  const form = useDisclosure();
  const { canWrite } = usePermission(PAGE);
  const [saving, setSaving] = useState(false);
  const [rule, setRule] = useState({ all: [] });

  const openId = new URLSearchParams(location.search).get('segment');
  const list = useList((params) => crm.segments.list(params), { page: 1, limit: 20, dir: 'desc' });

  const create = async (values) => {
    setSaving(true);
    try {
      const { data } = await crm.segments.create(Object.assign({}, values, { rule_expression: rule }));
      toast({ title: translate('Created'), status: 'success', duration: 2500 });
      form.onClose();
      list.reload();
      if (data && data.segment_id) history.push(PAGE + '?segment=' + data.segment_id);
      return true;
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 6000, isClosable: true });
      return false;
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card bodyProps={false}>
      <Toolbar
        search={list.params.q}
        onSearch={(searchText) => list.setFilter({ q: searchText })}
        filters={filtersFor(translate, [
          { key: 'status', label: 'Status', value: list.params.status, options: choices(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED']),
            onChange: (value) => list.setFilter({ status: value || undefined }) }
        ])}
        actions={canWrite ? (
          <Button size="sm" variant="brand" leftIcon={<AddIcon w="0.5625rem" h="0.5625rem" />}
            onClick={() => { setRule({ all: [] }); form.onOpen(); }}>
            {translate('crm.segments.newSegment')}
          </Button>
        ) : null}
      />
      <Box px="0.5rem" pb="0.5rem">
        <DataTable
          columns={[
            { key: 'segment_code', label: 'Code' },
            { key: 'segment_name', label: 'Segment', maxW: '16rem' },
            { key: 'project_code', label: 'Project' },
            { key: 'version_no', label: 'Version', isNumeric: true },
            { key: 'member_count', label: 'Members', isNumeric: true, render: (row) => number(row.member_count) },
            { key: 'last_evaluated_at', label: 'Evaluated', render: (row) => dateTime(row.last_evaluated_at) },
            { key: 'status', label: 'Status', render: (row) => <Status value={row.status} /> }
          ]}
          rows={list.rows}
          loading={list.loading}
          page={list.params.page}
          limit={list.params.limit}
          total={list.total}
          onPageChange={list.setPage}
          onLimitChange={(limit) => list.setFilter({ limit: limit })}
          rowKey={(row) => row.segment_id || row.id}
          onRowClick={(row) => history.push(PAGE + '?segment=' + (row.segment_id || row.id))}
          storageKey={PAGE}
        />
      </Box>

      <FormModal
        isOpen={form.isOpen}
        onClose={form.onClose}
        title={translate('crm.segments.newSegment')}
        initial={{ calculation_frequency: 'ON_DEMAND' }}
        onSubmit={create}
        saving={saving}
        size="3xl"
        fields={[
          { name: 'segment_code', label: 'Code', required: true },
          { name: 'segment_name', label: 'Segment', required: true },
          { name: 'project_id', label: 'Project', type: 'select', options: optionsFrom(meta.projects, 'project_id', 'project_name') },
          { name: 'calculation_frequency', label: 'Evaluated', type: 'select', isClearable: false,
            options: [{ value: 'ON_DEMAND', label: 'When asked' }, { value: 'DAILY', label: 'Daily' }, { value: 'WEEKLY', label: 'Weekly' }] },
          { name: 'segment_description', label: 'Description', type: 'textarea', colSpan: 'full' },
          { name: 'rule', label: 'Rule', type: 'custom', colSpan: 'full',
            render: () => <RuleEditor value={rule} onChange={setRule} /> }
        ]}
      />

      <SegmentDetail id={openId} onClose={() => { history.push(PAGE); list.reload(); }} />
    </Card>
  );
}

/**
 * THE RULE EDITOR - rows of conditions, all or any.
 *
 * It edits the JSON the server compiles and nothing more: a condition is a
 * field and its parameters, exactly as the server's list declares them, so
 * the editor cannot build a rule the server would refuse for its shape. It
 * can still build one that matches nobody, which is what the preview is for.
 */
export function RuleEditor({ value, onChange }) {
  const translate = useT();
  const meta = useCrmMeta();
  const [fields, setFields] = useState([]);
  const [count, setCount] = useState(null);

  useEffect(() => {
    crm.segments.fields().then(({ data }) => setFields(rowsOf(data))).catch(() => setFields([]));
  }, []);

  const group = value && value.any ? 'any' : 'all';
  const conditions = (value && (value.all || value.any)) || [];

  const write = (next, nextGroup) => {
    const out = {};
    out[nextGroup || group] = next;
    onChange(out);
    setCount(null);
  };

  const paramsOf = (field) => {
    const found = fields.filter((fieldInfo) => fieldInfo.field === field)[0];
    return found ? found.params : [];
  };

  /* A parameter that names a vocabulary is a select over it; anything else is typed. */
  const paramOptions = (param) => {
    switch (param) {
      case 'project': return optionsFrom(meta.projects, 'project_code', 'project_name');
      case 'class': return optionsFrom(meta.product_classes, 'class_code', 'class_name');
      case 'point_type': return optionsFrom(meta.point_types, 'point_type_code', 'point_type_name');
      case 'activity': return optionsFrom(meta.activity_types, 'activity_code', 'activity_name');
      case 'purpose': return optionsFrom(meta.communication_purposes, 'purpose_code', 'purpose_name');
      case 'channel': return optionsFrom(meta.channels, 'channel_code', 'channel_name');
      case 'tier': return optionsFrom(meta.project_tiers, 'tier_code', 'tier_name');
      case 'value': return choices(['PERSON', 'ORGANIZATION']);
      case 'type': return choices(['MOBILE', 'EMAIL', 'PHONE', 'WECHAT_ID', 'PUSH_TOKEN']);
      default: return null;
    }
  };

  const preview = async () => {
    try {
      const { data } = await crm.segments.preview(value);
      setCount((data || {}).members);
    } catch (error) {
      setCount(error.message);
    }
  };

  return (
    <Stack spacing={2}>
      <HStack>
        <Text fontSize="sm">{translate('crm.segments.customersMatching')}</Text>
        <Box w="10rem">
          <SelectField
            size="sm" isClearable={false} value={group}
            options={translateOptions(translate, [{ value: 'all', label: 'All of these' }, { value: 'any', label: 'Any of these' }])}
            onChange={(picked) => write(conditions, picked || 'all')}
          />
        </Box>
      </HStack>

      {conditions.map((condition, index) => (
        <HStack key={index + '-' + condition.field} align="flex-start" spacing={2} wrap="wrap">
          <Box w="15rem">
            <SelectField
              size="sm" isClearable={false} value={condition.field}
              options={translateOptions(translate, fields.map((fieldInfo) => ({ value: fieldInfo.field, label: FIELD_WORDS[fieldInfo.field] || fieldInfo.field })))}
              onChange={(picked) => write(conditions.map((existingCondition, position) => (position === index ? { field: picked } : existingCondition)))}
            />
          </Box>
          {paramsOf(condition.field).map((param) => {
            const options = paramOptions(param);
            const set = (picked) => write(conditions.map((existingCondition, position) => {
              if (position !== index) return existingCondition;
              const next = Object.assign({}, existingCondition);
              next[param] = picked;
              return next;
            }));
            return (
              <Box key={param} w={options ? '12rem' : '7rem'}>
                {options ? (
                  <SelectField size="sm" value={condition[param] || null} options={translateOptions(translate, options)}
                    placeholder={translate(PARAM_WORDS[param] || param)} onChange={(picked) => set(picked)} />
                ) : (
                  <Input size="sm" value={condition[param] === undefined ? '' : condition[param]}
                    placeholder={translate(PARAM_WORDS[param] || param)} onChange={(event) => set(event.target.value)} />
                )}
              </Box>
            );
          })}
          <IconButton size="sm" variant="ghost" icon={<DeleteIcon />} aria-label={translate('common.remove')}
            onClick={() => write(conditions.filter((existingCondition, position) => position !== index))} />
        </HStack>
      ))}

      <HStack>
        <Button size="xs" variant="subtle" leftIcon={<AddIcon w="0.5rem" h="0.5rem" />}
          onClick={() => write(conditions.concat([{ field: 'owns_class', min: 1 }]))}>
          {translate('crm.segments.addCondition')}
        </Button>
        <Button size="xs" variant="ghost" isDisabled={!conditions.length} onClick={preview}>{translate('crm.segments.preview')}</Button>
        {count === null ? null : (
          <Text fontSize="xs">{typeof count === 'number' ? translate('crm.segments.wouldMatch', { n: number(count) }) : count}</Text>
        )}
      </HStack>
    </Stack>
  );
}

function SegmentDetail({ id, onClose }) {
  const translate = useT();
  const toast = useToast();
  const { canWrite } = usePermission(PAGE);
  const [detail, setDetail] = useState(null);
  const [past, setPast] = useState(false);
  const [editing, setEditing] = useState(false);
  const [rule, setRule] = useState({ all: [] });
  const [busy, setBusy] = useState(false);

  const members = useList((params) => (id ? crm.segments.members(id, params) : Promise.resolve({ data: { rows: [], total: 0 } })),
    { page: 1, limit: 10 });

  const load = useCallback(() => {
    if (!id) { setDetail(null); return; }
    crm.segments.get(id).then(({ data }) => setDetail(data || null)).catch(() => setDetail(null));
  }, [id]);

  useEffect(() => { load(); }, [load]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (id) members.setFilter({ past: past ? '1' : undefined }); }, [id, past]);

  const record = detail || {};
  const segment = record.segment || {};
  const versions = record.versions || [];

  const act = async (work, done) => {
    setBusy(true);
    try {
      const result = await work();
      toast({ title: done ? translate(done) : translate('Saved'), status: 'success', duration: 2500 });
      load();
      members.reload();
      return result;
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 6000, isClosable: true });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const current = versions.filter((version) => version.segment_version_id === segment.current_version_id)[0];

  return (
    <Modal isOpen={!!id} onClose={onClose} size="4xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{segment.segment_name || translate('crm.segments.segment')}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Stack spacing={5}>
            <Facts>
              <Fact label="Code">{segment.segment_code}</Fact>
              <Fact label="Status">{segment.status ? <Status value={segment.status} /> : null}</Fact>
              <Fact label="Members">{number(segment.member_count)}</Fact>
              <Fact label="Evaluated">{dateTime(segment.last_evaluated_at)}</Fact>
            </Facts>
            {segment.segment_description ? <Text fontSize="sm">{segment.segment_description}</Text> : null}

            <Box>
              <Text fontSize="sm" fontWeight="600" mb={2}>{translate('crm.segments.currentRule')}</Text>
              {editing ? <RuleEditor value={rule} onChange={setRule} /> : (
                <Box as="pre" fontSize="xs" whiteSpace="pre-wrap" p={3} borderWidth="1px" borderRadius="md">
                  {current ? JSON.stringify(current.rule_expression, null, 2) : '-'}
                </Box>
              )}
            </Box>

            <Box>
              <Box display="flex" justifyContent="space-between" mb={2}>
                <Text fontSize="sm" fontWeight="600">{translate(past ? 'crm.segments.pastMembers' : 'crm.segments.members')}</Text>
                <Button size="xs" variant="ghost" onClick={() => setPast(!past)}>
                  {translate(past ? 'crm.segments.showCurrent' : 'crm.segments.showPast')}
                </Button>
              </Box>
              <DataTable
                columns={[
                  { key: 'party_name', label: 'Customer', render: (row) => (row.party_name || '-') + '  ' + partyIdLabel(row.party_pk) },
                  { key: 'matched_at', label: 'Joined', render: (row) => dateTime(row.matched_at) },
                  { key: 'unmatched_at', label: 'Left', render: (row) => dateTime(row.unmatched_at) }
                ]}
                rows={members.rows}
                loading={members.loading}
                page={members.params.page}
                limit={members.params.limit}
                total={members.total}
                onPageChange={members.setPage}
                rowKey={(row) => row.segment_membership_id || row.id}
              />
            </Box>

            <Box>
              <Text fontSize="sm" fontWeight="600" mb={2}>{translate('crm.segments.versions')}</Text>
              <DataTable
                hidePagination
                rows={versions}
                rowKey={(row) => row.segment_version_id}
                columns={[
                  { key: 'version_no', label: 'Version', isNumeric: true },
                  { key: 'effective_from', label: 'From', render: (row) => dateTime(row.effective_from) },
                  { key: 'effective_to', label: 'Until', render: (row) => dateTime(row.effective_to) },
                  { key: 'created_by_name', label: 'By' }
                ]}
              />
            </Box>
          </Stack>
        </ModalBody>
        {canWrite && segment.segment_id ? (
          <ModalFooter>
            <HStack spacing={2}>
              {editing ? (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>{translate('common.cancel')}</Button>
                  <Button size="sm" variant="brand" isLoading={busy}
                    onClick={() => act(() => crm.segments.newVersion(segment.segment_id, rule)).then((succeeded) => { if (succeeded) setEditing(false); })}>
                    {translate('crm.segments.saveAsNewVersion')}
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" variant="ghost"
                    onClick={() => act(() => crm.segments.update(segment.segment_id, { status: segment.status === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED' }))}>
                    {translate(segment.status === 'ARCHIVED' ? 'crm.segments.unarchive' : 'crm.segments.archive')}
                  </Button>
                  <Button size="sm" variant="subtle"
                    onClick={() => { setRule(current ? current.rule_expression : { all: [] }); setEditing(true); }}>
                    {translate('crm.segments.changeRule')}
                  </Button>
                  <Button size="sm" variant="brand" isLoading={busy} isDisabled={segment.status === 'ARCHIVED'}
                    onClick={() => act(() => crm.segments.evaluate(segment.segment_id), 'crm.segments.evaluated')}>
                    {translate('crm.segments.evaluateNow')}
                  </Button>
                </>
              )}
            </HStack>
          </ModalFooter>
        ) : null}
      </ModalContent>
    </Modal>
  );
}
