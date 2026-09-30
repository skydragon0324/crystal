import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useHistory, useLocation, useParams } from 'react-router-dom';
import { Box, Button, Divider, Flex, Heading, Icon, Link, Stack, Text, useColorModeValue } from '@chakra-ui/react';
import { ArrowBackIcon } from '@chakra-ui/icons';
import { FiMessageCircle } from 'react-icons/fi';

import { Breadcrumbs, EmptyState, ErrorState, Loading, Section } from '@/components/common';
import {
  AcceptedMark,
  BlogBody,
  HelpMarks,
  ReplyItem,
  plainText,
  replyPath
} from '@/components/blog/BlogContent';
import BlogThumbs, { useBlogThumbs } from '@/components/blog/BlogThumbs';
import ReplyForm from '@/components/blog/ReplyForm';
import api from '@/api';
import { useApi } from '@/hooks/useApi';
import { loadArticleSanitizer } from '@/security/sanitizeHtml';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';
import { date as formatDate, dateMinute, number } from '@/utils/format';

/**
 * One article, and the conversation under it.
 *
 * THE BLOG IS THE VENDOR'S, AND IT IS A FORUM. An article can be answered, a
 * reply is a row of its own whose parent is the article, and a question can
 * have an accepted answer. The model - one level deep, newest activity first,
 * only approved rows public - is written down at the top of the backend's
 * repositories/legacy/articles.repository.js. This page draws it.
 *
 * THERE IS NO COVER IMAGE, and the page is set for that rather than merely
 * missing it. Nothing uploads artwork for an article, so the <Image> that
 * used to sit between the standfirst and the first paragraph rendered as a
 * full-width slab of the raised surface - a hole, in the one place a reader's
 * eye is already travelling downward. Pictures inside a body are dropped by
 * the sanitiser for the same reason (see components/blog/BlogContent).
 *
 * WHAT REPLACES IT IS THE MEASURE, and the reader chooses it. The column
 * follows the content width in the settings drawer - compact, standard, wide
 * or full - like every other page on the site. It used to be fixed at 46em
 * with a 34em body, which on the wide default left an article as a narrow
 * strip down the middle of an empty page:
 *
 *   - the HEADER, the accepted answer and the conversation take the whole
 *     column the reader chose (COLUMN below).
 *   - the BODY takes three quarters of it (MEASURE). A headline set to the
 *     same width as the paragraphs has nothing to distinguish it but size,
 *     and a paragraph as wide as a 27-inch screen is hard to follow back to
 *     the start of the next line - so the body grows with the setting, but
 *     stays the narrower of the two. On a phone both are the full width.
 *   - the byline sits under a rule rather than beside a photograph, so there
 *     is a clear line between "what this is" and "here it is".
 *
 * THE THREAD KEEPS THE READER'S PLACE. Replies come ten at a time and "show
 * older" APPENDS below what is already read, rather than replacing the page
 * the reader is halfway down. A link to one reply opens the conversation at
 * the page that holds it - not at page one with a note to go looking - and
 * "show newer" grows the window upwards from there, so both directions are
 * reachable without anything already on screen moving out from under the
 * reader's thumb.
 *
 * A QUESTION'S ACCEPTED ANSWER IS SHOWN UNDER THE QUESTION, before any reply.
 * Somebody who searched for the question came for the answer, and in a thread
 * ordered newest first it could be forty replies down.
 */

/*
 * The two widths, both derived from the reader's content-width setting
 * (app/appearance.js writes --cr-content-width; the Section around the page
 * is already that wide). `full` sets the variable to 100%, and three quarters
 * of 100% is three quarters of the column - so the one expression covers
 * every setting.
 */
const COLUMN = '100%';
const MEASURE = { base: '100%', md: 'calc(var(--cr-content-width, 1560px) * 0.75)' };

/** Replies a page. The API allows up to fifty; ten keeps a phone's first screen light. */
const PAGE_SIZE = 10;

/** The sticky header is 60px (components/layout/siteNav), plus a little air. */
const SCROLL_OFFSET = 76;

/** The reply a link points at, from `?reply=`, or null. */
function wantedReply(search) {
  const value = new URLSearchParams(search).get('reply');
  return /^\d+$/.test(value || '') ? value : null;
}

/** The article id at the end of a slug - the same rule the API reads it by. */
function idOfSlug(slug) {
  const match = String(slug || '').match(/(\d+)$/);
  return match ? match[1] : null;
}

const CLOSED_THREAD = {
  rows: [],
  total: 0,
  first: 1,
  last: 0,
  loading: null,
  error: null,
  moreError: null,
  missing: false,
  focus: null
};

/**
 * THE CONVERSATION, as a window of consecutive pages.
 *
 * `first` and `last` are the pages on screen. Opening a thread loads one page
 * - page one, or the page a linked reply is on - and the window only ever
 * GROWS from there: `more('older')` adds the next page below, `more('newer')`
 * the previous one above. Rows are de-duplicated by id as they arrive,
 * because a reply approved while somebody reads shifts every later page by
 * one and would otherwise appear twice.
 *
 * A change of `wanted` is not always a fetch. If the reply is already on
 * screen - somebody tapped another reply's time - it is a scroll; only a reply
 * outside the window reopens the thread around it.
 */
function useThread(slug, wanted) {
  const history = useHistory();
  const [thread, setThread] = useState(CLOSED_THREAD);

  const current = useRef(thread);
  current.current = thread;

  const request = useRef(0);
  const opened = useRef(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const open = useCallback(async (target) => {
    const active = ++request.current;
    setThread({ ...CLOSED_THREAD, loading: 'open' });

    let page = 1;
    let missing = false;

    if (target) {
      try {
        const found = (await api.blog.reply(target, { limit: PAGE_SIZE })).data;
        if (!mounted.current || active !== request.current) return;

        /*
         * A reply linked under the wrong article - an old link, or a thread
         * that was merged - goes to the thread it is actually in, keeping the
         * reply. The slug change reopens it there.
         */
        if (String(found.thread.id) !== idOfSlug(slug)) {
          history.replace(replyPath(found.thread.slug, target));
          return;
        }

        page = found.page || 1;
      } catch (err) {
        /* Not public, or gone. The conversation still opens, at the top, and says so. */
        missing = true;
      }
    }

    try {
      const body = (await api.blog.replies(slug, { page: page, limit: PAGE_SIZE })).data;
      if (!mounted.current || active !== request.current) return;

      const rows = (body && body.rows) || [];
      const present = !!target && rows.some((row) => String(row.id) === String(target));

      setThread({
        ...CLOSED_THREAD,
        rows: rows,
        total: (body && body.total) || 0,
        first: page,
        last: page,
        missing: missing || (!!target && !present),
        focus: present ? String(target) : null
      });
    } catch (err) {
      if (mounted.current && active === request.current) {
        setThread({ ...CLOSED_THREAD, error: err.message });
      }
    }
  }, [slug, history]);

  useEffect(() => {
    const here = opened.current === slug;

    if (here && !wanted) {
      /* The link was taken away (back to the plain address): keep what is read, drop the marker. */
      setThread((state) => ({ ...state, focus: null, missing: false }));
      return;
    }

    if (here && current.current.rows.some((row) => String(row.id) === wanted)) {
      setThread((state) => ({ ...state, focus: wanted, missing: false }));
      return;
    }

    opened.current = slug;
    open(wanted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, wanted]);

  const more = useCallback(async (direction) => {
    const state = current.current;
    if (state.loading) return;

    const page = direction === 'newer' ? state.first - 1 : state.last + 1;
    if (page < 1) return;

    const active = request.current;
    setThread((was) => ({ ...was, loading: direction, moreError: null }));

    try {
      const body = (await api.blog.replies(slug, { page: page, limit: PAGE_SIZE })).data;
      if (!mounted.current || active !== request.current) return;

      const incoming = (body && body.rows) || [];
      const total = (body && body.total) || 0;

      setThread((was) => {
        const seen = {};
        was.rows.forEach((row) => { seen[row.id] = true; });
        const fresh = incoming.filter((row) => !seen[row.id]);

        return direction === 'newer'
          ? { ...was, rows: fresh.concat(was.rows), first: page, total: total, loading: null }
          : { ...was, rows: was.rows.concat(fresh), last: page, total: total, loading: null };
      });
    } catch (err) {
      const message = err.message;
      if (mounted.current && active === request.current) {
        setThread((was) => ({ ...was, loading: null, moreError: message }));
      }
    }
  }, [slug]);

  const pages = Math.max(1, Math.ceil(thread.total / PAGE_SIZE));

  return {
    ...thread,
    hasNewer: thread.first > 1,
    hasOlder: thread.last > 0 && thread.last < pages,
    more: more,
    retry: () => open(wanted)
  };
}

export default function BlogArticle() {
  const t = useT();

  const surface = useSurface();
  const answerBg = useColorModeValue('green.50', 'whiteAlpha.100');
  const answerBorder = useColorModeValue('green.200', 'green.700');

  const { slug } = useParams();
  const location = useLocation();
  const wanted = wantedReply(location.search);

  const article = useApi(() => api.blog.article(slug), [slug]);
  const thread = useThread(slug, wanted);

  /*
   * THE THUMBS FOR EVERYTHING ON SCREEN - the article, its accepted answers
   * and the replies loaded so far - asked about in one request, and kept here
   * so a reply shown twice (as the accepted answer and in the thread) shows
   * the same medals in both places. Asked once the conversation has opened
   * too, so a page load is one question rather than one for the article and
   * another for its replies a moment later.
   */
  const onScreen = [];
  if (article.data && thread.loading !== 'open') {
    onScreen.push(article.data);
    (article.data.accepted_answers || []).forEach((answer) => onScreen.push(answer));
    thread.rows.forEach((reply) => onScreen.push(reply));
  }
  const thumbs = useBlogThumbs(onScreen);

  /*
   * SCROLLING TO A LINKED REPLY waits for the bodies above it to be drawn.
   * Every HTML body is sanitised by a chunk that loads on demand, and until it
   * arrives each one is a skeleton that is not the height of its text - so
   * measuring before then lands the reply somewhere else once the words
   * appear. The wait is for that chunk, then one frame for the layout to
   * settle; the bodies swap their skeletons out as soon as it resolves, ahead
   * of this.
   *
   * (The page scrolls SMOOTHLY - theme/index.js sets scroll-behavior on html -
   * which is why the position is worked out once and handed over whole rather
   * than nudged into place.)
   */
  const scrolled = useRef(null);

  useEffect(() => {
    if (!thread.focus || article.loading) return undefined;

    const key = slug + '#' + thread.focus;
    if (scrolled.current === key) return undefined;

    let live = true;

    loadArticleSanitizer().catch(() => null).then(() => {
      window.requestAnimationFrame(() => {
        const node = live ? document.getElementById('reply-' + thread.focus) : null;
        if (!node || scrolled.current === key) return;

        scrolled.current = key;
        const top = node.getBoundingClientRect().top + (window.pageYOffset || 0) - SCROLL_OFFSET;
        window.scrollTo(0, Math.max(0, top));
      });
    });

    return () => { live = false; };
  }, [thread.focus, thread.rows, article.loading, slug]);

  if (article.loading) {
    return (
      <Section py={{ base: 6, md: 10 }}>
        <Box maxW={COLUMN} mx="auto">
          <Loading variant="block" height="420px" />
        </Box>
      </Section>
    );
  }

  if (article.error || !article.data) {
    return (
      <Section>
        <ErrorState message={article.error} onRetry={article.reload} />
        <Flex justify="center">
          <Button as={RouterLink} to="/blog" variant="quiet">
            {t('blog.blogarticle.backToTheBlog')}
          </Button>
        </Flex>
      </Section>
    );
  }

  const data = article.data;
  const subject = data.subject;

  /*
   * THE STANDFIRST ONLY WHEN IT IS ONE. The vendor's compose page fills
   * `summary` with the first two hundred characters of the body, so for most
   * of its articles a standfirst would be the opening paragraph printed twice
   * in a row. Crystal's editorial articles have a real one, written apart.
   */
  const summary = data.summary ? String(data.summary).trim() : '';
  const opening = plainText(data.content).slice(0, 60);
  const standfirst = summary && opening.indexOf(summary.slice(0, 60)) !== 0 ? summary : '';

  /* Shelf, then the article: Blog > Product > Computer > the title. */
  const crumbs = [{ label: 'Blog', to: '/blog' }];
  if (subject && subject.parent_id && subject.parent_name) {
    crumbs.push({ label: subject.parent_name, to: '/blog?subject=' + subject.parent_id });
  }
  if (subject && subject.name) crumbs.push({ label: subject.name, to: '/blog?subject=' + subject.id });
  crumbs.push({ label: data.title });

  const question = !!data.is_help_request;
  const answers = question ? (data.accepted_answers || []) : [];

  return (
    <Section py={{ base: 6, md: 10 }}>
      {/* The header's measure: wider than the prose, narrower than the page. */}
      <Box maxW={COLUMN} mx="auto">
        <Breadcrumbs items={crumbs} />

        <Text
          fontSize="xs"
          fontWeight="700"
          color="brand.500"
          letterSpacing="0.1em"
          textTransform="uppercase"
          mt="2"
        >
          {subject && subject.name ? subject.name : data.category}
          {data.published_at ? ' · ' + formatDate(data.published_at) : ''}
        </Text>

        <HelpMarks article={data} mt="3" />

        <Heading
          size="2xl"
          color={surface.text}
          mt="4"
          letterSpacing="-0.03em"
          lineHeight="1.12"
          wordBreak="break-word"
        >
          {data.title}
        </Heading>

        {standfirst && (
          <Text
            fontSize={{ base: 'lg', md: 'xl' }}
            color={surface.muted}
            mt="5"
            lineHeight="1.6"
          >
            {standfirst}
          </Text>
        )}

        <Divider borderColor={surface.border} mt="8" />

        <Flex
          align="center"
          gap="3"
          data-gap="12"
          data-gap-wrap
          wrap="wrap"
          py="4"
          fontSize="sm"
          color={surface.muted}
        >
          <Text fontWeight="600" color={surface.strong}>
            {data.author || data.author_name || t('common.crystal')}
          </Text>
          <Box boxSize="3px" borderRadius="full" bg={surface.muted} />
          <Text>{t('common.reads', { count: number(data.view_count) })}</Text>
          <Box boxSize="3px" borderRadius="full" bg={surface.muted} />
          <Link href="#replies" display="inline-flex" alignItems="center" _hover={{ color: 'brand.500' }}>
            <Icon as={FiMessageCircle} mr="1.5" aria-hidden="true" />
            {t('blog.thread.replyCount', { count: number(data.reply_count) })}
          </Link>
        </Flex>

        <Divider borderColor={surface.border} />
      </Box>

      {/*
        THE PROSE, at the measure the reader's setting gives it - see MEASURE.
      */}
      <Box maxW={MEASURE} mx="auto" mt={{ base: 8, md: 10 }}>
        <BlogBody body={data.content} />

        {(data.origin || data.approval_num > 0) && (
          <Stack spacing="1" mt="8" fontSize="sm" color={surface.muted}>
            {data.origin && <Text>{t('blog.thread.source', { origin: data.origin })}</Text>}
            {data.approval_num > 0 && (
              <Text>
                {t('common.product.approvalNumber')}: {data.approval_num}
              </Text>
            )}
          </Stack>
        )}

        {/* At the end of the prose, where a reader decides whether it was worth it. */}
        <BlogThumbs row={data} thumbs={thumbs} />
      </Box>

      <Box maxW={COLUMN} mx="auto">
        {/* ------------------------------------------------ accepted answer */}
        {answers.map((answer) => (
          <Box
            key={answer.id}
            mt={{ base: 10, md: 12 }}
            p={{ base: 4, md: 6 }}
            borderRadius="14px"
            border="1px solid"
            borderColor={answerBorder}
            bg={answerBg}
          >
            <Flex align="center" wrap="wrap" gap="2" data-gap="8" data-gap-wrap mb="3">
              <AcceptedMark />
              <Text fontSize="sm" fontWeight="700" color={surface.text}>
                {answer.author || t('blog.thread.unknownAuthor')}
              </Text>
              <Text fontSize="xs" color={surface.muted}>
                {dateMinute(answer.published_at)}
              </Text>
            </Flex>

            <BlogBody body={answer.content} size="sm" />

            <BlogThumbs row={answer} thumbs={thumbs} size="sm" />

            <Link
              as={RouterLink}
              to={replyPath(data.slug, answer.id)}
              replace
              display="inline-block"
              mt="4"
              fontSize="sm"
              fontWeight="600"
              color="brand.500"
            >
              {t('blog.thread.seeItInTheConversation')}
            </Link>
          </Box>
        ))}

        {/* --------------------------------------------------------- thread */}
        <Box
          as="section"
          id="replies"
          mt={{ base: 12, md: 16 }}
          aria-labelledby="replies-heading"
        >
          <Flex
            align="baseline"
            justify="space-between"
            wrap="wrap"
            gap="2"
            data-gap="8"
            data-gap-wrap
            pb="3"
            borderBottom="1px solid"
            borderColor={surface.border}
          >
            <Heading id="replies-heading" size="md" color={surface.text}>
              {t('blog.thread.replies')}
              <Text as="span" ml="2" color={surface.muted} fontWeight="600">
                {number(thread.total)}
              </Text>
            </Heading>
            {thread.total > 1 && (
              <Text fontSize="xs" color={surface.muted}>
                {t('blog.thread.newestFirst')}
              </Text>
            )}
          </Flex>

          {thread.missing && (
            <Text fontSize="sm" color={surface.muted} mt="4" role="status">
              {t('blog.thread.replyUnavailable')}
            </Text>
          )}

          {thread.loading === 'open' && (
            <Box mt="6">
              <Loading variant="list" count={3} height="96px" />
            </Box>
          )}

          {thread.error && <ErrorState message={thread.error} onRetry={thread.retry} py={10} />}

          {!thread.loading && !thread.error && thread.total === 0 && (
            <EmptyState
              py={10}
              title={question ? t('blog.thread.noAnswersYet') : t('blog.thread.noRepliesYet')}
              hint={t('blog.thread.repliesAppearOnceApproved')}
            />
          )}

          {thread.hasNewer && thread.loading !== 'open' && (
            <Flex justify="center" mt="4">
              <Button
                size="sm"
                variant="quiet"
                isLoading={thread.loading === 'newer'}
                onClick={() => thread.more('newer')}
              >
                {t('blog.thread.showNewerReplies')}
              </Button>
            </Flex>
          )}

          {thread.rows.length > 0 && thread.loading !== 'open' && (
            <Stack spacing="0" divider={<Divider borderColor={surface.border} />} mt="2">
              {thread.rows.map((reply) => (
                <ReplyItem
                  key={reply.id}
                  reply={reply}
                  threadSlug={data.slug}
                  thumbs={thumbs}
                  focused={thread.focus !== null && String(reply.id) === String(thread.focus)}
                />
              ))}
            </Stack>
          )}

          {thread.moreError && (
            <Text fontSize="sm" color="red.400" textAlign="center" mt="4" role="alert">
              {thread.moreError}
            </Text>
          )}


          {thread.rows.length > 0 && thread.loading !== 'open' && (
            <Flex direction="column" align="center" mt="6" gap="2" data-gap="8" data-gap-column>
              {thread.hasOlder && (
                <Button
                  variant="outlineBrand"
                  size="sm"
                  isLoading={thread.loading === 'older'}
                  onClick={() => thread.more('older')}
                >
                  {t('blog.thread.showOlderReplies')}
                </Button>
              )}
              {(thread.hasOlder || thread.hasNewer) && (
                <Text fontSize="xs" color={surface.muted}>
                  {t('blog.thread.showingOf', {
                    shown: number(thread.rows.length),
                    total: number(thread.total)
                  })}
                </Text>
              )}
            </Flex>
          )}

          {/*
            ANSWERING IT, UNDER IT.

            The box is the last thing in the conversation rather than a page
            somewhere else (the vendor sends the member to /blog/add/<id> and
            loses their place), and what it says before anybody types is in
            components/blog/BlogCompose.js: a reply is read by staff first,
            and there is one a day.

            It is drawn here even when the thread is empty - an unanswered
            question is the one most worth answering - and it does NOT add the
            reply to the list above afterwards, because the reply is not
            published yet and pretending otherwise would be a lie the blog
            cannot keep.
          */}
          <ReplyForm article={data} />
        </Box>

        <Flex
          mt={{ base: 12, md: 16 }}
          pt="8"
          borderTop="1px solid"
          borderColor={surface.border}
          justify="center"
        >
          <Button as={RouterLink} to="/blog" variant="quiet" leftIcon={<ArrowBackIcon />}>
            {t('common.allArticles')}
          </Button>
        </Flex>
      </Box>
    </Section>
  );
}
