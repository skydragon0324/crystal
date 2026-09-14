import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Button,
  Flex,
  Heading,
  Input,
  InputGroup,
  InputLeftElement,
  Text
} from '@chakra-ui/react';
import { SearchIcon } from '@chakra-ui/icons';

import {
  Breadcrumbs,
  EmptyState,
  ErrorState,
  Loading,
  Pagination,
  Section
} from '@/components/common';
import { faqSystemLabel } from '@/components/support/faqSystems';
import api from '@/api';
import { useApi, useDebounced, useList } from '@/hooks/useApi';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * The FAQ.
 *
 * `?open=<id>` opens a specific question, which is what the "Popular
 * problems" cards link to - a link that lands on a page of collapsed
 * accordions has not really answered anything.
 *
 * `?q=` is the support search box landing here.
 *
 * The endpoint answers the whole matching set rather than a page of it - the
 * question list is short, and an accordion that pages is one where the answer
 * somebody wants is on a page they have to guess at.
 */
export default function Faq() {
  const t = useT();

  const surface = useSurface();
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const openId = query.get('open');

  const [term, setTerm] = useState(query.get('q') || '');
  const debounced = useDebounced(term, 300);

  const categories = useApi(() => api.support.faqCategories(), []);
  const list = useList((params) => api.support.faqs(params), {
    initialParams: { page: 1, limit: 20, q: query.get('q') || undefined }
  });

  useEffect(() => {
    list.setFilter({ q: debounced || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const openIndex = openId
    ? list.rows.findIndex((faq) => String(faq.id) === String(openId))
    : -1;

  return (
    <Section py={{ base: 6, md: 10 }}>
      <Breadcrumbs items={[{ label: 'Support', to: '/support' }, { label: 'FAQ' }]} />

      <Heading size="lg" color={surface.text} letterSpacing="-0.02em">
        {t('support.faq.frequentlyAskedQuestions')}
      </Heading>
      <Text color={surface.muted} mt="1" mb="8">
        {list.loading
          ? t('support.faq.loadingAnswers')
          : t('support.faq.answers', { count: list.meta ? list.meta.total : list.rows.length })}
        {list.params.q ? ' ' + t('support.faq.matching', { term: list.params.q }) : ''}
      </Text>

      <InputGroup maxW="560px" mb="6">
        <InputLeftElement pointerEvents="none" h="40px">
          <SearchIcon color={surface.muted} boxSize="3.5" />
        </InputLeftElement>
        <Input
          placeholder={t('support.faq.searchQuestionsAndAnswers')}
          value={term}
          onChange={(event) => setTerm(event.target.value)}
        />
      </InputGroup>

      {/*
        THE FIVE SYSTEMS, in the order the API answers them.

        These chips used to read `warranty`, `repair`, `os` - the topic column
        lower-cased on its way out of the database, which is how "os" ended up
        being offered to a customer as a heading. The category is now which
        Crystal system the question is about, which is what somebody arriving
        with a broken television is actually looking for, and the label is
        written rather than derived.
      */}
      <Flex gap="2" data-gap="8" data-gap-wrap wrap="wrap" mb="8">
        <Button
          size="sm"
          variant={!list.params.category ? 'brand' : 'quiet'}
          onClick={() => list.setFilter({ category: undefined })}
        >
          {t('support.faq.allTopics')}
        </Button>
        {(categories.data || []).map((row) => (
          <Button
            key={row.category}
            size="sm"
            variant={list.params.category === row.category ? 'brand' : 'quiet'}
            onClick={() => list.setFilter({ category: row.category })}
          >
            {t(faqSystemLabel(row.category))}
            <Text as="span" ml="1.5" fontSize="xs" opacity={0.7}>
              {row.count}
            </Text>
          </Button>
        ))}
      </Flex>

      {list.loading && <Loading variant="list" count={8} height="60px" />}

      {!list.loading && list.error && <ErrorState message={list.error} onRetry={list.reload} />}

      {!list.loading && !list.error && list.rows.length === 0 && (
        <EmptyState
          title={list.params.q
            ? t('support.faq.nothingMatches', { term: list.params.q })
            : t('support.faq.noQuestionsHereYet')}
          hint={t('support.faq.tryAShorterSearchOr')}
          actionLabel={t('common.writeToSupport')}
          actionTo="/account/feedback"
        />
      )}

      {!list.loading && list.rows.length > 0 && (
        <>
          <Accordion allowMultiple defaultIndex={openIndex >= 0 ? [openIndex] : []}>
            {list.rows.map((faq) => (
              <AccordionItem
                key={faq.id}
                border="1px solid"
                borderColor={surface.border}
                borderRadius="12px"
                mb="3"
                overflow="hidden"
              >
                <AccordionButton py="4" px="5" _hover={{ bg: surface.hover }}>
                  <Box flex="1" textAlign="left">
                    <Text fontWeight="600" color={surface.text}>
                      {faq.question}
                    </Text>
                    <Text fontSize="xs" color={surface.muted} mt="0.5">
                      {t(faqSystemLabel(faq.category))} · {t('common.reads', { count: faq.view_count })}
                    </Text>
                  </Box>
                  <AccordionIcon color={surface.muted} />
                </AccordionButton>
                <AccordionPanel px="5" pb="5" pt="0">
                  <Text color={surface.strong} whiteSpace="pre-wrap">
                    {faq.answer}
                  </Text>
                </AccordionPanel>
              </AccordionItem>
            ))}
          </Accordion>

          {/*
            PAGED, because the answer somebody wants may not be in the first
            twenty. The endpoint has always answered a page - the parameters
            below say page 1, limit 20 - and there was nothing on screen to
            ask for the second one, so a hundred published answers were
            twenty published answers and eighty unreachable ones. The search
            box runs on the server, so narrowing still reaches all of them.
          */}
          <Pagination meta={list.meta} onPage={list.setPage} />
        </>
      )}
    </Section>
  );
}
