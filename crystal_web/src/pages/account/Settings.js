import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
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
  Stack,
  Text,
  useToast
} from '@chakra-ui/react';
import { useDispatch, useSelector } from 'react-redux';

import { Loading } from '@/components/common';
import api from '@/api';
import { useApi } from '@/hooks/useApi';
import { selectUser, setUser } from '@/app/authSlice';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * Account settings: the profile, the password, and linking a phone number.
 *
 * Linking a phone matters more than it looks: an account created with an
 * email can only sign in on a desktop until it has one, because a phone is
 * OTP-only (spec 5). The page says so rather than leaving someone to
 * discover it on their commute.
 */
export default function Settings() {
  const { view } = useParams();
  return view === 'password' ? <Password /> : <Profile />;
}

/* ----------------------------------------------------------------- profile */

function Profile() {
  const t = useT();
  const surface = useSurface();
  const toast = useToast();
  const dispatch = useDispatch();
  const user = useSelector(selectUser);

  const profile = useApi(() => api.account.profile(), []);
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  // phone linking
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [otpNotice, setOtpNotice] = useState(null);
  const [otpBusy, setOtpBusy] = useState(false);
  const [binding, setBinding] = useState(false);

  useEffect(() => {
    if (!profile.data) return;
    setNickname(profile.data.nickname || '');
    setEmail(profile.data.email || '');
  }, [profile.data]);

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      // Only the nickname and the avatar are editable - the email is the
      // sign-in identity and changing it is a support action, not a form.
      const { data } = await api.account.updateProfile({ nickname });
      dispatch(setUser(data));
      toast({ title: 'Profile saved', status: 'success', duration: 2500 });
    } catch (err) {
      toast({ title: err.message, status: 'error', duration: 6000, isClosable: true });
    } finally {
      setBusy(false);
    }
  };

  const sendCode = async () => {
    if (!phone.trim()) return;
    setOtpBusy(true);
    setOtpNotice(null);
    try {
      const { data } = await api.auth.requestOtp(phone.trim(), 'BIND');
      setOtpNotice(
        data.debugCode ? `Development mode: your code is ${data.debugCode}` : 'We sent you a code.'
      );
    } catch (err) {
      setOtpNotice(err.message);
    } finally {
      setOtpBusy(false);
    }
  };

  const bind = async () => {
    setBinding(true);
    try {
      const { data } = await api.auth.bindPhone(phone.trim(), code);
      dispatch(setUser(data));
      toast({ title: 'Phone number linked', status: 'success', duration: 3000 });
      setPhone('');
      setCode('');
      setOtpNotice(null);
      profile.reload();
    } catch (err) {
      toast({ title: err.message, status: 'error', duration: 6000, isClosable: true });
    } finally {
      setBinding(false);
    }
  };

  if (profile.loading) return <Loading variant="block" height="300px" />;

  const current = profile.data || user;

  return (
    <Box maxW="560px">
      <Box as="form" onSubmit={save}>
        <Stack spacing="5">
          <FormControl>
            <FormLabel fontSize="sm" fontWeight="600">
              {t('common.name')}
            </FormLabel>
            <Input value={nickname} onChange={(event) => setNickname(event.target.value)} />
          </FormControl>

          <FormControl>
            <FormLabel fontSize="sm" fontWeight="600">
              {t('common.email')}
            </FormLabel>
            <Input type="email" value={email} isReadOnly isDisabled />
            <Text fontSize="xs" color={surface.muted} mt="1">
              {t('account.settings.yourEmailAndPasswordAre')}
            </Text>
          </FormControl>

          <Button type="submit" variant="brand" alignSelf="flex-start" isLoading={busy}>
            {t('account.settings.saveChanges')}
          </Button>
        </Stack>
      </Box>

      <Box mt="12" pt="10" borderTop="1px solid" borderColor={surface.border}>
        <Heading size="md" color={surface.text} mb="2">
          {t('common.phoneNumber')}
        </Heading>

        {current && current.phone ? (
          <Flex align="center" justify="space-between" p="4" borderRadius="12px" bg={surface.raised}>
            <Box>
              <Text fontWeight="600" color={surface.text}>
                {current.phone}
              </Text>
              <Text fontSize="xs" color={surface.muted}>
                {t('account.settings.youCanSignInOn')}
              </Text>
            </Box>
          </Flex>
        ) : (
          <>
            <Alert status="info" borderRadius="10px" mb="5" fontSize="sm">
              <AlertIcon />
              {t('account.settings.withoutALinkedPhoneNumber')}
            </Alert>

            <Stack spacing="4">
              <FormControl>
                <FormLabel fontSize="sm" fontWeight="600">
                  {t('common.phoneNumber')}
                </FormLabel>
                <Flex gap="2" data-gap="8">
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="+8613800000001"
                  />
                  <Button
                    variant="quiet"
                    flexShrink={0}
                    isLoading={otpBusy}
                    isDisabled={!phone.trim()}
                    onClick={sendCode}
                  >
                    {t('account.settings.sendCode')}
                  </Button>
                </Flex>
              </FormControl>

              {otpNotice && (
                <Alert status="info" borderRadius="10px" fontSize="sm">
                  <AlertIcon />
                  {otpNotice}
                </Alert>
              )}

              <FormControl>
                <FormLabel fontSize="sm" fontWeight="600">
                  {t('common.verificationCode')}
                </FormLabel>
                <Input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  maxLength={6}
                  placeholder="000000"
                />
              </FormControl>

              <Button
                variant="brand"
                alignSelf="flex-start"
                isLoading={binding}
                isDisabled={!phone.trim() || code.length < 4}
                onClick={bind}
              >
                {t('account.settings.linkThisNumber')}
              </Button>
            </Stack>
          </>
        )}
      </Box>
    </Box>
  );
}

/* ---------------------------------------------------------------- password */

function Password() {
  const t = useT();

  const surface = useSurface();
  const toast = useToast();
  const user = useSelector(selectUser);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const mismatch = next && confirm && next !== confirm;
  const hasPassword = user && user.has_password;

  const submit = async (event) => {
    event.preventDefault();
    if (next.length < 8 || mismatch) return;
    setBusy(true);
    try {
      await api.auth.changePassword(current, next);
      toast({ title: 'Password changed', status: 'success', duration: 3000 });
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
    <Box maxW="480px" as="form" onSubmit={submit}>
      <Text color={surface.muted} mb="6">
        {hasPassword
          ? 'Your password is how you sign in on a desktop.'
          : 'Your account was created with a phone number. Setting a password lets you sign in on a desktop too.'}
      </Text>

      <Stack spacing="5">
        {hasPassword && (
          <FormControl isRequired>
            <FormLabel fontSize="sm" fontWeight="600">
              {t('account.settings.currentPassword')}
            </FormLabel>
            <Input
              type="password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              autoComplete="current-password"
            />
          </FormControl>
        )}

        <FormControl isRequired>
          <FormLabel fontSize="sm" fontWeight="600">
            {t('account.settings.newPassword')}
          </FormLabel>
          <Input
            type="password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
            autoComplete="new-password"
          />
          <Text fontSize="xs" color={surface.muted} mt="1">
            {t('common.atLeast8Characters')}
          </Text>
        </FormControl>

        <FormControl isRequired isInvalid={!!mismatch}>
          <FormLabel fontSize="sm" fontWeight="600">
            {t('account.settings.confirmNewPassword')}
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

        <Button
          type="submit"
          variant="brand"
          alignSelf="flex-start"
          isLoading={busy}
          isDisabled={next.length < 8 || !!mismatch || (hasPassword && !current)}
        >
          {hasPassword ? 'Change password' : 'Set password'}
        </Button>
      </Stack>
    </Box>
  );
}
