import { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { useHistory, useLocation } from 'react-router-dom';
import { useToast } from '@chakra-ui/react';

import authMethods from '@/app/authMethods';
import { signInWithCertificate } from '@/app/authSlice';
import { failureText } from '@/app/x509Agent';
import { useT } from '@/i18n';

/**
 * THE SIGN IN BUTTON - what pressing it does, everywhere it appears.
 *
 * The vendor's header button does not open a page on a desktop: it runs the
 * certificate sign-in right there and the member stays on the page they were
 * reading (ClientNavLinks.handleLogin). This does the same, and decides where
 * a click goes from the device and the build:
 *
 *   phone or tablet                     /login, the user ID, password and CID form
 *   desktop, certificate sign-in on     signs in, in place; a failure is a toast
 *   desktop, certificate sign-in off    /auth/reganam, the password page - the
 *                                       vendor's development fallback
 *
 * IT ASKS NOTHING FIRST. This used to await `/auth/methods` before it could
 * act, which made the first press of the button wait for a round trip to
 * learn something that never varies. The table is local now - see
 * app/authMethods.js - so the press does what it does immediately.
 *
 * The pages it goes to keep `next`, the page the member was on, so signing in
 * brings them back to it.
 */

/**
 * Where a click goes, from the methods answer and the page to come back to.
 * { certificate: true } means sign in here; otherwise { to: '/path?next=' }.
 */
export function signInRoute(methods, back) {
  const query = back && back !== '/' ? `?next=${encodeURIComponent(back)}` : '';

  if (!methods || methods.login !== 'certificate') return { to: `/login${query}` };
  if (!methods.certificate) return { to: `/auth/reganam${query}` };
  return { certificate: true };
}

export default function useSignIn() {
  const t = useT();
  const toast = useToast();
  const dispatch = useDispatch();
  const history = useHistory();
  const location = useLocation();

  return useCallback(async () => {
    const back = location.pathname + location.search;

    const route = signInRoute(authMethods(), back);
    if (route.to) {
      history.push(route.to);
      return;
    }

    const result = await dispatch(signInWithCertificate());
    if (signInWithCertificate.rejected.match(result)) {
      toast({
        status: 'error',
        title: t('auth.signin.couldNotSignIn'),
        description: failureText(t, result.payload),
        isClosable: true
      });
    }
  }, [dispatch, history, location.pathname, location.search, t, toast]);
}
