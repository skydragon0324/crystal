import React, { useEffect, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import {
  Box, Drawer, DrawerBody, DrawerCloseButton, DrawerContent, DrawerHeader, DrawerOverlay, HStack, Stack, Text
} from '@chakra-ui/react';

import Card from '../../components/Card';
import DataTable from '../../components/DataTable';
import Toolbar from '../../components/Toolbar';
import useList from '../../hooks/useList';
import { crm } from '../../api';
import { useT } from '../../i18n';
import { useSurface } from '../../theme/tokens';
import { dateTime, money, number } from '../../utils/format';
import { amount, choices, filtersFor, optionsFrom, useCrmMeta, word, partyIdLabel } from './shared';
import { Amount, InfoList, Kpi, Panel, ProjectTags } from './ui';

export const PAGE = '/admin/crm/transactions';

const TYPES = ['SALE', 'SERVICE_PAYMENT', 'APP_PURCHASE', 'LICENCE_PURCHASE', 'RESERVATION_PAYMENT', 'REFUND', 'RETURN', 'REVERSAL'];

/**
 * TRANSACTIONS - what customers bought, in every project (design 3.5 / 7).
 *
 * One list for Crystal's repair payments and store purchases, the Eshop's
 * orders and the Appstore's purchases. Each project's own order workflow
 * stays in that project; what is here is the business fact - who, what, how
 * much, when, and its outcome.
 *
 * A REFUND IS ITS OWN ROW, negative, pointing at the sale it reverses; the
 * sale is never edited. Amounts are shown as they were paid, and the total at
 * the top is the reporting currency over transactions that count - a
 * cancelled or failed order is listed and not counted.
 */
export default function Transactions() {
  const translate = useT();
  const history = useHistory();
  const location = useLocation();
  const meta = useCrmMeta();
  const surface = useSurface();
  const openId = new URLSearchParams(location.search).get('txn');

  const list = useList((params) => crm.transactions.list(params), { page: 1, limit: 25, sort: 'transaction_at', dir: 'desc' });
  const summary = list.summary || {};

  return (
    <Stack spacing={4}>
      <HStack spacing={3} align="stretch">
        <Box flex="1"><Kpi label="Transactions listed" value={number(list.total)} /></Box>
        <Box flex="1"><Kpi label="Counted" value={number(summary.counted)} hint={translate('crm.transactions.countedHint')} /></Box>
        <Box flex="1"><Kpi label="Net, reporting currency" value={money(summary.reporting_net)} /></Box>
      </HStack>

      <Card bodyProps={false}>
        <Toolbar
          search={list.params.q}
          onSearch={(searchText) => list.setFilter({ q: searchText })}
          filters={filtersFor(translate, [
            { key: 'project_id', label: 'Project', value: list.params.project_id,
              options: optionsFrom(meta.projects, 'project_id', 'project_name'),
              onChange: (value) => list.setFilter({ project_id: value || undefined }) },
            { key: 'transaction_type_code', label: 'Type', value: list.params.transaction_type_code, options: choices(TYPES),
              onChange: (value) => list.setFilter({ transaction_type_code: value || undefined }) },
            { key: 'counted', label: 'Counted or all', value: list.params.counted, options: [{ value: '1', label: 'Counted only' }],
              onChange: (value) => list.setFilter({ counted: value || undefined }) }
          ])}
        />
        <Box px="0.5rem" pb="0.5rem">
          <DataTable
            columns={[
              { key: 'transaction_at', label: 'When', render: (row) => dateTime(row.transaction_at) },
              { key: 'project_code', label: 'Project', sortable: false, render: (row) => <ProjectTags codes={[row.project_code]} /> },
              { key: 'transaction_type_code', label: 'Type', sortable: false, render: (row) => word(translate, row.transaction_type_code) },
              { key: 'external_transaction_id', label: 'Reference', sortable: false },
              { key: 'party_name', label: 'Customer', sortable: false,
                render: (row) => (row.party_name ? row.party_name + '  ' + partyIdLabel(row.party_pk) : '-') },
              { key: 'net_amount', label: 'Amount', isNumeric: true, render: (row) => <Amount value={row.net_amount} currency={row.currency_code} sign /> },
              { key: 'reporting_net_amount', label: 'Reporting amount', isNumeric: true, render: (row) => <Amount value={row.reporting_net_amount} sign /> },
              { key: 'points_used', label: 'Points used', sortable: false, isNumeric: true, render: (row) => amount(row.points_used, 0) },
              { key: 'transaction_status', label: 'Status', sortable: false,
                render: (row) => (
                  <Text as="span" color={row.is_counted ? undefined : surface.muted}>
                    {word(translate, row.transaction_status) + (row.refund_cnt ? '  ·  ' + translate('crm.transactions.refunded') : '')}
                  </Text>
                ) }
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
            rowKey={(row) => row.transaction_id || row.id}
            onRowClick={(row) => history.push(PAGE + '?txn=' + (row.transaction_id || row.id))}
            storageKey={PAGE}
          />
        </Box>
      </Card>

      <TransactionDrawer id={openId} onClose={() => history.push(PAGE)} />
    </Stack>
  );
}

export function TransactionDrawer({ id, onClose }) {
  const translate = useT();
  const history = useHistory();
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    if (!id) { setDetail(null); return; }
    crm.transactions.get(id).then(({ data }) => setDetail(data || null)).catch(() => setDetail(null));
  }, [id]);

  const record = detail || {};
  const transaction = record.transaction || {};

  return (
    <Drawer isOpen={!!id} onClose={onClose} size="md" placement="right">
      <DrawerOverlay />
      <DrawerContent>
        <DrawerCloseButton />
        <DrawerHeader fontSize="md">
          {word(translate, transaction.transaction_type_code)}{transaction.external_transaction_id ? '  ·  ' + transaction.external_transaction_id : ''}
        </DrawerHeader>
        <DrawerBody pb={6}>
          <Stack spacing={4}>
            <Panel>
              <InfoList items={[
                { label: 'Project', value: transaction.project_code ? <ProjectTags codes={[transaction.project_code]} /> : null },
                { label: 'When', value: dateTime(transaction.transaction_at) },
                { label: 'Status', value: word(translate, transaction.transaction_status) },
                { label: 'Amount', value: <Amount value={transaction.net_amount} currency={transaction.currency_code} sign /> },
                { label: 'Reporting amount', value: <Amount value={transaction.reporting_net_amount} currency={transaction.reporting_currency_code} sign /> },
                { label: 'Points used', value: amount(transaction.points_used, 0) },
                { label: 'Channel', value: transaction.sales_channel_code },
                { label: 'Service location', value: transaction.service_center_name },
                transaction.original_transaction_id ? { label: 'Reverses', value: transaction.original_external_id } : null
              ]} />
            </Panel>
            <Panel title={translate('crm.transactions.parties')} empty={(record.parties || []).length ? null : 'crm.ui.nothingYet'}>
              <InfoList items={(record.parties || []).map((participant) => ({
                label: word(translate, participant.party_role_code),
                value: (
                  <Text as="span" color="brand.500" cursor="pointer" onClick={() => history.push('/admin/crm/customers/' + participant.party_pk)}>
                    {(participant.party_name || '-') + '  ' + partyIdLabel(participant.party_pk)}
                  </Text>
                )
              }))} />
            </Panel>
            <Panel title={translate('crm.transactions.lines')} empty={(record.items || []).length ? null : 'crm.ui.nothingYet'}>
              <DataTable
                hidePagination
                rows={record.items || []}
                rowKey={(row) => row.transaction_item_id}
                columns={[
                  { key: 'product_name', label: 'Product', render: (row) => row.product_name || row.external_product_instance_id || row.external_item_id || '-' },
                  { key: 'quantity', label: 'Quantity', isNumeric: true, render: (row) => number(row.quantity) },
                  { key: 'net_amount', label: 'Amount', isNumeric: true, render: (row) => <Amount value={row.net_amount} /> }
                ]}
              />
            </Panel>
            {(record.refunds || []).length ? (
              <Panel title={translate('crm.transactions.refunds')}>
                <DataTable
                  hidePagination
                  rows={record.refunds}
                  rowKey={(row) => row.transaction_id}
                  columns={[
                    { key: 'transaction_at', label: 'When', render: (row) => dateTime(row.transaction_at) },
                    { key: 'transaction_type_code', label: 'Type', render: (row) => word(translate, row.transaction_type_code) },
                    { key: 'net_amount', label: 'Amount', isNumeric: true, render: (row) => <Amount value={row.net_amount} currency={row.currency_code} sign /> }
                  ]}
                />
              </Panel>
            ) : null}
            {(record.cases || []).length ? (
              <Panel title={translate('crm.transactions.forServiceCases')}>
                <InfoList items={record.cases.map((serviceCase) => ({ label: serviceCase.external_case_id || String(serviceCase.case_id), value: dateTime(serviceCase.received_at) }))} />
              </Panel>
            ) : null}
          </Stack>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
