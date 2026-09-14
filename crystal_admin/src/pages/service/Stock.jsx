import React, { useState } from 'react';
import {
  Box, Button, Grid, Tab, TabList, TabPanel, TabPanels, Tabs, Text,
  useDisclosure, useToast
} from '@chakra-ui/react';

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
import { agencies, parts, replenishments, stock } from '../../api';
import { useT } from '../../i18n';
import { dateTime, money, number } from '../../utils/format';

export const PAGE = '/admin/service/stock';

/**
 * What is on the shelves, and every movement of them.
 *
 * Two tabs because they answer two different questions: the balance says what
 * can be promised today, and the ledger says how it got that way.  The second
 * is what somebody reads when the first looks wrong, and it is append only -
 * a correction is another movement, never an edit.
 */
export default function Stock() {
  const t = useT();
  const toast = useToast();
  const { canWrite } = usePermission(PAGE);

  const { options: centres } = useOptions(() => agencies.options(), []);
  const { options: partList } = useOptions(() => parts.options(), []);

  const [busy, setBusy] = useState(false);
  const movement = useDisclosure();
  const stocktake = useDisclosure();

  const balance = useList(
    (params) => stock.list(params),
    { page: 1, limit: 50, sort: 'part_no', dir: 'asc', q: '' }
  );

  const ledger = useList(
    (params) => stock.movements(params),
    { page: 1, limit: 50, sort: 'created_at', dir: 'desc', q: '' }
  );

  const run = async (action, close) => {
    setBusy(true);
    try {
      await action();
      close();
      toast({ status: 'success', description: t('common.saved'), duration: 2500 });
      balance.reload();
      ledger.reload();
    } catch (err) {
      toast({ status: 'error', description: err.message, duration: 7000 });
    } finally {
      setBusy(false);
    }
  };

  const raiseOrder = async () => {
    const agencyId = balance.params.agency_id;
    if (!agencyId) {
      toast({ status: 'info', description: t('service.stock.chooseAServiceCentreFirst'), duration: 4000 });
      return;
    }
    await run(() => replenishments.fromShortages(agencyId), () => {});
  };

  const summary = balance.summary || {};

  const balanceColumns = [
    { key: 'part_no', label: 'Part', render: (row) => (
      <Box>
        <Text fontSize="xs" fontFamily="mono" fontWeight="600">{row.part_no}</Text>
        <Text fontSize="0.65rem" color="gray.500" noOfLines={1}>{row.part_name}</Text>
      </Box>
    ) },
    { key: 'agency_name', label: 'Service centre', maxW: '10.625rem' },
    { key: 'component', label: 'Component' },
    { key: 'bin', label: 'Bin' },
    { key: 'on_hand', label: 'On hand', isNumeric: true },
    { key: 'reserved', label: 'Reserved', isNumeric: true },
    { key: 'available', label: 'Available', isNumeric: true, render: (row) => (
      <Text fontSize="xs" fontWeight="700" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {row.available}
      </Text>
    ) },
    { key: 'reorder_level', label: 'Reorder at', isNumeric: true },
    { key: 'shortfall', label: 'Shortfall', isNumeric: true, render: (row) => (
      <Text fontSize="xs" color={row.shortfall > 0 ? 'red.400' : undefined}
        style={{ fontVariantNumeric: 'tabular-nums' }}>
        {row.shortfall || '-'}
      </Text>
    ) },
    { key: 'stock_state', label: 'State', render: (row) => <StatusBadge value={row.stock_state} /> },
    { key: 'stock_value', label: 'Value', isNumeric: true, render: (row) => money(row.stock_value) }
  ];

  const ledgerColumns = [
    { key: 'created_at', label: 'When', render: (row) => dateTime(row.created_at) },
    { key: 'part_no', label: 'Part', render: (row) => (
      <Text fontSize="xs" fontFamily="mono">{row.part_no}</Text>
    ) },
    { key: 'agency_name', label: 'Service centre', maxW: '10rem' },
    { key: 'movement', label: 'Movement', render: (row) => (
      <StatusBadge value={Number(row.quantity) > 0 ? 'OK' : 'LOW'} label={t(row.movement)} />
    ) },
    { key: 'quantity', label: 'Quantity', isNumeric: true, render: (row) => (
      <Text fontSize="xs" fontWeight="600"
        color={Number(row.quantity) > 0 ? 'green.500' : 'red.400'}
        style={{ fontVariantNumeric: 'tabular-nums' }}>
        {Number(row.quantity) > 0 ? '+' : ''}{row.quantity}
      </Text>
    ) },
    { key: 'balance_after', label: 'Balance', isNumeric: true },
    { key: 'reference_type', label: 'Against', render: (row) => (
      <Text fontSize="xs">{row.note || row.reference_type || '-'}</Text>
    ) },
    { key: 'manager_name', label: 'By' }
  ];

  const centreFilter = {
    key: 'agency_id', label: 'Service centre', width: '11.875rem',
    options: centres.map((centre) => ({ value: centre.id, label: centre.name }))
  };

  return (
    <Box>
      <Grid templateColumns={{ base: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }} gap={4} mb={5}>
        <StatTile
          label="Out of stock" value={summary.out_cnt}
          tone={summary.out_cnt > 0 ? 'critical' : 'good'}
          onClick={() => balance.setFilter({ state: 'OUT' })}
        />
        <StatTile
          label="Low stock" value={summary.low_cnt}
          tone={summary.low_cnt > 0 ? 'serious' : undefined}
          onClick={() => balance.setFilter({ state: 'LOW' })}
        />
        <StatTile label="Units short" value={number(summary.shortfall)} />
        <StatTile label="Stock value" value={money(summary.stock_value)} />
      </Grid>

      <Tabs variant="soft-rounded" colorScheme="brand" size="sm">
        <TabList mb={4}>
          <Tab>{t('service.stock.onTheShelf')}</Tab>
          <Tab>{t('service.stock.theLedger')}</Tab>
        </TabList>

        <TabPanels>
          <TabPanel p={0}>
            <Card bodyProps={false}>
              <Toolbar
                search={balance.params.q}
                onSearch={(value) => balance.setFilter({ q: value })}
                filters={[
                  { ...centreFilter, value: balance.params.agency_id,
                    onChange: (value) => balance.setFilter({ agency_id: value }) },
                  {
                    key: 'state', label: 'State', value: balance.params.state,
                    options: [
                      { value: 'OUT', label: 'Out of stock' },
                      { value: 'LOW', label: 'Low stock' },
                      { value: 'OK', label: 'In stock' }
                    ],
                    onChange: (value) => balance.setFilter({ state: value })
                  }
                ]}
                actions={canWrite && (
                  <>
                    <Button size="sm" variant="ghost" onClick={raiseOrder} isLoading={busy}>
                      {t('service.stock.orderWhatIsShort')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={stocktake.onOpen}>
                      {t('service.stock.stocktake')}
                    </Button>
                    <Button size="sm" colorScheme="brand" onClick={movement.onOpen}>
                      {t('service.stock.recordAMovement')}
                    </Button>
                  </>
                )}
              />

              <DataTable
                columns={balanceColumns}
                rows={balance.rows}
                loading={balance.loading}
                sort={balance.params.sort}
                dir={balance.params.dir}
                onSort={balance.setSort}
              />

              <Pagination
                page={balance.params.page} limit={balance.params.limit} total={balance.total}
                onPage={balance.setPage} onLimit={(limit) => balance.setFilter({ limit })}
              />
            </Card>
          </TabPanel>

          <TabPanel p={0}>
            <Card
              bodyProps={false}
              subtitle={t('service.stock.appendOnlyACorrectionIs')}
            >
              <Toolbar
                search={ledger.params.q}
                onSearch={(value) => ledger.setFilter({ q: value })}
                filters={[
                  { ...centreFilter, value: ledger.params.agency_id,
                    onChange: (value) => ledger.setFilter({ agency_id: value }) },
                  {
                    key: 'movement', label: 'Movement', value: ledger.params.movement,
                    options: ['RECEIPT', 'ISSUE', 'RETURN', 'SCRAP', 'ADJUST', 'TRANSFER']
                      .map((code) => ({ value: code, label: code })),
                    onChange: (value) => ledger.setFilter({ movement: value })
                  }
                ]}
              />

              <DataTable
                columns={ledgerColumns}
                rows={ledger.rows}
                loading={ledger.loading}
                sort={ledger.params.sort}
                dir={ledger.params.dir}
                onSort={ledger.setSort}
              />

              <Pagination
                page={ledger.params.page} limit={ledger.params.limit} total={ledger.total}
                onPage={ledger.setPage} onLimit={(limit) => ledger.setFilter({ limit })}
              />
            </Card>
          </TabPanel>
        </TabPanels>
      </Tabs>

      <FormModal
        isOpen={movement.isOpen}
        onClose={movement.onClose}
        isLoading={busy}
        title={t('service.stock.recordAMovement')}
        onSubmit={(payload) => run(() => stock.move(payload), movement.onClose)}
        fields={[
          {
            name: 'agency_id', label: 'Service centre', type: 'select', required: true,
            options: centres.map((centre) => ({ value: centre.id, label: centre.name }))
          },
          {
            name: 'part_id', label: 'Part', type: 'select', required: true,
            options: partList.map((part) => ({ value: part.id, label: part.part_no + ' - ' + part.name }))
          },
          {
            name: 'movement', label: 'Movement', type: 'select', required: true,
            options: [
              { value: 'RECEIPT', label: 'Receipt' },
              { value: 'RETURN', label: 'Return' },
              { value: 'SCRAP', label: 'Scrap' },
              { value: 'ADJUST', label: 'Adjustment' }
            ]
          },
          { name: 'quantity', label: 'Quantity', type: 'number', required: true },
          { name: 'unit_cost', label: 'Unit cost', type: 'number', step: '0.01' },
          { name: 'note', label: 'Note', span: 2 }
        ]}
        initial={{ movement: 'RECEIPT', quantity: 1, agency_id: balance.params.agency_id }}
      />

      <FormModal
        isOpen={stocktake.isOpen}
        onClose={stocktake.onClose}
        isLoading={busy}
        title={t('service.stock.stocktake')}
        onSubmit={(payload) => run(() => stock.stocktake(payload), stocktake.onClose)}
        fields={[
          {
            name: 'agency_id', label: 'Service centre', type: 'select', required: true,
            options: centres.map((centre) => ({ value: centre.id, label: centre.name }))
          },
          {
            name: 'part_id', label: 'Part', type: 'select', required: true,
            options: partList.map((part) => ({ value: part.id, label: part.part_no + ' - ' + part.name }))
          },
          {
            name: 'counted', label: 'Counted', type: 'number', required: true, span: 2,
            help: 'what is actually on the shelf'
          },
          { name: 'note', label: 'Note', span: 2 }
        ]}
        initial={{ agency_id: balance.params.agency_id }}
      />
    </Box>
  );
}
