import React from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';

import { DataTable, ErrorState, SelectField, StatusBadge } from '@/components/common';
import api from '@/api';
import { useList } from '@/hooks/useApi';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';
import { date as formatDate } from '@/utils/format';

/**
 * The member's own articles.
 *
 * DRAFTS ARE NOT A SEPARATE PAGE. The vendor's console had "My Articles" and
 * "Drafts" as two menu entries over the same table with a different state
 * filter, which meant a member checking on something they had submitted had to
 * guess which of the two it was in. It is one list with the state on every row
 * and a filter for when they do know.
 *
 * Unlike the public blog this shows everything the member wrote - awaiting
 * review, refused, cancelled - because an article that was refused is exactly
 * the one they came here to find.
 */
const STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'REVIEW', label: 'Awaiting review' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'ARCHIVED', label: 'Not published' }
];

export default function MyArticles() {
  const t = useT();
  const surface = useSurface();

  const list = useList((params) => api.account.articles(params), {
    initialParams: { page: 1, limit: 12 }
  });

  const columns = [
    {
      key: 'title',
      label: 'Article',
      render: (row) => (
        <Box maxW="420px">
          <Text fontWeight="600" color={surface.text} noOfLines={1}>{row.title}</Text>
          {row.summary && (
            <Text fontSize="xs" color={surface.muted} noOfLines={1}>
              {String(row.summary).replace(/<[^>]+>/g, ' ').trim()}
            </Text>
          )}
        </Box>
      )
    },
    { key: 'category', label: 'Topic' },
    { key: 'status', label: 'State', render: (row) => <StatusBadge value={row.status} /> },
    {
      key: 'view_count',
      label: 'Reads',
      align: 'right',
      render: (row) => Number(row.view_count).toLocaleString()
    },
    {
      key: 'updated_at',
      label: 'Updated',
      render: (row) => (row.updated_at ? formatDate(row.updated_at) : '—')
    }
  ];

  return (
    <Box>
      <Flex gap="3" data-gap="12" data-gap-wrap mb="5" wrap="wrap">
        <Box minW="220px">
          <SelectField
            size="sm"
            value={list.params.status || null}
            onChange={(value) => list.setFilter({ status: value || undefined })}
            options={STATUS_OPTIONS}
            allowEmpty
            emptyLabel={t('account.myarticles.allStates')}
            isSearchable={false}
          />
        </Box>
      </Flex>

      {list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : (
        <DataTable
          columns={columns}
          rows={list.rows}
          loading={list.loading}
          meta={list.meta}
          onPage={list.setPage}
          emptyTitle={t('account.myarticles.youHaveNotWrittenAnything')}
          emptyHint={t('account.myarticles.articlesYouPostOnThe')}
        />
      )}
    </Box>
  );
}
