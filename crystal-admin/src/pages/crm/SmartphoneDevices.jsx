import React, { useEffect, useState } from 'react';
import { Alert, AlertIcon, Box, HStack, Select, Spinner, Text } from '@chakra-ui/react';
import * as Md from 'react-icons/md';

import { crm } from '../../api';
import { useT } from '../../i18n';
import { MiniTable } from './c360Cards';
import { Card360 } from './ui360';

/**
 * THE MOBILE DEVICES REGISTERED TO THE CUSTOMER IN SMARTPHONE_OFFLINE.
 *
 * Asked of that system by every SMARTPHONE_OFFLINE Account ID linked to the
 * customer (its "master ids"), on the Accounts tab - all of them in one call.
 * The CRM keeps none of it; with the remote mock on, the mock answers as the
 * system would.
 *
 * The list is fetched ONCE for the customer page (useSmartphoneDevices) and
 * shared: the Products tab's card shows it, with a choice of All accounts or
 * one Account ID, and the header's product count follows the same choice -
 * all devices by default. Choosing an account filters what was fetched; it
 * does not ask the system again.
 */
export function useSmartphoneDevices(partyPk, version) {
  const [state, setState] = useState(null);
  const [selected, setSelected] = useState('ALL');

  useEffect(() => {
    if (!partyPk) return undefined;
    let live = true;
    setState(null);
    crm.parties.smartphoneDevices(partyPk)
      .then(({ data }) => { if (live) setState(data || {}); })
      .catch((error) => { if (live) setState({ items: [], accounts: [], failed: error.message }); });
    return () => { live = false; };
  }, [partyPk, version]);

  /* A choice that no longer exists (an account unlinked since) falls back to All. */
  const accounts = (state && state.accounts) || [];
  const account = accounts.filter((row) => String(row.project_account_id) === String(selected))[0] || null;
  const items = (state && state.items) || [];
  const shown = account ? items.filter((row) => row.master_id === account.external_account_id) : items;
  return { state: state, loading: state === null, accounts: accounts, selected: account ? selected : 'ALL', setSelected: setSelected, account: account, shown: shown };
}

export default function SmartphoneDevicesCard({ devices }) {
  const translate = useT();
  const state = devices.state;
  const project = state && state.project;
  const title = project ? translate(project.project_name) : translate('crm.smartphoneDevices.title');

  const picker = devices.accounts.length > 1 ? (
    <Select size="sm" w="16rem" maxW="100%" borderRadius="md" value={devices.selected} onChange={(event) => devices.setSelected(event.target.value)}>
      <option value="ALL">{translate('crm.eshopOrders.allAccounts', { n: devices.accounts.length })}</option>
      {devices.accounts.map((row) => (
        <option key={row.project_account_id} value={row.project_account_id}>{row.external_account_id}</option>
      ))}
    </Select>
  ) : devices.accounts.length === 1 ? <Text fontSize="xs" color="gray.500">{devices.accounts[0].external_account_id}</Text> : null;

  return (
    <Card360 icon={Md.MdSmartphone} title={title} beside={picker}>
      {devices.loading ? <HStack justify="center" py={4}><Spinner size="sm" /></HStack> : (
        <Box>
          {!project && !state.failed ? <Alert status="info" fontSize="sm" mb={2} borderRadius="md"><AlertIcon />{translate('crm.smartphoneDevices.noProject')}</Alert> : null}
          {project && !devices.accounts.length ? <Alert status="info" fontSize="sm" mb={2} borderRadius="md"><AlertIcon />{translate('crm.smartphoneDevices.noAccounts')}</Alert> : null}
          {state.failed ? <Alert status="error" fontSize="sm" mb={2} borderRadius="md"><AlertIcon />{translate('crm.smartphoneDevices.unreachable')}</Alert> : null}
          {devices.accounts.length ? (
            <MiniTable
              rows={devices.shown}
              rowKey={(row) => row.master_id + ':' + (row.imei || row.device)}
              empty="crm.smartphoneDevices.noDevices"
              columns={[
                { key: 'master_id', label: 'Account ID' },
                { key: 'device', label: 'Device', render: (row) => <Text as="span" fontWeight="600">{row.device || '-'}</Text> },
                { key: 'color', label: 'Color', render: (row) => row.color || '-' },
                { key: 'imei', label: 'IMEI', render: (row) => <Text as="span" fontFamily="mono" fontSize="sm">{row.imei || '-'}</Text> },
                { key: 'created_at', label: 'Registered', render: (row) => row.created_at || '-' }
              ]}
            />
          ) : null}
        </Box>
      )}
    </Card360>
  );
}
