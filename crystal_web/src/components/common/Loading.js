import React from 'react';
import { Center, Skeleton, SimpleGrid, Spinner, Stack } from '@chakra-ui/react';

/**
 * Loading placeholders.
 *
 * `variant="grid"` and `variant="list"` draw skeletons shaped like the
 * content that is coming, which keeps the page from jumping when it lands.
 * A bare spinner is only right when the shape is unknown.
 */
export default function Loading({ variant, count, height }) {
  if (variant === 'grid') {
    return (
      <SimpleGrid columns={{ base: 2, md: 3, lg: 4 }} spacing={{ base: 4, md: 6 }}>
        {Array.from({ length: count || 8 }).map((ignored, index) => (
          <Stack key={index} spacing="3">
            <Skeleton height={height || '220px'} borderRadius="12px" />
            <Skeleton height="14px" width="70%" />
            <Skeleton height="12px" width="40%" />
          </Stack>
        ))}
      </SimpleGrid>
    );
  }

  if (variant === 'list') {
    return (
      <Stack spacing="3">
        {Array.from({ length: count || 6 }).map((ignored, index) => (
          <Skeleton key={index} height={height || '64px'} borderRadius="12px" />
        ))}
      </Stack>
    );
  }

  if (variant === 'block') {
    return <Skeleton height={height || '320px'} borderRadius="16px" />;
  }

  return (
    <Center py="20">
      <Spinner size="lg" color="brand.500" thickness="3px" />
    </Center>
  );
}
