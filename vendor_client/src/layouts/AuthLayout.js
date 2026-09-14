import React from 'react';
import { Box, Flex, useColorModeValue } from '@chakra-ui/react';
import AuthRoute from 'routes/AuthRoute';
import ColorModeToggle from 'components/ColorMode/ColorModeToggle';

/**
 * Shell for the signed-out pages.
 *
 * The previous version rendered the route first and then an absolutely
 * positioned background box AFTER it. Later siblings paint on top, so the
 * background sat over the page it was meant to sit behind, and the login
 * card was only visible because it carried a `zIndex="2"` to climb back
 * out. The background is a layer at index 0 now and the content a layer
 * above it, so neither has to fight the other.
 *
 * The backdrop itself is drawn rather than loaded: two soft brand-tinted
 * radial washes on the page colour. The old bg-dark.png was a dark image
 * held at 0.9 opacity under a white card, which is why the light theme
 * looked muddy - and it was a 150KB request for a blur.
 */
const AuthLayout = () => {
  const pageBg = useColorModeValue('secondaryGray.300', 'navy.900');
  const washOne = useColorModeValue('rgba(117, 81, 255, 0.16)', 'rgba(117, 81, 255, 0.22)');
  const washTwo = useColorModeValue('rgba(66, 42, 251, 0.10)', 'rgba(66, 42, 251, 0.16)');

  return (
    <Flex position="relative" w="100%" minH="100vh" bg={pageBg} overflow="hidden">
      <Box
        position="absolute"
        top="0"
        left="0"
        w="100%"
        h="100%"
        zIndex={0}
        bgImage={`radial-gradient(circle at 18% 12%, ${washOne} 0%, transparent 42%),
                  radial-gradient(circle at 82% 78%, ${washTwo} 0%, transparent 46%)`}
        pointerEvents="none"
      />

      <Box position="absolute" top="16px" right="20px" zIndex={2}>
        <ColorModeToggle />
      </Box>

      <Flex position="relative" zIndex={1} w="100%" minH="100vh">
        <AuthRoute />
      </Flex>
    </Flex>
  );
}

export default AuthLayout;
