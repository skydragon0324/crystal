import React from 'react';
import { Flex, Spinner } from '@chakra-ui/react';

const Loader = ({ size = "xl", color = "blue.500", ...rest }) => {
  return (
    <Flex
      position="absolute"
      top="50%"
      left="50%"
      transform="translate(-50%, -50%)"
      {...rest}
    >
      <Spinner size={size} color={color} />
    </Flex>
  );
};

export default Loader;
