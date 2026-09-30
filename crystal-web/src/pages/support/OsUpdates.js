import React from 'react';
import { Box, Flex, Heading, SimpleGrid, Stack, Text } from '@chakra-ui/react';
import { Breadcrumbs, EmptyState, ErrorState, Loading, Section } from '@/components/common';
import VerifiedBackground from '@/components/security/VerifiedBackground';
import VerifiedProductImage from '@/components/security/VerifiedProductImage';
import api from '@/api';
import { useApi } from '@/hooks/useApi';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * Crystal OS releases (spec 8).
 *
 * Which handsets received a version is on each product page, not here - the
 * date belongs to the pair, and a single list of "supported devices" per
 * version would flatten a staged rollout into one date that is wrong for most
 * of them.
 *
 * THIS PAGE IS A MARKETING PAGE, not a changelog, and it is laid out as one:
 * the release notes were correct and completely unreadable, because a wall of
 * bullet points is what a changelog looks like and nobody reads a changelog
 * for pleasure. So every release now leads with its artwork.
 *
 * Three bands, in descending order of how much anybody cares:
 *
 *   the LATEST release  a full-width feature - cover image, the copy, the
 *                       highlights, then the screens published with it laid
 *                       out underneath
 *   EARLIER releases    a card each, cover image on top, three highlights
 *   nothing else        because a fifth-oldest release is an archive entry
 *
 * A release with no artwork still draws: the feature falls back to a tinted
 * panel and the cards to a coloured band, so the page degrades to what it
 * used to be rather than to a column of holes.
 */

/**
 * A release's highlights are stored as free text, one point per line - which
 * is what the console's editor writes into. Splitting them here keeps an
 * editor able to paste release notes straight in.
 */
function highlightsOf(version) {
  return String((version && version.highlights) || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** The screens published with a release, cover image included as the first. */
function imagesOf(version) {
  return ((version && version.images) || []).map((asset) => ({
    id: asset.id,
    path: asset.file_path,
    alt: asset.alt_text || '',
    integrity: asset.integrity
  }));
}

export default function OsUpdates() {
  const t = useT();

  const surface = useSurface();
  const versions = useApi(() => api.support.os(), []);

  const latest = versions.data && versions.data.length ? versions.data[0] : null;
  const rest = versions.data ? versions.data.slice(1) : [];

  const latestShots = imagesOf(latest);

  return (
    <>
      <Section py={{ base: 6, md: 10 }}>
        <Breadcrumbs items={[{ label: 'Support' }, { label: 'Crystal OS' }]} />

        <Heading size="lg" color={surface.text} letterSpacing="-0.02em">
          {t('support.osupdates.crystalOs')}
        </Heading>
        <Text color={surface.muted} mt="1" maxW="640px">
          {t('support.osupdates.everyModelLaunchedWithCrystal')}
        </Text>

        {versions.loading && <Loading variant="block" height="320px" />}

        {!versions.loading && versions.error && (
          <ErrorState message={versions.error} onRetry={versions.reload} />
        )}

        {!versions.loading && !versions.error && (!versions.data || versions.data.length === 0) && (
          <EmptyState title={t('support.osupdates.noReleasesPublishedYet')} />
        )}
      </Section>

      {latest && (
        <>
          {/*
            The feature.

            The cover image is the WHOLE band rather than a panel beside the
            text: a release is announced with a picture, and a 44% column of
            artwork next to a 56% column of prose is a press release, not an
            announcement. The copy sits on the picture behind a scrim that is
            strongest exactly where the words are - darkening the whole frame
            would wash the artwork out, which is the thing being shown.
          */}
          <Box position="relative" bg={surface.raised} overflow="hidden">
            {latest.cover_image && (
              <VerifiedBackground
                integrity={latest.cover_image_integrity}
                expectedPath={latest.cover_image}
                alt={`Crystal OS ${latest.version}`}
                position="absolute"
                insetX="0" insetY="0"
                w="100%"
                h="100%"
                objectFit="cover"
                loading="eager"
              />
            )}

            {latest.cover_image && (
              <Box
                position="absolute"
                insetX="0" insetY="0"
                bgGradient="linear(to-r, blackAlpha.800, blackAlpha.500 55%, blackAlpha.300)"
                pointerEvents="none"
              />
            )}

            <Section
              py={{ base: 12, md: 20 }}
              position="relative"
              color={latest.cover_image ? 'white' : surface.text}
            >
              <Stack spacing="4" maxW={{ base: '100%', md: '620px' }}>
                <Flex align="baseline" gap="3" data-gap="12" data-gap-wrap wrap="wrap">
                  <Text
                    fontSize="xs"
                    fontWeight="700"
                    color={latest.cover_image ? 'white' : 'brand.500'}
                    letterSpacing="1px"
                  >
                    {t('support.osupdates.latestRelease')}
                  </Text>
                  <Text fontSize="xs" opacity={0.8}>
                    {latest.release_date}
                  </Text>
                </Flex>

                <Heading
                  size="2xl"
                  letterSpacing="-0.03em"
                  lineHeight="1.1"
                  color={latest.cover_image ? 'white' : surface.text}
                >
                  {t('support.osupdates.crystalOs')} {latest.version}
                </Heading>

                <Text fontSize={{ base: 'lg', md: 'xl' }} fontWeight="500" opacity={0.95}>
                  {latest.title}
                </Text>

                {latest.description && (
                  <Text opacity={0.88}>{latest.description}</Text>
                )}

                {highlightsOf(latest).length > 0 && (
                  <Stack spacing="2" pt="2">
                    {highlightsOf(latest).map((line) => (
                      <Flex key={line} gap="3" data-gap="12" align="flex-start">
                        <Box
                          mt="8px"
                          boxSize="6px"
                          borderRadius="full"
                          bg={latest.cover_image ? 'white' : 'brand.500'}
                          flexShrink={0}
                        />
                        <Text opacity={0.92}>{line}</Text>
                      </Flex>
                    ))}
                  </Stack>
                )}

                <Text fontSize="sm" opacity={0.75} pt="2">
                  {t('support.osupdates.rolloutsAreStagedYourProduct')}
                </Text>
              </Stack>
            </Section>
          </Box>

          {/*
            The screens published with the release.

            Beneath the feature rather than inside it, because these are the
            evidence for the sentences above them and reading order is the
            only thing that says so. Three across on a desktop, one on a
            phone: a screenshot of a phone rendered a third of a phone wide is
            not showing anybody anything.
          */}
          {latestShots.length > 0 && (
            <Section py={{ base: 8, md: 12 }}>
              <SimpleGrid columns={{ base: 1, md: 3 }} spacing={{ base: 4, md: 6 }}>
                {latestShots.map((shot) => (
                  <Box
                    key={shot.id}
                    borderRadius="16px"
                    overflow="hidden"
                    bg={surface.raised}
                    border="1px solid"
                    borderColor={surface.border}
                  >
                    <VerifiedProductImage
                      integrity={shot.integrity}
                      expectedPath={shot.path}
                      alt={shot.alt}
                      layout="natural"
                    />
                    {shot.alt && (
                      <Text fontSize="sm" color={surface.muted} px="4" py="3">
                        {shot.alt}
                      </Text>
                    )}
                  </Box>
                ))}
              </SimpleGrid>
            </Section>
          )}
        </>
      )}

      {rest.length > 0 && (
        <Section tinted py={{ base: 10, md: 14 }}>
          <Heading size="md" color={surface.text} mb="6">
            {t('support.osupdates.earlierReleases')}
          </Heading>

          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={{ base: 5, md: 6 }}>
            {rest.map((version) => {
              const shots = imagesOf(version);
              // The cover if there is one, otherwise the first published
              // screen - a card with no picture at all is the odd one out in
              // a row of three, which reads as a loading failure.
              const art = version.cover_image
                ? { path: version.cover_image, integrity: version.cover_image_integrity }
                : (shots.length ? shots[0] : null);

              return (
                <Box
                  key={version.id}
                  borderRadius="16px"
                  overflow="hidden"
                  bg={surface.card}
                  border="1px solid"
                  borderColor={surface.border}
                  transition="transform 180ms ease"
                  _hover={{ transform: 'translateY(-3px)' }}
                >
                  <Box position="relative" pb="56%" bg={surface.raised}>
                    {art && (
                      <VerifiedBackground
                        integrity={art.integrity}
                        expectedPath={art.path}
                        alt={`Crystal OS ${version.version}`}
                        position="absolute"
                        insetX="0" insetY="0"
                        w="100%"
                        h="100%"
                        objectFit="cover"
                        loading="lazy"
                      />
                    )}
                    <Flex
                      position="absolute"
                      bottom="0"
                      left="0"
                      right="0"
                      align="baseline"
                      justify="space-between"
                      gap="2" data-gap="8"
                      px="4"
                      py="3"
                      bgGradient="linear(to-t, blackAlpha.700, transparent)"
                    >
                      <Heading size="md" color="white">
                        {version.version}
                      </Heading>
                      <Text fontSize="xs" color="whiteAlpha.800">
                        {version.release_date}
                      </Text>
                    </Flex>
                  </Box>

                  <Box p="5">
                    <Text fontWeight="600" color={surface.text} noOfLines={1}>
                      {version.title}
                    </Text>
                    <Text fontSize="sm" color={surface.muted} mt="1" noOfLines={2}>
                      {version.description}
                    </Text>

                    {highlightsOf(version).length > 0 && (
                      <Stack spacing="1.5" mt="4">
                        {highlightsOf(version).slice(0, 3).map((line) => (
                          <Flex key={line} gap="2" data-gap="8" align="flex-start">
                            <Box
                              mt="7px"
                              boxSize="4px"
                              borderRadius="full"
                              bg="brand.500"
                              flexShrink={0}
                            />
                            <Text fontSize="sm" color={surface.strong}>
                              {line}
                            </Text>
                          </Flex>
                        ))}
                      </Stack>
                    )}
                  </Box>
                </Box>
              );
            })}
          </SimpleGrid>
        </Section>
      )}
    </>
  );
}
