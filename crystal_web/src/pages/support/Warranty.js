import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Flex,
  Heading,
  Icon,
  SimpleGrid,
  Stack,
  Text
} from '@chakra-ui/react';
import { FiCheck, FiShield, FiX } from 'react-icons/fi';
import { useSelector } from 'react-redux';

import { Breadcrumbs, Section } from '@/components/common';
import { selectIsSignedIn } from '@/app/authSlice';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * The warranty policy.
 *
 * This is the one page whose content is genuinely static - it is policy, not
 * catalogue data, and the spec's database defines no table for it.
 */

/*
 * Exported because the support page shows the same three figures.
 *
 * Policy, not catalogue - the database defines no table for it - but it still
 * only gets to be written down once, or the two pages disagree about the
 * battery term and the customer believes whichever one they read first.
 */
export const COVERAGE = [
  { months: 12, title: 'The device', body: 'Manufacturing defects in the handset, panel, board and buttons.' },
  { months: 6, title: 'The battery', body: 'Capacity below 80% of its rated charge within the period.' },
  { months: 3, title: 'In-box accessories', body: 'The charger, cable and any bundled headset or microphone.' }
];

const COVERED = [
  'Manufacturing defects in materials or workmanship',
  'A screen that fails without physical damage',
  'A battery that drops below 80% capacity within six months',
  'Software faults that a service centre cannot resolve remotely',
  'Charging ports and buttons that stop responding in normal use'
];

const NOT_COVERED = [
  'Accidental damage, drops and cracked glass',
  'Liquid damage beyond the device\'s IP rating',
  'Repairs carried out by anyone other than a Crystal service centre',
  'Cosmetic wear that does not affect how the device works',
  'Consumable accessories replaced through normal use'
];

export default function Warranty() {
  const t = useT();

  const surface = useSurface();
  const isSignedIn = useSelector(selectIsSignedIn);

  return (
    <Section py={{ base: 6, md: 10 }}>
      <Breadcrumbs items={[{ label: 'Support', to: '/support' }, { label: 'Warranty' }]} />

      <Flex align="center" gap="3" data-gap="12" mb="2">
        <Icon as={FiShield} boxSize="7" color="brand.500" />
        <Heading size="lg" color={surface.text} letterSpacing="-0.02em">
          {t('common.warranty')}
        </Heading>
      </Flex>
      <Text color={surface.muted} mb="10" maxW="720px">
        {t('support.warranty.everyCrystalProductCarriesA')}
      </Text>

      <SimpleGrid columns={{ base: 1, md: 3 }} spacing="5" mb="12">
        {COVERAGE.map((item) => (
          <Box
            key={item.title}
            p="6"
            borderRadius="14px"
            border="1px solid"
            borderColor={surface.border}
          >
            <Text fontSize="3xl" fontWeight="800" color="brand.500" letterSpacing="-0.02em">
              {/*
                * "{n} months" as ONE string, not a number beside a word.
                * Concatenating in JSX puts the unit after the figure in every
                * language, and that is not where every language puts it.
                */}
              {t('support.warranty.nMonths', { n: item.months })}
            </Text>
            <Text fontWeight="700" color={surface.text} mt="1">
              {t(item.title)}
            </Text>
            <Text fontSize="sm" color={surface.muted} mt="2">
              {t(item.body)}
            </Text>
          </Box>
        ))}
      </SimpleGrid>

      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={{ base: 6, md: 10 }} mb="12">
        <Box>
          <Heading size="md" color={surface.text} mb="4">
            {t('common.whatIsCovered')}
          </Heading>
          <Stack spacing="3">
            {COVERED.map((line) => (
              <Flex key={line} gap="3" data-gap="12" align="flex-start">
                <Icon as={FiCheck} color="green.500" boxSize="5" mt="0.5" flexShrink={0} />
                <Text color={surface.strong}>{t(line)}</Text>
              </Flex>
            ))}
          </Stack>
        </Box>

        <Box>
          <Heading size="md" color={surface.text} mb="4">
            {t('support.warranty.whatIsNot')}
          </Heading>
          <Stack spacing="3">
            {NOT_COVERED.map((line) => (
              <Flex key={line} gap="3" data-gap="12" align="flex-start">
                <Icon as={FiX} color="red.400" boxSize="5" mt="0.5" flexShrink={0} />
                <Text color={surface.strong}>{t(line)}</Text>
              </Flex>
            ))}
          </Stack>
        </Box>
      </SimpleGrid>

      <Box p={{ base: 6, md: 8 }} borderRadius="16px" bg={surface.raised}>
        <Heading size="md" color={surface.text}>
          {t('support.warranty.makingAClaim')}
        </Heading>
        <Stack spacing="3" mt="4" color={surface.strong}>
          <Text>
            <strong>1.</strong> {t('support.warranty.registerTheDeviceToYour')}
          </Text>
          <Text>
            <strong>2.</strong> {t('support.warranty.bringItToAnyService')}
          </Text>
          <Text>
            <strong>3.</strong> {t('support.warranty.ifTheFaultIsCovered')}
          </Text>
        </Stack>

        <Flex gap="3" data-gap="12" data-gap-wrap mt="6" wrap="wrap">
          <Button
            as={RouterLink}
            to={isSignedIn ? '/account/products/register' : '/login'}
            variant="brand"
          >
            {t('common.registerAProduct')}
          </Button>
          <Button as={RouterLink} to="/support/centres" variant="quiet">
            {t('support.warranty.findAServiceCentre')}
          </Button>
          <Button as={RouterLink} to="/support/pricing" variant="quiet">
            {t('common.repairPrices')}
          </Button>
        </Flex>
      </Box>
    </Section>
  );
}
