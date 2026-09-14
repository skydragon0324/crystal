import React, { useCallback, useEffect, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import {
  Box, Button, Center, Divider, Flex, Grid, HStack, IconButton, Menu, MenuButton,
  MenuItem, MenuList, SimpleGrid, Spinner, Stack, Text, Textarea, useDisclosure,
  useToast, useColorModeValue
} from '@chakra-ui/react';
import { AddIcon, ArrowBackIcon, ChevronDownIcon, DeleteIcon } from '@chakra-ui/icons';

import Card from '../../components/Card';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import FormModal from '../../components/FormModal';
import ConfirmDialog from '../../components/ConfirmDialog';

import useOptions from '../../hooks/useOptions';
import usePermission from '../../hooks/usePermission';
import { parts, servicePrices, technicians, tickets } from '../../api';
import { useT } from '../../i18n';
import { dateTime, money } from '../../utils/format';

const PAGE = '/admin/service/tickets';

/**
 * One repair, and everything anybody standing at the counter needs.
 *
 * The screen is arranged around the two questions asked about a ticket: what
 * is wrong with it, and what does the customer owe.  The workflow buttons are
 * driven by the transition map the API sends - the console never offers a
 * move the server would refuse, because it is reading the same table the
 * server enforces.
 */
export default function TicketDetail() {
  const t = useT();
  const toast = useToast();
  const history = useHistory();
  const { id } = useParams();
  const { canWrite } = usePermission(PAGE);

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const lineForm = useDisclosure();
  const removeLine = useDisclosure();
  const [target, setTarget] = useState(null);

  const { options: meta } = useOptions(() => tickets.meta(), []);
  const codes = Array.isArray(meta) ? {} : (meta || {});
  const statusMap = codes.status || {};
  const flow = codes.flow || {};

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await tickets.get(id);
      setDetail(data);
    } catch (err) {
      toast({ status: 'error', description: err.message, duration: 6000 });
      setDetail(null);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const ticket = detail && detail.ticket;

  const { options: bench } = useOptions(
    () => (ticket ? technicians.options({ agency_id: ticket.agency_id }) : Promise.resolve({ data: [] })),
    [ticket && ticket.agency_id]
  );
  const { options: priceList } = useOptions(
    () => (ticket && ticket.product_id
      ? servicePrices.list({ product_id: ticket.product_id, limit: 100 })
      : Promise.resolve({ data: { rows: [] } })),
    [ticket && ticket.product_id]
  );
  const { options: partList } = useOptions(() => parts.options(), []);

  const run = async (action, success) => {
    setBusy(true);
    try {
      await action();
      toast({ status: 'success', description: t(success), duration: 2500 });
      setNote('');
      await load();
    } catch (err) {
      toast({ status: 'error', description: err.message, duration: 7000 });
    } finally {
      setBusy(false);
    }
  };

  /**
   * Quoting a job straight off the published price list.
   *
   * Two lines rather than one, because a repair is a part and the work of
   * fitting it and the warranty can cover them separately - a plan that pays
   * for parts and not labour is a real plan, and one merged line could not
   * express it.
   *
   * The name and the price are COPIED onto the ticket rather than joined to
   * the list, so a repriced list next month does not silently rewrite what
   * this customer was quoted today.
   */
  const quote = async (line) => {
    await run(async () => {
      if (Number(line.part_price) > 0) {
        await tickets.addItem(ticket.id, {
          item_type: 'PART',
          part_id: line.part_id || null,
          service_price_id: line.id,
          name: line.name + ' - ' + t('service.ticketdetail.part'),
          quantity: 1,
          unit_price: line.part_price
        });
      }

      if (Number(line.service_price) > 0) {
        await tickets.addItem(ticket.id, {
          item_type: 'LABOUR',
          service_price_id: line.id,
          name: line.name + ' - ' + t('service.ticketdetail.labour'),
          quantity: 1,
          unit_price: line.service_price,
          labour_minutes: line.labour_minutes
        });
      }
    }, 'Created');
  };

  if (loading) return <Center py={20}><Spinner size="lg" thickness="3px" color="brand.500" /></Center>;
  if (!ticket) return <Card><Text fontSize="sm">{t('service.ticketdetail.ticketNotFound')}</Text></Card>;

  const next = (flow[ticket.status] || []).map((code) => ({
    code, label: statusMap[code] || String(code)
  }));

  return (
    <Box>
      <Flex align="center" gap={3} data-gap="12" data-gap-wrap mb={5} wrap="wrap">
        <IconButton
          aria-label={t('common.back')} icon={<ArrowBackIcon />} size="sm" variant="ghost"
          onClick={() => history.push(PAGE)}
        />
        <Text fontSize="lg" fontWeight="700" fontFamily="mono">{ticket.ticket_no}</Text>
        <StatusBadge kind="ticket" value={ticket.status} label={statusMap[ticket.status]} />
        {ticket.is_overdue && <StatusBadge value="OVERDUE" label={t('common.overdue')} />}
        <StatusBadge
          value={ticket.is_warranty ? 'ACTIVE' : 'CLOSED'}
          label={t(ticket.is_warranty ? 'Under warranty' : 'Chargeable')}
        />

        <HStack ml="auto" spacing={2}>
          {canWrite && next.length > 0 && (
            <Menu placement="bottom-end">
              <MenuButton
                as={Button} size="sm" colorScheme="brand" rightIcon={<ChevronDownIcon />}
                isLoading={busy}
              >
                {t('common.moveTo')}
              </MenuButton>
              <MenuList fontSize="sm">
                {next.map((option) => (
                  <MenuItem
                    key={option.code}
                    onClick={() => run(
                      () => tickets.transition(ticket.id, option.code, note || undefined),
                      'Saved'
                    )}
                  >
                    {option.label}
                  </MenuItem>
                ))}
              </MenuList>
            </Menu>
          )}

          {canWrite && ticket.status < 7 && Number(ticket.total_amount) > 0 && ticket.pay_state !== 2 && (
            <Button
              size="sm" variant="outline" isLoading={busy}
              onClick={() => run(() => tickets.pay(ticket.id, { pay_method: 0 }), 'Saved')}
            >
              {t('service.ticketdetail.takePayment')}
            </Button>
          )}
        </HStack>
      </Flex>

      <Grid templateColumns={{ base: '1fr', xl: '2fr 1fr' }} gap={5}>
        <Stack spacing={5}>
          <Card title={t('service.ticketdetail.theDeviceAndTheFault')}>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              <Field label="Customer" value={ticket.customer_name} hint={ticket.customer_phone} />
              <Field label="Device" value={ticket.product_name} hint={ticket.serial_number} mono />
              <Field label="Service centre" value={ticket.agency_name} hint={ticket.agency_city} />
              <Field
                label="Technician"
                value={ticket.technician_name || t('service.ticketdetail.noTechnicianIsAssigned')}
                action={canWrite && ticket.status < 7 ? (
                  <AssignMenu
                    bench={bench}
                    onPick={(techId) => run(() => tickets.assign(ticket.id, techId), 'Saved')}
                  />
                ) : null}
              />
              <Field label="Symptom" value={ticket.symptom_name} hint={ticket.component} />
              <Field
                label="Cover"
                value={ticket.warranty_no || t('service.ticketdetail.chargeable')}
                hint={ticket.warranty_note}
              />
              <Field label="Received" value={dateTime(ticket.received_at)} />
              <Field
                label="Promised"
                value={dateTime(ticket.promised_at)}
                tone={ticket.is_overdue ? 'critical' : undefined}
              />
            </SimpleGrid>

            <Divider my={4} />

            <Field label="What the customer reports" value={ticket.fault_description} block />
            {ticket.diagnosis && <Field label="Diagnosis" value={ticket.diagnosis} block mt={3} />}
            {ticket.resolution && <Field label="Resolution" value={ticket.resolution} block mt={3} />}
          </Card>

          <Bill
            detail={detail}
            canWrite={canWrite && ticket.status < 7}
            busy={busy}
            priceList={priceList}
            onAdd={() => { setTarget(null); lineForm.onOpen(); }}
            onQuote={quote}
            onIssue={(item) => run(() => tickets.issueItem(ticket.id, item.id), 'Saved')}
            onRemove={(item) => { setTarget(item); removeLine.onOpen(); }}
          />

          <DeviceHistory rows={detail.device_history} onOpen={(row) => history.push(PAGE + '/' + row.id)} />
        </Stack>

        <Stack spacing={5}>
          <Money ticket={ticket} codes={codes} />

          {canWrite && ticket.status < 7 && (
            <Card title={t('service.ticketdetail.addANoteToThe')}>
              <Textarea
                size="sm" rows={3} value={note}
                placeholder={t('service.ticketdetail.optionalShownOnTheTimeline')}
                onChange={(event) => setNote(event.target.value)}
              />
            </Card>
          )}

          <Timeline rows={detail.events} statusMap={statusMap} />
        </Stack>
      </Grid>

      <FormModal
        isOpen={lineForm.isOpen}
        onClose={lineForm.onClose}
        isLoading={busy}
        title={t('service.ticketdetail.addALineToThe')}
        onSubmit={(payload) => {
          lineForm.onClose();
          return run(() => tickets.addItem(ticket.id, payload), 'Created');
        }}
        fields={[
          {
            name: 'item_type', label: 'Type', type: 'select', required: true,
            options: [
              { value: 'PART', label: 'Part' },
              { value: 'LABOUR', label: 'Labour' },
              { value: 'FEE', label: 'Fee' }
            ]
          },
          {
            name: 'part_id', label: 'Part', type: 'select',
            options: partList.map((part) => ({
              value: part.id, label: part.part_no + ' - ' + part.name
            }))
          },
          { name: 'name', label: 'Description', required: true, span: 2 },
          { name: 'quantity', label: 'Quantity', type: 'number', required: true },
          { name: 'unit_price', label: 'Unit price', type: 'number', step: '0.01', required: true },
          { name: 'labour_minutes', label: 'Bench minutes', type: 'number' },
          {
            name: 'is_covered', label: 'On the warranty', type: 'checkbox',
            help: 'the warranty pays for this line'
          }
        ]}
        initial={{ item_type: 'PART', quantity: 1, is_covered: ticket.is_warranty }}
      />

      <ConfirmDialog
        isOpen={removeLine.isOpen}
        onClose={removeLine.onClose}
        isLoading={busy}
        title={t('service.ticketdetail.removeThisLine')}
        confirmText={t('common.delete')}
        body={target && target.issued
          ? t('service.ticketdetail.thisPartHasAlreadyBeen')
          : t('service.ticketdetail.thisLineWillBeRemoved')}
        onConfirm={() => {
          removeLine.onClose();
          return run(() => tickets.removeItem(ticket.id, target.id), 'Deleted');
        }}
      />
    </Box>
  );
}

/** One labelled value. Used enough times on this page to be worth naming. */
function Field({ label, value, hint, mono, block, tone, action, ...rest }) {
  const t = useT();
  const muted = useColorModeValue('gray.500', 'gray.400');
  const critical = useColorModeValue('red.500', 'red.300');

  return (
    <Box {...rest}>
      <Flex align="center" gap={2} data-gap="8">
        <Text fontSize="0.66rem" color={muted} textTransform="uppercase" letterSpacing="0.05em">
          {t(label)}
        </Text>
        {action}
      </Flex>
      <Text
        fontSize={block ? 'sm' : 'sm'}
        fontFamily={mono ? 'mono' : undefined}
        color={tone === 'critical' ? critical : undefined}
        whiteSpace={block ? 'pre-wrap' : undefined}
        mt="2px"
      >
        {value || '-'}
      </Text>
      {hint && <Text fontSize="0.68rem" color={muted}>{hint}</Text>}
    </Box>
  );
}

/** Who to give the job to - ordered by skill, then by who has least on. */
function AssignMenu({ bench, onPick }) {
  const t = useT();
  return (
    <Menu placement="bottom-start">
      <MenuButton as={Button} size="xs" variant="ghost" rightIcon={<ChevronDownIcon />}>
        {t('service.ticketdetail.assign')}
      </MenuButton>
      <MenuList fontSize="sm" maxH="16.25rem" overflowY="auto">
        {bench.map((technician) => (
          <MenuItem key={technician.id} onClick={() => onPick(technician.id)}>
            {t('service.ticketdetail.nameAndGrade', { name: technician.name, grade: technician.grade })}
          </MenuItem>
        ))}
        {!bench.length && <MenuItem isDisabled>{t('table.emptyBrief')}</MenuItem>}
      </MenuList>
    </Menu>
  );
}

/**
 * The bill.
 *
 * `issued` is the column that matters: a part line reserves stock when it is
 * added and only consumes it when somebody presses Issue, so a line that is
 * on the bill and not yet issued is a promise rather than a movement.  The
 * ticket cannot be closed while any of them are still promises.
 */
function Bill({ detail, canWrite, busy, priceList, onAdd, onQuote, onIssue, onRemove }) {
  const t = useT();

  const columns = [
    { key: 'name', label: 'Description', maxW: '16.25rem', wrap: true },
    {
      key: 'item_type', label: 'Type',
      render: (row) => <Text fontSize="xs">{t(row.item_type)}</Text>
    },
    { key: 'quantity', label: 'Qty', isNumeric: true },
    {
      key: 'unit_price', label: 'Unit price', isNumeric: true,
      render: (row) => money(row.unit_price)
    },
    {
      key: 'amount', label: 'Amount', isNumeric: true,
      render: (row) => (
        <Text fontSize="xs" fontWeight="600" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {money(row.amount)}
        </Text>
      )
    },
    {
      key: 'is_covered', label: 'Paid by',
      render: (row) => (
        <StatusBadge
          value={row.is_covered ? 'ACTIVE' : 'CLOSED'}
          label={t(row.is_covered ? 'Warranty' : 'Customer')}
        />
      )
    },
    {
      key: 'issued', label: 'Stock',
      render: (row) => {
        if (row.item_type !== 'PART' || !row.part_id) return <Text fontSize="xs">-</Text>;
        return (
          <StatusBadge
            value={row.issued ? 'OK' : 'LOW'}
            label={t(row.issued ? 'Issued' : 'Reserved')}
          />
        );
      }
    }
  ];

  if (canWrite) {
    columns.push({
      key: '__actions', label: 'Actions', sortable: false, align: 'right', width: '8.125rem',
      render: (row) => (
        <HStack spacing={1} justify="flex-end">
          {row.item_type === 'PART' && row.part_id && !row.issued && (
            <Button size="xs" variant="ghost" isDisabled={busy} onClick={() => onIssue(row)}>
              {t('service.ticketdetail.issuePart')}
            </Button>
          )}
          <IconButton
            aria-label={t('common.delete')} icon={<DeleteIcon />} size="xs" variant="ghost"
            colorScheme="red" isDisabled={busy} onClick={() => onRemove(row)}
          />
        </HStack>
      )
    });
  }

  return (
    <Card
      title={t('service.ticketdetail.theBill')}
      bodyProps={false}
      actions={canWrite && (
        <HStack spacing={2}>
          {priceList && priceList.length > 0 && (
            <Menu placement="bottom-end">
              <MenuButton as={Button} size="xs" variant="outline" rightIcon={<ChevronDownIcon />}>
                {t('service.ticketdetail.quoteFromThePriceList')}
              </MenuButton>
              <MenuList fontSize="sm" maxH="18.75rem" overflowY="auto">
                {priceList.map((line) => (
                  <MenuItem key={line.id} isDisabled={busy} onClick={() => onQuote(line)}>
                    {line.name}
                    <Text as="span" ml={2} color="gray.500" fontSize="xs">
                      {money(Number(line.part_price) + Number(line.service_price))}
                    </Text>
                  </MenuItem>
                ))}
              </MenuList>
            </Menu>
          )}

          <Button size="xs" leftIcon={<AddIcon boxSize="0.6em" />} onClick={onAdd}>
            {t('service.ticketdetail.addALine')}
          </Button>
        </HStack>
      )}
    >
      <DataTable columns={columns} rows={detail.items} emptyText={t('service.ticketdetail.nothingHasBeenChargedYet')} />
    </Card>
  );
}

/**
 * What the repair cost, and who is paying which half.
 *
 * `covered_amount` is not part of the customer's total - it is what the
 * service centre will claim back from head office - so the two are shown as
 * separate lines rather than added together.
 */
function Money({ ticket, codes }) {
  const t = useT();
  const muted = useColorModeValue('gray.500', 'gray.400');

  const rows = [
    ['Parts', ticket.parts_amount],
    ['Labour', ticket.labour_amount],
    ['Discount', ticket.discount_amount]
  ];

  return (
    <Card title={t('service.ticketdetail.money')}>
      <Stack spacing={2}>
        {rows.map(([label, value]) => (
          <Flex key={label} justify="space-between" fontSize="sm">
            <Text color={muted}>{t(label)}</Text>
            <Text style={{ fontVariantNumeric: 'tabular-nums' }}>{money(value)}</Text>
          </Flex>
        ))}

        <Divider />

        <Flex justify="space-between" fontSize="sm" fontWeight="700">
          <Text>{t('service.ticketdetail.customerPays')}</Text>
          <Text style={{ fontVariantNumeric: 'tabular-nums' }}>
            {money(ticket.total_amount, ticket.currency)}
          </Text>
        </Flex>

        <Flex justify="space-between" fontSize="sm">
          <Text color={muted}>{t('service.ticketdetail.covered')}</Text>
          <Text style={{ fontVariantNumeric: 'tabular-nums' }}>
            {money(ticket.covered_amount, ticket.currency)}
          </Text>
        </Flex>

        <Flex justify="space-between" align="center" pt={1}>
          <Text fontSize="xs" color={muted}>{t('service.ticketdetail.payment')}</Text>
          <StatusBadge
            kind="pay"
            value={ticket.pay_state}
            label={(codes.pay_state || {})[ticket.pay_state] || String(ticket.pay_state)}
          />
        </Flex>

        {ticket.rating && (
          <Flex justify="space-between" align="center">
            <Text fontSize="xs" color={muted}>{t('service.ticketdetail.rating')}</Text>
            <Text fontSize="sm" fontWeight="600">{ticket.rating} / 5</Text>
          </Flex>
        )}
      </Stack>
    </Card>
  );
}

/**
 * The ticket's history, oldest first.
 *
 * Every status change writes one of these, which is what lets turnaround be
 * measured between two recorded moments rather than guessed from the row's
 * current state - and what lets a customer be told where their device is.
 */
function Timeline({ rows, statusMap }) {
  const t = useT();
  const muted = useColorModeValue('gray.500', 'gray.400');
  const line = useColorModeValue('gray.200', 'gray.600');

  return (
    <Card title={t('service.ticketdetail.timeline')}>
      <Stack spacing={0}>
        {rows.map((event, index) => (
          <Flex key={event.id} gap={3} data-gap="12">
            <Flex direction="column" align="center" flexShrink={0}>
              <Box w="0.5rem" h="0.5rem" borderRadius="full" bg="brand.400" mt="0.375rem" />
              {index < rows.length - 1 && <Box flex="1" w="1px" bg={line} />}
            </Flex>

            <Box pb={4} flex="1">
              <Flex align="center" gap={2} data-gap="8" data-gap-wrap wrap="wrap">
                <Text fontSize="sm" fontWeight="600">
                  {event.to_status !== null && event.to_status !== undefined
                    ? (statusMap[event.to_status] || event.action)
                    : t(event.action)}
                </Text>
                {event.is_public && <StatusBadge value="OK" label={t('service.ticketdetail.shownToTheCustomer')} />}
              </Flex>

              {event.note && <Text fontSize="xs" mt="2px">{event.note}</Text>}

              <Text fontSize="0.68rem" color={muted} mt="2px">
                {dateTime(event.created_at)}
                {event.manager_name ? ' - ' + event.manager_name : ''}
                {event.technician_name ? ' - ' + event.technician_name : ''}
              </Text>
            </Box>
          </Flex>
        ))}

        {!rows.length && <Text fontSize="sm" color={muted}>{t('table.emptyBrief')}</Text>}
      </Stack>
    </Card>
  );
}

/**
 * Every other time this device has been in.
 *
 * The reason this panel exists: a device that keeps coming back is the single
 * most useful thing to know before quoting the next repair, and it is invisible
 * on a screen that only shows the ticket in front of you.
 */
function DeviceHistory({ rows, onOpen }) {
  const t = useT();

  const columns = [
    {
      key: 'ticket_no', label: 'Ticket',
      render: (row) => <Text fontFamily="mono" fontSize="xs">{row.ticket_no}</Text>
    },
    { key: 'symptom_name', label: 'Symptom', maxW: '10.625rem' },
    { key: 'agency_name', label: 'Service centre', maxW: '9.375rem' },
    {
      key: 'is_warranty', label: 'Cover',
      render: (row) => (
        <StatusBadge
          value={row.is_warranty ? 'ACTIVE' : 'CLOSED'}
          label={t(row.is_warranty ? 'Under warranty' : 'Chargeable')}
        />
      )
    },
    {
      key: 'total_amount', label: 'Amount', isNumeric: true,
      render: (row) => money(row.total_amount)
    },
    {
      key: 'received_at', label: 'Received', isNumeric: true,
      render: (row) => dateTime(row.received_at)
    }
  ];

  if (!rows.length) return null;

  return (
    <Card
      title={t('service.ticketdetail.thisDeviceHasBeenIn')}
      subtitle={t('service.ticketdetail.earlierVisits', { n: rows.length })}
      bodyProps={false}
    >
      <DataTable columns={columns} rows={rows} onRowClick={onOpen} />
    </Card>
  );
}
