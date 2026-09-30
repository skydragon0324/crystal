import React, { useState } from 'react';
import {
  Box, Code, Modal, ModalBody, ModalCloseButton, ModalContent, ModalHeader,
  ModalOverlay, SimpleGrid, Text, useColorModeValue, useDisclosure
} from '@chakra-ui/react';

import Card from '../../components/Card';
import DataTable from '../../components/DataTable';
import Pagination from '../../components/Pagination';
import Toolbar from '../../components/Toolbar';
import StatusBadge from '../../components/StatusBadge';

import useList from '../../hooks/useList';
import useOptions from '../../hooks/useOptions';
import { audit } from '../../api';
import { useT } from '../../i18n';
import { dateTime } from '../../utils/format';

export const PAGE = '/admin/management/audit';

const ACTION_TONE = {
  create: 'OK', update: 'NORMAL', delete: 'ALERT', restore: 'WATCH', import: 'NORMAL'
};

/**
 * The audit trail.
 *
 * Only what actually MOVED is recorded on an update: a save that fixed one
 * typo reads as one typo rather than as a wall of forty unchanged fields with
 * the answer hidden in it, and a save that changed nothing is never written.
 *
 * Secrets never reach it - password hashes and licence keys are redacted at
 * the point of writing, not filtered out here.
 */
export default function Audit() {
  const t = useT();
  const detail = useDisclosure();
  const [selected, setSelected] = useState(null);

  const { options: filters } = useOptions(() => audit.filters(), []);
  const meta = Array.isArray(filters) ? {} : (filters || {});

  const list = useList(
    (params) => audit.list(params),
    { page: 1, limit: 50, sort: 'created_at', dir: 'desc', q: '' }
  );

  const columns = [
    { key: 'created_at', label: 'When', render: (row) => dateTime(row.created_at) },
    {
      key: 'manager_name', label: 'Who',
      render: (row) => (
        <Box>
          <Text fontSize="xs">{row.manager_name || t('management.audit.system')}</Text>
          <Text fontSize="0.65rem" color="gray.500">{row.manager_login || '-'}</Text>
        </Box>
      )
    },
    {
      key: 'action', label: 'Action',
      render: (row) => <StatusBadge value={ACTION_TONE[row.action] || 'NORMAL'} label={t(row.action)} />
    },
    {
      key: 'entity', label: 'Record',
      render: (row) => <Text fontSize="xs" fontFamily="mono">{row.entity} #{row.entity_pk}</Text>
    },
    {
      key: 'changed', label: 'What moved', maxW: '17.5rem', sortable: false,
      render: (row) => (
        <Text fontSize="xs" noOfLines={1} color="gray.500">
          {(row.changed || []).join(', ') || '-'}
        </Text>
      )
    },
    { key: 'page_url', label: 'Screen', maxW: '11.875rem' },
    { key: 'ip', label: 'From' }
  ];

  return (
    <Box>
      <Card bodyProps={false} subtitle={t('management.audit.anUpdateThatChangedNothing')}>
        <Toolbar
          search={list.params.q}
          onSearch={(value) => list.setFilter({ q: value })}
          filters={[
            {
              key: 'entity', label: 'Record', value: list.params.entity, width: '11.25rem',
              options: (meta.entities || []).map((name) => ({ value: name, label: name })),
              onChange: (value) => list.setFilter({ entity: value })
            },
            {
              key: 'action', label: 'Action', value: list.params.action,
              options: ['create', 'update', 'delete', 'restore', 'import']
                .map((code) => ({ value: code, label: code })),
              onChange: (value) => list.setFilter({ action: value })
            },
            {
              key: 'manager_id', label: 'Who', value: list.params.manager_id, width: '10.625rem',
              options: (meta.admins || []).map((row) => ({
                value: row.manager_id, label: row.manager_name || row.manager_login
              })),
              onChange: (value) => list.setFilter({ manager_id: value })
            }
          ]}
        />

        <DataTable
          columns={columns}
          storageKey={PAGE}
          rows={list.rows}
          loading={list.loading}
          sort={list.params.sort}
          dir={list.params.dir}
          onSort={list.setSort}
          onRowClick={(row) => { setSelected(row); detail.onOpen(); }}
        />

        <Pagination
          page={list.params.page} limit={list.params.limit} total={list.total}
          onPage={list.setPage} onLimit={(limit) => list.setFilter({ limit })}
        />
      </Card>

      <EntryModal isOpen={detail.isOpen} onClose={detail.onClose} entry={selected} />
    </Box>
  );
}

/** Both sides of one change, side by side. */
function EntryModal({ isOpen, onClose, entry }) {
  const t = useT();
  const muted = useColorModeValue('gray.500', 'gray.400');
  const bg = useColorModeValue('gray.50', 'gray.900');

  if (!entry) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="3xl" isCentered scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent borderRadius="xl">
        <ModalHeader fontSize="md">
          {entry.entity} #{entry.entity_pk}
          <Text fontSize="xs" color={muted} fontWeight="400" mt={1}>
            {t(entry.action)} - {dateTime(entry.created_at)} - {entry.manager_name || t('management.audit.system')}
          </Text>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody pb={6}>
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <Box>
              <Text fontSize="xs" color={muted} mb={1}>{t('management.audit.before')}</Text>
              <Code display="block" whiteSpace="pre-wrap" p={3} borderRadius="lg" bg={bg} fontSize="xs">
                {entry.before_data ? JSON.stringify(entry.before_data, null, 2) : '-'}
              </Code>
            </Box>
            <Box>
              <Text fontSize="xs" color={muted} mb={1}>{t('management.audit.after')}</Text>
              <Code display="block" whiteSpace="pre-wrap" p={3} borderRadius="lg" bg={bg} fontSize="xs">
                {entry.after_data ? JSON.stringify(entry.after_data, null, 2) : '-'}
              </Code>
            </Box>
          </SimpleGrid>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
