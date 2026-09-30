import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  ModalCloseButton, Box, Flex, Text, Button, Icon, Image, Progress,
  useColorModeValue
} from '@chakra-ui/react';
import { MdCloudUpload, MdImage } from 'react-icons/md';
import { CloseIcon } from '@chakra-ui/icons';
import { useI18n } from '@/i18n';
import { number } from '@/utils/format';

const ACCEPT = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

/*
 * Through utils/format rather than toFixed, so a file size groups and trims
 * the same way every other number in the console does - "1.5 MB", not
 * "1.0 MB", and a stray twelve-megabyte pick reads as "12 MB".
 */
const prettySize = (bytes) => {
  if (bytes < 1024) return number(bytes) + ' B';
  if (bytes < 1024 * 1024) return number(bytes / 1024, 0) + ' KB';
  return number(bytes / (1024 * 1024), 1) + ' MB';
};

/**
 * Image picker for the rich text editor: drop a file on it or browse for one.
 *
 * The file is checked and previewed here before anything is sent, so a wrong
 * pick costs nothing - the alternative, a bare file input, uploads whatever it
 * is handed and only reports the problem afterwards.
 */
export default function ImageUploadDialog({ isOpen, onClose, onUpload }) {
  const { t } = useI18n();
  const inputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const zoneBg = useColorModeValue('secondaryGray.300', 'whiteAlpha.50');
  const zoneActiveBg = useColorModeValue('#DCD6F7', 'rgba(91, 63, 224, 0.22)');
  const borderColor = useColorModeValue('secondaryGray.100', 'whiteAlpha.200');
  const brandColor = useColorModeValue('brand.500', 'brand.400');
  const textColor = useColorModeValue('navy.700', 'white');
  const mutedColor = useColorModeValue('secondaryGray.600', 'secondaryGray.500');

  const reset = useCallback(() => {
    setFile(null);
    setDragging(false);
    setBusy(false);
    setError(null);
    setPreview((old) => {
      if (old) window.URL.revokeObjectURL(old);
      return null;
    });
  }, []);

  useEffect(() => { if (!isOpen) reset(); }, [isOpen, reset]);

  // The object URL is a real allocation; drop it when the dialog goes away.
  useEffect(() => () => { if (preview) window.URL.revokeObjectURL(preview); }, [preview]);

  const accept = useCallback((picked) => {
    if (!picked) return;

    if (ACCEPT.indexOf(picked.type) < 0) {
      setError(t('dialog.notAnImage'));
      return;
    }
    if (picked.size > MAX_BYTES) {
      setError(t('dialog.imageTooLarge', { size: prettySize(MAX_BYTES) }));
      return;
    }

    setError(null);
    setFile(picked);
    setPreview((old) => {
      if (old) window.URL.revokeObjectURL(old);
      return window.URL.createObjectURL(picked);
    });
  }, [t]);

  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    accept(dropped);
  };

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await onUpload(file);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="lg">
      <ModalOverlay />
      <ModalContent borderRadius="1.25rem">
        <ModalHeader color={textColor}>{t('dialog.uploadImage')}</ModalHeader>
        <ModalCloseButton _focus={{ boxShadow: 'none' }} />

        <ModalBody pb="0.5rem">
          {/*
            One drop zone that is also a button: dragging a file onto it and
            clicking it to browse are the same gesture as far as the user is
            concerned, so they share one target.
          */}
          <Box
            as="button" type="button" w="100%"
            border="2px dashed"
            borderColor={dragging ? brandColor : borderColor}
            bg={dragging ? zoneActiveBg : zoneBg}
            borderRadius="1.125rem" px="1.25rem" py={preview ? '1.125rem' : '2.375rem'}
            transition="background .15s ease, border-color .15s ease"
            _hover={{ borderColor: brandColor }}
            onClick={() => inputRef.current && inputRef.current.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            {preview ? (
              <Flex direction="column" align="center" gap="0.75rem" data-gap="12" data-gap-column>
                <Image
                  src={preview} alt=""
                  maxH="13.75rem" maxW="100%" borderRadius="0.75rem" objectFit="contain"
                />
                <Flex align="center" gap="0.5rem" data-gap="8">
                  <Icon as={MdImage} w="0.9375rem" h="0.9375rem" color={mutedColor} />
                  <Text fontSize="sm" color={textColor} fontWeight="600" noOfLines={1}>
                    {file.name}
                  </Text>
                  <Text fontSize="xs" color={mutedColor}>{prettySize(file.size)}</Text>
                </Flex>
              </Flex>
            ) : (
              <Flex direction="column" align="center" gap="0.625rem" data-gap="10" data-gap-column>
                <Icon as={MdCloudUpload} w="2.375rem" h="2.375rem" color={brandColor} />
                <Text fontSize="sm" fontWeight="700" color={textColor}>
                  {t('dialog.dropAnImageHere')}
                </Text>
                <Text fontSize="xs" color={mutedColor}>{t('dialog.dropHint')}</Text>
              </Flex>
            )}
          </Box>

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT.join(',')}
            style={{ display: 'none' }}
            onChange={(e) => {
              const picked = e.target.files && e.target.files[0];
              e.target.value = '';   // picking the same file twice must still fire
              accept(picked);
            }}
          />

          {busy ? (
            <Progress size="xs" isIndeterminate colorScheme="brandScheme" mt="0.875rem" borderRadius="0.25rem" />
          ) : null}

          {error ? (
            <Flex align="center" gap="0.5rem" data-gap="8" mt="0.875rem">
              <Icon as={CloseIcon} w="0.625rem" h="0.625rem" color="red.500" />
              <Text fontSize="sm" color="red.500" fontWeight="500">{error}</Text>
            </Flex>
          ) : null}
        </ModalBody>

        <ModalFooter pt="1.125rem">
          {file ? (
            <Button
              variant="subtle" fontSize="sm" borderRadius="1rem" me="auto"
              onClick={reset} isDisabled={busy}
            >
              {t('dialog.chooseAnother')}
            </Button>
          ) : null}

          <Button
            variant="subtle" fontSize="sm" borderRadius="1rem" me="0.75rem"
            onClick={onClose} isDisabled={busy}
          >
            {t('common.cancel')}
          </Button>
          <Button
            variant="brand" fontSize="sm" fontWeight="500" borderRadius="1rem" px="1.625rem"
            onClick={submit} isLoading={busy} isDisabled={!file}
          >
            {t('dialog.insert')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
