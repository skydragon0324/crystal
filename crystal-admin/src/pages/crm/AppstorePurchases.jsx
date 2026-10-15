import React, { useEffect, useState } from 'react';
import {
  Alert, AlertIcon, Box, Button, Drawer, DrawerBody, DrawerCloseButton, DrawerContent, DrawerHeader, DrawerOverlay,
  HStack, Icon, IconButton, Image, Input, Link, Spinner, Stack, Text, Tooltip
} from '@chakra-ui/react';
import * as Md from 'react-icons/md';

import DataTable from '../../components/DataTable';
import Toolbar from '../../components/Toolbar';
import useList from '../../hooks/useList';
import { crm } from '../../api';
import { useT } from '../../i18n';
import { useSurface } from '../../theme/tokens';
import { dateTime } from '../../utils/format';
import AccountPicker from './AccountPicker';
import { Card360, Pill } from './ui360';
import { useCrmMeta } from './shared';

/**
 * APPSTORE PURCHASES, READ FROM THE APPSTORE.
 *
 * Like the e-shop orders: nothing here is kept by the CRM. The Appstore is
 * asked by the PK of each of the customer's linked Appstore accounts (its
 * appstore_pk), one account at a time - the primary by default - or ALL of
 * them merged newest first. The store filters by a date window and a search
 * word itself.
 *
 * What was paid comes out of one of the store's purses: FOREIGN money is
 * shown by the CRM's own currency code for the currency named FOREIGN; the
 * store's COMPANY coins and IMMATERIAL balance are not currencies and keep
 * their words.
 *
 * The licence key stays behind a click: it is fetched on request, only for a
 * purchase of that account, and every look is audited.
 */

const KIND = { APP: 'crm.appstore.kindAPP', DIAMOND: 'crm.appstore.kindDIAMOND', AVATAR: 'crm.appstore.kindAVATAR', EVENT_ITEM: 'crm.appstore.kindEVENT_ITEM', NICKNAME: 'crm.appstore.kindNICKNAME' };
const PURSE_COLOR = { FOREIGN: 'red.500', COMPANY: 'blue.500', IMMATERIAL: 'gray.500' };
const LICENCE_TONE = { SUCCESS: 'green', UNUSED: 'blue', USED: 'gray', FAIL: 'red', REFUND: 'orange', PENDING: 'orange', ACCEPT_PENDING: 'orange' };

function money(value) {
  return (Number(value) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** A purse as shown: the CRM's code for FOREIGN money, a word for the store's own coins. */
function usePurse() {
  const translate = useT();
  const meta = useCrmMeta();
  return (purse) => {
    const currency = (meta.currencies || []).filter((row) => String(row.currency_name || '').toUpperCase() === purse)[0];
    return { unit: currency ? currency.currency_code : translate('crm.appstore.purse' + (purse || 'COMPANY')), color: PURSE_COLOR[purse] };
  };
}

function PurchaseState({ row }) {
  const translate = useT();
  const surface = useSurface();
  return (
    <Box>
      <Pill tone={row.status === 'PURCHASED' ? 'green' : row.status === 'PURCHASING' ? 'blue' : 'red'}>
        {translate(row.status ? 'crm.appstore.status' + row.status : 'crm.appstore.statusFAILED')}
      </Pill>
      {row.status_reason ? <Text fontSize="xs" color={surface.muted} mt={1} noOfLines={2}>{row.status_reason}</Text> : null}
    </Box>
  );
}

export default function AppstorePurchasesSection({ partyPk }) {
  const translate = useT();
  const surface = useSurface();
  const purseOf = usePurse();
  const [account, setAccount] = useState('');
  const [licenceFor, setLicenceFor] = useState(null);
  const list = useList((params) => crm.parties.appstorePurchases(partyPk, params), { page: 1, limit: 20, project_account_id: 'ALL' });
  const summary = list.summary || {};
  const accounts = summary.accounts || [];

  /* Another account, or all of them: the list starts again from its first page. */
  useEffect(() => { if (account) list.setFilter({ project_account_id: account }); }, [account]); // eslint-disable-line react-hooks/exhaustive-deps

  /* All accounts first and by default; then each one. */
  const picker = <AccountPicker accounts={accounts} value={account || summary.selected} onChange={setAccount} withPk />;

  const columns = [
    { key: 'at', label: 'Bought', render: (row) => <Text fontSize="sm" whiteSpace="nowrap">{dateTime(row.at)}</Text> },
    { key: 'external_account_id', label: 'Account ID' },
    { key: 'kind', label: 'Type', render: (row) => translate(KIND[row.kind] || row.kind || '-') },
    { key: 'name', label: 'Name', render: (row) => (
      <Box maxW="16rem">
        {row.url ? <Link href={row.url} isExternal fontWeight="600" fontSize="sm" noOfLines={1}>{row.name || translate(KIND[row.kind] || '')}</Link>
          : <Text fontWeight="600" fontSize="sm" noOfLines={1}>{row.name || translate(KIND[row.kind] || '')}</Text>}
        {row.app_version ? <Text fontSize="xs" color={surface.muted}>v{row.app_version}</Text> : null}
      </Box>
    ) },
    { key: 'device_no', label: 'Device', render: (row) => <Text fontSize="xs" fontFamily="mono" color={surface.muted}>{row.device_no || '-'}</Text> },
    { key: 'price', label: 'Paid', isNumeric: true, render: (row) => {
      const purse = purseOf(row.currency);
      return <Text fontSize="sm" fontWeight="600" color={purse.color} whiteSpace="nowrap">{money(row.price)} {purse.unit}</Text>;
    } },
    { key: 'status', label: 'Status', render: (row) => <PurchaseState row={row} /> },
    { key: 'licence', label: 'Licence', render: (row) => (
      <HStack spacing={1}>
        {row.licence_state ? <Pill tone={LICENCE_TONE[row.licence_state] || 'gray'}>{translate('crm.appstore.licence' + row.licence_state)}</Pill> : null}
        {row.licence_available ? (
          <Tooltip hasArrow label={translate('crm.appstore.showKey')}>
            <IconButton size="xs" variant="ghost" icon={<Icon as={Md.MdVpnKey} />} aria-label={translate('crm.appstore.showKey')}
              onClick={(event) => { event.stopPropagation(); setLicenceFor(row); }} />
          </Tooltip>
        ) : null}
      </HStack>
    ) }
  ];

  return (
    <Card360 icon={Md.MdApps} title={translate('crm.appstore.title')} beside={picker} padded={false}>
      <Box mx={-1}>
        <Toolbar
          search={list.params.q}
          placeholder={translate('crm.appstore.search')}
          onSearch={(text) => list.setFilter({ q: text || undefined })}
          beside={(
            <HStack spacing={2}>
              <Input type="date" size="sm" w="10rem" borderRadius="lg" value={list.params.from || ''} aria-label={translate('crm.appstore.from')}
                onChange={(event) => list.setFilter({ from: event.target.value || undefined })} />
              <Text fontSize="sm" color={surface.muted}>–</Text>
              <Input type="date" size="sm" w="10rem" borderRadius="lg" value={list.params.to || ''} aria-label={translate('crm.appstore.to')}
                onChange={(event) => list.setFilter({ to: event.target.value || undefined })} />
              {list.params.from || list.params.to ? (
                <Button size="xs" variant="ghost" onClick={() => list.setFilter({ from: undefined, to: undefined })}>{translate('crm.appstore.allDates')}</Button>
              ) : null}
            </HStack>
          )}
        />
      </Box>
      <Box px={3}>
        {list.summary && !summary.project ? <Alert status="info" fontSize="sm" mb={2} borderRadius="md"><AlertIcon />{translate('crm.appstore.noProject')}</Alert> : null}
        {list.summary && summary.project && !accounts.length ? <Alert status="info" fontSize="sm" mb={2} borderRadius="md"><AlertIcon />{translate('crm.appstore.noAccounts')}</Alert> : null}
        {(summary.no_pk || []).length ? (
          <Alert status="warning" fontSize="sm" mb={2} borderRadius="md"><AlertIcon />{translate('crm.appstore.noPk', { accounts: summary.no_pk.join(', ') })}</Alert>
        ) : null}
        {(summary.failed || []).length ? (
          <Alert status="error" fontSize="sm" mb={2} borderRadius="md"><AlertIcon />{translate('crm.appstore.unreachable', { accounts: summary.failed.map((row) => row.external_account_id).join(', ') })}</Alert>
        ) : null}
        {(summary.capped || []).length ? (
          <Alert status="info" fontSize="sm" mb={2} borderRadius="md"><AlertIcon />
            {translate('crm.eshopOrders.capped', { accounts: summary.capped.map((row) => row.external_account_id + ' (' + row.shown + ' / ' + row.total + ')').join(', ') })}
          </Alert>
        ) : null}
      </Box>
      <Box px={2} pb={2}>
        <DataTable
          rows={list.rows}
          loading={list.loading}
          page={list.params.page}
          limit={list.params.limit}
          total={list.total}
          onPageChange={list.setPage}
          onLimitChange={(limit) => list.setFilter({ limit: limit })}
          rowKey={(row) => (row.project_account_id || '') + ':' + row.id}
          columns={columns}
          emptyText={translate('crm.appstore.noPurchases')}
        />
      </Box>
      <LicenceDrawer partyPk={partyPk} purchase={licenceFor} onClose={() => setLicenceFor(null)} />
    </Card360>
  );
}

/** One purchase's licence: the key, its QR and the file - fetched when opened, and audited. */
function LicenceDrawer({ partyPk, purchase, onClose }) {
  const translate = useT();
  const surface = useSurface();
  const [held, setHeld] = useState(null);
  const [failed, setFailed] = useState(null);

  useEffect(() => {
    if (!purchase) return undefined;
    let live = true;
    setHeld(null); setFailed(null);
    crm.parties.appstoreLicence(partyPk, purchase.id, purchase.project_account_id)
      .then(({ data }) => { if (live) setHeld(data || {}); })
      .catch((error) => { if (live) { setFailed(error.message); setHeld({}); } });
    return () => { live = false; };
  }, [partyPk, purchase]);

  return (
    <Drawer isOpen={!!purchase} placement="right" size="sm" onClose={onClose}>
      <DrawerOverlay />
      <DrawerContent>
        <DrawerCloseButton />
        <DrawerHeader borderBottomWidth="1px">
          <Text fontSize="sm" color={surface.muted}>{translate('crm.appstore.licenceTitle')}{purchase ? '  ·  ' + purchase.external_account_id : ''}</Text>
          <Text>{purchase ? purchase.name || translate(KIND[purchase.kind] || '') : ''}</Text>
        </DrawerHeader>
        <DrawerBody>
          {held === null ? <HStack justify="center" py={6}><Spinner size="sm" /></HStack> : (
            <Stack spacing={4}>
              {failed ? <Alert status="error" fontSize="sm" borderRadius="md"><AlertIcon />{failed}</Alert> : null}
              {held.state ? <Box><Pill tone={LICENCE_TONE[held.state] || 'gray'}>{translate('crm.appstore.licence' + held.state)}</Pill></Box> : null}
              {held.licence ? (
                <Box>
                  <Text fontSize="xs" color={surface.muted} mb={1}>{translate('crm.appstore.key')}</Text>
                  <Text fontFamily="mono" fontSize="sm" wordBreak="break-all" p={3} borderWidth="1px" borderRadius="md">{held.licence}</Text>
                </Box>
              ) : (!failed ? <Text fontSize="sm" color={surface.muted}>{translate('crm.appstore.noKey')}</Text> : null)}
              {held.qr ? <Image src={'data:' + (held.qr_type || 'image/png') + ';base64,' + held.qr} alt="" maxW="12rem" /> : null}
              {held.download_url ? <Link href={held.download_url} isExternal color="brand.500" fontSize="sm">{translate('crm.appstore.downloadFile')}</Link> : null}
              <Text fontSize="xs" color={surface.muted}>{translate('crm.appstore.audited')}</Text>
            </Stack>
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
