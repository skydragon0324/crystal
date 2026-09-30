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
import { Lede } from './ledger';
import { Done, FormProblem, NoWallet, problemOf, sayProblem, useWalletBalance } from './walletForm';

/**
 * THE WALLET PASSWORD - what the transfer form asks for before points leave.
 *
 * The vendor has no page for this; its transfer form asks for the password and
 * its store has the call that sets it (`change_password`, which writes the
 * wallet's `prhn_pwd`). This is the page that call needed. It is under Crystal
 * Points rather than under Account > Password because it is not the password a
 * member signs in with, and putting the two side by side is how somebody
 * changes the wrong one.
 *
 * THE CURRENT PASSWORD IS REQUIRED, and it is the API that insists. The store's
 * call takes a new password and no old one, so without the check a signed-in
 * session left open on a shared computer would be enough to take over the
 * password that guards every transfer.
 *
 * WHAT A MEMBER SHOULD KNOW, and the lede says it: the vendor writes this same
 * password whenever the member's PLATFORM password changes, so changing that
 * later sets this one to match again.
 */

const EMPTY = { current: '', next: '', confirm: '' };

export default function WalletPassword() {
  const t = useT();

  const balance = useWalletBalance();

  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formProblem, setFormProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  /* Read in the handler - React 16 recycles the event before the updater runs. */
  const setField = (name) => (event) => {
    const value = event.target.value;
    setForm((current) => Object.assign({}, current, { [name]: value }));
    setErrors((current) => Object.assign({}, current, { [name]: null }));
  };

  if (balance.data && balance.data.linked === false) return <NoWallet />;

  const submit = async (event) => {
    event.preventDefault();
    setFormProblem(null);

    const found = {
      current: form.current ? null : sayProblem({ reason: 'PASSWORD_REQUIRED' }, t),
      next: form.next.length < 6
        ? sayProblem({ reason: 'PASSWORD_TOO_SHORT' }, t)
        : form.next === form.current ? sayProblem({ reason: 'PASSWORD_UNCHANGED' }, t) : null,
      confirm: form.confirm !== form.next ? sayProblem({ reason: 'PASSWORDS_DIFFER' }, t) : null
    };

    setErrors(found);
    if (found.current || found.next || found.confirm) return;

    setBusy(true);
    try {
      await api.account.appstoreWalletPassword({ current: form.current, next: form.next });
      setForm(EMPTY);
      setDone(true);
    } catch (err) {
      const problem = problemOf(err, t);
      if (problem.field === 'current' || problem.field === 'next') {
        setErrors((current) => Object.assign({}, current, { [problem.field]: problem.message }));
      } else {
        setFormProblem(problem.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box>
      <Lede>{t('account.points.walletpassword.lede')}</Lede>

      {done ? (
        <Done
          title={t('account.points.walletpassword.changed')}
          lines={[t('account.points.walletpassword.useItForYourNextTransfer')]}
          againLabel={t('account.points.walletpassword.changeAgain')}
          onAgain={() => setDone(false)}
        />
      ) : (
        <Box as="form" onSubmit={submit} maxW="440px" noValidate>
          <FormProblem>{formProblem}</FormProblem>

          <Stack spacing="4">
            <FormControl isInvalid={!!errors.current} isRequired>
              <FormLabel fontSize="sm" fontWeight="600">{t('account.points.walletpassword.current')}</FormLabel>
              <Input type="password" value={form.current} onChange={setField('current')} autoComplete="current-password" />
              <FormErrorMessage>{errors.current}</FormErrorMessage>
            </FormControl>

            <FormControl isInvalid={!!errors.next} isRequired>
              <FormLabel fontSize="sm" fontWeight="600">{t('account.points.walletpassword.next')}</FormLabel>
              <Input type="password" value={form.next} onChange={setField('next')} autoComplete="new-password" />
              {errors.next
                ? <FormErrorMessage>{errors.next}</FormErrorMessage>
                : <FormHelperText>{t('account.points.walletpassword.atLeast6')}</FormHelperText>}
            </FormControl>

            <FormControl isInvalid={!!errors.confirm} isRequired>
              <FormLabel fontSize="sm" fontWeight="600">{t('account.points.walletpassword.confirm')}</FormLabel>
              <Input type="password" value={form.confirm} onChange={setField('confirm')} autoComplete="new-password" />
              <FormErrorMessage>{errors.confirm}</FormErrorMessage>
            </FormControl>

            <Button type="submit" variant="brand" isLoading={busy}>
              {t('account.points.walletpassword.save')}
            </Button>
          </Stack>
        </Box>
      )}
    </Box>
  );
}
