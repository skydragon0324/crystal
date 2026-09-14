import React from 'react';
import { Box, Text } from '@chakra-ui/react';

import { DataTable, ErrorState, StatusBadge } from '@/components/common';
import api from '@/api';
import { useList } from '@/hooks/useApi';
import { formatPrice, useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';
import { date as formatDate } from '@/utils/format';

/**
 * The member's repairs.
 *
 * This page did not exist. The account menu offered it, the dashboard linked
 * to it, and both landed on /account/repairs - which matched no route and fell
 * through to the catch-all redirect, so the member was bounced back to the
 * dashboard with no explanation. The endpoint had been there the whole time.
 *
 * A repair is shown by its NUMBER and its state, because those are the two
 * things somebody chasing one has in their hand: the number came on the
 * receipt, and the state is the question.
 */
export default function Repairs() {
  const t = useT();
  const surface = useSurface();

  const list = useList((params) => api.account.repairs(params), {
    initialParams: { page: 1, limit: 12 }
  });

  const columns = [
    {
      key: 'ticket_no',
      label: 'Repair',
      render: (row) => (
        <Box>
          <Text fontWeight="600" color={surface.text} fontFamily="mono">{row.ticket_no}</Text>
          <Text fontSize="xs" color={surface.muted} noOfLines={1}>
            {row.product_name || row.symptom || t('account.repairs.device')}
          </Text>
        </Box>
      )
    },
    { key: 'agency_name', label: 'Centre', render: (row) => row.agency_name || '—' },
    {
      key: 'status',
      label: 'State',
      render: (row) => <StatusBadge value={row.status_label || row.status} />
    },
    {
      /*
       * What it cost, and whether the member paid it. A covered repair shows
       * the figure the warranty absorbed rather than a blank - "free" and
       * "not priced yet" are different answers.
       */
      key: 'charged_amount',
      label: 'Charged',
      align: 'right',
      render: (row) => (
        row.charged_amount === null || row.charged_amount === undefined
          ? <Text color={surface.muted}>—</Text>
          : Number(row.charged_amount) === 0
            ? <Text color="green.500" fontWeight="600">{t('account.repairs.covered')}</Text>
            : formatPrice(row.charged_amount)
      )
    },
    {
      key: 'received_at',
      label: 'Received',
      render: (row) => (row.received_at ? formatDate(row.received_at) : '—')
    }
  ];

  return (
    <Box>
      {list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : (
        <DataTable
          columns={columns}
          rows={list.rows}
          loading={list.loading}
          meta={list.meta}
          onPage={list.setPage}
          emptyTitle={t('account.repairs.noRepairsOnRecord')}
          emptyHint={t('account.repairs.anythingYouBringToA')}
        />
      )}
    </Box>
  );
}
