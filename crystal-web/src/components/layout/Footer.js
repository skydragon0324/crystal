import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Container,
  Divider,
  Flex,
  HStack,
  Link,
  SimpleGrid,
  Stack,
  Text
} from '@chakra-ui/react';
import { FiDownload, FiPhone } from 'react-icons/fi';

import api from '@/api';
import { useApi } from '@/hooks/useApi';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * The footer, and every word in it belongs to the operations console.
 *
 * FOUR SECTIONS: the apps to download, the numbers to reach an administrator
 * on, support, and the company itself. None of it is in this file - a phone
 * number that moved is not a deployment, and the previous version of this
 * component hardcoded twenty links that only a release could change.
 *
 * IT RENDERS BEFORE THE ANSWER ARRIVES. The footer is on every page, so a
 * component that waited for a request would leave a hole at the bottom of
 * the site on every first paint. The API merges the saved document over a
 * default that is a real footer, so there is always something to draw - and
 * the loading state here is simply the previous frame, which is nothing.
 */
export default function Footer() {
  const t = useT();
  const surface = useSurface();

  const footer = useApi(() => api.site.footer(), []);
  const doc = footer.data;

  return (
    <Box as="footer" bg={surface.raised} mt="20" borderTop="1px solid" borderColor={surface.border}>
      <Container maxW="container.site" py={{ base: 10, md: 14 }}>
        {!!doc && (
          <SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={{ base: 8, md: 10 }}>
            {/* 1 — the apps. Downloads, so each one says so. */}
            <Section title={t(doc.downloads.title)}>
              {doc.downloads.items.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  isExternal={/^https?:/i.test(item.href || '')}
                  display="flex"
                  alignItems="center"
                  gap="2"
                  data-gap="8"
                  fontSize="sm"
                  color={surface.strong}
                  _hover={{ color: 'brand.500', textDecoration: 'none' }}
                >
                  <Box as={FiDownload} flexShrink={0} />
                  {t(item.label)}
                </Link>
              ))}
            </Section>

            {/*
              * 2 — the numbers, and each one says what it is.
              *
              * `tel:` links, because half the people reading this are on a
              * phone and the alternative is copying a number by hand. The
              * LABEL is what makes seven of them usable: a 400 service line,
              * four Shenzhen landlines and two mobiles are otherwise one
              * stripe of identical digits, and somebody wanting after-sales
              * rings the wholesale desk.
              *
              * The label is the company's own data, typed in the console, so
              * it is shown as typed - it is not run through t(), for the
              * same reason the address below is not.
              *
              * ONE COLUMN ON A PHONE. A number takes two lines now and needs
              * the width; the second column comes back at `sm`, and from
              * `lg` the footer is four columns wide and one is right again.
              */}
            <Section title={t(doc.contacts.title)}>
              <SimpleGrid columns={{ base: 1, sm: 2, lg: 1 }} spacingX="4" spacingY="2">
                {doc.contacts.phones.map(asPhone).map((phone) => (
                  <Link
                    key={phone.number + ' ' + phone.label}
                    href={'tel:' + phone.number.replace(/[^\d+]/g, '')}
                    display="flex"
                    alignItems="center"
                    gap="2"
                    data-gap="8"
                    fontSize="sm"
                    color={surface.strong}
                    _hover={{ color: 'brand.500', textDecoration: 'none' }}
                  >
                    <Box as={FiPhone} flexShrink={0} />
                    <Box>
                      {!!phone.label && (
                        <Text fontSize="xs" lineHeight="1.3" color={surface.muted}>
                          {phone.label}
                        </Text>
                      )}
                      <Text as="span" fontSize="sm" lineHeight="1.3">{phone.number}</Text>
                    </Box>
                  </Link>
                ))}
              </SimpleGrid>
            </Section>

            {/* 3 — support. */}
            <Section title={t(doc.support.title)}>
              {doc.support.links.map((link) =>
                link.to ? (
                  <Link
                    key={link.label}
                    as={RouterLink}
                    to={link.to}
                    fontSize="sm"
                    color={surface.strong}
                    _hover={{ color: 'brand.500', textDecoration: 'none' }}
                  >
                    {t(link.label)}
                  </Link>
                ) : (
                  <Link
                    key={link.label}
                    href={link.href}
                    isExternal
                    fontSize="sm"
                    color={surface.strong}
                    _hover={{ color: 'brand.500', textDecoration: 'none' }}
                  >
                    {t(link.label)}
                  </Link>
                )
              )}
            </Section>

            {/* 4 — the company. An address is prose, not a list of links. */}
            <Section title={t(doc.company.title)}>
              {!!doc.company.email && (
                <Link
                  href={'mailto:' + doc.company.email}
                  fontSize="sm"
                  color={surface.strong}
                  _hover={{ color: 'brand.500', textDecoration: 'none' }}
                >
                  {doc.company.email}
                </Link>
              )}
              {!!doc.company.address && (
                <Text fontSize="sm" color={surface.muted}>{doc.company.address}</Text>
              )}
            </Section>
          </SimpleGrid>
        )}

        <Divider my="10" borderColor={surface.border} />

        <Flex
          direction={{ base: 'column', md: 'row' }}
          align={{ base: 'flex-start', md: 'center' }}
          justify="space-between"
          gap="4" data-gap="16" data-gap-row-from="md"
        >
          <Flex align="center" gap="3" data-gap="12">
            <Flex
              align="center"
              justify="center"
              boxSize="28px"
              borderRadius="8px"
              bgGradient="linear(to-br, brand.400, brand.600)"
            >
              <Text fontWeight="800" color="white" fontSize="sm" lineHeight="1">
                C
              </Text>
            </Flex>
            <Text fontSize="sm" color={surface.muted}>
              © {new Date().getFullYear()} {t('components.footer.crystalElectronicsAllRightsReserved')}
            </Text>
          </Flex>

          {/*
            * THE TWO SITE BUTTONS, in the corner.
            *
            * A button with no destination is not drawn. The console always
            * has two rows to type into, because a pair that appears only
            * once it is filled in is a pair nobody knows exists - but a
            * button that goes nowhere is worse than an empty corner.
            */}
          <HStack spacing="3">
            {(doc ? doc.sites : []).filter((site) => site.href).map((site) => (
              <Link
                key={site.label}
                href={site.href}
                isExternal
                px="4"
                py="1.5"
                fontSize="sm"
                fontWeight="600"
                borderRadius="8px"
                border="1px solid"
                borderColor={surface.border}
                color={surface.strong}
                _hover={{ color: 'brand.500', borderColor: 'brand.500', textDecoration: 'none' }}
              >
                {t(site.label)}
              </Link>
            ))}
          </HStack>
        </Flex>
      </Container>
    </Box>
  );
}

/**
 * One phone number, whichever shape the document holds it in.
 *
 * LABELS ARRIVED AFTER THE FIRST FOOTERS WERE SAVED, so a site whose settings
 * row predates them still holds bare strings. The API normalises what it
 * serves; this is the same rule where the rendering happens, so a number out
 * of an old document shows exactly as it always did - with no label above it
 * rather than as an empty line.
 */
function asPhone(entry) {
  const row = entry && typeof entry === 'object' ? entry : { number: entry };

  return {
    label: String(row.label == null ? '' : row.label),
    number: String(row.number == null ? '' : row.number)
  };
}

/** One column: a heading, then whatever it holds. */
function Section({ title, children }) {
  const surface = useSurface();

  return (
    <Stack spacing="3">
      <Text
        fontSize="xs"
        fontWeight="700"
        textTransform="uppercase"
        letterSpacing="0.08em"
        color={surface.muted}
      >
        {title}
      </Text>
      {children}
    </Stack>
  );
}
