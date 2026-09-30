import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Box,
  Button,
  Flex,
  Icon,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverFooter,
  PopoverTrigger,
  Portal,
  Text,
  Tooltip,
  VisuallyHidden,
  useColorModeValue,
  useToast
} from '@chakra-ui/react';
import { FiThumbsUp } from 'react-icons/fi';

import api from '@/api';
import { selectIsSignedIn, selectUser } from '@/app/authSlice';
import useSignIn from '@/hooks/useSignIn';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';
import { number } from '@/utils/format';

/**
 * THE THREE THUMBS - gold, silver, bronze - on an article or a reply.
 *
 * The rules are the vendor's (submitBlogRating; every one is written down at
 * the top of the backend's repositories/legacy/thumbs.repository.js): a
 * signed-in member, not on their own writing, ONE thumb per row of any
 * colour, and never changed or taken back. This file is how a reader meets
 * those rules without being surprised by them:
 *
 *   SIGNED OUT, a medal still opens - to say thumbs come from members and to
 *   sign in right there. The sign-in brings the reader back to this page, and
 *   the buttons learn what they gave the moment the session exists.
 *
 *   BECAUSE A THUMB IS FOR GOOD, pressing a medal asks once, next to the
 *   medal, before anything is sent. A mis-tap on a phone would otherwise be a
 *   permanent gold thumb on the wrong reply.
 *
 *   ONCE GIVEN, the medal the reader chose stays filled and the other two
 *   stand down, each saying which one was given. The counts are the SERVER'S
 *   answer to the thumb, not the old number plus one - two readers pressing
 *   at once both see the real total.
 *
 *   ON THE READER'S OWN WRITING the counts are shown and nothing is
 *   pressable; the vendor refuses the thumb, so offering it would only lead
 *   to an error.
 *
 * The vendor's page reloaded itself half a second after a thumb and lost the
 * reader's place in the thread; here nothing moves but the medal.
 */

export const MEDALS = [
  { kind: 'GOLD', field: 'gold', name: 'blog.thumbs.medalGold', thumb: 'blog.thumbs.gold', light: 'yellow.500', dark: 'yellow.300', tint: 'yellow.50' },
  { kind: 'SILVER', field: 'silver', name: 'blog.thumbs.medalSilver', thumb: 'blog.thumbs.silver', light: 'gray.500', dark: 'gray.300', tint: 'gray.100' },
  { kind: 'BRONZE', field: 'bronze', name: 'blog.thumbs.medalBronze', thumb: 'blog.thumbs.bronze', light: 'orange.600', dark: 'orange.300', tint: 'orange.50' }
];

const NO_COUNTS = { gold: 0, silver: 0, bronze: 0 };

/** A thumb the ledger holds without a colour - an old app row. It still counts as given. */
const GIVEN_UNKNOWN = 'UNKNOWN';

/** The API takes at most a hundred ids a request. */
const IDS_PER_REQUEST = 100;

function medalOf(kind) {
  return MEDALS.filter((medal) => medal.kind === kind)[0] || null;
}

/**
 * WHAT THE READER HAS GIVEN, for every row on a page.
 *
 * `rows` is what is on screen - the article and the replies loaded so far,
 * each with `id`, `author` and `recommendations`. One request asks about all
 * of them, and a page of older replies asks only about the new rows. Signing
 * in or out starts again, because the answers belong to a person.
 *
 * `of(row)` is what a row's medals draw from:
 *   counts     the server's latest numbers for it
 *   mine       undefined (not known yet), false, a kind, or GIVEN_UNKNOWN
 *   own        the reader wrote it
 *   signedIn
 */
export function useBlogThumbs(rows) {
  const signedIn = useSelector(selectIsSignedIn);
  const user = useSelector(selectUser);
  const login = signedIn && user && user.login ? String(user.login) : '';

  const [given, setGiven] = useState({});
  const [counts, setCounts] = useState({});
  const [refused, setRefused] = useState({});

  const asked = useRef({ login: '', ids: {} });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const idsKey = rows.map((row) => row.id).join(',');

  useEffect(() => {
    if (asked.current.login !== login) {
      asked.current = { login: login, ids: {} };
      setGiven({});
      setRefused({});
    }
    if (!login) return;

    const wanted = idsKey ? idsKey.split(',').filter((id) => !asked.current.ids[id]) : [];
    if (!wanted.length) return;
    wanted.forEach((id) => { asked.current.ids[id] = true; });

    const forLogin = login;

    for (let start = 0; start < wanted.length; start += IDS_PER_REQUEST) {
      const chunk = wanted.slice(start, start + IDS_PER_REQUEST);

      api.account.blogThumbs(chunk)
        .then((response) => {
          if (!mounted.current || asked.current.login !== forLogin) return;

          const found = {};
          chunk.forEach((id) => { found[id] = false; });
          ((response && response.data) || []).forEach((entry) => {
            found[String(entry.id)] = entry.kind || GIVEN_UNKNOWN;
          });

          /* A thumb given while this was on its way is newer than the answer. */
          setGiven((was) => {
            const next = { ...was };
            Object.keys(found).forEach((id) => {
              if (!next[id]) next[id] = found[id];
            });
            return next;
          });
        })
        .catch(() => {
          /* Not fatal: the medals stay pressable and the server still refuses a second thumb. */
          if (asked.current.login === forLogin) chunk.forEach((id) => { delete asked.current.ids[id]; });
        });
    }
  }, [login, idsKey]);

  const of = useCallback((row) => {
    const id = String(row.id);
    return {
      counts: counts[id] || row.recommendations || NO_COUNTS,
      mine: given[id],
      own: !!refused[id] || (!!login && !!row.author && String(row.author) === login),
      signedIn: !!login
    };
  }, [counts, given, refused, login]);

  /**
   * Give one. Resolves with the kind that now stands; rejects with the API's
   * error, whose message is already in the reader's language. A refusal that
   * says something about the row - already given, or the reader's own - is
   * written into the state before it is rethrown, so the medals are right
   * whatever the caller does with the error.
   */
  const give = useCallback(async (row, kind) => {
    const id = String(row.id);

    try {
      const response = await api.account.giveBlogThumb(row.id, kind);
      const body = (response && response.data) || {};

      if (mounted.current) {
        setGiven((was) => ({ ...was, [id]: body.kind || kind }));
        if (body.recommendations) setCounts((was) => ({ ...was, [id]: body.recommendations }));
      }
      return body.kind || kind;
    } catch (err) {
      const detail = err.detail || {};

      if (mounted.current && detail.reason === 'ALREADY') {
        setGiven((was) => ({ ...was, [id]: detail.kind || GIVEN_UNKNOWN }));
        if (detail.recommendations) setCounts((was) => ({ ...was, [id]: detail.recommendations }));
      }
      if (mounted.current && detail.reason === 'OWN') {
        setRefused((was) => ({ ...was, [id]: true }));
      }
      throw err;
    }
  }, []);

  return { of: of, give: give };
}

/** A medal nothing can be done with: the count, and why in a tooltip. */
function StaticMedal({ medal, count, label, reason, chosen, compact }) {
  const t = useT();
  const surface = useSurface();
  const colour = useColorModeValue(medal.light, medal.dark);
  const tint = useColorModeValue(medal.tint, 'whiteAlpha.200');

  return (
    <Tooltip label={reason} hasArrow openDelay={250} isDisabled={!reason}>
      <Flex
        as="span"
        align="center"
        h={compact ? '28px' : '36px'}
        px={compact ? '2.5' : '3.5'}
        borderRadius="full"
        border="1px solid"
        borderColor={chosen ? colour : surface.border}
        bg={chosen ? tint : 'transparent'}
        opacity={chosen || !reason ? 1 : 0.55}
        tabIndex={reason ? 0 : undefined}
        data-medal={medal.kind}
        data-chosen={chosen ? 'true' : undefined}
      >
        <Icon
          as={FiThumbsUp}
          boxSize={compact ? '14px' : '16px'}
          color={colour}
          fill={chosen ? 'currentColor' : 'none'}
          mr="1.5"
          aria-hidden="true"
        />
        <Text as="span" fontSize={compact ? 'xs' : 'sm'} fontWeight={chosen ? '700' : '600'} color={surface.strong}>
          {number(count)}
        </Text>
        <VisuallyHidden>
          {label}
          {chosen ? ' - ' + t('blog.thumbs.yours') : ''}
        </VisuallyHidden>
      </Flex>
    </Tooltip>
  );
}

/** A medal the reader can press: a confirmation first, or an offer to sign in. */
function PressableMedal({ medal, count, label, signedIn, open, onOpen, onClose, onGive, busy, compact }) {
  const t = useT();
  const surface = useSurface();
  const signIn = useSignIn();
  const colour = useColorModeValue(medal.light, medal.dark);
  const tint = useColorModeValue(medal.tint, 'whiteAlpha.200');
  const thumb = t(medal.thumb);

  return (
    <Popover isOpen={open} onClose={onClose} placement="top" isLazy returnFocusOnClose>
      <PopoverTrigger>
        {/*
          A plain button drawn as the same pill as StaticMedal, so a medal
          does not change shape when it stops being pressable. (Chakra's
          "unstyled" Button variant zeroes the padding the pill needs.)
        */}
        <Box
          as="button"
          type="button"
          display="inline-flex"
          alignItems="center"
          h={compact ? '28px' : '36px'}
          px={compact ? '2.5' : '3.5'}
          borderRadius="full"
          border="1px solid"
          borderColor={open ? colour : surface.border}
          bg={open ? tint : 'transparent'}
          cursor="pointer"
          transition="background-color 150ms ease, border-color 150ms ease"
          _hover={{ borderColor: colour, bg: tint }}
          _focus={{ outline: 'none', boxShadow: 'outline' }}
          aria-label={label + '. ' + t('blog.thumbs.giveOne', { thumb: thumb })}
          aria-haspopup="dialog"
          data-medal={medal.kind}
          onClick={open ? onClose : onOpen}
        >
          <Icon as={FiThumbsUp} boxSize={compact ? '14px' : '16px'} color={colour} mr="1.5" aria-hidden="true" />
          <Text as="span" fontSize={compact ? 'xs' : 'sm'} fontWeight="600" color={surface.strong}>
            {number(count)}
          </Text>
        </Box>
      </PopoverTrigger>

      <Portal>
        <PopoverContent w="17rem" maxW="calc(100vw - 32px)" borderRadius="12px" _focus={{ outline: 'none' }}>
          <PopoverArrow />
          {signedIn ? (
            <>
              <PopoverBody pt="4" px="4">
                <Flex align="center" mb="1.5">
                  <Icon as={FiThumbsUp} color={colour} fill="currentColor" mr="2" aria-hidden="true" />
                  <Text fontWeight="700" fontSize="sm" color={surface.text}>
                    {t('blog.thumbs.giveThisQuestion', { thumb: thumb })}
                  </Text>
                </Flex>
                <Text fontSize="xs" color={surface.muted} lineHeight="1.5">
                  {t('blog.thumbs.onceAndForGood')}
                </Text>
              </PopoverBody>
              <PopoverFooter border="0" px="4" pb="4" pt="1">
                <Flex justify="flex-end" gap="2" data-gap="8">
                  <Button size="sm" variant="quiet" onClick={onClose} isDisabled={busy}>
                    {t('common.cancel')}
                  </Button>
                  <Button size="sm" variant="brand" onClick={onGive} isLoading={busy} data-confirm={medal.kind}>
                    {t('blog.thumbs.give')}
                  </Button>
                </Flex>
              </PopoverFooter>
            </>
          ) : (
            <>
              <PopoverBody pt="4" px="4">
                <Text fontWeight="700" fontSize="sm" color={surface.text} mb="1.5">
                  {t('blog.thumbs.signInToGive')}
                </Text>
                <Text fontSize="xs" color={surface.muted} lineHeight="1.5">
                  {t('blog.thumbs.membersGiveThumbs')}
                </Text>
              </PopoverBody>
              <PopoverFooter border="0" px="4" pb="4" pt="1">
                <Flex justify="flex-end" gap="2" data-gap="8">
                  <Button size="sm" variant="quiet" onClick={onClose}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    size="sm"
                    variant="brand"
                    data-sign-in
                    onClick={() => {
                      onClose();
                      signIn();
                    }}
                  >
                    {t('common.signIn')}
                  </Button>
                </Flex>
              </PopoverFooter>
            </>
          )}
        </PopoverContent>
      </Portal>
    </Popover>
  );
}

/**
 * THE MEDALS FOR ONE ROW.
 *
 * `thumbs` is the page's useBlogThumbs(); `row` the article or reply. `size`
 * "md" is the bar under an article, with a sentence saying where the reader
 * stands; "sm" is the compact row under a reply.
 */
export default function BlogThumbs({ row, thumbs, size = 'md' }) {
  const t = useT();
  const toast = useToast();
  const surface = useSurface();
  const compact = size === 'sm';

  const state = thumbs.of(row);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState('');

  const chosen = state.mine && state.mine !== GIVEN_UNKNOWN ? medalOf(state.mine) : null;
  const hasGiven = !!state.mine;

  const give = async (medal) => {
    setBusy(true);
    try {
      const kind = await thumbs.give(row, medal.kind);
      const standing = medalOf(kind) || medal;
      setSaid(t('blog.thumbs.counted', { thumb: t(standing.thumb) }));
    } catch (err) {
      const reason = err.detail && err.detail.reason;
      toast({
        status: reason === 'ALREADY' ? 'info' : 'error',
        title: err.message,
        isClosable: true
      });
    } finally {
      setBusy(false);
      setOpen(null);
    }
  };

  const medals = MEDALS.map((medal) => {
    const count = Number(state.counts[medal.field] || 0);
    const label = t('blog.thumbs.countOf', { medal: t(medal.name), count: number(count) });

    if (state.own) {
      return (
        <StaticMedal key={medal.kind} medal={medal} count={count} label={label}
          reason={compact ? t('blog.thumbs.notOnYourOwn') : ''} compact={compact} />
      );
    }

    if (hasGiven) {
      const mine = chosen && chosen.kind === medal.kind;
      const reason = mine
        ? t('blog.thumbs.yours')
        : chosen
          ? t('blog.thumbs.youGave', { thumb: t(chosen.thumb) })
          : t('blog.thumbs.alreadyGiven');
      return (
        <StaticMedal key={medal.kind} medal={medal} count={count} label={label}
          reason={reason} chosen={mine} compact={compact} />
      );
    }

    return (
      <PressableMedal
        key={medal.kind}
        medal={medal}
        count={count}
        label={label}
        signedIn={state.signedIn}
        open={open === medal.kind}
        onOpen={() => setOpen(medal.kind)}
        onClose={() => { if (!busy) setOpen(null); }}
        onGive={() => give(medal)}
        busy={busy && open === medal.kind}
        compact={compact}
      />
    );
  });

  const group = (
    <Flex
      role="group"
      aria-label={t('blog.thumbs.thumbs')}
      align="center"
      wrap="wrap"
      gap="2"
      data-gap="8"
      data-gap-wrap
    >
      {medals}
    </Flex>
  );

  const live = (
    <VisuallyHidden role="status" aria-live="polite">
      {said}
    </VisuallyHidden>
  );

  if (compact) {
    return (
      <Box mt="3" data-thumbs={row.id}>
        {group}
        {live}
      </Box>
    );
  }

  const sentence = state.own
    ? t('blog.thumbs.fromReaders')
    : chosen
      ? t('blog.thumbs.youGave', { thumb: t(chosen.thumb) })
      : hasGiven
        ? t('blog.thumbs.alreadyGiven')
        : t('blog.thumbs.worthReading');

  return (
    <Flex
      data-thumbs={row.id}
      align="center"
      justify="space-between"
      wrap="wrap"
      gap="3"
      data-gap="12"
      data-gap-wrap
      mt="10"
      py="4"
      px={{ base: 4, md: 5 }}
      borderRadius="14px"
      border="1px solid"
      borderColor={surface.border}
    >
      <Text fontSize="sm" fontWeight="600" color={surface.strong}>
        {sentence}
      </Text>
      {group}
      {live}
    </Flex>
  );
}
