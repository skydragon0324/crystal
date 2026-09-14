import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Box, Flex } from '@chakra-ui/react';
import Header from './Header';
import Footer from './Footer';
import CompareTray from '@/components/product/CompareTray';
import ScrollToTop from './ScrollToTop';
import NoticeDialog from './NoticeDialog';
import { useSurface } from '@/theme/tokens';

/**
 * The site chrome.
 *
 * EVERY route goes inside this, including the whole account area. When the
 * account routes sat outside it the signed-in half of the site had no primary
 * menu, no search and, on a phone, no navigation at all. Account routes wrap
 * additionally in AccountLayout; they do not move back out of this one.
 */
export default function Layout({ children }) {
  const surface = useSurface();
  const location = useLocation();

  // A router push keeps the scroll position, which lands a visitor halfway
  // down a page they have not seen.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <Flex direction="column" minH="100vh" bg={surface.page}>
      <Header />
      <Box as="main" flex="1">
        {children}
      </Box>
      <Footer />
      <CompareTray />
      <ScrollToTop />

      {/*
        The arrival notice, mounted once in the layout rather than per page:
        it greets a VISIT, not a route, so navigating within the site must not
        raise it again.
      */}
      <NoticeDialog />
    </Flex>
  );
}
