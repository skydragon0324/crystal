import React, { useMemo, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { Box, Button, Grid, HStack, Text, useDisclosure, useToast } from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';

import Card from '../../components/Card';
import DataTable from '../../components/DataTable';
import Pagination from '../../components/Pagination';
import Toolbar from '../../components/Toolbar';
import FormModal from '../../components/FormModal';
import StatTile from '../../components/StatTile';
import StatusBadge from '../../components/StatusBadge';

import useList from '../../hooks/useList';
import useOptions from '../../hooks/useOptions';
import usePermission from '../../hooks/usePermission';
import { agencies, symptoms, tickets } from '../../api';
import { useT } from '../../i18n';
import { dateTime, money, since } from '../../utils/format';

export const PAGE = '/admin/service/tickets';

/**
 * The repair queue.
 *
 * The four tiles above the table are taken over the whole filtered set rather
 * than over the page, so they mean the same thing on page one and page seven
 * - and because they are the filters people actually use, clicking one
 * applies it.
 */
export default function Tickets() {
  const t = useT();
  const toast = useToast();
  const history = useHistory();
  const { canWrite } = usePermission(PAGE);

  const intake = useDisclosure();
  const [saving, setSaving] = useState(false);

  const { options: meta } = useOptions(() => tickets.meta(), []);
  const { options: centres } = useOptions(() => agencies.options(), []);
  const { options: faults } = useOptions(() => symptoms.list({ limit: 200 }), []);

  /*
   * meta answers an object rather than a list, and useOptions hands back []
   * for that - so both of these are memoised on `meta` itself.  Without it
   * they are a new object on every render, and the useMemo below that depends
   * on statusMap would recompute for ever.
   */
  const codes = useMemo(() => (Array.isArray(meta) ? {} : (meta || {})), [meta]);
  const statusMap = useMemo(() => codes.status || {}, [codes]);

  const list = useList(
    (params) => tickets.list(params),
    { page: 1, limit: 20, sort: 'received_at', dir: 'desc', q: '' }
  );

  const statusOptions = useMemo(
    () => Object.keys(statusMap).map((key) => ({ value: key, label: statusMap[key] })),
    [statusMap]
  );

  const columns = [
    {
      key: 'ticket_no', label: 'Ticket', width: '6.875rem',
      render: (row) => <Text fontFamily="mono" fontSize="xs" fontWeight="600">{row.ticket_no}</Text>
    },
    {
      key: 'customer_name', label: 'Customer', maxW: '10rem',
      render: (row) => (
        <Box>
          <Text fontSize="xs" fontWeight="500" noOfLines={1}>{row.customer_name}</Text>
          <Text fontSize="0.65rem" color="gray.500">{row.customer_phone}</Text>
        </Box>
      )
    },
    {
      key: 'serial_number', label: 'Device', maxW: '11.875rem',
      render: (row) => (
        <Box>
          <Text fontSize="xs" noOfLines={1}>{row.product_name || '-'}</Text>
          <Text fontSize="0.65rem" fontFamily="mono" color="gray.500">{row.serial_number}</Text>
        </Box>
      )
    },
    { key: 'symptom_name', label: 'Symptom', maxW: '9.375rem' },
    { key: 'agency_name', label: 'Service centre', maxW: '9.375rem' },
    {
      key: 'status', label: 'Status',
      render: (row) => (
        <HStack spacing={1}>
          <StatusBadge kind="ticket" value={row.status} label={statusMap[row.status] || row.status} />
          {row.is_overdue && <StatusBadge value="OVERDUE" label={t('common.overdue')} />}
        </HStack>
      )
    },
    {
      key: 'is_warranty', label: 'Cover',
      render: (row) => (
        <StatusBadge
          value={row.is_warranty ? 'ACTIVE' : 'CLOSED'}
          label={t(row.is_warranty ? 'Under warranty' : 'Chargeable')}
        />
      )
    },
    {
      key: 'total_amount', label: 'Amount', isNumeric: true,
      render: (row) => (
        <Text fontSize="xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {money(row.total_amount, row.currency)}
        </Text>
      )
    },
    {
      key: 'received_at', label: 'Received', isNumeric: true,
      render: (row) => (
        <Box textAlign="right">
          <Text fontSize="xs">{dateTime(row.received_at)}</Text>
          <Text fontSize="0.65rem" color="gray.500">{since(row.received_at)}</Text>
        </Box>
      )
    }
  ];

  const takeIn = async (payload) => {
    setSaving(true);
    try {
      const { data } = await tickets.create(payload);
      intake.onClose();
      toast({ status: 'success', description: data.ticket_no, duration: 3000 });
      // Straight to the ticket: the next thing anybody does after taking a
      // device in is diagnose it, and that is not on this screen.
      history.push(PAGE + '/' + data.id);
    } catch (err) {
      toast({ status: 'error', description: err.message, duration: 6000 });
    } finally {
      setSaving(false);
    }
  };

  const summary = list.summary || {};
  const codeOptions = (map) =>
    Object.keys(map || {}).map((key) => ({ value: key, label: map[key] }));

  return (
    <Box>
      <Grid templateColumns={{ base: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }} gap={4} mb={5}>
        <StatTile
          label="Open" value={summary.open_cnt}
          onClick={() => list.setFilter({ open: 1, overdue: undefined, status: '' })}
        />
        <StatTile
          label="Overdue" value={summary.overdue_cnt}
          tone={summary.overdue_cnt > 0 ? 'critical' : 'good'}
          onClick={() => list.setFilter({ overdue: 1, open: undefined, status: '' })}
        />
        <StatTile label="Under warranty" value={summary.warranty_cnt} />
        <StatTile
          label="Charged" value={money(summary.charged_amount)}
          hint={t('common.covered', { amount: money(summary.covered_amount) })}
        />
      </Grid>

      <Card bodyProps={false}>
        <Toolbar
          search={list.params.q}
          onSearch={(value) => list.setFilter({ q: value })}
          filters={[
            {
              key: 'status', label: 'Status', value: list.params.status,
              options: statusOptions,
              onChange: (value) => list.setFilter({ status: value, open: undefined, overdue: undefined })
            },
            {
              key: 'agency_id', label: 'Service centre', value: list.params.agency_id, width: '11.25rem',
              options: centres.map((centre) => ({ value: centre.id, label: centre.name })),
              onChange: (value) => list.setFilter({ agency_id: value })
            },
            {
              key: 'symptom_id', label: 'Symptom', value: list.params.symptom_id, width: '10.625rem',
              options: faults.map((fault) => ({ value: fault.id, label: fault.name })),
              onChange: (value) => list.setFilter({ symptom_id: value })
            },
            {
              key: 'is_warranty', label: 'Cover', value: list.params.is_warranty,
              options: [
                { value: '1', label: 'Under warranty' },
                { value: '0', label: 'Chargeable' }
              ],
              onChange: (value) => list.setFilter({ is_warranty: value })
            }
          ]}
          actions={
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => list.setParams({
                  page: 1, limit: list.params.limit, sort: 'received_at', dir: 'desc', q: ''
                })}
              >
                {t('service.tickets.reset')}
              </Button>

              {canWrite && (
                <Button
                  size="sm"
                  colorScheme="brand"
                  leftIcon={<AddIcon boxSize="0.7em" />}
                  onClick={intake.onOpen}
                >
                  {t('service.tickets.takeInADevice')}
                </Button>
              )}
            </>
          }
        />

        <DataTable
          columns={columns}
          rows={list.rows}
          loading={list.loading}
          sort={list.params.sort}
          dir={list.params.dir}
          onSort={list.setSort}
          onRowClick={(row) => history.push(PAGE + '/' + row.id)}
        />

        <Pagination
          page={list.params.page}
          limit={list.params.limit}
          total={list.total}
          onPage={list.setPage}
          onLimit={(limit) => list.setFilter({ limit })}
        />
      </Card>

      <FormModal
        isOpen={intake.isOpen}
        onClose={intake.onClose}
        onSubmit={takeIn}
        isLoading={saving}
        title={t('service.tickets.takeInADevice')}
        fields={[
          { name: 'customer_name', label: 'Customer', required: true },
          { name: 'customer_phone', label: 'Phone', required: true },
          { name: 'customer_email', label: 'Email', type: 'email' },
          { name: 'serial_number', label: 'Serial number', required: true },
          {
            name: 'agency_id', label: 'Service centre', type: 'select', required: true,
            options: centres.map((centre) => ({ value: centre.id, label: centre.name }))
          },
          {
            name: 'symptom_id', label: 'Symptom', type: 'select',
            options: faults.map((fault) => ({ value: fault.id, label: fault.name }))
          },
          { name: 'intake_channel', label: 'Intake', type: 'select', options: codeOptions(codes.intake_channel) },
          { name: 'priority', label: 'Priority', type: 'select', options: codeOptions(codes.priority) },
          { name: 'accessories', label: 'Accessories handed in', span: 2 },
          {
            name: 'fault_description', label: 'What the customer reports',
            type: 'textarea', required: true, span: 2
          }
        ]}
      />
    </Box>
  );
}
