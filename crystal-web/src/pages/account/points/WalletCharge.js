import React, { useState } from 'react';
import {
  Box,
  Button,
  FormControl,
  FormErrorMessage,
  FormLabel,
  Input,
  SimpleGrid,
  Stack,
  Text
} from '@chakra-ui/react';

import { ErrorState, Loading } from '@/components/common';
import api from '@/api';
import { useApi } from '@/hooks/useApi';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';
import { number } from '@/utils/format';
import { Lede } from './ledger';
import {
  ConfirmMove,
  Done,
  FormProblem,
  MOVE_LIMIT,
  NoWallet,
  PURSES,
  WalletStrip,
  amountProblem,
  problemOf,
  sayProblem,
  useWalletBalance
} from './walletForm';

/**
 * CHARGE - adding points to the member's Appstore wallet through a channel.
 * The vendor's AccountAppstoreWalletChargePage, finished.
 *
 * The vendor's page is a purse and a grid of channel cards: four for company
 * points (Wallet SH, MM, UR, SY) and one for foreign (SH). That is all it is -
 * the cards have no click handler and its confirm dialog is a copy of the
 * transfer page's. So the choices and their pairing are the vendor's, and the
 * amount, the confirmation and the call are what finishing it takes.
 *
 * THE CHOICES COME FROM THE API (GET /account/appstore/wallet/charge), which
 * refuses a channel that is not offered for the chosen purse. A page with its
 * own copy of that table would be the second place it lives, and the first
 * place it went stale.
 *
 * No password: the vendor's charge form asks for none, and a charge adds to
 * the member's own wallet rather than taking anything out of it.
 */
export default function WalletCharge() {
  const t = useT();
  const surface = useSurface();

  const balance = useWalletBalance();
  const options = useApi(() => api.account.appstoreChargeOptions(), []);

  const [money, setMoney] = useState('COMPANY');
  const [channel, setChannel] = useState(null);
  const [amount, setAmount] = useState('');
  const [errors, setErrors] = useState({});
  const [formProblem, setFormProblem] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  if (balance.data && balance.data.linked === false) return <NoWallet />;
  if (options.error) return <ErrorState message={options.error} onRetry={options.reload} />;

  const offered = (options.data && options.data.money) || [];
  const limit = (options.data && options.data.limit) || MOVE_LIMIT;
  const channels = ((offered.filter((entry) => entry.key === money)[0]) || { channels: [] }).channels;

  const choosePurse = (key) => {
    setMoney(key);
    /* A channel chosen for the other purse may not charge this one. */
    setChannel(null);
    setErrors({});
  };

  const review = (event) => {
    event.preventDefault();
    setFormProblem(null);

    const found = {
      channel: channels.indexOf(channel) === -1 ? sayProblem({ reason: 'CHANNEL_REQUIRED' }, t) : null,
      amount: sayProblem(amountProblem(amount, { limit: limit }), t)
    };

    setErrors(found);
    if (!found.channel && !found.amount) setConfirming(true);
  };

  const charge = async () => {
    setBusy(true);
    try {
      const reply = await api.account.appstoreCharge({ money: money, channel: channel, amount: amount.trim() });
      setConfirming(false);
      setAmount('');
      setDone(Object.assign({ money: money }, reply.data));
      balance.reload();
    } catch (err) {
      setConfirming(false);
      const problem = problemOf(err, t);
      if (problem.field === 'amount' || problem.field === 'channel') {
        setErrors((current) => Object.assign({}, current, { [problem.field]: problem.message }));
      } else {
        setFormProblem(problem.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const purseWord = (key) => t(PURSES[key] ? PURSES[key].label : key);

  return (
    <Box>
      <Lede>{t('account.points.walletcharge.lede')}</Lede>

      <WalletStrip balance={balance} highlight={money} />

      {done ? (
        <Done
          title={t('account.points.walletcharge.charged', { amount: number(done.amount), purse: purseWord(done.money) })}
          lines={[
            done.reference ? t('account.points.walletform.transactionNo', { reference: done.reference }) : null,
            done.balance && PURSES[done.money]
              ? t('account.points.walletform.theWalletNowHolds', { balance: number(done.balance[PURSES[done.money].balance]) })
              : null
          ]}
          againLabel={t('account.points.walletcharge.chargeAgain')}
          onAgain={() => setDone(null)}
        />
      ) : options.loading ? (
        <Loading variant="list" count={2} height="64px" />
      ) : (
        <Box as="form" onSubmit={review} maxW="520px" noValidate>
          <FormProblem>{formProblem}</FormProblem>

          <Stack spacing="5">
            <FormControl>
              <FormLabel fontSize="sm" fontWeight="600">{t('account.points.walletcharge.pointsToCharge')}</FormLabel>
              <SimpleGrid columns={2} spacing="3" maxW="360px">
                {offered.map((entry) => (
                  <Choice
                    key={entry.key}
                    label={purseWord(entry.key)}
                    isActive={money === entry.key}
                    onClick={() => choosePurse(entry.key)}
                  />
                ))}
              </SimpleGrid>
            </FormControl>

            <FormControl isInvalid={!!errors.channel} isRequired>
              <FormLabel fontSize="sm" fontWeight="600">{t('account.points.walletcharge.channel')}</FormLabel>
              <SimpleGrid columns={{ base: 2, sm: 4 }} spacing="3">
                {channels.map((code) => (
                  <Choice
                    key={code}
                    /* The channel's own short name, as the vendor labels its card. */
                    label={t('account.points.walletcharge.walletChannel', { code: code })}
                    isActive={channel === code}
                    onClick={() => {
                      setChannel(code);
                      setErrors((current) => Object.assign({}, current, { channel: null }));
                    }}
                  />
                ))}
              </SimpleGrid>
              <FormErrorMessage>{errors.channel}</FormErrorMessage>
            </FormControl>

            <FormControl isInvalid={!!errors.amount} isRequired maxW="300px">
              <FormLabel fontSize="sm" fontWeight="600">{t('account.points.walletcharge.amount')}</FormLabel>
              <Input
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setErrors((current) => Object.assign({}, current, { amount: null }));
                }}
                inputMode="decimal"
                autoComplete="off"
              />
              <FormErrorMessage>{errors.amount}</FormErrorMessage>
            </FormControl>

            <Box>
              <Button type="submit" variant="brand">{t('account.points.walletcharge.continue')}</Button>
              <Text fontSize="xs" color={surface.muted} mt="2">
                {t('account.points.walletcharge.upTo', { limit: number(limit) })}
              </Text>
            </Box>
          </Stack>
        </Box>
      )}

      <ConfirmMove
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        title={t('account.points.walletcharge.chargeTheWallet')}
        body={t('account.points.walletcharge.chargeThrough', {
          amount: number(amount),
          purse: purseWord(money),
          channel: channel || ''
        })}
        confirmLabel={t('account.points.walletcharge.charge')}
        onConfirm={charge}
        isBusy={busy}
      />
    </Box>
  );
}

/** One of a small closed set, as a pressable card rather than a select. */
function Choice({ label, isActive, onClick }) {
  const surface = useSurface();

  return (
    <Box
      as="button"
      type="button"
      onClick={onClick}
      aria-pressed={!!isActive}
      p="3"
      borderRadius="12px"
      borderWidth="1px"
      borderColor={isActive ? 'brand.500' : surface.border}
      bg={isActive ? 'brand.500' : 'transparent'}
      color={isActive ? 'white' : surface.text}
      fontWeight="600"
      fontSize="sm"
      textAlign="center"
      transition="background 150ms, border-color 150ms"
      _hover={{ borderColor: 'brand.500' }}
    >
      {label}
    </Box>
  );
}
