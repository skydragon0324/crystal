import React, { useState } from 'react';
import { Button, Icon, Tooltip, useToast } from '@chakra-ui/react';
import * as Md from 'react-icons/md';

import { crm } from '../../../../../api';
import { useT } from '../../../../../i18n';

/**
 * SYNC FROM SMARTPHONE_OFFLINE, one customer at a time.
 *
 * The system's getLevelInfo says, for each of the customer's linked accounts
 * there, its level (loyal_level), its grade (purchase_level) and its reward
 * points. Two buttons ask it:
 *
 *   kind="levels"   beside Add tier: each account put on its LEVEL and GRADE tier
 *   kind="points"   beside Add points: each account's reward points stored
 *
 * Shown only to a customer with a linked SMARTPHONE_OFFLINE account - the
 * only system with a sync for now. What changed, what the system did not
 * know and any value no tier has a code for are said in the toast.
 */
const SYNC = {
  levels: { call: (partyPk) => crm.parties.syncSmartphoneLevels(partyPk), named: 'crm.smartphoneSync.syncLevels', explained: 'crm.smartphoneSync.syncLevelsExplained' },
  points: { call: (partyPk) => crm.parties.syncSmartphonePoints(partyPk), named: 'crm.smartphoneSync.syncPoints', explained: 'crm.smartphoneSync.syncPointsExplained' }
};

/** Whether the customer has a live SMARTPHONE_OFFLINE account to sync. */
export function hasSmartphoneAccount(accounts) {
  return (accounts || []).some((account) => !account.unlinked_at && account.project_code === 'SMARTPHONE_OFFLINE');
}

export default function SmartphoneSyncButton({ kind, partyPk, accounts, onDone }) {
  const translate = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const sync = SYNC[kind];
  if (!sync || !hasSmartphoneAccount(accounts)) return null;

  const run = async () => {
    setBusy(true);
    try {
      const { data } = await sync.call(partyPk);
      const result = data || {};
      const lines = [kind === 'levels'
        ? translate('crm.smartphoneSync.levelsResult', { created: result.created || 0, changed: result.changed || 0, unchanged: result.unchanged || 0 })
        : translate('crm.smartphoneSync.pointsResult', { updated: result.updated || 0, unchanged: result.unchanged || 0 })];
      if ((result.not_found || []).length) lines.push(translate('crm.smartphoneSync.notFound', { accounts: result.not_found.join(', ') }));
      if ((result.unknown || []).length) {
        lines.push(translate('crm.smartphoneSync.noTier', {
          values: result.unknown.map((row) => (row.tier_kind === 'GRADE' ? translate('crm.smartphoneSync.grade') : translate('crm.smartphoneSync.level'))
            + ' ' + row.value + ' (' + row.external_account_id + ')').join(', ')
        }));
      }
      (result.problems || []).forEach((problem) => lines.push((problem.external_account_id ? problem.external_account_id + ': ' : '') + (problem.message || problem.status)));
      const partial = (result.not_found || []).length || (result.unknown || []).length || (result.problems || []).length;
      toast({ title: translate(sync.named), description: lines.join(' '), status: partial ? 'warning' : 'success', duration: 8000, isClosable: true });
      if (onDone) onDone();
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 8000, isClosable: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Tooltip hasArrow label={translate(sync.explained)}>
      <Button size="xs" variant="outline" colorScheme="brand" leftIcon={<Icon as={Md.MdSync} />} isLoading={busy} onClick={run}>
        {translate(sync.named)}
      </Button>
    </Tooltip>
  );
}
