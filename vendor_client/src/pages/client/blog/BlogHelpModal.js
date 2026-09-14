import React, { useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { AlertDialog, AlertDialogBody, AlertDialogCloseButton, AlertDialogContent, AlertDialogHeader, AlertDialogOverlay, Box, Button, Flex, Text } from '@chakra-ui/react';
import { getLangText } from 'lang/lang';

const BlogHelpModal = (props) => {
  const { isOpen, onClose, title = "", article, closeButton = true, onSave, ...rest } = props;
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
      <AlertDialogContent maxW="500px">
        {!!title && (
          <AlertDialogHeader fontSize="lg" fontWeight="bold">
            <Flex direction="column">
              <Text fontSize={"25px"} padding={"10px"}>{title}</Text>
              <Box h="1px" bgColor="#232323" />
            </Flex>
          </AlertDialogHeader>
        )}
        {closeButton && (
          <AlertDialogCloseButton />
        )}
        <AlertDialogBody mt={!!title ? "" : "3"}>
          <Flex direction={"column"}>
            <Text>{getLangText("BLOG_ASSIST_1")}</Text>
            <Text mt={"10px"}>{getLangText("BLOG_ASSIST_2")}</Text>
            <Text mt={"10px"}>{getLangText("BLOG_ASSIST_3")}</Text>
            <Text mt={"10px"}>{getLangText("BLOG_ASSIST_4")}</Text>
          </Flex>
          <Flex width={"100%"} justify={"end"}>
            <Button mr={"30px"} width={"80px"} ref={cancelRef} variant="light" fontSize="14px" onClick={onClose} _hover={{ bgColor: "red.200" }}>{getLangText("TEXT_CANCEL")}</Button>
            <NavLink to={"/vendor/blog/add/0"}>
              <Button width={"80px"} variant="dark" fontSize="14px" _hover={{ bgColor: "navy.500" }}>{getLangText("TEXT_OK")}</Button>
            </NavLink>
          </Flex>
        </AlertDialogBody>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default BlogHelpModal;
