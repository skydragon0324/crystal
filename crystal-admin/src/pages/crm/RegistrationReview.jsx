import React, { useState } from 'react';
import { Box, Button, HStack, Input, Modal, ModalBody, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalOverlay, Select, Text, useToast } from '@chakra-ui/react';
import DataTable from '../../components/DataTable';
import useList from '../../hooks/useList';
import usePermission from '../../hooks/usePermission';
import { crm } from '../../api';
import { dateTime } from '../../utils/format';

function details(person) {
  return [person.full_name || person.display_name, person.mobile,
    ...(person.contacts || []).map(c => c.contact_value), person.birth_date,
    person.address_line, person.home_location_pk && `Location: ${person.home_location_pk}`,
    person.job_title_id && `Occupation: ${person.job_title_id}`].filter(Boolean).join(' · ');
}
export default function RegistrationReview({ category, resolved, onDecided }) {
  const list = useList(params => crm.parties.registrations(params), { page: 1, limit: 20, category, status: resolved ? 'RESOLVED' : 'PENDING' });
  const { canWrite } = usePermission('/admin/crm/customers');
  const toast = useToast();
  const [selected, setSelected] = useState(null);
  const [target, setTarget] = useState('');
  const [manualPk, setManualPk] = useState('');
  const [busy, setBusy] = useState(false);
  const decide = async action => {
    setBusy(true);
    try {
      const [kind, id] = target.split(':');
      const payload = { action, party_pk: manualPk || (kind === 'party' ? id : undefined), candidate_intake_id: !manualPk && kind === 'intake' ? id : undefined };
      await crm.parties.decideRegistration(selected.intake_id, payload);
      setSelected(null); list.reload();
      if (onDecided) onDecided();
      toast({ title: 'Decision saved', status: 'success', duration: 3000 });
    } catch (error) { toast({ title: error.message, status: 'error', duration: 6000 }); }
    finally { setBusy(false); }
  };
  return <Box px={4}>
    <Text fontSize="sm" mb={4}>{resolved ? 'Resolved identities are available to the originating department through the identity resolution feed.' : category === 'ESHOP' ? 'These e-shop identifiers are candidates. Assign an identifier to a customer only after verifying it.' : 'No customer has been created for these registrations. Phone +40, name +25, birthday +25, home address +15, occupation +5. Scores 41–69 require review; conflicting strong matches also remain here.'}</Text>
    <DataTable columns={[
      { key: 'intake_id', label: 'Registration' },
      { key: 'name', label: 'Person', render: row => (row.payload.party || {}).full_name || (row.payload.party || {}).display_name || '-' },
      { key: 'project_name', label: 'Source project' },
      { key: 'source_record_id', label: 'Source record' },
      { key: 'score', label: 'Best score', render: row => Math.max(0, ...(row.candidates || []).map(c => c.score || 0)) },
      { key: 'status', label: 'Status' },
      { key: 'party_pk', label: 'Customer key' },
      { key: 'created_at', label: 'Received', render: row => dateTime(row.created_at) }
    ]} rows={list.rows} loading={list.loading} page={list.params.page} limit={list.params.limit} total={list.total}
      onPageChange={list.setPage} onLimitChange={limit => list.setFilter({ limit })} rowKey={row => row.intake_id}
      onRowClick={row => { setSelected(row); setTarget(''); setManualPk(''); }} />
    <Modal isOpen={!!selected} onClose={() => !busy && setSelected(null)} size="3xl">
      <ModalOverlay /><ModalContent><ModalHeader>Review registration</ModalHeader><ModalCloseButton isDisabled={busy} />
        <ModalBody>
          {selected && <>
            <Text fontWeight="bold">Incoming person</Text><Text mb={4}>{details(selected.payload.party || {}) || 'No person details supplied'}</Text>
            <Text mb={3}>Source: {selected.project_name} / {selected.source_record_id}</Text>
            {(selected.candidates || []).map((candidate, index) => <Box key={index} borderWidth="1px" p={3} mb={3}>
              <Text fontWeight="bold">{candidate.display_name || 'Customer'} — {candidate.party_pk ? `Customer #${candidate.party_pk}` : `Pending registration #${candidate.intake_id}`}</Text>
              <Text>{details(candidate)}</Text><Text>{candidate.reason} {candidate.score != null ? `(${candidate.score} points)` : ''}</Text>
            </Box>)}
            {!resolved && canWrite && <>
              <Select placeholder="Select a matching customer or registration" value={target} onChange={e => { setTarget(e.target.value); setManualPk(''); }} mb={3}>
                {(selected.candidates || []).map((candidate, index) => <option key={index} value={candidate.party_pk ? `party:${candidate.party_pk}` : `intake:${candidate.intake_id}`}>
                  {candidate.display_name || 'Match'} — {candidate.party_pk ? `Customer #${candidate.party_pk}` : `Pending #${candidate.intake_id}`}
                </option>)}
              </Select>
              {category === 'ESHOP' && <Input placeholder="Or enter the verified customer's party_pk" value={manualPk} onChange={e => setManualPk(e.target.value)} />}
              <Text fontSize="sm" mt={3}>Resolve a matching pending registration before merging into it. Register as new only after reviewing all candidates.</Text>
            </>}
          </>}
        </ModalBody>
        <ModalFooter><HStack>
          <Button onClick={() => setSelected(null)} isDisabled={busy}>Close</Button>
          {!resolved && canWrite && <>
            <Button isLoading={busy} onClick={() => decide(category === 'ESHOP' ? 'REJECT' : 'NEW')}>{category === 'ESHOP' ? 'Reject assignment' : 'Register as new'}</Button>
            <Button colorScheme="blue" isLoading={busy} isDisabled={!target && !manualPk} onClick={() => decide(category === 'ESHOP' ? 'ASSIGN' : 'MERGE')}>{category === 'ESHOP' ? 'Assign identifier' : 'Merge into selected'}</Button>
          </>}
        </HStack></ModalFooter>
      </ModalContent>
    </Modal>
  </Box>;
}
