import React, { useRef, useState } from 'react';
import {
  Box, Button, Flex, Icon, Image, Input, Text, useToast
} from '@chakra-ui/react';
import { CloseIcon } from '@chakra-ui/icons';
import { MdImage, MdCloudUpload } from 'react-icons/md';
import { media } from '../api';
import { fileUrl } from '../api/client';
import { useI18n } from '../i18n';
import { useSurface } from '../theme/tokens';

const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml';

/**
 * One image column: a picture of what is stored, and a way to replace it.
 *
 * These fields hold a PATH - '/uploads/products/c9-pro/main.svg' - not a
 * media row, which is why this is not the media library picker.  What it
 * replaces is a bare text input, and typing a path by hand is how a product
 * ends up with a broken image that nobody notices until it is on the
 * storefront.
 *
 * The path stays editable underneath.  Somebody who already knows the path,
 * or who is pointing two products at one file, should not have to re-upload
 * it to say so.
 *
 * The upload happens ON PICK rather than on save, which is the one real cost
 * here: abandoning the form leaves a file nothing references.  That is the
 * trade for the form storing a string rather than a pending File - and those
 * files are visible and removable in the media library, which is more than
 * can be said for an image column pointing at nothing.
 */
export default function ImageField({ value, folder, isDisabled, onChange }) {
  const { t } = useI18n();
  const toast = useToast();
  const surface = useSurface();
  const inputRef = useRef(null);

  const [busy, setBusy] = useState(false);

  const pick = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';        // picking the same file twice must still fire
    if (!file) return;

    setBusy(true);
    try {
      // No owner, so the API stores the file and answers its path rather than
      // creating a media row - see the media controller.
      const { data } = await media.upload(folder || 'misc', file);
      onChange(data.file_path);
    } catch (err) {
      toast({ title: err.message, status: 'error', duration: 6000, isClosable: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box>
      <Flex gap="0.625rem" data-gap="10" align="flex-start">
        <Flex
          align="center" justify="center" flexShrink={0}
          w="4rem" h="4rem" borderRadius="0.5rem" overflow="hidden"
          bg={surface.raised} border="1px solid" borderColor={surface.border}
        >
          {value ? (
            <Image src={fileUrl(value)} alt="" w="100%" h="100%" objectFit="cover" />
          ) : (
            <Icon as={MdImage} w="1.25rem" h="1.25rem" color={surface.muted} />
          )}
        </Flex>

        <Box flex="1" minW="0">
          <Input
            fontSize="sm" h="2.25rem"
            placeholder="/uploads/…"
            value={value || ''}
            isReadOnly={isDisabled}
            onChange={(e) => onChange(e.target.value)}
          />

          <Flex gap="0.375rem" data-gap="6" mt="0.375rem">
            <Button
              size="xs" h="1.75rem" variant="subtle"
              leftIcon={<Icon as={MdCloudUpload} w="0.8125rem" h="0.8125rem" />}
              isLoading={busy}
              isDisabled={isDisabled}
              onClick={() => inputRef.current && inputRef.current.click()}
            >
              {t('form.upload')}
            </Button>

            {value && !isDisabled ? (
              <Button
                size="xs" h="1.75rem" variant="quiet" color="red.400"
                leftIcon={<CloseIcon w="0.5rem" h="0.5rem" />}
                onClick={() => onChange('')}
              >
                {t('common.clear')}
              </Button>
            ) : null}
          </Flex>

          <Text fontSize="0.6875rem" color={surface.muted} mt="0.25rem" noOfLines={1}>
            {t('form.uploadHint')}
          </Text>
        </Box>
      </Flex>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        style={{ display: 'none' }}
        onChange={pick}
      />
    </Box>
  );
}
