import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Flex, Heading, SimpleGrid, Text } from '@chakra-ui/react';

import {
  EmptyState,
  ErrorState,
  Loading,
  Pagination,
  Section,
  SectionHeading
} from '@/components/common';
import api from '@/api';
import { useApi, useList } from '@/hooks/useApi';
import { fileUrl } from '@/api/client';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';
import { date as formatDate } from '@/utils/format';

/**
 * The blog index.
 *
 * The newest article is given a wide lead card and the rest a three-up grid -
 * an index where every entry is the same size makes the reader do the
 * prioritising the editor should have done.
 */
export default function BlogList() {
  const t = useT();

  const surface = useSurface();
  const categories = useApi(() => api.blog.categories(), []);
  const list = useList((params) => api.blog.list(params), {
    initialParams: { page: 1, limit: 9 }
  });

  const [lead, ...rest] = list.rows;
  const onFirstPage = !list.meta || list.meta.page === 1;

  return (
    <Section py={{ base: 6, md: 10 }}>
      <SectionHeading
        title={t('blog.bloglist.blog')}
        subtitle={t('blog.bloglist.productNotesReleaseAnnouncementsAnd')}
      />

      <Flex gap="2" data-gap="8" data-gap-wrap wrap="wrap" mb="8">
        <Button
          size="sm"
          variant={!list.params.category ? 'brand' : 'quiet'}
          onClick={() => list.setFilter({ category: undefined })}
        >
          {t('common.all')}
        </Button>
        {(categories.data || []).map((row) => (
          <Button
            key={row.category}
            size="sm"
            variant={list.params.category === row.category ? 'brand' : 'quiet'}
            onClick={() => list.setFilter({ category: row.category })}
          >
            {row.category.toLowerCase()}
            <Text as="span" ml="1.5" fontSize="xs" opacity={0.7}>
              {row.article_cnt}
            </Text>
          </Button>
        ))}
      </Flex>

      {list.loading && <Loading variant="grid" count={6} height="200px" />}

      {!list.loading && list.error && <ErrorState message={list.error} onRetry={list.reload} />}

      {!list.loading && !list.error && list.rows.length === 0 && (
        <EmptyState title={t('blog.bloglist.nothingPublishedHereYet')} />
      )}

      {!list.loading && lead && onFirstPage && (
        <Flex
          as={RouterLink}
          to={`/blog/${lead.slug}`}
          direction={{ base: 'column', md: 'row' }}
          borderRadius="16px"
          overflow="hidden"
          border="1px solid"
          borderColor={surface.border}
          mb="8"
          transition="box-shadow 180ms ease"
          _hover={{ boxShadow: surface.shadowLifted }}
        >
          <Box
            w={{ base: '100%', md: '52%' }}
            minH={{ base: '220px', md: '320px' }}
            backgroundImage={`url(${fileUrl(lead.cover_image)})`}
            backgroundSize="cover"
            backgroundPosition="center"
            bg={surface.raised}
          />
          <Box p={{ base: 6, md: 10 }} flex="1">
            <Text fontSize="xs" fontWeight="700" color="brand.500" letterSpacing="0.8px">
              {lead.category} · {formatDate(lead.published_at)}
            </Text>
            <Heading size="lg" color={surface.text} mt="3" letterSpacing="-0.02em">
              {lead.title}
            </Heading>
            <Text color={surface.muted} mt="3" noOfLines={4}>
              {lead.summary}
            </Text>
            <Text color="brand.500" fontWeight="600" mt="5">
              {t('blog.bloglist.readTheArticle')}
            </Text>
          </Box>
        </Flex>
      )}

      {!list.loading && (onFirstPage ? rest : list.rows).length > 0 && (
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={{ base: 5, md: 6 }}>
          {(onFirstPage ? rest : list.rows).map((article) => (
            <Box
              key={article.id}
              as={RouterLink}
              to={`/blog/${article.slug}`}
              borderRadius="14px"
              overflow="hidden"
              border="1px solid"
              borderColor={surface.border}
              transition="transform 180ms ease, box-shadow 180ms ease"
              _hover={{ transform: 'translateY(-4px)', boxShadow: surface.shadowLifted }}
            >
              <Box
                pb="56%"
                backgroundImage={`url(${fileUrl(article.cover_image)})`}
                backgroundSize="cover"
                backgroundPosition="center"
                bg={surface.raised}
              />
              <Box p="5">
                <Text fontSize="xs" fontWeight="700" color="brand.500" letterSpacing="0.6px">
                  {article.category} · {formatDate(article.published_at)}
                </Text>
                <Text fontWeight="700" color={surface.text} mt="2" noOfLines={2}>
                  {article.title}
                </Text>
                <Text fontSize="sm" color={surface.muted} mt="2" noOfLines={3}>
                  {article.summary}
                </Text>
              </Box>
            </Box>
          ))}
        </SimpleGrid>
      )}

      <Pagination meta={list.meta} onPage={list.setPage} />
    </Section>
  );
}
