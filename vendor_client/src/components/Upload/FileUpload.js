import React, { createRef, useState } from 'react';
import { Box, Button, Input, Text, useColorModeValue } from '@chakra-ui/react';

const FileUpload = (props) => {
  const { onFileSelect, accept, multiple } = props;
  const [selectedFiles, setSelectedFiles] = useState([]);
  const fileInputRef = createRef();
  const bgColor = useColorModeValue("var(--chakra-colors-gray-200)", "var(--chakra-colors-gray-700)");
  const hoverColor = useColorModeValue("gray.300", "var(--chakra-colors-gray-600)");

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    setSelectedFiles(files);
    onFileSelect && onFileSelect(files);
  }

  const handleClick = () => {
    fileInputRef.current.click();
  }

  return (
    <Box>
      <Button
        bg={bgColor}
        _hover={{ bg: hoverColor }}
        onClick={handleClick}
        mb={4}
      >
        Upload File(s)
      </Button>

      {/* Hidden file input */}
      <Input
        type="file"
        ref={fileInputRef}
        display="none"
        onChange={handleFileChange}
        accept={accept} // e.g., accept=".png, .jpg, .jpeg, .pdf"
        multiple={multiple} // Enable multiple file selection
      />

      {/* Display selected file names */}
      {selectedFiles.length > 0 && (
        <Box mt={2}>
          <Text fontSize="sm" fontWeight="bold">Selected file(s):</Text>
          {selectedFiles.map((file, index) => (
            <Text key={index} fontSize="sm">
              {file.name}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  )
}

export default FileUpload;
