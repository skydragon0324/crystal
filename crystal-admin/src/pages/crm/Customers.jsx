import React, { useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import {
  Badge, Box, Button, HStack, Icon, Modal, ModalBody, ModalCloseButton, ModalContent, ModalFooter, ModalHeader,
  ModalOverlay, Tab, TabList, TabPanel, TabPanels, Tabs, Text, useDisclosure, useToast
} from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';
import * as Md from 'react-icons/md';

import CustomerImport from './CustomerImport';

import Card from '../../components/Card';
import DataTable from '../../components/DataTable';
import FormModal from '../../components/FormModal';
import Toolbar from '../../components/Toolbar';
import { useConfirm } from '../../components/ConfirmDialog';
import useList from '../../hooks/useList';
import usePermission from '../../hooks/usePermission';
import { crm } from '../../api';
import { useT } from '../../i18n';
import { date, dateTime, number } from '../../utils/format';
import { Amount, Dot, GradeBadge, PartyAvatar, ProjectTags, ScoreMeter } from './ui';
import { Status, choices, optionsFrom, problemsOf, useCrmMeta, word, filtersFor, partyIdLabel } from './shared';

export const PAGE = '/admin/crm/customers';

/**
 * CUSTOMERS - every party the CRM knows, across every project.
 *
 * One row per person or organization however many accounts they hold: a
 * member of the Crystal site who also bought on the Eshop is one customer
 * with two accounts, not two customers. The search reads names, customer
 * numbers, phone numbers typed any way, emails and other projects' account
 * ids, because that is what somebody at a counter actually has in front of
 * them.
 *
 * POSSIBLE DUPLICATES are parties that share a mobile or an email. They are
 * queued rather than merged: one household shares a number, a shop registers
 * its customers' devices under its own email, and merging two real people is
 * far worse than leaving a pair for somebody to look at.
 */
export default function Customers() {
  const translate = useT();
  const location = useLocation();
  const initialTab = new URLSearchParams(location.search).get('tab') === 'duplicates' ? 1 : 0;

  return (
    <Card bodyProps={false}>
      <Tabs defaultIndex={initialTab} isLazy variant="line" colorScheme="brand">
        <TabList px={4} pt={2}>
          <Tab fontSize="sm">{translate('crm.customers.allCustomers')}</Tab>
          <Tab fontSize="sm">{translate('crm.customers.possibleDuplicates')}</Tab>
        </TabList>
        <TabPanels>
          <TabPanel px={0}><CustomerList grade={new URLSearchParams(location.search).get('grade') ? Number(new URLSearchParams(location.search).get('grade')) : undefined} /></TabPanel>
          <TabPanel px={0}><Duplicates /></TabPanel>
        </TabPanels>
      </Tabs>
    </Card>
  );
}

const NEW_CUSTOMER = { party_type: 'PERSON' };

function CustomerList({ grade }) {
  const translate = useT();
  const toast = useToast();
  const history = useHistory();
  const meta = useCrmMeta();
  const form = useDisclosure();
  const importer = useDisclosure();
  const { canWrite } = usePermission(PAGE);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState(NEW_CUSTOMER);
  /* The look-alikes the API answered with, and the form values that would be saved if the manager goes ahead. */
  const [lookAlikes, setLookAlikes] = useState(null);

  const list = useList((params) => crm.parties.list(params), { page: 1, limit: 20, sort: 'corporate_score', dir: 'desc', corporate_grade_id: grade });

  const openForm = () => { setValues(NEW_CUSTOMER); form.onOpen(); };

  /*
   * Every new person is checked against the customers on file first. A 409
   * carries the look-alikes; the manager then opens one of them or confirms,
   * and a confirmed pair waits in Possible duplicates.
   */
  const create = async (submitted, confirmed) => {
    setSaving(true);
    try {
      const payload = Object.assign({}, submitted, confirmed ? { confirm_not_duplicate: true } : {});
      if (payload.party_type !== 'ORGANIZATION') payload.full_name = payload.display_name;
      const { data } = await crm.parties.create(payload);
      toast({ title: translate('Created'), status: 'success', duration: 2500 });
      form.onClose();
      setLookAlikes(null);
      if (data && data.party_id) history.push(PAGE + '/' + data.party_id);
      else list.reload();
      return true;
    } catch (error) {
      if (error.status === 409 && Array.isArray(error.detail)) {
        setLookAlikes({ values: submitted, rows: error.detail });
        return false;
      }
      toast({ title: error.message, description: problemsOf(error), status: 'error', duration: 8000, isClosable: true });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const isPerson = values.party_type !== 'ORGANIZATION';
  const areas = optionsFrom(meta.areas, 'location_id', (area) => area.full_name || area.location_name);

  return (
    <Box>
      <Toolbar
        search={list.params.q}
        onSearch={(searchText) => list.setFilter({ q: searchText })}
        filters={filtersFor(translate, [
          {
            key: 'party_type', label: 'Type', value: list.params.party_type,
            options: choices(['PERSON', 'ORGANIZATION']),
            onChange: (value) => list.setFilter({ party_type: value || undefined })
          },
          {
            key: 'party_status', label: 'Status', value: list.params.party_status,
            options: choices(['ACTIVE', 'INACTIVE', 'MERGED']),
            onChange: (value) => list.setFilter({ party_status: value || undefined })
          },
          {
            key: 'project_id', label: 'Project', value: list.params.project_id, width: '11rem',
            options: optionsFrom(meta.projects, 'project_id', 'project_name'),
            onChange: (value) => list.setFilter({ project_id: value || undefined })
          },
          {
            key: 'corporate_grade_id', label: 'Corporate grade', value: list.params.corporate_grade_id,
            options: optionsFrom(meta.corporate_grades, 'corporate_grade_id', (gradeRow) => gradeRow.grade_code + '  ' + gradeRow.grade_name),
            onChange: (value) => list.setFilter({ corporate_grade_id: value || undefined })
          },
          {
            key: 'activity_status', label: 'Activity', value: list.params.activity_status,
            options: choices(['NEW', 'ACTIVE', 'AT_RISK', 'LAPSED', 'NEVER_BOUGHT']),
            onChange: (value) => list.setFilter({ activity_status: value || undefined })
          },
          {
            key: 'is_checked_manually', label: 'Checked by hand', value: list.params.is_checked_manually,
            options: [{ value: '1', label: 'Checked by hand' }, { value: '0', label: 'Not checked yet' }],
            onChange: (value) => list.setFilter({ is_checked_manually: value || undefined })
          }
        ])}
        actions={canWrite ? (
          <HStack spacing={2}>
            <Button size="sm" variant="outline" leftIcon={<Icon as={Md.MdFileUpload} />} onClick={importer.onOpen}>
              {translate('crm.customers.importFromExcel')}
            </Button>
            <Button size="sm" variant="brand" leftIcon={<AddIcon w="0.5625rem" h="0.5625rem" />} onClick={openForm}>
              {translate('crm.customers.newCustomer')}
            </Button>
          </HStack>
        ) : null}
      />

      <Box px="0.5rem" pb="0.5rem">
        <DataTable
          columns={[
            { key: 'display_name', label: 'Customer', pin: 'left',
              render: (row) => (
                <HStack spacing={3}>
                  <PartyAvatar name={row.display_name} type={row.party_type} size="sm" />
                  <Box minW={0}>
                    <Text fontSize="sm" fontWeight="500" noOfLines={1}>{row.display_name || '-'}</Text>
                    <Text fontSize="xs" color="gray.500">{partyIdLabel(row.party_id)}</Text>
                  </Box>
                </HStack>
              ) },
            { key: 'grade_code', label: 'Grade', sortable: false, render: (row) => <GradeBadge code={row.grade_code} /> },
            { key: 'corporate_score', label: 'Score', render: (row) => <ScoreMeter value={row.corporate_score} compact /> },
            { key: 'purchase_amount_12m', label: 'Spend, 12 months', isNumeric: true, render: (row) => <Amount value={row.purchase_amount_12m} /> },
            { key: 'activity_status', label: 'Activity', sortable: false, render: (row) => (row.activity_status ? <Dot value={row.activity_status} /> : '-') },
            { key: 'projects', label: 'Projects', sortable: false, render: (row) => <ProjectTags codes={String(row.projects || '').split(',').filter((projectCode) => projectCode !== 'PLATFORM')} /> },
            { key: 'mobile', label: 'Mobile', sortable: false },
            { key: 'holding_cnt', label: 'Products', sortable: false, isNumeric: true, render: (row) => number(row.holding_cnt) },
            { key: 'case_cnt', label: 'Service cases', sortable: false, isNumeric: true, render: (row) => number(row.case_cnt) },
            { key: 'party_status', label: 'Status', sortable: false, render: (row) => <Status value={row.party_status} /> }
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
          rowKey={(row) => row.party_id || row.id}
          onRowClick={(row) => history.push(PAGE + '/' + (row.party_id || row.id))}
          storageKey={PAGE}
        />
      </Box>

      <FormModal
        isOpen={form.isOpen}
        onClose={form.onClose}
        title={translate('crm.customers.newCustomer')}
        values={values}
        onChange={setValues}
        onSubmit={(submitted) => create(submitted, false)}
        saving={saving}
        fields={[
          { name: 'party_type', label: 'Type', type: 'select', required: true, isClearable: false,
            options: choices(['PERSON', 'ORGANIZATION']) },
          { name: 'display_name', label: 'Name', required: true },
          ...(isPerson ? [
            { name: 'gender_code', label: 'Gender', type: 'select',
              options: [{ value: 'M', label: 'Male' }, { value: 'F', label: 'Female' }] },
            { name: 'birth_date', label: 'Date of birth', type: 'date' },
            { name: 'job_title_id', label: 'Job title', type: 'select', isSearchable: true,
              options: optionsFrom((meta.job_titles || []).filter((job) => job.is_active), 'job_title_id', 'job_name') },
            { name: 'home_location_pk', label: 'Location', type: 'select', isSearchable: true, options: areas }
          ] : [
            { name: 'location_pk', label: 'Location', type: 'select', isSearchable: true, options: areas }
          ]),
          { name: 'mobile', label: 'Mobile' },
          { name: 'email', label: 'Email' },
          ...(isPerson ? [{ name: 'address_line', label: 'Address', colSpan: 'full' }] : []),
          { name: 'origin_project_id', label: 'First seen in project', type: 'select',
            options: optionsFrom(meta.projects, 'project_id', 'project_name'),
            help: 'Left empty, a customer created here counts as a Crystal customer.' }
        ]}
      />

      <LookAlikes
        found={lookAlikes}
        saving={saving}
        onClose={() => setLookAlikes(null)}
        onOpenCustomer={(partyId) => { setLookAlikes(null); form.onClose(); history.push(PAGE + '/' + partyId); }}
        onCreateAnyway={() => create(lookAlikes.values, true)}
      />

      <CustomerImport isOpen={importer.isOpen} onClose={importer.onClose} onImported={list.reload} />
    </Box>
  );
}

/** "This person may already be a customer": the look-alikes, each one a click away, and the way to go ahead anyway. */
function LookAlikes({ found, saving, onClose, onOpenCustomer, onCreateAnyway }) {
  const translate = useT();
  return (
    <Modal isOpen={!!found} onClose={onClose} size="2xl">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{translate('crm.customers.similarTitle')}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text fontSize="sm" mb={4}>{translate('crm.customers.similarExplained')}</Text>
          {(found ? found.rows : []).map((row) => (
            <HStack key={row.party_id} justify="space-between" py={2} borderBottomWidth="1px">
              <Box minW={0}>
                <Text fontWeight="600" noOfLines={1}>{row.display_name || partyIdLabel(row.party_id)}</Text>
                <Text fontSize="xs" color="gray.500">
                  {[partyIdLabel(row.party_id), row.mobile, row.birth_date ? date(row.birth_date) : null].filter(Boolean).join('  ·  ')}
                </Text>
                <Badge mt={1} colorScheme="orange" variant="subtle" textTransform="none">{translate(row.reason)}</Badge>
              </Box>
              <Button size="sm" variant="outline" onClick={() => onOpenCustomer(row.party_id)}>{translate('crm.customers.openCustomer')}</Button>
            </HStack>
          ))}
        </ModalBody>
        <ModalFooter>
          <HStack spacing={3}>
            <Button size="sm" variant="ghost" onClick={onClose}>{translate('common.cancel')}</Button>
            <Button size="sm" variant="brand" isLoading={saving} onClick={onCreateAnyway}>{translate('crm.customers.createAnyway')}</Button>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function Duplicates() {
  const translate = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const history = useHistory();
  const { canWrite } = usePermission(PAGE);
  const [busy, setBusy] = useState(false);

  const list = useList((params) => crm.parties.duplicates(params), { page: 1, limit: 20 });

  const scan = async () => {
    setBusy(true);
    try {
      const { data } = await crm.parties.scanDuplicates();
      toast({ title: translate('crm.customers.scanFound', { n: number((data || {}).found || 0) }), status: 'success', duration: 3000 });
      list.reload();
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 6000, isClosable: true });
    } finally {
      setBusy(false);
    }
  };

  const decide = async (row, accept) => {
    if (accept) {
      const agreed = await confirm({
        tone: 'danger',
        title: translate('crm.customers.mergeThesePair'),
        body: translate('crm.customers.mergeExplained'),
        detail: partyIdLabel(row.incoming_party_id) + '  ->  ' + partyIdLabel(row.candidate_party_id),
        confirmLabel: translate('crm.customers.merge')
      });
      if (!agreed) return;
    }
    try {
      if (accept) await crm.parties.acceptDuplicate(row.match_candidate_id);
      else await crm.parties.rejectDuplicate(row.match_candidate_id);
      toast({ title: translate(accept ? 'crm.customers.merged' : 'crm.customers.keptApart'), status: 'success', duration: 2500 });
      list.reload();
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 6000, isClosable: true });
    }
  };

  return (
    <Box>
      <HStack px={5} py={3} justify="space-between" wrap="wrap">
        <Text fontSize="sm" maxW="44rem">{translate('crm.customers.duplicatesExplained')}</Text>
        {canWrite ? (
          <Button size="sm" variant="subtle" isLoading={busy} onClick={scan}>{translate('crm.customers.scanForDuplicates')}</Button>
        ) : null}
      </HStack>
      <Box px="0.5rem" pb="0.5rem">
        <DataTable
          columns={[
            { key: 'incoming_party_id', label: 'Newer customer',
              render: (row) => (row.incoming_name || '-') + '  ' + partyIdLabel(row.incoming_party_id) },
            { key: 'candidate_party_id', label: 'Older customer',
              render: (row) => (row.candidate_name || '-') + '  ' + partyIdLabel(row.candidate_party_id) },
            { key: 'match_rule_code', label: 'Matched on',
              render: (row) => word(translate, String(row.match_rule_code || '').replace('SAME_', '')) },
            { key: 'match_score', label: 'Score', isNumeric: true, render: (row) => number(row.match_score, 2) },
            { key: 'created_at', label: 'Found', render: (row) => dateTime(row.created_at) }
          ]}
          rows={list.rows}
          loading={list.loading}
          page={list.params.page}
          limit={list.params.limit}
          total={list.total}
          onPageChange={list.setPage}
          onLimitChange={(limit) => list.setFilter({ limit: limit })}
          rowKey={(row) => row.match_candidate_id || row.id}
          onRowClick={(row) => row.incoming_party_id && history.push(PAGE + '/' + row.incoming_party_id)}
          actions={canWrite ? [
            { key: 'merge', label: translate('crm.customers.merge'), onClick: (row) => decide(row, true) },
            { key: 'reject', label: translate('crm.customers.keepApart'), onClick: (row) => decide(row, false) }
          ] : []}
          actionsMode="buttons"
        />
      </Box>
    </Box>
  );
}
