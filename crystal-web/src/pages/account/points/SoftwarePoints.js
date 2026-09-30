import React from 'react';
import { Redirect, useLocation } from 'react-router-dom';
import { Box, Tag, Text } from '@chakra-ui/react';

import { DataTable, ErrorState } from '@/components/common';
import { ACCOUNT_NAV, hrefOf } from '@/components/account/accountNav';
import api from '@/api';
import { useApi } from '@/hooks/useApi';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';
import { dateMinute } from '@/utils/format';
import { LedgerFilters, Points, numberColumn, useLedger } from './ledger';

/**
 * SOFTWARE POINTS - the Appstore, Karaoke, Media and Minus ledgers.
 *
 * This page used to be "points, across every system that keeps them": six
 * ledgers behind one `?source=`, Crystal's own and the activity log among them.
 * Those two are different things - different columns, different filters, a
 * running balance on one and a cap on the other - and they have pages of their
 * own now (CrystalPoints.js, ActivityPoints.js). What stays here is the family
 * that really is one shape: four tables with identical columns, which the
 * vendor drew as four identical screens (AccountAppstorePointLogPage and its
 * three copies) and Crystal draws as one screen with the system chosen.
 *
 * THE ADDRESS IS STILL THE SOURCE OF TRUTH for which of the four is open, and
 * that is the fix this page was built around: the first request carries the
 * source, moving between the four menu entries refetches (see useLedger), the
 * sidebar highlights the entry the address names, and a view is a link somebody
 * can send to support.
 *
 * THE FOUR CARDS COME FROM THE MENU, not from a list of their own. Their order
 * and their names are the Software group's in accountNav.js - "Minus" is what
 * the member calls the SOFTWARE ledger, not what the API calls it - so there is
 * one place that says which four systems this page is, and the cards cannot
 * drift from the entries that lead here.
 */

const SOFTWARE_GROUP = ACCOUNT_NAV.filter((group) => group.section === 'Software Points')[0];

/** The four ledgers, as { source, label, href }, in the menu's order. */
export const SOFTWARE_LEDGERS = (SOFTWARE_GROUP ? SOFTWARE_GROUP.items : [])
  .filter((item) => item.params && item.params.source)
  .map((item) => ({ source: item.params.source, label: item.label, href: hrefOf(item) }));

const SOURCES = SOFTWARE_LEDGERS.map((ledger) => ledger.source);

/**
 * WHERE AN OLD ADDRESS GOES.
 *
 * `?source=CRYSTAL` and `?source=ACTIVITY` were menu entries, dashboard links
 * and - because the filter lived in the address on purpose - links people
 * sent each other. They are REDIRECTED, not refused: this page no longer reads
 * either ledger, but the thing the link named still exists at an address of its
 * own, and sending the member there is the only answer that is both true and
 * useful. A `<Redirect>` REPLACES the history entry, so the back button does
 * not bounce them into the redirect again. /account/appstore/wallet -> /account/wallet
 * (App.js) is the same decision made the same way.
 *
 * Anything else that is not one of the four - no source, a mistyped one,
 * `?source=ESHOP` - opens the first ledger rather than an error: there is no
 * "all four" view to fall back to, because the API's unfiltered ledger is all
 * SIX, and showing Crystal's rows on the software page is exactly what this
 * change undoes.
 */
export const MOVED_SOURCES = {
  CRYSTAL: '/account/points/crystal',
  ACTIVITY: '/account/points/activity'
};

/** What the vendor's soft-point pages tag each row with - SOFT_POINT_STATUS_LIST. */
const STATUS = {
  CHARGE: { label: 'account.points.softwarepoints.statusCharge', scheme: 'green' },
  MINUS: { label: 'account.points.softwarepoints.statusMinus', scheme: 'pink' },
  REFUND: { label: 'account.points.softwarepoints.statusRefund', scheme: 'blue' }
};

export default function SoftwarePoints() {
  const location = useLocation();
  const requested = String(new URLSearchParams(location.search).get('source') || '').toUpperCase();

  if (MOVED_SOURCES[requested]) return <Redirect to={MOVED_SOURCES[requested]} />;
  if (SOURCES.indexOf(requested) === -1) {
    return SOFTWARE_LEDGERS.length ? <Redirect to={SOFTWARE_LEDGERS[0].href} /> : null;
  }

  return <SoftwareLedger source={requested} />;
}

/**
 * The page itself, for a source that is known to be one of the four.
 *
 * Split from the redirects above so the hooks below never run for an address
 * that is about to be replaced - a request for `source=CRYSTAL` made on the way
 * out of the page would be exactly the request this page must not make.
 */
function SoftwareLedger({ source }) {
  const t = useT();
  const surface = useSurface();

  const systems = useApi(() => api.account.pointSystems(), []);
  const list = useLedger(source);

  const standing = {};
  (systems.data || []).forEach((system) => { standing[system.key] = system; });

  /*
   * THE VENDOR'S COLUMNS, in the vendor's order: number, equipment, pay
   * points, soft points, reason, status, time. The system is NOT a column any
   * more - every row on this page is from the ledger the heading names.
   */
  const columns = [
    numberColumn(t, surface),
    {
      key: 'reference',
      label: t('account.points.softwarepoints.equipNumber'),
      render: (row) => (
        row.reference
          ? <Text fontSize="sm" fontFamily="mono" color={surface.text}>{row.reference}</Text>
          : <Text fontSize="sm" color={surface.muted}>—</Text>
      )
    },
    {
      /*
       * WHAT WAS CHARGED, beside what moved. Not signed and not coloured: it
       * is the price side of the movement, and a green "+189.1" beside a
       * movement of 13 would read as two credits.
       */
      key: 'charged',
      label: t('account.points.softwarepoints.payPoints'),
      align: 'right',
      render: (row) => (row.charged === null || row.charged === undefined
        ? <Text color={surface.muted}>—</Text>
        : <Points value={row.charged} muted />)
    },
    {
      key: 'amount',
      label: t('account.points.softwarepoints.softPoints'),
      align: 'right',
      render: (row) => <Points value={row.amount} />
    },
    {
      /* The system's own words for what happened - data, shown as it came. */
      key: 'reason',
      label: t('account.points.softwarepoints.reason'),
      render: (row) => (
        <Box>
          <Text fontSize="sm" color={surface.text} maxW="360px">
            {row.reason || t('common.adjustment')}
          </Text>
          {row.by_agency && (
            <Text fontSize="xs" color={surface.muted}>{t('account.points.softwarepoints.byAnAgency')}</Text>
          )}
        </Box>
      )
    },
    {
      key: 'status',
      label: t('account.points.softwarepoints.status'),
      render: (row) => {
        const status = STATUS[row.status];
        return status
          ? <Tag size="sm" colorScheme={status.scheme} whiteSpace="nowrap">{t(status.label)}</Tag>
          : <Text fontSize="sm" color={surface.muted}>—</Text>;
      }
    },
    {
      key: 'at',
      label: t('account.points.softwarepoints.when'),
      render: (row) => <Text fontSize="sm" whiteSpace="nowrap">{dateMinute(row.at)}</Text>
    }
  ];

  return (
    <Box>
      <LedgerFilters list={list} />

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
          emptyTitle={t('account.points.softwarepoints.nothingInThisLedgerYet')}
          emptyHint={t('account.points.softwarepoints.pointsThisSystemAwards')}
        />
      )}
    </Box>
  );
}
