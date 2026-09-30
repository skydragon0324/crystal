import React, { useState } from 'react';
import {
  Box,
  Button,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  Input,
  Stack
} from '@chakra-ui/react';

import api from '@/api';
import { useT } from '@/i18n';
import { number } from '@/utils/format';
import { Lede } from './ledger';
import {
  ConfirmMove,
  Done,
  FormProblem,
  NoWallet,
  WalletStrip,
  amountProblem,
  problemOf,
  sayProblem,
  useWalletBalance
} from './walletForm';

/**
 * TRANSFER - native points from the member's Appstore wallet to another
 * member's. The vendor's AccountAppstoreWalletTransferPage, finished.
 *
 * The vendor's form is here as it drew it: the purse (company points, the only
 * one it offers), the receiver's user ID, the amount - no more than 99 999 999
 * - and the wallet password, then a dialog asking "transfer to {receiver} with
 * {points} points?". What it never had is the part after the dialog; its
 * handler returned without a call.
 *
 * TWO STEPS BEFORE ANYTHING MOVES, and the second one is the point:
 *
 *   CONTINUE checks the form here, then asks the API who the user ID belongs
 *   to. An ID that is nobody's, the member's own, or somebody with no wallet
 *   is refused UNDER THE ID BOX, before a password is spent.
 *
 *   The confirmation then names the person - "Ming (member1.2)" - not just the
 *   ID that was typed. A transposed digit is somebody else's account, and a
 *   name the member does not recognise is how that gets caught while Cancel
 *   still means something.
 *
 * SEND is the only request that moves points, and the API checks all of it
 * again: the password, the balance, the receiver. A refusal closes the dialog
 * and lands under the field it is about.
 */

const EMPTY = { receiver: '', amount: '', password: '' };

export default function WalletTransfer() {
  const t = useT();

  const balance = useWalletBalance();

  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formProblem, setFormProblem] = useState(null);
  const [receiver, setReceiver] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  /*
   * The value is read in the handler, not in the updater: React 16 recycles
   * the event before a functional update runs (eventPooling.test.js).
   */
  const setField = (name) => (event) => {
    const value = event.target.value;
    setForm((current) => Object.assign({}, current, { [name]: value }));
    setErrors((current) => Object.assign({}, current, { [name]: null }));
  };

  const coins = balance.data || {};

  if (balance.data && balance.data.linked === false) return <NoWallet />;

  /** Step one: everything the page can know, then who the ID belongs to. */
  const review = async (event) => {
    event.preventDefault();
    setFormProblem(null);

    const found = {};
    if (!form.receiver.trim()) found.receiver = sayProblem({ reason: 'RECEIVER_REQUIRED' }, t);
    found.amount = sayProblem(amountProblem(form.amount, { available: coins.native_score }), t);
    if (!form.password) found.password = sayProblem({ reason: 'PASSWORD_REQUIRED' }, t);

    setErrors(found);
    if (found.receiver || found.amount || found.password) return;

    setBusy(true);
    try {
      const reply = await api.account.appstoreWalletReceiver(form.receiver.trim());
      setReceiver(reply.data);
    } catch (err) {
      showProblem(problemOf(err, t));
    } finally {
      setBusy(false);
    }
  };

  /** A refusal goes under its field, or above the form when it has none. */
  const showProblem = (problem) => {
    if (problem.field && Object.prototype.hasOwnProperty.call(EMPTY, problem.field)) {
      setErrors((current) => Object.assign({}, current, { [problem.field]: problem.message }));
    } else {
      setFormProblem(problem.message);
    }
  };

  /** Step two, from the dialog: the one request that moves points. */
  const send = async () => {
    setBusy(true);
    try {
      const reply = await api.account.appstoreTransfer({
        receiver: form.receiver.trim(),
        amount: form.amount.trim(),
        password: form.password
      });

      setReceiver(null);
      setForm(EMPTY);
      setDone(reply.data);
      /* The strip re-reads the wallet; the reply's figure is shown meanwhile. */
      balance.reload();
    } catch (err) {
      setReceiver(null);
      showProblem(problemOf(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box>
      <Lede>{t('account.points.wallettransfer.lede')}</Lede>

      <WalletStrip balance={balance} highlight="COMPANY" />

      {done ? (
        <Done
          title={t('account.points.wallettransfer.sentTo', {
            amount: number(done.amount),
            name: done.receiver ? done.receiver.nickname : ''
          })}
          lines={[
            done.reference ? t('account.points.walletform.transactionNo', { reference: done.reference }) : null,
            done.balance ? t('account.points.walletform.theWalletNowHolds', { balance: number(done.balance.native_score) }) : null
          ]}
          againLabel={t('account.points.wallettransfer.sendAnother')}
          onAgain={() => setDone(null)}
        />
      ) : (
        <Box as="form" onSubmit={review} maxW="440px" noValidate>
          <FormProblem>{formProblem}</FormProblem>

          <Stack spacing="4">
            <FormControl isInvalid={!!errors.receiver} isRequired>
              <FormLabel fontSize="sm" fontWeight="600">{t('account.points.wallettransfer.receiverId')}</FormLabel>
              <Input value={form.receiver} onChange={setField('receiver')} autoComplete="off" />
              <FormErrorMessage>{errors.receiver}</FormErrorMessage>
            </FormControl>

            <FormControl isInvalid={!!errors.amount} isRequired>
              <FormLabel fontSize="sm" fontWeight="600">{t('account.points.wallettransfer.pointsToSend')}</FormLabel>
              {/* Text with a decimal keyboard, not type="number": see amountProblem. */}
              <Input value={form.amount} onChange={setField('amount')} inputMode="decimal" autoComplete="off" />
              {errors.amount
                ? <FormErrorMessage>{errors.amount}</FormErrorMessage>
                : (
                  <FormHelperText>
                    {t('account.points.walletform.availableNative', { balance: number(coins.native_score) })}
                  </FormHelperText>
                )}
            </FormControl>

            <FormControl isInvalid={!!errors.password} isRequired>
              <FormLabel fontSize="sm" fontWeight="600">{t('account.points.walletform.walletPassword')}</FormLabel>
              <Input type="password" value={form.password} onChange={setField('password')} autoComplete="current-password" />
              <FormErrorMessage>{errors.password}</FormErrorMessage>
            </FormControl>

            <Button type="submit" variant="brand" isLoading={busy && !receiver}>
              {t('account.points.wallettransfer.continue')}
            </Button>
          </Stack>
        </Box>
      )}

      <ConfirmMove
        isOpen={!!receiver}
        onClose={() => setReceiver(null)}
        title={t('account.points.wallettransfer.sendThisTransfer')}
        body={receiver ? t('account.points.wallettransfer.sendPointsTo', {
          amount: number(form.amount),
          name: receiver.nickname,
          userId: receiver.user_id
        }) : ''}
        confirmLabel={t('account.points.wallettransfer.send')}
        onConfirm={send}
        isBusy={busy}
      />
    </Box>
  );
}
