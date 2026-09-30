import React, { useState } from 'react';
import {
  AspectRatio, Box, Flex, Image, Modal, ModalBody, ModalCloseButton,
  ModalContent, ModalOverlay, SimpleGrid, Text
} from '@chakra-ui/react';

import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';
import { date as formatDate } from '@/utils/format';

/**
 * A WALL OF CERTIFICATES, and the one a reader opens.
 *
 * The same component serves the company's certificates and the factory's
 * quality marks, because they are the same thing to a reader: a scan, an
 * issuer and a year, worth seeing at full size and not worth a page.
 *
 * THE GRID SHOWS THUMBNAILS AND THE MODAL SHOWS THE FILE. There is one image
 * per certificate in the local asset map - a scan has no second crop - so what makes
 * the grid cheap is that the thumbnails are drawn small and the modal is
 * rendered only for the one that is open. Mounting thirteen full-size scans
 * to show thirteen 200px cards is the mistake this avoids.
 *
 * A real scan is always used when there is one; a certificate with no image
 * falls back to its own name on a tinted card rather than to a generic
 * trophy icon, which would say less than the words already do.
 */
export default function CertificateGrid({ certificates, columns }) {
  const t = useT();
  const surface = useSurface();
  const [open, setOpen] = useState(null);

  if (!certificates || !certificates.length) return null;

  return (
    <>
      <SimpleGrid
        columns={columns || { base: 2, md: 3, lg: 4 }}
        spacing={{ base: 4, md: 5 }}
      >
        {certificates.map((certificate) => (
          <Box
            key={certificate.id}
            as="button"
            type="button"
            textAlign="left"
            borderRadius="14px"
            border="1px solid"
            borderColor={surface.border}
            bg={surface.card}
            overflow="hidden"
            transition="border-color 160ms ease, transform 160ms ease"
            _hover={{ borderColor: 'brand.500', transform: 'translateY(-3px)' }}
            onClick={() => setOpen(certificate)}
          >
            <AspectRatio ratio={3 / 4} bg={surface.raised}>
              {certificate.image ? (
                <Image
                  src={certificate.image}
                  alt={certificate.name}
                  objectFit="cover"
                  loading="lazy"
                />
              ) : (
                <Flex align="center" justify="center" px="3">
                  <Text fontSize="xs" color={surface.muted} textAlign="center" noOfLines={4}>
                    {certificate.name}
                  </Text>
                </Flex>
              )}
            </AspectRatio>

            <Box p="3">
              <Text fontSize="sm" fontWeight="700" color={surface.text} noOfLines={2}>
                {certificate.name}
              </Text>
              {certificate.issuer && (
                <Text fontSize="xs" color={surface.muted} mt="1" noOfLines={1}>
                  {certificate.issuer}
                </Text>
              )}
              {certificate.year && (
                <Text fontSize="xs" color="brand.500" fontWeight="600" mt="1">
                  {certificate.year}
                </Text>
              )}
            </Box>
          </Box>
        ))}
      </SimpleGrid>

      {/*
        One modal for the whole grid, holding whichever certificate was
        clicked - rather than a modal per card, which would mount thirteen
        dialogs to show none of them.
      */}
      <Modal isOpen={!!open} onClose={() => setOpen(null)} size="xl" isCentered scrollBehavior="inside">
        <ModalOverlay bg="blackAlpha.700" />
        <ModalContent bg={surface.card} borderRadius="18px" mx="4">
          <ModalCloseButton zIndex="2" />

          <ModalBody p={{ base: 4, md: 6 }}>
            {open && open.image && (
              <Image
                src={open.image}
                alt={open.name}
                w="100%"
                maxH="60vh"
                objectFit="contain"
                borderRadius="12px"
                bg={surface.raised}
                mb="5"
              />
            )}

            {open && (
              <Box>
                <Text fontSize="lg" fontWeight="700" color={surface.text}>
                  {open.name}
                </Text>

                <Flex gap="3" data-gap="12" data-gap-wrap mt="2" wrap="wrap">
                  {open.issuer && (
                    <Text fontSize="sm" color={surface.muted}>{open.issuer}</Text>
                  )}
                  {(open.issue_date || open.year) && (
                    <Text fontSize="sm" color="brand.500" fontWeight="600">
                      {open.issue_date ? formatDate(open.issue_date) : open.year}
                    </Text>
                  )}
                </Flex>

                {open.description && (
                  <Text fontSize="sm" color={surface.strong} mt="4" whiteSpace="pre-wrap">
                    {open.description}
                  </Text>
                )}

                {!open.image && (
                  <Text fontSize="xs" color={surface.muted} mt="4">
                    {t('about.components.certificategrid.theCertificateItselfHasNot')}
                  </Text>
                )}
              </Box>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}
