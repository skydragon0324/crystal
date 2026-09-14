import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Flex, Heading, Icon, SimpleGrid, Text } from '@chakra-ui/react';
import { FiArrowUpRight } from 'react-icons/fi';

import ResponsiveMedia from './ResponsiveMedia';
import SectionHeading from './SectionHeading';
import { useSurface } from '@/theme/tokens';

/**
 * 02 — WHAT WE DO: the vision, then the seven businesses.
 *
 * THE HIERARCHY IS DATA, NOT POSITION. The first three tiles are large
 * because they are the ones flagged `is_featured` in the console, not because
 * they are the first three rows - so a manager promoting the print business
 * changes a switch rather than a component. Everything not featured falls
 * into the smaller grid below, whether that is four items or nine.
 *
 * A business only becomes a link when it has somewhere to go: several of the
 * seven are things Crystal does rather than places a customer can visit, and
 * a card that looks clickable and is not is worse than a card that does not.
 */

function BusinessTile({ business, large }) {
  const surface = useSurface();

  const external = business.link_url && /^https?:\/\//i.test(business.link_url);
  const clickable = !!business.link_url;

  const linkProps = clickable
    ? (external
      ? { as: 'a', href: business.link_url, target: '_blank', rel: 'noopener noreferrer' }
      : { as: RouterLink, to: business.link_url })
    : {};

  return (
    <Box
      {...linkProps}
      display="block"
      borderRadius="18px"
      border="1px solid"
      borderColor={surface.border}
      bg={surface.card}
      overflow="hidden"
      transition="border-color 180ms ease, transform 180ms ease"
      _hover={clickable ? { borderColor: 'brand.500', transform: 'translateY(-4px)' } : undefined}
    >
      {business.image_desktop && (
        <ResponsiveMedia
          desktop={business.image_desktop}
          mobile={business.image_mobile}
          alt={business.title}
          ratio={large ? 16 / 9 : 3 / 2}
          rounded={false}
        />
      )}

      <Box p={{ base: 5, md: large ? 7 : 5 }}>
        <Flex align="center" gap="2" data-gap="8">
          <Heading
            as="h3"
            size={large ? 'md' : 'sm'}
            color={surface.text}
            letterSpacing="-0.02em"
          >
            {business.title}
          </Heading>
          {clickable && <Icon as={FiArrowUpRight} boxSize="4" color="brand.500" />}
        </Flex>

        {business.subtitle && (
          <Text fontSize="xs" color="brand.500" fontWeight="600" mt="1">
            {business.subtitle}
          </Text>
        )}

        {business.description && (
          <Text
            fontSize="sm"
            color={surface.muted}
            mt="3"
            noOfLines={large ? undefined : 3}
          >
            {business.description}
          </Text>
        )}
      </Box>
    </Box>
  );
}

export default function BusinessesSection({ vision, section, businesses }) {
  const surface = useSurface();

  const items = businesses || [];
  const featured = items.filter((item) => item.is_featured);
  const rest = items.filter((item) => !item.is_featured);

  return (
    <Box>
      {/* The vision opens the chapter: a single sentence, given room, before
          the grid of what that sentence pays for. */}
      {vision && (
        <Box
          maxW="820px"
          mb={{ base: 10, md: 16 }}
          pb={{ base: 8, md: 12 }}
          borderBottom="1px solid"
          borderColor={surface.border}
        >
          {vision.eyebrow && (
            <Text
              fontSize="xs"
              fontWeight="800"
              letterSpacing="0.14em"
              textTransform="uppercase"
              color="brand.500"
              mb="3"
            >
              {vision.eyebrow}
            </Text>
          )}
          <Heading as="h2" size={{ base: 'lg', md: 'xl' }} color={surface.text} letterSpacing="-0.03em">
            {vision.title}
          </Heading>
          {vision.description && (
            <Text color={surface.muted} mt="4" fontSize={{ base: 'md', md: 'lg' }}>
              {vision.description}
            </Text>
          )}
        </Box>
      )}

      {section && (
        <SectionHeading
          number="02"
          eyebrow={section.eyebrow}
          title={section.title}
          description={section.subtitle}
        />
      )}

      {featured.length > 0 && (
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={{ base: 5, md: 6 }} mb={{ base: 5, md: 6 }}>
          {featured.map((business, index) => (
            <Box
              key={business.id}
              /*
               * An odd number of featured tiles leaves the last one on a row
               * of its own, so it takes the whole width rather than half of
               * it and a gap. Three is the current case - two, then a wide
               * one - and five would behave the same way.
               */
              gridColumn={{
                base: 'auto',
                md: index === featured.length - 1 && featured.length % 2 === 1
                  ? 'span 2'
                  : 'auto'
              }}
            >
              <BusinessTile business={business} large />
            </Box>
          ))}
        </SimpleGrid>
      )}

      {rest.length > 0 && (
        <SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={{ base: 4, md: 5 }}>
          {rest.map((business) => (
            <BusinessTile key={business.id} business={business} />
          ))}
        </SimpleGrid>
      )}
    </Box>
  );
}
