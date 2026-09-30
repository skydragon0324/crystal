import React from 'react';
import { Box, Flex, Text, useColorModeValue } from '@chakra-ui/react';
import { formatNumber } from 'utils/utils';

const AppLogItem = (props) => {
  const { color, type, time, title, text1, text2, value, ...rest } = props;
  const dividerColor = useColorModeValue("var(--chakra-colors-gray-200)", "var(--chakra-colors-gray-600)");

  return (
    <Flex w="full" direction="column" cursor={rest.onClick ? "pointer" : ""} {...rest}>
      <Flex w="full" direction="row" align="center" pt="10px">
        <Flex w="80px" direction="column">
          <Text align="center" fontSize="14px" color={color} borderColor={color} borderWidth="1px" borderRadius="12px">
            {type}
          </Text>
          <Text fontSize="11px" lineHeight="12px" align="center" mt="4px">{time}</Text>
        </Flex>
        <Flex direction="column" flex={1} ml="8px">
          <Text fontSize="12px">{title || ""}</Text>
          <Text fontSize="14px" mt="6px">{text1 || ""}</Text>
          {text2 && (
            <Text fontSize="13px" color="#0a58f6">{text2}</Text>
          )}
        </Flex>
        <Text color="#e91e63" fontSize="14px" ml="8px">{formatNumber(value)}</Text>
      </Flex>
      <Box w="full" h="1px" bgColor={dividerColor} mt="10px" />
    </Flex>
  );
}

export default AppLogItem;
