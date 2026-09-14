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
  SimpleGrid,
  Text
} from '@chakra-ui/react';
import { FiStar } from 'react-icons/fi';

import StorefrontList from './StorefrontList';
import { EmptyState, ErrorState, Loading, SelectField, StatusBadge } from '@/components/common';
import api from '@/api';
import { useApi, useList } from '@/hooks/useApi';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * The Appstore: four pages that share this file because they share everything
 * except their columns.
 *
 * Purchases, comments, favourites and the coin wallet are four calls to two
 * remote services. Each was its own component in the vendor's console, with
 * its own copy of the same paging state; here the difference between them is
 * a column list, which is the amount of difference there actually is.
 *
 * THE COLUMN ORDER IS THE VENDOR'S, the same as the Eshop pages. Members read
 * these screens for years and nothing about the arrangement was wrong, so
 * rearranging it costs them the habit of knowing where to look and buys
 * nothing.
 */

/** The five things the store sells, and how each one is worded. */
const KIND = {
  APP: 'account.storefront.appstore.kindApp',
  DIAMOND: 'account.storefront.appstore.kindDiamond',
  AVATAR: 'account.storefront.appstore.kindAvatar',
  EVENT_ITEM: 'account.storefront.appstore.kindEventItem',
  NICKNAME: 'account.storefront.appstore.kindNickname'
};

/** Which purse a figure is in. `IMMATERIAL` is the store's own non-cash one. */
const CURRENCY = {
  IMMATERIAL: 'account.storefront.appstore.moneyImmaterial',
  COMPANY: 'account.storefront.appstore.moneyCompany',
  FOREIGN: 'account.storefront.appstore.moneyForeign'
};

/** What moved the coins. Doubles as the wallet's filter. */
const TRANSACTION = {
  TOPUP: 'account.storefront.appstore.tranTopup',
  PURCHASE: 'account.storefront.appstore.tranPurchase',
  REFUND: 'account.storefront.appstore.tranRefund',
  TRANSFER_IN: 'account.storefront.appstore.tranTransferIn',
  TRANSFER_OUT: 'account.storefront.appstore.tranTransferOut'
};

/** The ids the wallet's `type` parameter takes, in the mapper's order. */
const TRANSACTION_IDS = [
  { id: 1, code: 'TOPUP' },
  { id: 2, code: 'PURCHASE' },
  { id: 3, code: 'REFUND' },
  { id: 4, code: 'TRANSFER_IN' },
  { id: 5, code: 'TRANSFER_OUT' }
];

/** A code outside the set gets no word rather than an invented one. */
function word(table, code, t) {
  return table[code] ? t(table[code]) : null;
}

/** The row's place in the whole list; every one of these tables leads with it. */
function numberColumn(surface) {
  return {
    key: 'no',
    label: 'account.storefront.appstore.no',
    align: 'center',
    width: '56px',
    render: (row, number) => <Text fontSize="sm" color={surface.muted}>{number}</Text>
  };
}

/**
 * An app's icon, or a stand-in for it.
 *
 * The icons live on the Appstore's own host, so there is no URL to build
 * unless that host is configured - which in development it is not. A tile
 * with the app's initial holds the layout, and holding it is the point: rows
 * that change height when a picture arrives make the whole list jump.
 */
function AppIcon({ name, url, size }) {
  const surface = useSurface();

  return (
    <Flex
      align="center"
      justify="center"
      boxSize={size || '40px'}
      flexShrink={0}
      borderRadius="10px"
      overflow="hidden"
      bg={surface.raised}
    >
      {url ? (
        <Image src={url} alt="" w="100%" h="100%" objectFit="cover" />
      ) : (
        <Text fontWeight="800" color={surface.muted}>{String(name || '?').charAt(0)}</Text>
      )}
    </Flex>
  );
}

/* ------------------------------------------------------------------ */

export function AppstorePurchases() {
  const t = useT();
  const surface = useSurface();

  const [licenceFor, setLicenceFor] = useState(null);
  const list = useList((params) => api.account.appstorePurchases(params), {
    initialParams: { page: 1, limit: 12 }
  });

  const columns = [
    numberColumn(surface),
    {
      key: 'kind',
      label: 'account.storefront.appstore.type',
      render: (row) => (
        <Text fontSize="sm" color={surface.muted}>{word(KIND, row.kind, t) || '—'}</Text>
      )
    },
    {
      /*
       * WHAT WAS BOUGHT, from whichever of five fields holds it.
       *
       * The store sells apps, diamonds, avatars, event items and nicknames,
       * and each names itself in its own field. An avatar has no name at all,
       * so it falls back to its kind rather than to an empty cell - a blank
       * row reads as data that failed to load.
       */
      key: 'name',
      label: 'account.storefront.appstore.name',
      render: (row) => (
        <Box>
          {row.url ? (
            <Link href={row.url} isExternal fontWeight="600" color={surface.text} _hover={{ color: 'brand.500' }}>
              {row.name || word(KIND, row.kind, t)}
            </Link>
          ) : (
            <Text fontWeight="600" color={surface.text}>{row.name || word(KIND, row.kind, t)}</Text>
          )}
          {!!row.app_version && (
            <Text fontSize="xs" color={surface.muted}>v{row.app_version}</Text>
          )}
        </Box>
      )
    },
    {
      key: 'device_no',
      label: 'account.storefront.appstore.device',
      render: (row) => (
        <Text fontSize="xs" fontFamily="mono" color={surface.muted}>{row.device_no || '—'}</Text>
      )
    },
    {
      key: 'price',
      label: 'account.storefront.appstore.paid',
      align: 'right',
      render: (row) => (
        <Box textAlign="right">
          <Text fontWeight="700" color={surface.text}>{Number(row.price).toLocaleString()}</Text>
          <Text fontSize="xs" color={surface.muted}>{word(CURRENCY, row.currency, t)}</Text>
        </Box>
      )
    },
    { key: 'at', label: 'account.storefront.appstore.bought', render: (row) => row.at },
    {
      key: 'status',
      label: 'account.storefront.appstore.status',
      render: (row) => (
        <Box>
          <StatusBadge value={row.status} />
          {/* Only a failure explains itself, in the store's own words. */}
          {!!row.status_reason && (
            <Text fontSize="xs" color={surface.muted} mt="1" noOfLines={2}>{row.status_reason}</Text>
          )}
        </Box>
      )
    },
    {
      /*
       * THE LICENCE IS BEHIND A CLICK, not in a column.
       *
       * A key printed down the page is a key in every screenshot, every shared
       * screen and every support ticket. It is also a second call per row, so
       * showing it inline would mean twelve requests to load a page of twelve.
       *
       * And it is only offered where there is one to fetch. The vendor showed
       * the button on two states and warned on the rest, which is a worse
       * trade: a button that answers "no" is a button that lied.
       */
      key: 'licence',
      label: 'account.storefront.appstore.licence',
      render: (row) => (
        <Flex align="center" gap="2" data-gap="8">
          {/* NONE is the absence of a licence, not a state worth a badge. */}
          {row.licence_state !== 'NONE' && <StatusBadge value={row.licence_state} />}
          {row.licence_available && (
            <Text
              as="button"
              type="button"
              fontSize="sm"
              fontWeight="600"
              color="brand.500"
              onClick={() => setLicenceFor(row)}
            >
              {t('account.storefront.appstore.showKey')}
            </Text>
          )}
        </Flex>
      )
    }
  ];

  return (
    <>
      <StorefrontList
        list={list}
        columns={columns}
        store={t('account.storefront.appstore.appstore')}
        emptyTitle={t('account.storefront.appstore.noPurchasesYet')}
        emptyHint={t('account.storefront.appstore.appsYouBuyInThe')}
      />
      <LicenceDrawer purchase={licenceFor} onClose={() => setLicenceFor(null)} />
    </>
  );
}

/** One licence, fetched only when the member asks for it. */
function LicenceDrawer({ purchase, onClose }) {
  const t = useT();
  const surface = useSurface();

  const licence = useApi(
    () => (purchase
      ? api.account.appstoreLicense(purchase.id)
      : Promise.resolve({ data: { data: null } })),
    [purchase && purchase.id]
  );

  const held = licence.data || null;

  return (
    <Drawer isOpen={!!purchase} placement="right" size="sm" onClose={onClose}>
      <DrawerOverlay />
      <DrawerContent bg={surface.page}>
        <DrawerCloseButton />
        <DrawerHeader borderBottomWidth="1px" borderColor={surface.border}>
          <Text fontSize="sm" color={surface.muted}>{t('account.storefront.appstore.licence')}</Text>
          <Text>{purchase ? purchase.name : ''}</Text>
        </DrawerHeader>
        <DrawerBody>
          {licence.loading ? (
            <Loading variant="list" count={1} height="80px" />
          ) : licence.error ? (
            <ErrorState message={licence.error} onRetry={licence.reload} />
          ) : held && (held.licence || held.qr) ? (
            <Box>
              {/*
                * THE QR IS HEX ON THE WIRE and base64 by the time it gets
                * here - the conversion belongs to the service's encoding, not
                * to this component. It is absent more often than not, and the
                * key below is the part that actually activates anything.
                */}
              {!!held.qr && (
                <Flex justify="center" mb="5">
                  <Image
                    src={'data:image/jpeg;base64,' + held.qr}
                    alt=""
                    boxSize="240px"
                    borderRadius="12px"
                  />
                </Flex>
              )}

              <Text fontSize="xs" color={surface.muted} textTransform="uppercase" letterSpacing="0.06em">
                {t('account.storefront.appstore.deviceLicence')}
              </Text>
              <Text
                fontFamily="mono"
                fontSize="lg"
                fontWeight="700"
                color={surface.text}
                p="3"
                mt="2"
                borderRadius="10px"
                bg={surface.raised}
                wordBreak="break-all"
              >
                {held.licence}
              </Text>

              {/* Only when the store's host is known - see appstore.api.js. */}
              {!!held.download_url && (
                <Link
                  href={held.download_url}
                  isExternal
                  display="inline-block"
                  mt="3"
                  fontSize="sm"
                  fontWeight="600"
                  color="brand.500"
                >
                  {t('account.storefront.appstore.downloadLicence')}
                </Link>
              )}

              <Text fontSize="sm" color={surface.muted} mt="4">
                {t('account.storefront.appstore.keepThisToYourselfIt')}
              </Text>
            </Box>
          ) : (
            <EmptyState title={t('account.storefront.appstore.noLicenceOnThisPurchase')} />
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */

export function AppstoreComments() {
  const t = useT();
  const surface = useSurface();

  const list = useList((params) => api.account.appstoreComments(params), {
    initialParams: { page: 1, limit: 12 }
  });

  const columns = [
    numberColumn(surface),
    {
      key: 'app_name',
      label: 'account.storefront.appstore.commentedApp',
      render: (row) => (
        <Flex align="center" gap="3" data-gap="12">
          <AppIcon name={row.app_name} url={row.icon_url} />
          <Text fontWeight="600" color={surface.text} noOfLines={2}>{row.app_name}</Text>
        </Flex>
      )
    },
    {
      key: 'rating',
      label: 'account.storefront.appstore.rating',
      align: 'right',
      render: (row) => (
        <Flex align="center" justify="flex-end" gap="1" data-gap="4">
          <Box as={FiStar} color="orange.400" />
          <Text fontWeight="700">{row.rating}</Text>
        </Flex>
      )
    },
    {
      key: 'content',
      label: 'account.storefront.appstore.comment',
      render: (row) => (
        <Text fontSize="sm" color={surface.muted} maxW="420px">{row.content}</Text>
      )
    },
    { key: 'at', label: 'account.storefront.appstore.posted', render: (row) => row.at },
    {
      /*
       * APPROVED, OR STILL WAITING.
       *
       * A member's own comment can sit unapproved for days. Without this the
       * page shows it as though it were live, and the member wonders why
       * nobody can see it.
       */
      key: 'approved',
      label: 'account.storefront.appstore.status',
      render: (row) => <StatusBadge value={row.approved ? 'APPROVED' : 'PENDING'} />
    }
  ];

  return (
    <StorefrontList
      list={list}
      columns={columns}
      store={t('account.storefront.appstore.appstore')}
      emptyTitle={t('account.storefront.appstore.noCommentsYet')}
      emptyHint={t('account.storefront.appstore.reviewsYouLeaveInThe')}
    />
  );
}

/* ------------------------------------------------------------------ */

export function AppstoreFavourites() {
  const t = useT();
  const surface = useSurface();

  const list = useList((params) => api.account.appstoreFavourites(params), {
    initialParams: { page: 1, limit: 12 }
  });

  /*
   * THREE COLUMNS, WHICH IS ALL THE SERVICE RETURNS.
   *
   * This page used to show a category, a price and whether the app was
   * installed. The store sends none of those - the favourites endpoint
   * returns an id, an icon, a name, whether the app is still published and
   * when it was starred - so all three were invented, and all three would
   * have come back empty the first time this ran against the real service.
   */
  const columns = [
    numberColumn(surface),
    {
      key: 'icon',
      label: 'account.storefront.appstore.image',
      width: '72px',
      render: (row) => <AppIcon name={row.app_name} url={row.icon_url} size="48px" />
    },
    {
      key: 'app_name',
      label: 'account.storefront.appstore.app',
      render: (row) => (
        <Box>
          <Text fontWeight="600" color={surface.text}>{row.app_name}</Text>
          {/* Starred apps can be withdrawn from the store afterwards. */}
          {!row.approved && (
            <Text fontSize="xs" color={surface.muted}>
              {t('account.storefront.appstore.noLongerInTheStore')}
            </Text>
          )}
        </Box>
      )
    },
    { key: 'at', label: 'account.storefront.appstore.saved', render: (row) => row.at }
  ];

  return (
    <StorefrontList
      list={list}
      columns={columns}
      store={t('account.storefront.appstore.appstore')}
      emptyTitle={t('account.storefront.appstore.nothingSavedYet')}
      emptyHint={t('account.storefront.appstore.appsYouStarInThe')}
    />
  );
}

/* ------------------------------------------------------------------ */

/** The coin wallet: the balance, then its statement. */
export function AppstoreWallet() {
  const t = useT();
  const surface = useSurface();

  const balance = useApi(() => api.account.appstoreBalance(), []);
  const list = useList((params) => api.account.appstoreTransactions(params), {
    initialParams: { page: 1, limit: 15, type: 0 }
  });

  const columns = [
    numberColumn(surface),
    {
      key: 'amount',
      label: 'account.storefront.appstore.coins',
      align: 'right',
      render: (row) => (
        <Text fontWeight="700" color={row.amount < 0 ? 'red.400' : 'green.500'}>
          {row.amount > 0 ? '+' : ''}
          {Number(row.amount).toLocaleString()}
        </Text>
      )
    },
    {
      key: 'currency',
      label: 'account.storefront.appstore.walletType',
      render: (row) => (
        <Text fontSize="sm" color={surface.muted}>{word(CURRENCY, row.currency, t) || '—'}</Text>
      )
    },
    {
      key: 'kind',
      label: 'account.storefront.appstore.tranType',
      render: (row) => (
        <Text fontSize="sm" color={surface.muted}>{word(TRANSACTION, row.kind, t) || '—'}</Text>
      )
    },
    {
      key: 'reference',
      label: 'account.storefront.appstore.tranNo',
      render: (row) => (
        <Text fontSize="xs" fontFamily="mono" color={surface.muted}>{row.reference}</Text>
      )
    },
    {
      key: 'detail',
      label: 'account.storefront.appstore.tranDetail',
      render: (row) => (
        <Text fontSize="sm" color={surface.text} maxW="360px">
          {row.detail || t('common.adjustment')}
        </Text>
      )
    },
    { key: 'at', label: 'account.storefront.appstore.when', render: (row) => row.at }
  ];

  const coins = balance.data || {};

  const typeOptions = [{ value: 0, label: t('common.all') }].concat(
    TRANSACTION_IDS.map((entry) => ({ value: entry.id, label: t(TRANSACTION[entry.code]) }))
  );

  return (
    <Box>
      {balance.loading ? (
        <Loading variant="list" count={1} height="96px" />
      ) : (
        <SimpleGrid columns={{ base: 2 }} spacing="3" mb="7" maxW="440px">
          <Box p="5" borderRadius="14px" bg={surface.raised}>
            <Text fontSize="xs" color={surface.muted} textTransform="uppercase" letterSpacing="0.5px">
              {t('account.storefront.appstore.coins')}
            </Text>
            <Text fontSize="2xl" fontWeight="800" color={surface.text} letterSpacing="-0.02em">
              {Number(coins.coins || 0).toLocaleString()}
            </Text>
          </Box>
          <Box p="5" borderRadius="14px" bg={surface.raised}>
            <Text fontSize="xs" color={surface.muted} textTransform="uppercase" letterSpacing="0.5px">
              {t('account.storefront.appstore.frozen')}
            </Text>
            <Text fontSize="2xl" fontWeight="800" color={surface.muted} letterSpacing="-0.02em">
              {Number(coins.frozen || 0).toLocaleString()}
            </Text>
            {/* Frozen coins are held against something in flight. Saying so
                stops it reading as coins that have gone missing. */}
            <Text fontSize="xs" color={surface.muted}>{t('account.storefront.appstore.heldAgainstAPurchase')}</Text>
          </Box>
        </SimpleGrid>
      )}

      <StorefrontList
        list={list}
        columns={columns}
        store={t('account.storefront.appstore.appstore')}
        emptyTitle={t('account.storefront.appstore.noCoinActivityYet')}
        emptyHint={t('account.storefront.appstore.topUpsAndPurchasesAppear')}
      >
        {/*
          * THE TYPE FILTER IS SERVER-SIDE, which is why it sits on the list's
          * params rather than filtering `rows`. The table holds one page, and
          * filtering fifteen of two hundred rows would quietly answer a
          * different question than the one the select asks.
          */}
        <Box maxW="260px" mb="4">
          <SelectField
            label={t('account.storefront.appstore.tranType')}
            value={list.params.type}
            options={typeOptions}
            onChange={(value) => list.setFilter({ type: Number(value) || 0 })}
            isDisabled={list.loading}
            size="sm"
          />
        </Box>
      </StorefrontList>
    </Box>
  );
}
