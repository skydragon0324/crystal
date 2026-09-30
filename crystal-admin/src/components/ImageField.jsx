import React, { useEffect, useMemo, useRef } from 'react';
import {
  Box, Button, Flex, Icon, Image, Input, Text
} from '@chakra-ui/react';
import { CloseIcon } from '@chakra-ui/icons';
import { MdImage, MdCloudUpload } from 'react-icons/md';
import ImagePreview from './ImagePreview';
import { fileUrl } from '../api/client';
import { useI18n } from '../i18n';
import { useSurface } from '../theme/tokens';

const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml';

/*
 * The advert screens take a film too - the hero carousel and the popup both
 * play one. Two containers only, because those are the two every browser
 * opens; the server sniffs the stored bytes and refuses anything else,
 * whatever a picker let through.
 */
const MEDIA_ACCEPT = ACCEPT + ',video/mp4,video/webm';

const VIDEO_EXTENSIONS = ['.mp4', '.m4v', '.webm'];

function isVideo(name) {
  const text = String(name || '').toLowerCase();
  const at = text.lastIndexOf('.');
  return at !== -1 && VIDEO_EXTENSIONS.indexOf(text.slice(at)) !== -1;
}

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
export default function ImageField({ value, folder, isDisabled, onChange, kind }) {
  const { t } = useI18n();
  const surface = useSurface();
  const inputRef = useRef(null);

  /* `media` is the advert screens; every other field stays artwork-only. */
  const allowsVideo = kind === 'media';

  const pending = value && value.__pendingFile ? value : null;
  const displayPath = pending ? pending.file.name : (value || '');
  const preview = useMemo(() => pending ? URL.createObjectURL(pending.file) : null, [pending]);
  const showsVideo = isVideo(pending ? pending.file.name : value);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pick = (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';        // picking the same file twice must still fire
    if (!file) return;

    // Keep the bytes in the form. FormModal uploads them only after Save is
    // pressed, so closing or cancelling the dialog never creates an orphan.
    onChange({ __pendingFile: true, file: file, folder: folder || 'misc' });
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
            /*
              * A FILM SHOWS ITS FIRST FRAME, muted and never played. It is
              * loaded `preload="metadata"`, so the thumbnail costs a few
              * kilobytes rather than the whole advert, and it has no
              * lightbox on it - ImagePreview opens a picture, and a sixty
              * megabyte video is not a thing to open by accident.
              */
            showsVideo ? (
              <Box
                as="video"
                src={pending ? preview : fileUrl(value)}
                muted
                playsInline
                preload="metadata"
                w="100%"
                h="100%"
                sx={{ objectFit: 'cover' }}
              />
            ) : pending ? (
              <Image src={preview} alt="" w="100%" h="100%" objectFit="cover" />
            ) : (
              <ImagePreview path={value} w="100%" h="100%">
                <Image src={fileUrl(value)} alt="" w="100%" h="100%" objectFit="cover" />
              </ImagePreview>
            )
          ) : (
            <Icon as={MdImage} w="1.25rem" h="1.25rem" color={surface.muted} />
          )}
        </Flex>

        <Box flex="1" minW="0">
          <Input
            fontSize="sm" h="2.25rem"
            placeholder="/uploads/…"
            value={displayPath}
            isReadOnly={isDisabled}
            onChange={(e) => onChange(e.target.value)}
          />

          <Flex gap="0.375rem" data-gap="6" mt="0.375rem">
            <Button
              size="xs" h="1.75rem" variant="subtle"
              leftIcon={<Icon as={MdCloudUpload} w="0.8125rem" h="0.8125rem" />}
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
            {t(allowsVideo ? 'form.uploadMediaHint' : 'form.uploadHint')}
          </Text>
        </Box>
      </Flex>

      <input
        ref={inputRef}
        type="file"
        accept={allowsVideo ? MEDIA_ACCEPT : ACCEPT}
        style={{ display: 'none' }}
        onChange={pick}
      />
    </Box>
  );
}
