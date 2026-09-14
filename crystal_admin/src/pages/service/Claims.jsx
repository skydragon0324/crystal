import React, { useState } from 'react';
import {
  Box, Button, Grid, HStack, Menu, MenuButton, MenuItem, MenuList, Text,
  useDisclosure, useToast
} from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';

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
import { agencies, claims } from '../../api';
import { useT } from '../../i18n';
import { date, money, number } from '../../utils/format';

export const PAGE = '/admin/service/claims';

/** 0 draft, 1 submitted, 2 approved, 3 rejected, 4 paid, 9 cancelled. */
const FLOW = { 0: [1, 9], 1: [2, 3, 9], 2: [4, 9], 3: [1, 9], 4: [], 9: [] };
const HEAD_OFFICE_ONLY = [2, 3, 4];

/**
 * Settlement.
 *
 * An in-warranty repair is free to the customer and not free to anybody else:
 * the centre did the work and consumed the part, and Crystal owes it that
 * money.  A claim is one month of those, batched, and it is BUILT from the
 * tickets rather than typed - a total somebody entered by hand is a total
 * nobody can check.
 *
 * Approving and paying sit behind a higher permission than submitting, which
 * is why the menu below hides those three for a branch account: a centre that
 * could approve its own claims would be writing itself cheques.
 */
export default function Claims() {
  const t = useT();
  const toast = useToast();
  const { canWrite, isSuper } = usePermission(PAGE);

  const build = useDisclosure();
  const reject = useDisclosure();
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState(null);

  const { options: centres } = useOptions(() => agencies.options(), []);
  const { options: meta } = useOptions(() => claims.meta(), []);
  const statusMap = (Array.isArray(meta) ? {} : (meta || {})).status || {};

  const list = useList(
    (params) => claims.list(params),
    { page: 1, limit: 20, sort: 'period_month', dir: 'desc', q: '' }
  );

  const run = async (action, close) => {
    setBusy(true);
    try {
      await action();
      if (close) close();
      toast({ status: 'success', description: t('common.saved'), duration: 2500 });
      list.reload();
    } catch (err) {
      toast({ status: 'error', description: err.message, duration: 7000 });
    } finally {
      setBusy(false);
    }
  };

  const summary = list.summary || {};

  const columns = [
    { key: 'claim_no', label: 'Claim', render: (row) => (
      <Text fontFamily="mono" fontSize="xs" fontWeight="600">{row.claim_no}</Text>
    ) },
    { key: 'agency_name', label: 'Service centre', maxW: '11.875rem' },
    { key: 'period_month', label: 'Month', render: (row) => date(row.period_month).slice(0, 7) },
    { key: 'ticket_count', label: 'Repairs', isNumeric: true },
    { key: 'parts_amount', label: 'Parts', isNumeric: true, render: (row) => money(row.parts_amount) },
    { key: 'labour_amount', label: 'Labour', isNumeric: true, render: (row) => money(row.labour_amount) },
    { key: 'total_amount', label: 'Claimed', isNumeric: true, render: (row) => (
      <Text fontSize="xs" fontWeight="700" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {money(row.total_amount, row.currency)}
      </Text>
    ) },
    { key: 'approved_amount', label: 'Approved', isNumeric: true, render: (row) => (
      /* The difference between claimed and approved is the conversation. */
      <Text
        fontSize="xs"
        color={row.approved_amount !== null && Number(row.approved_amount) < Number(row.total_amount)
          ? 'orange.400' : undefined}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {row.approved_amount === null ? '-' : money(row.approved_amount)}
      </Text>
    ) },
    { key: 'status', label: 'Status', render: (row) => (
      <HStack spacing={1}>
        <StatusBadge kind="claim" value={row.status} label={statusMap[row.status] || row.status} />
        {row.reject_reason && (
          <Text fontSize="0.65rem" color="red.400" noOfLines={1} maxW="8.75rem">
            {row.reject_reason}
          </Text>
        )}
      </HStack>
    ) }
  ];

  if (canWrite) {
    columns.push({
      key: '__actions', label: 'Actions', sortable: false, align: 'right', width: '7.5rem',
      render: (row) => {
        const allowed = (FLOW[row.status] || []).filter(
          (code) => isSuper || HEAD_OFFICE_ONLY.indexOf(code) === -1
        );
        if (!allowed.length) return <Text fontSize="xs" color="gray.500">-</Text>;

        return (
          <Menu placement="bottom-end">
            <MenuButton
              as={Button} size="xs" variant="ghost" rightIcon={<ChevronDownIcon />}
              onClick={(event) => event.stopPropagation()}
            >
              {t('common.moveTo')}
            </MenuButton>
            <MenuList fontSize="sm">
              {allowed.map((code) => (
                <MenuItem
                  key={code}
                  onClick={(event) => {
                    event.stopPropagation();
                    // A rejection needs a reason - the API refuses one without.
                    if (code === 3) { setTarget(row); reject.onOpen(); return; }
                    run(() => claims.transition(row.id, code));
                  }}
                >
                  {statusMap[code] || code}
                </MenuItem>
              ))}
            </MenuList>
          </Menu>
        );
      }
    });
  }

  return (
    <Box>
      <Grid templateColumns={{ base: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }} gap={4} mb={5}>
        <StatTile
          label="Awaiting review" value={summary.awaiting_cnt}
          tone={summary.awaiting_cnt > 0 ? 'serious' : undefined}
          onClick={() => list.setFilter({ status: 1 })}
        />
        <StatTile label="Repairs claimed" value={number(summary.ticket_count)} />
        <StatTile label="Claimed" value={money(summary.total_amount)} />
        <StatTile label="Approved" value={money(summary.approved_amount)} />
      </Grid>

      <Card bodyProps={false}>
        <Toolbar
          search={list.params.q}
          onSearch={(value) => list.setFilter({ q: value })}
          filters={[
            {
              key: 'status', label: 'Status', value: list.params.status,
              options: Object.keys(statusMap).map((key) => ({ value: key, label: statusMap[key] })),
              onChange: (value) => list.setFilter({ status: value })
            },
            {
              key: 'agency_id', label: 'Service centre', value: list.params.agency_id, width: '11.875rem',
              options: centres.map((centre) => ({ value: centre.id, label: centre.name })),
              onChange: (value) => list.setFilter({ agency_id: value })
            }
          ]}
          actions={canWrite && (
            <Button size="sm" colorScheme="brand" onClick={build.onOpen}>
              {t('service.claims.buildAClaim')}
            </Button>
          )}
        />

        <DataTable
          columns={columns}
          rows={list.rows}
          loading={list.loading}
          sort={list.params.sort}
          dir={list.params.dir}
          onSort={list.setSort}
        />

        <Pagination
          page={list.params.page} limit={list.params.limit} total={list.total}
          onPage={list.setPage} onLimit={(limit) => list.setFilter({ limit })}
        />
      </Card>

      <FormModal
        isOpen={build.isOpen}
        onClose={build.onClose}
        isLoading={busy}
        title={t('service.claims.buildAClaim')}
        columns={1}
        onSubmit={(payload) => run(
          () => claims.build(payload.agency_id, payload.month),
          build.onClose
        )}
        fields={[
          {
            name: 'agency_id', label: 'Service centre', type: 'select', required: true,
            options: centres.map((centre) => ({ value: centre.id, label: centre.name }))
          },
          {
            name: 'month', label: 'Month', type: 'month', required: true,
            help: 'every covered repair CLOSED in this month'
          }
        ]}
        initial={{ month: previousMonth() }}
      />

      <RejectDialog
        isOpen={reject.isOpen}
        onClose={reject.onClose}
        isLoading={busy}
        claim={target}
        onConfirm={(reason) => run(
          () => claims.transition(target.id, 3, { reject_reason: reason }),
          reject.onClose
        )}
      />
    </Box>
  );
}

/** The month before this one, as 'YYYY-MM' - what a claim is usually for. */
function previousMonth() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * Rejecting a claim, with the reason it needs.
 *
 * The API refuses a rejection with no reason - a rejection nobody can explain
 * is an argument waiting to happen - so the console asks for one rather than
 * letting somebody discover the rule by hitting it.
 */
function RejectDialog({ isOpen, onClose, onConfirm, isLoading, claim }) {
  const t = useT();
  const [reason, setReason] = useState('');

  return (
    <FormModal
      isOpen={isOpen}
      onClose={() => { setReason(''); onClose(); }}
      isLoading={isLoading}
      columns={1}
      title={t('service.claims.reject') + (claim ? ' ' + claim.claim_no : '')}
      onSubmit={(payload) => { setReason(''); onConfirm(payload.reject_reason); }}
      fields={[
        {
          name: 'reject_reason', label: 'Why it is being rejected',
          type: 'textarea', required: true, span: 1,
          placeholder: t('service.claims.theServiceCentreWillSee')
        }
      ]}
      initial={{ reject_reason: reason }}
    />
  );
}
