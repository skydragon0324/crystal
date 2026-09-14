import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Flex, SimpleGrid, Text } from '@chakra-ui/react';
import * as FiIcons from 'react-icons/fi';

import ResponsiveMedia from './ResponsiveMedia';
import SectionHeading from './SectionHeading';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * 09 — HOW WE SUPPORT CUSTOMERS.
 *
 * The chapter that closes the loop the page opened with: design, manufacture,
 * sell, support. The four-step line is drawn here rather than described,
 * because it is the argument for why a company that owns its factory can also
 * own its repairs.
 *
 * THE CTA GOES TO THE SERVICE CENTRE PAGE THAT ALREADY EXISTS, by a route
 * stored with the chapter - so a manager can point it at either network
 * without a release, and this page does not grow a locator of its own.
 */

const NARRATIVE = ['We design', 'We manufacture', 'We sell', 'We support'];

function serviceIcon(name) {
  return (name && FiIcons[name]) || null;
}

export default function ServiceSection({ section, services }) {
  const t = useT();
  const surface = useSurface();
  if (!section) return null;

  const items = services || [];
  const internal = section.cta_route && section.cta_route.charAt(0) === '/';

  return (
    <Box>
      <SectionHeading
        number="09"
        eyebrow={section.eyebrow}
        title={section.title}
        description={section.subtitle}
      />

      {/* Four words and three arrows. A structural device rather than
          content, which is why it is the one list here not from the API. */}
      <Flex
        align="center"
        gap="3" data-gap="12" data-gap-wrap
        wrap="wrap"
        mb={{ base: 8, md: 12 }}
      >
        {NARRATIVE.map((step, index) => (
          <React.Fragment key={step}>
            <Text
              fontSize={{ base: 'sm', md: 'md' }}
              fontWeight="700"
              color={index === NARRATIVE.length - 1 ? 'brand.500' : surface.muted}
            >
              {t(step)}
            </Text>
            {index < NARRATIVE.length - 1 && (
              <Box w="24px" h="1px" bg={surface.border} aria-hidden="true" />
            )}
          </React.Fragment>
        ))}
      </Flex>

      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={{ base: 8, lg: 14 }} alignItems="center">
        <ResponsiveMedia
          desktop={section.image_desktop}
          mobile={section.image_mobile}
          alt={section.title}
          ratio={4 / 3}
        />

        <Box>
          {section.description && (
            <Text color={surface.muted} fontSize={{ base: 'md', md: 'lg' }} mb="6">
              {section.description}
            </Text>
          )}

          {items.length > 0 && (
            <Box mb="8">
              {items.map((service) => {
                const Glyph = serviceIcon(service.icon);

                return (
                  <Flex
                    key={service.id}
                    gap="3" data-gap="12"
                    align="flex-start"
                    py="3"
                    borderTop="1px solid"
                    borderColor={surface.border}
                  >
                    {Glyph && (
                      <Box as={Glyph} size="18px" color="brand.500" style={{ marginTop: '2px' }} />
                    )}
                    <Box minW="0">
                      <Text fontWeight="700" color={surface.text}>{service.title}</Text>
                      {service.description && (
                        <Text fontSize="sm" color={surface.muted} mt="1">
                          {service.description}
                        </Text>
                      )}
                    </Box>
                  </Flex>
                );
              })}
            </Box>
          )}

          {section.cta_label && section.cta_route && (
            <Button
              variant="brand"
              size="lg"
              {...(internal
                ? { as: RouterLink, to: section.cta_route }
                : { as: 'a', href: section.cta_route, target: '_blank', rel: 'noopener noreferrer' })}
            >
              {section.cta_label}
            </Button>
          )}
        </Box>
      </SimpleGrid>
    </Box>
  );
}
