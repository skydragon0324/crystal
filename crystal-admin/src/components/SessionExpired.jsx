import React from 'react';
import { Box, Flex, Text, Button, Icon, useColorModeValue } from '@chakra-ui/react';
import { TimeIcon } from '@chakra-ui/icons';
import { useI18n } from '../i18n';

/**
 * Shown instead of the app once the session has gone: either the idle timer
 * ran out or the API answered 401.  It is a full page rather than a modal so
 * nothing behind it stays interactive, but it is dressed as a dialog so it
 * reads as "your session ended", not "something broke".
 */
export default function SessionExpired({ onSignIn }) {
  const { t } = useI18n();

  const pageBg = useColorModeValue('#F8FAFC', 'navy.900');
  const cardBg = useColorModeValue('white', 'navy.800');
  const titleColor = useColorModeValue('navy.700', 'white');
  const bodyColor = useColorModeValue('secondaryGray.700', 'navy.200');
  // Read up here, never inside the JSX: a hook has to run in the same order
  // on every render, which the rules-of-hooks lint enforces at build time.
  const borderColor = useColorModeValue('secondaryGray.100', 'navy.600');
  const shadow = useColorModeValue(
    '14px 17px 40px 4px rgba(112, 144, 176, 0.18)',
    '14px 17px 40px 4px rgba(0, 0, 0, 0.35)'
  );

  return (
    <Flex
      role="alertdialog" aria-modal="true" aria-labelledby="session-expired-title"
      bg={pageBg} minH="100vh" w="100%" align="center" justify="center" px="1.25rem"
    >
      <Box
        bg={cardBg} borderRadius="0.75rem" border="1px solid"
        borderColor={borderColor} boxShadow={shadow}
        w="100%" maxW="27.5rem" p="2.125rem" textAlign="center"
      >
        <Flex
          w="4rem" h="4rem" mx="auto" mb="1.375rem" borderRadius="1.25rem"
          align="center" justify="center" bg="brand.500"
        >
          <Icon as={TimeIcon} w="1.625rem" h="1.625rem" color="white" />
        </Flex>

        <Text id="session-expired-title" fontSize="xl" fontWeight="700" color={titleColor}>
          {t('components.sessionexpired.sessionTimedOut')}
        </Text>

        <Text fontSize="sm" color={bodyColor} mt="0.625rem" lineHeight="1.6">
          {t('components.sessionexpired.youWereInactiveForA')}
        </Text>

        <Button
          variant="brand" w="100%" h="3rem" mt="1.625rem"
          borderRadius="1rem" fontSize="sm" fontWeight="600"
          onClick={onSignIn}
        >
          {t('components.sessionexpired.logInAgain')}
        </Button>
      </Box>
    </Flex>
  );
}
