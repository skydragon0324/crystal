import React, { useEffect, useState } from 'react';
import { Alert, AlertIcon, Badge, Box, HStack, Spinner, Tab, TabList, TabPanel, TabPanels, Tabs, Text } from '@chakra-ui/react';
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
 * The system keeps three histories - repairs, OS (software) services and
 * replacements - and each is a sub-tab here, with its count; the Account ID
 * choice applies to all three. Each kind comes in its own shape (see
 * smartphoneOffline.api.js), so each has its own six columns, several of the
 * system's fields to a cell:
 *
 *   Repair       Account ID, customer (name, phone, IMEIs, description),
 *                agency, details (service total, then each item), repair
 *                type, dates
 *   OS service   Account ID, customer (name, phone, address, ID card), device,
 *                agency and dates, service type and points, reason
 *   Replacement  Account ID, customer (name, phone, address, ID card), agency,
 *                replaced device (model, old and new IMEI), reason, status
 *                and dates
 */
const KINDS = [
  { kind: 'REPAIR', label: 'crm.smartphoneServices.kindREPAIR', icon: Md.MdBuild },
  { kind: 'OS', label: 'crm.smartphoneServices.kindOS', icon: Md.MdSystemUpdate },
  { kind: 'REPLACE', label: 'crm.smartphoneServices.kindREPLACE', icon: Md.MdSwapHoriz }
];

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

  const dates = (row) => [
    row.created_at ? translate('crm.smartphoneServices.opened', { date: dateTime(row.created_at) }) : null,
    row.updated_at ? translate('crm.smartphoneServices.updated', { date: dateTime(row.updated_at) }) : null
  ];
  const imei = (label, value) => (value ? label + '  ' + value : null);
  const price = (value) => (value === null || value === undefined ? '-' : number(value, 2));
  const accountColumn = { key: 'master_id', label: 'Account ID' };
  /* When the job was opened and last updated, in a column of its own. */
  const dateColumn = { key: 'created_at', label: 'Date',
    render: (row) => <Box minW={0}>{dates(row).filter(Boolean).map((line, index) => <Text key={index} fontSize="sm" noOfLines={1}>{line}</Text>)}</Box> };
  const agentColumn = { key: 'agent_name', label: 'Agency', render: (row) => <Text fontSize="sm" fontWeight="600">{row.agent_name || '-'}</Text> };

  /* Each kind has its own fields, so its own columns; Account ID first in all three. */
  const COLUMNS = {
    REPAIR: [
      accountColumn,
      { key: 'customer_name', label: 'Customer Info',
        render: (row) => lines(row.customer_name, [formatPhone(row.phone_number), imei('IMEI 1', row.imei_1), imei('IMEI 2', row.imei_2), row.description]) },
      agentColumn,
      /* The items' service prices summed, then each item: model, part × quantity, price. */
      { key: 'service_total', label: 'Details',
        render: (row) => lines(translate('crm.smartphoneServices.serviceTotal', { amount: price(row.service_total) }),
          (row.items || []).map((item) => [item.model_name, (item.item_name || '-') + ' × ' + number(item.qty || 0), price(item.price)].filter(Boolean).join('  ·  '))) },
      { key: 'description', label: 'Repair Type', render: (row) => <Text fontSize="sm">{row.description || '-'}</Text> },
      dateColumn
    ],
    OS: [
      accountColumn,
      { key: 'customer_name', label: 'Customer Info',
        render: (row) => lines(row.customer_name, [formatPhone(row.phone_number), row.address, row.id_card_no]) },
      agentColumn,
      { key: 'model_name', label: 'Device Type',
        render: (row) => lines(row.model_name, [imei('IMEI 1', row.imei_1), imei('IMEI 2', row.imei_2)]) },
      { key: 'reason_name', label: 'Service Type',
        render: (row) => lines(row.reason_name, [row.point === null || row.point === undefined ? null : translate('crm.smartphoneServices.points', { n: number(row.point) })]) },
      { key: 'reason_type_name', label: 'Service Reason', render: (row) => <Text fontSize="sm">{row.reason_type_name || '-'}</Text> },
      dateColumn
    ],
    REPLACE: [
      accountColumn,
      { key: 'customer_name', label: 'Customer Info',
        render: (row) => lines(row.customer_name, [formatPhone(row.phone_number), row.address, row.id_card_no]) },
      agentColumn,
      { key: 'model_name', label: 'Replaced Device',
        render: (row) => lines(row.model_name, [imei(translate('crm.smartphoneServices.oldImei'), row.imei_old), imei(translate('crm.smartphoneServices.newImei'), row.imei_new)]) },
      { key: 'reason', label: 'Reason', render: (row) => <Text fontSize="sm">{row.reason || '-'}</Text> },
      /* The system's status code as it sends it; what each code means is not named yet. */
      { key: 'status', label: 'Status',
        render: (row) => (
          <Box minW={0}>
            {row.status ? <Badge variant="subtle" colorScheme="gray">{row.status}</Badge> : <Text fontSize="sm">-</Text>}
            {dates(row).filter(Boolean).map((line, index) => <Text key={index} fontSize="xs" color={surface.muted} noOfLines={1}>{line}</Text>)}
          </Box>
        ) }
    ]
  };

  return (
    <Card360 icon={Md.MdBuild} title={translate('crm.smartphoneServices.title')}
      beside={<AccountPicker accounts={accounts} value={account ? selected : 'ALL'} onChange={setSelected} />}>
      {state === null ? <HStack justify="center" py={4}><Spinner size="sm" /></HStack> : (
        <Box>
          {!project && !state.failed ? <Alert status="info" fontSize="sm" mb={2} borderRadius="md"><AlertIcon />{translate('crm.smartphoneDevices.noProject')}</Alert> : null}
          {project && !accounts.length ? <Alert status="info" fontSize="sm" mb={2} borderRadius="md"><AlertIcon />{translate('crm.smartphoneServices.noAccounts')}</Alert> : null}
          {state.failed ? <Alert status="error" fontSize="sm" mb={2} borderRadius="md"><AlertIcon />{translate('crm.smartphoneDevices.unreachable')}</Alert> : null}
          {accounts.length ? (
            <Tabs isLazy variant="soft-rounded" colorScheme="brand" size="sm">
              <TabList flexWrap="wrap" gap={2} mb={3}>
                {KINDS.map((entry) => {
                  const count = shown.filter((row) => row.kind === entry.kind).length;
                  return (
                    <Tab key={entry.kind} gap={1.5}>
                      <Box as={entry.icon} boxSize="1rem" />
                      {translate(entry.label)}
                      <Badge borderRadius="full" px={1.5} colorScheme={count ? 'brand' : 'gray'} variant="subtle">{number(count)}</Badge>
                    </Tab>
                  );
                })}
              </TabList>
              <TabPanels>
                {KINDS.map((entry) => (
                  <TabPanel key={entry.kind} px={0} py={0}>
                    <MiniTable
                      rows={shown.filter((row) => row.kind === entry.kind)}
                      rowKey={(row) => row.kind + ':' + row.master_id + ':' + row.created_at + ':' + (row.imei_1 || row.reason_name)}
                      empty="crm.smartphoneServices.noServices"
                      maxH="32rem"
                      columns={COLUMNS[entry.kind]}
                    />
                  </TabPanel>
                ))}
              </TabPanels>
            </Tabs>
          ) : null}
        </Box>
      )}
    </Card360>
  );
}
