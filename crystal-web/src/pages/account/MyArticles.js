import React, { useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  AlertDialog, AlertDialogBody, AlertDialogContent, AlertDialogFooter,
  AlertDialogHeader, AlertDialogOverlay,
  Badge, Box, Button, Flex, Icon, Link, Text, useDisclosure, useToast
} from '@chakra-ui/react';
import { FiCornerDownRight, FiEdit2, FiPlus, FiTrash2 } from 'react-icons/fi';

import { DataTable, ErrorState, SelectField, StatusBadge } from '@/components/common';
import { replyPath } from '@/components/blog/BlogContent';
import api from '@/api';
import { useList } from '@/hooks/useApi';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';
import { date as formatDate, number } from '@/utils/format';

/**
 * The member's own writing - their articles AND their replies.
 *
 * DRAFTS ARE NOT A SEPARATE PAGE. The vendor's console had "My Articles" and
 * "Drafts" as two menu entries over the same table with a different state
 * filter, which meant a member checking on something they had submitted had to
 * guess which of the two it was in. It is one list with the state on every row
 * and a filter for when they do know.
 *
 * Unlike the public blog this shows everything the member wrote - awaiting
 * review, refused, cancelled - because an article that was refused is exactly
 * the one they came here to find.
 *
 * A REPLY IS SHOWN AS A REPLY. The vendor's blog is a forum: an answer to
 * somebody's question is a row of its own whose parent is that question. This
 * page used to ask for top-level rows only, so a member who had only ever
 * answered questions was told they had written nothing - and had it asked for
 * everything, their answers would have been listed as articles titled
 * "Re: somebody else's headline". Now a reply leads with what the member
 * actually said, marked as a reply, with the thread it belongs to underneath
 * and a link that opens that thread AT their reply, once both are public.
 *
 * IT IS ALSO WHERE WRITING STARTS AND STOPS, now that a member can write from
 * the storefront at all. The button above the list opens the compose page;
 * every row can be opened again and every row can be withdrawn. What a state
 * MEANS is on the row beside it - a draft is only theirs, one waiting to be
 * read is with staff, and one that was refused carries the reason whoever
 * refused it left, which is the difference between rewriting it and giving up.
 */
const STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'REVIEW', label: 'Awaiting review' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'ARCHIVED', label: 'Not published' }
];

/**
 * The word for a state, from the list the filter is built out of.
 *
 * One list rather than a second map beside it: the badge on a row and the
 * option that filters to it are the same four states, and the way two of them
 * end up saying different things is by being written down twice. These go
 * through t() by VALUE - they are English written here, not addresses -
 * which is the same path the SelectField's own labels take.
 */
function stateOf(status) {
  const found = STATUS_OPTIONS.filter((option) => option.value === status)[0];
  return found ? found.label : status;
}

export default function MyArticles() {
  const t = useT();
  const surface = useSurface();
  const toast = useToast();

  const confirm = useDisclosure();
  const cancelRef = useRef();
  const [going, setGoing] = useState(null);
  const [busy, setBusy] = useState(false);

  const list = useList((params) => api.account.articles(params), {
    initialParams: { page: 1, limit: 12 }
  });

  /**
   * WITHDRAWING ONE, behind a confirmation, because there is no undo on this
   * side of it: a draft is gone for good and anything already submitted
   * leaves the blog. (It is recoverable by somebody with the recycle bin,
   * which is not a promise to make to the member pressing the button.)
   */
  const remove = async () => {
    setBusy(true);
    try {
      await api.account.removeArticle(going.id);
      toast({ status: 'success', description: t('blog.compose.itHasBeenWithdrawn'), duration: 5000 });
      confirm.onClose();
      list.reload();
    } catch (err) {
      toast({ status: 'error', description: err.message, duration: 7000 });
    } finally {
      setBusy(false);
    }
  };

  const kindOptions = [
    { value: 'ARTICLE', label: t('account.myarticles.articlesOnly') },
    { value: 'REPLY', label: t('account.myarticles.repliesOnly') }
  ];

  /** The article itself: its title, linked once a reader can open it. */
  const articleCell = (row) => (
    <Box maxW="420px">
      {row.is_public ? (
        <Link as={RouterLink} to={'/blog/' + row.slug} fontWeight="600" color={surface.text} noOfLines={1}>
          {row.title}
        </Link>
      ) : (
        <Text fontWeight="600" color={surface.text} noOfLines={1}>{row.title}</Text>
      )}
      {row.summary && (
        <Text fontSize="xs" color={surface.muted} noOfLines={1}>
          {String(row.summary).replace(/<[^>]+>/g, ' ').trim()}
        </Text>
      )}
    </Box>
  );

  /**
   * A reply: what the member said, then where they said it.
   *
   * The reply's own title is not shown - it is almost always "Re:" and the
   * thread's headline, which is the line underneath anyway.
   */
  const replyCell = (row) => {
    const thread = row.thread || {};
    const words = String(row.summary || '').replace(/<[^>]+>/g, ' ').trim() || row.title;
    const target = row.is_public
      ? replyPath(thread.slug, row.id)
      : (thread.is_public ? '/blog/' + thread.slug : null);

    return (
      <Box maxW="420px">
        <Flex align="center" minW="0">
          <Badge
            colorScheme="purple"
            variant="subtle"
            borderRadius="6px"
            textTransform="none"
            fontSize="10px"
            mr="2"
            flexShrink={0}
          >
            {t('account.myarticles.reply')}
          </Badge>
          <Text fontWeight="600" color={surface.text} noOfLines={1}>{words}</Text>
        </Flex>

        <Flex align="center" fontSize="xs" color={surface.muted} mt="0.5" minW="0">
          <Icon as={FiCornerDownRight} mr="1" flexShrink={0} aria-hidden="true" />
          {target ? (
            <Link as={RouterLink} to={target} color={surface.muted} _hover={{ color: 'brand.500' }} noOfLines={1}>
              {t('account.myarticles.inThread', { title: thread.title || '' })}
            </Link>
          ) : (
            <Text as="span" noOfLines={1}>
              {thread.title
                ? t('account.myarticles.inThread', { title: thread.title })
                : t('account.myarticles.threadNoLongerAvailable')}
            </Text>
          )}
        </Flex>
      </Box>
    );
  };

  const columns = [
    {
      key: 'title',
      label: 'Article',
      render: (row) => (row.kind === 'REPLY' ? replyCell(row) : articleCell(row))
    },
    { key: 'category', label: 'Topic' },
    {
      /*
       * THE STATE, IN THE READER'S LANGUAGE. StatusBadge prints its value
       * lower-cased when it is given no children, so this rendered the raw
       * code - "review", "archived" - in English whatever the page was set
       * to. The badge still takes the code, because that is what picks its
       * colour; the WORDS come from the same list the filter above is built
       * from, so the row and the control that filters it cannot disagree.
       */
      key: 'status',
      label: 'State',
      render: (row) => (
        <Box>
          <StatusBadge value={row.status}>{t(stateOf(row.status))}</StatusBadge>
          {/*
            * WHY IT WAS REFUSED, where the refusal is.
            *
            * A row that says "Not published" and nothing else leaves the
            * member with no idea whether the post was wrong, the shelf was
            * wrong, or somebody simply withdrew it. The note is whatever the
            * person who refused it wrote; most refusals have none, and the
            * badge alone is then the whole answer.
            */}
          {row.reason && (
            <Text fontSize="xs" color={surface.muted} mt="1" maxW="220px">
              {row.reason}
            </Text>
          )}
        </Box>
      )
    },
    {
      /* Thousands grouped with a space, as everywhere else on the site -
         `toLocaleString` followed the browser's locale, not the reader's. */
      key: 'view_count',
      label: 'Reads',
      align: 'right',
      render: (row) => number(row.view_count)
    },
    {
      key: 'updated_at',
      label: 'Updated',
      render: (row) => (row.updated_at ? formatDate(row.updated_at) : '—')
    },
    {
      /*
       * Two actions and no menu: with two, a menu is one more press to reach
       * either of them. Editing a post that is published sends it back to be
       * read, which the compose page says before anything is changed rather
       * than here, where it would be a sentence nobody has asked for yet.
       */
      key: 'actions',
      label: 'Actions',
      align: 'right',
      resizable: false,
      render: (row) => (
        <Flex justify="flex-end" gap="1" data-gap="4" data-gap-wrap wrap="wrap">
          <Button
            as={RouterLink}
            to={'/account/blog/write/' + row.id}
            size="xs"
            variant="quiet"
            display={{ base: 'none', md: 'inline-flex' }}
            leftIcon={<Icon as={FiEdit2} />}
          >
            {t('blog.compose.edit')}
          </Button>
          <Button
            size="xs"
            variant="quiet"
            color="red.400"
            leftIcon={<Icon as={FiTrash2} />}
            onClick={() => { setGoing(row); confirm.onOpen(); }}
          >
            {t('blog.compose.withdraw')}
          </Button>
        </Flex>
      )
    }
  ];

  return (
    <Box>
      {/*
        THE WAY IN. Until there was one, this page could only ever report on
        writing the member had done somewhere else - which, on the storefront,
        was nowhere.
      */}
      {/* Writing and editing both open the editor, which is a desktop tool. */}
      <Flex justify="flex-end" mb="4" display={{ base: "none", md: "flex" }}>
        <Button
          as={RouterLink}
          to="/account/blog/write"
          size="sm"
          colorScheme="brand"
          leftIcon={<Icon as={FiPlus} />}
        >
          {t('blog.compose.writeAnArticle')}
        </Button>
      </Flex>

      <Flex gap="3" data-gap="12" data-gap-wrap mb="5" wrap="wrap">
        <Box minW="220px">
          <SelectField
            size="sm"
            value={list.params.status || null}
            onChange={(value) => list.setFilter({ status: value || undefined })}
            options={STATUS_OPTIONS}
            allowEmpty
            emptyLabel={t('account.myarticles.allStates')}
            isSearchable={false}
          />
        </Box>
        <Box minW="220px">
          <SelectField
            size="sm"
            value={list.params.kind || null}
            onChange={(value) => list.setFilter({ kind: value || undefined })}
            options={kindOptions}
            allowEmpty
            emptyLabel={t('account.myarticles.articlesAndReplies')}
            isSearchable={false}
          />
        </Box>
      </Flex>

      {list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : (
        <DataTable
          columns={columns}
          rows={list.rows}
          loading={list.loading}
          meta={list.meta}
          onPage={list.setPage}
          emptyTitle={t('account.myarticles.youHaveNotWrittenAnything')}
          emptyHint={t('account.myarticles.articlesAndRepliesAppearHere')}
        />
      )}

      <AlertDialog isOpen={confirm.isOpen} onClose={confirm.onClose} leastDestructiveRef={cancelRef} isCentered>
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight="700">
              {t('blog.compose.withdrawThisPost')}
            </AlertDialogHeader>
            <AlertDialogBody fontSize="sm" color={surface.muted}>
              {going && going.status === 'DRAFT'
                ? t('blog.compose.aDraftIsGoneForGood')
                : t('blog.compose.itLeavesTheBlogAndTheQueue')}
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button ref={cancelRef} variant="quiet" size="sm" onClick={confirm.onClose}>
                {t('common.cancel')}
              </Button>
              <Button colorScheme="red" size="sm" ml="3" isLoading={busy} onClick={remove}>
                {t('blog.compose.withdraw')}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Box>
  );
}
