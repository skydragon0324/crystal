import React, { useEffect } from 'react';
import { Box, Tag, Text, useColorModeValue } from '@chakra-ui/react';

import StorefrontList from './StorefrontList';
import { fillLabel, fillTone, formatAmount, moneyTypeLabel } from './eshopTerms';
import api from '@/api';
import { useList } from '@/hooks/useApi';
import { MONEY_COLOR, useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * The Eshop wallet log — transactions, experience, or commerce value.
 *
 * ONE PAGE FOR THREE MENU ENTRIES, because upstream it is one call with a
 * different `type`. The vendor's console built three screens over that one
 * endpoint; the menu here still lists all three, and each lands on this page
 * with `view` already set (see accountNav.js).
 *
 * The three differ in one respect that matters to the reader, which is what
 * the amount MEANS: money in the first, points in the other two. So the column
 * is formatted per view rather than always as currency — showing experience
 * points with a currency symbol is a small lie that makes the page unreadable.
 *
 * THREE COLUMNS DESCRIBE A MOVEMENT, and they answer different questions.
 * `money_type` is WHICH balance moved, `fill_type` is WHAT moved it, and the
 * remark is prose the service wrote about it. A member scanning for "where did
 * the money go" reads the fill type, and it is the only one of the three that
 * could ever be sorted or filtered on — which is why the vendor's console gave
 * them a column each rather than running them together into one sentence.
 */
const VIEWS = {
  TRANSACTIONS: {
    money: true,
    /*
     * THE MONEY TYPE COLUMN IS ON THIS VIEW AND NOT THE OTHER TWO, which is
     * the vendor's arrangement and its reason is sound. The wallet holds more
     * than one purse - the wallet balance and the bonus balance - so the
     * column tells two rows of the same statement apart. Experience and
     * commerce value are each a single balance, so there the column would be
     * the same word two hundred times; the vendor commented it out on both
     * screens rather than print it, and so does this.
     */
    moneyType: true,
    empty: 'account.storefront.eshoplog.noTransactionsYet'
  },
  EXPERIENCE: {
    money: false,
    moneyType: false,
    empty: 'account.storefront.eshoplog.noExperienceEarnedYet'
  },
  COMMERCE: {
    money: false,
    moneyType: false,
    empty: 'account.storefront.eshoplog.noCommerceValueYet'
  }
};

export default function EshopLog({ view }) {
  const t = useT();
  const surface = useSurface();

  /*
   * ON THE TWO POINTS VIEWS, THE COLOUR SAYS WHICH WAY - blue in, pink out.
   *
   * The money view keeps the site's unit rule (red is money), and there is
   * no unit to tell apart on experience or commerce value: the column is
   * points on every row, so its colour had nothing to say and said "blue"
   * two hundred times. What a member scans these two statements for is where
   * points were EARNED and where they were TAKEN, so the colour carries that.
   *
   * THE SIGN STAYS AS WELL - '+' written in front of a credit, the minus the
   * number carries itself - because colour must never be the only cue: it is
   * invisible to a colour-blind reader and to anyone printing the page.
   * Pink rather than red, so a deduction is not mistaken for money on a site
   * where red means foreign currency. Read with useColorModeValue out here,
   * not in `render`, which runs inside a .map().
   */
  const plusTone = useColorModeValue('blue.600', 'blue.300');
  const minusTone = useColorModeValue('pink.600', 'pink.300');
  const pointTone = (amount) => (amount > 0 ? plusTone : amount < 0 ? minusTone : surface.muted);

  const wanted = view || 'TRANSACTIONS';
  const config = VIEWS[wanted] || VIEWS.TRANSACTIONS;

  const list = useList((params) => api.account.eshopLog(params), {
    initialParams: { page: 1, limit: 15, view: wanted }
  });

  /*
   * THE VIEW HAS TO BE PUSHED BACK INTO THE REQUEST, AND THIS IS WHY THE
   * OTHER TWO SCREENS LOOKED BROKEN.
   *
   * Transactions, experience and commerce value are three routes rendering
   * this one component with a different `view` (App.js). React Router's
   * <Switch> clones whichever <Route> matched and returns it as its single
   * child - so when the location changes from one of these three to another,
   * React sees the same element TYPE in the same slot and RECONCILES rather
   * than remounting. The component is never torn down, so its state survives,
   * and `initialParams` is by definition only read once.
   *
   * The result: the params still said TRANSACTIONS, nothing about them had
   * changed, and useList - which refetches when its params change - had no
   * reason to ask the server anything. The member clicked Experience and got
   * the transaction rows they were already looking at, under an experience
   * heading, with no request in the network panel to explain it.
   *
   * So the prop is compared against what was last ASKED FOR rather than
   * against a ref or a mount flag. On the first render the two already agree,
   * which is what keeps this from firing a second request on load; on a
   * navigation they disagree exactly once.
   */
  const asked = list.params.view;
  const setFilter = list.setFilter;

  useEffect(() => {
    if (asked !== wanted) setFilter({ view: wanted });
  }, [asked, wanted, setFilter]);

  /*
   * ROWS FROM THE PREVIOUS VIEW ARE NOT SHOWN UNDER THE NEW ONE'S HEADINGS.
   *
   * useList deliberately keeps its rows while a request is in flight - that
   * is right for paging and for a search box, where the old rows are the same
   * KIND of thing as the new ones. Here they are not: money would sit under
   * an "Experience" heading for as long as the round trip takes, which is the
   * one reading of this screen that is actually wrong.
   */
  const catchingUp = asked !== wanted;
  const shown = catchingUp
    ? Object.assign({}, list, { rows: [], loading: true })
    : list;

  /*
   * THE COLUMN ORDER IS THE VENDOR'S: number, time, amount, money type,
   * fill type, detail.
   *
   * It is worth keeping rather than improving on. Members read these three
   * screens in the vendor's console for years, and a statement whose columns
   * have been rearranged is one somebody has to learn again - for no gain,
   * since the old arrangement was not wrong.
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
    { key: 'at', label: 'account.storefront.eshoplog.when', render: (row) => row.at },
    {
      /*
       * ON THE MONEY VIEW THE COLOUR SAYS WHICH UNIT; ON THE POINTS VIEWS,
       * WHICH DIRECTION.
       *
       * Money is red, the site's rule everywhere else - the same red the
       * order tenders and the Appstore balances are drawn in - because on the
       * transaction statement the reader cannot otherwise tell forty of the
       * shop's currency from forty of anything else. Experience and commerce
       * value are points on every row, so there the unit needs no colour and
       * the direction gets it: blue earned, pink taken (see `pointTone`).
       * Either way the sign stays a sign: an explicit '+' in front of a
       * credit, and the minus the number carries itself.
       */
      key: 'amount',
      label: config.money
        ? 'account.storefront.eshoplog.amount'
        : 'account.storefront.eshop.tenderPoint',
      align: 'right',
      render: (row) => (
        <Text
          fontWeight="700"
          sx={{ fontVariantNumeric: 'tabular-nums' }}
          color={config.money ? MONEY_COLOR : pointTone(row.amount)}
          data-sign={row.amount > 0 ? 'plus' : row.amount < 0 ? 'minus' : 'zero'}
        >
          {row.amount > 0 ? '+' : ''}
          {formatAmount(row.amount, config.money)}
        </Text>
      )
    },
    config.moneyType ? {
      /* WHICH balance moved - the wallet, the bonus purse, experience. */
      key: 'money_type',
      label: 'account.storefront.eshoplog.moneyType',
      render: (row) => (
        <Text fontSize="sm" color={surface.muted}>{moneyTypeLabel(t, row.kind) || '—'}</Text>
      )
    } : null,
    {
      /*
       * WHAT moved it, as a tag rather than as a line of text.
       *
       * It is a code out of a closed set - the one field on this row that
       * could be sorted or filtered on - and a tag is what says so: it reads
       * as a label rather than as more of the shop's prose in the next column
       * along, and the colour lets a member find every refund down a page
       * without reading any of it.
       *
       * Blank rather than a placeholder tag when the code is unknown: the
       * service does send codes this page has never heard of, and inventing a
       * word for one is worse than admitting there isn't one.
       */
      key: 'fill',
      label: 'account.storefront.eshoplog.type',
      render: (row) => {
        const label = fillLabel(t, row.fill);

        if (!label) return <Text fontSize="sm" color={surface.muted}>—</Text>;

        return (
          <Tag size="sm" colorScheme={fillTone(row.fill)} whiteSpace="nowrap">
            {label}
          </Tag>
        );
      }
    },
    {
      /* The service's own prose, in the service's own language. */
      key: 'remark',
      label: 'account.storefront.eshoplog.detail',
      render: (row) => (
        <Text fontWeight="600" color={surface.text}>{row.remark || t('common.adjustment')}</Text>
      )
    }
  ].filter(Boolean);

  return (
    <Box>
      <StorefrontList
        list={shown}
        columns={columns}
        store={t('common.eshop')}
        emptyTitle={t(config.empty)}
        emptyHint={t('account.storefront.eshoplog.thisIsTheEshopS')}
      />
    </Box>
  );
}
