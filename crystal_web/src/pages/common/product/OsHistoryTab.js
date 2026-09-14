import React from 'react';
import { Box, Flex, Heading, Stack, Text } from '@chakra-ui/react';
import { EmptyState, ErrorState, Loading, Section } from '@/components/common';
import api from '@/api';
import { useApi } from '@/hooks/useApi';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * THIS DEVICE's update record - which is not the same page as Support /
 * Crystal OS, and the difference is the whole point of having both.
 *
 * Support / Crystal OS announces a RELEASE: what is in it, what it looks like,
 * when it came out. This answers the question an owner actually asks - "what
 * has my device had, and when?" - and it answers it about THIS device.
 *
 * THE VERSION IS THE DEVICE'S OWN STRING, not a link to a Crystal OS release.
 * The firmware a television or a set-top box ships is not a Crystal OS build
 * at all, and even on the handsets the version a device reports is its own -
 * so tying the two together meant a version could only be published against a
 * device if somebody first invented a matching release to point at.
 *
 * THE DATE IS THE DATE THIS MODEL RECEIVED IT, not the date the version came
 * out. A build reaches the flagship in March and the budget line in June, and
 * showing one date for both is exactly what makes people think their device
 * has been forgotten.
 */
export default function OsHistoryTab({ slug }) {
  const t = useT();

  const surface = useSurface();
  const history = useApi(() => api.catalog.osHistory(slug), [slug]);

  const entries = history.data || [];

  return (
    <Section py={{ base: 8, md: 12 }}>
      <Heading size="lg" color={surface.text} mb="2">
        {t('common.softwareUpdates')}
      </Heading>
      <Text color={surface.muted} mb="8" maxW="640px">
        {t('common.product.oshistorytab.everyVersionThisModelHas')}
      </Text>

      {history.loading && <Loading variant="list" count={4} height="120px" />}

      {!history.loading && history.error && (
        <ErrorState message={history.error} onRetry={history.reload} />
      )}

      {!history.loading && !history.error && entries.length === 0 && (
        <EmptyState
          title={t('common.product.oshistorytab.noUpdatesRecordedYet')}
          hint={t('common.product.oshistorytab.softwareUpdatesForThisModel')}
        />
      )}

      {!history.loading && !history.error && entries.length > 0 && (
        <Stack spacing="0">
          {entries.map((entry, index) => (
            <Flex
              key={entry.id}
              gap="5" data-gap="20"
              pb="8"
              position="relative"
              _before={
                index < entries.length - 1
                  ? {
                      content: '""',
                      position: 'absolute',
                      left: '7px',
                      top: '20px',
                      bottom: '0',
                      width: '2px',
                      bg: 'var(--cr-border)'
                    }
                  : undefined
              }
            >
              <Box
                mt="5px"
                boxSize="16px"
                borderRadius="full"
                bg="brand.500"
                border="3px solid"
                borderColor={surface.page}
                flexShrink={0}
                zIndex="1"
              />

              <Box flex="1" minW="0">
                <Flex align="baseline" gap="3" data-gap="12" data-gap-wrap wrap="wrap">
                  <Heading size="md" color={surface.text}>
                    {entry.os_version}
                  </Heading>
                  <Text fontSize="sm" color={surface.muted}>
                    {entry.release_date
                      ? `arrived ${entry.release_date}`
                      : 'date not recorded'}
                  </Text>
                </Flex>

                {/*
                  The notice, as PROSE.
                  It is sentences rather than a bullet list, so it is rendered
                  as a paragraph with the line breaks the editor typed kept -
                  `pre-wrap` is what makes a pasted notice look the way it did
                  when it was written.
                */}
                {entry.content && (
                  <Text color={surface.strong} mt="2" whiteSpace="pre-wrap">
                    {entry.content}
                  </Text>
                )}

                {/*
                  The publication approval reference. Last and quiet: it is a
                  compliance detail rather than something anybody came here to
                  read, but it has to be on the page.
                */}
                {entry.pub_approve_number && (
                  <Text fontSize="xs" color={surface.muted} mt="3">
                    {t('common.product.oshistorytab.publicationApproval')} {entry.pub_approve_number}
                  </Text>
                )}
              </Box>
            </Flex>
          ))}
        </Stack>
      )}
    </Section>
  );
}
