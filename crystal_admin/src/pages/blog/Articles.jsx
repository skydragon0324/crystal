import React, { useState } from 'react';
import { Box, Button, Menu, MenuButton, MenuItem, MenuList, Text, useToast } from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';

import CrudPage from '../../components/CrudPage';
import StatusBadge from '../../components/StatusBadge';
import usePermission from '../../hooks/usePermission';
import { articles } from '../../api';
import { useT } from '../../i18n';
import { dateTime, number } from '../../utils/format';

export const PAGE = '/admin/blog/articles';

const FLOW = {
  DRAFT: ['REVIEW', 'PUBLISHED'],
  REVIEW: ['DRAFT', 'PUBLISHED'],
  PUBLISHED: ['DRAFT']
};

/**
 * The blog.
 *
 * Publishing sits behind a higher permission than writing - an editor writes
 * and submits for review, and putting something in front of every customer is
 * somebody else's decision - so the workflow menu only appears for a role
 * that has it.
 *
 * `published_at` is stamped once, on the first time an article goes live, and
 * never moved: re-editing a live article must not push it back to the top of
 * the list as though it were news.
 */
export default function Articles() {
  const t = useT();
  const toast = useToast();
  const { isSuper } = usePermission(PAGE);

  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const move = async (row, status) => {
    setBusy(true);
    try {
      await articles.transition(row.id, status);
      toast({ status: 'success', description: t('common.saved'), duration: 2500 });
      setReloadKey((key) => key + 1);
    } catch (err) {
      toast({ status: 'error', description: err.message, duration: 7000 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <CrudPage
      key={reloadKey}
      page={PAGE}
      api={articles}
      defaultSort="created_at"
      defaultDir="desc"
      formSize="5xl"
      subtitle={t('blog.articles.anArticleThatIsAlready')}
      rowActions={isSuper ? (row) => {
        const allowed = FLOW[row.status] || [];
        if (!allowed.length) return null;

        return (
          <Menu placement="bottom-end">
            <MenuButton
              as={Button} size="xs" variant="ghost" rightIcon={<ChevronDownIcon />} isDisabled={busy}
            >
              {t('blog.articles.status')}
            </MenuButton>
            <MenuList fontSize="sm">
              {allowed.map((status) => (
                <MenuItem key={status} onClick={() => move(row, status)}>{t(status)}</MenuItem>
              ))}
            </MenuList>
          </Menu>
        );
      } : undefined}
      columns={[
        {
          key: 'title', label: 'Title', maxW: '18.75rem',
          render: (row) => (
            <Box>
              <Text fontSize="xs" fontWeight="600" noOfLines={1}>{row.title}</Text>
              <Text fontSize="0.65rem" color="gray.500">{row.slug}</Text>
            </Box>
          )
        },
        { key: 'category', label: 'Category' },
        { key: 'author', label: 'Author', maxW: '8.75rem' },
        { key: 'view_count', label: 'Views', isNumeric: true, render: (row) => number(row.view_count) },
        { key: 'published_at', label: 'Published', render: (row) => dateTime(row.published_at) },
        {
          key: 'status', label: 'Status',
          render: (row) => (
            <Box>
              <StatusBadge value={row.status} />
              {row.is_featured && <StatusBadge value="WATCH" label={t('blog.articles.featured')} ml={1} />}
            </Box>
          )
        }
      ]}
      fields={[
        { name: 'title', label: 'Title', required: true, span: 2 },
        {
          name: 'category', label: 'Category', type: 'select',
          /*
           * THE SIX article_topic VALUES, and nothing else.
           *
           * This offered NEWS, PRODUCT, SUPPORT and COMPANY. Only the first is
           * a real one - the other three were never members of the enum, so
           * choosing one wrote a category the database refuses.
           */
          options: ['NEWS', 'PRODUCTS', 'SOFTWARE', 'SERVICE', 'REPAIRABILITY', 'WARRANTY']
            .map((code) => ({ value: code, label: code }))
        },
        { name: 'author', label: 'Author' },
        /*
         * ONE COVER, not two, and no slug field above it.
         *
         * The blog is stored in the vendor's database now, and that schema has
         * a single image_url and no slug column at all - the slug shown in the
         * list is derived from the title and the id. Offering either would be
         * offering a box whose contents are dropped on save.
         */
        { name: 'cover_image', label: 'Cover', type: 'image', folder: 'articles' },
        {
          name: 'is_featured', label: 'Featured', type: 'checkbox',
          help: 'Show this on the storefront home page'
        },
        { name: 'summary', label: 'Summary', type: 'textarea', rows: 3, span: 2 },
        /*
         * An article is written, not filled in.  The body was a fourteen row
         * textarea, which is what somebody writes in when nothing better is
         * offered - no headings, no lists, and a pasted screenshot with
         * nowhere to go.  Images uploaded from the toolbar land in the
         * articles folder and are referenced by url, never inlined as base64.
         */
        { name: 'content', label: 'Content', type: 'richtext', span: 2 }
      ]}
    />
  );
}
