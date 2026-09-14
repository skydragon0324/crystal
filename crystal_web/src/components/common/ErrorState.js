import React from 'react';
import { Button, Flex, Icon, Text } from '@chakra-ui/react';
import { FiAlertCircle } from 'react-icons/fi';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * What a failed fetch looks like.
 *
 * The message shown is the one the API wrote - those are written for a
 * person, and replacing them with "Something went wrong" throws away the only
 * useful part.
 */
export default function ErrorState({ message, onRetry, py }) {
  const t = useT();

  const surface = useSurface();
  return (
    <Flex direction="column" align="center" justify="center" py={py || 16} gap="3" data-gap="12" data-gap-column>
      <Icon as={FiAlertCircle} boxSize="8" color="red.400" />
      <Text fontWeight="600" color={surface.text} textAlign="center">
        {message || 'That did not load'}
      </Text>
      {onRetry && (
        <Button size="sm" variant="quiet" onClick={onRetry}>
          {t('common.tryAgain')}
        </Button>
      )}
    </Flex>
  );
}
