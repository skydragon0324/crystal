import React, { useState } from 'react';
import {
  Box,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  Image,
  Link,
  Text
} from '@chakra-ui/react';

import StorefrontList from './StorefrontList';
import { TenderAmounts, formatAmount, tenderOf } from './eshopTerms';
import { Loading, StatusBadge } from '@/components/common';
import api from '@/api';
import { useApi, useList } from '@/hooks/useApi';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * Eshop orders.
 *
 * The lines of an order open in a DRAWER rather than a modal, the same as
 * feedback and the console: the list stays where it was, keeps its scroll
 * position, and closing puts you back on the row you opened.
 *
 * The detail is a second call, made only when a row is opened. The list
 * endpoint upstream does not carry lines, and fetching them for twenty orders
 * to show one is twenty round trips to somebody else's server.
 *
 * THERE IS NO TOTAL COLUMN, and its absence is the point. The Eshop sells in
 * three tenders — foreign currency, native currency and points — and one order
 * can span them. A single figure covering all three would be arithmetic on
 * three different units, so each is shown as itself and none of them are
 * added up.
 *
 * A CANCELLED ORDER SAYS WHO CANCELLED IT. The service records the member's
 * reason and the shop's in separate fields and says who acted only by which
 * one it filled in; the API decodes that into `cancelled_by`, and the reason
 * is on the row rather than hidden in the drawer, because "why did this not
 * arrive" is the question the page is being opened to answer.
 */
export default function EshopOrders() {
  const t = useT();
  const surface = useSurface();

  const [open, setOpen] = useState(null);
  const list = useList((params) => api.account.eshopOrders(params), {
    initialParams: { page: 1, limit: 12 }
  });

  /*
   * THE COLUMN ORDER IS THE VENDOR'S: number, order time, status, price,
   * address, the member's cancellation reason, then the shop's.
   *
   * Kept rather than improved on. This is the screen a member has been
   * reading for years, and rearranging it costs them the habit of knowing
   * where to look in exchange for nothing.
   *
   * THE TWO REASONS STAY TWO COLUMNS. It is tempting to fold them into one
   * "cancelled by X — reason" line, and that is what this page did first,
   * but the pair is a sentence about who: an order the SHOP cancelled and
   * one the MEMBER cancelled are different events with different
   * consequences, and a member scanning for their own cancellations wants
   * one column, not one column read carefully.
   */
  const columns = [
    {
      key: 'no',
      label: 'account.storefront.eshop.no',
      align: 'center',
      width: '56px',
      render: (row, number) => (
        <Text fontSize="sm" color={surface.muted}>{number}</Text>
      )
    },
    {
      key: 'at',
      label: 'account.storefront.eshoporders.ordered',
      render: (row) => (
        <Box>
          <Text color={surface.text}>{row.at}</Text>
          <Text fontSize="xs" color={surface.muted} noOfLines={1}>{row.order_no}</Text>
        </Box>
      )
    },
    {
      key: 'status',
      label: 'account.storefront.eshoporders.status',
      render: (row) => <StatusBadge value={row.status} />
    },
    {
      key: 'tenders',
      label: 'account.storefront.eshoporders.paidWith',
      align: 'right',
      render: (row) => (
        <Box>
          <TenderAmounts tenders={row.tenders} t={t} align="right" />
          <Text fontSize="xs" color={surface.muted} noOfLines={1}>{row.goods_name}</Text>
        </Box>
      )
    },
    {
      key: 'address',
      label: 'account.storefront.eshoporders.address',
      render: (row) => <AddressCell address={row.address} />
    },
    {
      key: 'user_reason',
      label: 'account.storefront.eshoporders.cancelledByYou',
      render: (row) => <Reason order={row} by="MEMBER" />
    },
    {
      key: 'reason',
      label: 'account.storefront.eshoporders.cancelledByTheShop',
      render: (row) => <Reason order={row} by="SHOP" />
    },
    {
      key: 'open',
      label: '',
      render: (row) => (
        <Text
          as="button"
          type="button"
          fontSize="sm"
          fontWeight="600"
          color="brand.500"
          onClick={() => setOpen(row)}
        >
          {t('account.storefront.eshoporders.view')}
        </Text>
      )
    }
  ];

  return (
    <>
      <StorefrontList
        list={list}
        columns={columns}
        store={t('common.eshop')}
        emptyTitle={t('account.storefront.eshoporders.noOrdersYet')}
        emptyHint={t('account.storefront.eshoporders.anythingYouBuyInThe')}
      />

      <OrderDrawer order={open} onClose={() => setOpen(null)} />
    </>
  );
}

/**
 * The delivery address, on one line each.
 *
 * A street without its flat number is not an address, so the three fields
 * are one cell rather than three columns - but they are still three lines,
 * because run together with commas they read as one long string nobody
 * finishes.
 */
function AddressCell({ address }) {
  const surface = useSurface();

  const at = address || {};
  const lines = [at.line, at.building, at.contact].filter(Boolean);

  if (!lines.length) return <Text color={surface.muted}>—</Text>;

  return (
    <Box>
      {lines.map((line, index) => (
        <Text
          key={line}
          fontSize={index ? 'xs' : 'sm'}
          color={index ? surface.muted : surface.text}
          noOfLines={1}
        >
          {line}
        </Text>
      ))}
    </Box>
  );
}

/**
 * One side's cancellation reason, and only that side's.
 *
 * The column it sits in is the claim - "you cancelled this" or "the shop
 * did" - so a reason in the wrong column would be an accusation. It renders
 * only when `cancelled_by` matches, which is the API's decoding of which of
 * the two upstream fields was filled in.
 */
function Reason({ order, by }) {
  const surface = useSurface();

  if (order.cancelled_by !== by) return <Text color={surface.muted}>—</Text>;

  return (
    <Text fontSize="sm" color={surface.text} noOfLines={2}>
      {order.cancel_reason}
    </Text>
  );
}

/** Who cancelled it and why, or nothing at all on a live order. */
function CancelNote({ order }) {
  const t = useT();
  const surface = useSurface();

  if (!order.cancelled_by) return null;

  const who = order.cancelled_by === 'MEMBER'
    ? t('account.storefront.eshoporders.youCancelledThis')
    : t('account.storefront.eshoporders.theShopCancelledThis');

  return (
    <Text fontSize="xs" color={surface.muted} mt="1" noOfLines={2}>
      {who}
      {order.cancel_reason ? ` — ${order.cancel_reason}` : ''}
    </Text>
  );
}

/** One order's lines, fetched when it opens and not before. */
function OrderDrawer({ order, onClose }) {
  const t = useT();
  const surface = useSurface();

  const detail = useApi(
    () => (order ? api.account.eshopOrder(order.order_id) : Promise.resolve({ data: { data: null } })),
    [order && order.order_id]
  );

  const lines = (detail.data && detail.data.lines) || [];

  return (
    <Drawer isOpen={!!order} placement="right" size="md" onClose={onClose}>
      <DrawerOverlay />
      <DrawerContent bg={surface.page}>
        <DrawerCloseButton />
        <DrawerHeader borderBottomWidth="1px" borderColor={surface.border}>
          <Text fontSize="sm" color={surface.muted}>{t('account.storefront.eshoporders.order')}</Text>
          <Text>{order ? order.order_no : ''}</Text>
        </DrawerHeader>

        <DrawerBody>
          {detail.loading ? (
            <Loading variant="list" count={3} height="64px" />
          ) : (
            <Box>
              {order && (
                <>
                  <Flex justify="space-between" align="flex-start" mb="4" gap="3" data-gap="12">
                    <Box>
                      <StatusBadge value={order.status} />
                      <CancelNote order={order} />
                    </Box>
                    <TenderAmounts tenders={order.tenders} t={t} align="right" />
                  </Flex>

                  <DeliverTo address={order.address} payType={order.pay_type} />
                </>
              )}

              <Text
                fontSize="xs"
                fontWeight="700"
                textTransform="uppercase"
                letterSpacing="0.06em"
                color={surface.muted}
                mt="6"
                mb="1"
              >
                {t('account.storefront.eshoporders.items')}
              </Text>

              {lines.map((line, index) => (
                <OrderLine key={line.goods_id || index} line={line} first={index === 0} />
              ))}
            </Box>
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}

/**
 * Where it was going.
 *
 * The three address fields are shown as one block because that is what they
 * are — a street without its flat number is not an address, and putting them
 * in separate labelled rows invites reading them as separate facts.
 */
function DeliverTo({ address, payType }) {
  const t = useT();
  const surface = useSurface();

  const at = address || {};
  const lines = [at.receiver, at.line, at.building, at.contact].filter(Boolean);

  if (!lines.length && !payType) return null;

  return (
    <Box p="4" borderRadius="14px" bg={surface.raised}>
      {!!lines.length && (
        <>
          <Text fontSize="xs" color={surface.muted} textTransform="uppercase" letterSpacing="0.5px">
            {t('account.storefront.eshoporders.deliverTo')}
          </Text>
          {lines.map((line) => (
            <Text key={line} fontSize="sm" color={surface.text}>{line}</Text>
          ))}
        </>
      )}

      {!!payType && (
        <Text fontSize="xs" color={surface.muted} mt={lines.length ? '2' : '0'}>
          {t('account.storefront.eshoporders.paidWith')}: {payType}
        </Text>
      )}
    </Box>
  );
}

/**
 * One line of an order.
 *
 * `standard` is the variant actually bought, and it is on the line rather
 * than folded into the name because without it four identical rows read as
 * one item ordered four times.
 *
 * The struck-through price only appears when there WAS one. Printing the
 * list price beside the paid price on every line, equal to it, teaches the
 * reader to ignore both.
 */
function OrderLine({ line, first }) {
  const t = useT();
  const surface = useSurface();

  const meta = tenderOf(line.tender);

  return (
    <Flex
      align="flex-start"
      py="3"
      borderTopWidth={first ? 0 : '1px'}
      borderColor={surface.border}
      gap="3"
      data-gap="12"
    >
      <Thumbnail line={line} />

      <Box flex="1" minW="0">
        {line.goods_url ? (
          <Link
            href={line.goods_url}
            isExternal
            fontWeight="600"
            color={surface.text}
            _hover={{ color: 'brand.500' }}
          >
            {line.goods_name}
          </Link>
        ) : (
          <Text fontWeight="600" color={surface.text}>{line.goods_name}</Text>
        )}

        {!!line.standard && (
          <Text fontSize="xs" color={surface.muted}>{line.standard}</Text>
        )}

        <Flex align="baseline" gap="2" data-gap="8" data-gap-wrap wrap="wrap" mt="1">
          <Text fontSize="xs" color={surface.muted}>
            {line.qty} × {formatAmount(line.real_price, meta.money)}
          </Text>

          {line.discounted && (
            <Text fontSize="xs" color={surface.muted} textDecoration="line-through">
              {formatAmount(line.price, meta.money)}
            </Text>
          )}

          <Text fontSize="xs" color={surface.muted}>{t(meta.label)}</Text>
        </Flex>

        {!!line.delivery_no && (
          <Text fontSize="xs" color={surface.muted} fontFamily="mono" mt="1">
            {line.delivery_no}
          </Text>
        )}
      </Box>

      <Text fontWeight="700" whiteSpace="nowrap" color={surface.text}>
        {formatAmount(line.total_price, meta.money)}
      </Text>
    </Flex>
  );
}

/**
 * The item's picture, or a stand-in for it.
 *
 * The pictures live on the Eshop's own host, so there is no URL to build
 * unless that host is configured — which in development it is not. A tile
 * with the item's initial holds the layout, and holding it is the point: a
 * row that changes height when a picture arrives makes the whole list jump.
 */
function Thumbnail({ line }) {
  const surface = useSurface();

  return (
    <Flex
      align="center"
      justify="center"
      boxSize="48px"
      flexShrink={0}
      borderRadius="10px"
      overflow="hidden"
      bg={surface.raised}
    >
      {line.image_url ? (
        <Image src={line.image_url} alt="" w="100%" h="100%" objectFit="cover" />
      ) : (
        <Text fontWeight="800" color={surface.muted}>
          {String(line.goods_name || '?').charAt(0)}
        </Text>
      )}
    </Flex>
  );
}
