import React from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { FiAlertTriangle, FiLink } from 'react-icons/fi';

import { DataTable, EmptyState, ErrorState } from '@/components/common';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * ONE LIST, for every page that reads a storefront.
 *
 * The vendor's console had twenty-six of these and each one carried its own
 * copy of loading, total, rows, page, pageSize, filter, sort and errText. They
 * were the same screen twenty-six times, which is why fixing anything about a
 * list meant fixing it twenty-six times.
 *
 * This is that screen, once. A page supplies its columns, its list hook and
 * the words for an empty one; everything below is the same for all of them.
 *
 * THREE EMPTY STATES, NOT ONE — and that is the whole reason this exists
 * rather than each page rendering a DataTable directly. "You have no Appstore
 * account", "you have not bought anything" and "the store did not answer" all
 * arrive as zero rows, and they need three different sentences:
 *
 *   linked: false     the member has no account in that store. Not an error,
 *                     not their fault, and nothing to retry.
 *   unavailable       the service is down. Their data exists; we could not
 *                     reach it. Retrying is exactly the right move.
 *   neither           genuinely empty, which is the ordinary case.
 *
 * Collapsing those into "No results" is how a member concludes their orders
 * have been deleted.
 */
export default function StorefrontList({
  list,
  columns,
  store,
  emptyTitle,
  emptyHint,
  children
}) {
  const t = useT();
  const surface = useSurface();

  const summary = list.meta && list.meta.summary;
  const linked = !summary || summary.linked !== false;
  const unavailable = !!(summary && summary.unavailable);

  if (list.error) return <ErrorState message={list.error} onRetry={list.reload} />;

  /*
   * Both notices sit ABOVE the children rather than replacing the whole page:
   * a filter bar that vanishes when a service hiccups takes the member's
   * controls away at the exact moment they want to change something.
   */
  return (
    <Box>
      {children}

      {!linked && !list.loading && (
        <Notice
          icon={FiLink}
          tone={surface.muted}
          title={t('account.storefront.storefrontlist.noAccountLinked', { store: store })}
          body={t('account.storefront.storefrontlist.thisCrystalAccountIsNot', { store: store })}
        />
      )}

      {unavailable && (
        <Notice
          icon={FiAlertTriangle}
          tone="orange.400"
          title={t('account.storefront.storefrontlist.didNotAnswer', { store: store })}
          body={t('account.storefront.storefrontlist.yourDataIsStillThere')}
          action={{ label: t('common.tryAgain'), onClick: list.reload }}
        />
      )}

      {linked && (
        <DataTable
          columns={columns}
          rows={list.rows}
          loading={list.loading}
          meta={list.meta}
          onPage={list.setPage}
          emptyTitle={emptyTitle}
          emptyHint={emptyHint}
        />
      )}

      {!linked && !list.loading && (
        <EmptyState
          title={emptyTitle}
          hint={t('account.storefront.storefrontlist.onceTheAccountsAreConnected')}
        />
      )}
    </Box>
  );
}

/** A one-line explanation with an optional way out of it. */
function Notice({ icon, tone, title, body, action }) {
  const surface = useSurface();

  return (
    <Flex
      align="flex-start"
      gap="3"
      data-gap="12"
      p="4"
      mb="5"
      borderRadius="12px"
      bg={surface.raised}
      borderWidth="1px"
      borderColor={surface.border}
    >
      <Box as={icon} mt="1" color={tone} flexShrink={0} />
      <Box>
        <Text fontWeight="700" color={surface.text}>{title}</Text>
        <Text fontSize="sm" color={surface.muted}>{body}</Text>
        {action && (
          <Text
            as="button"
            type="button"
            mt="2"
            fontSize="sm"
            fontWeight="600"
            color="brand.500"
            onClick={action.onClick}
          >
            {action.label}
          </Text>
        )}
      </Box>
    </Flex>
  );
}
