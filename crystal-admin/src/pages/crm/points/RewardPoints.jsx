import React, { useEffect, useState } from 'react';
import {
  Box, Button, Collapse, Flex, HStack, Icon, IconButton, Spinner, Text, Tooltip, useToast
} from '@chakra-ui/react';
import * as Md from 'react-icons/md';

import FormModal from '../../../components/FormModal';
import { crm } from '../../../api';
import { useT } from '../../../i18n';
import { dateTime, number } from '../../../utils/format';
import { amount } from '../shared/shared';
import { MiniTable } from '../customers/detail/c360Cards';
import { Card360 } from '../shared/ui360';
import { ProjectTags } from '../shared/ui';

/**
 * REWARD POINTS PER BUSINESS SYSTEM.
 *
 * Each business system keeps its own points by its own rules; the CRM keeps
 * only how many points each of the customer's accounts holds there. The
 * company-wide score is worked out from those figures and each project's
 * point weight (Settings > Projects) - it is never stored, so it is always
 * the sum of the rows shown under it.
 */

/*
 * The CRM's own points ledger (earning rules, event costs and awards) is not
 * part of the company-wide score and is set aside for now: its tabs and cards
 * are hidden, its tables and code left as they are. True shows them again.
 */
export const SHOW_CRM_LEDGER = false;

/* How a figure arrived. */
export const POINT_SOURCES = { MANUAL: 'Entered by hand', API: 'Sent by the project', IMPORT: 'Excel import' };

/** The score and what it leaves out, as one line under the figure. */
export function scoreNote(translate, points) {
  if (points.uncounted_systems) return translate('crm.points.notCountedN', { n: number(points.uncounted_systems) });
  return translate('crm.points.fromNSystems', { n: number(points.counted_systems || 0) });
}

/** The rows behind a score: system, account, points, weight and what they count for company-wide. */
export function RewardPointsTable({ rows, onEdit, onDelete }) {
  const translate = useT();
  const editable = !!(onEdit || onDelete);
  const columns = [
    { key: 'project_name', label: 'Business system', render: (row) => (
      <HStack spacing={2}><ProjectTags codes={[row.project_code]} /><Text as="span">{translate(row.project_name || '')}</Text></HStack>
    ) },
    { key: 'external_account_id', label: 'Account ID' },
    { key: 'points', label: 'Points', isNumeric: true, render: (row) => (
      <Tooltip hasArrow label={translate('crm.points.reportedAsOf', { date: dateTime(row.as_of), source: translate(POINT_SOURCES[row.source] || row.source || '-') })}>
        <Text as="span">{amount(row.points, 2)}</Text>
      </Tooltip>
    ) },
    { key: 'point_weight', label: 'Point weight', isNumeric: true, render: (row) => (row.point_weight === null || row.point_weight === undefined
      ? <Tooltip hasArrow label={translate('crm.points.noWeightExplained')}><Text as="span" color="gray.500">{translate('crm.points.noWeight')}</Text></Tooltip>
      : '× ' + Number(row.point_weight)) },
    { key: 'company_points', label: 'Company-wide points', isNumeric: true, render: (row) => (row.company_points === null || row.company_points === undefined
      ? '-' : <Text as="span" fontWeight="700">{amount(row.company_points, 2)}</Text>) },
    { key: 'note', label: 'Note', maxW: '14rem' }
  ];
  if (editable) {
    columns.push({ key: 'actions', label: 'Actions', render: (row) => (
      <HStack spacing={0}>
        {onEdit ? <IconButton size="xs" variant="ghost" icon={<Icon as={Md.MdEdit} />} aria-label={translate('crm.points.editPoints')} title={translate('crm.points.editPoints')} onClick={() => onEdit(row)} /> : null}
        {onDelete ? <IconButton size="xs" variant="ghost" colorScheme="red" icon={<Icon as={Md.MdDelete} />} aria-label={translate('crm.points.removePoints')} title={translate('crm.points.removePoints')} onClick={() => onDelete(row)} /> : null}
      </HStack>
    ) });
  }
  return <MiniTable rows={rows} rowKey={(row) => row.reward_points_id} columns={columns} />;
}

/**
 * The customer's company-wide score, with the rows it is made of one click
 * away. Administrators add, correct and remove the rows here until the
 * business systems send them.
 */
export function RewardPointsCard({ record, view, act }) {
  const translate = useT();
  const toast = useToast();
  const points = view.points || { rows: [] };
  const rows = points.rows || [];
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const partyPk = record.party.party_pk;

  /* Accounts that can still be given points: linked, and without a row yet. */
  const taken = rows.map((row) => String(row.project_account_id));
  const free = (record.accounts || []).filter((account) => !account.unlinked_at && taken.indexOf(String(account.project_account_id)) < 0);

  const save = async (values) => {
    setSaving(true);
    try {
      const payload = { points: values.points, as_of: values.as_of || null, note: values.note || null };
      if (editing.reward_points_id) await crm.rewardPoints.update(partyPk, editing.reward_points_id, payload);
      else await crm.rewardPoints.add(partyPk, Object.assign({ project_account_id: values.project_account_id }, payload));
      toast({ title: translate('crm.points.pointsSaved'), status: 'success', duration: 2500 });
      setEditing(null);
      setOpen(true);
      act.refresh();
      return true;
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 6000, isClosable: true });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const remove = (row) => act.ask('crm.points.removePoints', 'crm.points.removePointsExplained', row.project_code + '  ' + row.external_account_id,
    () => crm.rewardPoints.remove(partyPk, row.reward_points_id), 'danger');

  const adding = editing && !editing.reward_points_id;
  return (
    <Card360 icon={Md.MdStars} title={translate('crm.points.rewardPoints')}
      action={act.editable ? (
        <Button size="xs" variant="outline" leftIcon={<Icon as={Md.MdAdd} />} isDisabled={!free.length}
          title={free.length ? undefined : translate('crm.points.everyAccountHasPoints')}
          onClick={() => setEditing({ project_account_id: free.length === 1 ? free[0].project_account_id : null })}>
          {translate('crm.points.addPoints')}
        </Button>
      ) : null}>
      <Flex as="button" type="button" w="100%" align="center" justify="space-between" textAlign="left" onClick={() => setOpen(!open)}
        aria-expanded={open} py={1}>
        <Box>
          <Text fontSize="xs" color="gray.500">{translate('crm.points.companyWide')}</Text>
          <Text fontSize="2xl" fontWeight="800" style={{ fontVariantNumeric: 'tabular-nums' }}>{amount(points.company_points || 0, 2)}</Text>
          <Text fontSize="xs" color={points.uncounted_systems ? 'orange.500' : 'gray.500'}>{rows.length ? scoreNote(translate, points) : translate('crm.points.noPointsYet')}</Text>
        </Box>
        {rows.length ? (
          <HStack spacing={1} color="brand.500" fontSize="sm">
            <Text as="span">{translate(open ? 'crm.points.hideDetails' : 'crm.points.showDetails', { n: rows.length })}</Text>
            <Icon as={open ? Md.MdExpandLess : Md.MdExpandMore} boxSize="1.25rem" />
          </HStack>
        ) : null}
      </Flex>
      <Collapse in={open && rows.length > 0} animateOpacity>
        <Box mt={3}>
          <RewardPointsTable rows={rows}
            onEdit={act.editable ? (row) => setEditing(Object.assign({}, row, { points: Number(row.points), as_of: row.as_of ? String(row.as_of).slice(0, 10) : '' })) : null}
            onDelete={act.editable ? remove : null} />
        </Box>
      </Collapse>

      <FormModal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title={translate(adding ? 'crm.points.addPoints' : 'crm.points.editPoints')}
        size="lg"
        initial={editing || {}}
        onSubmit={save}
        saving={saving}
        fields={[
          adding
            ? { name: 'project_account_id', label: 'Business system account', type: 'select', required: true, colSpan: 'full',
              options: free.map((account) => ({ value: account.project_account_id, label: translate(account.project_name || account.project_code) + '  ·  ' + account.external_account_id })),
              help: 'One of the customer\'s linked accounts. Link the account first on this tab if it is not listed.' }
            : { name: 'account', label: 'Business system account', type: 'custom', colSpan: 'full',
              render: () => <Text fontSize="sm" fontWeight="600">{editing ? translate(editing.project_name || editing.project_code) + '  ·  ' + editing.external_account_id : ''}</Text> },
          { name: 'points', label: 'Points', type: 'number', step: '0.0001', required: true,
            help: 'The points this account holds in its business system now.' },
          { name: 'as_of', label: 'As of', type: 'date', help: 'When the figure was true. Empty means now.' },
          { name: 'note', label: 'Note', type: 'textarea', colSpan: 'full', help: 'Where the figure came from, for whoever checks it later.' }
        ]}
      />
    </Card360>
  );
}

/** One customer's rows, read when their line on the Points page is opened. */
export function PartyRewardPoints({ partyPk }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let live = true;
    crm.rewardPoints.ofParty(partyPk).then(({ data }) => { if (live) setRows((data && data.rows) || []); }).catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [partyPk]);
  if (rows === null) return <Flex justify="center" py={3}><Spinner size="sm" /></Flex>;
  return <Box px={2} py={1}><RewardPointsTable rows={rows} /></Box>;
}
