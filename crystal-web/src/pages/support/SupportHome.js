import React, { useState } from 'react';
import { Link as RouterLink, useHistory } from 'react-router-dom';
import {
  Box,
  Button,
  Flex,
  Heading,
  Icon,
  Input,
  InputGroup,
  InputLeftElement,
  SimpleGrid,
  Stack,
  Text
} from '@chakra-ui/react';
import { SearchIcon } from '@chakra-ui/icons';
import {
  FiCheckSquare,
  FiDownloadCloud,
  FiMapPin,
  FiMessageSquare,
  FiShield,
  FiSettings
} from 'react-icons/fi';
import { useSelector } from 'react-redux';

import { ErrorState, Loading, Section, SectionHeading } from '@/components/common';
import { SECTIONS, centresPathOf } from '@/components/support/serviceSections';
import { faqCategoryLabel } from '@/components/support/faqCategories';
import PhoneLinks from '@/components/support/PhoneLinks';
import api from '@/api';
import { useApi } from '@/hooks/useApi';
import { selectIsSignedIn } from '@/app/authSlice';
import { COVERAGE } from './Warranty';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * The support page (spec's Support Page section): search, quick actions, my
 * device, popular problems, service centres, repair pricing, OS support,
 * warranty and contact.
 *
 * Every one of those sections comes from a SINGLE `/support/home` call - the
 * page shows nine things at once and nine separate requests would resolve at
 * nine different moments.
 *
 * "My Device" only appears when signed in, and the server decides that: the
 * endpoint is called with the token if there is one and returns an empty
 * device list otherwise.
 */

/*
 * The quick actions are NAVIGATION, not content.
 *
 * They are the six places this page exists to send people, and every one of
 * them is a route in this application - so they live with the routes rather
 * than in the database, which has no table for a menu and would need one
 * updated every time a page moved.
 */
const QUICK_ACTIONS = [
  { key: 'CENTRES', label: 'Find a centre', to: '/support/centres', icon: FiMapPin },
  { key: 'PRICING', label: 'Repair pricing', to: '/support/pricing', icon: FiSettings },
  { key: 'OS', label: 'Crystal OS', to: '/support/os', icon: FiDownloadCloud },
  { key: 'WARRANTY', label: 'Warranty', to: '/support/warranty', icon: FiShield },
  { key: 'REGISTER', label: 'Register a product', to: '/account/products/register', icon: FiCheckSquare },
  { key: 'CONTACT', label: 'Contact us', to: '/support/contact', icon: FiMessageSquare }
];

export default function SupportHome() {
  const t = useT();

  const surface = useSurface();
  const history = useHistory();
  const isSignedIn = useSelector(selectIsSignedIn);
  const [term, setTerm] = useState('');

  const home = useApi(() => api.support.home(), []);

  /*
   * The devices come from the MEMBER endpoint, not from the support one -
   * /support/home is public and cannot know who is reading it.  The call is
   * skipped entirely when signed out rather than made and discarded.
   */
  const devices = useApi(
    () => (isSignedIn ? api.account.registrations({ limit: 3 }) : Promise.resolve({ data: null })),
    [isSignedIn]
  );

  const search = (event) => {
    event.preventDefault();
    if (!term.trim()) return;
    history.push(`/support/faq?q=${encodeURIComponent(term.trim())}`);
  };

  if (home.loading) {
    return (
      <Section>
        <Loading variant="block" height="200px" />
        <Box mt="8">
          <Loading variant="grid" count={6} height="120px" />
        </Box>
      </Section>
    );
  }

  if (home.error) {
    return (
      <Section>
        <ErrorState message={home.error} onRetry={home.reload} />
      </Section>
    );
  }

  const data = home.data;
  const myDevices = (devices.data && devices.data.rows) || [];
  // COUNT(*) arrives as text, so these are cast before they are added.
  const centreCount = (data.provinces || []).reduce(
    (total, province) => total + Number(province.agency_cnt || 0),
    0
  );

  return (
    <>
      {/* --------------------------------------------------- search banner */}
      <Box bgGradient="linear(to-br, brand.500, brand.700)" py={{ base: 12, md: 16 }}>
        <Box maxW="container.site" mx="auto" px={{ base: 4, md: 6 }}>
          <Stack spacing="5" maxW="640px">
            <Heading size="2xl" color="white" letterSpacing="-0.03em">
              {t('support.supporthome.howCanWeHelp')}
            </Heading>
            <Text color="whiteAlpha.900">
              {t('support.supporthome.searchTheAnswersFindA')}
            </Text>
            <Box as="form" onSubmit={search}>
              <InputGroup size="lg" maxW="520px">
                <InputLeftElement pointerEvents="none" h="48px">
                  <SearchIcon color="ink.400" />
                </InputLeftElement>
                <Input
                  bg="white"
                  color="ink.900"
                  border="none"
                  borderRadius="10px"
                  placeholder={t('support.supporthome.searchBatteryWarrantyOsUpdate')}
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  _placeholder={{ color: 'ink.400' }}
                />
              </InputGroup>
            </Box>
          </Stack>
        </Box>
      </Box>

      {/* ---------------------------------------------------- quick actions */}
      <Section py={{ base: 8, md: 12 }}>
        <SimpleGrid columns={{ base: 2, md: 3, lg: 6 }} spacing={{ base: 3, md: 5 }}>
          {QUICK_ACTIONS.map((action) => (
            <Flex
              key={action.key}
              as={RouterLink}
              to={action.to}
              direction="column"
              align="center"
              justify="center"
              gap="3" data-gap="12" data-gap-column
              py="6"
              px="3"
              borderRadius="14px"
              border="1px solid"
              borderColor={surface.border}
              textAlign="center"
              transition="border-color 160ms ease, transform 160ms ease"
              _hover={{ borderColor: 'brand.500', transform: 'translateY(-3px)' }}
            >
              <Icon as={action.icon} boxSize="6" color="brand.500" />
              <Text fontSize="sm" fontWeight="600" color={surface.text}>
                {t(action.label)}
              </Text>
            </Flex>
          ))}
        </SimpleGrid>
      </Section>

      {/* -------------------------------------------------------- my device */}
      {isSignedIn && (
        <Section tinted py={{ base: 8, md: 10 }}>
          <SectionHeading
            title={t('support.supporthome.myDevices')}
            subtitle={t('support.supporthome.everythingRegisteredToYourAccount')}
            moreTo="/account/eproduct/registrations"
            moreLabel={t('support.supporthome.manageDevices')}
          />
          {myDevices.length === 0 ? (
            <Flex
              direction="column"
              align="center"
              gap="3" data-gap="12" data-gap-column
              py="10"
              borderRadius="14px"
              border="1px dashed"
              borderColor={surface.border}
            >
              <Text fontWeight="600" color={surface.text}>
                {t('common.noDevicesRegisteredYet')}
              </Text>
              <Text fontSize="sm" color={surface.muted} textAlign="center" maxW="420px">
                {t('support.supporthome.registeringRecordsYourWarrantyDate')}
              </Text>
              <Button as={RouterLink} to="/account/products/register" variant="brand" size="sm">
                {t('common.registerAProduct')}
              </Button>
            </Flex>
          ) : (
            <SimpleGrid columns={{ base: 1, md: 3 }} spacing="4">
              {myDevices.map((device) => (
                <Box
                  key={device.id}
                  p="5"
                  borderRadius="14px"
                  bg={surface.card}
                  border="1px solid"
                  borderColor={surface.border}
                >
                  <Text fontWeight="700" color={surface.text} noOfLines={1}>
                    {device.product_name || device.serial_number}
                  </Text>
                  <Text fontSize="xs" color={surface.muted} fontFamily="mono" mt="1">
                    {device.serial_number}
                  </Text>
                  <Flex justify="space-between" fontSize="sm" mt="4">
                    <Text color={surface.muted}>{t('common.warrantyUntil')}</Text>
                    <Text color={surface.text} fontWeight="600">
                      {device.warranty_until || t('support.supporthome.notRecorded')}
                    </Text>
                  </Flex>
                  {/* Only a smartphone has a URL this page can build from a
                    * registration - everything else is addressed under its
                    * category, which a registration does not carry - so the
                    * rest go to the picker that can find them. */}
                  <Button
                    as={RouterLink}
                    to={
                      device.category_type === 'SMARTPHONE' && device.product_slug
                        ? `/smartphones/products/${device.product_slug}/service-pricing`
                        : '/support/pricing'
                    }
                    size="sm"
                    variant="quiet"
                    mt="4"
                    w="100%"
                  >
                    {t('common.repairPrices')}
                  </Button>
                </Box>
              ))}
            </SimpleGrid>
          )}
        </Section>
      )}

      {/* ------------------------------------------------- popular problems */}
      <Section py={{ base: 8, md: 12 }}>
        <SectionHeading
          title={t('support.supporthome.popularProblems')}
          subtitle={t('support.supporthome.rankedByWhatPeopleActually')}
          moreTo="/support/faq"
          moreLabel={t('support.supporthome.allQuestions')}
        />
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing="4">
          {(data.popular_faqs || []).map((faq) => (
            <Box
              key={faq.id}
              as={RouterLink}
              to={`/support/faq?open=${faq.id}`}
              p="5"
              borderRadius="14px"
              border="1px solid"
              borderColor={surface.border}
              _hover={{ borderColor: 'brand.500' }}
            >
              <Text fontWeight="700" color={surface.text}>
                {faq.question}
              </Text>
              {/* The answer is not in this reply - the support page sends the
                * questions and their popularity, and the answer arrives when
                * the question is opened. */}
              <Flex gap="2" data-gap="8" mt="2" fontSize="sm" color={surface.muted}>
                <Text>{t(faqCategoryLabel(faq.category))}</Text>
                <Text>·</Text>
                <Text>{t('common.reads', { count: faq.view_count })}</Text>
              </Flex>
            </Box>
          ))}
        </SimpleGrid>
      </Section>

      {/* --------------------------------------------------- service centres */}
      <Section tinted py={{ base: 8, md: 12 }}>
        <SectionHeading
          title={t('common.serviceCentres')}
          subtitle={t('support.supporthome.centresAcrossProvincesWalkIns', {
            centres: centreCount,
            provinces: (data.provinces || []).length
          })}
          moreTo={centresPathOf('SMARTPHONE')}
          moreLabel={t('common.findACentre')}
        />

        {/*
          TWO NETWORKS, CHOSEN BEFORE THE LIST RATHER THAN FILTERED AFTER IT.

          The band below is the estate as a whole - it is what a support page
          opens with - but the locator itself is per counter, because a
          smartphone customer and an eproduct customer are served at different
          desks by different staff. Naming both here is what stops somebody
          reading a card, clicking through, and finding the branch does not
          take their product.
        */}
        <Flex gap="3" data-gap="12" data-gap-wrap wrap="wrap" mb="6">
          {SECTIONS.map((entry) => (
            <Button
              key={entry.key}
              as={RouterLink}
              to={centresPathOf(entry.key)}
              size="sm"
              variant="quiet"
              leftIcon={<Icon as={FiMapPin} />}
            >
              {t(entry.label)}
            </Button>
          ))}
        </Flex>

        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing="4">
          {(data.centres || []).map((agency) => (
            <Box
              key={agency.id}
              p="5"
              borderRadius="14px"
              bg={surface.card}
              border="1px solid"
              borderColor={surface.border}
            >
              <Flex gap="3" data-gap="12" align="flex-start">
                <Icon as={FiMapPin} color="brand.500" boxSize="5" mt="0.5" flexShrink={0} />
                <Box minW="0">
                  <Text fontWeight="700" color={surface.text} noOfLines={2}>
                    {agency.name}
                  </Text>
                  <Text fontSize="sm" color={surface.muted} mt="1" noOfLines={2}>
                    {agency.address}
                  </Text>
                  <PhoneLinks phones={agency.phones} mt="2" />
                </Box>
              </Flex>
            </Box>
          ))}
        </SimpleGrid>
      </Section>

      {/* -------------------------------------------- OS support and warranty */}
      <Section py={{ base: 8, md: 12 }}>
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={{ base: 6, md: 8 }}>
          {data.os && (
            <Box
              p={{ base: 6, md: 8 }}
              borderRadius="16px"
              border="1px solid"
              borderColor={surface.border}
            >
              <Text fontSize="xs" fontWeight="700" color="brand.500" letterSpacing="1px">
                {t('common.crystalOs')} {data.os.version}
              </Text>
              <Heading size="md" mt="2" color={surface.text}>
                {data.os.title}
              </Heading>
              <Text fontSize="sm" color={surface.muted} mt="3" noOfLines={3}>
                {data.os.description}
              </Text>
              <Button as={RouterLink} to="/support/os" variant="outlineBrand" size="sm" mt="5">
                {t('support.supporthome.allReleases')}
              </Button>
            </Box>
          )}

          <Box
            p={{ base: 6, md: 8 }}
            borderRadius="16px"
            border="1px solid"
            borderColor={surface.border}
          >
            <Icon as={FiShield} boxSize="6" color="brand.500" />
            <Heading size="md" mt="3" color={surface.text}>
              {t('common.warranty')}
            </Heading>
            <Stack spacing="2" mt="4" fontSize="sm">
              {COVERAGE.map((item) => (
                <Flex key={item.title} justify="space-between">
                  <Text color={surface.muted}>{item.title}</Text>
                  <Text color={surface.text} fontWeight="600">
                    {item.months} months
                  </Text>
                </Flex>
              ))}
            </Stack>
            <Button as={RouterLink} to="/support/warranty" variant="outlineBrand" size="sm" mt="5">
              {t('common.whatIsCovered')}
            </Button>
          </Box>
        </SimpleGrid>
      </Section>

      {/* ----------------------------------------------------------- contact */}
      <Section tinted py={{ base: 8, md: 12 }}>
        <Flex
          direction={{ base: 'column', md: 'row' }}
          align="center"
          justify="space-between"
          gap="6" data-gap="24" data-gap-row-from="md"
        >
          <Box>
            <Heading size="lg" color={surface.text}>
              {t('support.supporthome.stillStuck')}
            </Heading>
            <Text color={surface.muted} mt="2" maxW="520px">
              {t('support.supporthome.writeToUsFromYour')}
            </Text>
          </Box>
          <Button
            as={RouterLink}
            to="/account/feedback"
            variant="brand"
            size="lg"
            flexShrink={0}
          >
            {isSignedIn ? t('common.writeToSupport') : t('support.supporthome.signInToWrite')}
          </Button>
        </Flex>
      </Section>
    </>
  );
}
