import React, { createRef, useState } from 'react';
import { Box, Button, Flex, IconButton, Image as ChakraImage, Input, Text, Tooltip, useColorModeValue } from '@chakra-ui/react';
import { FiTrash2, FiUpload } from 'react-icons/fi';
import { getFileUrl } from 'utils/utils';
import { getLangText } from 'lang/lang';

const SingleUpload = ({ onFileSelect, accept, disabled, path, file_name, type = "none", onRemovePath }) => {
  const [selectedFile, setSelectedFile] = useState();
  const [preview, setPreview] = useState(null);
  const fileInputRef = createRef();

  const borderColor = useColorModeValue("var(--chakra-colors-gray-200)", "var(--chakra-colors-whiteAlpha-300)");
  const textColor = useColorModeValue("gray.800", "whiteAlpha.900");
  const iconColor = useColorModeValue("var(--chakra-colors-gray-700)", "var(--chakra-colors-gray-200)");

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setSelectedFile(file);

    // Generate image preview
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result);
      };
      reader.readAsDataURL(file);

      const imageToLoad = new Image();
      imageToLoad.src = window.URL.createObjectURL(file);
      imageToLoad.onload = () => {
        const ratio = imageToLoad.height / imageToLoad.width;
        onFileSelect && onFileSelect(file, ratio);
      }
    } else {
      setPreview(null);
      onFileSelect && onFileSelect(file, 0);
    }
  };

  const handleClick = () => {
    fileInputRef.current.click();
  };

  const handleDelete = () => {
    setSelectedFile(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <Box>
      {/* Upload Button */}
      <Button
        w="full"
        variant="outline"
        onClick={handleClick}
        disabled={disabled}
        display={!selectedFile && !path ? "block" : "none"}
      >
        <Flex justify="center">
          <FiUpload />
        </Flex>
      </Button>

      {/* Hidden File Input */}
      <Input
        type="file"
        ref={fileInputRef}
        visibility="hidden"
        position="absolute"
        onChange={handleFileChange}
        accept={accept || ".png, .jpg, .jpeg, .webp"}
        multiple={false}
      />

      {/* Display Selected File Preview */}
      {selectedFile && (
        <Flex w="full" h="40px" align="center" justify="space-between" border="1px solid" borderColor={borderColor} borderRadius="8px">
          <Flex align="center">
            {preview ? (
              <ChakraImage src={preview} alt="" borderRadius="8px" w="auto" maxH="38px" objectFit="cover" />
            ) : (
              <Text ml="12px" fontSize="sm" color={textColor}>{selectedFile.name}</Text>
            )}
          </Flex>
          <Tooltip label={getLangText("TEXT_DELETE")} hasArrow placement="top">
            <IconButton
              bg="inherit"
              borderRadius="inherit"
              _hover="none"
              _active={{ bg: "inherit", transform: "none", borderColor: "transparent" }}
              _focus={{ boxShadow: "none" }}
              icon={<FiTrash2 color={iconColor} w="16px" h="16px" />}
              disabled={disabled}
              onClick={handleDelete}
            />
          </Tooltip>
        </Flex>
      )}

      {/* Display File Path */}
      {path && (
        <Flex w="full" h="40px" align="center" justify="space-between" border="1px solid" borderColor={borderColor} borderRadius="8px">
          <Flex align="center">
            {type === "image" && (
              <ChakraImage src={getFileUrl(path)} alt="" borderRadius="8px" w="auto" maxH="38px" objectFit="cover" />
            )}
            <Text ml="12px" fontSize="sm" color={textColor}>{file_name}</Text>
          </Flex>
          <IconButton
            bg="inherit"
            borderRadius="inherit"
            _hover="none"
            _active={{ bg: "inherit", transform: "none", borderColor: "transparent" }}
            _focus={{ boxShadow: "none" }}
            icon={<FiTrash2 color={iconColor} w="16px" h="16px" />}
            disabled={disabled}
            onClick={onRemovePath}
          />
        </Flex>
      )}
    </Box>
  );
};

export default SingleUpload;
