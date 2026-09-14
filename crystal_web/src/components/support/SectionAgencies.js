import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Button, Flex, Heading, SimpleGrid, Stack, Tag, Text, Wrap, WrapItem
} from '@chakra-ui/react';
import { EmptyState, Loading, Section, SectionHeading } from '@/components/common';
import { centresPathOf, servicesOf } from '@/components/support/serviceSections';
import api from '@/api';
import { useApi } from '@/hooks/useApi';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * The service centres that serve THIS SECTION, on the section's own page.
 *
 * The same building repairs a handset and a set-top box, and the counters are
 * not the same: a phone customer can ask for Crystal OS help, insurance and a
 * replacement; an eproduct customer asks about media service, streaming
 * devices, computers, cordless phones and cameras. Listing every centre with
 * every service it offers anywhere would send somebody to a branch that does
 * not handle their product.
 *
 * So the section is part of the request, and the API answers with the centres
 * that offer something in it - each showing only that section's services. It
 * is `agency_services.section` doing the work; there is still one `agencies`
 * row behind both lists.
 *
 * The vocabulary and the link to the full locator both come from
 * support/serviceSections, so this band and the locator itself cannot end up
 * calling the same service two different things - which they had.
 */
export default function SectionAgencies({ section, title, limit }) {
  const t = useT();

  const surface = useSurface();

  const centres = useApi(
    () => api.support.agencies({ section: section, limit: limit || 6 }),
    [section, limit]
  );

  const rows = centres.data || [];
  const allPath = centresPathOf(section);

  // A section with no centres at all shows nothing rather than an empty band -
  // this sits among the marketing sections of a landing page.
  if (!centres.loading && !centres.error && rows.length === 0) return null;

  return (
    <Section tinted>
      <SectionHeading
        title={title || t('common.serviceCentres')}
        subtitle={t('components.sectionagencies.authorisedCentresThatHandleThese')}
        moreTo={allPath}
        moreLabel={t('common.findACentre')}
      />

      {centres.loading && <Loading variant="grid" count={3} height="150px" />}

      {!centres.loading && centres.error && (
        <EmptyState title={t('components.sectionagencies.serviceCentresAreUnavailableRight')} />
      )}

      {!centres.loading && !centres.error && (
        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={{ base: 4, md: 6 }}>
          {rows.map((row) => {
            const services = servicesOf(row, section);

            return (
              <Stack
                key={row.id}
                spacing="3"
                p={{ base: 5, md: 6 }}
                borderRadius="16px"
                bg={surface.card}
                border="1px solid"
                borderColor={surface.border}
              >
                <Box>
                  <Heading size="sm" color={surface.text} noOfLines={1}>
                    {row.name}
                  </Heading>
                  <Text fontSize="sm" color={surface.muted} mt="1" noOfLines={2}>
                    {row.address}
                  </Text>
                </Box>

                {row.phone && (
                  <Text fontSize="sm" color={surface.strong}>
                    {row.phone}
                  </Text>
                )}

                {/*
                  Only this section's services. A centre that also repairs
                  televisions does not advertise that on the smartphone page -
                  it is a different counter and often a different desk.
                */}
                {services.length > 0 && (
                  <Wrap spacing="2" pt="1">
                    {services.map((entry) => (
                      <WrapItem key={entry.key}>
                        <Tag size="sm" borderRadius="8px" colorScheme="brand" variant="subtle">
                          {t(entry.label)}
                        </Tag>
                      </WrapItem>
                    ))}
                  </Wrap>
                )}
              </Stack>
            );
          })}
        </SimpleGrid>
      )}

      <Flex justify="center" mt="8">
        {/*
          It pointed at /support/agencies?section=…, which is not a route this
          application has - the locator has always been at /support/centres -
          so the button below the band 404'd on both section pages.
        */}
        <Button as={RouterLink} to={allPath} variant="outlineBrand">
          {t('components.sectionagencies.allServiceCentres')}
        </Button>
      </Flex>
    </Section>
  );
}
