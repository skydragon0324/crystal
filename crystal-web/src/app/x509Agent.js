import api from '@/api';

/**
 * SIGNING IN WITH THE MEMBER'S CERTIFICATE - the vendor's flow, step for step.
 *
 * The certificate never touches this page. It lives in a CERTIFICATE AGENT, a
 * program on the member's own PC listening on 127.0.0.1:20206, and the page's
 * job is to carry messages between that agent and the API:
 *
 *   1. agent     primaryData      -> its random number, its version, the user ID
 *   2. API       primary_data     -> the server's random number, signed by the server
 *   3. agent     secondaryData    -> checks the server's signature, signs the
 *                                   challenge with the member's key, and returns
 *                                   the certificate and the signature
 *   4. API       x509_login       -> checks both, and signs the member in
 *
 * Transcribed from vendor_client/src/utils/X509Utils.js, including what the
 * agent sends back when it cannot help ("Cert Not Loaded", "Repeat Login",
 * "Auth Fail") and the text step 4 is signed over:
 * client_rand + server_rand + the host of the server certificate's URL.
 *
 * THE AGENT IS CALLED WITH A PLAIN FORM POST and nothing else, which is why
 * this does not use the API client. The vendor used jQuery's $.ajax, which
 * sends `application/x-www-form-urlencoded` with no custom headers - a
 * "simple" request, no preflight. The API client adds Authorization, X-Lang and
 * X-Crystal-Device to everything, and any one of those turns the call into a
 * preflighted one the agent has never been asked to answer.
 */

const AGENT = process.env.REACT_APP_X509_AGENT_URL || 'http://127.0.0.1:20206';
const TIMEOUT = 10000;

/**
 * A failure the sign-in button can explain. `code` is the dictionary address
 * of the message, so it is translated where it is shown.
 */
export class X509Error extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

/**
 * What a failed sign-in says, in the reader's language. Each agent failure is
 * looked up by its address here, where the dictionary checks can see it; any
 * other message is the API's, already translated, and passes through t().
 */
export function failureText(t, error) {
  switch (error) {
    case 'auth.signin.agentUnreachable': return t('auth.signin.agentUnreachable');
    case 'auth.signin.certNotLoaded': return t('auth.signin.certNotLoaded');
    case 'auth.signin.repeatLogin': return t('auth.signin.repeatLogin');
    case 'auth.signin.agentAuthFail': return t('auth.signin.agentAuthFail');
    case 'auth.signin.agentRefused': return t('auth.signin.agentRefused');
    default: return error ? t(error) : t('auth.signin.couldNotSignIn');
  }
}

/** One form post to the agent. Resolves with its JSON reply. */
function askAgent(fields) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', AGENT, true);
    xhr.timeout = TIMEOUT;
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');

    xhr.onload = () => {
      try {
        resolve(JSON.parse(xhr.responseText));
      } catch (err) {
        reject(new X509Error('auth.signin.agentUnreachable'));
      }
    };
    /* No agent running, the port blocked, or no answer in ten seconds. */
    xhr.onerror = () => reject(new X509Error('auth.signin.agentUnreachable'));
    xhr.ontimeout = () => reject(new X509Error('auth.signin.agentUnreachable'));

    const body = Object.keys(fields)
      .map((key) => encodeURIComponent(key) + '=' + encodeURIComponent(fields[key]))
      .join('&');

    xhr.send(body);
  });
}

/** "1.2.1.4" -> 1214, the way the vendor compares agent versions. */
export function agentVersion(text) {
  return parseInt(String(text || '').replace(/\./g, ''), 10) || 0;
}

/** The host the agent's signed text ends with, from the server certificate's URL. */
export function hostOf(url) {
  return String(url || '').split('//').pop().split('/')[0];
}

/**
 * The whole sign-in. Resolves with the session the API returned; rejects with
 * an X509Error, or the API's own error for a refusal it explains.
 */
export async function x509SignIn() {
  /* 1 */
  const primary = await askAgent({ request: 'primaryData' });

  if (primary.err_message === 'Cert Not Loaded') throw new X509Error('auth.signin.certNotLoaded');
  if (primary.err_message === 'Repeat Login') throw new X509Error('auth.signin.repeatLogin');
  if (primary.err_message) throw new X509Error('auth.signin.agentRefused', primary.err_message);

  const clientRand = primary.rand;
  const userId = primary.userid;

  /* 2 */
  const { data: challenge } = await api.auth.x509PrimaryData(clientRand, userId, agentVersion(primary.version));

  /* 3 */
  const secondary = await askAgent({
    request: 'secondaryData',
    url: challenge.url,
    server_rand: challenge.server_rand,
    server_sign: challenge.server_sign
  });

  if (secondary.err_message === 'Auth Fail') throw new X509Error('auth.signin.agentAuthFail');
  if (secondary.err_message) throw new X509Error('auth.signin.agentRefused', secondary.err_message);

  /* 4 - base64 in the browser, as the vendor's forge.util.encode64 did. */
  const plain = String(clientRand) + String(challenge.server_rand) + hostOf(challenge.url);

  const { data } = await api.auth.x509Login({
    certData: secondary.certData,
    certType: secondary.certType,
    signData: secondary.signData,
    plainData: window.btoa(plain)
  });

  return data;
}
