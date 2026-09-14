import React from 'react';
import { Button, Flex, Text } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import { useSurface } from '@/theme/tokens';

export default function EmptyState({ title, hint, actionLabel, actionTo, onAction, py }) {
  const surface = useSurface();
  return (
    <Flex direction="column" align="center" justify="center" py={py || 16} gap="2" data-gap="8" data-gap-column>
      <Text fontWeight="700" fontSize="lg" color={surface.text}>
        {title || 'Nothing here yet'}
      </Text>
      {hint && (
        <Text fontSize="sm" color={surface.muted} textAlign="center" maxW="420px">
          {hint}
        </Text>
      )}
      {actionLabel && (actionTo || onAction) && (
        <Button
          mt="3"
          variant="brand"
          size="sm"
          as={actionTo ? RouterLink : undefined}
          to={actionTo}
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      )}
    </Flex>
  );
}
