import React from 'react';
import { Box, Text } from '@chakra-ui/react';

import { DataTable, ErrorState, StatusBadge } from '@/components/common';
import api from '@/api';
import { useList } from '@/hooks/useApi';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';
import { date as formatDate, money } from '@/utils/format';

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
      /*
       * THE STATE, IN THE READER'S LANGUAGE.
       *
       * `status_label` is the ticket state spelled out by the API - "Waiting
       * for parts" - and it comes back in English whatever X-Lang asked for,
       * because the server's table of them is English (utils/codes.js).
       * StatusBadge prints its value raw, so this was English on a Chinese
       * page. It has no address to give, so it goes through t() BY VALUE,
       * which is the lookup that exists for a label that comes from data
       * rather than from a call site; a missing entry falls through to the
       * English, which is what it renders today.
       *
       * The BADGE still gets the unchanged label, because that is what picks
       * its colour - translating the colour key would leave every state grey.
       */
      key: 'status',
      label: 'State',
      render: (row) => (
        <StatusBadge value={row.status_label || row.status}>
          {t(row.status_label || row.status)}
        </StatusBadge>
      )
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
            : money(row.charged_amount)
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
