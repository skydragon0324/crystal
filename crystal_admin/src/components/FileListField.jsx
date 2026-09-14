import React, { useRef, useState } from 'react';
import {
  Box, Button, Flex, Icon, IconButton, Input, Link, Text, useToast
} from '@chakra-ui/react';
import { CloseIcon, ArrowUpIcon, ArrowDownIcon } from '@chakra-ui/icons';
import { MdAttachFile, MdCloudUpload } from 'react-icons/md';
import { media } from '../api';
import { fileUrl } from '../api/client';
import { useI18n } from '../i18n';
import { useSurface } from '../theme/tokens';

/** Images and PDFs, matching what the document endpoint will actually take. */
const ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp,image/gif';

/**
 * A row's attached documents, edited as a list.
 *
 * ImageField is the wrong shape for this: it holds ONE path and shows a
 * thumbnail of it, and what hangs off a published price is nought to three
 * certificates that are usually PDFs - which have no thumbnail and whose file
 * name is the only thing identifying them.
 *
 * The value is the array the API stores, `[{ file_path, file_name }]`, handed
 * back whole.  The server replaces the list rather than diffing it, so what
 * is on screen is exactly what will be saved - there is no pending-delete
 * state to get out of step with the rows.
 *
 * As in ImageField, the upload happens ON PICK rather than on save: the form
 * holds a string, not a pending File.  Abandoning the dialog therefore leaves
 * a file nothing references, which is the same trade made there.
 */
export default function FileListField({ value, folder, isDisabled, onChange }) {
  const { t } = useI18n();
  const toast = useToast();
  const surface = useSurface();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const list = Array.isArray(value) ? value : [];

  const replace = (next) => onChange(next);

  const pick = async (event) => {
    const files = Array.prototype.slice.call(event.target.files || []);
    event.target.value = '';            // picking the same file twice must still fire
    if (!files.length) return;

    setBusy(true);
    try {
      const added = [];
      // Sequential rather than Promise.all: these are uploads, and six at
      // once on a branch connection is how one of them times out.
      for (let i = 0; i < files.length; i += 1) {
        const { data } = await media.uploadDocument(folder || 'service', files[i]);
        added.push({ file_path: data.file_path, file_name: files[i].name });
      }
      replace(list.concat(added));
    } catch (err) {
      toast({ title: err.message, status: 'error', duration: 6000, isClosable: true });
    } finally {
      setBusy(false);
    }
  };

  const rename = (index, name) => replace(list.map((row, i) => (
    i === index ? Object.assign({}, row, { file_name: name }) : row
  )));

  const removeAt = (index) => replace(list.filter((row, i) => i !== index));

  /** Order is what the storefront lists them in, so it has to be editable. */
  const moveBy = (index, step) => {
    const next = list.slice();
    const target = index + step;
    if (target < 0 || target >= next.length) return;
    const held = next[index];
    next[index] = next[target];
    next[target] = held;
    replace(next);
  };

  return (
    <Box>
      {list.length ? (
        <Flex direction="column" gap="0.5rem" data-gap="8" data-gap-column mb="0.625rem">
          {list.map((row, index) => (
            <Flex
              key={row.file_path + '-' + index}
              align="center" gap="0.5rem" data-gap="8"
              p="0.5rem" borderRadius="0.5rem"
              bg={surface.raised} border="1px solid" borderColor={surface.border}
            >
              <Icon as={MdAttachFile} w="1rem" h="1rem" color={surface.muted} flexShrink={0} />

              <Input
                flex="1" minW="0" size="sm" h="1.875rem" fontSize="sm" variant="unstyled"
                placeholder={t('components.filelistfield.documentName')}
                value={row.file_name || ''}
                isReadOnly={isDisabled}
                onChange={(e) => rename(index, e.target.value)}
              />

              {/* The stored path is the only proof the upload landed, so it
                  stays visible and openable rather than being swallowed by
                  the name box above it. */}
              <Link
                href={fileUrl(row.file_path)} isExternal
                fontSize="0.6875rem" color={surface.muted} maxW="11.25rem" noOfLines={1}
                _hover={{ color: 'brand.500' }}
              >
                {row.file_path}
              </Link>

              {isDisabled ? null : (
                <Flex gap="2px" data-gap="2" flexShrink={0}>
                  <IconButton
                    aria-label={t('components.filelistfield.moveUp')} variant="quiet" size="xs"
                    icon={<ArrowUpIcon />} isDisabled={index === 0}
                    onClick={() => moveBy(index, -1)}
                  />
                  <IconButton
                    aria-label={t('components.filelistfield.moveDown')} variant="quiet" size="xs"
                    icon={<ArrowDownIcon />} isDisabled={index === list.length - 1}
                    onClick={() => moveBy(index, 1)}
                  />
                  <IconButton
                    aria-label={t('common.remove')} variant="quiet" size="xs" color="red.400"
                    icon={<CloseIcon w="0.5rem" h="0.5rem" />}
                    onClick={() => removeAt(index)}
                  />
                </Flex>
              )}
            </Flex>
          ))}
        </Flex>
      ) : (
        <Text fontSize="sm" color={surface.muted} mb="0.625rem">
          {t('components.filelistfield.noDocumentsAttached')}
        </Text>
      )}

      <Button
        size="xs" h="1.75rem" variant="subtle"
        leftIcon={<Icon as={MdCloudUpload} w="0.8125rem" h="0.8125rem" />}
        isLoading={busy}
        isDisabled={isDisabled}
        onClick={() => inputRef.current && inputRef.current.click()}
      >
        {t('components.filelistfield.attachDocuments')}
      </Button>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        style={{ display: 'none' }}
        onChange={pick}
      />
    </Box>
  );
}
