import { EXTERNAL } from '@/components/layout/siteNav';

/**
 * WHERE TO GO AFTER SIGNING IN - and never somewhere an attacker chose.
 *
 * `?next=` used to be a path inside this site and nothing else. The Eshop and
 * the Appstore now send a signed-out member here with `next` set to the page
 * they were on, which is a full URL on another host - so the sign-in page has
 * to follow an absolute URL. An unguarded one is an open redirect: a phishing
 * link to the real Crystal sign-in page that lands the member, freshly signed
 * in and trusting it, on a copy of it somewhere else.
 *
 * So:
 *   a path on this site ("/account/eshop/card")   followed
 *   a URL on the Eshop's or the Appstore's host    followed
 *   a URL on any other host                        ignored
 *   "//evil.example" and "/\evil.example"          ignored - both are read by
 *                                                  a browser as another host
 *   javascript:, data: and anything else           ignored
 *
 * Returns { internal: '/path' } or { external: 'https://...' }, or the
 * fallback as internal.
 */

function allowedHosts() {
  return Object.keys(EXTERNAL)
    .map((key) => {
      try {
        return new URL(EXTERNAL[key]).host;
      } catch (err) {
        return null;
      }
    })
    .filter(Boolean);
}

export default function safeNext(next, fallback) {
  const home = { internal: fallback || '/account' };
  const value = String(next || '').trim();
  if (!value) return home;

  /* A path on this site - but not a protocol-relative URL in disguise. */
  if (value.charAt(0) === '/' && value.charAt(1) !== '/' && value.charAt(1) !== '\\') {
    return { internal: value };
  }

  let url;
  try {
    url = new URL(value);
  } catch (err) {
    return home;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return home;
  if (allowedHosts().indexOf(url.host) === -1) return home;

  return { external: url.href };
}
