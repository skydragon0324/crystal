import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Box, Flex } from '@chakra-ui/react';
import { useDispatch, useSelector } from 'react-redux';
import ClientHeader from './header/ClientHeader';
import ClientFooter from './footer/ClientFooter';
import AccountLayout from './AccountLayout';
import ClientRoute from 'routes/ClientRoute';
import Loader from 'components/Loader/Loader';
import { authRequest } from 'store/slices/clientSlice';
import { PAGE_ACCOUNT_URL_PREFIX } from 'constants/constants';

/**
 * Page shell: header, content, footer.
 *
 * Three things changed from the previous version.
 *
 * The header was rendered inside a <Portal>, which moves it to
 * document.body and out of this layout's flow. It was then absolutely
 * positioned and the content below was pushed down with a hard-coded
 * `pt="95px"`. Any change to the header height silently broke that
 * padding. The header is a sticky element in normal flow now, so it
 * reserves its own space and no magic number is needed.
 *
 * `isAccount` was tracked in state and set from an effect, which meant the
 * first render after a route change used the previous route's value and
 * flashed the wrong layout. It is derived during render instead.
 *
 * The footer was never mounted at all. A column flex with `minH="100vh"`
 * and `flex="1"` on the content keeps it at the bottom of short pages
 * without pinning it over long ones.
 *
 * This layout also used to force `setColorMode('light')` from an effect on
 * every mount, which made dark mode unreachable: the toggle would set it
 * and this would immediately set it back. The mode is the visitor's now,
 * persisted by Chakra and applied before first paint in index.js.
 */
const ClientLayout = () => {
  const dispatch = useDispatch();
  const { pathname } = useLocation();
  const { loading, user } = useSelector((state) => state.client);

  useEffect(() => {
    dispatch(authRequest());
  }, [dispatch]);

  const isAccount = !!user && pathname.startsWith(PAGE_ACCOUNT_URL_PREFIX);

  return (
    <Flex direction="column" minH="100vh">
      <ClientHeader />

      <Box as="main" flex="1" w="100%">
        {loading ? (
          <Loader size="xl" />
        ) : (
          <>
            <ClientRoute />
            {isAccount && <AccountLayout />}
          </>
        )}
      </Box>

      <ClientFooter />
    </Flex>
  );
};

export default ClientLayout;
