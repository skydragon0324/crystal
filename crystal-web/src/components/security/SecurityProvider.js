import React, { createContext, useContext } from 'react';

import { defaultVerifier } from '@/security/verifyContent';

/**
 * WHICH VERIFIER THE COMPONENTS BELOW USE.
 *
 * Nothing mounts this in the application. With no provider above it, every
 * verified component uses the storefront's own verifier - the trust list
 * pinned at build time, the page's WebCrypto, window.fetch - which is the only
 * configuration a visitor can ever be running.
 *
 * It exists for the tests, which cannot use that one: Jest has no WebCrypto,
 * no network, and no keys. A test wraps what it mounts in a provider holding a
 * verifier made from a Node-backed crypto shim, a stubbed fetch and a trust
 * list of test-only keys, and the component under test runs its real
 * verification path against them.
 *
 * Production mode is selected by defaultVerifier. Tests can still inject a
 * verifier here; the HTTP compatibility switch is build-time configuration,
 * not mutable page state.
 */

const SecurityContext = createContext(null);

export function SecurityProvider({ verifier, children }) {
  return <SecurityContext.Provider value={verifier || null}>{children}</SecurityContext.Provider>;
}

export function useVerifier() {
  return useContext(SecurityContext) || defaultVerifier();
}

export default SecurityProvider;
