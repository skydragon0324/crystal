import React, { useEffect, useState } from 'react';
import {
  Alert, AlertIcon, Box, Drawer, DrawerBody, DrawerCloseButton, DrawerContent, DrawerHeader, DrawerOverlay,
  Flex, HStack, Icon, IconButton, Image, Link, Spinner, Stack, Text, Tooltip
} from '@chakra-ui/react';
import * as Md from 'react-icons/md';

import DataTable from '../../../../../components/DataTable';
import useList from '../../../../../hooks/useList';
import { crm } from '../../../../../api';
import { useT } from '../../../../../i18n';
import { useSurface } from '../../../../../theme/tokens';
import { date, dateTime, number } from '../../../../../utils/format';
import AccountPicker from '../../../shared/AccountPicker';
import { Card360, Pill } from '../../../shared/ui360';
import { MiniTable } from '../c360Cards';
import { useCrmMeta } from '../../../shared/shared';

/**
 * E-SHOP ORDERS, READ FROM THE E-SHOP.
 *
 * The CRM does not keep a customer's orders: this asks the e-shop for them,
 * by the PK of each of the customer's linked e-shop accounts - the same API
 * the member's own Orders page calls. The shop answers for one account at a
 * time, so a customer with several accounts gets a choice: the primary one
 * by default, another, or ALL (each asked, merged newest first, an Account
 * column saying whose).
 *
 * The shop sells in three tenders - foreign currency, native currency and
 * points - and one order can use several. They are different units, so each
 * is shown as itself and there is no grand total. A currency is shown by its
 * code from the CRM's own currency list (crm_currency), found by its name:
 * the currency named FOREIGN, the one named NATIVE. Points are not a currency
 * and keep their word.
 */

const TENDER_COLOR = { FOREIGN: 'red.500', NATIVE: 'blue.500', POINT: 'orange.500' };

/** A tender's unit as shown (a currency code, or "Points") and its colour. */
function useTenderUnit() {
  const translate = useT();
  const meta = useCrmMeta();
  return (kind) => {
    const currency = (meta.currencies || []).filter((row) => String(row.currency_name || '').toUpperCase() === kind)[0];
    const unit = kind === 'POINT' ? translate('crm.eshopOrders.points') : currency ? currency.currency_code : (kind || '');
    return { unit: unit, color: TENDER_COLOR[kind] };
  };
}
const STATUS_TONE = {
  PENDING: 'gray', ACCEPTED: 'blue', DELIVERING: 'purple', DELIVERED: 'teal', FINISHED: 'green',
  CANCEL_PENDING: 'orange', CANCELLED: 'red', REFUND_PENDING: 'orange', REFUND_ACCEPTED: 'orange', REFUNDED: 'red'
};

function money(value) {
  const amount = Number(value) || 0;
  return amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** What the order cost, one line per tender it used: "576.73 USD". The shop's `price` is the order's total in that tender. */
function Tenders({ tenders }) {
  const unitOf = useTenderUnit();
  if (!tenders || !tenders.length) return <Text as="span">-</Text>;
  return (
    <Stack spacing={0} align="flex-end">
      {tenders.map((tender) => {
        const meta = unitOf(tender.kind);
        return (
          <Text key={tender.kind} fontSize="sm" fontWeight="600" color={meta.color} whiteSpace="nowrap">
            {money(tender.price)} {meta.unit}
          </Text>
        );
      })}
    </Stack>
  );
}

/** The order's number as the e-shop shows it: its `tx_id`, or the `order_no` from before the shop sent one. */
function orderNumber(order) {
  return (order && (order.tx_id || order.order_no)) || '';
}

function Status({ code }) {
  const translate = useT();
  return <Pill tone={STATUS_TONE[code] || 'gray'}>{translate('crm.eshopOrders.status' + code)}</Pill>;
}

export default function EshopOrdersSection({ partyPk }) {
  const translate = useT();
  const surface = useSurface();
  const [account, setAccount] = useState('');
  const [open, setOpen] = useState(null);
  const list = useList((params) => crm.parties.eshopOrders(partyPk, params), { page: 1, limit: 20, project_account_id: 'ALL' });
  const summary = list.summary || {};
  const accounts = summary.accounts || [];

  /* Another account, or all of them: the list starts again from its first page. */
  useEffect(() => { if (account) list.setFilter({ project_account_id: account }); }, [account]); // eslint-disable-line react-hooks/exhaustive-deps

  /* All accounts first and by default; then each one. */
  const picker = <AccountPicker accounts={accounts} value={account || summary.selected} onChange={setAccount} withPk />;

  const columns = [
    { key: 'at', label: 'Ordered', render: (row) => (
      <Box>
        <Text fontSize="sm">{dateTime(row.at)}</Text>
        <Text fontSize="xs" color={surface.muted}>{orderNumber(row)}</Text>
      </Box>
    ) },
    { key: 'external_account_id', label: 'Account ID' },
    { key: 'status', label: 'Status', render: (row) => <Status code={row.status} /> },
    /* How many goods; their names are in the order's lines. */
    { key: 'goods_count', label: 'Goods', isNumeric: true,
      render: (row) => (row.goods_count ? translate('crm.eshopOrders.items', { n: number(row.goods_count) }) : '-') },
    { key: 'tenders', label: 'Total price', isNumeric: true, render: (row) => <Tenders tenders={row.tenders} /> },
    { key: 'address', label: 'Address', render: (row) => {
      const at = row.address || {};
      const lines = [at.line, at.building, at.contact].filter(Boolean);
      return lines.length ? (
        <Box maxW="14rem">{lines.map((line, index) => <Text key={line + index} fontSize={index ? 'xs' : 'sm'} color={index ? surface.muted : undefined} noOfLines={1}>{line}</Text>)}</Box>
      ) : '-';
    } },
    { key: 'cancel_reason', label: 'Cancelled', render: (row) => (row.cancelled_by ? (
      <Box maxW="14rem">
        <Text fontSize="xs" fontWeight="600">{translate(row.cancelled_by === 'MEMBER' ? 'crm.eshopOrders.byTheCustomer' : 'crm.eshopOrders.byTheShop')}</Text>
        <Text fontSize="xs" color={surface.muted} noOfLines={2}>{row.cancel_reason}</Text>
      </Box>
    ) : '-') },
    { key: 'open', label: '', render: (row) => (
      <Tooltip hasArrow label={translate('crm.eshopOrders.viewLines')}>
        <IconButton size="xs" variant="ghost" icon={<Icon as={Md.MdVisibility} />} aria-label={translate('crm.eshopOrders.viewLines')}
          onClick={(event) => { event.stopPropagation(); setOpen(row); }} />
      </Tooltip>
    ) }
  ].filter(Boolean);

  return (
    <Card360 icon={Md.MdShoppingCart} title={translate('crm.eshopOrders.title')} beside={picker} padded={false}>
      <Box px={3} pt={2}>
        {list.summary && !summary.project ? <Alert status="info" fontSize="sm" mb={2} borderRadius="md"><AlertIcon />{translate('crm.eshopOrders.noEshopProject')}</Alert> : null}
        {list.summary && summary.project && !accounts.length ? <Alert status="info" fontSize="sm" mb={2} borderRadius="md"><AlertIcon />{translate('crm.eshopOrders.noAccounts')}</Alert> : null}
        {(summary.no_pk || []).length ? (
          <Alert status="warning" fontSize="sm" mb={2} borderRadius="md"><AlertIcon />{translate('crm.eshopOrders.noPk', { accounts: summary.no_pk.join(', ') })}</Alert>
        ) : null}
        {(summary.failed || []).length ? (
          <Alert status="error" fontSize="sm" mb={2} borderRadius="md"><AlertIcon />{translate('crm.eshopOrders.unreachable', { accounts: summary.failed.map((row) => row.external_account_id).join(', ') })}</Alert>
        ) : null}
        {/* The shop's own total of every order across the accounts shown. */}
        {summary.total_price !== undefined && summary.total_price !== null && list.total ? (
          <Text fontSize="sm" mb={2}>{translate('crm.eshopOrders.totalPrice', { amount: money(summary.total_price), n: number(list.total) })}</Text>
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
          rowKey={(row) => (row.project_account_id || '') + ':' + (row.order_id || row.id)}
          columns={columns}
          onRowClick={(row) => setOpen(row)}
          emptyText={translate('crm.eshopOrders.noOrders')}
        />
      </Box>
      <OrderDrawer partyPk={partyPk} order={open} onClose={() => setOpen(null)} />
    </Card360>
  );
}

/** One order's lines, asked of the shop when it opens. */
function OrderDrawer({ partyPk, order, onClose }) {
  const translate = useT();
  const unitOf = useTenderUnit();
  const surface = useSurface();
  const [lines, setLines] = useState(null);
  const [failed, setFailed] = useState(null);

  useEffect(() => {
    if (!order) return undefined;
    let live = true;
    setLines(null); setFailed(null);
    crm.parties.eshopOrder(partyPk, order.order_id, order.project_account_id)
      .then(({ data }) => { if (live) setLines((data && data.lines) || []); })
      .catch((error) => { if (live) { setFailed(error.message); setLines([]); } });
    return () => { live = false; };
  }, [partyPk, order]);

  const at = (order && order.address) || {};
  const deliver = [at.receiver, at.line, at.building, at.contact].filter(Boolean);
  return (
    <Drawer isOpen={!!order} placement="right" size="md" onClose={onClose}>
      <DrawerOverlay />
      <DrawerContent>
        <DrawerCloseButton />
        <DrawerHeader borderBottomWidth="1px">
          <Text fontSize="sm" color={surface.muted}>{translate('crm.eshopOrders.order')}{order ? '  ·  ' + order.external_account_id : ''}</Text>
          <Text>{orderNumber(order)}</Text>
        </DrawerHeader>
        <DrawerBody>
          {order ? (
            <Stack spacing={4}>
              <Flex justify="space-between" align="flex-start" gap={3}>
                <Box>
                  <Status code={order.status} />
                  <Text fontSize="xs" color={surface.muted} mt={1}>{dateTime(order.at)}</Text>
                  {order.cancelled_by ? (
                    <Text fontSize="xs" mt={1}>
                      {translate(order.cancelled_by === 'MEMBER' ? 'crm.eshopOrders.byTheCustomer' : 'crm.eshopOrders.byTheShop')}
                      {order.cancel_reason ? ' — ' + order.cancel_reason : ''}
                    </Text>
                  ) : null}
                </Box>
                <Tenders tenders={order.tenders} />
              </Flex>
              {deliver.length || order.pay_type ? (
                <Box p={3} borderRadius="md" borderWidth="1px">
                  {deliver.length ? <Text fontSize="xs" color={surface.muted} mb={1}>{translate('crm.eshopOrders.deliverTo')}</Text> : null}
                  {deliver.map((line, index) => <Text key={line + index} fontSize="sm">{line}</Text>)}
                  {order.pay_type ? <Text fontSize="xs" color={surface.muted} mt={deliver.length ? 2 : 0}>{translate('crm.eshopOrders.payType', { type: order.pay_type })}</Text> : null}
                </Box>
              ) : null}
              <Text fontSize="xs" fontWeight="700" textTransform="uppercase" color={surface.muted}>{translate('crm.eshopOrders.lines')}</Text>
              {lines === null ? <HStack justify="center" py={4}><Spinner size="sm" /></HStack> : null}
              {failed ? <Alert status="error" fontSize="sm" borderRadius="md"><AlertIcon />{failed}</Alert> : null}
              {(lines || []).map((line, index) => {
                const meta = unitOf(line.tender);
                return (
                  <Flex key={(line.goods_id || '') + ':' + index} gap={3} align="flex-start" pt={index ? 3 : 0} borderTopWidth={index ? '1px' : 0}>
                    <Flex boxSize="44px" flexShrink={0} align="center" justify="center" borderRadius="md" overflow="hidden" borderWidth="1px">
                      {line.image_url ? <Image src={line.image_url} alt="" w="100%" h="100%" objectFit="cover" />
                        : <Text fontWeight="800" color={surface.muted}>{String(line.goods_name || '?').charAt(0)}</Text>}
                    </Flex>
                    <Box flex="1" minW={0}>
                      {line.goods_url ? <Link href={line.goods_url} isExternal fontWeight="600" fontSize="sm">{line.goods_name}</Link>
                        : <Text fontWeight="600" fontSize="sm">{line.goods_name}</Text>}
                      {line.standard ? <Text fontSize="xs" color={surface.muted}>{line.standard}</Text> : null}
                      <HStack spacing={2} fontSize="xs" mt={0.5} wrap="wrap">
                        {/* A line's price is per item; its total is on the right. */}
                        <Text color={meta.color}>{number(line.qty)} × {money(line.real_price)} {meta.unit}</Text>
                        {line.discounted ? <Text color={surface.muted} textDecoration="line-through">{money(line.price)}</Text> : null}
                      </HStack>
                      {line.delivery_no ? <Text fontSize="xs" color={surface.muted} fontFamily="mono">{line.delivery_no}</Text> : null}
                    </Box>
                    <Text fontWeight="700" fontSize="sm" color={meta.color} whiteSpace="nowrap">{money(line.total_price)} {meta.unit}</Text>
                  </Flex>
                );
              })}
              {lines && !lines.length && !failed ? <Text fontSize="sm" color={surface.muted}>{translate('crm.eshopOrders.noLines')}</Text> : null}
            </Stack>
          ) : null}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}

/**
 * THE OVERVIEW'S RECENT ORDERS, from the e-shop like the Orders tab: the
 * newest few across all of the customer's e-shop accounts. A row, or View
 * all, opens the Orders tab, where the lines are.
 */
export function RecentEshopOrdersCard({ summary, onViewAll }) {
  const translate = useT();
  /*
   * The newest orders come with the page's project summary (`recent_orders`),
   * which has already asked the e-shop - so this card makes no call of its own.
   * Null while the summary is loading.
   */
  const rows = summary ? (summary.recent_orders || []) : null;
  const known = summary || {};
  const empty = known.accounts && !known.accounts.eshop ? 'crm.eshopOrders.noAccounts'
    : (known.failed || []).some((row) => row.system === 'ESHOP' || !row.system) ? 'crm.eshopOrders.unreachableShort' : 'crm.eshopOrders.noOrders';
  return (
    <Card360 icon={Md.MdReceipt} title={translate('crm.customer360Cards.recentOrders')} onViewAll={onViewAll}>
      {rows === null ? <HStack justify="center" py={4}><Spinner size="sm" /></HStack> : (
        <MiniTable
          rows={rows}
          rowKey={(row) => (row.project_account_id || '') + ':' + (row.order_id || row.id)}
          onRowClick={onViewAll ? () => onViewAll() : undefined}
          empty={empty}
          columns={[
            { key: 'tx_id', label: 'Order number', maxW: '10rem',
              render: (row) => <Text as="span" color="brand.500" fontWeight="600" noOfLines={1}>{orderNumber(row)}</Text> },
            { key: 'at', label: 'Date', render: (row) => date(row.at) },
            { key: 'external_account_id', label: 'Account ID' },
            { key: 'status', label: 'Status', render: (row) => <Status code={row.status} /> },
            { key: 'tenders', label: 'Total price', isNumeric: true, render: (row) => <Tenders tenders={row.tenders} /> }
          ]}
        />
      )}
    </Card360>
  );
}

