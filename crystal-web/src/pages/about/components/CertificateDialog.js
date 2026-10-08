import React from 'react';
import {
  Box, Flex, Image, Modal, ModalBody, ModalCloseButton, ModalContent,
  ModalOverlay, Text
} from '@chakra-ui/react';

import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';
import { date as formatDate } from '@/utils/format';

/**
 * THE CERTIFICATE AT FULL SIZE.
 *
 * ONE DIALOG FOR A WHOLE SET, holding whichever certificate was opened -
 * rather than a dialog per card, which would mount thirteen dialogs to show
 * none of them. `certificate` being null is the closed state, so nothing
 * inside is rendered until there is something to render.
 *
 * `contain` here as in the card: the point of opening a scan is to read it.
 */
export default function CertificateDialog({ certificate, onClose }) {
  const t = useT();
  const surface = useSurface();

  return (
    <Modal
      isOpen={!!certificate}
      onClose={onClose}
      size="xl"
      isCentered
      scrollBehavior="inside"
    >
      <ModalOverlay bg="blackAlpha.700" />
      <ModalContent bg={surface.card} borderRadius="18px" mx="4">
        <ModalCloseButton zIndex="2" />

        <ModalBody p={{ base: 4, md: 6 }}>
          {certificate && certificate.image && (
            <Image
              src={certificate.image}
              alt={certificate.name}
              w="100%"
              maxH="60vh"
              objectFit="contain"
              borderRadius="12px"
              bg={surface.raised}
              mb="5"
            />
          )}

          {certificate && (
            <Box>
              <Text fontSize="lg" fontWeight="700" color={surface.text}>
                {certificate.name}
              </Text>

              <Flex gap="3" data-gap="12" data-gap-wrap mt="2" wrap="wrap">
                {certificate.issuer && (
                  <Text fontSize="sm" color={surface.muted}>{certificate.issuer}</Text>
                )}
                {(certificate.issue_date || certificate.year) && (
                  <Text fontSize="sm" color="brand.500" fontWeight="600">
                    {certificate.issue_date ? formatDate(certificate.issue_date) : certificate.year}
                  </Text>
                )}
              </Flex>

              {certificate.description && (
                <Text fontSize="sm" color={surface.strong} mt="4" whiteSpace="pre-wrap">
                  {certificate.description}
                </Text>
              )}

              {!certificate.image && (
                <Text fontSize="xs" color={surface.muted} mt="4">
                  {t('about.components.certificategrid.theCertificateItselfHasNot')}
                </Text>
              )}
            </Box>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
