import React, { useRef } from 'react';
import { AlertDialog, AlertDialogBody, AlertDialogCloseButton, AlertDialogContent, AlertDialogHeader, AlertDialogOverlay, Button, Flex, Image, SimpleGrid, Text } from '@chakra-ui/react';
import { hexToBase64, getAppstoreUrl } from 'utils/utils';
import { getLangText } from 'lang/lang';

const ViewAppstoreLicenseQrModal = (props) => {
  const { isOpen, onClose, title = "", deviceLicense, closeButton = true, onSave, ...rest } = props;
  const cancelRef = useRef();

  return (
    <AlertDialog
      motionPreset="slideInBottom"
      leastDestructiveRef={cancelRef}
      isCentered
      closeOnOverlayClick={false}
      isOpen={isOpen}
      onClose={onClose}
      {...rest}
    >
      <AlertDialogOverlay />
      <AlertDialogContent>
        {!!title && (
          <AlertDialogHeader fontSize="lg" fontWeight="bold">
            {title}
          </AlertDialogHeader>
        )}
        {closeButton && (
          <AlertDialogCloseButton />
        )}
        <AlertDialogBody mt={!!title ? "" : "3"}>
          {deviceLicense?.qr ? (
            <Flex direction="column">
              <Flex align="center" justify="center">
                <Image w="300px" h="300px" src={`data:image/jpg; base64,${hexToBase64(deviceLicense.qr)}`} alt="" />
              </Flex>
              <SimpleGrid columns={{ base: 1, lg: 2 }} spacing="12px" mt="24px" mb="12px">
                <a href={getAppstoreUrl(`/download/licenses/${deviceLicense.license_file_url}/${deviceLicense.license_file}`)} target="_blank" rel="noreferrer">
                  <Button w="full" variant="light" fontSize="14px">{getLangText("APPSTORE_DOWNLOAD_LICENSE")}</Button>
                </a>
                <a href={getAppstoreUrl(`/download/license/qrimage/${deviceLicense.purchase_history_unique_id}`)} target="_blank" rel="noreferrer">
                  <Button w="full" variant="dark" fontSize="14px">{getLangText("APPSTORE_SAVE_LICENSE")}</Button>
                </a>
              </SimpleGrid>
            </Flex>
          ) : deviceLicense?.license ? (
            <Flex direction="column">
              <Text my="24px" textAlign="center">{deviceLicense.license}</Text>
              <Button ref={cancelRef} variant="light" fontSize="14px" onClick={onClose}>{getLangText("TEXT_OK")}</Button>
            </Flex>
          ) : ""}
        </AlertDialogBody>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default ViewAppstoreLicenseQrModal;
