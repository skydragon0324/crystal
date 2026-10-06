import React from 'react';
import { Flex, Text } from '@chakra-ui/react';
import { getLangText } from 'lang/lang';

const NoAuthSection = () => {
  return (
    <Flex align="center" justify="center" mt="20vh">
      <Text>{getLangText("TEXT_NO_AUTH")}</Text>
    </Flex>
  );
}

export default NoAuthSection;
