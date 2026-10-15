import React, { useEffect, useState } from 'react';
import { useToast } from '@chakra-ui/react';

import FormModal from '../../components/FormModal';
import { crm } from '../../api';
import { useT } from '../../i18n';
import { PartyPicker, useCrmMeta } from './shared';

/**
 * GIVING AN ACCOUNT A TIER, BY HAND.
 *
 * A project may rank its customers on several kinds of ladder (Settings >
 * Tier kinds), and ranks each of a customer's accounts there. So a tier is
 * given to one ACCOUNT, and the tier chosen says which kind of ladder it is
 * on: the account gets a place on that ladder, or - if it has one already -
 * moves to the new tier there, which then needs a reason. Every step is kept
 * in the tier history.
 *
 * `membership` set: change that membership's tier (same project and kind).
 * Otherwise add: for `partyPk` and its `accounts`, or - `pickCustomer` - for
 * a customer chosen in the dialog (the Memberships page).
 */
export default function TierDialog({ isOpen, onClose, partyPk, accounts, membership, pickCustomer, onSaved }) {
  const translate = useT();
  const toast = useToast();
  const meta = useCrmMeta();
  const [values, setValues] = useState({});
  const [picked, setPicked] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setPicked([]);
    setValues(membership ? { tier_id: membership.current_tier_id } : { party_pk: partyPk || null });
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  /* On the Memberships page the accounts are those of the customer chosen in the dialog. */
  const chosenParty = pickCustomer ? values.party_pk : partyPk;
  useEffect(() => {
    if (!isOpen || !pickCustomer) return undefined;
    if (!values.party_pk) { setPicked([]); return undefined; }
    let live = true;
    crm.parties.get(values.party_pk).then(({ data }) => { if (live) setPicked((data && data.accounts) || []); }).catch(() => { if (live) setPicked([]); });
    return () => { live = false; };
  }, [isOpen, pickCustomer, values.party_pk]);

  const liveAccounts = ((pickCustomer ? picked : accounts) || []).filter((account) => !account.unlinked_at);
  const account = liveAccounts.filter((row) => String(row.project_account_id) === String(values.project_account_id))[0] || null;
  const kindName = (code) => {
    const kind = (meta.tier_kinds || []).filter((row) => row.kind_code === code)[0];
    return kind ? translate(kind.kind_name) : code;
  };
  /* A change stays on its own ladder; an add offers every ladder of the account's project. */
  const tiers = (meta.project_tiers || []).filter((tier) => tier.is_active !== false && (membership
    ? String(tier.project_id) === String(membership.project_id) && tier.tier_kind === membership.tier_kind
    : account && String(tier.project_id) === String(account.project_id)));
  const tierOptions = tiers.map((tier) => ({ value: tier.project_tier_id, label: kindName(tier.tier_kind) + '  ·  ' + translate(tier.tier_name) }));

  const save = async (form) => {
    setSaving(true);
    try {
      if (membership) {
        await crm.memberships.setTier(membership.membership_id, form.tier_id, form.reason);
      } else {
        const payload = {
          project_account_id: form.project_account_id, tier_id: form.tier_id, reason: form.reason || null,
          joined_at: form.joined_at || null, external_member_id: form.external_member_id || null
        };
        if (pickCustomer) await crm.memberships.add(Object.assign({ party_pk: chosenParty }, payload));
        else await crm.parties.addTier(chosenParty, payload);
      }
      toast({ title: translate('crm.memberships.tierSaved'), status: 'success', duration: 2500 });
      if (onSaved) onSaved();
      onClose();
      return true;
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 6000, isClosable: true });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const fields = membership ? [
    { name: 'tier_id', label: 'Project tier', type: 'select', required: true, isClearable: false, colSpan: 'full', options: tierOptions,
      help: 'Only the tiers of this membership\'s own project and kind.' },
    { name: 'reason', label: 'Reason', type: 'textarea', required: true, colSpan: 'full' }
  ] : [
    pickCustomer ? { name: 'party_pk', label: 'Customer', type: 'custom', required: true, colSpan: 'full',
      render: (current, set) => <PartyPicker value={current.party_pk} onChange={(value) => { set('party_pk', value); set('project_account_id', null); set('tier_id', null); }} /> } : null,
    { name: 'project_account_id', label: 'Account', type: 'select', required: true, colSpan: 'full',
      options: liveAccounts.map((row) => ({ value: row.project_account_id, label: translate(row.project_name || row.project_code) + '  ·  ' + row.external_account_id })),
      help: chosenParty && !liveAccounts.length ? 'This customer has no linked account yet. Link one on the customer\'s Accounts tab first.' : 'The account the tier is held by.' },
    { name: 'tier_id', label: 'Project tier', type: 'select', required: true, colSpan: 'full', options: tierOptions,
      help: account && !tiers.length ? 'This project has no tiers yet. Add them under Settings > Project tiers.' : 'Kind · tier. The account holds one tier of each kind; choosing a kind it already has changes that tier.' },
    { name: 'reason', label: 'Reason', type: 'textarea', colSpan: 'full', help: 'Needed when the account already has a tier of this kind.' },
    { name: 'joined_at', label: 'Joined', type: 'date' },
    { name: 'external_member_id', label: 'Member number' }
  ].filter(Boolean);

  return (
    <FormModal
      isOpen={isOpen}
      onClose={onClose}
      title={translate(membership ? 'crm.memberships.changeTier' : 'crm.memberships.addTier')}
      values={values}
      onChange={setValues}
      onSubmit={save}
      saving={saving}
      fields={fields}
    />
  );
}
