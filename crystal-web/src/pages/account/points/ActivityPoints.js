import React from 'react';
import { Box, SimpleGrid, Text } from '@chakra-ui/react';

import { DataTable, ErrorState, Loading, SelectField } from '@/components/common';
import api from '@/api';
import { useApi } from '@/hooks/useApi';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';
import { dateMinute } from '@/utils/format';
import { Lede, LedgerFilters, Points, StandingTile, numberColumn, useLedger } from './ledger';

/**
 * ACTIVITY POINTS - the vendor's AccountActivityPointLogPage, in Crystal.
 *
 * The points a member is given for taking part: signing in on a fixed line or
 * a phone, writing on the blog, an award from the team. It was one of six
 * `?source=` values on a shared page, where it looked like a ledger of the same
 * kind as the Appstore's. It is not - it has no price side, no status, and a
 * cap - and the vendor never drew it that way either.
 *
 * WHAT IS THE VENDOR'S, column for column and control for control:
 *
 *   columns    No. - Activity points - Reason - Time
 *   header     Category (All / Fixed / Mobile / Blog / Etc), Period, search
 *   reason     the article's title first when the movement was about one,
 *              then the reason - "title | reason" on the vendor's page
 *   footer     paging with the total, rows per page and go-to
 *
 * WHAT IS CRYSTAL'S: the standing above the table - the balance against its
 * cap, and what the team has taken back. The vendor's page has no summary; the
 * figures are the ones the shared page already showed on its Activity card, and
 * losing them in the split would take away the one thing a member checks
 * before reading the list. And the period opens EMPTY rather than on the
 * current month - see LedgerFilters for why.
 */

/** The vendor's ACTIVITY_POINT_TYPE_PREFIXES, by the API's names for them. */
const CATEGORIES = [
  { value: 'FIXED', label: 'account.points.activitypoints.categoryFixed' },
  { value: 'MOBILE', label: 'account.points.activitypoints.categoryMobile' },
  { value: 'BLOG', label: 'account.points.activitypoints.categoryBlog' },
  { value: 'OTHER', label: 'account.points.activitypoints.categoryOther' }
];

export default function ActivityPoints() {
  const t = useT();
  const surface = useSurface();

  const systems = useApi(() => api.account.pointSystems(), []);
  const list = useLedger('ACTIVITY');

  const activity = (systems.data || []).filter((system) => system.key === 'ACTIVITY')[0] || {};

  const columns = [
    numberColumn(t, surface),
    {
      key: 'amount',
      label: t('account.points.activitypoints.activityPoints'),
      align: 'right',
      render: (row) => <Points value={row.amount} />
    },
    {
      /*
       * THE ARTICLE, THEN WHY. The vendor joins the two with a bar into one
       * string; they are kept as two lines here because the title is the
       * blog's data and the reason may be a type label, and a bar between
       * them reads as part of a title that has one in it.
       */
      key: 'reason',
      label: t('account.points.activitypoints.reason'),
      render: (row) => (
        <Box maxW="460px">
          {row.article_title && (
            <Text fontWeight="600" color={surface.text} noOfLines={1}>{row.article_title}</Text>
          )}
          <Text fontSize="sm" color={row.article_title ? surface.muted : surface.text}>
            {row.reason || t('common.adjustment')}
          </Text>
        </Box>
      )
    },
    {
      key: 'at',
      label: t('account.points.activitypoints.when'),
      render: (row) => <Text fontSize="sm" whiteSpace="nowrap">{dateMinute(row.at)}</Text>
    }
  ];

  return (
    <Box>
      <Lede>{t('account.points.activitypoints.lede')}</Lede>

      {systems.loading ? (
        <Loading variant="list" count={1} height="96px" />
      ) : (
        <SimpleGrid columns={{ base: 1, sm: 2 }} spacing="3" mb="7" maxW="520px">
          <StandingTile
            label={t('account.points.activitypoints.activityPoints')}
            value={activity.balance}
            cap={activity.cap}
          />
          {/*
            * Only this system records points taken back (activity_point_stats
            * minus_points). No line under it: there is no cap on a deduction,
            * and "no cap" under a figure that only ever goes up would be read
            * as a limit on the member.
            */}
          <StandingTile
            label={t('account.points.activitypoints.takenBack')}
            value={activity.spent}
            note={null}
          />
        </SimpleGrid>
      )}

      <LedgerFilters list={list}>
        <Box minW="180px">
          <Text fontSize="sm" fontWeight="600" color={surface.text} mb="1.5">
            {t('account.points.activitypoints.category')}
          </Text>
          <SelectField
            size="sm"
            value={list.params.category || null}
            onChange={(value) => list.setFilter({ category: value || undefined })}
            options={CATEGORIES.map((entry) => ({ value: entry.value, label: t(entry.label) }))}
            allowEmpty
            emptyLabel={t('common.all')}
            isSearchable={false}
          />
        </Box>
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
          emptyTitle={t('account.points.activitypoints.noActivityPointsYet')}
          emptyHint={t('account.points.activitypoints.signingInAndTheBlog')}
        />
      )}
    </Box>
  );
}
