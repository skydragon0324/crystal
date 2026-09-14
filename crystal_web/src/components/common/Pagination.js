import React from 'react';
import { Button, Flex, HStack, IconButton, Text } from '@chakra-ui/react';
import { ChevronLeftIcon, ChevronRightIcon } from '@chakra-ui/icons';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * Page controls.
 *
 * The window of numbered buttons is capped at five and slides with the
 * current page: a 40-page result set with 40 buttons is unusable on a phone
 * and not much better on a desktop.
 */
export default function Pagination({ meta, onPage }) {
  const t = useT();

  const surface = useSurface();
  if (!meta || meta.totalPages <= 1) return null;

  const { page, totalPages, total } = meta;
  const span = 5;
  let start = Math.max(1, page - Math.floor(span / 2));
  const end = Math.min(totalPages, start + span - 1);
  start = Math.max(1, end - span + 1);

  const pages = [];
  for (let index = start; index <= end; index++) pages.push(index);

  return (
    <Flex align="center" justify="space-between" gap="3" data-gap="12" data-gap-wrap mt="8" wrap="wrap">
      <Text fontSize="sm" color={surface.muted}>
        {total} {total === 1 ? 'result' : 'results'}
      </Text>

      <HStack spacing="1">
        <IconButton
          size="sm"
          variant="quiet"
          aria-label={t('pagination.previousPage')}
          icon={<ChevronLeftIcon />}
          isDisabled={page <= 1}
          onClick={() => onPage(page - 1)}
        />
        {start > 1 && (
          <Button size="sm" variant="quiet" onClick={() => onPage(1)}>
            1
          </Button>
        )}
        {start > 2 && (
          <Text px="1" color={surface.muted}>
            …
          </Text>
        )}
        {pages.map((value) => (
          <Button
            key={value}
            size="sm"
            variant={value === page ? 'brand' : 'quiet'}
            onClick={() => onPage(value)}
          >
            {value}
          </Button>
        ))}
        {end < totalPages - 1 && (
          <Text px="1" color={surface.muted}>
            …
          </Text>
        )}
        {end < totalPages && (
          <Button size="sm" variant="quiet" onClick={() => onPage(totalPages)}>
            {totalPages}
          </Button>
        )}
        <IconButton
          size="sm"
          variant="quiet"
          aria-label={t('pagination.nextPage')}
          icon={<ChevronRightIcon />}
          isDisabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        />
      </HStack>
    </Flex>
  );
}
