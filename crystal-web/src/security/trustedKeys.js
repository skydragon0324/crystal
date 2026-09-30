import { algorithmFor } from './algorithms';
import { base64ToBytes } from './bytes';

/**
 * THE KEYS THIS STOREFRONT TRUSTS, pinned into the bundle when it is built.
 *
 * REACT_APP_CONTENT_SIGNING_KEYS is a JSON array (CONTRACT §3):
 *
 *     [{"keyId":"content-key-dev","algorithm":"ECDSA-P256-SHA256","spki":"<base64 DER>"}]
 *
 * Create React App inlines REACT_APP_ variables at BUILD time, so the list is
 * part of the JavaScript the visitor downloads from this site - it is not
 * fetched, and nothing an API response says can add to it. That is the whole
 * trust model: a certificate or a key that arrives in a response is data about
 * a claim, never a reason to believe it. Several entries are several trusted
 * keys, which is how a rotation is carried out: the new key is added and the
 * site rebuilt BEFORE the backend starts signing with it.
 *
 * A LIST THAT IS WRONG IS A LIST THAT TRUSTS NOTHING. Malformed JSON, an entry
 * missing a field, an algorithm this build does not know, a key id listed
 * twice - any one of them rejects the whole list, rather than quietly
 * trusting whichever entries happened to parse. Half a trust list during a
 * rotation is a state nobody can reason about. Signed content then shows its
 * invalid state everywhere, and the console says exactly why, once.
 *
 * AN EMPTY LIST IS NOT AN ERROR IN THE LIST, but it verifies nothing either:
 * every key id is unknown. That is what a build made without the variable
 * looks like, and it is loud in the console for the same reason.
 *
 * Extra fields on an entry are ignored rather than refused, so a key file that
 * later carries a certificate fingerprint or an expiry note does not take the
 * site down with it.
 */

const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

/**
 * Parses a trust list. Pure - no logging, no environment - so it can be tested
 * with every shape of mistake.
 *
 * @returns {{ keys: Object<string, {keyId, algorithm, spki: Uint8Array}>, error: string|null, empty: boolean }}
 */
export function parseTrustedKeys(raw) {
  const none = (error, empty) => ({ keys: {}, error: error, empty: !!empty });

  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return none(null, true);
  }

  let list;
  try {
    list = JSON.parse(String(raw));
  } catch (err) {
    return none('REACT_APP_CONTENT_SIGNING_KEYS is not valid JSON');
  }

  if (!Array.isArray(list)) return none('REACT_APP_CONTENT_SIGNING_KEYS must be a JSON array');
  if (!list.length) return none(null, true);

  const keys = {};

  for (let i = 0; i < list.length; i += 1) {
    const entry = list[i];
    const at = 'entry ' + i;

    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return none(at + ' is not an object');
    }
    if (typeof entry.keyId !== 'string' || !KEY_ID.test(entry.keyId)) {
      return none(at + ' has no valid keyId');
    }
    if (!algorithmFor(entry.algorithm)) {
      return none(at + ' (' + entry.keyId + ') has an unsupported algorithm "' + entry.algorithm + '"');
    }

    const spki = base64ToBytes(entry.spki);
    if (!spki || spki.length < 64) {
      return none(at + ' (' + entry.keyId + ') has no valid base64 spki');
    }

    if (Object.prototype.hasOwnProperty.call(keys, entry.keyId)) {
      return none('key id "' + entry.keyId + '" is listed twice');
    }

    keys[entry.keyId] = Object.freeze({
      keyId: entry.keyId,
      algorithm: entry.algorithm,
      spki: spki
    });
  }

  return { keys: keys, error: null, empty: false };
}

let pinned = null;

/**
 * The build's trust list, parsed once for the life of the page.
 *
 * The one console line is written here, on first use, so a misconfigured
 * build says so the first time a signed item is checked - not once per item.
 */
export function pinnedTrustedKeys() {
  if (pinned) return pinned;

  pinned = parseTrustedKeys(process.env.REACT_APP_CONTENT_SIGNING_KEYS);

  if (pinned.error) {
    // eslint-disable-next-line no-console
    console.error(
      '[content-integrity] The trusted signing key list is malformed, so NO signed content ' +
      'will verify: ' + pinned.error + '. Fix REACT_APP_CONTENT_SIGNING_KEYS and rebuild.'
    );
  } else if (pinned.empty) {
    // eslint-disable-next-line no-console
    console.error(
      '[content-integrity] No trusted signing keys are configured ' +
      '(REACT_APP_CONTENT_SIGNING_KEYS is empty), so NO signed content will verify. ' +
      'In development run `npm run content-keys` in crystal-backend and restart the dev server.'
    );
  }

  return pinned;
}
