import React, { useEffect, useState } from 'react';
import {
  Badge, Box, Button, HStack, Input, Modal, ModalBody, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalOverlay,
  Select, SimpleGrid, Spinner, Table, Tbody, Td, Text, Th, Thead, Tr, useToast
} from '@chakra-ui/react';
import DataTable from '../../components/DataTable';
import Toolbar from '../../components/Toolbar';
import useList from '../../hooks/useList';
import usePermission from '../../hooks/usePermission';
import { crm } from '../../api';
import { useT } from '../../i18n';
import { date, dateTime } from '../../utils/format';

const INTRO = { RESOLVED: 'crm.review.resolvedIntro', ESHOP: 'crm.review.eshopIntro', PERSON: 'crm.review.personIntro' };

/*
 * The key the registration has in the system it came from. An Excel row is
 * stored as excel:<hash of the file>:<row>, so the same file run twice adds
 * nothing; it reads as its row number. A random key (a console entry with no
 * source key of its own) means nothing to a reader and shows as a dash.
 */
function sourceRecord(value, translate) {
  const text = String(value || '');
  const excel = text.match(/^excel:[0-9a-f]+:(\d+)$/);
  if (excel) return translate('crm.review.excelRow', { row: excel[1] });
  if (/^[0-9a-f]{32}$/.test(text)) return '-';
  return text || '-';
}
const GENDER = { M: 'Male', F: 'Female', OTHER: 'Other', UNKNOWN: 'Unknown' };
/* Where an identifier comes from: what the registration brought, an account already linked, or one an Excel import listed. */
const KIND = {
  INCOMING: { label: 'crm.review.identifierIncoming', tone: 'blue' },
  LINKED: { label: 'crm.review.identifierLinked', tone: 'green' },
  CANDIDATE: { label: 'crm.review.identifierCandidate', tone: 'orange' }
};

/** One person's basic information, the same layout for the incoming person and every candidate. */
function PersonFacts({ person, translate }) {
  if (!person) return <Text fontSize="sm" color="gray.500">{translate('crm.review.noPersonDetails')}</Text>;
  const facts = [
    ['Name', person.full_name],
    ['Gender', person.gender_code ? translate(GENDER[person.gender_code] || person.gender_code) : null],
    ['Date of birth', person.birth_date ? date(person.birth_date) : person.birth_year],
    ['Phone', (person.phones || []).join(', ')],
    ['Email', (person.emails || []).join(', ')],
    ['Location', person.location_name ? person.location_name + (person.location_id ? ' (' + person.location_id + ')' : '') : person.location_id],
    ['Address', person.address_line],
    ['Job title', person.job_title_name ? translate(person.job_title_name) : null],
    ['crm.review.originProject', person.origin_project_name ? translate(person.origin_project_name) : null]
  ];
  return (
    <SimpleGrid columns={{ base: 1, md: 3 }} spacingX={4} spacingY={1} fontSize="sm">
      {facts.map(([label, value]) => (
        <Box key={label} minW={0}>
          <Text as="span" color="gray.500">{translate(label)}: </Text>
          <Text as="span" fontWeight="500">{value || '-'}</Text>
        </Box>
      ))}
    </SimpleGrid>
  );
}

/** The project identifiers a person carries: project, account PK and account ID, and where each comes from. */
function Identifiers({ rows, translate }) {
  if (!rows || !rows.length) return <Text fontSize="xs" color="gray.500" mt={2}>{translate('crm.review.noIdentifiers')}</Text>;
  return (
    <Table size="sm" mt={2}>
      <Thead>
        <Tr>
          <Th px={2}>{translate('Project')}</Th>
          <Th px={2}>{translate('Account PK')}</Th>
          <Th px={2}>{translate('Account ID')}</Th>
          <Th px={2}>{translate('crm.review.identifierKind')}</Th>
        </Tr>
      </Thead>
      <Tbody>
        {rows.map((row, index) => (
          <Tr key={index}>
            <Td px={2}>{row.project_name ? translate(row.project_name) : '-'}</Td>
            <Td px={2}>{row.account_pk || '-'}</Td>
            <Td px={2}>{row.account_id || '-'}</Td>
            <Td px={2}><Badge colorScheme={(KIND[row.kind] || {}).tone}>{translate((KIND[row.kind] || {}).label || row.kind)}</Badge></Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}

export default function RegistrationReview({ category, resolved, onDecided }) {
  const translate = useT();
  const list = useList(params => crm.parties.registrations(params), { page: 1, limit: 20, category, status: resolved ? 'RESOLVED' : 'PENDING' });
  const { canWrite } = usePermission('/admin/crm/customers');
  const toast = useToast();
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [target, setTarget] = useState('');
  const [manualPk, setManualPk] = useState('');
  const [busy, setBusy] = useState(false);
  const eshop = category === 'ESHOP';

  /* The stored row has only what was submitted; the detail adds names, every phone and every identifier to compare. */
  useEffect(() => {
    if (!selected) { setDetail(null); return undefined; }
    let live = true;
    setDetail(null);
    crm.parties.registration(selected.intake_id)
      .then(({ data }) => { if (live) setDetail(data || null); })
      .catch((error) => { if (live) toast({ title: error.message, status: 'error', duration: 6000 }); });
    return () => { live = false; };
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const candidateLabel = candidate => (candidate.party_pk
    ? translate('crm.review.customerNumber', { id: candidate.party_pk })
    : translate('crm.review.pendingRegistrationNumber', { id: candidate.intake_id }));
  const decide = async action => {
    setBusy(true);
    try {
      const [kind, id] = target.split(':');
      const payload = { action, party_pk: manualPk || (kind === 'party' ? id : undefined), candidate_intake_id: !manualPk && kind === 'intake' ? id : undefined };
      await crm.parties.decideRegistration(selected.intake_id, payload);
      setSelected(null); list.reload();
      if (onDecided) onDecided();
      toast({ title: translate('crm.review.decisionSaved'), status: 'success', duration: 3000 });
    } catch (error) { toast({ title: error.message, status: 'error', duration: 6000 }); }
    finally { setBusy(false); }
  };
  const candidates = detail ? detail.candidates : (selected && selected.candidates) || [];

  return <Box px={4}>
    <Text fontSize="sm" mb={1}>{translate(INTRO[resolved ? 'RESOLVED' : eshop ? 'ESHOP' : 'PERSON'])}</Text>
    {/* Name, phone, birthday, an e-shop or user identifier, the registration or customer number, the source. */}
    <Box mx={-5}><Toolbar search={list.params.q} onSearch={(q) => list.setFilter({ q: q || undefined })} /></Box>
    <DataTable columns={[
      { key: 'intake_id', label: translate('crm.review.registration') },
      { key: 'name', label: translate('Person'), render: row => (row.payload.party || {}).full_name || (row.payload.party || {}).display_name || '-' },
      { key: 'project_name', label: translate('crm.review.sourceProject') },
      { key: 'source_record_id', label: translate('crm.review.sourceRecord'), render: row => sourceRecord(row.source_record_id, translate) },
      { key: 'score', label: translate('crm.review.bestScore'), render: row => Math.max(0, ...(row.candidates || []).map(c => c.score || 0)) },
      { key: 'status', label: translate('Status') },
      { key: 'party_pk', label: translate('crm.customers.importCustomerKey') },
      { key: 'created_at', label: translate('Received'), render: row => dateTime(row.created_at) }
    ]} rows={list.rows} loading={list.loading} page={list.params.page} limit={list.params.limit} total={list.total}
      onPageChange={list.setPage} onLimitChange={limit => list.setFilter({ limit })} rowKey={row => row.intake_id}
      onRowClick={row => { setSelected(row); setTarget(''); setManualPk(''); }} />
    {/*
      The header, the incoming person, the choice and the buttons stay put;
      only the candidate list scrolls, however many candidates there are.
    */}
    <Modal isOpen={!!selected} onClose={() => !busy && setSelected(null)} size="5xl" returnFocusOnClose={false} preserveScrollBarGap>
      <ModalOverlay /><ModalContent maxH="calc(100vh - 7.5rem)" display="flex" flexDirection="column">
        <ModalHeader flexShrink={0}>{translate('crm.review.reviewTitle')}</ModalHeader><ModalCloseButton isDisabled={busy} />
        <ModalBody display="flex" flexDirection="column" flex="1" minH={0} overflow="hidden">
          {selected && !detail ? <HStack py={6} justify="center"><Spinner size="sm" /></HStack> : null}
          {selected && detail && <>
            <Box flexShrink={0} borderWidth="1px" borderColor="blue.200" borderRadius="md" p={3} mb={3} maxH="40%" overflowY="auto">
              <HStack justify="space-between" mb={2} wrap="wrap">
                <Text fontWeight="bold">{translate('crm.review.incomingPerson')}</Text>
                <Text fontSize="sm" color="gray.500">
                  {translate('crm.review.source', { project: detail.source_project_name ? translate(detail.source_project_name) : '-', record: detail.source_record_id })}
                </Text>
              </HStack>
              <PersonFacts person={detail.incoming.person} translate={translate} />
              <Identifiers rows={detail.incoming.identifiers} translate={translate} />
            </Box>
            <Text fontWeight="bold" fontSize="sm" mb={2} flexShrink={0}>{translate('crm.review.candidates', { n: candidates.length })}</Text>
            <Box flex="1" minH="6rem" overflowY="auto" pr={1} mb={3}>
              {candidates.map((candidate, index) => <Box key={index} borderWidth="1px" borderRadius="md" p={3} mb={3}>
                <HStack justify="space-between" mb={2} wrap="wrap">
                  <Text fontWeight="bold">{(candidate.display_name || translate('crm.review.customer')) + ' — ' + candidateLabel(candidate)}</Text>
                  <Text fontSize="sm">{candidate.reason} {candidate.score != null ? translate('crm.review.points', { n: candidate.score }) : ''}</Text>
                </HStack>
                <PersonFacts person={candidate.person} translate={translate} />
                <Identifiers rows={candidate.identifiers} translate={translate} />
              </Box>)}
            </Box>
            {!resolved && canWrite && <Box flexShrink={0}>
              <Select placeholder={translate('crm.review.selectMatch')} value={target} onChange={e => { setTarget(e.target.value); setManualPk(''); }} mb={3}>
                {candidates.map((candidate, index) => <option key={index} value={candidate.party_pk ? `party:${candidate.party_pk}` : `intake:${candidate.intake_id}`}>
                  {(candidate.display_name || translate('crm.review.match')) + ' — ' + (candidate.party_pk
                    ? translate('crm.review.customerNumber', { id: candidate.party_pk })
                    : translate('crm.review.pendingNumber', { id: candidate.intake_id }))}
                </option>)}
              </Select>
              {eshop && <Input placeholder={translate('crm.review.enterVerifiedPk')} value={manualPk} onChange={e => setManualPk(e.target.value)} />}
              <Text fontSize="sm" mt={3}>{translate('crm.review.resolveFirst')}</Text>
            </Box>}
          </>}
        </ModalBody>
        <ModalFooter flexShrink={0}><HStack>
          <Button onClick={() => setSelected(null)} isDisabled={busy}>{translate('Close')}</Button>
          {!resolved && canWrite && <>
            <Button isLoading={busy} isDisabled={!detail} onClick={() => decide(eshop ? 'REJECT' : 'NEW')}>
              {translate(eshop ? 'crm.review.rejectAssignment' : 'crm.review.registerAsNew')}
            </Button>
            <Button colorScheme="blue" isLoading={busy} isDisabled={!detail || (!target && !manualPk)} onClick={() => decide(eshop ? 'ASSIGN' : 'MERGE')}>
              {translate(eshop ? 'crm.review.assignIdentifier' : 'crm.review.mergeIntoSelected')}
            </Button>
          </>}
        </HStack></ModalFooter>
      </ModalContent>
    </Modal>
  </Box>;
}
