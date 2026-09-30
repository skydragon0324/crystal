import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Flex, Heading, Link, Text } from '@chakra-ui/react';
import { ChevronRightIcon } from '@chakra-ui/icons';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

export default function SectionHeading({ title, subtitle, moreLabel, moreTo, action, ...rest }) {
  const t = useT();
  const surface = useSurface();

  return (
    <Flex
      align={{ base: 'flex-start', md: 'flex-end' }}
      justify="space-between"
      direction={{ base: 'column', md: 'row' }}
      gap="3" data-gap="12" data-gap-row-from="md"
      mb={{ base: 6, md: 8 }}
      {...rest}
    >
      <Box minW="0">
        <Heading size="lg" color={surface.text} letterSpacing="-0.02em">
          {title}
        </Heading>
        {subtitle && (
          <Text color={surface.muted} mt="2" maxW="640px">
            {subtitle}
          </Text>
        )}
      </Box>

      {action}

      {!action && moreTo && (
        <Link
          as={RouterLink}
          to={moreTo}
          color="brand.500"
          fontWeight="600"
          fontSize="sm"
          display="inline-flex"
          alignItems="center"
          flexShrink={0}
          _hover={{ textDecoration: 'none', color: 'brand.600' }}
        >
          {moreLabel || t('common.seeAll')}
          <ChevronRightIcon boxSize="4" ml="1" />
        </Link>
      )}
    </Flex>
  );
}
