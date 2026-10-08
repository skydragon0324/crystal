/**
 * WHICH SIGN-IN THIS DEVICE GETS - decided here, without asking.
 *
 * This used to be a request. `/auth/methods` returned the device class, the
 * methods it allows and whether certificate sign-in is configured, and three
 * places waited for it before they could draw anything. The answer never
 * varies: it is a User-Agent put through a table that has not changed, so the
 * request bought a round trip, a loading state in each of those three places,
 * and a failure branch for a question that cannot really fail.
 *
 * THE TABLE IS THE SERVER'S, COPIED. That is the cost of this, and it is paid
 * openly: there are two implementations of one rule now, so they are held
 * together by __fixtures__/device-vectors.json - every vector in it generated
 * by crystal-backend/src/utils/device.js itself, and checked against this file
 * by authMethods.test.js. Changing the rule means regenerating that fixture,
 * which is the same deal security/__fixtures__/signing-vectors.json has.
 *
 * THE SERVER STILL DECIDES WHAT IT ACCEPTS. Nothing here is a permission -
 * it chooses which form to DRAW. A client that guesses wrong gets its request
 * refused by the endpoint exactly as before, which is why guessing is safe to
 * do: the worst case is a form that turns out to be the wrong one, not an
 * authentication that should not have happened.
 *
 * ORDER MATTERS in the patterns, and it is the server's order. Every Android
 * tablet UA also contains "Android", so tablets are tested first; and an
 * iPadOS UA that says it is desktop Safari is read as a desktop, here as
 * there, because neither side can see anything in it that says otherwise.
 */

/* The server's TABLET_PATTERNS, in the server's order. */
const TABLET_PATTERNS = [
  /\bipad\b/i,
  /\btablet\b/i,
  /\bplaybook\b/i,
  /\b(kindle|silk)\b/i,
  /android(?!.*\bmobile\b)/i
];

/* The server's MOBILE_PATTERNS, in the server's order. */
const MOBILE_PATTERNS = [
  /\bmobile\b/i,
  /\biphone\b/i,
  /\bipod\b/i,
  /\bandroid\b.*\bmobile\b/i,
  /\b(blackberry|bb10|windows phone|iemobile|opera mini|opera mobi)\b/i
];

export const DESKTOP = 'desktop';
export const MOBILE = 'mobile';
export const TABLET = 'tablet';

/** The device class, from a User-Agent. An absent one is a desktop. */
export function detectDevice(userAgent) {
  const ua = String(userAgent || '');
  if (!ua) return DESKTOP;

  for (let i = 0; i < TABLET_PATTERNS.length; i += 1) {
    if (TABLET_PATTERNS[i].test(ua)) return TABLET;
  }
  for (let j = 0; j < MOBILE_PATTERNS.length; j += 1) {
    if (MOBILE_PATTERNS[j].test(ua)) return MOBILE;
  }
  return DESKTOP;
}

/**
 * Which auth types a device may use - the ORIGINAL page's rule, which is
 * what /auth/reganam still draws from. A tablet may have a SIM or may not,
 * so it is allowed either and gets a chooser.
 */
export function allowedAuthTypes(device) {
  if (device === MOBILE) return ['otp'];
  if (device === TABLET) return ['password', 'otp'];
  return ['password'];
}

/**
 * WHICH FORM /login SHOWS, which is a different question from the one above.
 *
 *   desktop          'certificate'  no form; the agent on the PC signs the
 *                                   X.509 challenge
 *   phone, tablet    'password'     user ID and password, plus the SIM's cid
 *
 * A tablet takes the phone's form: the certificate agent is a desktop
 * program and a tablet has nowhere to run it.
 */
export function loginFormFor(device) {
  return device === DESKTOP ? 'certificate' : 'password';
}

/**
 * MAY THE CERTIFICATE BUTTON WORK HERE AT ALL - the vendor's own rule.
 *
 * ClientNavLinks.handleLogin runs the card reader in production and falls
 * back to the password page otherwise, because a development machine has no
 * reader attached. That is a build-time constant, which is why it can live on
 * this side: `npm start` gets the password page and a deployed build gets the
 * agent.
 *
 * It is NOT a claim that the deployment has x509 configured - the server
 * knows that and will refuse the challenge if it does not, with the message
 * the page already shows.
 */
export function certificateReady() {
  return process.env.NODE_ENV === 'production';
}

/**
 * The whole answer, in the shape `/auth/methods` used to return - so the
 * pages that read it did not have to be rewritten around a new one.
 *
 * `userAgent` is for tests; it reads the browser's own by default.
 */
export function authMethods(userAgent) {
  const ua = userAgent === undefined
    ? (typeof navigator === 'undefined' ? '' : navigator.userAgent)
    : userAgent;

  const device = detectDevice(ua);
  const allowed = allowedAuthTypes(device);

  return {
    device: device,
    allowed: allowed,
    /* The page draws whichever form this names. */
    primary: allowed[0],
    login: loginFormFor(device),
    certificate: certificateReady()
  };
}

export default authMethods;
