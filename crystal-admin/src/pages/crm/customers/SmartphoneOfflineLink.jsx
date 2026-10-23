import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, AlertIcon, Box, Button, FormControl, FormLabel, HStack, Input, Modal, ModalBody, ModalCloseButton, ModalContent,
  ModalFooter, ModalHeader, ModalOverlay, Progress, Radio, RadioGroup, SimpleGrid, Stack, Stat, StatLabel, StatNumber, Table, Tbody, Td, Text, Th,
  Thead, Tr, useToast
} from '@chakra-ui/react';

import { crm } from '../../../api';
import { useT } from '../../../i18n';
import { partyIdLabel } from '../shared/shared';
import { dateTime, formatPhone, number } from '../../../utils/format';

/* How often a running job is asked how far it got. */
const POLL_MS = 2000;

/**
 * CUSTOMERS LINKED TO THE SMARTPHONE_OFFLINE SYSTEM - every customer in one
 * click, or a range of customer numbers.
 *
 * The server looks each customer's phone numbers up in that system and links
 * the users it finds as the customer's accounts; numbers already linked are
 * skipped, so it can be run again safely. It is a JOB on the server: it goes
 * through the customers in chunks and keeps its progress, so closing this
 * dialog - or the server restarting - does not lose it, and opening the dialog
 * again picks the job back up. It can be paused, resumed and cancelled, and the
 * numbers it could not look up can be tried again.
 */
export default function SmartphoneOfflineLink({ isOpen, onClose, onLinked }) {
  const translate = useT();
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [scope, setScope] = useState('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [job, setJob] = useState(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  const stop = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  const follow = (jobId) => {
    stop();
    timer.current = setTimeout(async () => {
      try {
        const { data } = await crm.smartphoneOffline.job(jobId);
        setJob(data);
        if (data.status === 'RUNNING') follow(jobId);
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
        /* The job going on now, else the last one, so its result and its failures can still be seen. */
        setJob(data.active || data.last || null);
        if (data.active && data.active.status === 'RUNNING') follow(data.active.job_id);
      })
      .catch((error) => toast({ title: error.message, status: 'error', duration: 6000 }));
    return () => { live = false; stop(); };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (work) => {
    setBusy(true);
    try {
      const { data } = await work();
      setJob(data);
      if (data.status === 'RUNNING') follow(data.job_id); else stop();
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 8000, isClosable: true });
    } finally {
      setBusy(false);
    }
  };
  const start = () => act(() => crm.smartphoneOffline.startJob(scope === 'RANGE'
    ? { scope: 'RANGE', from_party_pk: from.trim(), to_party_pk: to.trim() } : { scope: 'ALL' }));
  const retry = () => act(() => crm.smartphoneOffline.startJob({ scope: 'RETRY', retry_of_job_id: job.job_id }));
  const control = (action) => act(() => crm.smartphoneOffline.jobAction(job.job_id, action));

  const active = job && (job.status === 'RUNNING' || job.status === 'PAUSED');
  const running = job && job.status === 'RUNNING';
  const blocked = !status || status.mode === 'off' || !status.project;
  const summary = job ? job.summary : null;
  const figures = summary ? [
    ['crm.customers.soFigureLinked', summary.linked], ['crm.customers.soFigureExisting', summary.existing],
    ['crm.customers.soFigureSkipped', summary.skipped], ['crm.customers.soFigureNotFound', summary.not_found],
    ['crm.customers.soFigureConflicts', summary.conflict_count], ['crm.customers.soFigureFailed', summary.failed_count]
  ] : [];

  /* How fast it goes and how long it has left, from when it started - a guide, longer after a pause. */
  const eta = () => {
    if (!running || !job.done || !job.started_at) return null;
    const minutes = (Date.now() - new Date(job.started_at).getTime()) / 60000;
    if (minutes <= 0) return null;
    const rate = job.done / minutes;
    return translate('crm.customers.soEta', { rate: number(Math.round(rate)), minutes: number(Math.max(1, Math.ceil((job.total - job.done) / rate))) });
  };
  const scopeLabel = (row) => (row.scope === 'RANGE' ? partyIdLabel(row.from_party_pk) + ' – ' + partyIdLabel(row.to_party_pk)
    : row.scope === 'RETRY' ? translate('crm.customers.soRetryOf', { id: row.retry_of_job_id }) : translate('crm.customers.soAllCustomers'));
  const stateLabel = (row) => {
    if (row.status === 'RUNNING') return translate('crm.customers.soProgress', { done: number(row.done), total: number(row.total) });
    if (row.status === 'PAUSED') return translate('crm.customers.soPaused', { done: number(row.done), total: number(row.total) });
    if (row.status === 'CANCELLED') return translate('crm.customers.soCancelled', { done: number(row.done), total: number(row.total) });
    if (row.status === 'FAILED') return translate('crm.customers.soFailed', { error: row.error || '' });
    return translate('crm.customers.soDone');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="3xl" returnFocusOnClose={false} preserveScrollBarGap>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{translate('crm.customers.soTitle')}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text fontSize="sm" mb={3}>{translate('crm.customers.soIntro')}</Text>
          {status && status.mode === 'mock' ? <Alert status="info" mb={3} fontSize="sm"><AlertIcon />{translate('crm.customers.soMock')}</Alert> : null}
          {status && status.mode === 'off' ? <Alert status="warning" mb={3} fontSize="sm"><AlertIcon />{translate('crm.customers.soOff')}</Alert> : null}
          {status && !status.project ? <Alert status="warning" mb={3} fontSize="sm"><AlertIcon />{translate('crm.customers.soNoProject', { code: status.project_code })}</Alert> : null}

          {/* A new job: every customer, or a range. Not while one is going on. */}
          {!active ? (
            <Box borderWidth="1px" borderRadius="md" p={3} mb={4}>
              <RadioGroup value={scope} onChange={setScope} mb={scope === 'RANGE' ? 3 : 0}>
                <Stack direction={{ base: 'column', md: 'row' }} spacing={5}>
                  <Radio value="ALL"><Text fontSize="sm">{translate('crm.customers.soAllCustomers')}</Text></Radio>
                  <Radio value="RANGE"><Text fontSize="sm">{translate('crm.customers.soARange')}</Text></Radio>
                </Stack>
              </RadioGroup>
              {scope === 'RANGE' ? (
                <HStack spacing={3} align="flex-end">
                  <FormControl>
                    <FormLabel fontSize="sm">{translate('crm.customers.soFrom')}</FormLabel>
                    <Input size="sm" inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value.replace(/\D/g, ''))} />
                  </FormControl>
                  <FormControl>
                    <FormLabel fontSize="sm">{translate('crm.customers.soTo')}</FormLabel>
                    <Input size="sm" inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, ''))} />
                  </FormControl>
                </HStack>
              ) : null}
              <HStack justify="flex-end" mt={3}>
                <Button size="sm" variant="brand" isLoading={busy} isDisabled={blocked || (scope === 'RANGE' && (!from || !to))} onClick={start}>
                  {translate(scope === 'RANGE' ? 'crm.customers.soStart' : 'crm.customers.soStartAll')}
                </Button>
              </HStack>
            </Box>
          ) : null}

          {job ? (
            <Box>
              <HStack justify="space-between" fontSize="sm" mb={1} wrap="wrap">
                <Text fontWeight="600">
                  {active ? scopeLabel(job) : translate('crm.customers.soLastJob', { scope: scopeLabel(job), date: dateTime(job.finished_at || job.updated_at) })}
                </Text>
                <Text color={job.status === 'FAILED' ? 'red.500' : undefined}>{stateLabel(job)}</Text>
              </HStack>
              <Progress size="sm" borderRadius="md" value={job.total ? (job.done * 100) / job.total : 0} isAnimated={running} hasStripe={running} mb={1} />
              <HStack justify="space-between" fontSize="xs" color="gray.500" mb={4}>
                <Text>{eta() || ''}</Text>
                {active ? (
                  <HStack spacing={2}>
                    {running ? <Button size="xs" variant="outline" isLoading={busy} onClick={() => control('pause')}>{translate('crm.customers.soPause')}</Button>
                      : <Button size="xs" variant="outline" isLoading={busy} onClick={() => control('resume')}>{translate('crm.customers.soResume')}</Button>}
                    <Button size="xs" variant="ghost" colorScheme="red" isLoading={busy} onClick={() => control('cancel')}>{translate('crm.customers.soCancel')}</Button>
                  </HStack>
                ) : null}
              </HStack>
              <SimpleGrid columns={{ base: 3, md: 6 }} spacing={3} mb={4}>
                {figures.map(([label, value]) => (
                  <Stat key={label} size="sm"><StatLabel>{translate(label)}</StatLabel><StatNumber fontSize="lg">{number(value || 0)}</StatNumber></Stat>
                ))}
              </SimpleGrid>
              {!active && summary.failed_count ? (
                <Alert status="warning" mb={4} fontSize="sm" borderRadius="md">
                  <AlertIcon />
                  <Box flex="1">{translate('crm.customers.soFailedNumbers', { n: number(summary.failed_count) })}</Box>
                  <Button size="xs" variant="outline" isLoading={busy} isDisabled={blocked} onClick={retry}>{translate('crm.customers.soRetryFailed')}</Button>
                </Alert>
              ) : null}
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
