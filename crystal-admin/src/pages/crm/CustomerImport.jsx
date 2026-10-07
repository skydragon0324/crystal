import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, AlertIcon, Badge, Box, Button, HStack, Icon, Modal, ModalBody, ModalCloseButton, ModalContent,
  ModalFooter, ModalHeader, ModalOverlay, SimpleGrid, Stat, StatLabel, StatNumber, Table, Tbody, Td, Text, Th,
  Thead, Tr, useToast
} from '@chakra-ui/react';
import * as Md from 'react-icons/md';

import { crm } from '../../api';
import { useT } from '../../i18n';
import { date } from '../../utils/format';
import { partyIdLabel } from './shared';

const TONE = { REVIEW: 'purple', MERGED: 'blue', NEW: 'green', CREATED: 'green', DUPLICATE: 'orange', ERROR: 'red' };
const STATUS = {
  NEW: 'crm.customers.rowStatusNEW',
  CREATED: 'crm.customers.rowStatusCREATED',
  DUPLICATE: 'crm.customers.rowStatusDUPLICATE',
  ERROR: 'crm.customers.rowStatusERROR'
};

/**
 * PEOPLE FROM AN EXCEL SHEET.
 *
 * Three steps in one dialog, so nothing is written by surprise:
 *
 *   1. choose the file (the template is one click away, with the job titles
 *      and locations it accepts on sheets of their own);
 *   2. CHECK it - the API reads every row and answers NEW, DUPLICATE (of a
 *      customer on file, or of an earlier row) or ERROR, writing nothing;
 *   3. IMPORT - only offered when no row is an ERROR. NEW rows become
 *      customers; DUPLICATE rows are left out and stay listed, so whoever
 *      loaded the sheet can open the customer each one matched.
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

  useEffect(() => {
    if (!isOpen) return;
    setFile(null); setReport(null); setDone(false); setProblem(null);
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
      const { data } = await crm.parties.importPeople(file, dryRun);
      setReport(data);
      if (!dryRun) {
        setDone(true);
        toast({
          title: `${data.summary.created} created, ${data.summary.duplicate} merged, ${data.summary.review} awaiting review`,
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
  const canImport = !done && summary && summary.error === 0 && summary.total > 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="5xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{translate('crm.customers.importTitle')}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text fontSize="sm" mb={3}>{translate('crm.review.importChecks')}</Text>
          <Text fontSize="sm" mb={3}>{translate('crm.customers.importRequiredColumns')}</Text>

          <HStack spacing={3} mb={4} wrap="wrap">
            <Button size="sm" variant="outline" onClick={downloadTemplate}>{translate('crm.customers.downloadTemplate')}</Button>
            {/* The same picker as a customer's "Notes and files": a button over a hidden input, the chosen name beside it. */}
            <input ref={input} type="file" accept=".xlsx" hidden
              onChange={(event) => { setFile(event.target.files && event.target.files[0]); setReport(null); setDone(false); setProblem(null); }} />
            <Button size="sm" variant="outline" leftIcon={<Icon as={Md.MdCloudUpload} />} onClick={() => { if (input.current) { input.current.value = ''; input.current.click(); } }}>
              {translate('crm.customers.chooseFile')}
            </Button>
            <Text fontSize="sm" color={file ? undefined : 'gray.500'} maxW="16rem" noOfLines={1}>
              {file ? file.name : translate('crm.customers.noFileChosen')}
            </Text>
            <Button size="sm" variant="brand" isDisabled={!file || done} isLoading={busy && !summary} onClick={() => send(true)}>
              {translate('crm.customers.checkFile')}
            </Button>
          </HStack>

          {problem ? (
            <Alert status="error" mb={4} alignItems="flex-start" borderRadius="md">
              <AlertIcon />
              <Box fontSize="sm">
                <Text fontWeight="600">{problem.message}</Text>
                {problem.rows.map((row, index) => (
                  <Text key={index}>
                    {row.row_number ? translate('crm.customers.rowNumber', { row: row.row_number }) + ': ' : ''}
                    {(row.errors || [row]).join('; ')}
                  </Text>
                ))}
              </Box>
            </Alert>
          ) : null}

          {summary ? (
            <SimpleGrid columns={{ base: 2, md: 5 }} spacing={3} mb={4}>
              <Stat><StatLabel>{translate('crm.customers.rowsRead')}</StatLabel><StatNumber>{summary.total}</StatNumber></Stat>
              <Stat><StatLabel>{translate(done ? 'crm.customers.rowsCreated' : 'crm.customers.rowsNew')}</StatLabel>
                <StatNumber color="green.500">{done ? summary.created : summary.new}</StatNumber></Stat>
              <Stat><StatLabel>{translate('crm.customers.rowsDuplicate')}</StatLabel><StatNumber color="orange.500">{summary.duplicate}</StatNumber></Stat>
              <Stat><StatLabel>Awaiting review</StatLabel><StatNumber color="purple.500">{summary.review || 0}</StatNumber></Stat>
              {done ? null : <Stat><StatLabel>{translate('crm.customers.rowsError')}</StatLabel><StatNumber color="red.500">{summary.error}</StatNumber></Stat>}
            </SimpleGrid>
          ) : null}

          {summary && summary.error > 0 ? (
            <Alert status="warning" mb={3} borderRadius="md" fontSize="sm"><AlertIcon />{translate('crm.customers.fixErrorsFirst')}</Alert>
          ) : null}

          {rows.length ? (
            <Box overflowX="auto" borderWidth="1px" borderRadius="md">
              <Table size="sm">
                <Thead>
                  <Tr>
                    <Th>{translate('Row')}</Th>
                    <Th>{translate('Result')}</Th>
                    <Th>{translate('crm.customers.importCustomerKey')}</Th>
                    <Th>{translate('crm.customers.importEshopKeys')}</Th>
                    <Th>{translate('Name')}</Th>
                    <Th>{translate('Mobile')}</Th>
                    <Th>{translate('Date of birth')}</Th>
                    <Th>{translate('Location')}</Th>
                    <Th>{translate('Job title')}</Th>
                    <Th>{translate('Details')}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {rows.map((row) => (
                    <Tr key={row.row_number}>
                      <Td>{row.row_number}</Td>
                      <Td><Badge colorScheme={TONE[row.status] || 'gray'}>{STATUS[row.status] ? translate(STATUS[row.status]) : row.status}</Badge></Td>
                      <Td>{row.party_pk || '-'}</Td>
                      <Td>{row.values.eshop_pk ? row.values.eshop_pk + ' / ' + (row.values.eshop_id || '-') : '-'}</Td>
                      <Td>{row.values.full_name || '-'}</Td>
                      <Td>{row.values.mobile || '-'}</Td>
                      <Td>{row.values.birth_date ? date(row.values.birth_date) : (row.values.birth_year || '-')}</Td>
                      <Td>{row.values.location_label || '-'}</Td>
                      <Td>{row.values.job_name || '-'}</Td>
                      <Td fontSize="xs" maxW="22rem" whiteSpace="normal">
                        {row.status === 'ERROR' ? (row.errors || []).join('; ') : null}
                        {row.duplicate_of_row ? translate('crm.customers.sameAsRow', { row: row.duplicate_of_row }) : null}
                        {(row.similar || []).map((match) => (
                          <Text key={match.party_pk || match.intake_id || match.row_number}>
                            <Text as={match.party_pk ? 'a' : 'span'} href={match.party_pk ? (process.env.PUBLIC_URL || '') + '/admin/crm/customers/' + match.party_pk : undefined}
                              target="_blank" rel="noopener noreferrer" color="brand.500">
                              {match.display_name} {match.party_pk ? partyIdLabel(match.party_pk) : match.intake_id
                                ? translate('crm.review.pendingNumber', { id: match.intake_id })
                                : translate('crm.customers.rowNumber', { row: match.row_number })}
                            </Text>
                            {' - ' + match.reason}
                          </Text>
                        ))}
                        {partyIdLabel(row.party_pk) || null}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
          ) : null}
        </ModalBody>
        <ModalFooter>
          <HStack spacing={3}>
            <Button size="sm" variant="ghost" onClick={onClose}>{translate(done ? 'common.close' : 'common.cancel')}</Button>
            {done ? null : (
              <Button size="sm" variant="brand" isDisabled={!canImport} isLoading={busy && !!summary} onClick={() => send(false)}>
                {translate('crm.customers.importNew', { n: summary ? summary.new : 0 })}
              </Button>
            )}
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
