import React from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Box, Button, Flex, Heading, Image, Stack, Text } from '@chakra-ui/react';
import { ArrowBackIcon } from '@chakra-ui/icons';

import { Breadcrumbs, ErrorState, Loading, Section } from '@/components/common';
import api from '@/api';
import { useApi } from '@/hooks/useApi';
import { fileUrl } from '@/api/client';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';
import { date as formatDate } from '@/utils/format';

/**
 * One article.
 *
 * The body is stored as plain text with blank lines between paragraphs, so it
 * is rendered by splitting on those rather than by injecting HTML - content
 * written in the console must never be able to run script in a reader's
 * browser.
 */
export default function BlogArticle() {
  const t = useT();

  const surface = useSurface();
  const { slug } = useParams();
  const article = useApi(() => api.blog.article(slug), [slug]);

  if (article.loading) {
    return (
      <Section py={{ base: 6, md: 10 }}>
        <Loading variant="block" height="420px" />
      </Section>
    );
  }

  if (article.error) {
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
  const paragraphs = String(data.content || '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <Section py={{ base: 6, md: 10 }}>
      <Box maxW="760px" mx="auto">
        <Breadcrumbs items={[{ label: 'Blog', to: '/blog' }, { label: data.title }]} />

        <Text fontSize="sm" fontWeight="700" color="brand.500" letterSpacing="0.8px">
          {data.category} ·{' '}
          {data.published_at ? formatDate(data.published_at) : ''}
        </Text>

        <Heading size="2xl" color={surface.text} mt="3" letterSpacing="-0.03em" lineHeight="1.15">
          {data.title}
        </Heading>

        {data.summary && (
          <Text fontSize="xl" color={surface.muted} mt="5">
            {data.summary}
          </Text>
        )}

        <Flex align="center" gap="3" data-gap="12" mt="6" fontSize="sm" color={surface.muted}>
          <Text>{data.author || data.author_name || 'Crystal'}</Text>
          <Box boxSize="3px" borderRadius="full" bg={surface.muted} />
          <Text>{data.view_count} reads</Text>
        </Flex>

        {data.cover_image && (
          <Image
            src={fileUrl(data.cover_image)}
            alt={data.title}
            w="100%"
            borderRadius="16px"
            mt="8"
            bg={surface.raised}
          />
        )}

        <Stack spacing="5" mt="10">
          {paragraphs.map((block, index) => (
            <Text key={index} fontSize="lg" lineHeight="1.8" color={surface.strong}>
              {block}
            </Text>
          ))}
        </Stack>

        <Flex
          mt="16"
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
