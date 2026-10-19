import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, AlertIcon, Box, Button, Drawer, DrawerBody, DrawerCloseButton, DrawerContent, DrawerHeader, DrawerOverlay,
  HStack, Icon, IconButton, Image, Input, Link, Spinner, Stack, Text, Tooltip, useClipboard
} from '@chakra-ui/react';
import * as Md from 'react-icons/md';

import DataTable from '../../../../../components/DataTable';
import Toolbar from '../../../../../components/Toolbar';
import useList from '../../../../../hooks/useList';
import { crm } from '../../../../../api';
import { useT } from '../../../../../i18n';
import { useSurface } from '../../../../../theme/tokens';
import { dateTime } from '../../../../../utils/format';
import AccountPicker from '../../../shared/AccountPicker';
import { Card360, Pill } from '../../../shared/ui360';
import { useCrmMeta } from '../../../shared/shared';

/**
 * APPSTORE PURCHASES, READ FROM THE APPSTORE.
 *
 * Like the e-shop orders: nothing here is kept by the CRM. The Appstore is
 * asked by the PK of each of the customer's linked Appstore accounts (its
 * appstore_pk), one account at a time - the primary by default - or ALL of
 * them merged newest first. The store filters by a date window and a search
 * word itself.
 *
 * It works the way the member's own Purchases page on the website does
 * (crystal-web account/appstore/purchases), which works the way the vendor's
 * does: the list opens on this month, a filtered empty list says the filter
 * is why and offers to drop it, and a licence is shown only for a purchase
 * the store says is PURCHASED.
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
/* The file extension a saved QR gets, from the type the API read off its bytes. */
const QR_EXTENSION = { 'image/png': 'png', 'image/gif': 'gif', 'image/bmp': 'bmp' };

function money(value) {
  return (Number(value) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** The 1st of this month to today: the period the website's Purchases page - and the vendor's - opens on. */
function thisMonth() {
  const today = new Date();
  const iso = (day) => day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0');
  return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(today) };
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

function LicenceState({ state }) {
  const translate = useT();
  return state ? <Pill tone={LICENCE_TONE[state] || 'gray'}>{translate('crm.appstore.licence' + state)}</Pill> : null;
}

export default function AppstorePurchasesSection({ partyPk }) {
  const translate = useT();
  const surface = useSurface();
  const purseOf = usePurse();
  const [account, setAccount] = useState('');
  const [licenceFor, setLicenceFor] = useState(null);
  /* This month, from the first request - as the website's page opens. */
  const list = useList((params) => crm.parties.appstorePurchases(partyPk, params), Object.assign({ page: 1, limit: 20, project_account_id: 'ALL' }, thisMonth()));
  const summary = list.summary || {};
  const accounts = summary.accounts || [];
  const searched = list.params.q;
  const dated = !!(list.params.from || list.params.to);

  /* Another account, or all of them: the list starts again from its first page. */
  useEffect(() => { if (account) list.setFilter({ project_account_id: account }); }, [account]); // eslint-disable-line react-hooks/exhaustive-deps

  /* All accounts first and by default; then each one. */
  const picker = <AccountPicker accounts={accounts} value={account || summary.selected} onChange={setAccount} withPk />;

  /* An empty list says why it is empty: the search, the period, or no purchases at all. */
  const emptyText = searched ? translate('crm.appstore.nothingMatches', { term: searched })
    : dated ? translate('crm.appstore.nothingInPeriod') : translate('crm.appstore.noPurchases');

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
        <LicenceState state={row.licence_state} />
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
          onSearch={(text) => list.setFilter({ q: String(text || '').trim() || undefined })}
          beside={(
            <HStack spacing={2}>
              <Input type="date" size="sm" w="10rem" borderRadius="lg" value={list.params.from || ''} max={list.params.to || undefined}
                aria-label={translate('crm.appstore.from')} onChange={(event) => list.setFilter({ from: event.target.value || undefined })} />
              <Text fontSize="sm" color={surface.muted}>–</Text>
              <Input type="date" size="sm" w="10rem" borderRadius="lg" value={list.params.to || ''} min={list.params.from || undefined}
                aria-label={translate('crm.appstore.to')} onChange={(event) => list.setFilter({ to: event.target.value || undefined })} />
              {searched ? (
                <Button size="xs" variant="ghost" onClick={() => list.setFilter({ q: undefined, from: undefined, to: undefined })}>{translate('crm.appstore.clearFilters')}</Button>
              ) : dated ? (
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
          emptyText={emptyText}
        />
      </Box>
      <LicenceDrawer partyPk={partyPk} purchase={licenceFor} onClose={() => setLicenceFor(null)} />
    </Card360>
  );
}

/**
 * One purchase's licence, fetched when opened and audited - by the website's
 * rules, which are the vendor's:
 *
 *   still PURCHASING     the licence is still being issued, not "failed"
 *   not PURCHASED, or nothing to show    no licence on this purchase
 *   otherwise            the QR (and saving it) if the store has one, the key
 *                        (and copying it) if not, and the licence file
 */
function LicenceDrawer({ partyPk, purchase, onClose }) {
  const translate = useT();
  const surface = useSurface();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ loading: true, failed: null, held: null });

  /* The drawer slides out with what it was showing, not blank. */
  const last = useRef(null);
  if (purchase) last.current = purchase;
  const shown = purchase || last.current;

  useEffect(() => {
    if (!purchase) return undefined;
    let live = true;
    setState({ loading: true, failed: null, held: null });
    crm.parties.appstoreLicence(partyPk, purchase.id, purchase.project_account_id)
      .then(({ data }) => { if (live) setState({ loading: false, failed: null, held: data || null }); })
      .catch((error) => { if (live) setState({ loading: false, failed: (error && error.message) || translate('crm.appstore.couldNotLoad'), held: null }); });
    return () => { live = false; };
  }, [partyPk, purchase, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const held = state.held;
  let body;
  if (state.loading) {
    body = <HStack justify="center" py={6}><Spinner size="sm" /></HStack>;
  } else if (state.failed) {
    body = (
      <Stack spacing={3}>
        <Alert status="error" fontSize="sm" borderRadius="md"><AlertIcon />{state.failed}</Alert>
        <Box><Button size="sm" onClick={() => setAttempt((n) => n + 1)}>{translate('common.tryAgain')}</Button></Box>
      </Stack>
    );
  } else if (held && held.purchase_state === 'PURCHASING') {
    body = <Notice title={translate('crm.appstore.stillIssuing')} hint={translate('crm.appstore.stillIssuingHint')} />;
  } else if (!held || held.purchase_state !== 'PURCHASED' || (!held.qr && !held.licence && !held.download_url)) {
    body = <Notice title={translate('crm.appstore.noLicence')} hint={translate('crm.appstore.noLicenceHint')} />;
  } else {
    body = (
      <Stack spacing={4}>
        {held.qr ? <QrLicence held={held} purchaseId={shown ? shown.id : ''} /> : held.licence ? <KeyLicence licence={held.licence} /> : null}
        {held.download_url ? (
          <Button as={Link} href={held.download_url} isExternal size="sm" variant="outline" leftIcon={<Icon as={Md.MdDescription} />}>
            {translate('crm.appstore.downloadFile')}
          </Button>
        ) : null}
        <Text fontSize="xs" color={surface.muted}>{translate('crm.appstore.audited')}</Text>
      </Stack>
    );
  }

  return (
    <Drawer isOpen={!!purchase} placement="right" size="sm" onClose={onClose}>
      <DrawerOverlay />
      <DrawerContent>
        <DrawerCloseButton />
        <DrawerHeader borderBottomWidth="1px" pr={12}>
          <Text fontSize="sm" color={surface.muted}>{translate('crm.appstore.licenceTitle')}{shown ? '  ·  ' + shown.external_account_id : ''}</Text>
          <Text noOfLines={2}>{shown ? shown.name || translate(KIND[shown.kind] || '') : ''}</Text>
          {shown ? (
            <HStack spacing={2} mt={1} wrap="wrap">
              {shown.device_no ? <Text fontSize="xs" fontWeight="500" fontFamily="mono" color={surface.muted}>{translate('crm.appstore.deviceNo', { no: shown.device_no })}</Text> : null}
              <LicenceState state={(held && held.state) || shown.licence_state} />
            </HStack>
          ) : null}
        </DrawerHeader>
        <DrawerBody py={5}>{body}</DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}

function Notice({ title, hint }) {
  const surface = useSurface();
  return (
    <Box textAlign="center" py={6}>
      <Text fontWeight="600">{title}</Text>
      <Text fontSize="sm" color={surface.muted} mt={1}>{hint}</Text>
    </Box>
  );
}

/** The store's QR on white (a camera needs its quiet zone in both colour modes), and the picture saved as it is shown. */
function QrLicence({ held, purchaseId }) {
  const translate = useT();
  const surface = useSurface();
  const type = held.qr_type || 'image/jpeg';
  const src = 'data:' + type + ';base64,' + held.qr;
  return (
    <Stack spacing={3} align="center">
      <Box p={3} bg="white" borderRadius="lg" borderWidth="1px">
        <Image src={src} alt={translate('crm.appstore.qrAlt')} boxSize="15rem" />
      </Box>
      <Text fontSize="sm" color={surface.muted} textAlign="center">{translate('crm.appstore.scanWithDevice')}</Text>
      <Button as="a" href={src} download={'licence-' + (purchaseId || 'qr') + '.' + (QR_EXTENSION[type] || 'jpg')} size="sm" variant="brand" w="100%"
        leftIcon={<Icon as={Md.MdFileDownload} />}>
        {translate('crm.appstore.saveQr')}
      </Button>
    </Stack>
  );
}

/** The key as text: monospaced, selected in one click, copied in one press. */
function KeyLicence({ licence }) {
  const translate = useT();
  const surface = useSurface();
  const { hasCopied, onCopy } = useClipboard(licence);
  return (
    <Box>
      <Text fontSize="xs" color={surface.muted} mb={1}>{translate('crm.appstore.key')}</Text>
      <Text fontFamily="mono" fontSize="md" fontWeight="700" wordBreak="break-all" p={3} borderWidth="1px" borderRadius="md" userSelect="all">{licence}</Text>
      <Button size="sm" mt={2} w="100%" variant={hasCopied ? 'outline' : 'brand'} leftIcon={<Icon as={hasCopied ? Md.MdCheck : Md.MdContentCopy} />} onClick={onCopy}>
        {translate(hasCopied ? 'crm.appstore.keyCopied' : 'crm.appstore.copyKey')}
      </Button>
    </Box>
  );
}
