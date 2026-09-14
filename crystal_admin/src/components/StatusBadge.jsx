import React from 'react';
import { Badge } from '@chakra-ui/react';

/**
 * A code, in the colour that says what it means.
 *
 * The palettes live here rather than in each screen because the same status
 * appears on the list, on the detail page and in the dashboard, and three
 * different greens for "closed" reads as three different states.
 */

const TICKET = {
  0: 'gray', 1: 'blue', 2: 'orange', 3: 'purple',
  4: 'cyan', 5: 'teal', 6: 'green', 7: 'green', 9: 'red'
};

const PAY = { 0: 'red', 1: 'orange', 2: 'green', 3: 'gray' };

const CLAIM = { 0: 'gray', 1: 'blue', 2: 'green', 3: 'red', 4: 'teal', 9: 'gray' };

const REPLENISHMENT = { 0: 'gray', 1: 'blue', 2: 'purple', 3: 'cyan', 4: 'green', 9: 'red' };

const WORD = {
  ACTIVE: 'green', PUBLISHED: 'green', OK: 'green', LOW: 'orange', OUT: 'red',
  DRAFT: 'gray', REVIEW: 'purple', ARCHIVED: 'gray',
  EXPIRED: 'orange', VOID: 'red', TRANSFERRED: 'blue',
  LOCKED: 'red', DELETED: 'red',
  OPEN: 'orange', PROCESSING: 'blue', ANSWERED: 'green', CLOSED: 'gray',
  // Feedback threads: waiting on us, waiting on them, done, aged out.
  PENDING: 'orange', REPLIED: 'blue', RESOLVED: 'green', FINISHED: 'gray',
  HIGH: 'red', MEDIUM: 'orange', LOW_RISK: 'green',
  ALERT: 'red', WATCH: 'orange', NORMAL: 'green',
  OVERDUE: 'red', PARTS_BOUND: 'orange', OVER_CAPACITY: 'purple',
  QUALITY: 'orange', UNSTAFFED: 'red', CLEAR: 'green'
};

const PALETTES = {
  ticket: TICKET,
  pay: PAY,
  claim: CLAIM,
  replenishment: REPLENISHMENT
};

export default function StatusBadge({ kind, value, label, ...rest }) {
  const palette = PALETTES[kind];

  const scheme = palette
    ? (palette[value] || 'gray')
    // 'LOW' means a low stock warning in one table and low risk in another,
    // so the risk board asks for it by a name of its own.
    : (WORD[value] || 'gray');

  return (
    <Badge colorScheme={scheme} borderRadius="md" px={2} py="2px" fontSize="0.7rem" {...rest}>
      {label === undefined ? String(value === null || value === undefined ? '-' : value) : label}
    </Badge>
  );
}
