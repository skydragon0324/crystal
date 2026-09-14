import React from 'react';
import { Box, Flex, SimpleGrid, Text } from '@chakra-ui/react';

import { DataTable, ErrorState, Loading, SelectField } from '@/components/common';
import api from '@/api';
import { useApi, useList } from '@/hooks/useApi';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';
import { dateMinute } from '@/utils/format';

/**
 * POINTS, ACROSS EVERY SYSTEM THAT KEEPS THEM.
 *
 * There are six, and the whole design of this page follows from one fact about
 * them: THEY DO NOT ADD UP. Karaoke points cannot buy an app, and a member's
 * activity points are capped by a rule the Appstore knows nothing about. A
 * single headline total would be a number nobody can spend.
 *
 * So the balances are a row of cards, one per system, each showing what it
 * holds against what it will let you hold - and the movements underneath are
 * ONE ledger with the system named on every row. That is the trade this page
 * makes: it gives up the single big number, and in exchange the member can see
 * all six at once, which no screen in either project could do before. The
 * vendor's console reached these through eight separate menu entries and never
 * put two of them side by side.
 *
 * Filtering by system narrows the ledger and leaves the cards alone: the cards
 * are the standing, and the standing does not change because you are looking at
 * one part of it.
 */

/** Blank until the systems load, so the filter never offers a system that is not there. */
function sourceOptions(systems) {
  return (systems || []).map((system) => ({ value: system.key, label: system.label }));
}

export default function Points() {
  const t = useT();

  const surface = useSurface();
  const systems = useApi(() => api.account.pointSystems(), []);
  const list = useList((params) => api.account.points(params), {
    initialParams: { page: 1, limit: 15 }
  });

  const active = list.params.source || null;

  const columns = [
    {
      key: 'reason',
      label: 'What for',
      render: (row) => (
        <Box>
          <Text fontWeight="600" color={surface.text}>
            {row.reason || t('common.adjustment')}
          </Text>
          {row.reference && (
            <Text fontSize="xs" color={surface.muted} fontFamily="mono">
              {row.reference}
            </Text>
          )}
        </Box>
      )
    },
    {
      /*
       * THE SYSTEM IS ON EVERY ROW, not implied by a filter.
       *
       * The default view interleaves six ledgers, so a row without its source
       * named is a number with no currency - and the reader is looking at a
       * list where the row above it is a different one.
       */
      key: 'source',
      label: 'System',
      render: (row) => (
        <Text fontSize="xs" fontWeight="700" letterSpacing="0.04em" color={surface.muted}>
          {row.source_label || row.source}
        </Text>
      )
    },
    {
      key: 'amount',
      label: 'Points',
      align: 'right',
      render: (row) => (
        <Text fontWeight="700" color={row.amount < 0 ? 'red.400' : 'green.500'}>
          {row.amount > 0 ? '+' : ''}
          {Number(row.amount).toLocaleString()}
        </Text>
      )
    },
    {
      /*
       * Only Crystal's own ledger stamps a running balance; the vendor's five
       * keep no such column. An em dash says "this system does not record it",
       * which is true - a zero would say the balance was zero.
       */
      key: 'balance_after',
      label: 'Balance',
      align: 'right',
      render: (row) => (row.balance_after === null || row.balance_after === undefined
        ? <Text color={surface.muted}>—</Text>
        : Number(row.balance_after).toLocaleString())
    },
    {
      key: 'at',
      label: 'When',
      render: (row) => dateMinute(row.at)
    }
  ];

  return (
    <Box>
      {systems.loading ? (
        <Loading variant="list" count={2} height="96px" />
      ) : (
        <SimpleGrid columns={{ base: 2, md: 3, xl: 6 }} spacing="3" mb="8">
          {(systems.data || []).map((system) => {
            const isActive = active === system.key;

            return (
              <Box
                key={system.key}
                as="button"
                type="button"
                textAlign="left"
                p="4"
                borderRadius="14px"
                bg={isActive ? 'brand.500' : surface.raised}
                borderWidth="1px"
                borderColor={isActive ? 'brand.500' : 'transparent'}
                transition="background 150ms, border-color 150ms"
                /* The card is the filter - there is no second control to keep
                   in step with it, and the standing you tapped is the ledger
                   you get. */
                onClick={() => list.setFilter({ source: isActive ? undefined : system.key })}
                _hover={{ borderColor: isActive ? 'brand.500' : surface.border }}
              >
                <Text
                  fontSize="xs"
                  fontWeight="700"
                  textTransform="uppercase"
                  letterSpacing="0.5px"
                  color={isActive ? 'whiteAlpha.900' : surface.muted}
                  noOfLines={1}
                >
                  {system.label}
                </Text>
                <Text
                  fontSize="xl"
                  fontWeight="800"
                  letterSpacing="-0.02em"
                  color={isActive ? 'white' : surface.text}
                >
                  {Number(system.balance).toLocaleString()}
                </Text>
                <Text fontSize="xs" color={isActive ? 'whiteAlpha.800' : surface.muted}>
                  {system.cap
                    ? `${t('common.of')} ${Number(system.cap).toLocaleString()}`
                    : t('account.points.noCap')}
                </Text>
              </Box>
            );
          })}
        </SimpleGrid>
      )}

      <Flex gap="3" data-gap="12" data-gap-wrap mb="5" wrap="wrap" align="center">
        <Box minW="220px">
          <SelectField
            size="sm"
            value={active}
            onChange={(value) => list.setFilter({ source: value || undefined })}
            options={sourceOptions(systems.data)}
            allowEmpty
            emptyLabel={t('account.points.allSystems')}
            isSearchable={false}
          />
        </Box>
        {active && (
          <Text fontSize="sm" color={surface.muted}>
            {t('account.points.showingOneSystemBalancesAbove')}
          </Text>
        )}
      </Flex>

      {list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : (
        <DataTable
          columns={columns}
          rows={list.rows}
          loading={list.loading}
          meta={list.meta}
          onPage={list.setPage}
          emptyTitle={t('account.points.noPointActivityYet')}
          emptyHint={t('account.points.signingInDailyEarns10')}
          emptyActionLabel={t('common.registerAProduct')}
          emptyActionTo="/account/products/register"
        />
      )}
    </Box>
  );
}
