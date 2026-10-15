import React, { useEffect, useState } from 'react';
import {
  Badge, Box, Button, Flex, HStack, Modal, ModalBody, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalOverlay,
  Radio, Select, SimpleGrid, Spinner, Stack, Switch, Table, Tbody, Td, Text, Th, Thead, Tr, useToast
} from '@chakra-ui/react';
import DataTable from '../../components/DataTable';
import Toolbar from '../../components/Toolbar';
import useList from '../../hooks/useList';
import usePermission from '../../hooks/usePermission';
import { crm } from '../../api';
import { useT } from '../../i18n';
import { date, dateTime } from '../../utils/format';
import { useCrmMeta } from './shared';
import PartyPicker from './PartyPicker';

const INTRO = { RESOLVED: 'crm.registrationReview.resolvedIntro', ESHOP: 'crm.registrationReview.eshopIntro', PERSON: 'crm.registrationReview.personIntro' };

/*
 * The key the registration has in the system it came from. An Excel row is
 * stored as excel:<hash of the file>:<row>, so the same file run twice adds
 * nothing; it reads as its row number. A random key (a console entry with no
 * source key of its own) means nothing to a reader and shows as a dash.
 */
function sourceRecord(value, translate) {
  const text = String(value || '');
  const excel = text.match(/^excel:[0-9a-f]+:(\d+)$/);
  if (excel) return translate('crm.registrationReview.excelRow', { row: excel[1] });
  if (/^[0-9a-f]{32}$/.test(text)) return '-';
  return text || '-';
}
const GENDER = { M: 'Male', F: 'Female', OTHER: 'Other', UNKNOWN: 'Unknown' };
/* Where an identifier comes from: what the registration brought, an account already linked, or one an Excel import listed. */
const KIND = {
  INCOMING: { textKey: 'crm.registrationReview.identifierIncoming', tone: 'blue' },
  LINKED: { textKey: 'crm.registrationReview.identifierLinked', tone: 'green' },
  CANDIDATE: { textKey: 'crm.registrationReview.identifierCandidate', tone: 'orange' }
};

/** A person's basic information as label / value lines - the same fields, in the same order, on both sides. */
function factsOf(person, translate) {
  return [
    ['Name', person.full_name],
    ['Gender', person.gender_code ? translate(GENDER[person.gender_code] || person.gender_code) : null],
    ['Date of birth', person.birth_date ? date(person.birth_date) : person.birth_year],
    ['Phone', (person.phones || []).join(', ')],
    ['Email', (person.emails || []).join(', ')],
    ['Location', person.location_name ? person.location_name + (person.location_id ? ' (' + person.location_id + ')' : '') : person.location_id],
    ['Address', person.address_line],
    ['Job title', person.job_title_name ? translate(person.job_title_name) : null],
    ['crm.registrationReview.originProject', person.origin_project_name ? translate(person.origin_project_name) : null]
  ];
}

/**
 * One person's basic information. Given `compareTo`, a value that differs from
 * the other person's is marked, so the two sides can be read against each other.
 */
function PersonFacts({ person, compareTo, translate }) {
  if (!person) return <Text fontSize="sm" color="gray.500">{translate('crm.registrationReview.noPersonDetails')}</Text>;
  const others = compareTo ? factsOf(compareTo, translate) : null;
  return (
    <Stack spacing={1} fontSize="sm">
      {factsOf(person, translate).map(([label, value], index) => {
        const other = others ? others[index][1] : null;
        const differs = others && value && other && String(value) !== String(other);
        return (
          <Flex key={label} minW={0}>
            <Text color="gray.500" w="8.5rem" flexShrink={0}>{translate(label)}</Text>
            <Text fontWeight="500" color={differs ? 'orange.500' : undefined} wordBreak="break-word">{value || '-'}</Text>
          </Flex>
        );
      })}
    </Stack>
  );
}

/** The project identifiers a person carries: project, account PK and account ID, and where each comes from. */
function Identifiers({ rows, translate }) {
  if (!rows || !rows.length) return <Text fontSize="xs" color="gray.500" mt={2}>{translate('crm.registrationReview.noIdentifiers')}</Text>;
  return (
    <Table size="sm" mt={2}>
      <Thead>
        <Tr>
          <Th px={2}>{translate('Project')}</Th>
          <Th px={2}>{translate('Account PK')}</Th>
          <Th px={2}>{translate('Account ID')}</Th>
          <Th px={2}>{translate('crm.registrationReview.identifierKind')}</Th>
        </Tr>
      </Thead>
      <Tbody>
        {rows.map((row, index) => (
          <Tr key={index}>
            <Td px={2}>{row.project_name ? translate(row.project_name) : '-'}</Td>
            <Td px={2}>{row.account_pk || '-'}</Td>
            <Td px={2}>{row.account_id || '-'}</Td>
            <Td px={2}><Badge colorScheme={(KIND[row.kind] || {}).tone}>{translate((KIND[row.kind] || {}).textKey || row.kind)}</Badge></Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}

/*
 * The details a merge can take from the new registration instead of keeping
 * the customer's own, and how each reads on both sides. The keys are the ones
 * the server accepts in `use_incoming`. Phones are not here: the customer
 * keeps every number, theirs and the registration's.
 */
const TAKEABLE = [
  { key: 'full_name', label: 'Name', value: (person) => person.full_name },
  { key: 'birth_date', label: 'Date of birth', value: (person) => (person.birth_date ? date(person.birth_date) : person.birth_year) },
  { key: 'gender_code', label: 'Gender', value: (person, translate) => (person.gender_code ? translate(GENDER[person.gender_code] || person.gender_code) : null) },
  { key: 'address', label: 'Address', value: (person) => [person.location_name, person.address_line].filter(Boolean).join(' / ') },
  { key: 'job_title', label: 'Job title', value: (person, translate) => (person.job_title_name ? translate(person.job_title_name) : null) }
];

/**
 * Field by field, which value the customer keeps after the merge: theirs (the
 * default) or the new registration's. A field the registration left empty can
 * only keep the customer's.
 */
function FieldChoices({ incoming, existing, choices, onChange, translate }) {
  return (
    <Table size="sm" mt={2}>
      <Thead>
        <Tr>
          <Th px={2}>{translate('crm.registrationReview.field')}</Th>
          <Th px={2}>{translate('crm.registrationReview.newRegistration')}</Th>
          <Th px={2}>{translate('crm.registrationReview.selectedCustomer')}</Th>
        </Tr>
      </Thead>
      <Tbody>
        {TAKEABLE.map((field) => {
          const fresh = field.value(incoming, translate);
          const kept = field.value(existing, translate);
          const takeNew = choices.indexOf(field.key) !== -1;
          const set = (useNew) => onChange(useNew ? choices.concat([field.key]) : choices.filter((key) => key !== field.key));
          return (
            <Tr key={field.key}>
              <Td px={2} color="gray.500">{translate(field.label)}</Td>
              <Td px={2}>
                <Radio isChecked={takeNew} isDisabled={!fresh} onChange={() => set(true)}>
                  <Text as="span" fontSize="sm" color={fresh && kept && String(fresh) !== String(kept) ? 'orange.500' : undefined}>{fresh || '-'}</Text>
                </Radio>
              </Td>
              <Td px={2}>
                <Radio isChecked={!takeNew} onChange={() => set(false)}><Text as="span" fontSize="sm">{kept || '-'}</Text></Radio>
              </Td>
            </Tr>
          );
        })}
      </Tbody>
    </Table>
  );
}

export default function RegistrationReview({ category, resolved, onDecided }) {
  const translate = useT();
  const meta = useCrmMeta();
  const list = useList(params => crm.parties.registrations(params), { page: 1, limit: 20, category, status: resolved ? 'RESOLVED' : 'PENDING' });
  const { canWrite } = usePermission('/admin/crm/customers');
  const toast = useToast();
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [target, setTarget] = useState('');
  const [manualPk, setManualPk] = useState('');
  const [busy, setBusy] = useState(false);
  /* Off: the customer keeps their details. On: `useIncoming` lists the fields taken from the registration. */
  const [choosing, setChoosing] = useState(false);
  const [useIncoming, setUseIncoming] = useState([]);
  const [relationship, setRelationship] = useState('');
  const eshop = category === 'ESHOP';
  const reviewing = !resolved && canWrite;

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

  const open = (row) => {
    setSelected(row); setTarget(''); setManualPk(''); setChoosing(false); setUseIncoming([]); setRelationship('');
  };
  const pick = (value) => { setTarget(value); setManualPk(''); setChoosing(false); setUseIncoming([]); setRelationship(''); };

  const candidateKey = candidate => (candidate.party_pk ? 'party:' + candidate.party_pk : 'intake:' + candidate.intake_id);
  const candidateLabel = candidate => (candidate.party_pk
    ? translate('crm.registrationReview.customerNumber', { id: candidate.party_pk })
    : translate('crm.registrationReview.pendingRegistrationNumber', { id: candidate.intake_id }));
  const candidates = detail ? detail.candidates : (selected && selected.candidates) || [];
  const chosen = candidates.filter(candidate => candidateKey(candidate) === target)[0] || null;
  /* Only an existing customer can be merged into field by field, or related to. */
  const chosenCustomer = chosen && chosen.party_pk && chosen.person ? chosen : null;
  const personTypes = (meta.party_relationship_types || []).filter((type) => type.applies_to === 'ANY' || type.applies_to === 'PERSON');

  const decide = async action => {
    setBusy(true);
    try {
      const [kind, id] = target.split(':');
      const payload = { action, party_pk: manualPk || (kind === 'party' ? id : undefined), candidate_intake_id: !manualPk && kind === 'intake' ? id : undefined };
      if (action === 'MERGE' && choosing) payload.use_incoming = useIncoming;
      if (action === 'NEW' && chosenCustomer && relationship) {
        payload.relationship = { related_party_pk: chosenCustomer.party_pk, relationship_type_code: relationship };
      }
      await crm.parties.decideRegistration(selected.intake_id, payload);
      setSelected(null); list.reload();
      if (onDecided) onDecided();
      toast({ title: translate('crm.registrationReview.decisionSaved'), status: 'success', duration: 3000 });
    } catch (error) { toast({ title: error.message, status: 'error', duration: 6000 }); }
    finally { setBusy(false); }
  };

  return <Box px={4}>
    <Text fontSize="sm" mb={1}>{translate(INTRO[resolved ? 'RESOLVED' : eshop ? 'ESHOP' : 'PERSON'])}</Text>
    {/* Name, phone, birthday, an e-shop or user identifier, the registration or customer number, the source. */}
    <Box mx={-5}><Toolbar search={list.params.q} onSearch={(q) => list.setFilter({ q: q || undefined })} /></Box>
    <DataTable columns={[
      { key: 'intake_id', label: translate('crm.registrationReview.registration') },
      { key: 'name', label: translate('Person'), render: row => (row.payload.party || {}).full_name || (row.payload.party || {}).display_name || '-' },
      { key: 'project_name', label: translate('crm.registrationReview.sourceProject') },
      { key: 'source_record_id', label: translate('crm.registrationReview.sourceRecord'), render: row => sourceRecord(row.source_record_id, translate) },
      { key: 'score', label: translate('crm.registrationReview.bestScore'), render: row => Math.max(0, ...(row.candidates || []).map(c => c.score || 0)) },
      { key: 'status', label: translate('Status') },
      { key: 'party_pk', label: translate('crm.common.importCustomerKey') },
      { key: 'created_at', label: translate('Received'), render: row => dateTime(row.created_at) }
    ]} rows={list.rows} loading={list.loading} page={list.params.page} limit={list.params.limit} total={list.total}
      onPageChange={list.setPage} onLimitChange={limit => list.setFilter({ limit })} rowKey={row => row.intake_id}
      onRowClick={open} />
    {/*
      The new registration on the left, the matching customers on the right -
      or, once one is chosen in the top-right picker, that customer alone, so
      the two can be read side by side. The choices sit underneath.
    */}
    <Modal isOpen={!!selected} onClose={() => !busy && setSelected(null)} size="6xl" returnFocusOnClose={false} preserveScrollBarGap>
      <ModalOverlay /><ModalContent maxH="calc(100vh - 7.5rem)" display="flex" flexDirection="column">
        <ModalHeader flexShrink={0}>{translate('crm.registrationReview.reviewTitle')}</ModalHeader><ModalCloseButton isDisabled={busy} />
        <ModalBody flex="1" minH={0} overflowY="auto">
          {selected && !detail ? <HStack py={6} justify="center"><Spinner size="sm" /></HStack> : null}
          {selected && detail && <>
            <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={3} mb={3}>
              <Box borderWidth="1px" borderColor="blue.200" borderRadius="md" p={3} minW={0}>
                <Text fontWeight="bold">{translate('crm.registrationReview.newRegistration')}</Text>
                <Text fontSize="xs" color="gray.500" mb={2}>
                  {translate('crm.registrationReview.source', { project: detail.source_project_name ? translate(detail.source_project_name) : '-', record: detail.source_record_id })}
                </Text>
                <PersonFacts person={detail.incoming.person} translate={translate} />
                <Identifiers rows={detail.incoming.identifiers} translate={translate} />
              </Box>

              <Box borderWidth="1px" borderRadius="md" p={3} minW={0}>
                <Flex justify="space-between" align="center" gap={2} data-gap="8" wrap="wrap" data-gap-wrap mb={2}>
                  <Text fontWeight="bold">{translate('crm.registrationReview.candidates', { n: candidates.length })}</Text>
                  <Select size="sm" maxW="20rem" placeholder={translate('crm.registrationReview.selectMatch')} value={target} onChange={e => pick(e.target.value)}>
                    {candidates.map(candidate => <option key={candidateKey(candidate)} value={candidateKey(candidate)}>
                      {(candidate.display_name || translate('crm.registrationReview.match')) + ' — ' + candidateLabel(candidate)
                        + (candidate.score != null ? '  ' + translate('crm.registrationReview.points', { n: candidate.score }) : '')}
                    </option>)}
                  </Select>
                </Flex>
                {chosen ? (
                  <Box>
                    <HStack justify="space-between" mb={2} wrap="wrap">
                      <Text fontWeight="600">{(chosen.display_name || translate('crm.registrationReview.customer')) + ' — ' + candidateLabel(chosen)}</Text>
                      <Text fontSize="xs" color="gray.500">{chosen.reason} {chosen.score != null ? translate('crm.registrationReview.points', { n: chosen.score }) : ''}</Text>
                    </HStack>
                    <PersonFacts person={chosen.person} compareTo={detail.incoming.person} translate={translate} />
                    <Identifiers rows={chosen.identifiers} translate={translate} />
                  </Box>
                ) : (
                  <Stack spacing={2}>
                    {candidates.map(candidate => (
                      <Box key={candidateKey(candidate)} borderWidth="1px" borderRadius="md" p={2} cursor="pointer" _hover={{ borderColor: 'brand.400' }}
                        onClick={() => pick(candidateKey(candidate))}>
                        <HStack justify="space-between" wrap="wrap">
                          <Text fontSize="sm" fontWeight="600">{(candidate.display_name || translate('crm.registrationReview.customer')) + ' — ' + candidateLabel(candidate)}</Text>
                          <Text fontSize="xs" color="gray.500">{candidate.score != null ? translate('crm.registrationReview.points', { n: candidate.score }) : ''}</Text>
                        </HStack>
                        <Text fontSize="xs" color="gray.500">{candidate.reason}</Text>
                      </Box>
                    ))}
                  </Stack>
                )}
              </Box>
            </SimpleGrid>

            {reviewing && !eshop && chosenCustomer ? (
              <Box borderWidth="1px" borderRadius="md" p={3} mb={3}>
                <HStack spacing={3}>
                  <Switch isChecked={choosing} onChange={e => { setChoosing(e.target.checked); setUseIncoming([]); }} />
                  <Text fontWeight="600" fontSize="sm">{translate('crm.registrationReview.chooseDetails')}</Text>
                </HStack>
                <Text fontSize="xs" color="gray.500" mt={1}>{translate(choosing ? 'crm.registrationReview.chooseDetailsOn' : 'crm.registrationReview.chooseDetailsOff')}</Text>
                {choosing ? <FieldChoices incoming={detail.incoming.person} existing={chosenCustomer.person} choices={useIncoming} onChange={setUseIncoming} translate={translate} /> : null}
              </Box>
            ) : null}

            {reviewing && !eshop && chosenCustomer ? (
              <Box borderWidth="1px" borderRadius="md" p={3} mb={3}>
                <Text fontWeight="600" fontSize="sm">{translate('crm.registrationReview.notTheSamePerson')}</Text>
                <Text fontSize="xs" color="gray.500" mb={2}>{translate('crm.registrationReview.relateHint')}</Text>
                <Select size="sm" maxW="22rem" value={relationship} onChange={e => setRelationship(e.target.value)}>
                  <option value="">{translate('crm.registrationReview.notRelated')}</option>
                  {personTypes.map(type => <option key={type.relationship_type_code} value={type.relationship_type_code}>{translate(type.relationship_name)}</option>)}
                </Select>
              </Box>
            ) : null}

            {reviewing ? <Box>
              {/* Another customer than the candidates, found and checked by number, name or phone - only while no candidate is selected. */}
              {eshop && <Box mb={2}>
                <PartyPicker value={manualPk || null} onChange={pk => setManualPk(pk ? String(pk) : '')} isDisabled={!!target}
                  placeholder={translate('crm.registrationReview.enterVerifiedPk')} />
              </Box>}
              <Text fontSize="sm">{translate('crm.registrationReview.resolveFirst')}</Text>
            </Box> : null}
          </>}
        </ModalBody>
        <ModalFooter flexShrink={0}><HStack>
          <Button onClick={() => setSelected(null)} isDisabled={busy}>{translate('Close')}</Button>
          {reviewing && <>
            <Button isLoading={busy} isDisabled={!detail} onClick={() => decide(eshop ? 'REJECT' : 'NEW')}>
              {translate(eshop ? 'crm.registrationReview.rejectAssignment' : relationship && chosenCustomer ? 'crm.registrationReview.registerAsNewRelated' : 'crm.registrationReview.registerAsNew')}
            </Button>
            <Button colorScheme="blue" isLoading={busy} isDisabled={!detail || (!target && !manualPk) || (!eshop && !!relationship)} onClick={() => decide(eshop ? 'ASSIGN' : 'MERGE')}>
              {translate(eshop ? 'crm.registrationReview.assignIdentifier' : 'crm.registrationReview.mergeIntoSelected')}
            </Button>
          </>}
        </HStack></ModalFooter>
      </ModalContent>
    </Modal>
  </Box>;
}
