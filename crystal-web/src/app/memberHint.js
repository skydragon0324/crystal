/**
 * "IS SOMEBODY SIGNED IN?" - SAID ONCE, ON THE PARENT DOMAIN, FOR THE CHROME.
 *
 * The Eshop and the Appstore draw Crystal's header with crystal-chrome.js, and
 * that header should say "My account" to a member who is signed in and "Sign
 * in" to everybody else. It cannot find out from the session: the tokens live
 * in THIS site's localStorage, and localStorage belongs to one origin -
 * eshop.crystal.com cannot read www.crystal.com's.
 *
 * A COOKIE on the shared parent domain can be read by all three, so this sets
 * one when a session starts and removes it when it ends.
 *
 * IT IS A HINT, NOT A CREDENTIAL, and it is built so it cannot be mistaken for
 * one: the value is "1". No token, no user id, no name. Anything that needs to
 * know WHO is signed in - or to act as them - has to ask the API with a real
 * token; all this cookie can do is decide which of two links the header shows.
 * A forged or stale one costs a click that lands on the sign-in page.
 *
 * REACT_APP_MEMBER_HINT_DOMAIN is the parent domain, e.g. ".crystal.com".
 * Unset, no cookie is written - which is right for development on localhost,
 * where there is no parent domain to share.
 */

export const HINT_COOKIE = 'crystal_signed_in';

/* Thirty days: the refresh token's own lifetime, so the hint does not outlive the session by months. */
const MAX_AGE = 30 * 24 * 60 * 60;

function domain() {
  return process.env.REACT_APP_MEMBER_HINT_DOMAIN || '';
}

function write(value, maxAge) {
  const parent = domain();
  if (!parent || typeof document === 'undefined') return;

  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = HINT_COOKIE + '=' + value
    + '; Domain=' + parent
    + '; Path=/'
    + '; Max-Age=' + maxAge
    + '; SameSite=Lax'
    + secure;
}

export function markSignedIn() {
  write('1', MAX_AGE);
}

export function markSignedOut() {
  write('', 0);
}

/**
 * Keeps the hint in step with the session, from one place.
 *
 * The session can start four ways (password, code, certificate, a restored
 * token) and end three (the menu, a 401, a failed restore). Setting the cookie
 * at each of those is seven places to forget one; watching the one status they
 * all end in is one.
 */
export function syncMemberHint(store) {
  let last = null;

  return store.subscribe(() => {
    const status = store.getState().auth.status;
    if (status === last) return;
    last = status;

    if (status === 'authenticated') markSignedIn();
    else if (status === 'anonymous') markSignedOut();
  });
}
