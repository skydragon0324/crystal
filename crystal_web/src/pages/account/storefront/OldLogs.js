import React from 'react';
import { Flex, Text } from '@chakra-ui/react';

import StorefrontList from './StorefrontList';
import api from '@/api';
import { useList } from '@/hooks/useApi';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * WHAT YOU DID BEFORE, in the systems that ran before this one.
 *
 * Three history pages against three satellite databases the karaoke keygen
 * service, the media service and the old customer database left behind. A
 * member's history did not begin when Crystal did, and leaving these out
 * would tell somebody with years of it that they have none.
 *
 * THESE ARE READS OF A CLOSED RECORD. Nothing here can change, nothing new
 * is written to it, and for a member whose account was merged it stops at
 * the moment they became one account - everything after that is on the
 * ordinary pages already, and showing it twice would make neither total add
 * up. The cap lives in repositories/legacy/oldlogs.repository.js, which is
 * also where the filtering is explained.
 *
 * The column order is the vendor's, as everywhere else in this folder.
 */

/** The row's place in the whole list; all three tables lead with it. */
function numberColumn(surface) {
  return {
    key: 'no',
    label: 'account.storefront.oldlogs.no',
    align: 'center',
    width: '56px',
    render: (row, number) => <Text fontSize="sm" color={surface.muted}>{number}</Text>
  };
}

/** Points, which are counted rather than measured - so never a decimal. */
function points(value) {
  return Math.round(Number(value) || 0).toLocaleString();
}

/* ------------------------------------------------------------------ */

/**
 * The activity prize log.
 *
 * One figure and the note that explains it, which between them are the whole
 * row - this system recorded who was given what and why, and nothing else.
 */
export function ActivityOldLog() {
  const t = useT();
  const surface = useSurface();

  const list = useList((params) => api.account.activityOldLog(params), {
    initialParams: { page: 1, limit: 15 }
  });

  const columns = [
    numberColumn(surface),
    {
      key: 'points',
      label: 'account.storefront.oldlogs.activityPoints',
      align: 'right',
      render: (row) => (
        <Text fontWeight="700" color={row.points > 0 ? 'green.500' : surface.text}>
          {row.points > 0 ? '+' : ''}{points(row.points)}
        </Text>
      )
    },
    {
      key: 'reason',
      label: 'account.storefront.oldlogs.reason',
      render: (row) => (
        <Text fontSize="sm" color={surface.text} maxW="420px">
          {row.reason || t('common.adjustment')}
        </Text>
      )
    },
    { key: 'at', label: 'account.storefront.oldlogs.when', render: (row) => row.at }
  ];

  return (
    <StorefrontList
      list={list}
      columns={columns}
      store={t('account.storefront.oldlogs.theOldSystem')}
      emptyTitle={t('account.storefront.oldlogs.noActivityPrizesYet')}
      emptyHint={t('account.storefront.oldlogs.thisIsWhatTheOld')}
    />
  );
}

/* ------------------------------------------------------------------ */

/**
 * The karaoke licence history.
 *
 * Only what the member keyed THEMSELVES, and only what worked - an agency
 * keying is recorded against them but was never their own activity, and a
 * failed attempt cost nothing. Both exclusions are the old system's, and
 * both are explained where they are applied.
 */
export function KaraokeOldLog() {
  const t = useT();
  const surface = useSurface();

  const list = useList((params) => api.account.karaokeOldLog(params), {
    initialParams: { page: 1, limit: 15 }
  });

  return (
    <StorefrontList
      list={list}
      columns={licenceColumns(t, surface, false)}
      store={t('account.storefront.oldlogs.theOldSystem')}
      emptyTitle={t('account.storefront.oldlogs.noKaraokeHistoryYet')}
      emptyHint={t('account.storefront.oldlogs.thisIsWhatTheOld')}
    />
  );
}

/**
 * The media licence history, and the one row in it that is not a licence.
 *
 * The last line is the balance the member brought with them from before the
 * service kept a log at all. It is marked, because an unmarked row that sits
 * outside the numbering and has no equipment against it reads as a bug.
 */
export function MediaOldLog() {
  const t = useT();
  const surface = useSurface();

  const list = useList((params) => api.account.mediaOldLog(params), {
    initialParams: { page: 1, limit: 15 }
  });

  return (
    <StorefrontList
      list={list}
      columns={licenceColumns(t, surface, true)}
      store={t('account.storefront.oldlogs.theOldSystem')}
      emptyTitle={t('account.storefront.oldlogs.noMediaHistoryYet')}
      emptyHint={t('account.storefront.oldlogs.thisIsWhatTheOld')}
    />
  );
}

/**
 * The columns both licence logs share, plus the one only media has.
 *
 * Karaoke has no reason column because the old system recorded none - every
 * row is the same kind of event. Media's carries the broadcaster, which is
 * the only thing distinguishing one row from another.
 */
function licenceColumns(t, surface, withReason) {
  return [
    numberColumn(surface),
    {
      key: 'equipment',
      label: 'account.storefront.oldlogs.equipment',
      render: (row) => (
        row.equipment
          ? <Text fontSize="sm" fontFamily="mono" color={surface.text}>{row.equipment}</Text>
          : <Text fontSize="sm" color={surface.muted}>—</Text>
      )
    },
    {
      key: 'paid',
      label: 'account.storefront.oldlogs.pointsPaid',
      align: 'right',
      render: (row) => <Text fontWeight="700" color={surface.text}>{points(row.paid)}</Text>
    },
    {
      key: 'awarded',
      label: 'account.storefront.oldlogs.pointsAwarded',
      align: 'right',
      render: (row) => (
        <Text fontWeight="700" color={row.awarded > 0 ? 'green.500' : surface.muted}>
          {row.awarded > 0 ? '+' : ''}{points(row.awarded)}
        </Text>
      )
    },
    withReason ? {
      key: 'reason',
      label: 'account.storefront.oldlogs.provider',
      render: (row) => (
        <Flex align="center" gap="2" data-gap="8">
          <Text fontSize="sm" color={surface.text}>{row.reason || '—'}</Text>
          {/*
            * THE CARRY-FORWARD ROW SAYS SO.
            *
            * It is not a licence: it is the balance brought in from before
            * the service kept a log, and it always sits last. Unmarked, a
            * row with no equipment against it reads as data that failed to
            * load rather than as the one row that is different.
            */}
          {row.carried_forward && (
            <Text
              fontSize="xs"
              fontWeight="700"
              textTransform="uppercase"
              letterSpacing="0.04em"
              color={surface.muted}
              whiteSpace="nowrap"
            >
              {t('account.storefront.oldlogs.broughtForward')}
            </Text>
          )}
        </Flex>
      )
    } : null,
    { key: 'at', label: 'account.storefront.oldlogs.when', render: (row) => row.at }
  ].filter(Boolean);
}
