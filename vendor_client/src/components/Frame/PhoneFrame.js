import React, { useRef, useState, useEffect } from 'react';
import { Box, Image } from '@chakra-ui/react';
import CustomScrollbar from 'components/Scrollbar/CustomScrollbar';
import imgPhone from 'assets/images/phone.png';

const PhoneFrame = ({ hasScroll = true, children }) => {
  const containerRef = useRef(null);
  const [maxHeight, setMaxHeight] = useState('unset');

  useEffect(() => {
    const updateMaxHeight = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth;
        setMaxHeight(`${width * 1.85}px`);
      }
    };

    updateMaxHeight();
    window.addEventListener('resize', updateMaxHeight);

    return () => {
      window.removeEventListener('resize', updateMaxHeight);
    };
  }, []);

  return (
    <Box maxW="320px" position="relative" ref={containerRef} mx="auto">
      <Image
        w="full"
        src={imgPhone}
        alt="Phone Frame"
        objectFit="cover"
        position="absolute"
        userSelect="none"
        draggable={false}
        zIndex={-1}
      />
      <Box padding="8% 3% 6% 3%">
        <Box borderRadius="24px" overflow="hidden">
          {hasScroll ? (
            <CustomScrollbar maxH={maxHeight}>{children}</CustomScrollbar>
          ) : (
            <Box maxH={maxHeight}>
              {children}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default PhoneFrame;
