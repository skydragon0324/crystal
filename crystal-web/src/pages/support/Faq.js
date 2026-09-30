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
import { IntegrityMessage } from '@/components/security/IntegrityState';
import VerifiedFAQ from '@/components/security/VerifiedFAQ';
import { faqCategoryLabel } from '@/components/support/faqCategories';
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
      <Breadcrumbs items={[{ label: 'Support' }, { label: 'FAQ' }]} />

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
        THE CATEGORIES, in the order the API answers them - the product kinds,
        then the Crystal App, the Eshop and the Appstore.

        These chips used to read `warranty`, `repair`, `os` - the topic column
        lower-cased on its way out of the database, which is how "os" ended up
        being offered to a customer as a heading - and then "Eproducts", which
        made somebody holding a set-top box read through the televisions. The
        category is now the product in their hands, which is what they came
        looking for, and the label is written rather than derived.
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
            {t(faqCategoryLabel(row.category))}
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
            {/*
              * ONE ACCORDION ITEM PER ROW, VERIFIED OR NOT.
              *
              * The question, its system and its answer are drawn from the
              * signature. A row that has not verified is still an item - with
              * the neutral state in the button and in the panel - because
              * `defaultIndex` counts items, and a row that vanished would open
              * the wrong answer for `?open=`.
              *
              * NO READ COUNT. It was shown under each question - "Smartphones ·
              * 980 reads" - and told a visitor nothing about their problem: a
              * popular question is not a more correct answer. The count is
              * still kept (the support page's "Popular problems" band is
              * ranked by it, and the console lists it); it is simply not this
              * page's to show.
              */}
            {list.rows.map((row) => (
              <VerifiedFAQ key={row.id} faq={row}>
                {({ state, faq }) => (
                  <AccordionItem
                    border="1px solid"
                    borderColor={surface.border}
                    borderRadius="12px"
                    mb="3"
                    overflow="hidden"
                  >
                    {/*
                      * NO RING ON A CLICK. Chakra's accordion button carries
                      * `_focus: { boxShadow: 'outline' }`, which in version 1
                      * is plain `:focus` - so clicking a question drew a
                      * rectangle around it that said "this one is selected"
                      * about the one question that is already open and reading
                      * its answer out. The ring is kept for the keyboard, where
                      * it is the only way to see where you are, and drawn
                      * INSIDE the row because the item clips its own overflow.
                      */}
                    <AccordionButton
                      py="4"
                      px="5"
                      _hover={{ bg: surface.hover }}
                      _focus={{ boxShadow: 'none' }}
                      _focusVisible={{ boxShadow: 'inset 0 0 0 2px var(--chakra-colors-brand-500)' }}
                    >
                      <Box flex="1" textAlign="left">
                        {faq ? (
                          <>
                            <Text fontWeight="600" color={surface.text}>
                              {faq.question}
                            </Text>
                            <Text fontSize="xs" color={surface.muted} mt="0.5">
                              {t(faqCategoryLabel(faq.category))}
                            </Text>
                          </>
                        ) : (
                          <IntegrityMessage state={state} lines={1} />
                        )}
                      </Box>
                      <AccordionIcon color={surface.muted} />
                    </AccordionButton>
                    {/*
                      * The answer starts clear of the question. Chakra's panel
                      * opens with `pt: 2` and this page used to zero it, which
                      * left the answer sitting directly under the question with
                      * only the button's own padding between them - two blocks
                      * of text with no seam. A hairline above it separates the
                      * two without drawing a second box.
                      */}
                    <AccordionPanel
                      px="5"
                      pb="5"
                      pt="4"
                      mt="1"
                      borderTop="1px solid"
                      borderColor={surface.border}
                    >
                      {faq ? (
                        <Text color={surface.strong} whiteSpace="pre-wrap">
                          {faq.answer}
                        </Text>
                      ) : (
                        <IntegrityMessage state={state} compact />
                      )}
                    </AccordionPanel>
                  </AccordionItem>
                )}
              </VerifiedFAQ>
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
          <Pagination meta={list.meta} onPage={list.setPage} onLimit={list.setLimit} />
        </>
      )}
    </Section>
  );
}
