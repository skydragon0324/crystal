'use strict';

const ecdsa = require('./ecdsa');
const rsa = require('./rsa');

/**
 * THE ALGORITHM REGISTRY - the only place a name becomes an implementation.
 *
 * Two lookups and no third:
 *
 *   byConfig     CONTENT_SIGNING_ALGORITHM, read once at startup, decides
 *                what NEW signatures are made with.
 *   byEnvelope   the algorithm a TRUSTED KEY was recorded with. The verifier
 *                finds the key by its id first, and the key's own algorithm
 *                picks the implementation; the `algorithm` string in an
 *                envelope is only ever compared against it, never used to
 *                choose code.
 *
 * Nothing here is `require`d by name, and no string that arrived in a request
 * or a response reaches either table as anything but a key to look up - own
 * properties only, so `constructor` or `__proto__` is simply not found.
 *
 * There is no fallback. An unknown name is null, and every caller treats
 * null as a refusal.
 */

const BY_CONFIG = { ECDSA: ecdsa, RSA: rsa };
const BY_ENVELOPE = {};
BY_ENVELOPE[ecdsa.name] = ecdsa;
BY_ENVELOPE[rsa.name] = rsa;

function own(table, name) {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(table, name) ? table[name] : null;
}

function byConfig(value) {
  return own(BY_CONFIG, value);
}

function byEnvelope(name) {
  return own(BY_ENVELOPE, name);
}

/**
 * Which implementation a public key belongs to, read from the KEY - used for
 * a verification-only certificate, which has no configuration of its own to
 * say. EC P-256 is ECDSA, an RSA key of at least 3072 bits is RSA-PSS, and
 * anything else is null.
 */
function forPublicKey(publicKey) {
  if (!ecdsa.keyProblem(publicKey)) return ecdsa;
  if (!rsa.keyProblem(publicKey)) return rsa;
  return null;
}

module.exports = {
  CONFIG_VALUES: Object.keys(BY_CONFIG),
  ENVELOPE_NAMES: Object.keys(BY_ENVELOPE),
  ecdsa: ecdsa,
  rsa: rsa,
  byConfig: byConfig,
  byEnvelope: byEnvelope,
  forPublicKey: forPublicKey
};
