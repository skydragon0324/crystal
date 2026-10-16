import React, { useEffect, useState } from 'react';
import { Alert, AlertIcon, Box, HStack, Spinner, Text } from '@chakra-ui/react';
import * as Md from 'react-icons/md';

import { crm } from '../../../../../api';
import { useT } from '../../../../../i18n';
import { useSurface } from '../../../../../theme/tokens';
import { dateTime, formatPhone, number } from '../../../../../utils/format';
import AccountPicker from '../../../shared/AccountPicker';
import { MiniTable } from '../c360Cards';
import { Card360 } from '../../../shared/ui360';

/**
 * THE SERVICE HISTORY OF THE CUSTOMER'S DEVICES IN SMARTPHONE_OFFLINE.
 *
 * Asked of that system, like the devices on the Products tab, by every
 * SMARTPHONE_OFFLINE Account ID linked to the customer - in one call. The CRM
 * keeps none of it; with the remote mock on, the mock answers as the system
 * would. All accounts are shown by default; choosing one Account ID filters
 * what was fetched without asking again.
 *
 * Six columns, several of the system's fields to a cell: who the service
 * point wrote down (name, phone, address), the device (model and both IMEIs),
 * the agency and when the job was opened and last updated, what was done and
 * the points it earned, and why the customer came.
 */
export default function SmartphoneServicesCard({ partyPk, version }) {
  const translate = useT();
  const surface = useSurface();
  const [state, setState] = useState(null);
  const [selected, setSelected] = useState('ALL');

  useEffect(() => {
    if (!partyPk) return undefined;
    let live = true;
    setState(null);
    crm.parties.smartphoneServices(partyPk)
      .then(({ data }) => { if (live) setState(data || {}); })
      .catch((error) => { if (live) setState({ items: [], accounts: [], failed: error.message }); });
    return () => { live = false; };
  }, [partyPk, version]);

  const accounts = (state && state.accounts) || [];
  const account = accounts.filter((row) => String(row.project_account_id) === String(selected))[0] || null;
  const items = (state && state.items) || [];
  const shown = account ? items.filter((row) => row.master_id === account.external_account_id) : items;
  const project = state && state.project;

  const lines = (first, rest) => (
    <Box minW={0}>
      <Text fontSize="sm" fontWeight="600" noOfLines={1}>{first || '-'}</Text>
      {rest.filter(Boolean).map((line, index) => <Text key={index} fontSize="xs" color={surface.muted} noOfLines={1}>{line}</Text>)}
    </Box>
  );

  return (
    <Card360 icon={Md.MdBuild} title={translate('crm.smartphoneServices.title')}
      beside={<AccountPicker accounts={accounts} value={account ? selected : 'ALL'} onChange={setSelected} />}>
      {state === null ? <HStack justify="center" py={4}><Spinner size="sm" /></HStack> : (
        <Box>
          {!project && !state.failed ? <Alert status="info" fontSize="sm" mb={2} borderRadius="md"><AlertIcon />{translate('crm.smartphoneDevices.noProject')}</Alert> : null}
          {project && !accounts.length ? <Alert status="info" fontSize="sm" mb={2} borderRadius="md"><AlertIcon />{translate('crm.smartphoneServices.noAccounts')}</Alert> : null}
          {state.failed ? <Alert status="error" fontSize="sm" mb={2} borderRadius="md"><AlertIcon />{translate('crm.smartphoneDevices.unreachable')}</Alert> : null}
          {accounts.length ? (
            <MiniTable
              rows={shown}
              rowKey={(row) => row.master_id + ':' + row.created_at + ':' + (row.imei_1 || row.reason_name)}
              empty="crm.smartphoneServices.noServices"
              maxH="32rem"
              columns={[
                { key: 'master_id', label: 'Account ID' },
                { key: 'customer_name', label: 'Customer Info',
                  render: (row) => lines(row.customer_name, [formatPhone(row.phone_number), row.address]) },
                { key: 'model_name', label: 'Device Type',
                  render: (row) => lines(row.model_name, [row.imei_1 ? 'IMEI 1  ' + row.imei_1 : null, row.imei_2 ? 'IMEI 2  ' + row.imei_2 : null]) },
                { key: 'agent_name', label: 'Agency',
                  render: (row) => lines(row.agent_name, [
                    row.created_at ? translate('crm.smartphoneServices.opened', { date: dateTime(row.created_at) }) : null,
                    row.updated_at ? translate('crm.smartphoneServices.updated', { date: dateTime(row.updated_at) }) : null
                  ]) },
                { key: 'reason_name', label: 'Service Type',
                  render: (row) => lines(row.reason_name, [row.point === null || row.point === undefined ? null : translate('crm.smartphoneServices.points', { n: number(row.point) })]) },
                { key: 'reason_type_name', label: 'Service Reason', render: (row) => <Text fontSize="sm">{row.reason_type_name || '-'}</Text> }
              ]}
            />
          ) : null}
        </Box>
      )}
    </Card360>
  );
}
