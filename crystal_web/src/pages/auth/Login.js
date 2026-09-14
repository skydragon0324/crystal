import React, { useEffect, useState } from 'react';
import { Link as RouterLink, useHistory, useLocation } from 'react-router-dom';
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Icon,
  Input,
  InputGroup,
  InputRightElement,
  PinInput,
  PinInputField,
  Stack,
  Text
} from '@chakra-ui/react';
import { FiMonitor, FiSmartphone } from 'react-icons/fi';
import { useDispatch, useSelector } from 'react-redux';

import { ErrorState, Loading, Section } from '@/components/common';
import api from '@/api';
import { useApi } from '@/hooks/useApi';
import {
  clearError,
  registerAccount,
  selectAuthStatus,
  signInWithOtp,
  signInWithPassword
} from '@/app/authSlice';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * Sign-in (spec 5).
 *
 * Which form is shown is decided by the SERVER: `/auth/methods` reports what
 * the device's User-Agent allows, and the page draws only that. Deciding it
 * from `navigator.userAgent` here would let the client and the server
 * disagree, and the server is the one that will refuse the request.
 *
 * A tablet is allowed both, so it gets a chooser. A phone gets the OTP form
 * and no password field at all - offering a form the API will reject is worse
 * than not offering it.
 *
 * In development the API echoes the generated code back (OTP_ECHO_IN_RESPONSE),
 * which is what makes the whole mobile flow testable without an SMS gateway.
 * That is surfaced explicitly rather than filled in silently.
 */
export default function Login() {
  const t = useT();

  const surface = useSurface();
  const dispatch = useDispatch();
  const history = useHistory();
  const location = useLocation();

  const status = useSelector((state) => selectAuthStatus(state));
  const error = useSelector((state) => state.auth.error);

  const methods = useApi(() => api.auth.methods(), []);
  const params = new URLSearchParams(location.search);
  const redirectTo = params.get('next') || '/account';

  const [mode, setMode] = useState(params.get('mode') === 'register' ? 'register' : null);
  const [showPassword, setShowPassword] = useState(false);

  // password form
  /*
   * A USER ID, not an email. The platform's user table has no email column -
   * it identifies a person by user_id and that is what sign-in checks.
   */
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');

  // otp form
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpNotice, setOtpNotice] = useState(null);
  const [otpBusy, setOtpBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const allowed = (methods.data && methods.data.allowed) || [];
  const device = methods.data && methods.data.device;

  // Once the server has answered, settle on the method it allows. A tablet
  // allows both, so it keeps the chooser.
  useEffect(() => {
    if (!allowed.length || mode === 'register') return;
    if (mode && allowed.indexOf(mode) !== -1) return;
    setMode(allowed.length === 1 ? allowed[0] : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [methods.data]);

  useEffect(() => {
    if (status === 'authenticated') history.replace(redirectTo);
  }, [status, history, redirectTo]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((current) => current - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const busy = status === 'pending';

  const sendOtp = async () => {
    if (!phone.trim()) return;
    setOtpBusy(true);
    setOtpNotice(null);
    try {
      const { data } = await api.auth.requestOtp(phone.trim(), 'LOGIN');
      setOtpSent(true);
      setCooldown(data.resendIn || 60);
      setOtpNotice(
        data.debugCode
          ? `Development mode: your code is ${data.debugCode}`
          : data.isNewAccount
            ? 'We sent you a code. Verifying it will create your Crystal account.'
            : 'We sent you a code.'
      );
    } catch (err) {
      setOtpNotice(err.message);
    } finally {
      setOtpBusy(false);
    }
  };

  const submitPassword = (event) => {
    event.preventDefault();
    dispatch(signInWithPassword({ user_id: userId.trim(), password }));
  };

  const submitOtp = (event) => {
    event.preventDefault();
    dispatch(signInWithOtp({ phone: phone.trim(), code }));
  };

  const submitRegister = (event) => {
    event.preventDefault();
    dispatch(
      registerAccount({
        user_id: userId.trim(),
        password,
        nickname: nickname.trim() || undefined,
        /* Optional, and for contacting somebody - never for signing in. */
        email: email.trim() || undefined
      })
    );
  };

  if (methods.loading) {
    return (
      <Section>
        <Loading />
      </Section>
    );
  }

  if (methods.error) {
    return (
      <Section>
        <ErrorState message={methods.error} onRetry={methods.reload} />
      </Section>
    );
  }

  const panel = (
    <Box
      w="100%"
      maxW="440px"
      p={{ base: 6, md: 10 }}
      borderRadius="18px"
      border="1px solid"
      borderColor={surface.border}
      bg={surface.card}
    >
      <Flex align="center" gap="2" data-gap="8" mb="1">
        <Icon
          as={device === 'mobile' ? FiSmartphone : FiMonitor}
          color={surface.muted}
          boxSize="4"
        />
        <Text fontSize="xs" color={surface.muted} textTransform="uppercase" letterSpacing="0.6px">
          {device} sign-in
        </Text>
      </Flex>

      <Heading size="lg" color={surface.text}>
        {mode === 'register' ? 'Create an account' : 'Sign in'}
      </Heading>

      <Text fontSize="sm" color={surface.muted} mt="2" mb="7">
        {mode === 'register'
          ? 'Choose a user ID and a password. An email address is optional.'
          : mode === 'otp'
            ? 'Enter your phone number and we will send you a code.'
            : mode === 'password'
              ? 'Sign in with your user ID and password.'
              : 'This device supports both methods - choose one.'}
      </Text>

      {error && (
        <Alert status="error" borderRadius="10px" mb="5" fontSize="sm">
          <AlertIcon />
          {error}
        </Alert>
      )}

      {/* ------------------------------------------- the chooser (tablets) */}
      {!mode && allowed.length > 1 && (
        <Stack spacing="3">
          <Button variant="brand" size="lg" onClick={() => setMode('password')}>
            {t('auth.login.emailAndPassword')}
          </Button>
          <Button variant="quiet" size="lg" onClick={() => setMode('otp')}>
            {t('auth.login.phoneNumberAndCode')}
          </Button>
        </Stack>
      )}

      {/* ------------------------------------------------ password sign-in */}
      {mode === 'password' && (
        <Box as="form" onSubmit={submitPassword}>
          <Stack spacing="4">
            <FormControl isRequired>
              <FormLabel fontSize="sm" fontWeight="600">
                {t('auth.login.userId')}
              </FormLabel>
              <Input
                autoComplete="username"
                value={userId}
                onChange={(event) => {
                  setUserId(event.target.value);
                  if (error) dispatch(clearError());
                }}
                placeholder={t('auth.login.demoCrystal')}
              />
            </FormControl>

            <FormControl isRequired>
              <FormLabel fontSize="sm" fontWeight="600">
                {t('auth.login.password')}
              </FormLabel>
              <InputGroup>
                <Input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (error) dispatch(clearError());
                  }}
                />
                <InputRightElement width="4.5rem" h="40px">
                  <Button size="xs" variant="ghost" onClick={() => setShowPassword((v) => !v)}>
                    {showPassword ? 'Hide' : 'Show'}
                  </Button>
                </InputRightElement>
              </InputGroup>
            </FormControl>

            <Button
              type="submit"
              variant="brand"
              size="lg"
              mt="2"
              isLoading={busy}
              isDisabled={!userId || !password}
            >
              {t('common.signIn')}
            </Button>
          </Stack>
        </Box>
      )}

      {/* ----------------------------------------------------- otp sign-in */}
      {mode === 'otp' && (
        <Box as="form" onSubmit={submitOtp}>
          <Stack spacing="4">
            <FormControl isRequired>
              <FormLabel fontSize="sm" fontWeight="600">
                {t('common.phoneNumber')}
              </FormLabel>
              <Flex gap="2" data-gap="8">
                <Input
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+8613800000001"
                />
                <Button
                  variant="quiet"
                  flexShrink={0}
                  isLoading={otpBusy}
                  isDisabled={!phone.trim() || cooldown > 0}
                  onClick={sendOtp}
                >
                  {cooldown > 0 ? `${cooldown}s` : otpSent ? 'Resend' : 'Send code'}
                </Button>
              </Flex>
            </FormControl>

            {otpNotice && (
              <Alert status="info" borderRadius="10px" fontSize="sm">
                <AlertIcon />
                {otpNotice}
              </Alert>
            )}

            {otpSent && (
              <FormControl isRequired>
                <FormLabel fontSize="sm" fontWeight="600">
                  {t('common.verificationCode')}
                </FormLabel>
                <HStack justify="space-between">
                  <PinInput
                    otp
                    value={code}
                    onChange={setCode}
                    size="lg"
                    placeholder="·"
                  >
                    {Array.from({ length: 6 }).map((ignored, index) => (
                      <PinInputField key={index} borderRadius="8px" />
                    ))}
                  </PinInput>
                </HStack>
              </FormControl>
            )}

            <Button
              type="submit"
              variant="brand"
              size="lg"
              mt="2"
              isLoading={busy}
              isDisabled={!otpSent || code.length < 6}
            >
              {t('common.signIn')}
            </Button>
          </Stack>
        </Box>
      )}

      {/* ------------------------------------------------------- registration */}
      {mode === 'register' && (
        <Box as="form" onSubmit={submitRegister}>
          <Stack spacing="4">
            <FormControl>
              <FormLabel fontSize="sm" fontWeight="600">
                {t('common.name')}
              </FormLabel>
              <Input
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder={t('auth.login.howWeShouldAddressYou')}
              />
            </FormControl>

            <FormControl isRequired>
              <FormLabel fontSize="sm" fontWeight="600">
                {t('auth.login.userId')}
              </FormLabel>
              <Input
                autoComplete="username"
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                placeholder={t('auth.login.lettersDigitsDotDashOr')}
              />
              <Text fontSize="xs" color={surface.muted} mt="1">
                {t('auth.login.thisIsWhatYouWill')}
              </Text>
            </FormControl>

            <FormControl>
              <FormLabel fontSize="sm" fontWeight="600">
                {t('common.email')} <Text as="span" color={surface.muted} fontWeight="400">({t('auth.login.optional')})</Text>
              </FormLabel>
              <Input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </FormControl>

            <FormControl isRequired>
              <FormLabel fontSize="sm" fontWeight="600">
                {t('auth.login.password')}
              </FormLabel>
              <Input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <Text fontSize="xs" color={surface.muted} mt="1">
                {t('common.atLeast8Characters')}
              </Text>
            </FormControl>

            <Button
              type="submit"
              variant="brand"
              size="lg"
              mt="2"
              isLoading={busy}
              isDisabled={!userId || password.length < 8}
            >
              {t('auth.login.createAccount')}
            </Button>
          </Stack>
        </Box>
      )}

      {/* --------------------------------------------------------- switching */}
      <Flex justify="center" gap="2" data-gap="8" mt="6" fontSize="sm" flexWrap="wrap">
        {mode === 'register' ? (
          <>
            <Text color={surface.muted}>{t('auth.login.alreadyHaveAnAccount')}</Text>
            <Box
              as="button"
              color="brand.500"
              fontWeight="600"
              onClick={() => setMode(allowed.indexOf('password') !== -1 ? 'password' : 'otp')}
            >
              {t('common.signIn')}
            </Box>
          </>
        ) : (
          <>
            {allowed.indexOf('password') !== -1 && (
              <>
                <Text color={surface.muted}>{t('auth.login.newToCrystal')}</Text>
                <Box
                  as="button"
                  color="brand.500"
                  fontWeight="600"
                  onClick={() => setMode('register')}
                >
                  {t('auth.login.createAnAccount')}
                </Box>
              </>
            )}
            {allowed.indexOf('password') === -1 && (
              <Text color={surface.muted} textAlign="center">
                {t('auth.login.verifyingACodeOnA')}
              </Text>
            )}
          </>
        )}
      </Flex>

      {allowed.length > 1 && mode && mode !== 'register' && (
        <Flex justify="center" mt="3">
          <Box
            as="button"
            fontSize="sm"
            color={surface.muted}
            onClick={() => setMode(mode === 'password' ? 'otp' : 'password')}
          >
            {mode === 'password' ? 'Use a phone number instead' : 'Use a user ID and password instead'}
          </Box>
        </Flex>
      )}
    </Box>
  );

  return (
    <Section py={{ base: 8, md: 16 }}>
      <Flex direction="column" align="center" gap="6" data-gap="24" data-gap-column>
        {panel}

        <Text fontSize="xs" color={surface.muted} textAlign="center" maxW="440px">
          {/*
            One sentence with the two credentials in it. It was four English
            fragments sewn around two <strong> tags - "on a desktop, or the
            phone number" never went through t() at all.
          */}
          {t('auth.login.demoAccountsFull', {
            email: 'demo@crystal.example',
            password: 'crystal1234',
            phone: '+8613800000001'
          })}{' '}
          <Box as={RouterLink} to="/support" color="brand.500">
            {t('auth.login.needHelp')}
          </Box>
        </Text>
      </Flex>
    </Section>
  );
}
