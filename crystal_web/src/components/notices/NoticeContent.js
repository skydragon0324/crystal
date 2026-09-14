import React from 'react';
import { Badge, Box, Text } from '@chakra-ui/react';

import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';
import { date as formatDate } from '@/utils/format';

/**
 * The two pieces a notice is drawn from, shared by the arrival dialog and the
 * notification page.
 *
 * They are here rather than duplicated because the dialog is the SAME notice
 * the page lists: a visitor who reads it in the modal and then opens the page
 * should recognise it, and two copies of the styling is how the two slowly
 * stop looking like the same announcement.
 */

/** A hex, or nothing. The badge only takes a colour when it is one. */
const HEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * WHO IT IS FROM.
 *
 * The colour comes from the database rather than from a table in this file:
 * origins are added in the console, and a hardcoded map here would leave a new
 * one unlabelled - or worse, labelled as somebody else.
 *
 * A notice with no origin is from Crystal itself, which is what the fallback
 * says rather than leaving a gap where every other row has a badge.
 */
export function OriginBadge({ notice, size }) {
  const t = useT();
  const surface = useSurface();

  const colour = HEX.test(notice.origin_colour || '') ? notice.origin_colour : null;
  /*
   * The NAME comes from the database and is shown as stored; only the
   * fallback is this application's own copy, so only the fallback is
   * translated. Running an editor's own words through t() would replace them
   * with themselves at best and with somebody else's wording at worst.
   */
  const label = notice.origin_name || t('common.crystal');

  return (
    <Badge
      borderRadius="6px"
      textTransform="none"
      fontSize={size === 'sm' ? '10px' : 'xs'}
      fontWeight="700"
      px="2"
      py="0.5"
      /*
       * The colour is a stored hex rather than a Chakra scheme, so the tint is
       * mixed here: a solid fill in the origin's own colour would be six
       * saturated blocks down a list, which is a decoration rather than a
       * label. `currentColor` keeps the text and the tint in step.
       */
      color={colour || surface.muted}
      bg={colour ? colour + '22' : surface.raised}
      border="1px solid"
      borderColor={colour ? colour + '55' : surface.border}
    >
      {label}
    </Badge>
  );
}

/**
 * The body, as HTML from the console's rich text editor.
 *
 * It is written by administrators through an authenticated screen - the same
 * trust boundary as a blog article, and rendered the same way.
 */
export function NoticeBody({ html, size }) {
  const surface = useSurface();

  return (
    <Box
      color={surface.strong}
      fontSize={size === 'sm' ? 'sm' : 'md'}
      lineHeight="1.7"
      sx={{
        'p:not(:last-of-type)': { marginBottom: '0.75rem' },
        a: { color: 'var(--chakra-colors-brand-500)', textDecoration: 'underline' },
        ul: { paddingLeft: '1.25rem', listStyle: 'disc' },
        ol: { paddingLeft: '1.25rem' },
        img: { maxWidth: '100%', height: 'auto', borderRadius: '8px' }
      }}
      dangerouslySetInnerHTML={{ __html: html || '' }}
    />
  );
}

/**
 * When a notice started - THE DATE, not how long ago it was.
 *
 * This said "Today", "Yesterday", "3 days ago", and fell back to a date only
 * after a week. The reasoning was that every notice on the page is live now,
 * so the exact day adds little. It does not survive contact with the page:
 *
 *   "Today" AGES ON THE SCREEN. The storefront is left open; a tab read on
 *   Tuesday still claims Monday's notice arrived today, and nothing re-renders
 *   to correct it.
 *
 *   IT CANNOT BE COMPARED WITH ANYTHING. A member reading a notice about a
 *   service window wants to know WHICH DAY it started, to put it beside an
 *   order date or a repair date. "3 days ago" makes them do the arithmetic,
 *   and get it wrong across a month boundary.
 *
 *   IT IS THE READER'S MIDNIGHT, not the company's. The dialog's own
 *   "remind me today" already reckons the day in the company's timezone;
 *   these two disagreed for anybody far enough east or west.
 *
 * A date is not prose, so it is not translated - it is formatted, one way,
 * for every reader. A notice with no start date is ongoing, which is a fact
 * about the notice rather than a date, so that one stays a word.
 */
export function NoticeWhen({ notice }) {
  const t = useT();
  const surface = useSurface();

  const label = notice.starts_at
    ? formatDate(notice.starts_at)
    : t('components.noticecontent.ongoing');

  return (
    <Text fontSize="xs" color={surface.muted}>
      {label}
    </Text>
  );
}
