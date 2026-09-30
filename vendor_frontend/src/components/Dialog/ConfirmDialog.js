import React, { useRef } from 'react';
import { AlertDialog, AlertDialogBody, AlertDialogCloseButton, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogOverlay, Button } from '@chakra-ui/react';

const ConfirmDialog = (props) => {
  const { isOpen, onClose, maxW, title = "", closeButton = false, description, primaryText = "", primaryAction, primaryColor, secondaryText = "", secondaryAction, secondaryColor, loading, ...rest } = props;
  const cancelRef = useRef();
  const okRef = useRef();

  return (
    <AlertDialog
      motionPreset="slideInBottom"
      leastDestructiveRef={!!secondaryText ? okRef : cancelRef}
      isCentered
      isOpen={isOpen}
      onClose={onClose}
      {...rest}
    >
      <AlertDialogOverlay />
      <AlertDialogContent maxW={maxW}>
        {!!title && (
          <AlertDialogHeader fontSize="lg" fontWeight="bold">
            {title}
          </AlertDialogHeader>
        )}
        {closeButton && (
          <AlertDialogCloseButton />
        )}
        <AlertDialogBody mt={!!title ? "" : "3"}>
          {description || ""}
        </AlertDialogBody>

        <AlertDialogFooter>
          {!!secondaryText && (
            <Button ref={cancelRef} onClick={secondaryAction || onClose} colorScheme={secondaryColor}>
              {secondaryText}
            </Button>
          )}
          {!!primaryText && (
            <Button ref={okRef} onClick={primaryAction} colorScheme={primaryColor} ml={3} disabled={loading}>
              {primaryText}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default ConfirmDialog;
