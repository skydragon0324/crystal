import React, { useEffect, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import {
  Box, Button, Modal, ModalBody, ModalCloseButton, ModalContent, ModalHeader, ModalOverlay, Stack,
  Tab, TabList, TabPanel, TabPanels, Tabs, Text, useDisclosure, useToast
} from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';

import Card from '../../components/Card';
import CrudPage from '../../components/CrudPage';
import DataTable from '../../components/DataTable';
import FormModal from '../../components/FormModal';
import Toolbar from '../../components/Toolbar';
import { useConfirm } from '../../components/ConfirmDialog';
import useList from '../../hooks/useList';
import usePermission from '../../hooks/usePermission';
import { crm } from '../../api';
import { useT } from '../../i18n';
import { date, dateTime, number } from '../../utils/format';
import {
  Fact, Facts, PartyPicker, Status, choices, optionsFrom, useCatalogOptions, useCrmMeta, useSiteOptions, word, filtersFor, partyIdLabel } from './shared';

export const PAGE = '/admin/crm/products';

const END_REASONS = ['RETURNED', 'LOST', 'SCRAPPED', 'EXPIRED', 'CANCELLED', 'ASSIGNMENT_END'];

/**
 * PRODUCTS AND REGISTRATIONS - who holds what, and how.
 *
 * One list for every kind of registration: a phone, a television, a karaoke
 * licence, an app. Each row is one party's hold on one product for a period;
 * a product that changed hands shows up once per holder, which is what makes
 * "who had it in March" answerable.
 *
 * The catalogue tab is the CRM's own product list - the level of detail it
 * needs, across every project - and is where a product is given its class,
 * which is what the points rules and the events read.
 */
export default function Products() {
  const translate = useT();
  const location = useLocation();
  const history = useHistory();
  const instanceId = new URLSearchParams(location.search).get('instance');

  return (
    <Box>
      <Card bodyProps={false}>
        <Tabs isLazy variant="line" colorScheme="brand">
          <TabList px={4} pt={2}>
            <Tab fontSize="sm">{translate('crm.products.registrations')}</Tab>
            <Tab fontSize="sm">{translate('crm.products.devicesAndLicences')}</Tab>
            <Tab fontSize="sm">{translate('crm.products.catalogue')}</Tab>
          </TabList>
          <TabPanels>
            <TabPanel px={0}><Registrations /></TabPanel>
            <TabPanel px={0}><Instances /></TabPanel>
            <TabPanel px={0}><Catalogue /></TabPanel>
          </TabPanels>
        </Tabs>
      </Card>
      <InstanceDetail id={instanceId} onClose={() => history.push(PAGE)} />
    </Box>
  );
}

function Registrations() {
  const translate = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const history = useHistory();
  const meta = useCrmMeta();
  const catalog = useCatalogOptions();
  const sites = useSiteOptions();
  const form = useDisclosure();
  const { canWrite } = usePermission(PAGE);
  const [saving, setSaving] = useState(false);
  const [ending, setEnding] = useState(null);

  const list = useList((params) => crm.products.registrations(params), { page: 1, limit: 20, current: 1, dir: 'desc' });

  const register = async (values) => {
    setSaving(true);
    try {
      const { data } = await crm.products.register(values);
      const paid = data && data.point_event ? Number(data.point_event.points_delta) : 0;
      toast({
        title: paid ? translate('crm.products.registeredWithPoints', { n: number(paid) }) : translate('crm.products.registered'),
        status: 'success', duration: 3000
      });
      form.onClose();
      list.reload();
      return true;
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 6000, isClosable: true });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const end = async (values) => {
    const agreed = await confirm({
      tone: 'danger', title: translate('crm.products.endRegistration'), body: translate('crm.products.endExplained'),
      detail: ending.external_product_instance_id, confirmLabel: translate('crm.products.end')
    });
    if (!agreed) return false;
    try {
      await crm.products.endRegistration(ending.product_registration_id, values.end_reason_code);
      toast({ title: translate('Saved'), status: 'success', duration: 2500 });
      setEnding(null);
      list.reload();
      return true;
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 6000, isClosable: true });
      return false;
    }
  };

  return (
    <Box>
      <Toolbar
        search={list.params.q}
        onSearch={(searchText) => list.setFilter({ q: searchText })}
        filters={filtersFor(translate, [
          { key: 'current', label: 'Current or past', value: list.params.current,
            options: [{ value: 1, label: 'Current only' }],
            onChange: (value) => list.setFilter({ current: value || undefined }) },
          { key: 'relationship_code', label: 'Held as', value: list.params.relationship_code,
            options: choices(['OWNER', 'USER', 'REGISTERED_USER', 'LESSEE', 'LICENSEE']),
            onChange: (value) => list.setFilter({ relationship_code: value || undefined }) },
          { key: 'product_class_id', label: 'Product class', value: list.params.product_class_id, width: '12rem',
            options: optionsFrom(meta.product_classes, 'product_class_id', 'class_name'),
            onChange: (value) => list.setFilter({ product_class_id: value || undefined }) },
          { key: 'project_id', label: 'Project', value: list.params.project_id,
            options: optionsFrom(meta.projects, 'project_id', 'project_code'),
            onChange: (value) => list.setFilter({ project_id: value || undefined }) }
        ])}
        actions={canWrite ? (
          <Button size="sm" variant="brand" leftIcon={<AddIcon w="0.5625rem" h="0.5625rem" />} onClick={form.onOpen}>
            {translate('crm.products.register')}
          </Button>
        ) : null}
      />
      <Box px="0.5rem" pb="0.5rem">
        <DataTable
          columns={[
            { key: 'party_name', label: 'Customer', render: (row) => (row.party_name || '-') + '  ' + partyIdLabel(row.party_pk) },
            { key: 'product_name', label: 'Product' },
            { key: 'external_product_instance_id', label: 'Serial or key' },
            { key: 'class_name', label: 'Product class', render: (row) => translate(row.class_name || '-') },
            { key: 'relationship_code', label: 'Held as', render: (row) => word(translate, row.relationship_code) },
            { key: 'registration_channel', label: 'Channel', render: (row) => word(translate, row.registration_channel) },
            { key: 'project_code', label: 'Project' },
            { key: 'registered_at', label: 'Registered', render: (row) => dateTime(row.registered_at) },
            { key: 'valid_to', label: 'Ended', render: (row) => (row.valid_to ? date(row.valid_to) + '  ' + word(translate, row.end_reason_code) : '-') }
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
          rowKey={(row) => row.product_registration_id || row.id}
          onRowClick={(row) => row.product_instance_id && history.push(PAGE + '?instance=' + row.product_instance_id)}
          actions={canWrite ? [
            { key: 'end', label: translate('crm.products.end'), hidden: (row) => !!row.valid_to, onClick: (row) => setEnding(row) }
          ] : []}
          actionsIconOnly={false}
          storageKey={PAGE + '/registrations'}
        />
      </Box>

      <FormModal
        isOpen={form.isOpen}
        onClose={form.onClose}
        title={translate('crm.products.register')}
        initial={{ relationship_code: 'OWNER', registration_channel: 'CONSOLE' }}
        onSubmit={register}
        saving={saving}
        fields={[
          { name: 'party_pk', label: 'Customer', type: 'custom', required: true, colSpan: 'full',
            render: (values, set) => <PartyPicker value={values.party_pk} onChange={(value) => set('party_pk', value)} /> },
          { name: 'product_id', label: 'Product', type: 'select', required: true, options: catalog, isSearchable: true },
          { name: 'serial_number', label: 'Serial number', required: true,
            help: 'A product already known by this serial is registered again; a new one is created.' },
          { name: 'imei', label: 'IMEI' },
          { name: 'relationship_code', label: 'Held as', type: 'select', required: true, isClearable: false,
            options: choices(['OWNER', 'USER', 'REGISTERED_USER', 'LESSEE', 'LICENSEE']) },
          { name: 'registration_channel', label: 'Channel', type: 'select', isClearable: false,
            options: choices(['CONSOLE', 'AGENCY', 'WEB', 'APP']) },
          { name: 'registered_at_service_center_id', label: 'Registered at service location', type: 'select', options: sites, isSearchable: true },
          { name: 'purchase_date', label: 'Bought on', type: 'date' },
          { name: 'purchase_place', label: 'Bought at' },
          { name: 'acquisition_type_id', label: 'How it was obtained', type: 'select',
            options: optionsFrom(meta.acquisition_types, 'acquisition_type_id', 'acquisition_name') },
          { name: 'purchase_purpose_id', label: 'Bought for', type: 'select',
            options: optionsFrom(meta.purchase_purposes, 'purchase_purpose_id', 'purpose_name') },
          { name: 'usage_type_id', label: 'Used for', type: 'select',
            options: optionsFrom(meta.usage_types, 'usage_type_id', 'usage_name') }
        ]}
      />

      <FormModal
        isOpen={!!ending}
        onClose={() => setEnding(null)}
        title={translate('crm.products.endRegistration')}
        initial={{ end_reason_code: 'RETURNED' }}
        onSubmit={end}
        fields={[
          { name: 'end_reason_code', label: 'Why it ends', type: 'select', required: true, isClearable: false,
            options: choices(END_REASONS) }
        ]}
      />
    </Box>
  );
}

function Instances() {
  const translate = useT();
  const history = useHistory();
  const meta = useCrmMeta();
  const list = useList((params) => crm.products.instances(params), { page: 1, limit: 20, dir: 'desc' });

  return (
    <Box>
      <Toolbar
        search={list.params.q}
        onSearch={(searchText) => list.setFilter({ q: searchText })}
        filters={filtersFor(translate, [
          { key: 'instance_kind', label: 'Kind', value: list.params.instance_kind,
            options: choices(['DEVICE', 'LICENCE', 'ENTITLEMENT']),
            onChange: (value) => list.setFilter({ instance_kind: value || undefined }) },
          { key: 'status', label: 'Status', value: list.params.status,
            options: choices(['ACTIVE', 'LOST', 'STOLEN', 'SCRAPPED', 'VOID', 'EXPIRED']),
            onChange: (value) => list.setFilter({ status: value || undefined }) },
          { key: 'project_id', label: 'Project', value: list.params.project_id,
            options: optionsFrom(meta.projects, 'project_id', 'project_code'),
            onChange: (value) => list.setFilter({ project_id: value || undefined }) }
        ])}
      />
      <Box px="0.5rem" pb="0.5rem">
        <DataTable
          columns={[
            { key: 'external_product_instance_id', label: 'Serial or key' },
            { key: 'product_name', label: 'Product' },
            { key: 'instance_kind', label: 'Kind', render: (row) => word(translate, row.instance_kind) },
            { key: 'class_name', label: 'Product class', render: (row) => translate(row.class_name || '-') },
            { key: 'holder_name', label: 'Held by' },
            { key: 'registration_cnt', label: 'Registrations', isNumeric: true, render: (row) => number(row.registration_cnt) },
            { key: 'project_code', label: 'Project' },
            { key: 'status', label: 'Status', render: (row) => <Status value={row.status} /> }
          ]}
          rows={list.rows}
          loading={list.loading}
          page={list.params.page}
          limit={list.params.limit}
          total={list.total}
          onPageChange={list.setPage}
          onLimitChange={(limit) => list.setFilter({ limit: limit })}
          rowKey={(row) => row.product_instance_id || row.id}
          onRowClick={(row) => history.push(PAGE + '?instance=' + (row.product_instance_id || row.id))}
          storageKey={PAGE + '/instances'}
        />
      </Box>
    </Box>
  );
}

function Catalogue() {
  const translate = useT();
  const meta = useCrmMeta();
  const api = crm.catalog;

  return (
    <CrudPage
      page={PAGE}
      api={api}
      pkField="product_id"
      canRestore={false}
      defaultSort="product_name"
      subtitle={translate('crm.products.catalogueExplained')}
      columns={[
        { key: 'product_code', label: 'Code' },
        { key: 'product_name', label: 'Product', maxW: '16rem' },
        { key: 'project_code', label: 'Project', sortable: false },
        { key: 'product_kind', label: 'Kind', render: (row) => word(translate, row.product_kind) },
        { key: 'class_name', label: 'Product class', sortable: false, render: (row) => translate(row.class_name || '-') },
        { key: 'crystal_product_name', label: 'Crystal product', sortable: false },
        { key: 'instance_cnt', label: 'Known units', sortable: false, isNumeric: true, render: (row) => number(row.instance_cnt) },
        { key: 'status', label: 'Status', render: (row) => <Status value={row.status} /> }
      ]}
      fields={[
        { name: 'project_id', label: 'Project', type: 'select', required: true,
          options: optionsFrom(meta.projects, 'project_id', 'project_name') },
        { name: 'product_code', label: 'Code', required: true },
        { name: 'product_name', label: 'Product', required: true },
        { name: 'product_kind', label: 'Kind', type: 'select', required: true,
          options: choices(['DEVICE', 'LICENCE', 'SOFTWARE', 'SUBSCRIPTION', 'GOODS', 'SERVICE']) },
        { name: 'product_class_id', label: 'Product class', type: 'select',
          options: optionsFrom(meta.product_classes, 'product_class_id', 'class_name') },
        { name: 'model_code', label: 'Model code' },
        { name: 'list_price', label: 'List price', type: 'number', step: '0.01' },
        { name: 'currency_code', label: 'Currency', type: 'select',
          options: optionsFrom(meta.currencies, 'currency_code', 'currency_code') },
        { name: 'is_reservable', label: 'Can be reserved in an event', type: 'checkbox' },
        { name: 'status', label: 'Status', type: 'select', options: choices(['ACTIVE', 'INACTIVE', 'DISCONTINUED']) }
      ]}
      emptyRow={{ product_kind: 'DEVICE', status: 'ACTIVE' }}
    />
  );
}

/** One product's whole story: every holder in order, every request, every repair. */
export function InstanceDetail({ id, onClose }) {
  const translate = useT();
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    if (!id) { setDetail(null); return; }
    crm.products.instance(id).then(({ data }) => setDetail(data || null)).catch(() => setDetail(null));
  }, [id]);

  const record = detail || {};
  const instance = record.instance || {};

  return (
    /* No focus hand-back on close: focusing the opener scrolled the page (and a tab strip) sideways. */
    <Modal isOpen={!!id} onClose={onClose} size="4xl" scrollBehavior="inside" returnFocusOnClose={false} preserveScrollBarGap>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{instance.external_product_instance_id || translate('crm.products.product')}</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          <Stack spacing={5}>
            <Facts>
              <Fact label="Product">{instance.product_name}</Fact>
              <Fact label="Product class">{instance.class_name ? translate(instance.class_name) : null}</Fact>
              <Fact label="Kind">{word(translate, instance.instance_kind)}</Fact>
              <Fact label="Status">{instance.status ? <Status value={instance.status} /> : null}</Fact>
              <Fact label="Serial number">{instance.serial_number}</Fact>
              <Fact label="IMEI">{instance.imei}</Fact>
              <Fact label="Bound to device">{instance.bound_external_id}</Fact>
              <Fact label="Valid until">{date(instance.valid_until)}</Fact>
            </Facts>
            <Box>
              <Text fontSize="sm" fontWeight="600" mb={2}>{translate('crm.products.holders')}</Text>
              <DataTable
                hidePagination
                rows={record.registrations || []}
                rowKey={(row) => row.product_registration_id}
                columns={[
                  { key: 'party_name', label: 'Customer' },
                  { key: 'relationship_code', label: 'Held as', render: (row) => word(translate, row.relationship_code) },
                  { key: 'valid_from', label: 'From', render: (row) => dateTime(row.valid_from) },
                  { key: 'valid_to', label: 'Until', render: (row) => (row.valid_to ? dateTime(row.valid_to) : translate('crm.common.now')) },
                  { key: 'end_reason_code', label: 'Ended because', render: (row) => (row.end_reason_code ? word(translate, row.end_reason_code) : '-') },
                  { key: 'previous_owner_name', label: 'Previous owner' }
                ]}
              />
            </Box>
            <Box>
              <Text fontSize="sm" fontWeight="600" mb={2}>{translate('crm.common.transfers')}</Text>
              <DataTable
                hidePagination
                rows={record.transfers || []}
                rowKey={(row) => row.product_transfer_id}
                columns={[
                  { key: 'transfer_kind', label: 'What', render: (row) => word(translate, row.transfer_kind) },
                  { key: 'from_name', label: 'From' },
                  { key: 'to_name', label: 'To' },
                  { key: 'status', label: 'Status', render: (row) => <Status value={row.status} /> },
                  { key: 'requested_at', label: 'Requested', render: (row) => dateTime(row.requested_at) }
                ]}
              />
            </Box>
            <Box>
              <Text fontSize="sm" fontWeight="600" mb={2}>{translate('crm.products.service')}</Text>
              <DataTable
                hidePagination
                rows={record.cases || []}
                rowKey={(row) => row.case_id}
                columns={[
                  { key: 'external_case_id', label: 'Case' },
                  { key: 'case_type_name', label: 'Type', render: (row) => translate(row.case_type_name || '-') },
                  { key: 'status_name', label: 'Status', render: (row) => translate(row.status_name || '-') },
                  { key: 'received_at', label: 'Received', render: (row) => dateTime(row.received_at) }
                ]}
              />
            </Box>
            {(record.licences || []).length ? (
              <Box>
                <Text fontSize="sm" fontWeight="600" mb={2}>{translate('crm.products.licencesOnIt')}</Text>
                <DataTable
                  hidePagination
                  rows={record.licences}
                  rowKey={(row) => row.product_instance_id}
                  columns={[
                    { key: 'external_product_instance_id', label: 'Licence' },
                    { key: 'product_name', label: 'Product' },
                    { key: 'status', label: 'Status', render: (row) => <Status value={row.status} /> },
                    { key: 'valid_until', label: 'Valid until', render: (row) => date(row.valid_until) }
                  ]}
                />
              </Box>
            ) : null}
          </Stack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
