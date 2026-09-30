import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Button, Flex, Heading, Text } from '@chakra-ui/react';
import { Section } from '@/components/common';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

export default function NotFound() {
  const t = useT();

  const surface = useSurface();

  return (
    <Section py={{ base: 16, md: 24 }}>
      <Flex direction="column" align="center" gap="4" data-gap="16" data-gap-column textAlign="center">
        <Text fontSize="6xl" fontWeight="800" color="brand.500" letterSpacing="-0.04em">
          404
        </Text>
        <Heading size="lg" color={surface.text}>
          {t('notfound.thatPageIsNotHere')}
        </Heading>
        <Text color={surface.muted} maxW="440px">
          {t('notfound.theLinkMayBeOld')}
        </Text>
        <Flex gap="3" data-gap="12" data-gap-wrap mt="4" wrap="wrap" justify="center">
          <Button as={RouterLink} to="/" variant="brand">
            {t('notfound.crystalHome')}
          </Button>
          <Button as={RouterLink} to="/smartphones/products" variant="quiet">
            {t('notfound.browseSmartphones')}
          </Button>
          <Button as={RouterLink} to="/support/contact" variant="quiet">
            {t('common.support')}
          </Button>
        </Flex>
      </Flex>
    </Section>
  );
}
