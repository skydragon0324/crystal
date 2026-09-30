import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  Icon,
  IconButton,
  Image,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  Link,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Tooltip,
  VisuallyHidden,
  useClipboard
} from '@chakra-ui/react';
import { SearchIcon } from '@chakra-ui/icons';
import { FiCheck, FiCopy, FiDownload, FiFileText, FiKey, FiStar, FiX } from 'react-icons/fi';

import StorefrontList from './StorefrontList';
import { DatePicker, EmptyState, ErrorState, Loading, SelectField, StatusBadge } from '@/components/common';
import { toISODate } from '@/components/common/DatePicker';
import api from '@/api';
import { useApi, useDebounced, useList } from '@/hooks/useApi';
import { number } from '@/utils/format';
import { MONEY_COLOR, POINT_COLOR, useSurface } from '@/theme/tokens';
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
 *
 * EVERY CODE ON THESE PAGES GOES THROUGH t(), AND NOTHING ELSE DOES. A kind,
 * a currency, a transaction type, a purchase state and a licence state are
 * closed sets this file and the store agree on, so each has a word in every
 * language. A failure reason is prose the store typed in the store's own
 * language, and it is passed through untouched - there is nothing to look it
 * up in, and inventing a translation would put words in another company's
 * mouth.
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

/**
 * HOW A PURCHASE ENDED, from `spd_state_id`.
 *
 * The vendor reads that one number TWICE - once through a purchase-state
 * table and once through a licence-state table - because it says both how the
 * purchase ended and whether there is a licence to fetch. This page was only
 * reading the licence half, so the status column was answering a question
 * about the key rather than about the purchase.
 *
 * The vendor's own table names two of them (APPSTORE_PURCHASE_STATES:
 * purchased, purchasing) and shows the store's `spd_change_reason` for
 * anything else, falling back to "Purchase failed" when there is no reason.
 * Crystal's API names three more - cancelled, failed, refunded - and those
 * are kept rather than collapsed: a refund is not a failure, and telling a
 * member their refunded purchase "failed" is worse than saying nothing.
 *
 * So: a state with a word gets its word; a state with none falls back to the
 * vendor's sentence; and the store's reason is shown underneath whenever it
 * sent one, which is the part a member opens this column to read.
 */
const PURCHASE_STATE = {
  PURCHASED: 'account.storefront.appstore.statePurchased',
  PURCHASING: 'account.storefront.appstore.statePurchasing',
  CANCELLED: 'account.storefront.appstore.stateCancelled',
  FAILED: 'account.storefront.appstore.stateFailed',
  REFUNDED: 'account.storefront.appstore.stateRefunded'
};

/**
 * THE OTHER HALF OF THE SAME NUMBER - the store's seven licence states.
 *
 * The API sends the vendor's own names (APPSTORE_LICENSE_STATES: SUCCESS,
 * UNUSED, USED, FAIL, REFUND, PENDING, ACCEPT_PENDING) and this table knew
 * three words, two of which the API has never sent - so six of the seven fell
 * through to StatusBadge's last resort, the code lower-cased, and a Chinese
 * page read "success" and "accept pending" in English. SUCCESS is worded
 * "Issued" rather than the vendor's "Success": it is the state of a key, and
 * a key is issued.
 *
 * ISSUED and REVOKED stay: they are Crystal's earlier vocabulary, and a reply
 * cached from before the API moved to the vendor's still reads correctly.
 * `NONE` is not a state worth a badge.
 */
const LICENCE_STATE = {
  SUCCESS: 'account.storefront.appstore.licenceIssued',
  UNUSED: 'account.storefront.appstore.licenceUnused',
  USED: 'account.storefront.appstore.licenceUsed',
  FAIL: 'account.storefront.appstore.licenceFailed',
  REFUND: 'account.storefront.appstore.licenceRefunded',
  PENDING: 'account.storefront.appstore.licencePending',
  ACCEPT_PENDING: 'account.storefront.appstore.licenceAcceptPending',
  ISSUED: 'account.storefront.appstore.licenceIssued',
  REVOKED: 'account.storefront.appstore.licenceRevoked'
};

/*
 * And the vendor's colour for each. The site-wide status table has no entry
 * for most of these, and "not activated" and "activated" are not a good and
 * a bad - they are before and after, which is why neither is red.
 */
const LICENCE_TONE = {
  SUCCESS: 'green',
  UNUSED: 'gray',
  USED: 'orange',
  FAIL: 'red',
  REFUND: 'cyan',
  PENDING: 'blue',
  ACCEPT_PENDING: 'blue',
  ISSUED: 'green',
  REVOKED: 'red'
};

/**
 * A licence state as a badge: its word, in its colour.
 *
 * NOTHING for no state - `NONE`, or the null the API sends for a number the
 * store has no name for, where the vendor draws no tag either. A CODE THIS
 * BUILD HAS NEVER SEEN is still shown, as "Unknown state" in grey with the
 * code itself in the tooltip for whoever is on the phone to support: the
 * badge's own fallback printed the code lower-cased, which is English on a
 * Chinese page and reads as a word the site chose.
 */
function LicenceBadge({ state }) {
  const t = useT();
  if (!state || state === 'NONE') return null;

  const known = word(LICENCE_STATE, state, t);

  return (
    <StatusBadge
      value={state}
      colorScheme={LICENCE_TONE[state] || 'gray'}
      title={known ? undefined : state}
      whiteSpace="nowrap"
    >
      {known || t('account.storefront.appstore.licenceUnknown')}
    </StatusBadge>
  );
}

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

/**
 * THE ICON SIZES THE STORE PUBLISHES, LARGEST FIRST.
 *
 * An app's icon record carries up to six of these and fills in whichever ones
 * were generated - a small app may have only the 48. Reading one size by name
 * shows a blank tile for every app that does not have that particular one, so
 * the first size PRESENT wins and the order is largest-down: a 256 scaled into
 * a 40px tile is sharp on a retina screen and a 48 scaled up is not.
 */
const ICON_SIZES = [
  'icon_256_256_url',
  'icon_192_192_url',
  'icon_144_144_url',
  'icon_96_96_url',
  'icon_72_72_url',
  'icon_48_48_url'
];

/**
 * The best icon this row carries.
 *
 * `icon_urls` is the whole set as absolute urls, `icon_url` the single one the
 * API picks today. Both are read, so this keeps working whichever the service
 * sends - and starts choosing properly the moment the set arrives. A RAW path
 * is never built into a url here: the icons live on the store's own host and
 * only the API knows whether that host is even configured.
 */
function iconUrl(row) {
  const set = row.icon_urls;

  if (set) {
    for (let i = 0; i < ICON_SIZES.length; i += 1) {
      if (set[ICON_SIZES[i]]) return set[ICON_SIZES[i]];
    }
  }

  return row.icon_url || null;
}

/** A code outside the set gets no word rather than an invented one. */
function word(table, code, t) {
  return table[code] ? t(table[code]) : null;
}

/**
 * THE COLOUR AN AMOUNT IS READ IN, by which money it is.
 *
 * Foreign currency red, the store's own two balances blue - the site's rule,
 * the same one the balance tiles below and the Eshop's tenders are drawn
 * with. It is deliberately NOT the direction of the movement: a member can
 * already see the minus sign, and what they cannot see is that one "40" is
 * foreign currency and the next is company coins.
 */
function amountTone(currency) {
  return currency === 'FOREIGN' ? MONEY_COLOR : POINT_COLOR;
}

/** One of the wallet's balances. */
function BalanceTile({ label, value, color }) {
  const surface = useSurface();

  return (
    <Box p="5" borderRadius="14px" bg={surface.raised}>
      <Text fontSize="xs" color={surface.muted} textTransform="uppercase" letterSpacing="0.5px">
        {label}
      </Text>
      <Text fontSize="2xl" fontWeight="800" color={color} letterSpacing="-0.02em">
        {number(value || 0)}
      </Text>
    </Box>
  );
}

/** The row's place in the whole list; every one of these tables leads with it. */
function numberColumn(surface) {
  return {
    key: 'no',
    label: 'account.storefront.appstore.no',
    align: 'center',
    width: '56px',
    /* `position`, not `number` - the row's place in the list, and the name
       would otherwise shadow the number formatter imported at the top. */
    render: (row, position) => <Text fontSize="sm" color={surface.muted}>{position}</Text>
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

/**
 * THE PERIOD AND THE SEARCH, WHICH THE STORE DOES ITSELF.
 *
 * Every one of the vendor's Appstore screens carries the same header: two
 * date pickers labelled "Period", and a search box on the three that take
 * one. SERVER-SIDE, WHICH IS WHY IT SITS ON THE LIST'S PARAMS rather than
 * filtering `rows`: the table holds one page, and filtering twelve of two
 * hundred rows would quietly answer a different question than the box asks.
 *
 * THE PERIOD OPENS ON THIS MONTH - the 1st to today - as the vendor's does
 * (`firstDateOfMonth(moment())` to `moment()` on all four of its pages), and
 * the first request already carries it. This page used to open on an empty
 * window, on the argument that a default month hides last month's order; the
 * answer to that is an empty state that SAYS the period is why and offers to
 * drop it (see `emptyFor`), not a default the members of this store never had.
 *
 * THE PICKERS STAY LIVE WHILE A PAGE LOADS. They were disabled for it, which
 * threw focus to the page body the moment a date was picked - the picker
 * hands focus back to its field on close, and the field had just been
 * disabled. Nothing needs the lock: useList drops a reply that is no longer
 * the latest, so changing the period mid-flight costs a request, not a race.
 */
function StoreFilters({ list, withSearch }) {
  const t = useT();
  const surface = useSurface();

  const setFilter = list.setFilter;
  const from = list.params.from || '';
  const to = list.params.to || '';

  return (
    <Flex align="flex-end" wrap="wrap" gap="3" data-gap="12" data-gap-wrap mb="5">
      <Box>
        <Text fontSize="sm" fontWeight="600" color={surface.text} mb="1.5">
          {t('account.storefront.appstore.period')}
        </Text>
        <Flex align="center" gap="2" data-gap="8">
          <DatePicker
            size="sm"
            w="150px"
            aria-label={t('account.storefront.appstore.from')}
            placeholder={t('account.storefront.appstore.from')}
            value={from}
            max={to || undefined}
            onChange={(next) => setFilter({ from: next || undefined })}
          />
          <Text color={surface.muted} aria-hidden="true">—</Text>
          <DatePicker
            size="sm"
            w="150px"
            aria-label={t('account.storefront.appstore.to')}
            placeholder={t('account.storefront.appstore.to')}
            value={to}
            min={from || undefined}
            onChange={(next) => setFilter({ to: next || undefined })}
          />
        </Flex>
      </Box>

      {withSearch && (
        <SearchBox
          committed={list.params.q || ''}
          onSearch={(term) => setFilter({ q: term })}
        />
      )}
    </Flex>
  );
}

/**
 * THE SEARCH BOX, and what was wrong with it.
 *
 * The API and the store were never the problem - `?q=` reaches the store as
 * the DataTables `sSearch` the vendor sends, and the store matches it. The
 * box in front of them was:
 *
 *   IT SEARCHED WHILE A CHINESE WORD WAS STILL BEING TYPED. Every pause sent
 *   the box's contents, and during IME composition those are pinyin - "kala"
 *   on its way to 卡拉 - so the table emptied and refilled under the member
 *   several times per word. Nothing is sent while a composition is open, and
 *   the finished word is sent the moment it closes.
 *
 *   ENTER DID NOTHING. The vendor's box searches on Enter and only on Enter
 *   (components/Navbars/SearchBar), so that is what its members press; here
 *   it waited out the debounce instead. Enter now searches at once, and the
 *   pause-to-search stays for everyone who does not press it.
 *
 *   AN EMPTY RESULT SAID "NO PURCHASES YET" - to a member whose purchases
 *   had merely been filtered out. See `emptyFor` below.
 *
 *   THERE WAS NO WAY BACK but selecting the text and deleting it. The ×
 *   clears the box and the search together.
 */
function SearchBox({ committed, onSearch }) {
  const t = useT();
  const surface = useSurface();

  const [term, setTerm] = useState(committed);
  const [composedAt, setComposedAt] = useState(0);
  const composing = useRef(false);
  /* One request per pause in typing, not one per letter. */
  const settled = useDebounced(term, 350);

  /*
   * THE BOX FOLLOWS A SEARCH CLEARED FROM OUTSIDE IT - the empty state's
   * "clear the filters". Only the clearing is followed: adopting every
   * committed value would trim the space off the end of "crystal " while
   * the member is still typing the next word.
   */
  useEffect(() => {
    if (!committed) setTerm('');
  }, [committed]);

  useEffect(() => {
    /*
     * Only once the debounce has CAUGHT UP with the box. Straight after a
     * clear, `settled` still holds the old word for 350ms, and sending it
     * would put back the search that was just removed.
     */
    if (composing.current || settled !== term) return;

    const wanted = settled.trim();
    if (wanted !== committed) onSearch(wanted || undefined);
    // `onSearch` is a fresh closure every render and changes nothing that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, term, committed, composedAt]);

  const submitNow = () => {
    const wanted = term.trim();
    if (wanted !== committed) onSearch(wanted || undefined);
  };

  return (
    <Box flex="1" minW="200px" maxW="320px">
      <InputGroup size="sm">
        <InputLeftElement pointerEvents="none" h="32px">
          <SearchIcon color={surface.muted} boxSize="3" />
        </InputLeftElement>
        <Input
          placeholder={t('account.storefront.appstore.searchThisList')}
          aria-label={t('account.storefront.appstore.searchThisList')}
          value={term}
          pr={term ? '32px' : undefined}
          onChange={(event) => setTerm(event.target.value)}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={(event) => {
            composing.current = false;
            setTerm(event.target.value);
            setComposedAt((n) => n + 1);
          }}
          onKeyDown={(event) => {
            /* 229 is the key a browser reports while an IME holds the keyboard. */
            if (event.key !== 'Enter' || composing.current || event.keyCode === 229) return;
            event.preventDefault();
            submitNow();
          }}
        />
        {!!term && (
          <InputRightElement h="32px" w="32px">
            <IconButton
              size="xs"
              variant="ghost"
              aria-label={t('account.storefront.appstore.clearSearch')}
              icon={<Icon as={FiX} />}
              onClick={() => {
                setTerm('');
                if (committed) onSearch(undefined);
              }}
            />
          </InputRightElement>
        )}
      </InputGroup>
    </Box>
  );
}

/**
 * THE EMPTY TABLE, WORDED FOR WHY IT IS EMPTY.
 *
 * Zero rows with a search or a period applied is not "you have not bought
 * anything" - and now that every page opens on this month, a member with no
 * purchases since the 1st would be told exactly that about an account full
 * of them. So a filtered empty names the filter and offers the way out,
 * which is the whole reason the page no longer needs to open unfiltered.
 *
 * `extra` is a page's own filter beyond the three - the wallet's transaction
 * type - with the value that switches it off.
 */
function emptyFor(list, t, unfiltered, extra) {
  const q = list.params.q;
  const dated = !!(list.params.from || list.params.to);
  const other = !!extra && extra.active;

  if (!q && !dated && !other) return unfiltered;

  const reset = Object.assign({ q: undefined, from: undefined, to: undefined }, other ? extra.reset : null);

  return {
    title: q
      ? t('account.storefront.appstore.nothingMatchesTerm', { term: q })
      : t('account.storefront.appstore.nothingInThisPeriod'),
    hint: q || other
      ? t('account.storefront.appstore.tryAnotherWordOrPeriod')
      : t('account.storefront.appstore.tryAWiderPeriod'),
    actionLabel: q || other
      ? t('account.storefront.appstore.clearFilters')
      : t('account.storefront.appstore.showEveryDate'),
    onAction: () => list.setFilter(reset)
  };
}

/** The 1st of this month to today - the vendor's opening period on every page. */
export function thisMonth() {
  const today = new Date();
  return {
    from: toISODate(new Date(today.getFullYear(), today.getMonth(), 1)),
    to: toISODate(today)
  };
}

/* ------------------------------------------------------------------ */

export function AppstorePurchases() {
  const t = useT();
  const surface = useSurface();

  const [licenceFor, setLicenceFor] = useState(null);
  const list = useList((params) => api.account.appstorePurchases(params), {
    initialParams: Object.assign({ page: 1, limit: 12 }, thisMonth())
  });
  const empty = emptyFor(list, t, {
    title: t('account.storefront.appstore.noPurchasesYet'),
    hint: t('account.storefront.appstore.appsYouBuyInThe')
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
          <Text fontWeight="700" color={amountTone(row.currency)}>{number(row.price)}</Text>
          <Text fontSize="xs" color={surface.muted}>{word(CURRENCY, row.currency, t)}</Text>
        </Box>
      )
    },
    { key: 'at', label: 'account.storefront.appstore.bought', render: (row) => row.at },
    {
      /* How the purchase ENDED - see PURCHASE_STATE above. */
      key: 'status',
      label: 'account.storefront.appstore.status',
      render: (row) => <PurchaseState purchase={row} />
    },
    {
      /*
       * WHETHER THERE IS A KEY, which is the other half of the same number.
       *
       * The licence itself is behind a click and never in a column: a key
       * printed down the page is a key in every screenshot, every shared
       * screen and every support ticket. It is also a second call per row, so
       * showing it inline would mean twelve requests to load a page of twelve.
       */
      key: 'licence',
      label: 'account.storefront.appstore.licence',
      render: (row) => (
        <Flex align="center" gap="2" data-gap="8">
          <LicenceBadge state={row.licence_state} />

          {/*
            * THE KEY IS AN ICON BUTTON, and it is only offered where there is
            * something to fetch. The vendor shows an outlined key under a
            * tooltip on its purchased and purchasing rows and nothing at all
            * on the rest - a button that answers "there is no licence" is a
            * button that lied. `licence_available` is the API's reading of
            * exactly those two states.
            *
            * The word moves into the `aria-label` and the tooltip rather than
            * disappearing, so the button can still be named by a screen
            * reader and by anyone who does not recognise the glyph.
            */}
          {row.licence_available && (
            <Tooltip label={t('account.storefront.appstore.showKey')} hasArrow placement="top">
              <IconButton
                size="sm"
                variant="outline"
                colorScheme="blue"
                aria-label={t('account.storefront.appstore.showKey')}
                icon={<FiKey />}
                onClick={() => setLicenceFor(row)}
              />
            </Tooltip>
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
        emptyTitle={empty.title}
        emptyHint={empty.hint}
        emptyActionLabel={empty.actionLabel}
        onEmptyAction={empty.onAction}
      >
        <StoreFilters list={list} withSearch />
      </StorefrontList>
      <LicenceDrawer purchase={licenceFor} onClose={() => setLicenceFor(null)} />
    </>
  );
}

/**
 * How one purchase ended, and why if it did not end well.
 *
 * A component rather than an inline branch because it needs `useSurface`, and
 * a hook inside a column's `render` would be a hook inside a `.map()`.
 */
function PurchaseState({ purchase }) {
  const t = useT();
  const surface = useSurface();

  const named = word(PURCHASE_STATE, purchase.status, t);

  return (
    <Box>
      {/*
        The badge's COLOUR comes from the code and its WORD from the
        catalogue, so it reads the same at a glance in every language. A state
        this build has never seen falls back to the vendor's own sentence
        rather than printing a raw code at a member.
      */}
      <StatusBadge value={purchase.status || 'FAILED'}>
        {named || t('account.storefront.appstore.purchaseFailed')}
      </StatusBadge>

      {/* Only a failure explains itself, and the store's own words are used. */}
      {!!purchase.status_reason && (
        <Text fontSize="xs" color={surface.muted} mt="1" noOfLines={2}>
          {purchase.status_reason}
        </Text>
      )}
    </Box>
  );
}

/**
 * ONE LICENCE, fetched only when the member asks for it - the vendor's
 * ViewAppstoreLicenseQrModal, as a drawer like the Eshop's order detail.
 *
 * THE VENDOR'S RULES, IN ITS ORDER:
 *
 *   ONLY A PURCHASED PURCHASE HAS A LICENCE TO SHOW. The vendor offers the
 *   key button on purchased and purchasing rows, then refuses to open on
 *   anything but PURCHASED (`+resp.data.spd_state_id === PURCHASED`) and
 *   warns "fail to get license" instead. Here the refusal is a sentence in
 *   the drawer rather than a toast that is gone before it is read - and a
 *   purchase still going through says so, rather than calling itself failed.
 *
 *   A QR IF THE STORE HAS ONE, THE KEY OTHERWISE. With a QR the vendor shows
 *   the code, "save as image" and the licence file; without one, the key as
 *   text. Both are here, and the key can be copied in one press.
 *
 * WHERE IT DEPARTS, and why:
 *
 *   NO KEY AND A FILE DOES NOT NAVIGATE AWAY. The vendor sends the browser
 *   straight to the licence file when there is no QR and a file exists,
 *   which on a click labelled "licence" is a download nobody asked for.
 *   The file is a button in the drawer instead, beside whatever else there is.
 *
 *   THE QR IS SAVED FROM THE BYTES ON SCREEN, not by a link to the store's
 *   `/download/license/qrimage/` - so the file saved is the picture the
 *   member is looking at, and saving works where the store's own host is not
 *   configured, which in development it never is.
 */
function LicenceDrawer({ purchase, onClose }) {
  const t = useT();
  const surface = useSurface();

  /*
   * THE DRAWER SLIDES OUT WITH WHAT IT WAS SHOWING. `purchase` goes null the
   * moment it is closed and the close animation has not started yet - read
   * directly, the header and the key would blank half a second before the
   * drawer is gone.
   */
  const last = useRef(null);
  if (purchase) last.current = purchase;
  const shown = purchase || last.current;
  const purchaseId = purchase ? purchase.id : null;

  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ loading: true, error: null, data: null });

  /*
   * ONE REQUEST PER OPENING, AND ONLY THE LATEST ONE COUNTS. useApi has no
   * guard against a slow reply landing after a newer one, and here that is
   * not a flicker: open one purchase, close it, open another, and the first
   * key arrives in the second purchase's drawer.
   */
  useEffect(() => {
    if (!purchaseId) return undefined;

    let current = true;
    setState({ loading: true, error: null, data: null });

    api.account.appstoreLicense(purchaseId).then(
      (result) => {
        if (current) setState({ loading: false, error: null, data: result.data || null });
      },
      (err) => {
        if (current) setState({ loading: false, error: (err && err.message) || true, data: null });
      }
    );

    return () => { current = false; };
  }, [purchaseId, attempt]);

  const held = state.data;

  let body;
  if (state.loading) {
    body = <LicenceSkeleton />;
  } else if (state.error) {
    body = (
      <ErrorState
        message={state.error === true ? t('account.storefront.appstore.licenceCouldNotLoad') : state.error}
        onRetry={() => setAttempt((n) => n + 1)}
      />
    );
  } else if (held && held.purchase_state === 'PURCHASING') {
    body = (
      <EmptyState
        title={t('account.storefront.appstore.licenceStillIssuing')}
        hint={t('account.storefront.appstore.licenceStillIssuingHint')}
      />
    );
  } else if (!held || held.purchase_state !== 'PURCHASED' || (!held.qr && !held.licence && !held.download_url)) {
    body = (
      <EmptyState
        title={t('account.storefront.appstore.noLicenceOnThisPurchase')}
        hint={t('account.storefront.appstore.noLicenceHint')}
      />
    );
  } else {
    body = (
      <Box>
        {held.qr ? (
          <QrLicence licence={held} purchaseId={shown ? shown.id : ''} />
        ) : held.licence ? (
          <KeyLicence licence={held.licence} />
        ) : null}

        {/* Only when the store's host is known - see appstore.api.js. */}
        {!!held.download_url && (
          <Button
            as="a"
            href={held.download_url}
            target="_blank"
            rel="noopener noreferrer"
            variant="outlineBrand"
            w="100%"
            mt="2"
            leftIcon={<Icon as={FiFileText} />}
          >
            {t('account.storefront.appstore.downloadLicence')}
          </Button>
        )}

        <Text fontSize="sm" color={surface.muted} mt="5">
          {t('account.storefront.appstore.keepThisToYourselfIt')}
        </Text>
      </Box>
    );
  }

  return (
    <Drawer isOpen={!!purchase} placement="right" size="sm" onClose={onClose}>
      <DrawerOverlay />
      <DrawerContent bg={surface.page}>
        <DrawerCloseButton />
        <DrawerHeader borderBottomWidth="1px" borderColor={surface.border} pr="12">
          <Text fontSize="sm" color={surface.muted} fontWeight="600">
            {t('account.storefront.appstore.licence')}
          </Text>
          <Text noOfLines={2}>{shown ? shown.name || word(KIND, shown.kind, t) : ''}</Text>
          {shown && (
            <Flex align="center" wrap="wrap" gap="2" data-gap="8" data-gap-wrap mt="1.5">
              {!!shown.device_no && (
                <Text fontSize="xs" fontWeight="500" fontFamily="mono" color={surface.muted}>
                  {t('account.storefront.appstore.device')} {shown.device_no}
                </Text>
              )}
              <LicenceBadge state={(held && held.state) || shown.licence_state} />
            </Flex>
          )}
        </DrawerHeader>
        <DrawerBody py="6" data-licence-state={state.loading ? 'loading' : state.error ? 'error' : 'ready'}>
          {body}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}

/** The shape of what is coming: a square, a line, two buttons. */
function LicenceSkeleton() {
  return (
    <Stack spacing="4" align="center" aria-busy="true">
      <Skeleton boxSize="264px" borderRadius="14px" />
      <Skeleton h="14px" w="70%" />
      <Skeleton h="40px" w="100%" borderRadius="8px" />
      <Skeleton h="40px" w="100%" borderRadius="8px" />
    </Stack>
  );
}

/** The file extension a saved QR gets, from the type the API read off its bytes. */
const QR_EXTENSION = { 'image/png': 'png', 'image/gif': 'gif', 'image/bmp': 'bmp' };

/**
 * The store's QR, and a way to keep it.
 *
 * ON WHITE IN BOTH COLOUR MODES. A QR is read by contrast and by its quiet
 * zone; drawn straight onto the dark drawer its white border merges with
 * nothing and a camera loses the edge, so it sits on a white tile of its own.
 */
function QrLicence({ licence, purchaseId }) {
  const t = useT();
  const surface = useSurface();

  const type = licence.qr_type || 'image/jpeg';
  const src = 'data:' + type + ';base64,' + licence.qr;
  const filename = 'licence-' + (purchaseId || 'qr') + '.' + (QR_EXTENSION[type] || 'jpg');

  return (
    <Flex direction="column" align="center">
      <Box p="3" bg="white" borderRadius="14px" border="1px solid" borderColor={surface.border}>
        <Image
          src={src}
          alt={t('account.storefront.appstore.qrCodeForThisLicence')}
          boxSize="240px"
          htmlWidth="240"
          htmlHeight="240"
          data-licence-qr
        />
      </Box>
      <Text fontSize="sm" color={surface.muted} mt="3" textAlign="center" maxW="280px">
        {t('account.storefront.appstore.scanWithYourDevice')}
      </Text>

      {/*
        * A DATA URI WITH `download`, which Chrome saves rather than opening -
        * no object URL to create and forget to revoke, and no request.
        */}
      <Button
        as="a"
        href={src}
        download={filename}
        variant="brand"
        w="100%"
        mt="5"
        leftIcon={<Icon as={FiDownload} />}
      >
        {t('account.storefront.appstore.saveQrImage')}
      </Button>
    </Flex>
  );
}

/**
 * THE KEY AS TEXT, which is what a member types into a device - so it is
 * large, monospaced, selectable in one click, and copyable in one press.
 */
function KeyLicence({ licence }) {
  const t = useT();
  const surface = useSurface();
  const { hasCopied, onCopy } = useClipboard(licence);

  return (
    <Box>
      <Text fontSize="xs" color={surface.muted} textTransform="uppercase" letterSpacing="0.06em" fontWeight="600">
        {t('account.storefront.appstore.deviceLicence')}
      </Text>
      <Text
        as="output"
        display="block"
        fontFamily="mono"
        fontSize="lg"
        fontWeight="700"
        color={surface.text}
        p="4"
        mt="2"
        borderRadius="10px"
        bg={surface.raised}
        border="1px solid"
        borderColor={surface.border}
        wordBreak="break-all"
        userSelect="all"
        data-licence-key
      >
        {licence}
      </Text>
      <Button
        variant={hasCopied ? 'quiet' : 'brand'}
        w="100%"
        mt="3"
        leftIcon={<Icon as={hasCopied ? FiCheck : FiCopy} />}
        onClick={onCopy}
      >
        {hasCopied ? t('account.storefront.appstore.keyCopied') : t('account.storefront.appstore.copyKey')}
      </Button>
      {/* The button's word changes, but a changed word is not announced. */}
      <VisuallyHidden role="status">{hasCopied ? t('account.storefront.appstore.keyCopied') : ''}</VisuallyHidden>
    </Box>
  );
}

/* ------------------------------------------------------------------ */

export function AppstoreComments() {
  const t = useT();
  const surface = useSurface();

  const list = useList((params) => api.account.appstoreComments(params), {
    initialParams: Object.assign({ page: 1, limit: 12 }, thisMonth())
  });
  const empty = emptyFor(list, t, {
    title: t('account.storefront.appstore.noCommentsYet'),
    hint: t('account.storefront.appstore.reviewsYouLeaveInThe')
  });

  const columns = [
    numberColumn(surface),
    {
      key: 'app_name',
      label: 'account.storefront.appstore.commentedApp',
      render: (row) => (
        <Flex align="center" gap="3" data-gap="12">
          <AppIcon name={row.app_name} url={iconUrl(row)} />
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
       * nobody can see it. Both words come out of the catalogue - it is a
       * boolean, which is as closed as a set gets.
       */
      key: 'approved',
      label: 'account.storefront.appstore.status',
      render: (row) => (
        <StatusBadge value={row.approved ? 'APPROVED' : 'PENDING'}>
          {t(row.approved
            ? 'account.storefront.appstore.commentApproved'
            : 'account.storefront.appstore.commentPending')}
        </StatusBadge>
      )
    }
  ];

  return (
    <StorefrontList
      list={list}
      columns={columns}
      store={t('account.storefront.appstore.appstore')}
      emptyTitle={empty.title}
      emptyHint={empty.hint}
      emptyActionLabel={empty.actionLabel}
      onEmptyAction={empty.onAction}
    >
      <StoreFilters list={list} withSearch />
    </StorefrontList>
  );
}

/* ------------------------------------------------------------------ */

export function AppstoreFavourites() {
  const t = useT();
  const surface = useSurface();

  const list = useList((params) => api.account.appstoreFavourites(params), {
    initialParams: Object.assign({ page: 1, limit: 12 }, thisMonth())
  });
  const empty = emptyFor(list, t, {
    title: t('account.storefront.appstore.nothingSavedYet'),
    hint: t('account.storefront.appstore.appsYouStarInThe')
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
      render: (row) => <AppIcon name={row.app_name} url={iconUrl(row)} size="48px" />
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
      emptyTitle={empty.title}
      emptyHint={empty.hint}
      emptyActionLabel={empty.actionLabel}
      onEmptyAction={empty.onAction}
    >
      <StoreFilters list={list} withSearch />
    </StorefrontList>
  );
}

/* ------------------------------------------------------------------ */

/** The coin wallet: the balance, then its statement. */
export function AppstoreWallet() {
  const t = useT();
  const surface = useSurface();

  const balance = useApi(() => api.account.appstoreBalance(), []);
  const list = useList((params) => api.account.appstoreTransactions(params), {
    initialParams: Object.assign({ page: 1, limit: 15, type: 0 }, thisMonth())
  });
  const empty = emptyFor(list, t, {
    title: t('account.storefront.appstore.noCoinActivityYet'),
    hint: t('account.storefront.appstore.topUpsAndPurchasesAppear')
  }, { active: !!list.params.type, reset: { type: 0 } });

  const columns = [
    numberColumn(surface),
    {
      /*
       * THE COLOUR SAYS WHICH MONEY, NOT WHICH DIRECTION - see amountTone.
       * The sign is still a sign: an explicit '+' on a credit, and the minus
       * the number carries itself.
       */
      key: 'amount',
      label: 'account.storefront.appstore.coins',
      align: 'right',
      render: (row) => (
        <Text fontWeight="700" color={amountTone(row.currency)}>
          {row.amount > 0 ? '+' : ''}
          {number(row.amount)}
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
      /* The store's own prose, in the store's own language. */
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
        /*
          THE THREE BALANCES THE WALLET ACTUALLY RETURNS - the coins
          (`prhn_value`) and the two point balances (`native_score`,
          `foreign_score`). The second tile used to say "Frozen", a figure the
          wallet does not have: it was the mock's invention, and against the
          real service it read 0 for everyone. Native points are blue and
          foreign red, the site's rule for the two units.
        */
        <SimpleGrid columns={{ base: 1, sm: 3 }} spacing="3" mb="7" maxW="660px">
          <BalanceTile label={t('account.storefront.appstore.coins')} value={coins.coins} color={surface.text} />
          <BalanceTile label={t('account.storefront.appstore.nativeScore')} value={coins.native_score} color={POINT_COLOR} />
          <BalanceTile label={t('account.storefront.appstore.foreignScore')} value={coins.foreign_score} color={MONEY_COLOR} />
        </SimpleGrid>
      )}

      <StorefrontList
        list={list}
        columns={columns}
        store={t('account.storefront.appstore.appstore')}
        emptyTitle={empty.title}
        emptyHint={empty.hint}
        emptyActionLabel={empty.actionLabel}
        onEmptyAction={empty.onAction}
      >
        {/*
          * THE FILTERS ARE SERVER-SIDE, which is why they sit on the list's
          * params rather than filtering `rows`. The table holds one page, and
          * filtering fifteen of two hundred rows would quietly answer a
          * different question than the one the controls ask.
          *
          * NO SEARCH BOX HERE, and that is not an omission. The wallet's
          * endpoint takes a period and a type and no search term - the
          * vendor's wallet screen offers the same two - and a box that
          * changed nothing would be worse than no box.
          */}
        <StoreFilters list={list} />

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
