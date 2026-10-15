import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, AlertIcon, Box, Button, FormControl, FormLabel, HStack, Input, Modal, ModalBody, ModalCloseButton, ModalContent,
  ModalFooter, ModalHeader, ModalOverlay, Progress, SimpleGrid, Stat, StatLabel, StatNumber, Table, Tbody, Td, Text, Th, Thead, Tr, useToast
} from '@chakra-ui/react';

import { crm } from '../../api';
import { useT } from '../../i18n';
import { partyIdLabel } from './shared';
import { formatPhone } from '../../utils/format';

/* How often a running link is asked how far it got. */
const POLL_MS = 1500;

/**
 * CUSTOMERS LINKED TO THE SMARTPHONE_OFFLINE SYSTEM, a range of customer numbers
 * at a time.
 *
 * The server looks each customer's phone numbers up in that system and links
 * the users it finds as the customer's accounts; numbers already linked are
 * skipped, so a range can be run again safely. A run goes on in the
 * background - this dialog only starts it and follows it, and closing the
 * dialog does not stop it: opening it again picks the running one back up.
 */
export default function SmartphoneOfflineLink({ isOpen, onClose, onLinked }) {
  const translate = useT();
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [run, setRun] = useState(null);
  const [starting, setStarting] = useState(false);
  const timer = useRef(null);

  const stop = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  const follow = (runId) => {
    stop();
    timer.current = setTimeout(async () => {
      try {
        const { data } = await crm.smartphoneOffline.run(runId);
        setRun(data);
        if (data.status === 'RUNNING') follow(runId);
        else if (onLinked) onLinked();
      } catch (error) {
        toast({ title: error.message, status: 'error', duration: 6000 });
      }
    }, POLL_MS);
  };

  useEffect(() => {
    if (!isOpen) { stop(); return undefined; }
    let live = true;
    crm.smartphoneOffline.status()
      .then(({ data }) => {
        if (!live) return;
        setStatus(data);
        if (data.running) { setRun(data.running); follow(data.running.run_id); }
      })
      .catch((error) => toast({ title: error.message, status: 'error', duration: 6000 }));
    return () => { live = false; stop(); };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    setStarting(true);
    try {
      const { data } = await crm.smartphoneOffline.startRun(from.trim(), to.trim());
      setRun(data);
      follow(data.run_id);
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 8000, isClosable: true });
    } finally {
      setStarting(false);
    }
  };

  const running = run && run.status === 'RUNNING';
  const blocked = !status || status.mode === 'off' || !status.project;
  const summary = run ? run.summary : null;
  const figures = summary ? [
    ['crm.customers.soFigureLinked', summary.linked], ['crm.customers.soFigureExisting', summary.existing],
    ['crm.customers.soFigureSkipped', summary.skipped], ['crm.customers.soFigureNotFound', summary.not_found],
    ['crm.customers.soFigureConflicts', summary.conflict_count], ['crm.customers.soFigureFailed', summary.failed_count]
  ] : [];

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="3xl" returnFocusOnClose={false} preserveScrollBarGap>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{translate('crm.customers.soTitle')}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text fontSize="sm" mb={3}>{translate('crm.customers.soIntro', { max: status ? status.max_run : 1000 })}</Text>
          {status && status.mode === 'mock' ? <Alert status="info" mb={3} fontSize="sm"><AlertIcon />{translate('crm.customers.soMock')}</Alert> : null}
          {status && status.mode === 'off' ? <Alert status="warning" mb={3} fontSize="sm"><AlertIcon />{translate('crm.customers.soOff')}</Alert> : null}
          {status && !status.project ? <Alert status="warning" mb={3} fontSize="sm"><AlertIcon />{translate('crm.customers.soNoProject', { code: status.project_code })}</Alert> : null}

          <HStack spacing={3} align="flex-end" mb={4}>
            <FormControl>
              <FormLabel fontSize="sm">{translate('crm.customers.soFrom')}</FormLabel>
              <Input size="sm" inputMode="numeric" value={from} isDisabled={running} onChange={(e) => setFrom(e.target.value.replace(/\D/g, ''))} />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="sm">{translate('crm.customers.soTo')}</FormLabel>
              <Input size="sm" inputMode="numeric" value={to} isDisabled={running} onChange={(e) => setTo(e.target.value.replace(/\D/g, ''))} />
            </FormControl>
            <Button size="sm" variant="brand" flexShrink={0} isLoading={starting} isDisabled={blocked || running || !from || !to} onClick={start}>
              {translate('crm.customers.soStart')}
            </Button>
          </HStack>

          {run ? (
            <Box>
              <HStack justify="space-between" fontSize="sm" mb={1}>
                <Text>{partyIdLabel(run.from_party_pk)} – {partyIdLabel(run.to_party_pk)}</Text>
                <Text color={run.status === 'FAILED' ? 'red.500' : undefined}>
                  {run.status === 'RUNNING' ? translate('crm.customers.soProgress', { done: run.done, total: run.total })
                    : run.status === 'FAILED' ? translate('crm.customers.soFailed', { error: run.error || '' }) : translate('crm.customers.soDone')}
                </Text>
              </HStack>
              <Progress size="sm" borderRadius="md" value={run.total ? (run.done * 100) / run.total : 0} isAnimated={running} hasStripe={running} mb={4} />
              <SimpleGrid columns={{ base: 3, md: 6 }} spacing={3} mb={4}>
                {figures.map(([label, value]) => (
                  <Stat key={label} size="sm"><StatLabel>{translate(label)}</StatLabel><StatNumber fontSize="lg">{value || 0}</StatNumber></Stat>
                ))}
              </SimpleGrid>
              {summary.conflicts.length ? (
                <Box mb={4}>
                  <Text fontWeight="600" fontSize="sm" mb={1}>{translate('crm.customers.soConflicts')}</Text>
                  <Table size="sm">
                    <Thead><Tr><Th>{translate('Customer')}</Th><Th>{translate('Phone')}</Th><Th>{translate('Account ID')}</Th><Th>{translate('crm.customers.soLinkedTo')}</Th></Tr></Thead>
                    <Tbody>
                      {summary.conflicts.map((row, index) => (
                        <Tr key={index}>
                          <Td>{partyIdLabel(row.party_pk)}</Td><Td>{formatPhone(row.phone)}</Td><Td>{row.user_id}</Td>
                          <Td>{row.linked_party_pk ? partyIdLabel(row.linked_party_pk) : '-'}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </Box>
              ) : null}
              {summary.failed.length ? (
                <Box>
                  <Text fontWeight="600" fontSize="sm" mb={1}>{translate('crm.customers.soFailures')}</Text>
                  <Table size="sm">
                    <Thead><Tr><Th>{translate('Customer')}</Th><Th>{translate('Phone')}</Th><Th>{translate('crm.customers.soError')}</Th></Tr></Thead>
                    <Tbody>
                      {summary.failed.map((row, index) => (
                        <Tr key={index}><Td>{partyIdLabel(row.party_pk)}</Td><Td>{formatPhone(row.phone)}</Td><Td>{row.error}</Td></Tr>
                      ))}
                    </Tbody>
                  </Table>
                </Box>
              ) : null}
            </Box>
          ) : null}
        </ModalBody>
        <ModalFooter>
          <Button size="sm" variant="ghost" onClick={onClose}>{translate('Close')}</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
