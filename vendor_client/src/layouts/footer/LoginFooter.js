import React from 'react';
import { Flex, Text } from '@chakra-ui/react';
import { getLangText } from 'lang/lang';

const LoginFooter = () => {
  return (
    <Flex
      flexDirection={{
        base: "column",
        xl: "row",
      }}
      alignItems={{
        base: "center",
        xl: "start",
      }}
      justifyContent="center"
      px="30px"
      pb="20px">
      <Text
        color="whiteAlpha.600"
        textAlign={{
          base: "center",
          xl: "start",
        }}
        mb={{ base: "20px", xl: "0px" }}>
        &copy; {1900 + new Date().getYear()},{" "}
        <Text as="span">
          {getLangText("COMPANY_NAME")}
        </Text>
      </Text>
    </Flex>
  );
}

export default LoginFooter;
