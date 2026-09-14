import React from 'react';
import { Box, Flex, Heading, SimpleGrid, Text } from '@chakra-ui/react';
import { EmptyState } from '@/components/common';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * The specification sheet.
 *
 * The API already returns it grouped and ordered, so this only lays it out -
 * regrouping here would mean the storefront and the console could disagree
 * about what "Display" contains.
 */
export default function SpecificationSheet({ groups }) {
  const t = useT();

  const surface = useSurface();

  if (!groups || groups.length === 0) {
    return (
      <EmptyState
        title={t('common.product.specificationsheet.noSpecificationsPublishedYet')}
        hint={t('common.product.specificationsheet.theFullSheetAppearsHere')}
      />
    );
  }

  return (
    <Box>
      <Heading size="lg" mb="8" color={surface.text}>
        {t('common.product.specificationsheet.specifications')}
      </Heading>

      <SimpleGrid columns={{ base: 1, lg: 2 }} spacingX="16" spacingY="10">
        {groups.map((group) => (
          <Box key={group.group_id}>
            <Text
              fontSize="xs"
              fontWeight="700"
              letterSpacing="0.8px"
              textTransform="uppercase"
              color="brand.500"
              mb="3"
            >
              {group.group_name}
            </Text>

            <Box>
              {group.items.map((item, index) => (
                <Flex
                  key={item.specification_id}
                  justify="space-between"
                  align="baseline"
                  gap="6" data-gap="24"
                  py="3"
                  borderTop={index === 0 ? '1px solid' : 'none'}
                  borderBottom="1px solid"
                  borderColor={surface.border}
                >
                  <Text fontSize="sm" color={surface.muted} flexShrink={0}>
                    {item.name}
                  </Text>
                  <Text fontSize="sm" color={surface.text} textAlign="right" fontWeight="500">
                    {item.value}
                    {item.unit && (
                      <Text as="span" color={surface.muted} ml="1">
                        {item.unit}
                      </Text>
                    )}
                  </Text>
                </Flex>
              ))}
            </Box>
          </Box>
        ))}
      </SimpleGrid>
    </Box>
  );
}
