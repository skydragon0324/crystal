import React, { useState } from 'react';
import { Button, Icon, Tooltip, useToast } from '@chakra-ui/react';
import * as Md from 'react-icons/md';

import { crm } from '../../../../../api';
import { useT } from '../../../../../i18n';
import { useCrmMeta } from '../../../shared/shared';

/**
 * SYNC FROM THE PROJECTS' OWN SYSTEMS, one customer at a time.
 *
 *   kind="levels"   beside Add tier: every system the customer has a linked
 *                   account in, each account put on its LEVEL and GRADE tier -
 *                     SMARTPHONE_OFFLINE  level from its reward points, grade
 *                                         from purchase_level (getLevelInfo)
 *                     the e-shop          loyal_level and loyal_grade, dated by
 *                                         the shop's updated_at
 *   kind="points"   beside Add points: SMARTPHONE_OFFLINE's reward points
 *
 * Shown only to a customer with an account in a system that has the sync.
 * Each system is asked in turn and answers for itself: what changed, what it
 * did not know and any value no tier has a code for are said in the toast, a
 * line per system, and one system failing does not stop the other.
 *
 * Another system is one more entry in SYSTEMS - which accounts are its, and
 * its sync call - beside its own sync on the server.
 */
const SYSTEMS = {
  levels: [
    { has: (account) => account.project_code === 'SMARTPHONE_OFFLINE', call: (partyPk) => crm.parties.syncSmartphoneLevels(partyPk) },
    { has: (account, eshopId) => String(account.project_id) === String(eshopId), call: (partyPk) => crm.parties.syncEshopLevels(partyPk) }
  ],
  points: [
    { has: (account) => account.project_code === 'SMARTPHONE_OFFLINE', call: (partyPk) => crm.parties.syncSmartphonePoints(partyPk) }
  ]
};
const WORDS = {
  levels: { named: 'crm.projectSync.syncLevels', explained: 'crm.projectSync.syncLevelsExplained' },
  points: { named: 'crm.projectSync.syncPoints', explained: 'crm.projectSync.syncPointsExplained' }
};

export default function ProjectSyncButton({ kind, partyPk, accounts, onDone }) {
  const translate = useT();
  const toast = useToast();
  const meta = useCrmMeta();
  const [busy, setBusy] = useState(false);
  const eshopId = ((meta.projects || []).filter((project) => project.identity_role === 'ESHOP')[0] || {}).project_id;
  const live = (accounts || []).filter((account) => !account.unlinked_at);
  /* The systems this customer has an account in, each with the name of its project. */
  const systems = (SYSTEMS[kind] || []).map((system) => {
    const account = live.filter((row) => system.has(row, eshopId))[0];
    return account ? Object.assign({ name: translate(account.project_name || account.project_code || '') }, system) : null;
  }).filter(Boolean);
  if (!systems.length) return null;

  /* One system's answer, as a sentence or two. */
  const linesOf = (result) => {
    const lines = [kind === 'levels'
      ? translate('crm.projectSync.levelsResult', { created: result.created || 0, changed: result.changed || 0, unchanged: result.unchanged || 0 })
      : translate('crm.projectSync.pointsResult', { updated: result.updated || 0, unchanged: result.unchanged || 0 })];
    if ((result.not_found || []).length) lines.push(translate('crm.projectSync.notFound', { accounts: result.not_found.join(', ') }));
    if ((result.no_pk || []).length) lines.push(translate('crm.eshopOrders.noPk', { accounts: result.no_pk.join(', ') }));
    /* A level worked out from points, or a tier matched by its code: each says which it could not find. */
    const byPoints = (result.unknown || []).filter((row) => row.by === 'POINTS');
    const byCode = (result.unknown || []).filter((row) => row.by !== 'POINTS');
    if (byPoints.length) {
      lines.push(translate('crm.projectSync.noLevel', { values: byPoints.map((row) => row.value + ' (' + row.external_account_id + ')').join(', ') }));
    }
    if (byCode.length) {
      lines.push(translate('crm.projectSync.noTier', {
        values: byCode.map((row) => (row.tier_kind === 'GRADE' ? translate('crm.projectSync.grade') : translate('crm.projectSync.level'))
          + ' ' + row.value + ' (' + row.external_account_id + ')').join(', ')
      }));
    }
    (result.problems || []).forEach((problem) => lines.push((problem.external_account_id ? problem.external_account_id + ': ' : '') + (problem.message || problem.status)));
    const partial = (result.not_found || []).length || (result.no_pk || []).length || (result.unknown || []).length || (result.problems || []).length;
    return { text: lines.join(' '), partial: !!partial };
  };

  const run = async () => {
    setBusy(true);
    const answers = [];
    for (let index = 0; index < systems.length; index += 1) {
      const system = systems[index];
      try {
        // eslint-disable-next-line no-await-in-loop
        const { data } = await system.call(partyPk);
        const answer = linesOf(data || {});
        answers.push({ text: system.name + ': ' + answer.text, partial: answer.partial, failed: false });
      } catch (error) {
        answers.push({ text: system.name + ': ' + error.message, partial: true, failed: true });
      }
    }
    setBusy(false);
    const status = answers.every((answer) => answer.failed) ? 'error' : answers.some((answer) => answer.partial) ? 'warning' : 'success';
    toast({ title: translate(WORDS[kind].named), description: answers.map((answer) => answer.text).join('\n'), status: status, duration: 10000, isClosable: true });
    if (onDone && status !== 'error') onDone();
  };

  return (
    <Tooltip hasArrow label={translate(WORDS[kind].explained)}>
      <Button size="xs" variant="outline" colorScheme="brand" leftIcon={<Icon as={Md.MdSync} />} isLoading={busy} onClick={run}>
        {translate(WORDS[kind].named)}
      </Button>
    </Tooltip>
  );
}
