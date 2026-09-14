import React from 'react';
import { Box, Flex, Icon, Text, useColorModeValue } from '@chakra-ui/react';
import { FiChevronRight } from 'react-icons/fi';

const AppMenuItem = (props) => {
  const { icon, title, description, value, rightArrow = false, ...rest } = props;
  const dividerColor = useColorModeValue("var(--chakra-colors-gray-200)", "var(--chakra-colors-gray-600)");

  return (
    <Flex direction="row" align="center" cursor={rest.onClick ? "pointer" : ""} {...rest}>
      {icon && (
        <Icon as={icon} w="20px" h="20px" ml="8px" mr="18px" />
      )}
      <Flex w="full" direction="column" pt="12px">
        <Flex w="full" direction="row" align="center" justify="space-between">
          <Flex direction="column">
            <Text fontSize="sm">{title || ""}</Text>
            {description && (
              <Text>{description}</Text>
            )}
          </Flex>
          <Flex direction="row">
            {value && (
              <Text whiteSpace="nowrap" ms="8px" me={rightArrow ? "0px" : "8px"}>{value}</Text>
            )}
            {rightArrow && (
              <Icon as={FiChevronRight} w="20px" h="20px" ms="8px" />
            )}
          </Flex>
        </Flex>
        <Box w="full" h="1px" bgColor={dividerColor} mt="12px" />
      </Flex>
    </Flex>
  );
}

export default AppMenuItem;
