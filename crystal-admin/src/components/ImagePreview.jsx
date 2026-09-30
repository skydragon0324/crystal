import React, { useState } from 'react';
import {
  Box, Flex, Image, Link, Modal, ModalBody, ModalCloseButton, ModalContent,
  ModalHeader, ModalOverlay, Text, Tooltip
} from '@chakra-ui/react';
import { ExternalLinkIcon } from '@chakra-ui/icons';

import { fileUrl } from '../api/client';
import { useT } from '../i18n';
import { useSurface } from '../theme/tokens';

/**
 * A THUMBNAIL YOU CAN OPEN.
 *
 * Every picture in the console was drawn at the size of its table cell or its
 * form field - four rem by two and a half, or a 64px square - and nothing
 * opened it any larger. An advert is artwork with its copy burnt in, so a
 * thumbnail that size shows that there IS a picture and not whether it is the
 * RIGHT one: the wrong crop, a cut-off headline, last season's banner all look
 * the same at 64px. Clicking the thumbnail now opens the file itself.
 *
 * THE FILE, NOT A RE-RENDER. The dialog shows the stored image at its natural
 * size, scaled down only to fit the window, on a neutral chequered ground so a
 * transparent PNG or an SVG does not vanish into a white dialog. Its real
 * pixel size is read from the image once it has loaded, because the size an
 * editor believes they uploaded and the size that was stored are exactly the
 * thing worth checking. The path is there to copy, and the link opens the file
 * in a tab of its own for anything this dialog cannot show.
 *
 * Wraps whatever it is given as the thumbnail, so a table cell and a form field
 * keep their own sizes and styling; anything else passed (a width, a height) goes
 * on the clickable wrapper. With no path it renders the thumbnail alone and
 * opens nothing.
 */
export default function ImagePreview({ path, alt, title, children, ...boxProps }) {
  const t = useT();
  const surface = useSurface();

  const [open, setOpen] = useState(false);
  const [size, setSize] = useState(null);

  const src = path ? fileUrl(path) : null;

  if (!src) return children;

  const show = (event) => {
    /* A table row is clickable too; opening the picture must not also open the row. */
    event.stopPropagation();
    setSize(null);
    setOpen(true);
  };

  return (
    <>
      <Tooltip label={t('components.imagepreview.clickToEnlarge')} openDelay={400}>
        <Box
          as="button"
          type="button"
          onClick={show}
          aria-label={t('components.imagepreview.clickToEnlarge')}
          display="inline-block"
          lineHeight="0"
          borderRadius="md"
          cursor="zoom-in"
          _focus={{ outline: 'none', boxShadow: 'outline' }}
          {...boxProps}
        >
          {children}
        </Box>
      </Tooltip>

      <Modal isOpen={open} onClose={() => setOpen(false)} size="4xl" isCentered>
        <ModalOverlay />
        <ModalContent mx="1rem" maxH="calc(100vh - 2rem)">
          <ModalHeader fontSize="md" pr="3rem" noOfLines={1}>
            {title || alt || t('components.imagepreview.preview')}
          </ModalHeader>
          <ModalCloseButton />

          <ModalBody pb="1.25rem" overflow="auto">
            <Flex
              align="center"
              justify="center"
              borderRadius="md"
              border="1px solid"
              borderColor={surface.border}
              minH="12rem"
              /* A chequered ground, so transparency reads as transparency. */
              bgColor={surface.raised}
              backgroundImage="linear-gradient(45deg, rgba(128,128,128,0.12) 25%, transparent 25%, transparent 75%, rgba(128,128,128,0.12) 75%), linear-gradient(45deg, rgba(128,128,128,0.12) 25%, transparent 25%, transparent 75%, rgba(128,128,128,0.12) 75%)"
              backgroundSize="1.25rem 1.25rem"
              backgroundPosition="0 0, 0.625rem 0.625rem"
              p="0.75rem"
            >
              <Image
                src={src}
                alt={alt || ''}
                maxW="100%"
                maxH="calc(100vh - 14rem)"
                objectFit="contain"
                onLoad={(event) => {
                  /* Read before the state update: React 16 pools the event. */
                  const img = event.target;
                  setSize({ width: img.naturalWidth, height: img.naturalHeight });
                }}
              />
            </Flex>

            <Flex mt="0.75rem" align="center" justify="space-between" wrap="wrap" fontSize="xs" color={surface.muted}>
              <Text fontFamily="mono" wordBreak="break-all" me="1rem" mb="0.25rem">
                {path}
                {size ? '  ·  ' + size.width + ' × ' + size.height + ' px' : ''}
              </Text>
              <Link href={src} isExternal color="brand.500" fontWeight="600" mb="0.25rem">
                {t('components.imagepreview.openInNewTab')} <ExternalLinkIcon mx="0.125rem" />
              </Link>
            </Flex>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}
