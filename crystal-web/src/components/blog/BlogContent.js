import React, { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Badge, Box, Flex, Icon, Link, Skeleton, Stack, Text, useColorModeValue } from '@chakra-ui/react';
import { FiCheckCircle, FiHelpCircle } from 'react-icons/fi';

import { StatusBadge } from '@/components/common';
import BlogThumbs from '@/components/blog/BlogThumbs';
import { loadArticleSanitizer, loadedArticleSanitizer } from '@/security/sanitizeHtml';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';
import { dateMinute } from '@/utils/format';

/**
 * The pieces a blog thread is drawn from, shared by the index, the article
 * page and the member's own list - the same way components/notices is shared
 * by the notice dialog and the notification page.
 *
 * WHAT A THREAD IS lives in one place, at the top of the backend's
 * repositories/legacy/articles.repository.js: an article, and the replies
 * whose parent it is, one level deep, newest activity first.
 */

/** Where a reply lives: its thread, positioned at it. Replies have no page of their own. */
export function replyPath(threadSlug, replyId) {
  return '/blog/' + threadSlug + '?reply=' + replyId;
}

/**
 * A stored body is one of TWO THINGS, and the vendor's data has both.
 *
 * The vendor's editor writes HTML. Crystal's own editorial articles were
 * written as plain text with a blank line between paragraphs. Feeding the
 * second through an HTML renderer runs every paragraph into one; printing the
 * first as text shows its tags. So a body is looked at before it is drawn.
 */
export function isHtml(body) {
  return /<\/?[a-z][a-z0-9]*[\s/>]/i.test(String(body || ''));
}

/** The words of a stored body, for comparing - never for inserting. */
export function plainText(body) {
  return String(body || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, '\'')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * AN ARTICLE'S OR A REPLY'S BODY.
 *
 * HTML IS SANITISED HERE, EVERY TIME, with the same allow-list the notices
 * use minus pictures (security/sanitizeHtml explains both). This page used
 * to be safe by accident - it printed the body as text, so the vendor's HTML
 * showed its tags but could not run. Rendering it properly is what makes the
 * sanitiser necessary, and there is no path on which the HTML is inserted
 * without having been through it: until the sanitiser's chunk arrives the
 * body is a skeleton, and if it never arrives it is a sentence saying so.
 *
 * NO PICTURES. The blog is text-first; `img` is not in the blog's allow-list,
 * so a picture embedded in a body is dropped and the words around it stay.
 */
export function BlogBody({ body, size }) {
  const t = useT();
  const surface = useSurface();

  const html = isHtml(body);
  const [sanitize, setSanitize] = useState(() => loadedArticleSanitizer());
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!html || sanitize) return undefined;

    let live = true;
    loadArticleSanitizer().then(
      (fn) => { if (live) setSanitize(() => fn); },
      () => { if (live) setFailed(true); }
    );

    return () => { live = false; };
  }, [html, sanitize]);

  const safe = useMemo(() => (html && sanitize ? sanitize(body) : null), [html, sanitize, body]);

  const small = size === 'sm';
  const fontSize = small ? 'md' : { base: 'md', md: 'lg' };
  const lineHeight = small ? '1.75' : '1.85';

  if (!html) {
    const paragraphs = String(body || '')
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean);

    return (
      <Stack spacing={small ? 3 : 6}>
        {paragraphs.map((block, index) => (
          <Text
            key={index}
            fontSize={fontSize}
            lineHeight={lineHeight}
            color={surface.strong}
            whiteSpace="pre-line"
            wordBreak="break-word"
          >
            {block}
          </Text>
        ))}
      </Stack>
    );
  }

  if (safe === null) {
    return failed ? (
      <Text fontSize="sm" color={surface.muted}>
        {t('blog.thread.bodyUnavailable')}
      </Text>
    ) : (
      <Stack spacing="3" aria-busy="true">
        <Skeleton height="14px" />
        <Skeleton height="14px" />
        <Skeleton height="14px" width="70%" />
      </Stack>
    );
  }

  return (
    <Box
      color={surface.strong}
      fontSize={fontSize}
      lineHeight={lineHeight}
      wordBreak="break-word"
      sx={{
        'p, ul, ol, blockquote, pre, table, h1, h2, h3, h4, h5, h6': { marginBottom: small ? '0.75rem' : '1.25rem' },
        '& > *:last-child': { marginBottom: 0 },
        'h1, h2, h3, h4, h5, h6': { fontWeight: 700, lineHeight: 1.3, color: surface.text },
        h1: { fontSize: '1.4em' },
        h2: { fontSize: '1.25em' },
        'h3, h4, h5, h6': { fontSize: '1.1em' },
        a: { color: 'var(--chakra-colors-brand-500)', textDecoration: 'underline' },
        ul: { paddingLeft: '1.25rem', listStyle: 'disc' },
        ol: { paddingLeft: '1.25rem' },
        li: { marginBottom: '0.25rem' },
        blockquote: { borderLeft: '3px solid', borderColor: surface.border, paddingLeft: '1rem', color: surface.muted },
        pre: { overflowX: 'auto', fontSize: '0.875em' },
        /* A table wider than a phone scrolls inside itself rather than pushing the page sideways. */
        table: { display: 'block', maxWidth: '100%', overflowX: 'auto', borderCollapse: 'collapse' },
        'th, td': { border: '1px solid', borderColor: surface.border, padding: '0.35rem 0.6rem' }
      }}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}

/**
 * WHERE A QUESTION HAS GOT TO, in the reader's words.
 *
 * One call per word rather than a table of addresses, so each is a literal
 * the catalogue checks can find.
 */
function helpWords(t, status) {
  if (status === 'ANSWERED') return t('blog.help.answered');
  if (status === 'RESOLVED') return t('blog.help.resolved');
  if (status === 'CLOSED') return t('blog.help.closed');
  if (status === 'VERIFYING') return t('blog.help.verifying');
  return t('blog.help.open');
}

/*
 * Colour says whether somebody still needs to act: an open question is the
 * one a passing reader could answer, so it is the warm one.
 */
const HELP_COLOURS = {
  OPEN: 'orange',
  VERIFYING: 'blue',
  ANSWERED: 'green',
  RESOLVED: 'green',
  CLOSED: 'gray'
};

/**
 * A help request's two marks: that it IS a question, and where it has got
 * to. Nothing at all for an ordinary article.
 */
export function HelpMarks({ article, ...rest }) {
  const t = useT();

  if (!article || !article.is_help_request) return null;
  const status = article.help_status || 'OPEN';

  return (
    <Flex align="center" wrap="wrap" gap="2" data-gap="8" data-gap-wrap {...rest}>
      <Badge
        variant="outline"
        colorScheme="purple"
        borderRadius="6px"
        px="2"
        py="0.5"
        fontSize="xs"
        fontWeight="600"
        textTransform="none"
        display="inline-flex"
        alignItems="center"
      >
        <Icon as={FiHelpCircle} mr="1" aria-hidden="true" />
        {t('blog.help.request')}
      </Badge>
      <StatusBadge value={status} colorScheme={HELP_COLOURS[status] || 'gray'}>
        {helpWords(t, status)}
      </StatusBadge>
    </Flex>
  );
}

/** The accepted-answer mark, wherever the answer is drawn. */
export function AcceptedMark() {
  const t = useT();

  return (
    <Badge
      colorScheme="green"
      borderRadius="6px"
      px="2"
      py="0.5"
      fontSize="xs"
      fontWeight="700"
      textTransform="none"
      display="inline-flex"
      alignItems="center"
    >
      <Icon as={FiCheckCircle} mr="1" aria-hidden="true" />
      {t('blog.thread.acceptedAnswer')}
    </Badge>
  );
}

/**
 * ONE REPLY IN A THREAD.
 *
 * The author first, because in a conversation WHO said it is how a reader
 * finds their place; then when, to the minute - several replies can land in
 * one morning, and the day alone cannot put them in order.
 *
 * THE TIME IS THE PERMALINK. That is the convention every forum a reader has
 * used follows, and it costs no extra control on a phone. It replaces rather
 * than pushes, so copying links to three replies does not leave three steps
 * in the back button.
 *
 * `focused` is the reply a link pointed at: tinted and ruled on the left, so
 * that after the page has scrolled there is no doubt which one was meant.
 */
export function ReplyItem({ reply, threadSlug, focused, thumbs }) {
  const t = useT();
  const surface = useSurface();
  const focusBg = useColorModeValue('brand.50', 'whiteAlpha.100');

  return (
    <Box
      as="article"
      id={'reply-' + reply.id}
      py={{ base: 5, md: 6 }}
      pl={{ base: 3, md: 4 }}
      pr={{ base: 3, md: 4 }}
      mx={{ base: -3, md: -4 }}
      borderRadius="10px"
      borderLeft="3px solid"
      borderColor={focused ? 'brand.500' : 'transparent'}
      bg={focused ? focusBg : 'transparent'}
      transition="background-color 400ms ease, border-color 400ms ease"
    >
      <Flex align="center" wrap="wrap" gap="2" data-gap="8" data-gap-wrap mb="3">
        <Text fontWeight="700" fontSize="sm" color={surface.text}>
          {reply.author || t('blog.thread.unknownAuthor')}
        </Text>
        <Link
          as={RouterLink}
          to={replyPath(threadSlug, reply.id)}
          replace
          fontSize="xs"
          color={surface.muted}
          _hover={{ color: 'brand.500' }}
        >
          {dateMinute(reply.published_at)}
        </Link>
        {reply.is_accepted && <AcceptedMark />}
      </Flex>

      <BlogBody body={reply.content} size="sm" />

      {/* The medals, when the page keeps them - the member's own list does not. */}
      {thumbs && <BlogThumbs row={reply} thumbs={thumbs} size="sm" />}
    </Box>
  );
}
