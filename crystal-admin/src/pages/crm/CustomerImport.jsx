import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, AlertIcon, Badge, Box, Button, HStack, Icon, Modal, ModalBody, ModalCloseButton, ModalContent,
  ModalFooter, ModalHeader, ModalOverlay, SimpleGrid, Stat, StatLabel, StatNumber, Tab, TabList, TabPanel, TabPanels,
  Table, Tabs, Tbody, Td, Text, Th, Thead, Tr, useToast
} from '@chakra-ui/react';
import * as Md from 'react-icons/md';

import { crm } from '../../api';
import { useT } from '../../i18n';
import { date } from '../../utils/format';
import SelectField from '../../components/SelectField';
import { optionsFrom, partyIdLabel, useCrmMeta } from './shared';

const TONE = { REVIEW: 'purple', MERGED: 'blue', NEW: 'green', CREATED: 'green', DUPLICATE: 'orange', ERROR: 'red' };
const STATUS = {
  NEW: 'crm.customerImport.rowStatusNEW',
  CREATED: 'crm.customerImport.rowStatusCREATED',
  DUPLICATE: 'crm.customerImport.rowStatusDUPLICATE',
  MERGED: 'crm.customerImport.rowStatusMERGED',
  REVIEW: 'crm.customerImport.rowStatusREVIEW',
  ERROR: 'crm.customerImport.rowStatusERROR'
};

/*
 * The tabs the checked rows are sorted into, before and after the import.
 * "Already customers" only appears when a row matches someone on file.
 */
const GROUPS = [
  { key: 'new', textKey: 'crm.customerImport.tabNewCustomers', statuses: ['NEW', 'CREATED'], tone: 'green' },
  { key: 'review', textKey: 'crm.customerImport.tabReviewCustomers', statuses: ['REVIEW'], tone: 'purple' },
  { key: 'existing', textKey: 'crm.customerImport.tabAlreadyCustomers', statuses: ['DUPLICATE', 'MERGED'], tone: 'blue', optional: true },
  { key: 'errors', textKey: 'crm.customerImport.tabErrors', statuses: ['ERROR'], tone: 'red' }
];

/**
 * PEOPLE FROM AN EXCEL SHEET.
 *
 * Three steps in one dialog, so nothing is written by surprise:
 *
 *   1. choose the file and the origin project (the template is one click
 *      away, with the lists it accepts on sheets of their own);
 *   2. CHECK it - the API reads every row and sorts it into New customers,
 *      Review customers, Already customers or Errors, writing nothing;
 *   3. ADD NEW USERS - offered as soon as any row is valid, errors or not.
 *      New rows become customers with a new party_pk, review rows wait under
 *      Pending registrations, and error rows are kept under Import errors with
 *      their reasons. Every row stays listed in its tab afterwards.
 */
export default function CustomerImport({ isOpen, onClose, onImported }) {
  const translate = useT();
  const toast = useToast();
  const input = useRef(null);
  const [file, setFile] = useState(null);
  const [report, setReport] = useState(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  /* Where the customers came from, for rows whose Origin project cell is empty. Nothing is assumed. */
  const [origin, setOrigin] = useState(null);
  const meta = useCrmMeta();
  const projects = optionsFrom((meta.projects || []).filter((project) => project.status !== 'INACTIVE'), 'project_id', (project) => project.project_code + '  ' + translate(project.project_name));

  useEffect(() => {
    if (!isOpen) return;
    setFile(null); setReport(null); setDone(false); setProblem(null); setOrigin(null);
  }, [isOpen]);

  const downloadTemplate = async () => {
    try {
      const { data: blob } = await crm.parties.importTemplate();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'crm-customers-template.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 6000, isClosable: true });
    }
  };

  const send = async (dryRun) => {
    if (!file) return;
    setBusy(true);
    setProblem(null);
    try {
      const { data } = await crm.parties.importPeople(file, dryRun, origin);
      setReport(data);
      if (!dryRun) {
        setDone(true);
        toast({
          title: translate('crm.customerImport.importDone', { created: data.summary.created, merged: data.summary.duplicate, review: data.summary.review, errors: data.summary.error || 0 }),
          status: 'success', duration: 5000, isClosable: true
        });
        if (onImported) onImported();
      }
    } catch (error) {
      setReport(null);
      setProblem({ message: error.message, rows: Array.isArray(error.detail) ? error.detail : [] });
    } finally {
      setBusy(false);
    }
  };

  const summary = report ? report.summary : null;
  const rows = report ? report.rows : [];
  const canImport = !done && summary && summary.total - summary.error > 0;
  const groups = GROUPS.map((group) => Object.assign({}, group, { rows: rows.filter((row) => group.statuses.indexOf(row.status) !== -1) }))
    .filter((group) => !group.optional || group.rows.length);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="5xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{translate('crm.customerImport.importTitle')}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text fontSize="sm" mb={3}>{translate('crm.customerImport.importChecks')}</Text>
          <Text fontSize="sm" mb={3}>{translate('crm.customerImport.importRequiredColumns')}</Text>

          <HStack spacing={3} mb={3} align="center" wrap="wrap">
            <Text fontSize="sm" fontWeight="600">{translate('crm.customerImport.originProject')}</Text>
            <Box w="18rem">
              <SelectField size="sm" options={projects} value={origin} isDisabled={done}
                placeholder={translate('crm.customerImport.originProjectPlaceholder')}
                onChange={(value) => { setOrigin(value || null); setReport(null); setProblem(null); }} />
            </Box>
            <Text fontSize="xs" color="gray.500" flex="1" minW="14rem">{translate('crm.customerImport.originProjectHelp')}</Text>
          </HStack>

          <HStack spacing={3} mb={4} wrap="wrap">
            <Button size="sm" variant="outline" onClick={downloadTemplate}>{translate('crm.customerImport.downloadTemplate')}</Button>
            {/* The same picker as a customer's "Notes and files": a button over a hidden input, the chosen name beside it. */}
            <input ref={input} type="file" accept=".xlsx" hidden
              onChange={(event) => { setFile(event.target.files && event.target.files[0]); setReport(null); setDone(false); setProblem(null); }} />
            <Button size="sm" variant="outline" leftIcon={<Icon as={Md.MdCloudUpload} />} onClick={() => { if (input.current) { input.current.value = ''; input.current.click(); } }}>
              {translate('crm.customerImport.chooseFile')}
            </Button>
            <Text fontSize="sm" color={file ? undefined : 'gray.500'} maxW="16rem" noOfLines={1}>
              {file ? file.name : translate('crm.customerImport.noFileChosen')}
            </Text>
            <Button size="sm" variant="brand" isDisabled={!file || done} isLoading={busy && !summary} onClick={() => send(true)}>
              {translate('crm.customerImport.checkFile')}
            </Button>
          </HStack>

          {problem ? (
            <Alert status="error" mb={4} alignItems="flex-start" borderRadius="md">
              <AlertIcon />
              <Box fontSize="sm">
                <Text fontWeight="600">{problem.message}</Text>
                {problem.rows.map((row, index) => (
                  <Text key={index}>
                    {row.row_number ? translate('crm.customerImport.rowNumber', { row: row.row_number }) + ': ' : ''}
                    {(row.errors || [row]).join('; ')}
                  </Text>
                ))}
              </Box>
            </Alert>
          ) : null}

          {summary ? (
            <SimpleGrid columns={{ base: 2, md: 5 }} spacing={3} mb={4}>
              <Stat><StatLabel>{translate('crm.customerImport.rowsRead')}</StatLabel><StatNumber>{summary.total}</StatNumber></Stat>
              <Stat><StatLabel>{translate(done ? 'crm.common.rowsCreated' : 'crm.customerImport.rowsNew')}</StatLabel>
                <StatNumber color="green.500">{done ? summary.created : summary.new}</StatNumber></Stat>
              <Stat><StatLabel>{translate('crm.customerImport.rowsDuplicate')}</StatLabel><StatNumber color="orange.500">{summary.duplicate}</StatNumber></Stat>
              <Stat><StatLabel>{translate('crm.customerImport.tabReviewCustomers')}</StatLabel><StatNumber color="purple.500">{summary.review || 0}</StatNumber></Stat>
              {done ? null : <Stat><StatLabel>{translate('crm.customerImport.rowsError')}</StatLabel><StatNumber color="red.500">{summary.error}</StatNumber></Stat>}
            </SimpleGrid>
          ) : null}

          {summary && summary.error > 0 && !done ? (
            <Alert status="info" mb={3} borderRadius="md" fontSize="sm"><AlertIcon />{translate('crm.customerImport.errorsKeptApart', { n: summary.error })}</Alert>
          ) : null}

          {rows.length ? (
            <Tabs size="sm" variant="enclosed" isLazy>
              <TabList>
                {groups.map((group) => (
                  <Tab key={group.key} fontSize="sm">
                    {translate(group.textKey)}
                    <Badge ml={2} colorScheme={group.tone}>{group.rows.length}</Badge>
                  </Tab>
                ))}
              </TabList>
              <TabPanels>
                {groups.map((group) => (
                  <TabPanel key={group.key} px={0} pt={3}>
                    {!group.rows.length ? <Text fontSize="sm" color="gray.500">{translate('crm.customerImport.noRowsHere')}</Text>
                      : group.key === 'errors' ? <ErrorRows rows={group.rows} translate={translate} />
                        : <CheckedRows rows={group.rows} translate={translate} />}
                  </TabPanel>
                ))}
              </TabPanels>
            </Tabs>
          ) : null}
        </ModalBody>
        <ModalFooter>
          <HStack spacing={3}>
            <Button size="sm" variant="ghost" onClick={onClose}>{translate(done ? 'common.close' : 'common.cancel')}</Button>
            {done ? null : (
              <Button size="sm" variant="brand" isDisabled={!canImport} isLoading={busy && !!summary} onClick={() => send(false)}>
                {translate('crm.customerImport.addNewUsers')}
              </Button>
            )}
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

/** Rows that passed the check: what each will become, and what it matched. */
function CheckedRows({ rows, translate }) {
  return (
    <Box overflow="auto" maxH="22rem" borderWidth="1px" borderRadius="md">
      <Table size="sm">
        <Thead>
          <Tr>
            <Th>{translate('Row')}</Th>
            <Th>{translate('Result')}</Th>
            <Th>{translate('crm.common.importCustomerKey')}</Th>
            <Th>{translate('crm.common.importEshopKeys')}</Th>
            <Th>{translate('crm.common.importUserKeys')}</Th>
            <Th>{translate('Name')}</Th>
            <Th>{translate('Mobile')}</Th>
            <Th>{translate('Date of birth')}</Th>
            <Th>{translate('Location')}</Th>
            <Th>{translate('Job title')}</Th>
            <Th>{translate('crm.customerImport.originProject')}</Th>
            <Th>{translate('Details')}</Th>
          </Tr>
        </Thead>
        <Tbody>
          {rows.map((row) => (
            <Tr key={row.row_number}>
              <Td>{row.row_number}</Td>
              <Td><Badge colorScheme={TONE[row.status] || 'gray'}>{STATUS[row.status] ? translate(STATUS[row.status]) : row.status}</Badge></Td>
              <Td>{row.party_pk ? partyIdLabel(row.party_pk) : '-'}</Td>
              <Td>{row.values.eshop_pk ? row.values.eshop_pk + ' / ' + (row.values.eshop_id || '-') : '-'}</Td>
              <Td>{row.values.user_pk ? row.values.user_pk + ' / ' + (row.values.user_id || '-') : '-'}</Td>
              <Td>{row.values.full_name || '-'}</Td>
              <Td>{row.values.mobile || '-'}</Td>
              <Td>{row.values.birth_date ? date(row.values.birth_date) : (row.values.birth_year || '-')}</Td>
              <Td>{row.values.location_label || '-'}</Td>
              <Td>{row.values.job_name || '-'}</Td>
              <Td>{row.values.origin_project_code || '-'}</Td>
              <Td fontSize="xs" maxW="22rem" whiteSpace="normal">
                {row.duplicate_of_row ? translate('crm.customerImport.sameAsRow', { row: row.duplicate_of_row }) : null}
                {(row.similar || []).map((match) => (
                  <Text key={match.party_pk || match.intake_id || match.row_number}>
                    <Text as={match.party_pk ? 'a' : 'span'} href={match.party_pk ? (process.env.PUBLIC_URL || '') + '/admin/crm/customers/' + match.party_pk : undefined}
                      target="_blank" rel="noopener noreferrer" color="brand.500">
                      {match.display_name} {match.party_pk ? partyIdLabel(match.party_pk) : match.intake_id
                        ? translate('crm.common.pendingNumber', { id: match.intake_id })
                        : translate('crm.customerImport.rowNumber', { row: match.row_number })}
                    </Text>
                    {' - ' + match.reason}
                  </Text>
                ))}
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </Box>
  );
}

/** Rows that failed the check: the cells as written in the file, and every reason. */
function ErrorRows({ rows, translate }) {
  return (
    <Box overflow="auto" maxH="22rem" borderWidth="1px" borderRadius="md">
      <Table size="sm">
        <Thead>
          <Tr>
            <Th>{translate('Row')}</Th>
            <Th>{translate('crm.common.whatIsWrong')}</Th>
            <Th>{translate('Name')}</Th>
            <Th>{translate('crm.common.importEshopKeys')}</Th>
            <Th>{translate('crm.common.importUserKeys')}</Th>
            <Th>{translate('Mobile')}</Th>
            <Th>{translate('Date of birth')}</Th>
            <Th>{translate('crm.customerImport.locationId')}</Th>
          </Tr>
        </Thead>
        <Tbody>
          {rows.map((row) => {
            const cells = (typeof row.cells === 'string' ? JSON.parse(row.cells) : row.cells) || {};
            const errors = (typeof row.errors === 'string' ? JSON.parse(row.errors) : row.errors) || [];
            return (
              <Tr key={row.import_error_id || row.row_number} verticalAlign="top">
                <Td>{row.row_number}</Td>
                <Td fontSize="xs" color="red.500" maxW="26rem" whiteSpace="normal">
                  {errors.map((reason) => <Text key={reason}>{reason}</Text>)}
                </Td>
                <Td>{cells.full_name || '-'}</Td>
                <Td>{[cells.eshop_pk, cells.eshop_id].filter(Boolean).join(' / ') || '-'}</Td>
                <Td>{[cells.user_pk, cells.user_id].filter(Boolean).join(' / ') || '-'}</Td>
                <Td>{cells.mobile || '-'}</Td>
                <Td>{cells.birth_date || '-'}</Td>
                <Td>{cells.location_id || '-'}</Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
    </Box>
  );
}
