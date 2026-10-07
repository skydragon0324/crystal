import api from '@/api';

/**
 * SIGNING IN WITH THE SIM'S OWN CERTIFICATE - the phone's half of the idea
 * app/x509Agent.js carries for the desktop.
 *
 * The desktop keeps its certificate in a program on the PC and this page
 * posts messages to it. A phone has no such program and needs none: the
 * customised mobile browser reaches the SIM itself and exposes one call,
 *
 *     navigator.getSignedString(text)  ->  a base64 ECDSA-SHA384 signature
 *
 * made with a key that never leaves the card. So the steps are:
 *
 *   1. API      mik/challenge   -> a challenge, and the exact text to sign
 *   2. browser  getSignedString -> the signature, from the card
 *   3. API      mik/login       -> the signature, the user ID and the password
 *
 * THE PRIVATE KEY IS NEVER HERE, and neither is the certificate after
 * registration: this file holds a cid, a challenge and a signature, none of
 * which is worth anything on its own. The server checks the signature against
 * the public key it read out of the certificate when the card registered -
 * never against anything this page sends.
 *
 * WHAT IT DOES NOT PROVE. A signature says a trusted SIM is present. It does
 * NOT say the SIM belongs to the account being signed into: the user ID and
 * the password still decide that, and the server deliberately allows any
 * valid card to sign in any account. See the MIK note in
 * crystal-backend/src/services/memberAuth.service.js.
 *
 * EVERY DEVICE WITHOUT THE CALL IS UNCHANGED. `available()` is false in an
 * ordinary browser, and the sign-in page falls back to what it has always
 * done - user ID, password and a typed cid.
 */

/** A failure the sign-in button can explain, by dictionary address. */
export class MikError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

/**
 * Whether this browser can sign with the card.
 *
 * A function rather than a constant: the customised browser injects the call
 * when the page is created, and a module read at import time can be read
 * before that has happened.
 */
export function available() {
  return typeof navigator !== 'undefined' && typeof navigator.getSignedString === 'function';
}

/**
 * The signature for one challenge.
 *
 * The browser's call may answer in any of the three ways a native bridge
 * usually does - a string, a promise, or a callback - so all three are
 * accepted rather than assuming the one this was written against.
 */
function signWithCard(text) {
  return new Promise(function (resolve, reject) {
    let settled = false;
    const done = function (value) {
      if (settled) return;
      settled = true;
      const signature = String(value || '').trim();
      if (!signature) reject(new MikError('auth.signin.theCardWouldNotSign'));
      else resolve(signature);
    };

    /* A card that never answers must not leave the button spinning. */
    const timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      reject(new MikError('auth.signin.theCardDidNotAnswer'));
    }, 15000);

    try {
      const answered = navigator.getSignedString(text, function (value) {
        clearTimeout(timer);
        done(value);
      });

      if (answered && typeof answered.then === 'function') {
        answered.then(function (value) { clearTimeout(timer); done(value); },
          function (error) {
            clearTimeout(timer);
            if (settled) return;
            settled = true;
            reject(new MikError('auth.signin.theCardWouldNotSign', error && error.message));
          });
      } else if (answered !== undefined && answered !== null) {
        clearTimeout(timer);
        done(answered);
      }
    } catch (error) {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(new MikError('auth.signin.theCardWouldNotSign', error.message));
    }
  });
}

/**
 * Registers this card, so the server can check its signatures later.
 *
 * Done once per card. `mikData` is the card's certificate, which the
 * customised browser reads; the server verifies it against the MIK authority
 * before it stores anything.
 */
export async function registerCard(cid, mikData) {
  const { data } = await api.auth.mikRegister(cid, mikData);
  return data;
}

/**
 * The whole sign-in: a challenge, the card's signature, and the session.
 *
 * Returns what /auth/mik/login returned, which is the same session shape
 * every other sign-in here produces.
 */
export async function mikSignIn(userId, password, cid) {
  if (!available()) throw new MikError('auth.signin.thisBrowserCannotUseTheSim');

  const { data: issued } = await api.auth.mikChallenge(cid);

  /*
   * The server says what to sign rather than this page building it. Both
   * sides would otherwise hold the same format, and a signature over text the
   * server did not expect fails with nothing to show for it.
   */
  const signature = await signWithCard(issued.sign_data);

  const { data } = await api.auth.mikLogin({
    user_id: userId,
    password: password,
    cid: cid,
    challenge: issued.challenge,
    signature: signature
  });

  return data;
}

/** What a failed card sign-in says, in the reader's language. */
export function mikFailureText(t, error) {
  switch (error) {
    case 'auth.signin.thisBrowserCannotUseTheSim': return t('auth.signin.thisBrowserCannotUseTheSim');
    case 'auth.signin.theCardWouldNotSign': return t('auth.signin.theCardWouldNotSign');
    case 'auth.signin.theCardDidNotAnswer': return t('auth.signin.theCardDidNotAnswer');
    default: return error ? t(error) : t('auth.signin.couldNotSignIn');
  }
}
