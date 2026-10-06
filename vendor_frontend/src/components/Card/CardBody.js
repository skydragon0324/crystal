import React from 'react';
import { Box, useStyleConfig } from '@chakra-ui/react';

const CardBody = (props) => {
  const { variant, children, ...rest } = props;
  const styles = useStyleConfig("CardBody", { variant });

  // Pass the computed styles into the `__css` prop
  return (
    <Box __css={styles} {...rest}>
      {children}
    </Box>
  );
}

export default CardBody;
