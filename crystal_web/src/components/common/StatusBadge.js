import React from 'react';
import { Badge } from '@chakra-ui/react';
import { statusColor } from '@/theme/tokens';

export default function StatusBadge({ value, children, ...rest }) {
  if (!value) return null;
  return (
    <Badge
      colorScheme={statusColor(value)}
      borderRadius="6px"
      px="2"
      py="0.5"
      fontSize="xs"
      fontWeight="600"
      textTransform="none"
      {...rest}
    >
      {children || String(value).replace(/_/g, ' ').toLowerCase()}
    </Badge>
  );
}
