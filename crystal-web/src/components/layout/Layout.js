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

  /*
   * A router push keeps the scroll position, which lands a visitor halfway
   * down a page they have not seen - so every navigation starts at the top.
   *
   * EXCEPT A MOVE WITHIN ONE PAGE. Some pages put their tabs on routes of
   * their own, so that a tab can be linked to and bookmarked: a product's
   * specification, gallery, pricing and software history are four addresses
   * of one product page. Those are navigations to the router and tab clicks
   * to the reader, and scrolling to the top on one threw somebody who had
   * read half way down the specifications back to the hero image every time
   * they looked at another tab.
   *
   * A navigation says which it is by carrying `keepScroll` in its state -
   * see pages/common/ProductDetail.js. It is read off `location.state`, so
   * going BACK to such a tab does not jump either: the flag belongs to the
   * history entry, not to the click.
   */
  const keepScroll = !!(location.state && location.state.keepScroll);

  useEffect(() => {
    if (keepScroll) return;
    window.scrollTo(0, 0);
  }, [location.pathname, keepScroll]);

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
