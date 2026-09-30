import React, { useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useHistory, useLocation } from 'react-router-dom';
import {
  Box,
  Button,
  Divider,
  Flex,
  Heading,
  Icon,
  Input,
  InputGroup,
  InputLeftElement,
  Stack,
  Text,
  VisuallyHidden
} from '@chakra-ui/react';
import { SearchIcon } from '@chakra-ui/icons';
import { FiEye, FiMessageCircle, FiThumbsUp } from 'react-icons/fi';

import {
  EmptyState,
  ErrorState,
  Loading,
  Pagination,
  Section,
  SectionHeading,
  SelectField
} from '@/components/common';
import { HelpMarks } from '@/components/blog/BlogContent';
import api from '@/api';
import { useApi, useDebounced, useList } from '@/hooks/useApi';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';
import { date as formatDate, number } from '@/utils/format';

/**
 * The blog index, and it is TEXT - and a forum's index as well as a
 * publication's.
 *
 * WHY THERE ARE NO PICTURES. Articles have no artwork to publish - nothing
 * uploads a cover image, and nothing is going to for a while - so every card
 * on this page drew a 56% box filled with the raised surface and nothing
 * else. So the page is built for the thing it actually has: WORDS.
 *
 *   EVERY ARTICLE IS THE SAME ROW. The newest article on a shelf used to be
 *   drawn as a lead - a coloured rule, a display headline, a "read the
 *   article" link - above the others. On a forum's index that singles out
 *   whatever happened to be posted last, and within one shelf it made one
 *   thread look more important than the one beside it for no reason a
 *   reader could see. So the first row is a row like the rest.
 *
 *   IT IS A LIST, not a grid, ruled between entries, so the eye goes straight
 *   down and the headline gets room to be a sentence.
 *
 *   THE SHELF AND DATE ARE A COLUMN OF THEIR OWN from md up - a scannable
 *   spine - and a line above the headline on a phone.
 *
 * WHAT THE VENDOR'S SCHEMA ADDS, and why each is on the row (the model is at
 * the top of the backend's repositories/legacy/articles.repository.js):
 *
 *   THE SHELVES ARE A TREE. Six at the top and four under Product. The top
 *   row of chips is the top level; choosing one that has shelves under it
 *   opens a second row for those - and choosing the parent shows everything
 *   on it, its children included, because a shelf that hides its own
 *   sub-shelves makes whole sections of the blog look empty. Shelves with
 *   nothing published are not offered: a chip that leads to an empty list is
 *   a dead end on a phone.
 *
 *   A THREAD'S LIFE IS ON THE ROW: how many replies, and who answered last
 *   and when. That is what tells a returning reader something new was said.
 *
 *   A QUESTION SAYS IT IS ONE, and whether it has been answered, before the
 *   headline - an open question is the one row a passing reader could help
 *   with.
 *
 * THE ADDRESS HOLDS THE PAGE. Shelf, search, order and page all live in the
 * query string, so the back button from an article returns to the same page
 * of the same shelf, and the article's breadcrumbs can link to a shelf.
 */

const SORTS = ['latest', 'replies', 'views', 'recommended'];

const LIMIT = 10;

/** A positive whole number from the address, as the string it was, or null. */
function idParam(value) {
  return /^[1-9]\d*$/.test(value || '') ? value : null;
}

/** What the address says the list is. */
function readAddress(search) {
  const query = new URLSearchParams(search);
  const sort = query.get('sort');

  return {
    subject: idParam(query.get('subject')),
    q: (query.get('q') || '').trim(),
    sort: SORTS.indexOf(sort) === -1 ? 'latest' : sort,
    page: Number(idParam(query.get('page')) || 1)
  };
}

/** The address for a list. Defaults are left out, so the plain index is plain /blog. */
function writeAddress(state) {
  const query = new URLSearchParams();
  if (state.subject) query.set('subject', state.subject);
  if (state.q) query.set('q', state.q);
  if (state.sort && state.sort !== 'latest') query.set('sort', state.sort);
  if (state.page && state.page > 1) query.set('page', String(state.page));

  const text = query.toString();
  return '/blog' + (text ? '?' + text : '');
}

/** The API's params for a list. */
function paramsOf(state) {
  return {
    page: state.page,
    limit: LIMIT,
    subject: state.subject || undefined,
    q: state.q || undefined,
    sort: state.sort === 'latest' ? undefined : state.sort
  };
}

/** A shelf by id anywhere in the tree, with the top-level shelf it belongs to. */
function findShelf(roots, id) {
  for (let i = 0; i < roots.length; i += 1) {
    if (String(roots[i].id) === String(id)) return { node: roots[i], root: roots[i] };
    const children = roots[i].children || [];
    for (let j = 0; j < children.length; j += 1) {
      if (String(children[j].id) === String(id)) return { node: children[j], root: roots[i] };
    }
  }
  return { node: null, root: null };
}

export default function BlogList() {
  const t = useT();

  const surface = useSurface();
  const history = useHistory();
  const location = useLocation();

  const address = readAddress(location.search);

  const subjects = useApi(() => api.blog.subjects(), []);
  const list = useList((params) => api.blog.list(params), {
    /* Seeded from the address, so the FIRST request is already the right one. */
    initialParams: paramsOf(address)
  });

  /* The address changed (a chip, the back button, a breadcrumb): the list follows it. */
  const wanted = paramsOf(address);
  const wantedKey = JSON.stringify(wanted);

  useEffect(() => {
    const have = list.params;
    if (have.page === wanted.page && have.subject === wanted.subject
      && have.q === wanted.q && have.sort === wanted.sort && have.limit === wanted.limit) return;

    list.setParams(wanted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedKey]);

  /** Every change of list is a navigation, so it is in the history and in a copied link. */
  const go = (patch, replace) => {
    const next = writeAddress(Object.assign({}, address, { page: 1 }, patch));
    if (replace) history.replace(next);
    else history.push(next);
  };

  /*
   * THE SEARCH BOX types into local state and writes the address once the
   * typing stops - replacing, not pushing, so the back button is not a
   * keystroke at a time. `written` is what this box last put there: an
   * address that changes to something else (back, a chip) is copied into the
   * box, and one that merely caught up with the typing is not, which is what
   * stops a slow response overwriting the letters typed since.
   */
  const [term, setTerm] = useState(address.q);
  const debounced = useDebounced(term, 400);
  const written = useRef(address.q);

  useEffect(() => {
    const value = debounced.trim();
    if (value === address.q) return;
    written.current = value;
    go({ q: value }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  useEffect(() => {
    if (address.q === written.current) return;
    written.current = address.q;
    setTerm(address.q);
  }, [address.q]);

  /* ------------------------------------------------------------ shelves */

  const roots = (subjects.data || []).filter((row) => row && row.id);
  const found = findShelf(roots, address.subject);
  const activeRoot = found.root;

  const offered = roots.filter((row) => row.total_cnt > 0 || (activeRoot && row.id === activeRoot.id));
  const children = activeRoot
    ? (activeRoot.children || []).filter((row) => row.total_cnt > 0 || String(row.id) === address.subject)
    : [];

  const chip = (key, active, label, count, onClick) => (
    <Button key={key} size="sm" variant={active ? 'brand' : 'quiet'} onClick={onClick} flexShrink={0}>
      {label}
      {count !== undefined && (
        <Text as="span" ml="1.5" fontSize="xs" opacity={0.7}>
          {number(count)}
        </Text>
      )}
    </Button>
  );

  /* ---------------------------------------------------------------- rows */

  const entries = list.rows;

  const thumbsOf = (article) => {
    const given = article.recommendations || {};
    return Number(given.gold || 0) + Number(given.silver || 0) + Number(given.bronze || 0);
  };

  const shelfOf = (article) => (article.subject && article.subject.name) || article.category;

  /** The row's last line: who wrote it, the conversation, the reads. */
  const meta = (article) => (
    <Flex
      align="center"
      wrap="wrap"
      gap="3"
      data-gap="12"
      data-gap-wrap
      mt="3"
      fontSize="xs"
      color={surface.muted}
    >
      <Text as="span" fontWeight="600" color={surface.strong}>
        {article.author || t('common.crystal')}
      </Text>

      <Flex as="span" align="center">
        <Icon as={FiMessageCircle} mr="1" aria-hidden="true" />
        <Text as="span">{number(article.reply_count)}</Text>
        <VisuallyHidden>{t('blog.thread.replies')}</VisuallyHidden>
      </Flex>

      {article.last_reply && (
        <Text as="span">
          {t('blog.list.lastReply', {
            date: formatDate(article.last_reply.at),
            author: article.last_reply.author || t('blog.thread.unknownAuthor')
          })}
        </Text>
      )}

      <Flex as="span" align="center">
        <Icon as={FiEye} mr="1" aria-hidden="true" />
        <Text as="span">{number(article.view_count)}</Text>
        <VisuallyHidden>{t('blog.list.reads')}</VisuallyHidden>
      </Flex>

      {/* Every thumb, whatever its colour - the medals themselves are on the article. */}
      {thumbsOf(article) > 0 && (
        <Flex as="span" align="center">
          <Icon as={FiThumbsUp} mr="1" aria-hidden="true" />
          <Text as="span">{number(thumbsOf(article))}</Text>
          <VisuallyHidden>{t('blog.thumbs.thumbs')}</VisuallyHidden>
        </Flex>
      )}
    </Flex>
  );

  const filtered = !!(address.subject || address.q);

  return (
    <Section py={{ base: 6, md: 10 }}>
      <Flex
        align={{ base: 'stretch', md: 'flex-end' }}
        justify="space-between"
        direction={{ base: 'column', md: 'row' }}
        gap="3"
        data-gap="12"
        data-gap-row-from="md"
      >
        <SectionHeading
          title={t('blog.bloglist.blog')}
          subtitle={t('blog.bloglist.productNotesReleaseAnnouncementsAnd')}
        />

        {/*
          THE WAY IN, ON THE INDEX.

          The blog is a forum as well as a publication and members write in it
          - so the index says so, next to the heading, rather than hiding the
          fact behind the member centre. Signed out it still leads there: the
          compose page is behind the sign-in, which brings the reader back to
          it rather than to the front page.
        */}
        {/*
          * NOT ON A PHONE. Writing opens the rich text editor, which is a
          * desktop tool - so the invitation is only offered where it leads
          * somewhere usable. The page behind it still exists for a link.
          */}
        <Box flexShrink={0} mb={{ base: 4, md: 6 }} display={{ base: "none", md: "block" }}>
          <Button as={RouterLink} to="/account/blog/write" size="sm" variant="outlineBrand">
            {t('blog.compose.writeAnArticle')}
          </Button>
        </Box>
      </Flex>

      {/* ------------------------------------------------ search and order */}
      <Flex
        direction={{ base: 'column', md: 'row' }}
        align={{ base: 'stretch', md: 'center' }}
        justify="space-between"
        gap="3"
        data-gap="12"
        data-gap-row-from="md"
        mb="5"
      >
        <Box flex="1" maxW={{ base: '100%', md: '360px' }}>
          <InputGroup size="md">
            <InputLeftElement pointerEvents="none">
              <SearchIcon color={surface.muted} boxSize="3.5" />
            </InputLeftElement>
            <Input
              type="search"
              placeholder={t('blog.list.searchTheBlog')}
              aria-label={t('blog.list.searchTheBlog')}
              value={term}
              onChange={(event) => setTerm(event.target.value)}
            />
          </InputGroup>
        </Box>

        <Box minW={{ base: '100%', md: '210px' }}>
          <SelectField
            size="sm"
            value={address.sort}
            onChange={(value) => go({ sort: value || 'latest' })}
            options={[
              { value: 'latest', label: t('blog.list.sortLatest') },
              { value: 'replies', label: t('blog.list.sortReplies') },
              { value: 'views', label: t('blog.list.sortViews') },
              { value: 'recommended', label: t('blog.list.sortRecommended') }
            ]}
            isSearchable={false}
          />
        </Box>
      </Flex>

      {/* ------------------------------------------------------- shelves */}
      {offered.length > 0 && (
        <Box mb={{ base: 8, md: 10 }}>
          <Flex gap="2" data-gap="8" data-gap-wrap wrap="wrap">
            {chip('all', !address.subject, t('common.all'), undefined, () => go({ subject: null }))}
            {offered.map((row) => chip(
              row.id,
              !!activeRoot && activeRoot.id === row.id,
              row.name,
              row.total_cnt,
              () => go({ subject: String(row.id) })
            ))}
          </Flex>

          {activeRoot && children.length > 0 && (
            <Flex
              gap="2"
              data-gap="8"
              data-gap-wrap
              wrap="wrap"
              mt="3"
              pl="3"
              borderLeft="2px solid"
              borderColor={surface.border}
            >
              {chip(
                'all-' + activeRoot.id,
                String(activeRoot.id) === address.subject,
                t('blog.list.allIn', { shelf: activeRoot.name }),
                undefined,
                () => go({ subject: String(activeRoot.id) })
              )}
              {children.map((row) => chip(
                row.id,
                String(row.id) === address.subject,
                row.name,
                row.total_cnt,
                () => go({ subject: String(row.id) })
              ))}
            </Flex>
          )}
        </Box>
      )}

      {address.q && (
        <Flex align="center" wrap="wrap" gap="2" data-gap="8" data-gap-wrap mb="6" fontSize="sm" color={surface.muted}>
          <Text>{t('blog.list.resultsFor', { q: address.q })}</Text>
          <Button size="xs" variant="quiet" onClick={() => { setTerm(''); go({ q: '' }); }}>
            {t('common.clear')}
          </Button>
        </Flex>
      )}

      {list.loading && <Loading variant="list" count={6} height="88px" />}

      {!list.loading && list.error && <ErrorState message={list.error} onRetry={list.reload} />}

      {!list.loading && !list.error && list.rows.length === 0 && (
        filtered ? (
          <EmptyState
            title={t('blog.list.nothingMatches')}
            hint={t('blog.list.tryAnotherShelfOrSearch')}
            actionLabel={t('blog.list.showEverything')}
            onAction={() => { setTerm(''); go({ subject: null, q: '' }); }}
          />
        ) : (
          <EmptyState title={t('blog.bloglist.nothingPublishedHereYet')} />
        )
      )}

      {/* ------------------------------------------------------------ index */}
      {!list.loading && entries.length > 0 && (
        <Stack spacing="0" divider={<Divider borderColor={surface.border} />}>
          {entries.map((article) => (
            <Flex
              key={article.id}
              as={RouterLink}
              to={`/blog/${article.slug}`}
              direction={{ base: 'column', md: 'row' }}
              /*
                NO `gap` ON THIS ONE. It changes size at md AND changes axis
                at md, and the Chrome 72 margin fallback is keyed on a single
                pixel value per breakpoint - so the two margins below say it
                directly. See chrome72.test.js.
              */
              py={{ base: 5, md: 7 }}
              px={{ base: 0, md: 3 }}
              mx={{ base: 0, md: -3 }}
              borderRadius="10px"
              _hover={{ textDecoration: 'none', bg: surface.hover }}
              transition="background-color 140ms ease"
              data-group=""
            >
              {/*
                * THE SPINE. A fixed width from md up so every date starts at
                * the same x - a ragged left edge here would undo the whole
                * point of giving them a column.
                */}
              <Box
                w={{ base: 'auto', md: '160px' }}
                flexShrink={0}
                pt={{ base: 0, md: '5px' }}
                mb={{ base: 2, md: 0 }}
                mr={{ base: 0, md: 8 }}
              >
                <Text
                  fontSize="xs"
                  fontWeight="700"
                  color="brand.500"
                  letterSpacing="0.08em"
                  textTransform="uppercase"
                  noOfLines={1}
                >
                  {shelfOf(article)}
                </Text>
                <Text fontSize="xs" color={surface.muted} mt={{ base: 0, md: '1' }}>
                  {article.published_at ? formatDate(article.published_at) : ''}
                </Text>
              </Box>

              <Box minW="0" flex="1">
                <HelpMarks article={article} mb="2" />

                <Heading
                  size="md"
                  color={surface.text}
                  lineHeight="1.35"
                  letterSpacing="-0.01em"
                  noOfLines={2}
                  wordBreak="break-word"
                  _groupHover={{ color: 'brand.500' }}
                  transition="color 160ms ease"
                >
                  {article.title}
                </Heading>
                {article.summary && (
                  <Text
                    fontSize="sm"
                    color={surface.muted}
                    mt="2"
                    maxW="46em"
                    lineHeight="1.7"
                    noOfLines={2}
                  >
                    {article.summary}
                  </Text>
                )}

                {meta(article)}
              </Box>
            </Flex>
          ))}
        </Stack>
      )}

      <Pagination
        meta={list.meta}
        onPage={(page) => {
          go({ page: page }, false);
          /*
           * The pager is at the BOTTOM. The layout only returns to the top when
           * the path changes, and a new page of the index is the same path -
           * so without this the reader lands on the last rows of page two.
           */
          window.scrollTo(0, 0);
        }}
      />
    </Section>
  );
}
