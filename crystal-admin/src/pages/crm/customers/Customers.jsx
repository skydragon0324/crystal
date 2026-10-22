import React, { useEffect, useRef, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import {
  Alert, AlertIcon, Box, Button, HStack, Icon, Input, Link, Stack, Tab, TabList, TabPanel, TabPanels, Tabs, Text, Tooltip, useDisclosure, useToast
} from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';
import * as Md from 'react-icons/md';

import CustomerImport from './CustomerImport';
import SmartphoneOfflineLink from './SmartphoneOfflineLink';
import RegistrationReview from './RegistrationReview';
import ImportErrors from './ImportErrors';

import Card from '../../../components/Card';
import DataTable from '../../../components/DataTable';
import FormModal from '../../../components/FormModal';
import Toolbar from '../../../components/Toolbar';
import { useConfirm } from '../../../components/ConfirmDialog';
import useList from '../../../hooks/useList';
import usePermission from '../../../hooks/usePermission';
import { crm } from '../../../api';
import { useT } from '../../../i18n';
import { date, dateTime, formatPhone, number } from '../../../utils/format';
import { birthdayText } from '../../../utils/birthday';
import { Dot, GradeBadge, PartyAvatar, ProjectTags, ScoreMeter } from '../shared/ui';
import { Status, choices, optionsFrom, problemsOf, useCrmMeta, word, filtersFor, partyIdLabel, rememberCustomersPage, useOpenCustomer } from '../shared/shared';

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
 * Pending registrations and identifier assignments are reviewed before they
 * become customers or active account links. Existing duplicate records remain
 * available in their own tab for historical cleanup.
 */
export default function Customers() {
  const translate = useT();
  const location = useLocation();
  const history = useHistory();
  const [revision, setRevision] = useState(0);
  const reviewed = () => setRevision(value => value + 1);
  /* ?tab= opens a tab by name; the order is the TabList's below. */
  const TAB_NAMES = ['customers', 'pending', 'assignments', 'resolved', 'duplicates', 'import-errors'];
  const query = new URLSearchParams(location.search);
  /* The open tab lives in the address, so a customer's back icon (and the browser's) returns to it. */
  const tabIndex = Math.max(0, TAB_NAMES.indexOf(query.get('tab') || 'customers'));
  const goTab = (index) => {
    const next = new URLSearchParams(location.search);
    if (index) next.set('tab', TAB_NAMES[index]); else next.delete('tab');
    history.replace({ pathname: location.pathname, search: next.toString() ? '?' + next.toString() : '' });
  };
  useEffect(() => { rememberCustomersPage(location.search); }, [location.search]);
  /* ?grade= ?activity= ?type= ?project= open the list already narrowed - the overview links here with them. */
  const idOf = (name) => (query.get(name) ? Number(query.get(name)) : undefined);
  const narrowedTo = {
    corporate_grade_id: idOf('grade'),
    activity_status: query.get('activity') || undefined,
    party_type: query.get('type') || undefined,
    project_id: idOf('project')
  };

  return (
    <Card bodyProps={false}>
      <Tabs index={tabIndex} onChange={goTab} isLazy variant="line" colorScheme="brand">
        <TabList px={4} pt={2}>
          <Tab fontSize="sm">{translate('crm.customers.allCustomers')}</Tab>
          <Tab fontSize="sm">{translate('crm.customers.pendingTab')}</Tab>
          <Tab fontSize="sm">{translate('crm.customers.eshopTab')}</Tab>
          <Tab fontSize="sm">{translate('crm.customers.resolvedTab')}</Tab>
          <Tab fontSize="sm">{translate('crm.customers.duplicatesTab')}</Tab>
          <Tab fontSize="sm">{translate('crm.customers.importErrorsTab')}</Tab>
        </TabList>
        <TabPanels>
          <TabPanel px={0}><CustomerList key={revision} narrowedTo={narrowedTo} /></TabPanel>
          <TabPanel px={0}><RegistrationReview category="PERSON" onDecided={reviewed} /></TabPanel>
          <TabPanel px={0}><RegistrationReview category="ESHOP" onDecided={reviewed} /></TabPanel>
          <TabPanel px={0}><RegistrationReview key={revision} resolved /></TabPanel>
          <TabPanel px={0}><Duplicates /></TabPanel>
          <TabPanel px={0}><ImportErrors key={revision} /></TabPanel>
        </TabPanels>
      </Tabs>
    </Card>
  );
}

const NEW_CUSTOMER = { party_type: 'PERSON' };

/* Project and grade filters pick several: sent as "1,2,3", read back as numbers for the select. */
const idList = (value) => (value === undefined || value === null || value === '' ? [] : String(value).split(',').map(Number));
const idParam = (values) => (Array.isArray(values) && values.length ? values.join(',') : undefined);

function CustomerList({ narrowedTo }) {
  const translate = useT();
  const toast = useToast();
  const history = useHistory();
  const openCustomer = useOpenCustomer();
  const meta = useCrmMeta();
  const form = useDisclosure();
  const importer = useDisclosure();
  const mobileLink = useDisclosure();
  const { canWrite } = usePermission(PAGE);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState(NEW_CUSTOMER);

  const list = useList((params) => crm.parties.list(params), Object.assign({ page: 1, limit: 20, sort: 'corporate_score', dir: 'desc' }, narrowedTo));

  const openForm = () => { setValues(NEW_CUSTOMER); form.onOpen(); };

  const create = async (submitted) => {
    setSaving(true);
    try {
      const payload = Object.assign({}, submitted);
      if (payload.party_type !== 'ORGANIZATION') payload.full_name = payload.display_name;
      const { data } = await crm.parties.create(payload);
      toast({ title: translate(data && data.outcome === 'QUEUED' ? 'crm.customers.savedForReview' : data && data.outcome === 'MERGED' ? 'crm.customers.matchedExisting' : 'crm.common.rowsCreated'), status: 'success', duration: 4000 });
      form.onClose();
      if (data && data.party_pk) history.push(PAGE + '/' + data.party_pk);
      else list.reload();
      return true;
    } catch (error) {
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
        /* Four separate searches, all applied together: number or name here, then birthday, phone and place. */
        search={list.params.name}
        onSearch={(searchText) => list.setFilter({ name: searchText || undefined })}
        placeholder={translate('crm.customers.searchNameOrNumber')}
        beside={(
          <>
            <SearchBox value={list.params.birthday} placeholder={translate('crm.customers.searchBirthday')} rewrite={birthdayText}
              onSearch={(value) => list.setFilter({ birthday: value || undefined })} />
            <SearchBox value={list.params.phone} placeholder={translate('crm.customers.searchPhone')}
              onSearch={(value) => list.setFilter({ phone: value || undefined })} />
          </>
        )}
        filters={filtersFor(translate, [
          {
            key: 'location_pk', label: 'Location', value: list.params.location_pk, width: '13rem',
            options: areas, onChange: (value) => list.setFilter({ location_pk: value || undefined })
          },
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
            key: 'project_id', label: 'Project', multi: true, value: idList(list.params.project_id), width: '11rem',
            options: optionsFrom(meta.projects, 'project_id', 'project_name'),
            onChange: (values) => list.setFilter({ project_id: idParam(values) })
          },
          {
            key: 'corporate_grade_id', label: 'Corporate grade', multi: true, value: idList(list.params.corporate_grade_id),
            options: optionsFrom(meta.corporate_grades, 'corporate_grade_id', (gradeRow) => gradeRow.grade_code + '  ' + gradeRow.grade_name),
            onChange: (values) => list.setFilter({ corporate_grade_id: idParam(values) })
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
            {/* <Button size="sm" variant="outline" leftIcon={<Icon as={Md.MdPhoneIphone} />} onClick={mobileLink.onOpen}>
              {translate('crm.customers.linkSmartphoneOffline')}
            </Button> */}
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
                    <Text fontSize="xs" color="gray.500">{partyIdLabel(row.party_pk)}</Text>
                  </Box>
                </HStack>
              ) },
            /* A full date where it is known, otherwise the year alone. */
            { key: 'birth_date', label: 'Date of birth', sortable: false,
              render: (row) => (row.birth_date ? date(row.birth_date) : (row.birth_year || '-')) },
            { key: 'location_name', label: 'Location', sortable: false, maxW: '14rem', render: (row) => row.location_name || '-' },
            { key: 'job_title_name', label: 'Job title', sortable: false, render: (row) => (row.job_title_name ? translate(row.job_title_name) : '-') },
            { key: 'mobile', label: 'Mobile', sortable: false, render: (row) => formatPhone(row.mobile) || '-' },
            { key: 'grade_code', label: 'Grade', sortable: false, render: (row) => (row.grade_assigned ? (
              <Tooltip hasArrow label={translate('crm.customers.gradeSetByHand')}>
                <HStack spacing={1} display="inline-flex"><GradeBadge code={row.grade_code} /><Icon as={Md.MdPanTool} boxSize="0.7rem" color="gray.500" /></HStack>
              </Tooltip>
            ) : <GradeBadge code={row.grade_code} />) },
            { key: 'corporate_score', label: 'Score', render: (row) => <ScoreMeter value={row.corporate_score} compact /> },
            { key: 'activity_status', label: 'Activity', sortable: false, render: (row) => (row.activity_status ? <Dot value={row.activity_status} /> : '-') },
            { key: 'projects', label: 'Projects', sortable: false, render: (row) => <ProjectTags codes={String(row.projects || '').split(',')} /> },
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
          rowKey={(row) => row.party_pk || row.id}
          onRowClick={(row) => openCustomer(row.party_pk || row.id)}
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
            { name: 'birth_date', label: 'Date of birth', type: 'date', typeable: true },
            { name: 'job_title_id', label: 'Job title', type: 'select', isSearchable: true,
              options: optionsFrom((meta.job_titles || []).filter((job) => job.is_active), 'job_title_id', 'job_name') },
            { name: 'home_location_pk', label: 'Location', type: 'select', isSearchable: true, options: areas }
          ] : [
            { name: 'company_name', label: 'Company name' },
            { name: 'location_pk', label: 'Location', type: 'select', isSearchable: true, options: areas }
          ]),
          { name: 'mobile', label: 'Mobile' },
          { name: 'email', label: 'Email' },
          ...(isPerson ? [{ name: 'address_line', label: 'Address', colSpan: 'full' }] : []),
          { name: 'origin_project_id', label: 'First seen in project', type: 'select', required: true,
            options: optionsFrom((meta.projects || []).filter((project) => project.status !== 'INACTIVE'), 'project_id', 'project_name'),
            help: 'The project the customer came from.' }
        ]}
      />

      <CustomerImport isOpen={importer.isOpen} onClose={importer.onClose} onImported={list.reload} />
      <SmartphoneOfflineLink isOpen={mobileLink.isOpen} onClose={mobileLink.onClose} onLinked={list.reload} />
    </Box>
  );
}

function Duplicates() {
  const translate = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const openCustomer = useOpenCustomer();
  const { canWrite } = usePermission(PAGE);
  const [busy, setBusy] = useState(false);

  const list = useList((params) => crm.parties.duplicates(params), { page: 1, limit: 20 });
  const search = <Toolbar search={list.params.q} onSearch={(q) => list.setFilter({ q: q || undefined })} />;

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
        detail: partyIdLabel(row.incoming_party_pk) + '  ->  ' + partyIdLabel(row.candidate_party_pk),
        confirmLabel: translate('crm.customers.merge')
      });
      if (!agreed) return;
    }
    try {
      if (accept) await crm.parties.acceptDuplicate(row.match_candidate_id);
      else await crm.parties.rejectDuplicate(row.match_candidate_id);
      toast({ title: translate(accept ? 'crm.common.merged' : 'crm.customers.keptApart'), status: 'success', duration: 2500 });
      list.reload();
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 6000, isClosable: true });
    }
  };

  return (
    <Box>
      <HStack px={5} py={3} justify="space-between" wrap="wrap">
        <Text fontSize="sm" maxW="44rem">{translate('crm.customers.duplicatesIntro')}</Text>
        {canWrite ? (
          <Button size="sm" variant="subtle" isLoading={busy} onClick={scan}>{translate('crm.customers.scanForDuplicates')}</Button>
        ) : null}
      </HStack>
      <SharedPhones onOpen={openCustomer} />
      {search}
      <Box px="0.5rem" pb="0.5rem">
        <DataTable
          columns={[
            /* Each side of the pair opens its own record; the rest of the row opens nothing. */
            { key: 'incoming_party_pk', label: 'Newer customer',
              render: (row) => <CustomerLink partyPk={row.incoming_party_pk} name={row.incoming_name} onOpen={openCustomer} /> },
            { key: 'candidate_party_pk', label: 'Older customer',
              render: (row) => <CustomerLink partyPk={row.candidate_party_pk} name={row.candidate_name} onOpen={openCustomer} /> },
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

/**
 * Numbers more than one customer has. A number belongs to one customer only;
 * these are from before that rule, and are fixed by hand - merge the
 * customers if they are one, or retire the number on the one it is not.
 * Nothing shows when there are none.
 */
function SharedPhones({ onOpen }) {
  const translate = useT();
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let live = true;
    crm.parties.sharedPhones().then(({ data }) => { if (live) setRows(Array.isArray(data) ? data : []); }).catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, []);
  if (!rows.length) return null;
  return (
    <Box mx={5} mb={3}>
      <Alert status="warning" borderRadius="md" fontSize="sm" alignItems="flex-start">
        <AlertIcon />
        <Box flex="1">
          <Text fontWeight="600">{translate('crm.customers.sharedPhonesTitle', { n: rows.length })}</Text>
          <Text fontSize="xs" mb={2}>{translate('crm.customers.sharedPhonesExplained')}</Text>
          <Stack spacing={1} maxH="12rem" overflowY="auto">
            {rows.map((row) => (
              <HStack key={row.phone} spacing={3} wrap="wrap" fontSize="sm">
                <Text as="span" fontWeight="700" minW="8rem">{formatPhone(row.phone)}</Text>
                {(row.customers || []).map((customer) => (
                  <CustomerLink key={customer.party_pk} partyPk={customer.party_pk} name={customer.display_name} onOpen={onOpen} />
                ))}
              </HStack>
            ))}
          </Stack>
        </Box>
      </Alert>
    </Box>
  );
}

/** One customer of a duplicate pair: their name and number, opening their own record. */
function CustomerLink({ partyPk, name, onOpen }) {
  if (!partyPk) return <Text as="span">{name || '-'}</Text>;
  return (
    <Link color="brand.500" fontWeight="600" onClick={(event) => { event.stopPropagation(); onOpen(partyPk); }}>
      {(name || '-') + '  ' + partyIdLabel(partyPk)}
    </Link>
  );
}

/**
 * One more search box beside the toolbar's: it searches 300 ms after typing
 * stops, or at once on Enter - the same feel as the main one.
 *
 * With `rewrite` (text -> the standard form, or null when it is not one) the
 * box searches by the standard form while the reader types, and shows it in
 * place of what they typed once they press Enter or leave the box - not
 * before, so the text never changes under their fingers. Text that cannot be
 * rewritten waits until then, and is searched as typed and marked as wrong.
 */
function SearchBox({ value, placeholder, onSearch, rewrite }) {
  const [typed, setTyped] = useState(value || '');
  const handler = useRef(onSearch);
  /* What this box last searched for, so its own search coming back as `value` does not overwrite the typing. */
  const sent = useRef(value || '');
  useEffect(() => { handler.current = onSearch; }, [onSearch]);
  useEffect(() => {
    if ((value || '') === sent.current) return;
    sent.current = value || '';
    setTyped(value || '');
  }, [value]);

  const standard = (text) => (rewrite && text ? rewrite(text) : text);
  const search = (text) => {
    if (text === sent.current) return;
    sent.current = text;
    handler.current(text);
  };
  const finish = () => {
    const text = typed.trim();
    const shown = standard(text);
    if (shown !== null && shown !== typed) setTyped(shown);
    search(shown === null ? text : shown);
  };

  useEffect(() => {
    const shown = standard(typed.trim());
    if (shown === null) return undefined;
    const timer = setTimeout(() => search(shown), 300);
    return () => clearTimeout(timer);
  });

  const wrong = !!rewrite && !!typed.trim() && typed.trim() === sent.current && rewrite(typed.trim()) === null;
  return (
    <Input size="sm" borderRadius="lg" maxW="11rem" placeholder={placeholder} value={typed} isInvalid={wrong}
      onChange={(event) => setTyped(event.target.value)} onBlur={finish}
      onKeyDown={(event) => { if (event.key === 'Enter') finish(); }} />
  );
}
