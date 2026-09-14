import React from 'react';
import { Box, SimpleGrid, Text } from '@chakra-ui/react';

import StorefrontList from './StorefrontList';
import { Loading, StatusBadge } from '@/components/common';
import api from '@/api';
import { useApi, useList } from '@/hooks/useApi';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * THE EPRODUCT SITE: a registration log, and three keygen logs.
 *
 * A third outside system alongside the Eshop and the Appstore, and the one
 * that keys its records by the member's LOGIN rather than by a pk of its own.
 *
 * THE REGISTRATION LOG IS NOT `/account/products`. That page is what Crystal
 * knows about - devices registered here, against Crystal's own warranty and
 * points rules. This is what the EPRODUCT SITE knows about, and a member can
 * have rows in one and not the other. Deriving either from the other would be
 * a guess about two systems that were never synchronised.
 *
 * THE THREE KEYGEN LOGS are one page shape twice and a different one once.
 * Karaoke and Manbang license a MACHINE KEY and record whether the attempt
 * succeeded; B-media licenses a DEVICE against a broadcaster and splits what
 * was paid from what came back. The first two share this file's table; the
 * third has its own, because bending it into the same columns would mean
 * three empty cells and two missing facts.
 *
 * The column order on all four is the vendor's, as on the Eshop and Appstore
 * pages - see the note there.
 */

/** Who did the keying: the member, or an agency acting for them. */
const ACTOR = {
  MEMBER: 'account.storefront.eproduct.actorMember',
  AGENCY: 'account.storefront.eproduct.actorAgency'
};

/** The row's place in the whole list; every one of these tables leads with it. */
function numberColumn(surface) {
  return {
    key: 'no',
    label: 'account.storefront.eproduct.no',
    align: 'center',
    width: '56px',
    render: (row, number) => <Text fontSize="sm" color={surface.muted}>{number}</Text>
  };
}

/** The same column on all three keygen logs. */
function actorColumn(t, surface) {
  return {
    key: 'actor',
    label: 'account.storefront.eproduct.doneBy',
    render: (row) => (
      <Text fontSize="sm" color={surface.muted}>
        {ACTOR[row.actor] ? t(ACTOR[row.actor]) : '—'}
      </Text>
    )
  };
}

/* ------------------------------------------------------------------ */

/**
 * What the member has registered on the eproduct site.
 *
 * The balance sits above it because the two are one story: registering earns
 * points, and the log is where they came from.
 */
export function EprodRegistrations() {
  const t = useT();
  const surface = useSurface();

  const balance = useApi(() => api.account.eprodBalance(), []);
  const list = useList((params) => api.account.eprodRegistrations(params), {
    initialParams: { page: 1, limit: 12 }
  });

  const columns = [
    numberColumn(surface),
    {
      key: 'serial_number',
      label: 'account.storefront.eproduct.serial',
      render: (row) => (
        <Text fontSize="sm" fontFamily="mono" color={surface.text}>{row.serial_number}</Text>
      )
    },
    {
      key: 'product_name',
      label: 'account.storefront.eproduct.product',
      render: (row) => (
        <Text fontWeight="600" color={surface.text}>{row.product_name}</Text>
      )
    },
    {
      key: 'contact',
      label: 'account.storefront.eproduct.contact',
      render: (row) => (
        <Text fontSize="sm" color={surface.muted}>{row.contact || '—'}</Text>
      )
    },
    {
      key: 'address',
      label: 'account.storefront.eproduct.address',
      render: (row) => (
        <Text fontSize="sm" color={surface.muted} noOfLines={2} maxW="320px">
          {row.address || '—'}
        </Text>
      )
    },
    {
      key: 'points',
      label: 'account.storefront.eproduct.pointsEarned',
      align: 'right',
      render: (row) => (
        <Text fontWeight="700" color={row.points > 0 ? 'green.500' : surface.muted}>
          {row.points > 0 ? '+' : ''}{Number(row.points).toLocaleString()}
        </Text>
      )
    },
    {
      key: 'status',
      label: 'account.storefront.eproduct.status',
      render: (row) => <StatusBadge value={row.status} />
    },
    { key: 'at', label: 'account.storefront.eproduct.registered', render: (row) => row.at }
  ];

  const held = balance.data || {};

  return (
    <Box>
      {balance.loading ? (
        <Loading variant="list" count={1} height="96px" />
      ) : (
        <SimpleGrid columns={{ base: 3 }} spacing="3" mb="7" maxW="560px">
          <Stat label={t('account.storefront.eproduct.pointsHeld')} value={held.balance} />
          <Stat label={t('account.storefront.eproduct.pointsSpent')} value={held.used} />
          <Stat label={t('account.storefront.eproduct.devicesRegistered')} value={held.registered} />
        </SimpleGrid>
      )}

      <StorefrontList
        list={list}
        columns={columns}
        store={t('account.storefront.eproduct.eproduct')}
        emptyTitle={t('account.storefront.eproduct.nothingRegisteredYet')}
        emptyHint={t('account.storefront.eproduct.devicesYouRegisterOnThe')}
      />
    </Box>
  );
}

function Stat({ label, value }) {
  const surface = useSurface();

  return (
    <Box p="5" borderRadius="14px" bg={surface.raised}>
      <Text fontSize="xs" color={surface.muted} textTransform="uppercase" letterSpacing="0.5px">
        {label}
      </Text>
      <Text fontSize="2xl" fontWeight="800" color={surface.text} letterSpacing="-0.02em">
        {Number(value || 0).toLocaleString()}
      </Text>
    </Box>
  );
}

/* ------------------------------------------------------------------ */

/**
 * A Karaoke or Manbang keygen log.
 *
 * ONE COMPONENT FOR TWO SYSTEMS, because upstream they are two paths with an
 * identical row shape. The vendor had two files that were the same file, and
 * they had already begun to differ.
 *
 * THE OUTCOME IS A BADGE, NOT A MESSAGE COLOUR. The vendor put the service's
 * `message` in a red tag whenever `resultlog` was non-zero and a blue one
 * otherwise - which meant a successfully issued licence appeared in a
 * coloured tag reading "Issued", indistinguishable at a glance from a fault.
 * The outcome and the words the service chose are two things, so they are two
 * columns.
 */
function KeygenLog({ view }) {
  const t = useT();
  const surface = useSurface();

  const list = useList((params) => view.fetch(params), {
    initialParams: { page: 1, limit: 15 }
  });

  const columns = [
    numberColumn(surface),
    {
      key: 'machine_key',
      label: 'account.storefront.eproduct.machineKey',
      render: (row) => (
        <Text fontSize="sm" fontFamily="mono" color={surface.text}>{row.machine_key}</Text>
      )
    },
    {
      key: 'reference',
      label: 'account.storefront.eproduct.reference',
      render: (row) => (
        <Text fontSize="xs" fontFamily="mono" color={surface.muted}>{row.reference || '—'}</Text>
      )
    },
    {
      key: 'price',
      label: 'account.storefront.eproduct.pointsPaid',
      align: 'right',
      render: (row) => (
        <Text fontWeight="700" color={surface.text}>{Number(row.price).toLocaleString()}</Text>
      )
    },
    {
      key: 'succeeded',
      label: 'account.storefront.eproduct.outcome',
      render: (row) => (
        <Box>
          <StatusBadge value={row.succeeded ? 'ISSUED' : 'FAILED'} />
          {/* The service's own words, and only where they add something. */}
          {!!row.message && !row.succeeded && (
            <Text fontSize="xs" color={surface.muted} mt="1" noOfLines={2}>{row.message}</Text>
          )}
        </Box>
      )
    },
    actorColumn(t, surface),
    { key: 'at', label: 'account.storefront.eproduct.issued', render: (row) => row.at }
  ];

  return (
    <StorefrontList
      list={list}
      columns={columns}
      store={t('account.storefront.eproduct.eproduct')}
      emptyTitle={t(view.empty)}
      emptyHint={t('account.storefront.eproduct.licencesKeyedForYourDevices')}
    />
  );
}

export function KaraokeKeygen() {
  return (
    <KeygenLog
      view={{
        fetch: (params) => api.account.karaokeKeygen(params),
        empty: 'account.storefront.eproduct.noKaraokeLicencesYet'
      }}
    />
  );
}

export function ManbangKeygen() {
  return (
    <KeygenLog
      view={{
        fetch: (params) => api.account.manbangKeygen(params),
        empty: 'account.storefront.eproduct.noManbangLicencesYet'
      }}
    />
  );
}

/* ------------------------------------------------------------------ */

/**
 * The B-media keygen log, which is its own shape.
 *
 * It licenses a DEVICE against a broadcaster rather than a machine key, and
 * it splits what was paid from what came back. Two figures, because they are
 * two facts: a member who paid 150 and got 21 back has not paid 129.
 */
export function BmediaKeygen() {
  const t = useT();
  const surface = useSurface();

  const list = useList((params) => api.account.bmediaKeygen(params), {
    initialParams: { page: 1, limit: 15 }
  });

  const columns = [
    numberColumn(surface),
    {
      key: 'device_id',
      label: 'account.storefront.eproduct.device',
      render: (row) => (
        <Text fontSize="sm" fontFamily="mono" color={surface.text}>{row.device_id}</Text>
      )
    },
    {
      key: 'provider',
      label: 'account.storefront.eproduct.provider',
      render: (row) => (
        <Box>
          <Text fontWeight="600" color={surface.text}>{row.provider}</Text>
          {!!row.provider_name && (
            <Text fontSize="xs" color={surface.muted} noOfLines={1}>{row.provider_name}</Text>
          )}
        </Box>
      )
    },
    actorColumn(t, surface),
    {
      key: 'price',
      label: 'account.storefront.eproduct.pointsPaid',
      align: 'right',
      render: (row) => (
        <Text fontWeight="700" color={surface.text}>{Number(row.price).toLocaleString()}</Text>
      )
    },
    {
      key: 'bonus',
      label: 'account.storefront.eproduct.pointsBack',
      align: 'right',
      render: (row) => (
        <Text fontWeight="700" color={row.bonus > 0 ? 'green.500' : surface.muted}>
          {row.bonus > 0 ? '+' : ''}{Number(row.bonus).toLocaleString()}
        </Text>
      )
    },
    { key: 'at', label: 'account.storefront.eproduct.issued', render: (row) => row.at }
  ];

  return (
    <StorefrontList
      list={list}
      columns={columns}
      store={t('account.storefront.eproduct.eproduct')}
      emptyTitle={t('account.storefront.eproduct.noMediaLicencesYet')}
      emptyHint={t('account.storefront.eproduct.licencesKeyedForYourDevices')}
    />
  );
}
