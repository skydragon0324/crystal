import React from 'react';
import { Box } from '@chakra-ui/react';
import { SITE_MAX_WIDTH } from 'constants/siteNav';

/**
 * The centred content column shared by the header, the footer and the page
 * body, so all three line up on the same left and right edges at every
 * width. Without a single owner for this, each section drifts by a few
 * pixels and the layout reads as slightly broken on wide screens.
 */
const SiteContainer = ({ children, ...rest }) => (
  <Box
    w="100%"
    maxW={SITE_MAX_WIDTH}
    mx="auto"
    px={{ base: '16px', md: '24px', lg: '20px' }}
    {...rest}
  >
    {children}
  </Box>
);

export default SiteContainer;
