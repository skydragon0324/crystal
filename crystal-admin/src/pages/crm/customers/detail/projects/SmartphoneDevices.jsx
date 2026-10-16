import React, { useEffect, useState } from 'react';
import { Alert, AlertIcon, Box, HStack, Spinner, Text } from '@chakra-ui/react';
import * as Md from 'react-icons/md';

import { crm } from '../../../../../api';
import { useT } from '../../../../../i18n';
import { MiniTable } from '../c360Cards';
import AccountPicker from '../../../shared/AccountPicker';
import { Card360 } from '../../../shared/ui360';

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

/*
 * THE DEVICE'S COLOUR, painted: its name on a chip filled with the colour the
 * system sends (rgb, "#rrggbb"). The text is dark or light by the colour's
 * brightness so it stays readable; a thin border keeps white and silver
 * visible on a white page. With no rgb, the name alone.
 */
function ColorChip({ name, rgb }) {
  if (!rgb) return name || '-';
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(rgb.slice(at, at + 2), 16));
  const light = (0.299 * r + 0.587 * g + 0.114 * b) > 160;
  return (
    <Box as="span" display="inline-block" px={2} py={0.5} borderRadius="md" fontSize="xs" fontWeight="600" whiteSpace="nowrap"
      bg={rgb} color={light ? 'gray.800' : 'white'} borderWidth="1px" borderColor="blackAlpha.200" title={rgb}>
      {name || rgb}
    </Box>
  );
}

export default function SmartphoneDevicesCard({ devices }) {
  const translate = useT();
  const state = devices.state;
  const project = state && state.project;
  const title = project ? translate(project.project_name) : translate('crm.smartphoneDevices.title');

  const picker = <AccountPicker accounts={devices.accounts} value={devices.selected} onChange={devices.setSelected} />;

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
                { key: 'color', label: 'Color', render: (row) => <ColorChip name={row.color} rgb={row.rgb} /> },
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
