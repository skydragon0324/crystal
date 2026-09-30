import React from 'react';
import { Box, Flex, useColorModeValue } from '@chakra-ui/react';
import ClientSidebar from './sidebar/ClientSidebar';
import AccountRoute from 'routes/AccountRoute';
import MainPanel from 'components/Layout/MainPanel';
import PanelContent from 'components/Layout/PanelContent';
import PanelContainer from 'components/Layout/PanelContainer';

const AccountLayout = () => {
  const sidebarBg = useColorModeValue("white", "navy.800");
  const sidebarBorder = useColorModeValue("gray.200", "whiteAlpha.200");
  const variantChange = "0.2s linear";

  return (
    <Flex justify={"space-between"}>
      <Box
        display={{ base: "none", xl: "block" }}
        bg={sidebarBg}
        transition={variantChange}
        w="260px"
        minW="260px"
        ms={{ sm: "16px" }}
        h="calc(100vh - 100px)"
        ps="20px"
        pe="20px"
        me="20px"
        // Hairline rule instead of a drop shadow, matching Card.
        borderRightWidth="1px"
        borderColor={sidebarBorder}
        borderRadius="0"
      >
        <ClientSidebar />
      </Box>
      <MainPanel
        mr="30px"
        padding={{
          base: "8px",
          md: "20px",
          xl: "0px",
        }}
        w={{
          base: "100%",
          xl: "calc(100% - 350px)",
        }}>
        <PanelContent>
          <PanelContainer>
            <Flex direction="column">
              <AccountRoute />
            </Flex>
          </PanelContainer>
        </PanelContent>
        {/* <ClientFooter /> */}
        {/* <Portal> */}
        {/* floating setting on bottom right */}
        {/* </Portal> */}
      </MainPanel>
    </Flex>
  );
}

export default AccountLayout;
