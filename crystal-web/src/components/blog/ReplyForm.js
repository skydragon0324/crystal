import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Box, Button, Flex, Heading, Icon, Link, Text, useColorModeValue } from '@chakra-ui/react';
import { FiCheckCircle, FiCornerDownRight } from 'react-icons/fi';

import { AllowanceNote, BodyField, REPLY, hasWords, useAllowance } from '@/components/blog/BlogCompose';
import api from '@/api';
import { selectIsSignedIn } from '@/app/authSlice';
import useSignIn from '@/hooks/useSignIn';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * ANSWERING A THREAD, WHERE THE THREAD IS.
 *
 * The vendor sends a reply to a compose page of its own, at
 * /blog/add/<article id>, so answering a conversation means leaving it - and
 * coming back to find the page scrolled to the top and the reply nowhere,
 * because it is waiting for approval. Here the box is the last thing under
 * the conversation, which is where somebody reading to the end already is.
 *
 * THE THREE STATES IT CAN BE IN, and each one is answered before anything is
 * typed rather than after:
 *
 *   SIGNED OUT      a line saying replies come from members, and the button
 *                   that signs them in and brings them back - the same
 *                   treatment the thumbs give (components/blog/BlogThumbs).
 *   ALLOWANCE SPENT no box at all, and the hour it comes back. Offering an
 *                   empty box that can only be refused is the vendor's
 *                   mistake, and it costs somebody a written reply.
 *   POSTED          the box is replaced by what happens next, with the way
 *                   to follow it. It is NOT added to the thread on screen:
 *                   it is not published, and drawing it there would be a
 *                   promise the blog has not made.
 */
export default function ReplyForm({ article }) {
  const t = useT();
  const surface = useSurface();
  const signedIn = useSelector(selectIsSignedIn);
  const signIn = useSignIn();

  const doneBg = useColorModeValue('green.50', 'whiteAlpha.100');
  const doneBorder = useColorModeValue('green.200', 'green.700');

  const allowance = useAllowance(REPLY);

  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [posted, setPosted] = useState(null);

  const post = async () => {
    setBusy(true);
    setError(null);

    try {
      const answer = await api.account.writeArticle({ parent_id: article.id, content: body });
      setPosted((answer && answer.data) || {});
      setBody('');
      allowance.reload();
    } catch (err) {
      /* The API's wording is already in the reader's language; and its
         refusal carries today's allowance, which corrects the line above. */
      setError(err.message);
      allowance.applyRefusal(err);
    } finally {
      setBusy(false);
    }
  };

  const heading = (
    <Flex align="center" gap="2" data-gap="8" data-gap-wrap wrap="wrap" mb="3">
      <Icon as={FiCornerDownRight} color={surface.muted} aria-hidden="true" />
      <Heading size="sm" color={surface.text}>{t('blog.compose.addYourReply')}</Heading>
    </Flex>
  );

  if (posted) {
    return (
      <Box
        mt={{ base: 8, md: 10 }}
        p={{ base: 4, md: 5 }}
        borderRadius="12px"
        border="1px solid"
        borderColor={doneBorder}
        bg={doneBg}
        role="status"
      >
        <Flex align="center" gap="2" data-gap="8" data-gap-wrap wrap="wrap" mb="2">
          <Icon as={FiCheckCircle} color="green.400" aria-hidden="true" />
          <Text fontWeight="700" color={surface.text}>{t('blog.compose.replyIsWithUs')}</Text>
        </Flex>
        <Text fontSize="sm" color={surface.muted}>
          {t('blog.compose.aMemberOfStaffReadsIt')}
        </Text>
        <Link
          as={RouterLink}
          to="/account/blog"
          display="inline-block"
          mt="3"
          fontSize="sm"
          fontWeight="600"
          color="brand.500"
        >
          {t('blog.compose.seeYourWriting')}
        </Link>
      </Box>
    );
  }

  if (!signedIn) {
    return (
      <Box mt={{ base: 8, md: 10 }} pt="6" borderTop="1px solid" borderColor={surface.border}>
        {heading}
        <Text fontSize="sm" color={surface.muted}>{t('blog.compose.repliesComeFromMembers')}</Text>
        <Button mt="3" size="sm" variant="outlineBrand" onClick={signIn}>
          {t('blog.compose.signInToReply')}
        </Button>
      </Box>
    );
  }

  const spent = allowance.left === 0;

  return (
    <Box mt={{ base: 8, md: 10 }} pt="6" borderTop="1px solid" borderColor={surface.border}>
      {heading}

      {!allowance.loading && allowance.line && (
        <AllowanceNote kind={REPLY} left={allowance.left} resetsAt={allowance.resetsAt} mb="4" />
      )}

      {!spent && (
        <React.Fragment>
          <BodyField
            value={body}
            onChange={setBody}
            rows={6}
            isDisabled={busy}
            placeholder={t('blog.compose.whatWouldYouLikeToSay')}
          />

          <Flex justify="flex-end" mt="3">
            <Button
              size="sm"
              colorScheme="brand"
              isLoading={busy}
              isDisabled={!hasWords(body)}
              onClick={post}
            >
              {t('blog.compose.sendReply')}
            </Button>
          </Flex>
        </React.Fragment>
      )}

      {/*
        THE REFUSAL OUTLIVES THE BOX.

        A 409 carries today's allowance with it, which closes the box - and
        the first version of this drew the message INSIDE the box, so the
        sentence explaining why the reply was not taken disappeared in the
        same frame as the button that was pressed. It sits outside, where
        what is left cannot take it away.
      */}
      {error && (
        <Text fontSize="sm" color="red.400" mt="3" role="alert">{error}</Text>
      )}

      {spent && (
        <Link
          as={RouterLink}
          to="/account/blog"
          fontSize="sm"
          fontWeight="600"
          color="brand.500"
          mt="3"
          display="inline-block"
        >
          {t('blog.compose.seeYourWriting')}
        </Link>
      )}
    </Box>
  );
}
