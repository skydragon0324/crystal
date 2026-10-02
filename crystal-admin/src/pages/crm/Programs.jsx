import React, { useState } from 'react';
import { useHistory } from 'react-router-dom';
import { Box, Button, useDisclosure, useToast } from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';

import Card from '../../components/Card';
import DataTable from '../../components/DataTable';
import FormModal from '../../components/FormModal';
import Toolbar from '../../components/Toolbar';
import useList from '../../hooks/useList';
import usePermission from '../../hooks/usePermission';
import { crm } from '../../api';
import { useT } from '../../i18n';
import { dateTime, number } from '../../utils/format';
import { Status, choices, word, filtersFor } from './shared';
import { useProgramFields } from './programFields';

export const PAGE = '/admin/crm/programs';

export const TYPES = ['RESERVATION', 'LOTTERY', 'PRIZE_SERVICE', 'PUZZLE', 'SURVEY_REWARD', 'EVENT_ATTENDANCE'];
export const STATUSES = ['DRAFT', 'APPROVED', 'TARGETS_FROZEN', 'OPEN', 'CLOSED', 'FULFILLED', 'CANCELLED'];

/**
 * ACTIVITY PROGRAMS - reservations, lotteries, prize services, puzzles.
 *
 * What the vendor ran as a table per campaign type is one kind of record
 * here, with one lifecycle: written, approved by a second manager, its target
 * list frozen, opened, closed and fulfilled. Opening a program shows its
 * setup, its targets, the numbered entries taken, and what was awarded.
 */
export default function Programs() {
  const t = useT();
  const toast = useToast();
  const history = useHistory();
  const form = useDisclosure();
  const { canWrite } = usePermission(PAGE);
  const [saving, setSaving] = useState(false);
  const fields = useProgramFields(true);

  const list = useList((params) => crm.programs.list(params), { page: 1, limit: 20, sort: 'created_at', dir: 'desc' });

  const create = async (values) => {
    setSaving(true);
    try {
      const { data } = await crm.programs.create(values);
      toast({ title: t('Created'), status: 'success', duration: 2500 });
      form.onClose();
      if (data && data.activity_program_id) history.push(PAGE + '/' + data.activity_program_id);
      else list.reload();
      return true;
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 6000, isClosable: true });
      return false;
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card bodyProps={false}>
      <Toolbar
        search={list.params.q}
        onSearch={(searchText) => list.setFilter({ q: searchText })}
        filters={filtersFor(t, [
          { key: 'status', label: 'Status', value: list.params.status, options: choices(STATUSES),
            onChange: (value) => list.setFilter({ status: value || undefined }) },
          { key: 'program_type', label: 'Type', value: list.params.program_type, options: choices(TYPES),
            onChange: (value) => list.setFilter({ program_type: value || undefined }) }
        ])}
        actions={canWrite ? (
          <Button size="sm" variant="brand" leftIcon={<AddIcon w="0.5625rem" h="0.5625rem" />} onClick={form.onOpen}>
            {t('crm.programs.newProgram')}
          </Button>
        ) : null}
      />
      <Box px="0.5rem" pb="0.5rem">
        <DataTable
          columns={[
            { key: 'program_code', label: 'Code' },
            { key: 'program_name', label: 'Program', maxW: '16rem' },
            { key: 'program_type', label: 'Type', sortable: false, render: (row) => word(t, row.program_type) },
            { key: 'eligibility_basis', label: 'Who may take part', sortable: false, render: (row) => word(t, row.eligibility_basis) },
            { key: 'status', label: 'Status', sortable: false, render: (row) => <Status value={row.status} /> },
            { key: 'target_cnt', label: 'Targets', sortable: false, isNumeric: true, render: (row) => number(row.target_cnt) },
            { key: 'reservation_cnt', label: 'Entries', sortable: false, isNumeric: true, render: (row) => number(row.reservation_cnt) },
            { key: 'award_cnt', label: 'Awards', sortable: false, isNumeric: true, render: (row) => number(row.award_cnt) },
            { key: 'starts_at', label: 'Opens', render: (row) => dateTime(row.starts_at) },
            { key: 'ends_at', label: 'Closes', sortable: false, render: (row) => dateTime(row.ends_at) }
          ]}
          rows={list.rows}
          loading={list.loading}
          page={list.params.page}
          limit={list.params.limit}
          total={list.total}
          sort={list.params.sort}
          dir={list.params.dir}
          onSort={list.setSort}
          onPageChange={list.setPage}
          onLimitChange={(limit) => list.setFilter({ limit: limit })}
          rowKey={(row) => row.activity_program_id || row.id}
          onRowClick={(row) => history.push(PAGE + '/' + (row.activity_program_id || row.id))}
          storageKey={PAGE}
        />
      </Box>

      <FormModal
        isOpen={form.isOpen}
        onClose={form.onClose}
        title={t('crm.programs.newProgram')}
        initial={{ program_type: 'RESERVATION', eligibility_basis: 'MANUAL', number_start: 1 }}
        onSubmit={create}
        saving={saving}
        size="3xl"
        fields={fields}
      />
    </Card>
  );
}
