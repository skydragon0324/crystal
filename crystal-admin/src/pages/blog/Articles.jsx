import React, { useState } from 'react';
import { Box, Button, Menu, MenuButton, MenuItem, MenuList, Text, useToast } from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';

import CrudPage from '../../components/CrudPage';
import SelectField from '../../components/SelectField';
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
 *
 * ARTICLES OR REPLIES, and that filter is not decoration. Members write from
 * the storefront now and a REPLY waits for approval exactly as an article
 * does - so without it, the one screen that can approve a post was also the
 * one screen that could not see half of them. Articles are still what the
 * page opens on, because that is what this screen is mostly for.
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
      filters={(list) => (
        <Box minW="10rem">
          <SelectField
            size="sm"
            value={list.params.kind || null}
            onChange={(value) => list.setFilter({ kind: value || undefined })}
            options={[
              { value: 'ARTICLE', label: t('blog.articles.articles') },
              { value: 'REPLY', label: t('blog.articles.replies') },
              { value: 'ALL', label: t('blog.articles.articlesAndReplies') }
            ]}
            placeholder={t('blog.articles.articles')}
            isSearchable={false}
          />
        </Box>
      )}
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
          /*
           * A REPLY SAYS WHICH CONVERSATION IT IS IN, because its own title is
           * "Re:" and somebody else's headline - a queue of them would
           * otherwise be a column of near-identical lines. Its slug is not
           * shown: a reply has no page of its own to open.
           */
          render: (row) => (
            <Box>
              <Text fontSize="xs" fontWeight="600" noOfLines={1}>{row.title}</Text>
              <Text fontSize="0.65rem" color="gray.500" noOfLines={1}>
                {row.kind === 'REPLY'
                  ? t('blog.articles.inThread', { title: (row.thread && row.thread.title) || '' })
                  : row.slug}
              </Text>
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
         * NO COVER PICTURE, FOR NOW, and no slug field either.
         *
         * The cover field is GONE FROM THE FORM ONLY. `image_url` is still
         * there in the vendor's schema, still read by the storefront, and
         * every article that already has one keeps it: nothing here writes
         * that column any more, so an existing cover survives an edit rather
         * than being blanked by a form that no longer offers it.
         *
         * It is out because the image pipeline for the blog is not something
         * this console can currently do - picking a file produced an upload
         * the API had nowhere to put - and a box whose contents are silently
         * dropped is worse than no box. Put it back by restoring one
         * `{ name: 'cover_image', label: 'Cover', type: 'image', folder: 'articles' }`
         * field here, once uploads into the articles folder work end to end.
         *
         * The slug is a separate matter and stays out permanently: that
         * schema has no slug column at all, and the one shown in the list is
         * derived from the title and the id.
         */
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
