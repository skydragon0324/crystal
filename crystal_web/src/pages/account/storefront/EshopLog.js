import React from 'react';
import { Box, Text } from '@chakra-ui/react';

import StorefrontList from './StorefrontList';
import { fillLabel, formatAmount } from './eshopTerms';
import api from '@/api';
import { useList } from '@/hooks/useApi';
import { useSurface } from '@/theme/tokens';
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
 * TWO COLUMNS DESCRIBE A MOVEMENT, and they answer different questions. The
 * remark is prose the service wrote; the type is a code from a closed set. A
 * member scanning for "where did the money go" reads the type, and it is the
 * only one of the two that could ever be sorted or filtered on — which is why
 * the vendor's console gave them a column each rather than running them
 * together into one sentence.
 */
const VIEWS = {
  TRANSACTIONS: {
    money: true,
    empty: 'account.storefront.eshoplog.noTransactionsYet'
  },
  EXPERIENCE: {
    money: false,
    empty: 'account.storefront.eshoplog.noExperienceEarnedYet'
  },
  COMMERCE: {
    money: false,
    empty: 'account.storefront.eshoplog.noCommerceValueYet'
  }
};

export default function EshopLog({ view }) {
  const t = useT();
  const surface = useSurface();

  const config = VIEWS[view] || VIEWS.TRANSACTIONS;

  const list = useList((params) => api.account.eshopLog(params), {
    initialParams: { page: 1, limit: 15, view: view || 'TRANSACTIONS' }
  });

  /*
   * THE COLUMN ORDER IS THE VENDOR'S: number, time, amount, type, detail.
   *
   * It is worth keeping rather than improving on. Members read these three
   * screens in the vendor's console for years, and a statement whose columns
   * have been rearranged is one somebody has to learn again - for no gain,
   * since the old arrangement was not wrong.
   *
   * The vendor's WALLET screen carried a fourth column, `money_type`, and
   * commented it out on the other two. Here it would be constant down every
   * page - the view IS the money type - so it is left out of all three
   * rather than printed identically two hundred times.
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
      key: 'amount',
      label: config.money
        ? 'account.storefront.eshoplog.amount'
        : 'account.storefront.eshop.tenderPoint',
      align: 'right',
      render: (row) => (
        <Text fontWeight="700" color={row.amount < 0 ? 'red.400' : 'green.500'}>
          {row.amount > 0 ? '+' : ''}
          {formatAmount(row.amount, config.money)}
        </Text>
      )
    },
    {
      key: 'fill',
      label: 'account.storefront.eshoplog.type',
      /* Blank rather than a placeholder: the service does send codes this
         page has never heard of, and inventing a word for one is worse
         than admitting there isn't one. */
      render: (row) => (
        <Text fontSize="sm" color={surface.muted}>{fillLabel(t, row.fill) || '—'}</Text>
      )
    },
    {
      key: 'remark',
      label: 'account.storefront.eshoplog.detail',
      render: (row) => (
        <Text fontWeight="600" color={surface.text}>{row.remark || t('common.adjustment')}</Text>
      )
    }
  ];

  return (
    <Box>
      <StorefrontList
        list={list}
        columns={columns}
        store={t('common.eshop')}
        emptyTitle={t(config.empty)}
        emptyHint={t('account.storefront.eshoplog.thisIsTheEshopS')}
      />
    </Box>
  );
}
