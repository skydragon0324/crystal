import React, { useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useHistory, useLocation } from 'react-router-dom';
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Flex,
  FormControl,
  FormHelperText,
  FormLabel,
  Heading,
  Icon,
  Input,
  InputGroup,
  InputRightElement,
  Spinner,
  Stack,
  Text
} from '@chakra-ui/react';
import { FiMonitor, FiShield, FiSmartphone } from 'react-icons/fi';
import { useDispatch, useSelector } from 'react-redux';

import { ErrorState, Loading, Section } from '@/components/common';
import api from '@/api';
import { useApi } from '@/hooks/useApi';
import {
  clearError,
  selectAuthStatus,
  signInWithCertificate,
  signInWithPassword
} from '@/app/authSlice';
import safeNext from '@/app/safeNext';
import { failureText } from '@/app/x509Agent';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * SIGN IN - /login.
 *
 * The page that was here moved to /auth/reganam, unchanged, and this one
 * replaced it. Two forms, and the SERVER picks which (`/auth/methods` answers
 * `login`), for the same reason the old page let it: the server is the one
 * that will accept or refuse the request, so the client does not guess from
 * its own User-Agent.
 *
 *   DESKTOP   no form. A desktop's Sign in button signs in where it is
 *             (hooks/useSignIn), so a member only lands here when a page that
 *             needs a session sent them - and then it signs in by itself, with
 *             the certificate agent (app/x509Agent.js), and shows only its
 *             progress, or what went wrong and a way to try again. With
 *             certificate sign-in off it hands over to the password page at
 *             /auth/reganam, keeping `next`, as the vendor does in development.
 *
 *   PHONE     the user ID and password form, plus the SIM's CID. The CID is
 *             recorded with the sign-in and never used to refuse it.
 *
 * AFTER SIGNING IN it goes where `?next=` says, which may be a page on the
 * Eshop or the Appstore - their shared header sends signed-out members here
 * with the page they were on. safeNext is what stops that being used to send a
 * member anywhere else.
 */
export default function SignIn() {
  const t = useT();
  const surface = useSurface();
  const dispatch = useDispatch();
  const history = useHistory();
  const location = useLocation();

  const status = useSelector(selectAuthStatus);
  const error = useSelector((state) => state.auth.error);
  const busy = status === 'pending';

  const methods = useApi(() => api.auth.methods(), []);
  const form = methods.data ? methods.data.login : null;
  const certificateReady = !!(methods.data && methods.data.certificate);

  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [cid, setCid] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const desktop = form === 'certificate';

  /* A stale error from another page is not this page's error. */
  useEffect(() => {
    dispatch(clearError());
  }, [dispatch]);

  /*
   * THE DESKTOP SIGNS IN BY ITSELF, once, when the methods answer arrives.
   * Not again on a failure - that waits for the member to press Try again,
   * rather than asking the agent in a loop.
   */
  const started = useRef(false);
  useEffect(() => {
    /* A session being restored may already be the answer. */
    if (!desktop || started.current || status === 'authenticated' || status === 'restoring') return;
    started.current = true;

    if (certificateReady) dispatch(signInWithCertificate());
    else history.replace(`/auth/reganam${location.search}`);
  }, [desktop, certificateReady, status, dispatch, history, location.search]);

  useEffect(() => {
    if (status !== 'authenticated') return;

    const target = safeNext(new URLSearchParams(location.search).get('next'), '/account');
    if (target.external) window.location.assign(target.external);
    else history.replace(target.internal);
  }, [status, history, location.search]);

  const edited = (setter) => (event) => {
    /* Read before anything else: React 16 pools the event. */
    const value = event.target.value;
    setter(value);
    if (error) dispatch(clearError());
  };

  const submitPassword = (event) => {
    event.preventDefault();
    if (!userId.trim() || !password || !cid.trim()) return;
    dispatch(signInWithPassword({ user_id: userId.trim(), password: password, cid: cid.trim() }));
  };

  if (methods.loading) {
    return (
      <Section py={{ base: 8, md: 16 }}>
        <Loading variant="block" height="320px" />
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

  return (
    <Section py={{ base: 8, md: 16 }}>
      <Flex direction="column" align="center">
        <Box
          w="100%"
          maxW="440px"
          p={{ base: 6, md: 10 }}
          borderRadius="18px"
          border="1px solid"
          borderColor={surface.border}
          bg={surface.card}
        >
          <Flex align="center" mb="1">
            <Icon as={desktop ? FiMonitor : FiSmartphone} color={surface.muted} boxSize="4" mr="2" />
            <Text fontSize="xs" color={surface.muted} textTransform="uppercase" letterSpacing="0.6px">
              {desktop ? t('auth.signin.desktopSignIn') : t('auth.signin.mobileSignIn')}
            </Text>
          </Flex>

          <Heading size="lg" color={surface.text}>
            {t('common.signIn')}
          </Heading>

          <Text fontSize="sm" color={surface.muted} mt="2" mb="7">
            {desktop ? t('auth.signin.useTheCertificate') : t('auth.signin.useYourUserId')}
          </Text>

          {error && (
            <Alert status="error" borderRadius="10px" mb="5" fontSize="sm" whiteSpace="pre-line">
              <AlertIcon />
              {failureText(t, error)}
            </Alert>
          )}

          {/* ------------------------------------------- desktop: certificate */}
          {desktop && (
            <Stack spacing="4">
              {!error && (
                <Flex align="center" color={surface.muted} fontSize="sm">
                  <Spinner size="sm" color="brand.500" mr="3" />
                  {t('auth.signin.signingInWithCertificate')}
                </Flex>
              )}

              {error && (
                <Button
                  variant="brand"
                  size="lg"
                  leftIcon={<FiShield />}
                  isLoading={busy}
                  onClick={() => dispatch(signInWithCertificate())}
                >
                  {t('auth.signin.tryAgain')}
                </Button>
              )}

              <Text fontSize="xs" color={surface.muted}>
                {t('auth.signin.agentMustBeRunning')}
              </Text>
            </Stack>
          )}

          {/* ------------------------------------ phone: user ID, password, CID */}
          {!desktop && (
            <Box as="form" onSubmit={submitPassword}>
              <Stack spacing="4">
                <FormControl isRequired>
                  <FormLabel fontSize="sm" fontWeight="600">{t('auth.signin.userId')}</FormLabel>
                  <Input autoComplete="username" value={userId} onChange={edited(setUserId)} />
                </FormControl>

                <FormControl isRequired>
                  <FormLabel fontSize="sm" fontWeight="600">{t('auth.signin.password')}</FormLabel>
                  <InputGroup>
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={edited(setPassword)}
                    />
                    <InputRightElement width="4.5rem" h="40px">
                      <Button size="xs" variant="ghost" onClick={() => setShowPassword((shown) => !shown)}>
                        {showPassword ? t('auth.signin.hide') : t('auth.signin.show')}
                      </Button>
                    </InputRightElement>
                  </InputGroup>
                </FormControl>

                <FormControl isRequired>
                  <FormLabel fontSize="sm" fontWeight="600">{t('auth.signin.cid')}</FormLabel>
                  <Input
                    inputMode="numeric"
                    autoComplete="off"
                    /* The width the platform stores a cid in (ora_pid.user_login_log). */
                    maxLength={12}
                    value={cid}
                    onChange={edited(setCid)}
                  />
                  <FormHelperText fontSize="xs">{t('auth.signin.cidHelp')}</FormHelperText>
                </FormControl>

                <Button
                  type="submit"
                  variant="brand"
                  size="lg"
                  mt="2"
                  isLoading={busy}
                  isDisabled={!userId.trim() || !password || !cid.trim()}
                >
                  {t('common.signIn')}
                </Button>
              </Stack>
            </Box>
          )}
        </Box>

        <Box as={RouterLink} to="/support/contact" color="brand.500" fontSize="xs" mt="6">
          {t('auth.signin.needHelp')}
        </Box>
      </Flex>
    </Section>
  );
}
