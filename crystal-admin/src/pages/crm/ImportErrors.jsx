import React from 'react';
import { Box, Button, Text, useToast } from '@chakra-ui/react';

import DataTable from '../../components/DataTable';
import Toolbar from '../../components/Toolbar';
import useList from '../../hooks/useList';
import usePermission from '../../hooks/usePermission';
import { crm } from '../../api';
import { useT } from '../../i18n';
import { dateTime } from '../../utils/format';

const parsed = (value) => (typeof value === 'string' ? JSON.parse(value) : value) || null;

/**
 * ROWS OF A CUSTOMER IMPORT THAT FAILED THE FILE CHECK.
 *
 * The rest of each file was imported; these were kept with the cells as they
 * were written and every reason, so whoever loaded the sheet can correct them
 * and import them again. A row is dismissed once it is dealt with.
 */
export default function ImportErrors() {
  const translate = useT();
  const toast = useToast();
  const { canWrite } = usePermission('/admin/crm/customers');
  const list = useList((params) => crm.parties.importErrors(params), { page: 1, limit: 20 });

  const dismiss = async (row) => {
    try {
      await crm.parties.dismissImportError(row.import_error_id);
      list.reload();
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 6000, isClosable: true });
    }
  };

  const cell = (row, key) => (parsed(row.cells) || {})[key] || '-';

  return (
    <Box px={4}>
      <Text fontSize="sm" mb={1}>{translate('crm.importErrors.importErrorsIntro')}</Text>
      <Box mx={-5}><Toolbar search={list.params.q} onSearch={(q) => list.setFilter({ q: q || undefined })} /></Box>
      <DataTable
        rows={list.rows}
        loading={list.loading}
        page={list.params.page}
        limit={list.params.limit}
        total={list.total}
        onPageChange={list.setPage}
        onLimitChange={(limit) => list.setFilter({ limit })}
        rowKey={(row) => row.import_error_id}
        emptyText={translate('crm.importErrors.noImportErrors')}
        columns={[
          { key: 'created_at', label: 'Imported', render: (row) => dateTime(row.created_at) },
          { key: 'file_name', label: 'File', render: (row) => row.file_name || '-' },
          { key: 'row_number', label: 'Row' },
          { key: 'errors', label: 'What is wrong', render: (row) => (
            <Box fontSize="xs" color="red.500" whiteSpace="normal" maxW="26rem">
              {(parsed(row.errors) || []).map((reason) => <Text key={reason}>{reason}</Text>)}
            </Box>
          ) },
          { key: 'full_name', label: 'Name', render: (row) => cell(row, 'full_name') },
          { key: 'eshop', label: 'E-shop PK / ID', render: (row) => [cell(row, 'eshop_pk'), cell(row, 'eshop_id')].join(' / ') },
          { key: 'user', label: 'User PK / ID', render: (row) => [cell(row, 'user_pk'), cell(row, 'user_id')].join(' / ') },
          { key: 'mobile', label: 'Mobile', render: (row) => cell(row, 'mobile') },
          { key: 'imported_by', label: 'By', render: (row) => row.imported_by || '-' },
          { key: 'dismiss', label: 'Actions', render: (row) => (canWrite ? (
            <Button size="xs" variant="outline" onClick={(event) => { event.stopPropagation(); dismiss(row); }}>
              {translate('crm.importErrors.dismissError')}
            </Button>
          ) : null) }
        ]}
      />
    </Box>
  );
}
