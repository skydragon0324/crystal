/**
 * The member centre's navigation — the VENDOR'S menu, in Crystal's chrome.
 *
 * The groups, their order and their labels are the vendor client's
 * (constants/accountMenus.js): Eshop, Appstore, Eproduct, Points, Software,
 * Activity, Blog, Feedback. Members already know this shape and it is what the
 * data is organised by, so it is kept as-is rather than re-argued.
 *
 * WHAT IS CRYSTAL'S IS WHAT HAPPENS WHEN YOU ARRIVE. Several of these entries
 * are the same page reached with a different filter — the six Software rows and
 * the two Activity rows are one ledger, and Experience Log and Commerce Values
 * are the Eshop's transaction log with the type switched. The vendor built each
 * as its own screen with its own copy of the loading, paging and sorting state.
 * Here the menu is unchanged and the implementation underneath is not repeated:
 * `params` presets the filter, and one page serves the group.
 *
 * Two entries Crystal adds because the vendor's client has no equivalent: the
 * Dashboard, and the Account group its "My Info" collapses into.
 *
 * This file is the SINGLE source for the account sidebar, the mobile sheet's
 * account panel, the header dropdown and the breadcrumb. A new account page
 * needs an entry here or it has no way in.
 */

export const ACCOUNT_NAV = [
  {
    section: 'Overview',
    items: [
      { label: 'Dashboard', to: '/account' }
    ]
  },
  {
    section: 'Eshop',
    items: [
      { label: 'Cards', to: '/account/eshop/card' },
      { label: 'Orders', to: '/account/eshop/orders' },
      { label: 'Transactions', to: '/account/eshop/transactions' },
      /*
       * One page, three views. The service takes a `type` and answers the same
       * shape for all three, so these are the same route with `view` preset.
       */
      { label: 'Experience Log', to: '/account/eshop/experience' },
      { label: 'Commerce Values', to: '/account/eshop/commerce' }
    ]
  },
  {
    section: 'Appstore',
    items: [
      { label: 'Purchases', to: '/account/appstore/purchases' },
      { label: 'Comments', to: '/account/appstore/comments' },
      { label: 'Favorites', to: '/account/appstore/favourites' },
      { label: 'Wallet', to: '/account/appstore/wallet' }
    ]
  },
  {
    /*
     * TWO SOURCES UNDER ONE HEADING, and the split is deliberate.
     *
     * Register and Licences are CRYSTAL'S - devices registered here, against
     * Crystal's own warranty and points rules. The four below are the
     * EPRODUCT SITE'S, read over HTTP: its own registration log, and the
     * three keygen logs for Karaoke, Manbang and B-media.
     *
     * A member can appear in one and not the other, which is why both are
     * listed rather than one being derived from the other.
     */
    section: 'Eproduct',
    items: [
      { label: 'Register', to: '/account/products' },
      { label: 'Licences', to: '/account/licenses' },
      { label: 'Registration Log', to: '/account/eproduct/registrations' },
      { label: 'Karaoke Keygen', to: '/account/eproduct/keygen/karaoke' },
      { label: 'Manbang Keygen', to: '/account/eproduct/keygen/manbang' },
      { label: 'Media Keygen', to: '/account/eproduct/keygen/bmedia' }
    ]
  },
  {
    section: 'Points',
    items: [
      { label: 'Balance', to: '/account/wallet' },
      { label: 'Charge', to: '/account/wallet/charge' },
      { label: 'Transfer', to: '/account/wallet/transfer' },
      { label: 'Security', to: '/account/wallet/security' }
    ]
  },
  {
    /*
     * SIX ENTRIES, ONE LEDGER.
     *
     * Each of these was its own screen in the vendor's console. They are one
     * table per system with an identical shape, so they are one page here with
     * the system preset — the menu is unchanged and the member lands exactly
     * where the label promised.
     */
    section: 'Software',
    items: [
      { label: 'Appstore', to: '/account/points', params: { source: 'APPSTORE' } },
      { label: 'Karaoke', to: '/account/points', params: { source: 'KARAOKE' } },
      { label: 'Media', to: '/account/points', params: { source: 'MEDIA' } },
      { label: 'Minus', to: '/account/points', params: { source: 'SOFTWARE' } },

      /*
       * THE TWO OLD LOGS are a different source, not a different filter.
       * The four above are one Crystal ledger; these read the karaoke and
       * media services' own records from before the platform, and stop at
       * the moment a merged account became one account.
       */
      { label: 'Karaoke Old Log', to: '/account/history/karaoke' },
      { label: 'Media Old Log', to: '/account/history/media' }
    ]
  },
  {
    section: 'Activity',
    items: [
      { label: 'Activity Point Log', to: '/account/points', params: { source: 'ACTIVITY' } },
      { label: 'Crystal points', to: '/account/points', params: { source: 'CRYSTAL' } },
      { label: 'Activity Old Log', to: '/account/history/activity' }
    ]
  },
  {
    section: 'Blog',
    items: [
      { label: 'My Articles', to: '/account/blog' }
    ]
  },
  {
    section: 'Support',
    items: [
      { label: 'Feedback', to: '/account/feedback' },
      { label: 'Repairs', to: '/account/repairs' }
    ]
  },
  {
    section: 'Account',
    items: [
      { label: 'Profile', to: '/account/settings' },
      { label: 'Password', to: '/account/settings/password' }
    ]
  }
];

/** The href for an entry, with its preset filter if it has one. */
export function hrefOf(item) {
  if (!item.params) return item.to;

  const query = Object.keys(item.params)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(item.params[key])}`)
    .join('&');

  return `${item.to}?${query}`;
}

/**
 * The nav entry that best matches a location — the longest path wins, and a
 * preset filter breaks the tie.
 *
 * Four entries point at /account/points, so path alone cannot say which one is
 * open. When the query names a source, the entry whose params match it is the
 * active one; the plain entry wins when nothing is filtered.
 */
export function findAccountPage(pathname, search) {
  const params = new URLSearchParams(search || '');
  let best = null;
  let bestScore = -1;

  ACCOUNT_NAV.forEach((group) => {
    group.items.forEach((item) => {
      if (item.external) return;
      if (pathname !== item.to && pathname.indexOf(`${item.to}/`) !== 0) return;

      /*
       * Longer path first, then a matching preset. An entry WITH params only
       * matches when every one of them is in the query, so /account/points with
       * no source does not light up the Karaoke row.
       */
      let score = item.to.length;

      if (item.params) {
        const matches = Object.keys(item.params)
          .every((key) => params.get(key) === String(item.params[key]));
        if (!matches) return;
        score += 100;
      } else if (params.get('source')) {
        score -= 1;
      }

      if (score > bestScore) {
        bestScore = score;
        best = { ...item, section: group.section };
      }
    });
  });

  return best;
}
