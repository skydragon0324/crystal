import React, { useEffect, useState } from 'react';
import {
  Box,
  Flex,
  Input,
  InputGroup,
  InputLeftElement,
  Text
} from '@chakra-ui/react';
import { SearchIcon } from '@chakra-ui/icons';

import api from '@/api';
import { DatePicker } from '@/components/common';
import { useDebounced, useList } from '@/hooks/useApi';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';
import { number } from '@/utils/format';

/**
 * WHAT THE THREE POINTS PAGES SHARE, and it is deliberately not a page.
 *
 * Crystal's own points, the activity log and the four software ledgers used to
 * be one screen with a `?source=` filter. They are not one thing: Crystal's
 * ledger stamps a running balance and a movement kind, the activity log has a
 * category and a cap, the software ledgers have a pay figure, a soft figure
 * and a status. A member reading "Activity Point Log" and "Appstore" on the
 * same table with one column switched off was reading neither of them.
 *
 * So each is its own page now, and what is left in common is plumbing: the
 * request, the row number, the signed figure, the period and search header.
 * None of it knows which ledger it is drawing. If a piece of this file ever
 * needs an `if (source === ...)`, it belongs in that page instead.
 */

/** The list sizes the ledgers offer; the first page opens on the second. */
export const LEDGER_LIMIT = 20;

/**
 * ONE LEDGER, BY ITS SOURCE - and only that source, whatever the params say.
 *
 * The source is pushed back into the request when it changes, for the same
 * reason EshopLog does it: the four software entries are one route with a
 * different `?source=`, React Router reconciles rather than remounting, and
 * `initialParams` is only read once. The first render already agrees, so
 * nothing is fetched twice on arrival.
 *
 * WHILE THE LIST IS CATCHING UP, ITS ROWS ARE NOT SHOWN. Karaoke rows under an
 * Appstore heading for the length of a round trip is the one reading of these
 * pages that is actually wrong; keeping the old rows is right for a page
 * change and wrong for a ledger change.
 */
export function useLedger(source, extra) {
  const list = useList((params) => api.account.points(params), {
    initialParams: Object.assign({ page: 1, limit: LEDGER_LIMIT, source: source }, extra || {})
  });

  const asked = list.params.source;
  const setFilter = list.setFilter;

  useEffect(() => {
    if (asked !== source) setFilter({ source: source });
  }, [asked, source, setFilter]);

  return asked === source ? list : Object.assign({}, list, { rows: [], loading: true });
}

/** The row's place in the whole ledger - DataTable counts across pages. */
export function numberColumn(t, surface) {
  return {
    key: 'no',
    label: t('account.points.ledger.no'),
    align: 'center',
    width: '56px',
    render: (row, position) => <Text fontSize="sm" color={surface.muted}>{position}</Text>
  };
}

/**
 * A MOVEMENT OF POINTS, EXACTLY AS IT WAS RECORDED.
 *
 * `number` and nothing else: grouped with a space, up to three decimals, and
 * no rounding - the ledgers hold numeric(14,3) and an award of 0.4 is shown as
 * 0.4. The sign is a sign (an explicit + on a credit, the minus the number
 * carries) and the colour follows it, because on a page where every figure is
 * points the direction is the only thing colour can usefully say.
 */
export function Points({ value, muted }) {
  const surface = useSurface();
  const amount = Number(value) || 0;

  const tone = muted ? surface.text : amount < 0 ? 'red.400' : amount > 0 ? 'green.500' : surface.muted;

  return (
    <Text as="span" fontWeight="700" color={tone} whiteSpace="nowrap">
      {amount > 0 && !muted ? '+' : ''}
      {number(amount)}
    </Text>
  );
}

/**
 * ONE STANDING FIGURE - a balance, what it may reach, and a line under it.
 *
 * A card rather than a row of text because it is what the member came to
 * check before reading any of the movements; `onClick` makes it the filter it
 * stands for where a page wants that, and it is a plain box where it does not.
 */
export function StandingTile({ label, value, cap, note, isActive, onClick }) {
  const t = useT();
  const surface = useSurface();

  const clickable = !!onClick;

  return (
    <Box
      as={clickable ? 'button' : 'div'}
      type={clickable ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={clickable ? !!isActive : undefined}
      textAlign="left"
      w="100%"
      p="4"
      borderRadius="14px"
      bg={isActive ? 'brand.500' : surface.raised}
      borderWidth="1px"
      borderColor={isActive ? 'brand.500' : 'transparent'}
      transition="background 150ms, border-color 150ms"
      _hover={clickable ? { borderColor: isActive ? 'brand.500' : surface.border } : undefined}
    >
      <Text
        fontSize="xs"
        fontWeight="700"
        textTransform="uppercase"
        letterSpacing="0.5px"
        color={isActive ? 'whiteAlpha.900' : surface.muted}
        noOfLines={1}
      >
        {label}
      </Text>
      <Text fontSize="xl" fontWeight="800" letterSpacing="-0.02em" color={isActive ? 'white' : surface.text}>
        {number(value)}
      </Text>
      <Text fontSize="xs" color={isActive ? 'whiteAlpha.800' : surface.muted}>
        {note !== undefined
          ? note
          : cap === null || cap === undefined
            ? t('account.points.noCap')
            : `${t('common.of')} ${number(cap)}`}
      </Text>
    </Box>
  );
}

/**
 * THE VENDOR'S HEADER: A PERIOD, AND A SEARCH.
 *
 * Every one of the vendor's point-log screens opens with the same two
 * controls, and the API now takes both for every ledger (`from`, `to`, `q`),
 * so both are here and both are SERVER-SIDE - they sit on the list's params,
 * because the table holds one page and filtering twenty rows of two hundred
 * would answer a different question than the one the box asks.
 *
 * THE WINDOW STARTS EMPTY, where the vendor's activity page opens on the
 * current month. The Appstore pages made the same call and the reason is the
 * same: an empty period is "everything", and a default month quietly hides
 * last month's award from the member who came looking for it.
 *
 * `children` are the page's own controls - a category, a movement kind - and
 * sit first, because they are what distinguishes one ledger's header from
 * another's.
 */
export function LedgerFilters({ list, children }) {
  const t = useT();
  const surface = useSurface();

  const [term, setTerm] = useState(list.params.q || '');
  /* One request per pause in typing, not one per letter. */
  const search = useDebounced(term, 350);

  const setFilter = list.setFilter;
  const asked = list.params.q;

  useEffect(() => {
    const wanted = search.trim() || undefined;
    if (asked !== wanted) setFilter({ q: wanted });
  }, [search, asked, setFilter]);

  /* '' for no bound; the picker reads an empty string as no date chosen. */
  const from = list.params.from || '';
  const to = list.params.to || '';

  return (
    <Flex align="flex-end" wrap="wrap" gap="3" data-gap="12" data-gap-wrap mb="5">
      {children}

      <Box>
        <Text fontSize="sm" fontWeight="600" color={surface.text} mb="1.5">
          {t('account.points.ledger.period')}
        </Text>
        <Flex align="center" gap="2" data-gap="8">
          <DatePicker
            size="sm"
            w="150px"
            aria-label={t('account.points.ledger.from')}
            placeholder={t('account.points.ledger.from')}
            value={from}
            max={to || undefined}
            onChange={(next) => setFilter({ from: next || undefined })}
          />
          <Text color={surface.muted} aria-hidden="true">—</Text>
          <DatePicker
            size="sm"
            w="150px"
            aria-label={t('account.points.ledger.to')}
            placeholder={t('account.points.ledger.to')}
            value={to}
            min={from || undefined}
            onChange={(next) => setFilter({ to: next || undefined })}
          />
        </Flex>
      </Box>

      <Box flex="1" minW="200px" maxW="320px">
        <InputGroup size="sm">
          <InputLeftElement pointerEvents="none" h="32px">
            <SearchIcon color={surface.muted} boxSize="3" />
          </InputLeftElement>
          <Input
            placeholder={t('account.points.ledger.searchThisLedger')}
            aria-label={t('account.points.ledger.searchThisLedger')}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
          />
        </InputGroup>
      </Box>
    </Flex>
  );
}

/** One sentence under the heading, saying which of the three ledgers this is. */
export function Lede({ children }) {
  const surface = useSurface();

  return (
    <Text fontSize="sm" color={surface.muted} maxW="640px" mb="6">
      {children}
    </Text>
  );
}
