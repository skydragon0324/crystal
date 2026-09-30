import React from 'react';
import { Badge, Box, Flex, Text } from '@chakra-ui/react';

import CrudPage from '../../components/CrudPage';
import StatusBadge from '../../components/StatusBadge';
import useOptions from '../../hooks/useOptions';
import { noticeOrigins, notices } from '../../api';
import { useT } from '../../i18n';
import { dateTime } from '../../utils/format';

export const PAGE = '/admin/base/notices';

/**
 * The notices a visitor is greeted with on the website.
 *
 * A dialog on arrival is the most intrusive thing a site can do, so the screen
 * is built around making that intrusion answerable:
 *
 *   THE WINDOW is the important column. `status` says somebody decided the
 *   notice was ready; `starts_at`/`ends_at` say whether it is live RIGHT NOW.
 *   Two switches rather than one, because writing a notice in advance and
 *   taking one down are different acts - and a notice about a sale should stop
 *   showing when the sale ends without anybody remembering to come back here.
 *
 *   THEY ALL SHOW NOW. It used to be one: two live notices meant the higher
 *   order won and the runner-up waited for the first to expire, so a second
 *   thing worth saying on the same day simply did not get said. The rule it
 *   was protecting - a stack of modals on arrival is an obstacle rather than
 *   a greeting - is a rule about the DIALOG, and the dialog still shows them
 *   one at a time. `sort_order` decides what is read first rather than what
 *   is read at all.
 *
 *   THE ORIGIN is what stops ten live notices reading as one wall. It is a
 *   lookup rather than a typed word, because the same team typed by hand ends
 *   up under three spellings within a month.
 *
 *   DISMISSIBLE is the editor's call, not the browser's. Off for the rare
 *   notice that genuinely must be read; on for everything else, because a
 *   greeting nobody can put down is an advertisement.
 */

/** A hex, or nothing. The dot is only painted when it is one. */
const HEX = /^#[0-9A-Fa-f]{6}$/;

/** Live, waiting, finished or unpublished - worked out the way the API does. */
function liveness(row) {
  if (row.status !== 'PUBLISHED') return { label: 'Draft', scheme: 'gray' };

  const now = Date.now();
  const from = row.starts_at ? Date.parse(row.starts_at) : null;
  const until = row.ends_at ? Date.parse(row.ends_at) : null;

  if (from && from > now) return { label: 'Scheduled', scheme: 'blue' };
  if (until && until < now) return { label: 'Finished', scheme: 'gray' };
  return { label: 'Live', scheme: 'green' };
}

export default function Notices() {
  const t = useT();

  /*
   * The origins, for the picker.
   *
   * Retired ones are LISTED rather than hidden, and labelled as retired. A
   * notice already filed under one has to keep showing something in this
   * field - dropping it from the options would silently blank the origin of
   * every notice that used it, the next time somebody opened the row to fix
   * a typo in the title.
   */
  const { options: origins } = useOptions(() => noticeOrigins.options(), []);

  return (
    <CrudPage
      page={PAGE}
      api={notices}
      defaultSort="sort_order"
      defaultDir="desc"
      formSize="3xl"
      subtitle={t('base.notices.everyLiveNoticeIsShown')}
      /* A new notice is from Crystal until somebody says otherwise. */
      emptyRow={{ origin_id: '' }}
      /*
       * An EXISTING notice from Crystal has origin_id null in the database,
       * which the form has to see as the Crystal option rather than as an
       * empty field - otherwise every such notice opens looking unset, and
       * re-saving it is a chance to set it to something by accident.
       */
      fromRow={(row) => Object.assign({}, row, {
        origin_id: row.origin_id === null || row.origin_id === undefined ? '' : row.origin_id
      })}
      columns={[
        {
          key: 'title', label: 'Notice', maxW: '22rem',
          render: (row) => (
            <Box>
              <Text fontSize="xs" fontWeight="600" noOfLines={1}>{row.title}</Text>
              {/*
                THE MESSAGE WRAPS, AND SCROLLS PAST FOUR LINES.

                It was a single clipped line, which is the one shape that
                cannot answer the question this column is for. Every notice
                opens with the same sort of sentence - "Crystal is pleased to
                announce", "Please note that" - so a row of first-lines gives
                an editor scanning the list nothing to tell the notices apart
                by, and checking which one is which meant opening each in turn.

                Four lines is the cap because the column sits in a table row:
                past that the ROWS start to differ wildly in height and the
                list stops being scannable in the other direction. The overflow
                is not hidden, it scrolls - so a long notice can be read in
                place, which is the whole point, without the row growing to
                hold it.

                `white-space: pre-line` keeps the editor's own paragraph breaks
                instead of running the text into one block. The tags are
                stripped to spaces first, so `<p>a</p><p>b</p>` does not
                become "ab".
              */}
              <Box
                maxH="4.5rem"
                overflowY="auto"
                mt="0.125rem"
                pe="0.25rem"
                /*
                 * A thin, quiet scrollbar. WebKit only, which is the whole
                 * target - Chrome 72 up - and a browser that ignores these
                 * simply shows its own.
                 */
                /* rem, not px - the console's text scale is a root font size,
                   and a scrollbar beside scaled text has to scale with it. */
                sx={{
                  '&::-webkit-scrollbar': { width: '0.25rem' },
                  '&::-webkit-scrollbar-thumb': {
                    background: 'rgba(128, 128, 128, 0.4)',
                    borderRadius: '0.125rem'
                  },
                  '&::-webkit-scrollbar-track': { background: 'transparent' }
                }}
              >
                <Text
                  fontSize="0.65rem"
                  color="gray.500"
                  whiteSpace="pre-line"
                  wordBreak="break-word"
                >
                  {String(row.content || '')
                    .replace(/<(p|br|div|li|h[1-6])\b[^>]*>/gi, '\n')
                    .replace(/<[^>]*>/g, ' ')
                    .replace(/[ \t]+/g, ' ')
                    .replace(/\n{2,}/g, '\n')
                    .trim()}
                </Text>
              </Box>
            </Box>
          )
        },
        {
          /*
           * The name AND the colour, because the colour is what a visitor
           * actually navigates the storefront list by - an editor should be
           * looking at the same badge they are.
           */
          key: 'origin_name', label: 'From',
          render: (row) => (row.origin_name ? (
            <Flex align="center" gap="0.5rem" data-gap="8">
              <Box
                w="0.625rem" h="0.625rem" borderRadius="3px" flexShrink={0}
                bg={HEX.test(row.origin_colour || '') ? row.origin_colour : 'transparent'}
                borderWidth="1px" borderColor="whiteAlpha.400"
              />
              <Text fontSize="xs">{row.origin_name}</Text>
            </Flex>
          ) : (
            <Text fontSize="xs" color="gray.500">{t('common.crystal')}</Text>
          ))
        },
        {
          /*
           * What an editor actually wants to know, and it is not the status
           * column: a PUBLISHED notice outside its window is not showing.
           */
          key: 'live', label: 'Showing', sortable: false,
          render: (row) => {
            const state = liveness(row);
            return (
              <Badge colorScheme={state.scheme} borderRadius="0.375rem" textTransform="none">
                {t(state.label)}
              </Badge>
            );
          }
        },
        { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> },
        {
          key: 'starts_at', label: 'From',
          render: (row) => (
            <Text fontSize="xs">{row.starts_at ? dateTime(row.starts_at) : t('base.notices.immediately')}</Text>
          )
        },
        {
          key: 'ends_at', label: 'Until',
          render: (row) => (
            <Text fontSize="xs">{row.ends_at ? dateTime(row.ends_at) : t('base.notices.noEnd')}</Text>
          )
        },
        {
          key: 'dismissible', label: 'Can be dismissed',
          render: (row) => (
            <Text fontSize="xs">{row.dismissible ? t('common.yes') : t('base.notices.mustBeRead')}</Text>
          )
        },
        { key: 'sort_order', label: 'Order', isNumeric: true }
      ]}
      fields={[
        { name: 'title', label: 'Title', required: true, span: 2 },
        {
          name: 'content', label: 'Message', type: 'richtext', required: true, span: 2,
          help: 'Shown in the dialog. Keep it to a couple of sentences - anything longer is a page, not a greeting.'
        },
        {
          name: 'origin_id', label: 'From', type: 'select',
          /*
           * CRYSTAL IS AN OPTION, and it is the one a new notice starts on.
           *
           * "From Crystal itself" is stored as no origin at all, and it used
           * to be shown that way too - an empty field with a grey `Crystal`
           * placeholder in it. A placeholder is what a control says when it is
           * WAITING for an answer, so the commonest answer of all looked like
           * a question nobody had got to yet, and the field read as unfinished
           * on the majority of notices.
           *
           * As a real row it is picked, it is ticked, and `defaults` below
           * starts every new notice on it. The stored value is still null -
           * nothing about the database changed.
           */
          isSearchable: true,
          isClearable: false,
          /*
           * The empty string, not null - and it is not a fudge.
           *
           * SelectField treats null as "nothing is selected", so an option
           * VALUED null can never show as picked. FormModal already coerces
           * '' to null on submit (see payloadOf), so the column still stores
           * null; this is the form's way of spelling the same thing.
           */
          options: [{ value: '', label: 'Crystal' }].concat(origins.map((row) => ({
            value: row.id,
            label: row.status === 'INACTIVE' ? row.name + ' (' + t('base.notices.retired') + ')' : row.name
          }))),
          help: 'The badge the website shows beside it. Crystal is the site itself. Add an origin under Notice origins.'
        },

        { type: 'section', label: 'When it shows' },
        {
          name: 'status', label: 'Status', type: 'select', required: true,
          options: [
            { value: 'DRAFT', label: 'Draft' },
            { value: 'PUBLISHED', label: 'Published' }
          ],
          help: 'Published is necessary but not sufficient - the window below decides whether it is live now.'
        },
        {
          name: 'sort_order', label: 'Order', type: 'number',
          help: 'Higher is read first. Every live notice is shown, so this orders them rather than choosing between them.'
        },
        {
          name: 'starts_at', label: 'From', type: 'date',
          help: 'Leave empty to start as soon as it is published. A day is granularity enough for a greeting.'
        },
        {
          name: 'ends_at', label: 'Until', type: 'date',
          help: 'Leave empty for a notice with no end. Setting it is how a notice about a sale stops showing on its own.'
        },
        {
          name: 'dismissible', label: 'Offer "do not remind me today"', type: 'checkbox', span: 2,
          help: 'Leave this on unless the notice genuinely must be read - a service interruption, a security notice.'
        }
      ]}
    />
  );
}
