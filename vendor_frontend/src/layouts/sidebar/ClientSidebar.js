import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useHistory } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { Box, Button, Collapse, Flex, Icon, IconButton, Image, Stack, Text, Tooltip, useColorModeValue } from '@chakra-ui/react';
import { FiArrowLeft, FiChevronDown, FiChevronUp, FiLogOut, FiUser } from 'react-icons/fi';
import { Scrollbars } from 'react-custom-scrollbars';
import { renderTrack, renderThumbLight, renderThumbDark, renderView } from 'components/Scrollbar/Scrollbar';
import { HSeparator } from 'components/Separator/Separator';
import IconBox from 'components/Icons/IconBox';
import { logout } from 'store/slices/clientSlice';
import { getClientMenus } from 'constants/clientMenus';
import { getAccountMenus } from 'constants/accountMenus';
import { getLangText } from 'lang/lang';
import useLang from 'lang/useLang';
import { PAGE_ACCOUNT_URL_PREFIX, PAGE_HOME_URL } from 'constants/constants';

import icLogoDark from 'assets/images/logo_dark.png';
import icLogoWhite from 'assets/images/logo_white.png';

const ClientSidebar = () => {
  const { user } = useSelector((state) => state.client);
  const dispatch = useDispatch();
  const history = useHistory();
  const location = useLocation();
  const { pathname } = location;
  const [openKeys, setOpenKeys] = useState([]);
  const [isAccount, setIsAccount] = useState(false);
  const { locale } = useLang();
  const icLogo = useColorModeValue(icLogoDark, icLogoWhite);
  const inactiveColor = useColorModeValue("var(--chakra-colors-gray-400)", "var(--chakra-colors-gray-400)");

  // The menus are translated, so they are rebuilt when the language moves
  // and at no other time.
  const clientMenus = useMemo(getClientMenus, [locale]);
  const accountMenus = useMemo(getAccountMenus, [locale]);

  useEffect(() => {
    const categories = [...clientMenus, ...accountMenus].map(item => item.category?.path).filter(item => !!item);
    const key = categories.find(item => pathname.startsWith(item));
    if (key) {
      setOpenKeys([key]);
    }
    if (pathname.startsWith(PAGE_ACCOUNT_URL_PREFIX)) {
      setIsAccount(true);
    }
  }, [pathname, clientMenus, accountMenus]);

  const handleClickCategory = (catPath) => {
    if (openKeys && openKeys.includes(catPath)) {
      setOpenKeys(openKeys.filter(item => item !== catPath));
    } else {
      setOpenKeys([...openKeys, catPath ]);
    }
  }

  const handleLogin = () => {
    history.push("/vendor/auth/reganam");
  }

  const handleLogout = () => {
    dispatch(logout());
    history.push(PAGE_HOME_URL);
  }

  const visitAccountPage = () => {
    history.push("/vendor/account/eshop/orders");
  }

  return (
    <Scrollbars
      autoHide
      renderTrackVertical={renderTrack}
      renderThumbVertical={useColorModeValue(renderThumbLight, renderThumbDark)}
      renderView={renderView}
    >
      <Box display={{ base: "block", xl: "none" }} pt="25px" mb="12px">
        <Stack direction="row" spacing="12px" align="center" justify="center">
          <NavLink to={PAGE_HOME_URL}>
            <Image src={icLogo} alt="" w="full" h="auto" />
          </NavLink>
        </Stack>
        <HSeparator my="20px" />
      </Box>
      <Stack direction="column" mb="40px" py={{ base: "25px", xl: "" }} pr="4px">
        {user && isAccount ? (
          <Flex display={{ base: "flex", xl: "none" }} align="center" ps={{ sm: "10px", xl: "16px" }} pe="2px">
            <Tooltip label={getLangText("MENU_MAINMENU")} hasArrow placement="top">
              <IconButton variant="outline" colorScheme="blue" icon={<FiArrowLeft />} onClick={() => setIsAccount(false)} />
            </Tooltip>
            <Text fontWeight="bold" ms="12px">{getLangText("MENU_MAINMENU")}</Text>
          </Flex>
        ) : user && !isAccount ? (
          <Flex align="center" justify="space-between" ps={{ sm: "10px", xl: "16px" }} pe="2px" cursor="pointer" onClick={visitAccountPage}>
            <Flex align="center">
              <IconBox
                h="30px"
                w="30px"
              >
                <FiUser fontSize="24px" />
              </IconBox>
              <Flex direction="column" ms="12px">
                <Text fontWeight="bold">{user.user_name}</Text>
                <Text fontSize="sm">{user.user_id}</Text>
              </Flex>
            </Flex>
            <Tooltip label={getLangText("MENU_LOGOUT")} hasArrow placement="top">
              <IconButton variant="outline" colorScheme="blue" icon={<FiLogOut />} onClick={handleLogout} />
            </Tooltip>
          </Flex>
        ) : (
          <Button
            boxSize="initial"
            justifyContent="flex-start"
            alignItems="center"
            bg="transparent"
            mb={{ xl: "6px" }}
            mx={{ xl: "auto" }}
            py="8px"
            ps={{ sm: "10px", xl: "16px" }}
            borderRadius="15px"
            _hover="none"
            w="100%"
            _active={{ bg: "inherit", transform: "none", borderColor: "transparent" }}
            _focus={{ boxShadow: "none"}}
            onClick={handleLogin}
          >
            <Text color={inactiveColor} my="auto" fontWeight="bold">{getLangText("MENU_LOGIN")}</Text>
          </Button>
        )}
        {user && isAccount ? accountMenus.map((menuGroup, grpIndex) => (
          <FullMenus
            key={`menu-group-${grpIndex}`}
            category={menuGroup.category}
            menus={menuGroup.menus}
            pathname={pathname}
            open={openKeys.includes(menuGroup.category?.path)}
            onClickCategory={handleClickCategory}
          />
        )) : clientMenus.map((menuGroup, grpIndex) => (
          <FullMenus
            key={`menu-group-${grpIndex}`}
            category={menuGroup.category}
            menus={menuGroup.menus}
            pathname={pathname}
            open={openKeys.includes(menuGroup.category?.path)}
            onClickCategory={handleClickCategory}
          />
        ))}
      </Stack>
    </Scrollbars>
  );
}

const FullMenus = (props) => {
  const { category, menus, pathname, open, onClickCategory } = props;
  const activeColor = useColorModeValue("var(--chakra-colors-gray-700)", "white");

  return (
    <Box>
      {!!category ? (
        <Flex
          align="center"
          justify="space-between"
          mb={{ xl: "6px" }}
          mx="auto"
          ps={{ sm: "10px", xl: "16px" }}
          py="8px"
          cursor="pointer"
          onClick={() => onClickCategory(category.path)}
        >
          <Text
            color={activeColor}
            fontWeight="bold"
          >
            {category.name}
          </Text>
          <Flex align="center">
            {open ? (
              <FiChevronUp />
            ) : (
              <FiChevronDown />
            )}
          </Flex>
        </Flex>
      ) : menus && menus.map((menu, index) => (
        <SideMenu
          key={`menu-${index}`}
          icon={menu.icon}
          name={menu.name}
          path={menu.path}
          active={menu.path === pathname}
          level={category ? 1 : 0}
        />
      ))}
      <Collapse in={open} animateOpacity>
        {menus && menus.map((menu, index) => (
          <SideMenu
            key={`menu-${index}`}
            icon={menu.icon}
            name={menu.name}
            path={menu.path}
            active={menu.path === pathname}
          />
        ))}
      </Collapse>
    </Box>
  );
}

const SideMenu = (props) => {
  const { icon, name, path, active = false, level = 1 } = props;
  const activeBg = useColorModeValue("white", "navy.700");
  const inactiveBg = useColorModeValue("white", "navy.700");
  const activeColor = useColorModeValue("var(--chakra-colors-gray-700)", "white");
  const inactiveColor = useColorModeValue("var(--chakra-colors-gray-400)", "var(--chakra-colors-gray-400)");
  const variantChange = "0.2s linear";

  return (
    <NavLink to={path}>
      {active ? (
        <Button
          boxSize="initial"
          justifyContent="flex-start"
          alignItems="center"
          boxShadow="0px 7px 11px rgba(0, 0, 0, 0.04)"
          bg={activeBg}
          transition={variantChange}
          mb={{ xl: "6px" }}
          mx={{ xl: "auto" }}
          ps={{ sm: "10px", xl: "16px" }}
          py="8px"
          borderRadius="15px"
          _hover="none"
          w="100%"
          _active={{ bg: "inherit", transform: "none", borderColor: "transparent" }}
          _focus={{ boxShadow: "0px 7px 11px rgba(0, 0, 0, 0.04)" }}
        >
          <Flex align="center" justify="space-between" width="100%">
            <Flex align="center" h="30px">
              {typeof icon === "string" ? (
                <Icon>{icon}</Icon>
              ) : !!icon ? (
                <IconBox
                  bg="blue.500"
                  color="white"
                  h="30px"
                  w="30px"
                  transition={variantChange}
                >{icon}</IconBox>
              ) : ""}
              <Text color={activeColor} ms={level === 1 ? "12px" : ""} my="auto" fontSize={level === 1 ? "sm" : ""} fontWeight={level === 1 ? "" : "bold"}>{name}</Text>
            </Flex>
          </Flex>
        </Button>
      ) : (
        <Button
          boxSize="initial"
          justifyContent="flex-start"
          alignItems="center"
          bg="transparent"
          mb={{ xl: "6px" }}
          mx={{ xl: "auto" }}
          py="8px"
          ps={{ sm: "10px", xl: "16px" }}
          borderRadius="15px"
          _hover="none"
          w="100%"
          _active={{ bg: "inherit", transform: "none", borderColor: "transparent" }}
          _focus={{ boxShadow: "none"}}
        >
          <Flex align="center" justify="space-between" width="100%">
            <Flex align="center" h="30px">
              {typeof icon === "string" ? (
                <Icon>{icon}</Icon>
              ) : !!icon ? (
                <IconBox
                  bg={inactiveBg}
                  color="blue.500"
                  h="30px"
                  w="30px"
                  transition={variantChange}
                >{icon}</IconBox>
              ) : ""}
              <Text color={inactiveColor} ms={level === 1 ? "12px" : ""} my="auto" fontSize={level === 1 ? "sm" : ""} fontWeight={level === 1 ? "" : "bold"}>{name}</Text>
            </Flex>
          </Flex>
        </Button>
      )}
    </NavLink>
  );
}

export default ClientSidebar;
