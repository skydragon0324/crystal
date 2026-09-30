import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Button, FormControl, FormLabel, Input, Modal, ModalBody, ModalCloseButton,
  ModalContent, ModalFooter, ModalHeader, ModalOverlay, SimpleGrid, Tab, TabList,
  TabPanel, TabPanels, Tabs, Text, Textarea, useDisclosure, useToast
} from '@chakra-ui/react';

import CrudPage from '../../components/CrudPage';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import SelectField from '../../components/SelectField';
import { wallets } from '../../api';
import { useT } from '../../i18n';
import { dateTime, money, number } from '../../utils/format';

export const PAGE = '/admin/members/wallets';

/**
 * MEMBER WALLETS.
 *
 * The storefront has had these pages for a while and the console had none,
 * which made a member's money and points the one part of the system nobody
 * here could see. Support answering "my top-up never arrived" had a database
 * client and nothing else.
 *
 * THE LIST IS BALANCES, THE DETAIL IS THE LEDGER. A balance is a cached
 * total; the question support is actually asked is always about a movement,
 * so opening a row goes straight to the two logs rather than to a form.
 *
 * There is no edit form and no delete. A ledger row is the evidence that a
 * balance is what it claims to be - removing one leaves a total nothing can
 * reconcile - so a movement made in error is corrected by an adjustment that
 * names it, the way the paper version works.
 */

const MOVEMENT = [
  { value: 'CHARGE', label: 'Top-ups' },
  { value: 'WITHDRAW', label: 'Withdrawals' },
  { value: 'TRANSFER_IN', label: 'Transfers in' },
  { value: 'TRANSFER_OUT', label: 'Transfers out' },
  { value: 'PURCHASE', label: 'Purchases' },
  { value: 'REFUND', label: 'Refunds' },
  { value: 'REPAIR', label: 'Repairs' },
  { value: 'COMPENSATION', label: 'Adjustments' }
];

const POINT_MOVEMENT = [
  { value: 'LOGIN', label: 'Daily sign-in' },
  { value: 'PRODUCT_REGISTER', label: 'Device registration' },
  { value: 'PURCHASE', label: 'Purchases' },
  { value: 'LICENSE', label: 'Licences' },
  { value: 'ACTIVITY', label: 'Activities' },
  { value: 'REPAIR', label: 'Repairs' },
  { value: 'WARRANTY_EXTENSION', label: 'Warranty extensions' },
  { value: 'ADJUST', label: 'Adjustments' }
];

export default function Wallets() {
  const t = useT();
  const detail = useDisclosure();
  const [openFor, setOpenFor] = useState(null);

  const api = { list: (params) => wallets.list(params) };

  return (
    <>
      <CrudPage
        page={PAGE}
        api={api}
        defaultSort="balance"
        defaultDir="desc"
        canRestore={false}
        canDelete={false}
        pkField="user_id"
        searchPlaceholder={t('members.wallets.searchByLoginNicknameEmail')}
        subtitle={t('members.wallets.balancesAreACachedTotal')}
        onRowDoubleClick={(row) => { setOpenFor(row); detail.onOpen(); }}
        rowHint={t('members.wallets.doubleClickToOpenThe')}
        filters={(list) => (
          <Box minW="11.25rem">
            <SelectField
              size="sm"
              value={list.params.funded || null}
              onChange={(value) => list.setFilter({ funded: value || undefined })}
              options={[{ value: 'true', label: t('members.wallets.moneyOrPoints') }]}
              allowEmpty
              emptyLabel={t('members.wallets.everyWallet')}
              isSearchable={false}
            />
          </Box>
        )}
        rowActions={(row) => (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => { setOpenFor(row); detail.onOpen(); }}
          >
            {t('members.wallets.ledger')}
          </Button>
        )}
        columns={[
          {
            key: 'login', label: 'Member',
            render: (row) => (
              <Box>
                <Text fontWeight="600">{row.login}</Text>
                {row.nickname && (
                  <Text fontSize="xs" color="gray.500">{row.nickname}</Text>
                )}
              </Box>
            )
          },
          {
            key: 'contact', label: 'Contact', sortable: false,
            render: (row) => (
              <Text fontSize="xs" color="gray.500">{row.email || row.phone || '—'}</Text>
            )
          },
          {
            key: 'balance', label: 'Balance', isNumeric: true,
            render: (row) => (
              <Text fontWeight="700">{money(row.balance, row.currency)}</Text>
            )
          },
          {
            /*
             * Held money is shown only when there is some. A column of
             * zeroes on every row is a column that teaches people to stop
             * reading it, and this one matters on the rows that have it.
             */
            key: 'frozen', label: 'Held', isNumeric: true,
            render: (row) => (
              Number(row.frozen) > 0
                ? <Text color="orange.400">{money(row.frozen, row.currency)}</Text>
                : <Text color="gray.400">—</Text>
            )
          },
          {
            key: 'point_balance', label: 'Points', isNumeric: true,
            render: (row) => number(row.point_balance)
          },
          { key: 'status', label: 'Account', render: (row) => <StatusBadge value={row.status} /> },
          { key: 'updated_at', label: 'Last movement', render: (row) => dateTime(row.updated_at) }
        ]}
      />

      <WalletDetail
        wallet={openFor}
        isOpen={detail.isOpen}
        onClose={() => { detail.onClose(); setOpenFor(null); }}
      />
    </>
  );
}

/**
 * One member's two ledgers, side by side in tabs.
 *
 * Both are read-only. The only write on this screen is the adjustment below,
 * and it appends a movement rather than editing one.
 */
function WalletDetail({ wallet, isOpen, onClose }) {
  const t = useT();
  const toast = useToast();

  const [head, setHead] = useState(null);
  const [cash, setMoney] = useState({ rows: [], loading: false, type: null });
  const [points, setPoints] = useState({ rows: [], loading: false, type: null });
  const [adjusting, setAdjusting] = useState(null);

  const userId = wallet && wallet.user_id;

  const loadHead = useCallback(async () => {
    if (!userId) return;
    const answer = await wallets.detail(userId);
    setHead(answer.data);
  }, [userId]);

  const loadMoney = useCallback(async (type) => {
    if (!userId) return;
    setMoney((c) => ({ ...c, loading: true, type: type }));
    const answer = await wallets.transactions(userId, { limit: 100, type: type || undefined });
    setMoney({ rows: answer.data.rows, loading: false, type: type });
  }, [userId]);

  const loadPoints = useCallback(async (type) => {
    if (!userId) return;
    setPoints((c) => ({ ...c, loading: true, type: type }));
    const answer = await wallets.points(userId, { limit: 100, type: type || undefined });
    setPoints({ rows: answer.data.rows, loading: false, type: type });
  }, [userId]);

  useEffect(() => {
    if (!isOpen || !userId) return;
    loadHead();
    loadMoney(null);
    loadPoints(null);
  }, [isOpen, userId, loadHead, loadMoney, loadPoints]);

  const afterAdjust = async () => {
    setAdjusting(null);
    await loadHead();
    await loadMoney(cash.type);
    await loadPoints(points.type);
    toast({ status: 'success', title: t('members.wallets.theAdjustmentWasRecorded') });
  };

  if (!wallet) return null;

  const shown = head || wallet;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="4xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          <Text fontSize="md">{shown.login}</Text>
          <Text fontSize="xs" fontWeight="400" color="gray.500">
            {shown.nickname || shown.email || shown.phone || ''}
          </Text>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody>
          <SimpleGrid columns={{ base: 1, sm: 3 }} spacing={3} mb={5}>
            <Figure
              label={t('members.wallets.balance')}
              value={money(shown.balance, shown.currency)}
            />
            <Figure
              label={t('members.wallets.held')}
              value={money(shown.frozen, shown.currency)}
              muted={!Number(shown.frozen)}
            />
            <Figure
              label={t('members.wallets.points')}
              value={number(shown.point_balance)}
            />
          </SimpleGrid>

          <Tabs size="sm" variant="enclosed" isLazy>
            <TabList>
              <Tab>{t('members.wallets.transactions')}</Tab>
              <Tab>{t('members.wallets.points')}</Tab>
            </TabList>

            <TabPanels>
              <TabPanel px={0}>
                <Ledger
                  filterLabel={t('members.wallets.allTypes')}
                  options={MOVEMENT}
                  value={cash.type}
                  onFilter={loadMoney}
                  loading={cash.loading}
                  rows={cash.rows}
                  columns={[
                    { key: 'created_at', label: 'When', render: (r) => dateTime(r.created_at) },
                    { key: 'type', label: 'Type', render: (r) => <StatusBadge value={r.type} /> },
                    {
                      key: 'amount', label: 'Amount', isNumeric: true,
                      render: (r) => (
                        <Text fontWeight="700" color={Number(r.amount) < 0 ? 'red.400' : 'green.500'}>
                          {Number(r.amount) > 0 ? '+' : ''}{money(r.amount, r.currency)}
                        </Text>
                      )
                    },
                    {
                      key: 'balance_after', label: 'Balance after', isNumeric: true,
                      render: (r) => money(r.balance_after, r.currency)
                    },
                    { key: 'description', label: 'Reference', maxW: '13.75rem' },
                    { key: 'status', label: 'Result', render: (r) => <StatusBadge value={r.status} /> }
                  ]}
                />
              </TabPanel>

              <TabPanel px={0}>
                <Ledger
                  filterLabel={t('members.wallets.allTypes')}
                  options={POINT_MOVEMENT}
                  value={points.type}
                  onFilter={loadPoints}
                  loading={points.loading}
                  rows={points.rows}
                  columns={[
                    { key: 'created_at', label: 'When', render: (r) => dateTime(r.created_at) },
                    { key: 'type', label: 'Type', render: (r) => <StatusBadge value={r.type} /> },
                    {
                      key: 'amount', label: 'Points', isNumeric: true,
                      render: (r) => (
                        <Text fontWeight="700" color={Number(r.amount) < 0 ? 'red.400' : 'green.500'}>
                          {Number(r.amount) > 0 ? '+' : ''}{number(r.amount)}
                        </Text>
                      )
                    },
                    { key: 'balance_after', label: 'Balance after', isNumeric: true, render: (r) => number(r.balance_after) },
                    { key: 'description', label: 'Reference', maxW: '16.25rem' }
                  ]}
                />
              </TabPanel>
            </TabPanels>
          </Tabs>
        </ModalBody>

        <ModalFooter gap={2} data-gap="8">
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t('members.wallets.close')}
          </Button>
          <Button size="sm" onClick={() => setAdjusting('money')}>
            {t('members.wallets.adjustBalance')}
          </Button>
          <Button size="sm" onClick={() => setAdjusting('points')}>
            {t('members.wallets.adjustPoints')}
          </Button>
        </ModalFooter>
      </ModalContent>

      <AdjustDialog
        kind={adjusting}
        userId={userId}
        currency={shown.currency}
        onClose={() => setAdjusting(null)}
        onDone={afterAdjust}
      />
    </Modal>
  );
}

function Figure({ label, value, muted }) {
  return (
    <Box p={3} borderRadius="0.625rem" bg="blackAlpha.50" _dark={{ bg: 'whiteAlpha.100' }}>
      <Text fontSize="xs" color="gray.500">{label}</Text>
      <Text fontSize="lg" fontWeight="800" color={muted ? 'gray.400' : undefined}>
        {value}
      </Text>
    </Box>
  );
}

function Ledger({ filterLabel, options, value, onFilter, loading, rows, columns }) {
  return (
    <Box>
      <Box maxW="13.75rem" mb={3}>
        <SelectField
          size="sm"
          value={value || null}
          onChange={(next) => onFilter(next || null)}
          options={options}
          allowEmpty
          emptyLabel={filterLabel}
          isSearchable={false}
        />
      </Box>

      <DataTable columns={columns} rows={rows} loading={loading} />
    </Box>
  );
}

/**
 * A manual movement.
 *
 * THE REASON IS REQUIRED, and it is not paperwork: it becomes the description
 * the member reads on their own statement. An adjustment nobody can explain
 * later is what stops a ledger being evidence.
 *
 * A negative amount takes money back off, which is why the field is a plain
 * number rather than two buttons - the sign is the operator's decision and
 * the server refuses anything that would overdraw the wallet.
 */
function AdjustDialog({ kind, userId, currency, onClose, onDone }) {
  const t = useT();
  const toast = useToast();

  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (kind) { setAmount(''); setReason(''); }
  }, [kind]);

  const submit = async () => {
    setBusy(true);
    try {
      await wallets.adjust(userId, { kind: kind, amount: amount, description: reason });
      await onDone();
    } catch (err) {
      toast({
        status: 'error',
        title: (err && err.message) || t('members.wallets.theAdjustmentWasRefused')
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={!!kind} onClose={onClose} size="md">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader fontSize="md">
          {kind === 'points'
            ? t('members.wallets.adjustPoints')
            : t('members.wallets.adjustBalance')}
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody>
          <FormControl isRequired mb={4}>
            <FormLabel fontSize="sm">
              {kind === 'points'
                ? t('members.wallets.points')
                : t('members.wallets.amountIn', { currency: currency || 'USD' })}
            </FormLabel>
            <Input
              size="sm"
              type="number"
              step={kind === 'points' ? '1' : '0.01'}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder={t('members.wallets.negativeToTakeItBack')}
            />
          </FormControl>

          <FormControl isRequired>
            <FormLabel fontSize="sm">{t('members.wallets.reason')}</FormLabel>
            <Textarea
              size="sm"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t('members.wallets.theMemberSeesThisOn')}
            />
          </FormControl>
        </ModalBody>

        <ModalFooter gap={2} data-gap="8">
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t('members.wallets.cancel')}
          </Button>
          <Button
            size="sm"
            colorScheme="brand"
            isLoading={busy}
            isDisabled={!amount || !reason.trim()}
            onClick={submit}
          >
            {t('members.wallets.record')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
