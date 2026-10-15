import React, { useEffect, useState } from 'react';
import { Alert, AlertIcon, Box, HStack, Spinner, Text } from '@chakra-ui/react';
import * as Md from 'react-icons/md';

import { crm } from '../../api';
import { useT } from '../../i18n';
import { formatPhone } from '../../utils/format';
import AccountPicker from './AccountPicker';
import { MiniTable } from './c360Cards';
import { Card360 } from './ui360';

/**
 * THE PRIVILEGES TAB - the privileges of the customer's devices in
 * SMARTPHONE_OFFLINE.
 *
 * Asked of that system, like the devices and the service table, by every
 * SMARTPHONE_OFFLINE Account ID linked to the customer - in one call. The CRM
 * keeps none of it; with the remote mock on, the mock answers as the system
 * would. All accounts are shown by default; choosing one Account ID filters
 * what was fetched without asking again.
 */
export default function PrivilegesTab({ record, act }) {
  const translate = useT();
  const partyPk = record.party && record.party.party_pk;
  const [state, setState] = useState(null);
  const [selected, setSelected] = useState('ALL');

  useEffect(() => {
    if (!partyPk) return undefined;
    let live = true;
    setState(null);
    crm.parties.smartphonePrivileges(partyPk)
      .then(({ data }) => { if (live) setState(data || {}); })
      .catch((error) => { if (live) setState({ items: [], accounts: [], failed: error.message }); });
    return () => { live = false; };
  }, [partyPk, act.version]);

  const accounts = (state && state.accounts) || [];
  const account = accounts.filter((row) => String(row.project_account_id) === String(selected))[0] || null;
  const items = (state && state.items) || [];
  const shown = account ? items.filter((row) => row.master_id === account.external_account_id) : items;
  const project = state && state.project;

  return (
    <Card360 icon={Md.MdCardGiftcard} title={translate('crm.smartphonePrivileges.title')}
      beside={<AccountPicker accounts={accounts} value={account ? selected : 'ALL'} onChange={setSelected} />}>
      {state === null ? <HStack justify="center" py={4}><Spinner size="sm" /></HStack> : (
        <Box>
          {!project && !state.failed ? <Alert status="info" fontSize="sm" mb={2} borderRadius="md"><AlertIcon />{translate('crm.smartphoneDevices.noProject')}</Alert> : null}
          {project && !accounts.length ? <Alert status="info" fontSize="sm" mb={2} borderRadius="md"><AlertIcon />{translate('crm.smartphonePrivileges.noAccounts')}</Alert> : null}
          {state.failed ? <Alert status="error" fontSize="sm" mb={2} borderRadius="md"><AlertIcon />{translate('crm.smartphoneDevices.unreachable')}</Alert> : null}
          {accounts.length ? (
            <MiniTable
              rows={shown}
              rowKey={(row) => row.master_id + ':' + (row.imei || '') + ':' + (row.title || '')}
              empty="crm.smartphonePrivileges.noRecords"
              maxH="36rem"
              columns={[
                { key: 'master_id', label: 'Account ID' },
                { key: 'model', label: 'Device Type', render: (row) => <Text as="span" fontWeight="600">{row.model || '-'}</Text> },
                { key: 'phone_number', label: 'Phone Number', render: (row) => formatPhone(row.phone_number) || '-' },
                { key: 'imei', label: 'IMEI', render: (row) => <Text as="span" fontFamily="mono" fontSize="sm">{row.imei || '-'}</Text> },
                { key: 'color', label: 'Device Color', render: (row) => row.color || '-' },
                { key: 'title', label: 'Service Summary', render: (row) => <Text as="span" fontSize="sm">{row.title || '-'}</Text> }
              ]}
            />
          ) : null}
        </Box>
      )}
    </Card360>
  );
}
