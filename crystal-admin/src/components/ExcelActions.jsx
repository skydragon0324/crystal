import React, { useRef, useState } from 'react';
import {
  Button, Icon, Flex, Text, Box, useToast, useDisclosure,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  ModalCloseButton, Table, Thead, Tbody, Tr, Th, Td, useColorModeValue
} from '@chakra-ui/react';
import { MdFileDownload, MdFileUpload } from 'react-icons/md';
import client from '../api/client';
import { useI18n } from '../i18n';

/**
 * Export / import pair for the screens that exchange spreadsheets.
 *
 *   resource  the api module -> its /export and /import endpoints
 *   params    the current filter, so the export matches what is on screen
 *
 * Import errors come back as a per-row list; they are shown in a table rather
 * than as one toast, because "3 rows could not be imported" is useless without
 * knowing which three.
 */
export default function ExcelActions({
  resource, params, filename, onImported, canWrite, exportOnly, size
}) {
  const toast = useToast();
  const { t } = useI18n();
  const fileRef = useRef(null);
  const errorModal = useDisclosure();

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [errors, setErrors] = useState([]);

  const borderColor = useColorModeValue('secondaryGray.100', 'whiteAlpha.100');

  const runExport = async () => {
    setExporting(true);
    try {
      /*
       * The response interceptor hands back { data } for every call, and for
       * a blob request `data` is the blob itself - see api/client.js, which
       * deliberately skips its JSON check when responseType says otherwise.
       */
      const { data: blob } = await client.get(resource.base + '/export', {
        params: params || {},
        responseType: 'blob'
      });

      // The download is driven from a blob URL rather than by pointing the
      // browser at the endpoint: the request needs the Authorization header,
      // which a plain link cannot send.
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || 'export.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: e.message, status: 'error', duration: 5000, isClosable: true });
    } finally {
      setExporting(false);
    }
  };

  const runImport = async (event) => {
    const file = event.target.files && event.target.files[0];
    // Clearing the input first means picking the same file twice still fires.
    event.target.value = '';
    if (!file) return;

    setImporting(true);
    setErrors([]);
    try {
      const form = new FormData();
      form.append('file', file);

      /*
       * Content-Type is cleared rather than set: the browser has to write the
       * multipart boundary itself, and it cannot if the header is already
       * there.  This is the same trick api/index.js uses for image uploads.
       */
      const { data: result } = await client.post(resource.base + '/import', form, {
        headers: { 'Content-Type': undefined }
      });

      toast({
        title: t('excel.imported', {
          created: ((result && result.created) || 0) + ((result && result.restored) || 0),
          updated: (result && result.updated) || 0
        }),
        status: 'success',
        duration: 4000
      });
      if (onImported) onImported(result);
    } catch (e) {
      if (e.detail && e.detail.length) {
        setErrors(e.detail);
        errorModal.onOpen();
      } else {
        toast({ title: e.message, status: 'error', duration: 6000, isClosable: true });
      }
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <Flex gap="0.625rem" data-gap="10">
        <Button
          variant="subtle" size={size} fontSize="sm" fontWeight="500"
          borderRadius="4.375rem" px="1.125rem" h="2.5rem"
          leftIcon={<Icon as={MdFileDownload} w="1rem" h="1rem" />}
          isLoading={exporting}
          onClick={runExport}
        >
          {t('excel.export')}
        </Button>

        {canWrite && !exportOnly ? (
          <>
            <Button
              variant="subtle" size={size} fontSize="sm" fontWeight="500"
              borderRadius="4.375rem" px="1.125rem" h="2.5rem"
              leftIcon={<Icon as={MdFileUpload} w="1rem" h="1rem" />}
              isLoading={importing}
              onClick={() => fileRef.current && fileRef.current.click()}
            >
              {t('excel.import')}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              style={{ display: 'none' }}
              onChange={runImport}
            />
          </>
        ) : null}
      </Flex>

      <Modal isOpen={errorModal.isOpen} onClose={errorModal.onClose} isCentered size="lg">
        <ModalOverlay />
        <ModalContent borderRadius="1.25rem">
          <ModalHeader>{t('excel.importRejected')}</ModalHeader>
          <ModalCloseButton _focus={{ boxShadow: 'none' }} />
          <ModalBody pb="0.5rem">
            <Text fontSize="sm" color="secondaryGray.600" mb="0.875rem">
              {t('excel.rejectedHint')}
            </Text>
            <Box maxH="20rem" overflowY="auto">
              <Table size="sm" variant="horizon">
                <Thead>
                  <Tr>
                    <Th borderColor={borderColor} w="5rem">{t('excel.row')}</Th>
                    <Th borderColor={borderColor}>{t('excel.problem')}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {errors.map((e, i) => (
                    <Tr key={i}>
                      <Td borderColor={borderColor} fontWeight="700" fontSize="sm">{e.row}</Td>
                      <Td borderColor={borderColor} fontSize="sm">{e.message}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
          </ModalBody>
          <ModalFooter>
            <Button variant="subtle" borderRadius="1rem" fontSize="sm" onClick={errorModal.onClose}>
              {t('common.close')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
