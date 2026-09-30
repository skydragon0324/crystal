import React, { useEffect, useState } from 'react';
import { Link as RouterLink, useHistory, useParams } from 'react-router-dom';
import {
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Link,
  Stack,
  Text,
  useToast
} from '@chakra-ui/react';
import { ArrowBackIcon } from '@chakra-ui/icons';

import { ErrorState, Loading, SelectField } from '@/components/common';
import { ARTICLE, AllowanceNote, BodyField, REPLY, hasWords, useAllowance } from '@/components/blog/BlogCompose';
import api from '@/api';
import { useApi } from '@/hooks/useApi';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * WRITING ONE - a page, because that is what writing an article is.
 *
 * The vendor's is a page too, and what is different here is what it says
 * before anybody types: that staff read the post before it appears, and that
 * there is one article and one reply a day. The vendor mentions neither until
 * it refuses a finished draft. See components/blog/BlogCompose.js.
 *
 * IT IS ALSO THE EDIT SCREEN. /account/blog/write opens empty;
 * /account/blog/write/<id> opens on something the member already wrote - a
 * draft, one waiting to be read, one that was refused, or a published post.
 * The API allows the same four and decides what a save costs; this page says
 * which of them it is holding before the member changes anything, because
 * "saving this takes it off the blog until it is read again" is not something
 * to find out from a toast afterwards.
 *
 * A REPLY CAN BE EDITED HERE and its title and shelf are not offered: they
 * belong to the thread it is in, which is also what the line at the top links
 * to. Replies are WRITTEN under the thread itself (components/blog/ReplyForm)
 * - a conversation is answered where it is being read.
 *
 * TWO BUTTONS, AND THE QUIET ONE IS THE DRAFT. Sending is the thing somebody
 * came here to do; the draft is the way out for a post that is not finished,
 * and it costs nothing - a draft is not counted against the day (the vendor
 * counts it, and then skips the check when saving one, so its own limit
 * fires on posts nobody has ever submitted).
 */

/** The shelves as a flat list of options: the six at the top, then what sits under them. */
function shelfOptions(roots) {
  const out = [];

  (roots || []).forEach((root) => {
    out.push({ value: String(root.id), label: root.name });
    (root.children || []).forEach((child) => {
      out.push({ value: String(child.id), label: root.name + ' › ' + child.name });
    });
  });

  return out;
}

const EMPTY = { title: '', subject_id: '', content: '', origin: '' };

export default function WriteArticle() {
  const t = useT();
  const surface = useSurface();
  const toast = useToast();
  const history = useHistory();

  const { id } = useParams();

  const subjects = useApi(() => api.blog.subjects(), []);
  const existing = useApi(() => (id ? api.account.myArticle(id) : Promise.resolve({ data: null })), [id]);

  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const post = existing.data;
  const isReply = !!post && post.kind === REPLY;
  const allowance = useAllowance(isReply ? REPLY : ARTICLE);

  /* The form is filled once, from what came back - and not again, or typing would be undone. */
  useEffect(() => {
    if (!post) return;
    setForm({
      title: post.title || '',
      subject_id: post.subject_id ? String(post.subject_id) : '',
      content: post.content || '',
      origin: post.origin || ''
    });
  }, [post]);

  const set = (patch) => setForm((current) => ({ ...current, ...patch }));

  /**
   * WHAT A SAVE COSTS, in the member's words, and it depends on what they
   * are holding: a published post leaves the blog until it has been read
   * again, and a refused one goes back into the queue.
   */
  const standing = () => {
    if (!post) return null;
    if (post.status === 'PUBLISHED') return t('blog.compose.savingSendsItBack');
    if (post.status === 'REVIEW') return t('blog.compose.itIsWaitingToBeRead');
    if (post.status === 'ARCHIVED') return t('blog.compose.itWasNotPublished');
    return t('blog.compose.onlyYouCanSeeADraft');
  };

  const save = async (status) => {
    /* Markup, so "is there anything in it" is about words - see hasWords. */
    const body = form.content;

    /* Said here as well as by the API, so a mistake does not cost a round trip. */
    if (!isReply && !form.title.trim()) return setError(t('blog.compose.aTitleIsNeeded'));
    if (!isReply && !form.subject_id) return setError(t('blog.compose.aShelfIsNeeded'));
    if (!hasWords(body)) return setError(t('blog.compose.someWordsAreNeeded'));

    setBusy(status);
    setError(null);

    const payload = isReply
      ? { content: body, status: status }
      : {
        title: form.title.trim(),
        subject_id: form.subject_id,
        content: body,
        origin: form.origin.trim(),
        status: status
      };

    try {
      if (id) await api.account.editArticle(id, payload);
      else await api.account.writeArticle(payload);

      toast({
        status: 'success',
        title: status === 'DRAFT' ? t('blog.compose.draftSaved') : t('blog.compose.itIsWithUs'),
        description: status === 'DRAFT'
          ? t('blog.compose.onlyYouCanSeeADraft')
          : t('blog.compose.aMemberOfStaffReadsIt'),
        duration: 7000,
        isClosable: true
      });

      history.push('/account/blog');
    } catch (err) {
      setError(err.message);
      allowance.applyRefusal(err);
      setBusy(null);
    }
  };

  if (existing.loading || subjects.loading) {
    return <Loading variant="block" height="420px" />;
  }

  if (existing.error) {
    return <ErrorState message={existing.error} onRetry={existing.reload} />;
  }

  const options = shelfOptions(subjects.data);

  /*
   * WHETHER THIS SAVE SPENDS THE DAY, which is what decides whether the
   * allowance is worth mentioning at all. A post that is ALREADY waiting to
   * be read is the same submission being corrected: the API neither counts it
   * again nor moves it in the queue, so a line about today's allowance over
   * it would be both irrelevant and alarming.
   */
  const costsTheDay = !post || post.status !== 'REVIEW';
  const spent = allowance.left === 0;
  const blocked = spent && costsTheDay;

  return (
    <Box maxW="46em">
      <Heading size="lg" color={surface.text}>
        {id ? t('blog.compose.editYourPost') : t('blog.compose.writeAnArticle')}
      </Heading>

      {isReply && post.thread && (
        <Text fontSize="sm" color={surface.muted} mt="2">
          {post.thread.is_public && post.thread.slug ? (
            <Link as={RouterLink} to={'/blog/' + post.thread.slug} color="brand.500">
              {t('blog.compose.aReplyIn', { title: post.thread.title || '' })}
            </Link>
          ) : t('blog.compose.aReplyIn', { title: (post.thread.title || '') })}
        </Text>
      )}

      {post && (
        <Text fontSize="sm" color={post.status === 'PUBLISHED' ? 'orange.400' : surface.muted} mt="2">
          {standing()}
        </Text>
      )}

      {!allowance.loading && allowance.line && costsTheDay && (
        <Box mt="5" pt="5" borderTop="1px solid" borderColor={surface.border}>
          <AllowanceNote
            kind={isReply ? REPLY : ARTICLE}
            left={allowance.left}
            resetsAt={allowance.resetsAt}
          />
        </Box>
      )}

      <Stack spacing="5" mt="6">
        {!isReply && (
          <React.Fragment>
            <FormControl isRequired>
              <FormLabel fontSize="sm">{t('blog.compose.title')}</FormLabel>
              <Input
                value={form.title}
                onChange={(event) => set({ title: event.target.value })}
                placeholder={t('blog.compose.whatIsItAbout')}
                maxLength={200}
              />
            </FormControl>

            <FormControl isRequired>
              <FormLabel fontSize="sm">{t('blog.compose.shelf')}</FormLabel>
              <SelectField
                value={form.subject_id || null}
                onChange={(value) => set({ subject_id: value || '' })}
                options={options}
                allowEmpty
                emptyLabel={t('blog.compose.chooseAShelf')}
                isSearchable={false}
              />
            </FormControl>
          </React.Fragment>
        )}

        <FormControl isRequired>
          <FormLabel fontSize="sm">
            {isReply ? t('blog.compose.yourReply') : t('blog.compose.yourArticle')}
          </FormLabel>
          <BodyField
            value={form.content}
            onChange={(value) => set({ content: value })}
            rows={isReply ? 8 : 16}
            isDisabled={!!busy}
            placeholder={t('blog.compose.writeItHere')}
          />
        </FormControl>

        {!isReply && (
          <FormControl>
            <FormLabel fontSize="sm">{t('blog.compose.source')}</FormLabel>
            <Input
              value={form.origin}
              onChange={(event) => set({ origin: event.target.value })}
              placeholder={t('blog.compose.whereTheWordsCameFrom')}
              maxLength={200}
            />
          </FormControl>
        )}
      </Stack>

      {error && (
        <Text fontSize="sm" color="red.400" mt="4" role="alert">{error}</Text>
      )}

      <Flex
        mt="8"
        pt="5"
        borderTop="1px solid"
        borderColor={surface.border}
        align="center"
        justify="space-between"
        gap="3"
        data-gap="12"
        data-gap-wrap
        wrap="wrap"
      >
        <Button
          as={RouterLink}
          to="/account/blog"
          variant="quiet"
          size="sm"
          leftIcon={<ArrowBackIcon />}
        >
          {t('blog.compose.backToYourWriting')}
        </Button>

        <Flex gap="3" data-gap="12" data-gap-wrap wrap="wrap">
          {/* A draft is only offered where it can be saved: a submitted post cannot go back in the drawer. */}
          {(!post || post.status === 'DRAFT' || post.status === 'ARCHIVED') && (
            <Button
              variant="outlineBrand"
              size="sm"
              isLoading={busy === 'DRAFT'}
              isDisabled={busy === 'REVIEW'}
              onClick={() => save('DRAFT')}
            >
              {t('blog.compose.saveAsADraft')}
            </Button>
          )}

          <Button
            colorScheme="brand"
            size="sm"
            isLoading={busy === 'REVIEW'}
            isDisabled={busy === 'DRAFT' || blocked}
            onClick={() => save('REVIEW')}
          >
            {t('blog.compose.sendItToBeRead')}
          </Button>
        </Flex>
      </Flex>
    </Box>
  );
}
