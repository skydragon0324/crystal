import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { Box, Flex, Icon, Skeleton, Text } from '@chakra-ui/react';
import { FiClock, FiEye } from 'react-icons/fi';

import api from '@/api';
import { selectIsSignedIn } from '@/app/authSlice';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';
import { dateMinute } from '@/utils/format';

/**
 * THE TWO THINGS A MEMBER HAS TO KNOW BEFORE THEY START TYPING, and the box
 * they type into. Shared by the compose page and the reply box under a
 * thread, because both have to say the same two things.
 *
 *   1. SOMEBODY READS IT FIRST. Nothing a member writes appears on the blog
 *      when they press the button: it goes to staff, who publish it or do
 *      not. Every rule behind that is the vendor's, and they are listed in
 *      the backend's services/blog.service.js.
 *
 *   2. ONE ARTICLE AND ONE REPLY A DAY. The vendor's own blog has this limit
 *      and mentions it in exactly one place - the refusal, over a post
 *      somebody has already finished writing. Worse, on its website the check
 *      is broken in both directions (it never fires, and when it does it
 *      refuses the wrong kind), so a member could not learn the rule from
 *      using it either.
 *
 * SO THE ALLOWANCE IS ASKED FOR WHEN THE BOX OPENS, not when it is sent, and
 * the answer is a sentence above the box: what is left today, or, when it is
 * spent, WHEN IT COMES BACK - to the minute, from the server's own clock,
 * because "tomorrow" is not an answer to somebody posting at half past
 * eleven at night.
 *
 * The API refuses a spent allowance whatever this says, and its refusal
 * carries the same numbers - so a box left open since yesterday and a box
 * opened just now end up telling the reader the same thing.
 */

/** What the member is writing. The API counts and refuses the two separately. */
export const ARTICLE = 'ARTICLE';
export const REPLY = 'REPLY';

/**
 * What is left of today, for one kind.
 *
 * `left` is undefined until the answer arrives: a box must not announce "one
 * article left" before it knows, and must not grey itself out either. A
 * failure to load leaves it undefined as well - the allowance is a courtesy,
 * and the API is still the thing that decides.
 */
export function useAllowance(kind) {
  /*
   * NOT ASKED FOR ON BEHALF OF NOBODY. The endpoint is under /account and
   * answers 401 without a session - and a signed-out reader is shown the way
   * in rather than an allowance, so the question has no answer to want.
   */
  const signedIn = useSelector(selectIsSignedIn);

  const [allowance, setAllowance] = useState(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const load = useCallback(async () => {
    if (!signedIn) {
      setAllowance(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const answer = await api.account.articleAllowance();
      if (mounted.current) setAllowance((answer && answer.data) || null);
    } catch (err) {
      if (mounted.current) setAllowance(null);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [signedIn]);

  useEffect(() => { load(); }, [load]);

  /**
   * A refusal carries the allowance it was refused against, so the sentence
   * above the box is corrected by the very error that proved it wrong -
   * without another request, and without the page guessing.
   */
  const applyRefusal = useCallback((err) => {
    const detail = err && err.detail;
    if (detail && detail.allowance) setAllowance(detail.allowance);
  }, []);

  const line = allowance ? allowance[kind === REPLY ? 'reply' : 'article'] : null;

  return {
    loading,
    allowance,
    line,
    left: line ? line.left : undefined,
    resetsAt: allowance ? allowance.resets_at : null,
    reload: load,
    applyRefusal
  };
}

/**
 * The sentence above the box.
 *
 * It is not a warning panel: an outlined box with an exclamation mark for
 * something that happens to every post every time is noise by the second
 * visit. It is a line of small type saying who reads it next and what is
 * left, tinted only when the allowance is gone - which is the one state the
 * member has to act on.
 */
export function AllowanceNote({ kind, left, resetsAt, ...rest }) {
  const t = useT();
  const surface = useSurface();

  const spent = left === 0;
  const reply = kind === REPLY;

  return (
    <Box
      fontSize="sm"
      color={spent ? undefined : surface.muted}
      borderRadius="10px"
      {...rest}
    >
      <Flex align="flex-start" gap="2" data-gap="8" data-gap-wrap wrap="wrap">
        <Icon as={FiEye} mt="0.5" flexShrink={0} aria-hidden="true" />
        <Text>
          {reply
            ? t('blog.compose.repliesAreReadFirst')
            : t('blog.compose.articlesAreReadFirst')}
        </Text>
      </Flex>

      <Flex align="flex-start" gap="2" data-gap="8" data-gap-wrap wrap="wrap" mt="2">
        <Icon as={FiClock} mt="0.5" flexShrink={0} aria-hidden="true" color={spent ? 'orange.400' : undefined} />
        <Text color={spent ? 'orange.400' : undefined} fontWeight={spent ? '600' : undefined}>
          {spent
            ? (reply
              ? t('blog.compose.replyAllowanceSpent', { when: dateMinute(resetsAt) })
              : t('blog.compose.articleAllowanceSpent', { when: dateMinute(resetsAt) }))
            : (reply
              ? t('blog.compose.oneReplyLeftToday')
              : t('blog.compose.oneArticleLeftToday'))}
        </Text>
      </Flex>
    </Box>
  );
}

/*
 * THE BODY IS WRITTEN IN THE CONSOLE'S OWN EDITOR.
 *
 * It was a textarea storing plain text, on the argument that the storefront
 * had no rich text editor and the backend took markup straight out again.
 * The member asked for the editor ("For writing blog, I have to use
 * RichTextEditor"), so both halves moved: the body is HTML now, sanitised
 * against a fixed allowlist when it is saved and again when it is drawn, and
 * a manager editing the same post in the console sees the same markup.
 *
 * TINYMCE IS FETCHED WHEN SOMEBODY WRITES, not when somebody reads: half a
 * megabyte of editor has no business in the bundle of a page that lists
 * articles, so it is its own chunk behind React.lazy, with a skeleton the
 * height of the box it will become.
 */
const RichTextEditor = lazy(() => import(/* webpackChunkName: "editor" */ '@/components/common/RichTextEditor'));

/** A line of the editor, near enough, for sizing the box and its skeleton. */
const LINE = 26;

/**
 * Did somebody actually write something?
 *
 * An "empty" editor is not an empty string: TinyMCE hands back `<p></p>`, or
 * a paragraph holding one non-breaking space. Both are markup with no words
 * in them, and both used to pass a `.trim()` check and be refused by the API
 * a round trip later.
 */
export function hasWords(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, 'x')
    .trim().length > 0;
}

export function BodyField({ value, onChange, placeholder, rows, isDisabled, ariaLabel, ...rest }) {
  const t = useT();
  const surface = useSurface();
  const height = (rows || 14) * LINE;

  return (
    <Box {...rest}>
      <Suspense fallback={<Skeleton height={height + 'px'} borderRadius="12px" />}>
        <RichTextEditor
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          ariaLabel={ariaLabel || placeholder}
          height={height}
          isDisabled={isDisabled}
        />
      </Suspense>
      <Text fontSize="xs" color={surface.muted} mt="1.5">
        {t('blog.compose.picturesAreNotShown')}
      </Text>
    </Box>
  );
}
