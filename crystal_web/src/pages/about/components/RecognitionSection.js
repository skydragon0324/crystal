import React, { useState } from 'react';
import {
  Box, Flex, Heading, Image, Modal, ModalBody, ModalCloseButton, ModalContent,
  ModalOverlay, SimpleGrid, Text
} from '@chakra-ui/react';

import CertificateGrid from './CertificateGrid';
import SectionHeading from './SectionHeading';
import { fileUrl } from '@/api/client';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * 03 — WHY TRUST US.
 *
 * One recognition given the whole width, then the company's own certificates
 * as a wall underneath. The hierarchy is the argument: a Top-10 placing is a
 * claim about the company, and seven ISO numbers are the evidence that it is
 * run properly - showing them at the same size would flatten both.
 *
 * The featured scan opens at full size like any other certificate, so the
 * modal logic is the same one the grid uses rather than a second copy.
 */
export default function RecognitionSection({ section, featured, certificates }) {
  const t = useT();
  const surface = useSurface();
  const [open, setOpen] = useState(false);

  return (
    <Box>
      {section && (
        <SectionHeading
          number="03"
          eyebrow={section.eyebrow}
          title={section.title}
          description={section.subtitle}
          align="center"
        />
      )}

      {featured && (
        <SimpleGrid
          columns={{ base: 1, lg: 2 }}
          spacing={{ base: 6, lg: 12 }}
          alignItems="center"
          mb={certificates && certificates.length ? { base: 12, md: 16 } : '0'}
          p={{ base: 5, md: 8 }}
          borderRadius="20px"
          bg={surface.raised}
        >
          {featured.image && (
            <Box
              as="button"
              type="button"
              onClick={() => setOpen(true)}
              borderRadius="14px"
              overflow="hidden"
              transition="transform 180ms ease"
              _hover={{ transform: 'scale(1.01)' }}
              aria-label={t('about.components.recognitionsection.openTheCertificate')}
            >
              <Image
                src={fileUrl(featured.image)}
                alt={featured.name}
                w="100%"
                maxH={{ base: '320px', md: '440px' }}
                objectFit="contain"
                loading="lazy"
              />
            </Box>
          )}

          <Box>
            <Heading as="h3" size="lg" color={surface.text} letterSpacing="-0.02em">
              {featured.name}
            </Heading>

            <Flex gap="3" data-gap="12" data-gap-wrap mt="3" wrap="wrap">
              {featured.issuer && (
                <Text fontSize="sm" color={surface.muted}>{featured.issuer}</Text>
              )}
              {featured.year && (
                <Text fontSize="sm" fontWeight="700" color="brand.500">{featured.year}</Text>
              )}
            </Flex>

            {featured.description && (
              <Text color={surface.strong} mt="5" fontSize={{ base: 'sm', md: 'md' }}>
                {featured.description}
              </Text>
            )}
          </Box>
        </SimpleGrid>
      )}

      {certificates && certificates.length > 0 && (
        <Box>
          <Heading
            as="h3"
            size="sm"
            color={surface.muted}
            letterSpacing="0.12em"
            textTransform="uppercase"
            mb="5"
          >
            {t('about.components.recognitionsection.ourCertificates')}
          </Heading>
          <CertificateGrid certificates={certificates} />
        </Box>
      )}

      {/* The featured scan gets its own dialog because it is not part of the
          grid - the grid holds the corporate ones. */}
      <Modal isOpen={open} onClose={() => setOpen(false)} size="xl" isCentered scrollBehavior="inside">
        <ModalOverlay bg="blackAlpha.700" />
        <ModalContent bg={surface.card} borderRadius="18px" mx="4">
          <ModalCloseButton zIndex="2" />
          <ModalBody p={{ base: 4, md: 6 }}>
            {featured && featured.image && (
              <Image
                src={fileUrl(featured.image)}
                alt={featured.name}
                w="100%"
                maxH="70vh"
                objectFit="contain"
                borderRadius="12px"
                bg={surface.raised}
              />
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
}
