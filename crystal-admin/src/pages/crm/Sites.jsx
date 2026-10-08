import React, { useCallback, useEffect, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import {
  Box, Button, Modal, ModalBody, ModalCloseButton, ModalContent, ModalHeader, ModalOverlay, Stack, Text,
  useDisclosure, useToast
} from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';

import Card from '../../components/Card';
import DataTable from '../../components/DataTable';
import FormModal from '../../components/FormModal';
import Toolbar from '../../components/Toolbar';
import { useConfirm } from '../../components/ConfirmDialog';
import useList from '../../hooks/useList';
import usePermission from '../../hooks/usePermission';
import { crm } from '../../api';
import { useT } from '../../i18n';
import { date, number } from '../../utils/format';
import { Fact, Facts, Status, choices, dateInput, optionsFrom, useCrmMeta, word, filtersFor } from './shared';

export const PAGE = '/admin/crm/sites';

const KINDS = ['SERVICE_CENTER', 'SALES_AGENCY', 'COLLECTION_POINT', 'PARTNER_SHOP', 'OFFICE', 'EVENT_VENUE'];

/**
 * SERVICE LOCATIONS - every place a customer can be served, whoever runs it.
 *
 * Crystal's service centres are brought across by the import and stay
 * linked to their `agencies` row; the storefront's centre locator still reads
 * that. Sales agencies, collection points and partner shops that the
 * storefront never lists live only here. What a site may DO is its list of
 * capabilities, and that is what decides which activities it can record.
 */
export default function Sites() {
  const translate = useT();
  const toast = useToast();
  const history = useHistory();
  const location = useLocation();
  const form = useDisclosure();
  const { canWrite } = usePermission(PAGE);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const openSite = new URLSearchParams(location.search).get('site');
  const list = useList((params) => crm.sites.list(params), { page: 1, limit: 20, sort: 'service_center_name', dir: 'asc' });

  const save = async (values) => {
    setSaving(true);
    try {
      if (editing) await crm.sites.update(editing.service_center_id, values);
      else await crm.sites.create(values);
      toast({ title: editing ? translate('Saved') : translate('Created'), status: 'success', duration: 2500 });
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

  const openForm = (row) => {
    setEditing(row || null);
    form.onOpen();
  };

  return (
    <Card bodyProps={false}>
      <Toolbar
        search={list.params.q}
        onSearch={(searchText) => list.setFilter({ q: searchText })}
        filters={filtersFor(translate, [
          { key: 'service_center_kind', label: 'Kind', value: list.params.service_center_kind, width: '12rem', options: choices(KINDS),
            onChange: (value) => list.setFilter({ service_center_kind: value || undefined }) },
          { key: 'status', label: 'Status', value: list.params.status, options: choices(['ACTIVE', 'SUSPENDED', 'CLOSED']),
            onChange: (value) => list.setFilter({ status: value || undefined }) }
        ])}
        actions={canWrite ? (
          <Button size="sm" variant="brand" leftIcon={<AddIcon w="0.5625rem" h="0.5625rem" />} onClick={() => openForm(null)}>
            {translate('crm.sites.newSite')}
          </Button>
        ) : null}
      />
      <Box px="0.5rem" pb="0.5rem">
        <DataTable
          columns={[
            { key: 'service_center_code', label: 'Code' },
            { key: 'service_center_name', label: 'Service location', maxW: '16rem' },
            { key: 'service_center_kind', label: 'Kind', sortable: false, render: (row) => word(translate, row.service_center_kind) },
            { key: 'area_name', label: 'Area', sortable: false },
            { key: 'operator_name', label: 'Run by', sortable: false },
            { key: 'capabilities', label: 'Can do', sortable: false, maxW: '16rem',
              render: (row) => String(row.capabilities || '').split(',').filter(Boolean).map((capability) => word(translate, capability)).join(', ') || '-' },
            { key: 'activity_30d', label: 'Activity (30 days)', sortable: false, isNumeric: true, render: (row) => number(row.activity_30d) },
            { key: 'source_project_code', label: 'From', sortable: false },
            { key: 'status', label: 'Status', sortable: false, render: (row) => <Status value={row.status} /> }
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
          rowKey={(row) => row.service_center_id || row.id}
          onRowClick={(row) => history.push(PAGE + '?site=' + (row.service_center_id || row.id))}
          actions={canWrite ? [{ key: 'edit', label: translate('common.edit'), onClick: (row) => openForm(row) }] : []}
          actionsIconOnly={false}
          storageKey={PAGE}
        />
      </Box>

      <FormModal
        isOpen={form.isOpen}
        onClose={form.onClose}
        title={translate(editing ? 'crm.sites.editSite' : 'crm.sites.newSite')}
        initial={editing ? Object.assign({}, editing, { opened_on: dateInput(editing.opened_on), closed_on: dateInput(editing.closed_on) })
          : { service_center_kind: 'PARTNER_SHOP', status: 'ACTIVE' }}
        onSubmit={save}
        saving={saving}
        fields={[
          { name: 'service_center_code', label: 'Code', required: true },
          { name: 'service_center_name', label: 'Service location', required: true },
          { name: 'service_center_kind', label: 'Kind', type: 'select', required: true, isClearable: false, options: choices(KINDS) },
          { name: 'status', label: 'Status', type: 'select', isClearable: false, options: choices(['ACTIVE', 'SUSPENDED', 'CLOSED']) },
          { name: 'address_line', label: 'Address', colSpan: 'full' },
          { name: 'landmark', label: 'Landmark', colSpan: 'full' },
          { name: 'map_position', label: 'Map position' },
          { name: 'rating', label: 'Rating', type: 'number', step: '0.01' },
          { name: 'opened_on', label: 'Opened', type: 'date' },
          { name: 'closed_on', label: 'Closed', type: 'date' }
        ]}
      />

      <SiteDetail id={openSite} onClose={() => { history.push(PAGE); list.reload(); }} />
    </Card>
  );
}

function SiteDetail({ id, onClose }) {
  const translate = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const meta = useCrmMeta();
  const form = useDisclosure();
  const { canWrite } = usePermission(PAGE);
  const [detail, setDetail] = useState(null);

  const load = useCallback(() => {
    if (!id) { setDetail(null); return; }
    crm.sites.get(id).then(({ data }) => setDetail(data || null)).catch(() => setDetail(null));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const record = detail || {};
  const site = record.site || {};

  const add = async (values) => {
    try {
      await crm.sites.addCapability(site.service_center_id, values);
      toast({ title: translate('Created'), status: 'success', duration: 2500 });
      form.onClose();
      load();
      return true;
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 6000, isClosable: true });
      return false;
    }
  };

  const end = async (row) => {
    const agreed = await confirm({
      tone: 'danger', title: translate('crm.sites.endCapability'), body: translate('crm.sites.endCapabilityExplained'),
      detail: word(translate, row.capability_code), confirmLabel: translate('crm.common.end')
    });
    if (!agreed) return;
    try {
      await crm.sites.endCapability(site.service_center_id, row.capability_id);
      load();
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 6000, isClosable: true });
    }
  };

  /* The capabilities activity types ask for, plus Crystal's own service words. */
  const capabilityCodes = Array.from(new Set(
    (meta.activity_types || []).map((activityType) => activityType.required_capability_code).filter(Boolean)
      .concat(['REPAIR', 'OS', 'INSURANCE', 'REPLACEMENT', 'MEDIA_SERVICE'])
  ));

  return (
    <Modal isOpen={!!id} onClose={onClose} size="4xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{site.service_center_name || translate('crm.sites.site')}</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          <Stack spacing={5}>
            <Facts>
              <Fact label="Code">{site.service_center_code}</Fact>
              <Fact label="Kind">{site.service_center_kind ? word(translate, site.service_center_kind) : null}</Fact>
              <Fact label="Status">{site.status ? <Status value={site.status} /> : null}</Fact>
              <Fact label="Area">{site.area_name}</Fact>
              <Fact label="Address">{site.address_line}</Fact>
              <Fact label="Landmark">{site.landmark}</Fact>
              <Fact label="Run by">{site.operator_name}</Fact>
              <Fact label="Crystal service centre">{site.crystal_agency_id ? '#' + site.crystal_agency_id : null}</Fact>
            </Facts>
            <Box>
              <Box display="flex" justifyContent="space-between" mb={2}>
                <Text fontSize="sm" fontWeight="600">{translate('crm.sites.capabilities')}</Text>
                {canWrite && site.service_center_id ? (
                  <Button size="xs" variant="subtle" onClick={form.onOpen}>{translate('crm.sites.addCapability')}</Button>
                ) : null}
              </Box>
              <DataTable
                hidePagination
                rows={record.capabilities || []}
                rowKey={(row) => row.capability_id}
                columns={[
                  { key: 'capability_code', label: 'Can do', render: (row) => word(translate, row.capability_code) },
                  { key: 'project_code', label: 'Project' },
                  { key: 'crystal_section', label: 'Section', render: (row) => (row.crystal_section ? word(translate, row.crystal_section) : '-') },
                  { key: 'valid_from', label: 'From', render: (row) => date(row.valid_from) },
                  { key: 'valid_to', label: 'Until', render: (row) => date(row.valid_to) },
                  { key: 'is_active', label: 'Status', render: (row) => <Status value={row.is_active ? 'ACTIVE' : 'ENDED'} /> }
                ]}
                actions={canWrite ? [{ key: 'end', label: translate('crm.common.end'), hidden: (row) => !row.is_active, onClick: end }] : []}
                actionsIconOnly={false}
              />
            </Box>
            <Box>
              <Text fontSize="sm" fontWeight="600" mb={2}>{translate('crm.sites.eventsHere')}</Text>
              <DataTable
                hidePagination
                rows={record.events || []}
                rowKey={(row) => row.event_id + '-' + row.service_center_role}
                columns={[
                  { key: 'event_name', label: 'Event' },
                  { key: 'service_center_role', label: 'Role', render: (row) => word(translate, row.service_center_role) },
                  { key: 'status', label: 'Status', render: (row) => <Status value={row.status} /> }
                ]}
              />
            </Box>
          </Stack>
        </ModalBody>
      </ModalContent>

      <FormModal
        isOpen={form.isOpen}
        onClose={form.onClose}
        title={translate('crm.sites.addCapability')}
        onSubmit={add}
        fields={[
          { name: 'capability_code', label: 'Can do', type: 'select', required: true, options: choices(capabilityCodes) },
          { name: 'project_id', label: 'For project', type: 'select', options: optionsFrom(meta.projects, 'project_id', 'project_name') },
          { name: 'valid_from', label: 'From', type: 'date' },
          { name: 'valid_to', label: 'Until', type: 'date' }
        ]}
      />
    </Modal>
  );
}
