import React, { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  Input,
  SimpleGrid,
  Stack,
  Text,
  useToast
} from '@chakra-ui/react';
import { useDispatch, useSelector } from 'react-redux';

import { DataTable, ErrorState, Loading, SelectField, StatusBadge } from '@/components/common';
import api from '@/api';
import { useApi, useList } from '@/hooks/useApi';
import { refreshWallet, selectWallet } from '@/app/authSlice';
import { formatPrice, useSurface, POINT_COLOR } from '@/theme/tokens';
import { useT } from '@/i18n';
import { dateMinute } from '@/utils/format';

const TYPE_OPTIONS = [
  { value: 'CHARGE', label: 'Top-ups' },
  { value: 'PURCHASE', label: 'Purchases' },
  { value: 'REFUND', label: 'Refunds' },
  { value: 'TRANSFER_IN', label: 'Transfers in' },
  { value: 'TRANSFER_OUT', label: 'Transfers out' }
];

/**
 * The wallet, in four views (spec's Wallet menu): Balance, Transactions,
 * Charge, Transfer and Security.
 *
 * They share one component keyed by the route segment because they share the
 * balance header - splitting them into five files would mean five copies of
 * it, and five chances for one to show a stale figure.
 */
export default function Wallet() {
  const t = useT();
  const surface = useSurface();
  const dispatch = useDispatch();
  const { view } = useParams();
  const wallet = useSelector(selectWallet);

  const overview = useApi(() => api.account.wallet(), []);

  // The endpoint answers the wallet itself; redux holds a copy for the
  // sidebar, and is the fallback while this page's own call is in flight.
  const balance = overview.data || wallet;

  return (
    <Box>
      {overview.loading && !balance ? (
        <Loading variant="block" height="140px" />
      ) : (
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing="4" mb="8">
          <Box
            p="6"
            borderRadius="16px"
            bgGradient="linear(to-br, brand.500, brand.700)"
            color="white"
            gridColumn={{ md: 'span 2' }}
          >
            <Text fontSize="sm" opacity={0.85}>
              {t('account.wallet.availableBalance')}
            </Text>
            <Text fontSize="4xl" fontWeight="800" letterSpacing="-0.03em" mt="1">
              {balance ? formatPrice(balance.balance, balance.currency) : '—'}
            </Text>
            {balance && balance.frozen > 0 && (
              <Text fontSize="sm" opacity={0.85} mt="1">
                {formatPrice(balance.frozen, balance.currency)} held
              </Text>
            )}
            <Flex gap="3" data-gap="12" data-gap-wrap mt="6" wrap="wrap">
              <Button as={RouterLink} to="/account/wallet/charge" size="sm" bg="whiteAlpha.300" color="white" _hover={{ bg: 'whiteAlpha.400' }}>
                {t('account.wallet.topUp')}
              </Button>
              <Button as={RouterLink} to="/account/wallet/transfer" size="sm" bg="whiteAlpha.300" color="white" _hover={{ bg: 'whiteAlpha.400' }}>
                {t('account.wallet.transfer')}
              </Button>
            </Flex>
          </Box>

          <Box p="6" borderRadius="16px" bg={surface.raised}>
            <Text fontSize="sm" color={surface.muted}>
              {t('account.wallet.points')}
            </Text>
            {/* Points are blue wherever they appear; money is red. The big
                balance above is white because it is reversed out on a brand
                panel - a colour rule that cannot survive its background is
                not a rule. */}
            <Text fontSize="3xl" fontWeight="800" color={POINT_COLOR} letterSpacing="-0.02em" mt="1">
              {balance ? Number(balance.point_balance || 0).toLocaleString() : '—'}
            </Text>
            <Button as={RouterLink} to="/account/points" size="sm" variant="quiet" mt="4">
              {t('account.wallet.pointLog')}
            </Button>
          </Box>
        </SimpleGrid>
      )}

      {(!view || view === 'transactions') && <Transactions />}
      {view === 'charge' && <Charge onDone={() => { overview.reload(); dispatch(refreshWallet()); }} />}
      {view === 'transfer' && <Transfer onDone={() => { overview.reload(); dispatch(refreshWallet()); }} />}
      {view === 'security' && <Security />}

      {!view && (
        <Box mt="10">
          <Text fontSize="sm" color={surface.muted}>
            {t('account.wallet.recentActivityTheFullStatement')}{' '}
            <Box as={RouterLink} to="/account/wallet/transactions" color="brand.500" fontWeight="600">
              {t('account.wallet.transactions')}
            </Box>
            .
          </Text>
        </Box>
      )}
    </Box>
  );
}

/* ------------------------------------------------------------ transactions */

function Transactions() {
  const t = useT();
  const surface = useSurface();
  const list = useList((params) => api.account.walletTransactions(params), {
    initialParams: { page: 1, limit: 12 }
  });

  const columns = [
    {
      key: 'description',
      label: 'Description',
      render: (row) => (
        <Box>
          <Text fontWeight="600" color={surface.text}>
            {row.description || row.type.replace(/_/g, ' ').toLowerCase()}
          </Text>
          {row.reference && (
            <Text fontSize="xs" color={surface.muted} fontFamily="mono">
              {row.reference}
            </Text>
          )}
        </Box>
      )
    },
    { key: 'type', label: 'Type', render: (row) => <StatusBadge value={row.type} /> },
    {
      /*
       * Money arrives as text - a numeric column comes back as a string
       * rather than lose cents to a float - so it is cast before it is
       * compared, or every row would test as positive.
       */
      key: 'amount',
      label: 'Amount',
      align: 'right',
      render: (row) => (
        <Text fontWeight="700" color={Number(row.amount) < 0 ? 'red.400' : 'green.500'}>
          {Number(row.amount) > 0 ? '+' : ''}
          {formatPrice(row.amount, row.currency)}
        </Text>
      )
    },
    {
      key: 'balance_after',
      label: 'Balance',
      align: 'right',
      render: (row) => formatPrice(row.balance_after, row.currency)
    },
    {
      key: 'created_at',
      label: 'When',
      render: (row) => dateMinute(row.created_at)
    }
  ];

  return (
    <Box>
      <Flex gap="3" data-gap="12" data-gap-wrap mb="5" wrap="wrap">
        <Box minW="200px">
          <SelectField
            size="sm"
            value={list.params.type || null}
            onChange={(value) => list.setFilter({ type: value || undefined })}
            options={TYPE_OPTIONS}
            allowEmpty
            emptyLabel={t('account.wallet.allTypes')}
            isSearchable={false}
          />
        </Box>
      </Flex>

      {list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : (
        <DataTable
          columns={columns}
          rows={list.rows}
          loading={list.loading}
          meta={list.meta}
          onPage={list.setPage}
          emptyTitle={t('account.wallet.noTransactionsYet')}
          emptyHint={t('account.wallet.topUpsPurchasesAndTransfers')}
        />
      )}
    </Box>
  );
}

/* ------------------------------------------------------------------ charge */

function Charge({ onDone }) {
  const t = useT();

  const surface = useSurface();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const value = Number(amount);
    if (!(value > 0)) return;
    setBusy(true);
    try {
      await api.account.charge(value, `TOPUP-${Date.now()}`);
      toast({ title: 'Wallet topped up', status: 'success', duration: 3000 });
      setAmount('');
      if (onDone) onDone();
    } catch (err) {
      toast({ title: err.message, status: 'error', duration: 6000, isClosable: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box maxW="440px" as="form" onSubmit={submit}>
      <Heading size="md" color={surface.text} mb="4">
        {t('account.wallet.topUp')}
      </Heading>
      <Stack spacing="4">
        <Flex gap="2" data-gap="8" data-gap-wrap wrap="wrap">
          {[50, 100, 200, 500].map((preset) => (
            <Button
              key={preset}
              size="sm"
              variant={Number(amount) === preset ? 'brand' : 'quiet'}
              onClick={() => setAmount(String(preset))}
            >
              {preset}
            </Button>
          ))}
        </Flex>

        <FormControl isRequired>
          <FormLabel fontSize="sm" fontWeight="600">
            {t('account.wallet.amount')}
          </FormLabel>
          <Input
            type="number"
            min="1"
            step="1"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="100"
          />
        </FormControl>

        <Button type="submit" variant="brand" isLoading={busy} isDisabled={!(Number(amount) > 0)}>
          {t('account.wallet.addFunds')}
        </Button>

        <Text fontSize="xs" color={surface.muted}>
          {t('account.wallet.thisDemoCreditsTheWallet')}
        </Text>
      </Stack>
    </Box>
  );
}

/* ---------------------------------------------------------------- transfer */

function Transfer({ onDone }) {
  const t = useT();
  const surface = useSurface();
  const toast = useToast();
  const [form, setForm] = useState({ email: '', amount: '', description: '', payPassword: '' });

  /**
   * ONE FIELD OF THE TRANSFER FORM.
   *
   * The value is read HERE, not inside the updater. React 16 recycles a
   * synthetic event as soon as the handler returns - it nulls the fields and
   * puts the object back in a pool - and a functional updater runs after
   * that, during the update. Reaching for `event.target.value` from inside
   * one finds null and throws on the first keystroke.
   *
   * React 17 removed pooling, so the inline form these four fields used to
   * share is correct on any modern React and wrong on this one.
   */
  const setField = (name) => (event) => {
    const next = event.target.value;
    setForm((current) => ({ ...current, [name]: next }));
  };
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const value = Number(form.amount);
    if (!(value > 0) || !form.email.trim()) return;
    setBusy(true);
    try {
      await api.account.transfer({
        email: form.email.trim(),
        amount: value,
        description: form.description || undefined,
        // Only checked when one has been set - the server decides that, and
        // sending an empty string when there is none is harmless.
        payPassword: form.payPassword || undefined
      });
      toast({ title: 'Transfer sent', status: 'success', duration: 3000 });
      setForm({ email: '', amount: '', description: '', payPassword: '' });
      if (onDone) onDone();
    } catch (err) {
      toast({ title: err.message, status: 'error', duration: 6000, isClosable: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box maxW="440px" as="form" onSubmit={submit}>
      <Heading size="md" color={surface.text} mb="4">
        {t('account.wallet.transfer')}
      </Heading>

      <Alert status="warning" borderRadius="10px" mb="5" fontSize="sm">
        <AlertIcon />
        {t('account.wallet.transfersAreImmediateAndCannot')}
      </Alert>

      <Stack spacing="4">
        <FormControl isRequired>
          <FormLabel fontSize="sm" fontWeight="600">
            {t('account.wallet.sendTo')}
          </FormLabel>
          <Input
            type="email"
            value={form.email}
            onChange={setField('email')}
            placeholder={t('account.wallet.theOtherMemberSEmail')}
          />
        </FormControl>

        <FormControl isRequired>
          <FormLabel fontSize="sm" fontWeight="600">
            {t('account.wallet.amount')}
          </FormLabel>
          <Input
            type="number"
            min="1"
            step="0.01"
            value={form.amount}
            onChange={setField('amount')}
          />
        </FormControl>

        <FormControl>
          <FormLabel fontSize="sm" fontWeight="600">
            {t('account.wallet.reference')}
          </FormLabel>
          <Input
            value={form.description}
            onChange={setField('description')}
            placeholder={t('account.wallet.whatItIsFor')}
          />
        </FormControl>

        <FormControl>
          <FormLabel fontSize="sm" fontWeight="600">
            {t('account.wallet.paymentPassword')}
          </FormLabel>
          <Input
            type="password"
            value={form.payPassword}
            onChange={setField('payPassword')}
            autoComplete="current-password"
            placeholder={t('account.wallet.onlyIfYouHaveSet')}
          />
        </FormControl>

        <Button
          type="submit"
          variant="brand"
          isLoading={busy}
          isDisabled={!form.email.trim() || !(Number(form.amount) > 0)}
        >
          {t('account.wallet.sendTransfer')}
        </Button>
      </Stack>
    </Box>
  );
}

/* ---------------------------------------------------------------- security */

function Security() {
  const t = useT();
  const surface = useSurface();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const mismatch = next && confirm && next !== confirm;

  const submit = async (event) => {
    event.preventDefault();
    if (next.length < 6 || mismatch) return;
    setBusy(true);
    try {
      await api.account.setPayPassword(current, next);
      toast({ title: 'Payment password saved', status: 'success', duration: 3000 });
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      toast({ title: err.message, status: 'error', duration: 6000, isClosable: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box maxW="440px" as="form" onSubmit={submit}>
      <Heading size="md" color={surface.text} mb="2">
        {t('account.wallet.paymentPassword')}
      </Heading>
      <Text fontSize="sm" color={surface.muted} mb="5">
        {t('account.wallet.aSeparatePasswordForMoving')}
      </Text>

      <Stack spacing="4">
        <FormControl>
          <FormLabel fontSize="sm" fontWeight="600">
            {t('account.wallet.currentPaymentPassword')}
          </FormLabel>
          <Input
            type="password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            autoComplete="current-password"
          />
        </FormControl>

        <FormControl isRequired>
          <FormLabel fontSize="sm" fontWeight="600">
            {t('account.wallet.newPaymentPassword')}
          </FormLabel>
          <Input
            type="password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
            autoComplete="new-password"
          />
          <Text fontSize="xs" color={surface.muted} mt="1">
            {t('account.wallet.atLeast6Characters')}
          </Text>
        </FormControl>

        <FormControl isRequired isInvalid={!!mismatch}>
          <FormLabel fontSize="sm" fontWeight="600">
            {t('account.wallet.confirm')}
          </FormLabel>
          <Input
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
          />
          {mismatch && (
            <Text fontSize="xs" color="red.400" mt="1">
              {t('common.theTwoDoNotMatch')}
            </Text>
          )}
        </FormControl>

        <Button type="submit" variant="brand" isLoading={busy} isDisabled={next.length < 6 || !!mismatch}>
          {t('account.wallet.save')}
        </Button>
      </Stack>
    </Box>
  );
}
