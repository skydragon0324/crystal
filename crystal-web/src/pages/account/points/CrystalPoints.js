import React from 'react';
import { Box, Button, Flex, SimpleGrid, Text } from '@chakra-ui/react';

import { DataTable, ErrorState, Loading } from '@/components/common';
import api from '@/api';
import { useApi } from '@/hooks/useApi';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';
import { dateMinute, number } from '@/utils/format';
import { Lede, LedgerFilters, Points, StandingTile, numberColumn, useLedger } from './ledger';

/**
 * CRYSTAL POINTS - Crystal's own ledger, `point_logs`, and nobody else's.
 *
 * It sat on the shared points page as "the sixth system", and that framing hid
 * everything that makes it different from the vendor's five. It is the only
 * ledger that STAMPS A RUNNING BALANCE on every row (so a member can see what
 * they held after each movement, not just the movement); the only one that
 * records a movement KIND out of a closed set - a daily sign-in, a device
 * registered, a licence, cover bought, an adjustment; and the only one the API
 * can SUMMARISE, earned against spent, per kind. The vendor has no page for
 * it, because it is not the vendor's - so the columns, the summary and the
 * filters here are what `point_logs` actually holds, as /api/account/points
 * returns it.
 *
 * THE SUMMARY IS THE FILTER. "Where your points came from" is one tile per
 * kind the member has, and tapping one narrows the ledger to it - the same
 * arrangement the balance cards had on the old page, and for the same reason:
 * there is no second control to keep in step, and the tiles only ever offer
 * kinds that exist for this member (an empty filter is a dead end). Tapping
 * the open one again clears it.
 */

/**
 * `point_logs.type` in words. A kind this list does not know shows as its code
 * rather than as nothing - it is still a movement the member made.
 */
const KINDS = {
  LOGIN: 'account.points.crystalpoints.kindLogin',
  PRODUCT_REGISTER: 'account.points.crystalpoints.kindProductRegister',
  PURCHASE: 'account.points.crystalpoints.kindPurchase',
  LICENSE: 'account.points.crystalpoints.kindLicense',
  ACTIVITY: 'account.points.crystalpoints.kindActivity',
  REPAIR: 'account.points.crystalpoints.kindRepair',
  WARRANTY_EXTENSION: 'account.points.crystalpoints.kindWarrantyExtension',
  ADJUST: 'account.points.crystalpoints.kindAdjust'
};

function kindLabel(t, code) {
  return KINDS[code] ? t(KINDS[code]) : code || '—';
}

export default function CrystalPoints() {
  const t = useT();
  const surface = useSurface();

  const systems = useApi(() => api.account.pointSystems(), []);
  const summary = useApi(() => api.account.pointSummary(), []);
  const list = useLedger('CRYSTAL');

  const own = (systems.data || []).filter((system) => system.key === 'CRYSTAL')[0] || {};
  const kinds = summary.data || [];
  const activeKind = list.params.type || null;

  /* Choosing a kind is a filter change, so the ledger goes back to page one. */
  const chooseKind = (code) => list.setFilter({ type: activeKind === code ? undefined : code });

  const columns = [
    numberColumn(t, surface),
    {
      key: 'at',
      label: t('account.points.crystalpoints.when'),
      render: (row) => <Text fontSize="sm" whiteSpace="nowrap">{dateMinute(row.at)}</Text>
    },
    {
      key: 'type',
      label: t('account.points.crystalpoints.kind'),
      render: (row) => (
        <Text fontSize="xs" fontWeight="700" letterSpacing="0.04em" color={surface.muted} whiteSpace="nowrap">
          {kindLabel(t, row.type)}
        </Text>
      )
    },
    {
      /*
       * THE DESCRIPTION IS WHAT HAPPENED IN CRYSTAL'S WORDS AT THE TIME - the
       * device's name, the note an operator typed - and the reference under it
       * is the serial or order it was about, in mono because it gets read out
       * to support character by character.
       */
      key: 'reason',
      label: t('account.points.whatFor'),
      render: (row) => (
        <Box>
          <Text fontWeight="600" color={surface.text}>{row.reason || t('common.adjustment')}</Text>
          {row.reference && (
            <Text fontSize="xs" color={surface.muted} fontFamily="mono">{row.reference}</Text>
          )}
        </Box>
      )
    },
    {
      key: 'amount',
      label: t('account.points.crystalpoints.points'),
      align: 'right',
      render: (row) => <Points value={row.amount} />
    },
    {
      /*
       * WHAT THE MEMBER HELD AFTERWARDS, which only this ledger records. Plain
       * rather than coloured: it is a standing, not a movement.
       */
      key: 'balance_after',
      label: t('account.points.crystalpoints.balanceAfter'),
      align: 'right',
      render: (row) => (row.balance_after === null || row.balance_after === undefined
        ? <Text color={surface.muted}>—</Text>
        : <Text fontWeight="600" color={surface.text}>{number(row.balance_after)}</Text>)
    }
  ];

  return (
    <Box>
      <Lede>{t('account.points.crystalpoints.lede')}</Lede>

      {systems.loading || summary.loading ? (
        <Loading variant="list" count={1} height="96px" />
      ) : (
        <Box mb="7">
          <SimpleGrid columns={{ base: 2, md: 3, xl: 4 }} spacing="3">
            {/* What they hold now - the sum of the ledger below, not a cached total. */}
            <StandingTile label={t('common.balance')} value={own.balance} cap={own.cap} />
            {kinds.map((kind) => (
              <KindTile
                key={kind.type}
                label={kindLabel(t, kind.type)}
                earned={kind.earned}
                spent={kind.spent}
                count={kind.entry_cnt}
                isActive={activeKind === kind.type}
                onClick={() => chooseKind(kind.type)}
              />
            ))}
          </SimpleGrid>
        </Box>
      )}

      <LedgerFilters list={list}>
        {activeKind && (
          <Flex align="center" h="32px">
            <Text fontSize="sm" color={surface.muted} mr="2">
              {t('account.points.crystalpoints.showingOneKind', { kind: kindLabel(t, activeKind) })}
            </Text>
            <Button size="xs" variant="quiet" onClick={() => list.setFilter({ type: undefined })}>
              {t('common.clear')}
            </Button>
          </Flex>
        )}
      </LedgerFilters>

      {list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : (
        <DataTable
          columns={columns}
          rows={list.rows}
          loading={list.loading}
          meta={list.meta}
          onPage={list.setPage}
          onLimit={list.setLimit}
          emptyTitle={t('account.points.noPointActivityYet')}
          emptyHint={t('account.points.signingInDailyEarns10')}
          emptyActionLabel={t('common.registerAProduct')}
          emptyActionTo="/account/products/register"
        />
      )}
    </Box>
  );
}

/**
 * ONE KIND OF MOVEMENT: what it earned and what it spent, never netted.
 *
 * A licence is a spend and a registration is an award, and a single figure per
 * kind would show one as negative and the other as positive and invite adding
 * them up - which is why the API sends earned and spent apart (see
 * wallet.repository pointSummary) and why they stay apart here. The count is
 * how many rows tapping the tile will leave in the ledger.
 */
function KindTile({ label, earned, spent, count, isActive, onClick }) {
  const t = useT();
  const surface = useSurface();

  const gained = Number(earned) || 0;
  const lost = Number(spent) || 0;

  return (
    <Box
      as="button"
      type="button"
      onClick={onClick}
      aria-pressed={!!isActive}
      textAlign="left"
      w="100%"
      p="4"
      borderRadius="14px"
      bg={isActive ? 'brand.500' : surface.raised}
      borderWidth="1px"
      borderColor={isActive ? 'brand.500' : 'transparent'}
      transition="background 150ms, border-color 150ms"
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
        {label}
      </Text>
      <Flex align="baseline" wrap="wrap" gap="2" data-gap="8" data-gap-wrap>
        <Text fontSize="lg" fontWeight="800" color={isActive ? 'white' : gained > 0 ? 'green.500' : surface.muted}>
          +{number(gained)}
        </Text>
        <Text fontSize="lg" fontWeight="800" color={isActive ? 'white' : lost > 0 ? 'red.400' : surface.muted}>
          -{number(lost)}
        </Text>
      </Flex>
      <Text fontSize="xs" color={isActive ? 'whiteAlpha.800' : surface.muted}>
        {t('account.points.crystalpoints.entries', { count: number(count) })}
      </Text>
    </Box>
  );
}
