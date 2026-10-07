import React, { useState } from 'react';
import { Box, Button, HStack, Input, Modal, ModalBody, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalOverlay, Select, Text, useToast } from '@chakra-ui/react';
import DataTable from '../../components/DataTable';
import useList from '../../hooks/useList';
import usePermission from '../../hooks/usePermission';
import { crm } from '../../api';
import { useT } from '../../i18n';
import { dateTime } from '../../utils/format';

function details(person, translate) {
  return [person.full_name || person.display_name, person.mobile,
    ...(person.contacts || []).map(c => c.contact_value), person.birth_date,
    person.address_line, person.home_location_pk && translate('crm.review.location', { value: person.home_location_pk }),
    person.job_title_id && translate('crm.review.occupation', { value: person.job_title_id })].filter(Boolean).join(' · ');
}

const INTRO = { RESOLVED: 'crm.review.resolvedIntro', ESHOP: 'crm.review.eshopIntro', PERSON: 'crm.review.personIntro' };

export default function RegistrationReview({ category, resolved, onDecided }) {
  const translate = useT();
  const list = useList(params => crm.parties.registrations(params), { page: 1, limit: 20, category, status: resolved ? 'RESOLVED' : 'PENDING' });
  const { canWrite } = usePermission('/admin/crm/customers');
  const toast = useToast();
  const [selected, setSelected] = useState(null);
  const [target, setTarget] = useState('');
  const [manualPk, setManualPk] = useState('');
  const [busy, setBusy] = useState(false);
  const eshop = category === 'ESHOP';
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
  return <Box px={4}>
    <Text fontSize="sm" mb={4}>{translate(INTRO[resolved ? 'RESOLVED' : eshop ? 'ESHOP' : 'PERSON'])}</Text>
    <DataTable columns={[
      { key: 'intake_id', label: translate('crm.review.registration') },
      { key: 'name', label: translate('Person'), render: row => (row.payload.party || {}).full_name || (row.payload.party || {}).display_name || '-' },
      { key: 'project_name', label: translate('crm.review.sourceProject') },
      { key: 'source_record_id', label: translate('crm.review.sourceRecord') },
      { key: 'score', label: translate('crm.review.bestScore'), render: row => Math.max(0, ...(row.candidates || []).map(c => c.score || 0)) },
      { key: 'status', label: translate('Status') },
      { key: 'party_pk', label: translate('crm.customers.importCustomerKey') },
      { key: 'created_at', label: translate('Received'), render: row => dateTime(row.created_at) }
    ]} rows={list.rows} loading={list.loading} page={list.params.page} limit={list.params.limit} total={list.total}
      onPageChange={list.setPage} onLimitChange={limit => list.setFilter({ limit })} rowKey={row => row.intake_id}
      onRowClick={row => { setSelected(row); setTarget(''); setManualPk(''); }} />
    <Modal isOpen={!!selected} onClose={() => !busy && setSelected(null)} size="3xl">
      <ModalOverlay /><ModalContent><ModalHeader>{translate('crm.review.reviewTitle')}</ModalHeader><ModalCloseButton isDisabled={busy} />
        <ModalBody>
          {selected && <>
            <Text fontWeight="bold">{translate('crm.review.incomingPerson')}</Text>
            <Text mb={4}>{details(selected.payload.party || {}, translate) || translate('crm.review.noPersonDetails')}</Text>
            <Text mb={3}>{translate('crm.review.source', { project: selected.project_name || '-', record: selected.source_record_id })}</Text>
            {(selected.candidates || []).map((candidate, index) => <Box key={index} borderWidth="1px" p={3} mb={3}>
              <Text fontWeight="bold">{(candidate.display_name || translate('crm.review.customer')) + ' — ' + candidateLabel(candidate)}</Text>
              <Text>{details(candidate, translate)}</Text>
              <Text>{candidate.reason} {candidate.score != null ? translate('crm.review.points', { n: candidate.score }) : ''}</Text>
            </Box>)}
            {!resolved && canWrite && <>
              <Select placeholder={translate('crm.review.selectMatch')} value={target} onChange={e => { setTarget(e.target.value); setManualPk(''); }} mb={3}>
                {(selected.candidates || []).map((candidate, index) => <option key={index} value={candidate.party_pk ? `party:${candidate.party_pk}` : `intake:${candidate.intake_id}`}>
                  {(candidate.display_name || translate('crm.review.match')) + ' — ' + (candidate.party_pk
                    ? translate('crm.review.customerNumber', { id: candidate.party_pk })
                    : translate('crm.review.pendingNumber', { id: candidate.intake_id }))}
                </option>)}
              </Select>
              {eshop && <Input placeholder={translate('crm.review.enterVerifiedPk')} value={manualPk} onChange={e => setManualPk(e.target.value)} />}
              <Text fontSize="sm" mt={3}>{translate('crm.review.resolveFirst')}</Text>
            </>}
          </>}
        </ModalBody>
        <ModalFooter><HStack>
          <Button onClick={() => setSelected(null)} isDisabled={busy}>{translate('Close')}</Button>
          {!resolved && canWrite && <>
            <Button isLoading={busy} onClick={() => decide(eshop ? 'REJECT' : 'NEW')}>
              {translate(eshop ? 'crm.review.rejectAssignment' : 'crm.review.registerAsNew')}
            </Button>
            <Button colorScheme="blue" isLoading={busy} isDisabled={!target && !manualPk} onClick={() => decide(eshop ? 'ASSIGN' : 'MERGE')}>
              {translate(eshop ? 'crm.review.assignIdentifier' : 'crm.review.mergeIntoSelected')}
            </Button>
          </>}
        </HStack></ModalFooter>
      </ModalContent>
    </Modal>
  </Box>;
}
