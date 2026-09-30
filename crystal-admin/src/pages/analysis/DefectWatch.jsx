import React, { useState } from 'react';
import {
  Box, Grid, Modal, ModalBody, ModalCloseButton, ModalContent, ModalHeader,
  ModalOverlay, Text, useColorModeValue, useDisclosure
} from '@chakra-ui/react';

import Card from '../../components/Card';
import DataTable from '../../components/DataTable';
import Pagination from '../../components/Pagination';
import Toolbar from '../../components/Toolbar';
import StatTile from '../../components/StatTile';
import StatusBadge from '../../components/StatusBadge';

import useList from '../../hooks/useList';
import useOptions from '../../hooks/useOptions';
import { analysis, categories } from '../../api';
import { useT } from '../../i18n';
import { dateTime, money, number, trend } from '../../utils/format';

export const PAGE = '/admin/analysis/defect-watch';

/**
 * The defect watch.
 *
 * A product fault does not announce itself.  It arrives as one more repair
 * than last quarter, at nine different centres, none of which can see the
 * other eight - and this is the screen that shows all nine at once.
 *
 * Sorted by repairs per thousand devices registered, not by raw count: a raw
 * count always names the best selling product as the worst built one.
 */
export default function DefectWatch() {
  const detail = useDisclosure();
  const [selected, setSelected] = useState(null);
  const [batches, setBatches] = useState([]);

  const { options: sections } = useOptions(() => categories.options(), []);

  const list = useList(
    (params) => analysis.defects(params),
    { page: 1, limit: 50, sort: 'rate_per_1k', dir: 'desc' }
  );

  const summary = list.summary || {};

  const open = async (row) => {
    setSelected(row);
    setBatches([]);
    detail.onOpen();
    try {
      const { data } = await analysis.defectDetail(row.product_id, row.symptom_id);
      setBatches(data.batches || []);
    } catch (err) {
      setBatches([]);
    }
  };

  const columns = [
    {
      key: 'product_name', label: 'Device', maxW: '11.875rem',
      render: (row) => (
        <Box>
          <Text fontSize="xs" fontWeight="600" noOfLines={1}>{row.product_name}</Text>
          <Text fontSize="0.65rem" color="gray.500">{row.category_name}</Text>
        </Box>
      )
    },
    {
      key: 'symptom_name', label: 'Symptom', maxW: '11.875rem',
      render: (row) => (
        <Box>
          <Text fontSize="xs" noOfLines={1}>{row.symptom_name}</Text>
          <Text fontSize="0.65rem" color="gray.500">{row.component}</Text>
        </Box>
      )
    },
    {
      key: 'watch_level', label: 'Watch level',
      render: (row) => <StatusBadge value={row.watch_level} />
    },
    { key: 'cnt_90d', label: 'Repairs 90d', isNumeric: true },
    {
      key: 'rate_per_1k', label: 'Per 1k devices', isNumeric: true,
      render: (row) => (
        <Text fontSize="xs" fontWeight="600" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {row.rate_per_1k === null ? '-' : number(row.rate_per_1k, 2)}
        </Text>
      )
    },
    {
      key: 'trend_pct', label: 'Trend', isNumeric: true,
      render: (row) => <Trend value={row.trend_pct} />
    },
    { key: 'device_cnt_90d', label: 'Devices', isNumeric: true },
    {
      key: 'agency_cnt_90d', label: 'Centres', isNumeric: true,
      render: (row) => (
        <Text
          fontSize="xs"
          fontWeight={row.agency_cnt_90d >= 4 ? 700 : 400}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {row.agency_cnt_90d}
        </Text>
      )
    },
    {
      key: 'covered_90d', label: 'Warranty cost', isNumeric: true,
      render: (row) => money(row.covered_90d)
    },
    {
      key: 'last_seen_at', label: 'Last seen', isNumeric: true,
      render: (row) => dateTime(row.last_seen_at)
    }
  ];

  return (
    <Box>
      <Grid templateColumns={{ base: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', xl: 'repeat(5, 1fr)' }} gap={4} mb={5}>
        <StatTile
          label="Alerts" value={summary.alert_cnt}
          tone={summary.alert_cnt > 0 ? 'critical' : 'good'}
          onClick={() => list.setFilter({ watch_level: 'ALERT' })}
        />
        <StatTile
          label="Watching" value={summary.watch_cnt} tone={summary.watch_cnt > 0 ? 'serious' : undefined}
          onClick={() => list.setFilter({ watch_level: 'WATCH' })}
        />
        <StatTile label="Products affected" value={summary.product_cnt} />
        <StatTile label="Repairs (90 days)" value={number(summary.repair_cnt)} />
        <StatTile label="Warranty cost (90 days)" value={money(summary.covered_90d)} />
      </Grid>

      <Card bodyProps={false}>
        <Toolbar
          search={list.params.q}
          onSearch={(value) => list.setFilter({ q: value })}
          filters={[
            {
              key: 'watch_level', label: 'Watch level', value: list.params.watch_level,
              options: [
                { value: 'ALERT', label: 'Alert' },
                { value: 'WATCH', label: 'Watch' },
                { value: 'NORMAL', label: 'Normal' }
              ],
              onChange: (value) => list.setFilter({ watch_level: value })
            },
            {
              key: 'category_id', label: 'Section', value: list.params.category_id, width: '10.625rem',
              options: sections.map((row) => ({ value: row.id, label: row.name })),
              onChange: (value) => list.setFilter({ category_id: value })
            },
            {
              key: 'component', label: 'Component', value: list.params.component, width: '10rem',
              options: ['DISPLAY', 'BATTERY', 'BOARD', 'CAMERA', 'AUDIO', 'POWER', 'NETWORK', 'SOFTWARE', 'CASING', 'OTHER']
                .map((code) => ({ value: code, label: code })),
              onChange: (value) => list.setFilter({ component: value })
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
          onRowClick={open}
        />

        <Pagination
          page={list.params.page} limit={list.params.limit} total={list.total}
          onPage={list.setPage} onLimit={(limit) => list.setFilter({ limit })}
        />
      </Card>

      <BatchModal
        isOpen={detail.isOpen}
        onClose={detail.onClose}
        row={selected}
        batches={batches}
      />
    </Box>
  );
}

/** A trend against last quarter, coloured only when it is going the wrong way. */
function Trend({ value }) {
  const bad = useColorModeValue('red.500', 'red.300');
  const good = useColorModeValue('green.600', 'green.300');

  if (value === null || value === undefined) {
    // A symptom seen for the first time this quarter has no trend, and
    // reporting it as +100% would put every new symptom at the top for ever.
    return <Text fontSize="xs" color="gray.500">-</Text>;
  }

  const n = Number(value);
  return (
    <Text
      fontSize="xs"
      fontWeight={n >= 50 ? 700 : 400}
      color={n > 0 ? bad : (n < 0 ? good : undefined)}
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {trend(value)}
    </Text>
  );
}

/**
 * What is behind one row: which production batches the fault is turning up in.
 *
 * This is the point of the whole screen.  A fault that is really a bad batch
 * looks like a bad product until somebody can group by the batch code, and
 * the difference decides whether an engineer redesigns something or a factory
 * quarantines three weeks of output.
 */
function BatchModal({ isOpen, onClose, row, batches }) {
  const t = useT();
  const muted = useColorModeValue('gray.500', 'gray.400');

  const columns = [
    { key: 'batch_code', label: 'Batch', render: (r) => (
      <Text fontFamily="mono" fontSize="xs">{r.batch_code}</Text>
    ) },
    { key: 'factory_code', label: 'Factory' },
    { key: 'repair_cnt', label: 'Repairs', isNumeric: true },
    { key: 'device_cnt', label: 'Devices', isNumeric: true },
    { key: 'first_seen_at', label: 'First seen', isNumeric: true, render: (r) => dateTime(r.first_seen_at) },
    { key: 'last_seen_at', label: 'Last seen', isNumeric: true, render: (r) => dateTime(r.last_seen_at) }
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="3xl" isCentered scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent borderRadius="xl">
        <ModalHeader fontSize="md">
          {row ? row.product_name + ' - ' + row.symptom_name : ''}
          <Text fontSize="xs" color={muted} fontWeight="400" mt={1}>
            {t('analysis.defectwatch.whichProductionBatchesThisFault')}
          </Text>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody pb={6}>
          <DataTable
            columns={columns}
            rows={batches}
            emptyText={t('analysis.defectwatch.noBatchInformationTheseSerials')}
          />
          <Text fontSize="0.68rem" color={muted} mt={3}>
            {t('analysis.defectwatch.serialsTheMirrorHasNever')}
          </Text>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
