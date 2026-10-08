/*
 * TWO IMPLEMENTATIONS OF ONE RULE, HELD TOGETHER.
 *
 * The storefront decides which sign-in form to draw without asking the
 * server, which it can only do by holding a copy of the server's device
 * table. A copy drifts. So every vector here was produced by
 * crystal-backend/src/utils/device.js ITSELF - the User-Agent put in, and the
 * device class, allowed methods and login form it answered with - and the
 * storefront's own code has to agree with all of them.
 *
 * __fixtures__/device-vectors.json is therefore a copy, with the same deal as
 * security/__fixtures__/signing-vectors.json: if the server's rule changes,
 * regenerate it, and a disagreement fails here rather than showing somebody
 * an OTP field the API will refuse.
 *
 * THE AWKWARD CASES ARE IN IT ON PURPOSE. Every Android tablet UA also
 * contains "Android", and an iPadOS UA claims to be desktop Safari - the two
 * places this rule is easiest to get subtly wrong, and the two the server's
 * own comments call out.
 */
import {
  DESKTOP, MOBILE, TABLET,
  detectDevice, allowedAuthTypes, loginFormFor, certificateReady, authMethods
} from '../app/authMethods';
import { signInRoute } from '../hooks/useSignIn';

const VECTORS = require('../app/__fixtures__/device-vectors.json');

test('the fixture is the backend\'s, and covers all three device classes', () => {
  /* A fixture that silently lost its awkward cases would make the rest of
     this file pass while proving much less. */
  expect(VECTORS.vectors.length).toBeGreaterThanOrEqual(17);

  const classes = VECTORS.vectors.map((vector) => vector.device);
  expect(classes).toContain(DESKTOP);
  expect(classes).toContain(MOBILE);
  expect(classes).toContain(TABLET);

  /* The two traps, by name. */
  const named = VECTORS.vectors.map((vector) => vector.name);
  expect(named).toContain('android-tablet');
  expect(named).toContain('ipados-desktop-ua');
});

describe('every vector the server produced', () => {
  VECTORS.vectors.forEach((vector) => {
    test(vector.name + ' is a ' + vector.device, () => {
      expect(detectDevice(vector.userAgent)).toBe(vector.device);
      expect(allowedAuthTypes(vector.device)).toEqual(vector.allowed);
      expect(loginFormFor(vector.device)).toBe(vector.login);

      /* And through the one function the pages actually call. */
      const answer = authMethods(vector.userAgent);
      expect(answer.device).toBe(vector.device);
      expect(answer.allowed).toEqual(vector.allowed);
      expect(answer.login).toBe(vector.login);
      expect(answer.primary).toBe(vector.allowed[0]);
    });
  });
});

test('an Android phone is a phone and an Android tablet is a tablet', () => {
  /*
   * Spelled out rather than left to the vectors, because this is the one
   * ordering the patterns exist for: the tablet test has to run first, since
   * a phone UA also matches `android(?!.*mobile)` only by NOT saying mobile.
   */
  const phone = VECTORS.vectors.filter((v) => v.name === 'android-phone-chrome')[0];
  const tablet = VECTORS.vectors.filter((v) => v.name === 'android-tablet')[0];

  expect(detectDevice(phone.userAgent)).toBe(MOBILE);
  expect(detectDevice(tablet.userAgent)).toBe(TABLET);
});

test('nothing at all is a desktop, which is what an absent User-Agent means', () => {
  expect(detectDevice('')).toBe(DESKTOP);
  expect(detectDevice(null)).toBe(DESKTOP);
  expect(detectDevice(undefined)).toBe(DESKTOP);
});

test('the certificate button follows the build, as the vendor\'s does', () => {
  /*
   * ClientNavLinks.handleLogin runs the reader in production and falls back
   * to the password page otherwise, because a development machine has no
   * reader attached. Under the test runner that is 'test', which is not
   * production - so the fallback is what a test sees, and that is correct.
   */
  expect(certificateReady()).toBe(false);
  expect(authMethods('').certificate).toBe(false);
});

test('a desktop with no reader lands on the password page, not a dead button', () => {
  /*
   * The two halves together: the local table says this is a desktop whose
   * certificate sign-in is off, and the button therefore opens the vendor's
   * own page rather than asking an agent that is not there.
   */
  const desktop = authMethods(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.121 Safari/537.36'
  );
  expect(signInRoute(desktop, '/about')).toEqual({ to: '/auth/reganam?next=%2Fabout' });

  /* With it on - a deployed build - the same desktop signs in where it is. */
  expect(signInRoute({ ...desktop, certificate: true }, '/about')).toEqual({ certificate: true });

  /* And a phone gets the /login form either way. */
  const phone = authMethods(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1'
  );
  expect(signInRoute(phone, '/about')).toEqual({ to: '/login?next=%2Fabout' });
});

test('the storefront no longer asks the server which form to draw', () => {
  /*
   * The point of all of the above. `api.auth.methods` is gone, so a page that
   * starts waiting for it again fails to compile rather than quietly adding
   * a round trip back in front of the sign-in button.
   */
  const api = require('../api').default;
  expect(api.auth.methods).toBeUndefined();
});
