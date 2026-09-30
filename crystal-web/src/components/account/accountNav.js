import {
  FiArchive,
  FiAward,
  FiBarChart2,
  FiClipboard,
  FiCreditCard,
  FiDollarSign,
  FiEdit3,
  FiFilm,
  FiGrid,
  FiHome,
  FiLifeBuoy,
  FiLock,
  FiMessageCircle,
  FiMic,
  FiMinusCircle,
  FiPackage,
  FiPlusCircle,
  FiRepeat,
  FiSend,
  FiSettings,
  FiShield,
  FiShoppingBag,
  FiStar,
  FiTrendingUp,
  FiTv,
  FiUser,
  FiZap
} from 'react-icons/fi';

/**
 * The member centre's navigation — the VENDOR'S menu, in Crystal's chrome.
 *
 * The groups, their order and their labels are the vendor client's
 * (constants/accountMenus.js): Eshop, Appstore, Eproduct, Software, Activity,
 * Blog, Feedback. Members already know this shape and it is what the data is
 * organised by, so it is kept as-is rather than re-argued.
 *
 * WHAT IS CRYSTAL'S IS WHAT HAPPENS WHEN YOU ARRIVE. Several of these entries
 * are the same page reached with a different filter — the four Software Points
 * rows are one ledger shape, and Experience Log and Commerce Values are the
 * Eshop's transaction log with the type switched. The vendor built each as its
 * own screen with its own copy of the loading, paging and sorting state. Here
 * the menu is unchanged and the implementation underneath is not repeated:
 * `params` presets the filter, and one page serves the group.
 *
 * AND WHERE TWO THINGS ONLY LOOKED ALIKE, THEY ARE TWO PAGES. Crystal's own
 * points and the activity log used to be two more `?source=` rows on the
 * software ledger's page. They are different ledgers - a running balance and a
 * movement kind on one, a category and a cap on the other - so each has its own
 * address now, and nothing about the menu pretends otherwise.
 *
 * Two entries Crystal adds because the vendor's client has no equivalent: the
 * Dashboard, and the Account group its "My Info" collapses into. The Crystal
 * Points group is the vendor's "Points" menu (charge, transfer) with the wallet
 * those act on, Crystal's own ledger and the wallet password beside them.
 *
 * EVERY ENTRY CARRIES AN ICON, and it is read in exactly one place: the desktop
 * sidebar in AccountLayout. The phone sheet deliberately does NOT draw them —
 * the site menu it shares a shape with has no icons either, and a sheet where
 * the account branch is decorated and the main branch is not reads as two
 * different menus. The mobile sheet and the header dropdown both build their
 * rows from `label` and `to` alone, so the field is invisible to them without
 * either file having to opt out of it.
 *
 * The icon names a SYSTEM rather than a page wherever the same system appears
 * twice: Karaoke is a microphone in the Eproduct group and in the Software
 * group, because it is the same karaoke either way, and the two are told apart
 * by the heading above them and by their words. The three "old log" entries
 * share the archive box for the same reason — what they have in common is that
 * they are closed records, and that is the thing worth signalling.
 *
 * This file is the SINGLE source for the account sidebar, the mobile sheet's
 * account panel, the header dropdown and the breadcrumb - and, through
 * ACCOUNT_MENU below, for the SHAPE all three menus draw it in. A new account
 * page needs an entry here or it has no way in. The site menu's Eshop and
 * Appstore branches read their pages from here too (siteNav.js), so a page
 * added to either group appears there without a second edit.
 */

export const ACCOUNT_NAV = [
  {
    section: 'Overview',
    items: [
      { label: 'Dashboard', to: '/account', icon: FiHome }
    ]
  },
  {
    section: 'Eshop',
    items: [
      { label: 'Cards', to: '/account/eshop/card', icon: FiCreditCard },
      { label: 'Orders', to: '/account/eshop/orders', icon: FiPackage },
      { label: 'Transactions', to: '/account/eshop/transactions', icon: FiRepeat },
      /*
       * One page, three views. The service takes a `type` and answers the same
       * shape for all three, so these are the same route with `view` preset.
       */
      { label: 'Experience Log', to: '/account/eshop/experience', icon: FiTrendingUp },
      { label: 'Commerce Values', to: '/account/eshop/commerce', icon: FiBarChart2 }
    ]
  },
  {
    section: 'Appstore',
    items: [
      { label: 'Purchases', to: '/account/appstore/purchases', icon: FiShoppingBag },
      { label: 'Comments', to: '/account/appstore/comments', icon: FiMessageCircle },
      { label: 'Favorites', to: '/account/appstore/favourites', icon: FiStar }
    ]
  },
  {
    /*
     * ALL FOUR ARE THE EPRODUCT SITE'S, read over HTTP: its own registration
     * log, and the three keygen logs for Karaoke, Manbang and B-media.
     *
     * Crystal's own Register and Licences pages used to head this group. They
     * were a second, unsynchronised answer to the same question - a member
     * could appear in one and not the other - and they are gone; the eproduct
     * site's registration log is the one that is kept.
     */
    section: 'Eproduct',
    items: [
      { label: 'Registration Log', to: '/account/eproduct/registrations', icon: FiClipboard },
      { label: 'Karaoke Keygen', to: '/account/eproduct/keygen/karaoke', icon: FiMic },
      { label: 'Manbang Keygen', to: '/account/eproduct/keygen/manbang', icon: FiTv },
      { label: 'Media Keygen', to: '/account/eproduct/keygen/bmedia', icon: FiFilm }
    ]
  },
  {
    /*
     * CRYSTAL POINTS: THE WALLET, WHAT MOVES IT, AND CRYSTAL'S OWN LEDGER.
     *
     * The vendor's member console has a "Points" menu of two entries, Charge
     * and Transfer, and both are Appstore wallet screens. So the wallet they
     * act on sits here with them rather than under Appstore, and the password
     * the transfer asks for is the last entry. It answers at /account/wallet,
     * not /account/appstore/wallet - App.js keeps the old address working as a
     * redirect - and the three forms are under it, the way the charge,
     * transfer and security views of Crystal's old wallet page were.
     *
     * "Point Log" is Crystal's OWN points (point_logs), which used to be a
     * `?source=CRYSTAL` row under Activity. It is under Crystal Points because
     * that is whose points they are, and it is called a log rather than
     * repeating the group's own name, which is already the heading above it.
     *
     * THE ORDER IS THE ONE THE MEMBER ASKED FOR: what they hold, where it came
     * from, then the three things they can do to it.
     */
    section: 'Crystal Points',
    items: [
      { label: 'Wallet', to: '/account/wallet', icon: FiDollarSign },
      { label: 'Point Log', to: '/account/points/crystal', icon: FiAward },
      { label: 'Transfer', to: '/account/wallet/transfer', icon: FiSend },
      { label: 'Charge', to: '/account/wallet/charge', icon: FiPlusCircle },
      { label: 'Wallet Password', to: '/account/wallet/password', icon: FiShield }
    ]
  },
  {
    /*
     * FOUR ENTRIES, ONE LEDGER SHAPE.
     *
     * Each of these was its own screen in the vendor's console. They are one
     * table per system with identical columns, so they are one page here with
     * the system preset — the menu is unchanged and the member lands exactly
     * where the label promised. The group is "Software Points" because that is
     * what the page is; the shared page it used to be was called points of
     * every kind, and it no longer shows Crystal's or the activity log's.
     */
    section: 'Software Points',
    items: [
      { label: 'Appstore', to: '/account/points', params: { source: 'APPSTORE' }, icon: FiGrid },
      { label: 'Karaoke', to: '/account/points', params: { source: 'KARAOKE' }, icon: FiMic },
      { label: 'Media', to: '/account/points', params: { source: 'MEDIA' }, icon: FiFilm },
      { label: 'Minus', to: '/account/points', params: { source: 'SOFTWARE' }, icon: FiMinusCircle },

      /*
       * THE TWO OLD LOGS are a different source, not a different filter.
       * The four above are one ledger shape; these read the karaoke and
       * media services' own records from before the platform, and stop at
       * the moment a merged account became one account.
       */
      { label: 'Karaoke Old Log', to: '/account/history/karaoke', icon: FiArchive },
      { label: 'Media Old Log', to: '/account/history/media', icon: FiArchive }
    ]
  },
  {
    /* The vendor's Activity menu, entry for entry: the point log and the old log. */
    section: 'Activity',
    items: [
      { label: 'Activity Point Log', to: '/account/points/activity', icon: FiZap },
      { label: 'Activity Old Log', to: '/account/history/activity', icon: FiArchive }
    ]
  },
  {
    section: 'Blog',
    items: [
      { label: 'My Articles', to: '/account/blog', icon: FiEdit3 }
    ]
  },
  {
    section: 'Support',
    items: [
      { label: 'Feedback', to: '/account/feedback', icon: FiLifeBuoy },
      { label: 'Repairs', to: '/account/repairs', icon: FiSettings }
    ]
  },
  {
    section: 'Account',
    items: [
      { label: 'Profile', to: '/account/settings', icon: FiUser },
      { label: 'Password', to: '/account/settings/password', icon: FiLock }
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

/** Where following an entry lands: its own page, or the other site it names. */
function destinationOf(item) {
  return item.external ? item.href : hrefOf(item);
}

/**
 * THE ACCOUNT MENU AS A MENU - the one shape every account menu draws.
 *
 * ACCOUNT_NAV is the list of pages; this is how that list is MENU'D, and it
 * used to be decided three times. The phone sheet turned a group of one into a
 * row that goes straight to its page, named after the page ("Dashboard", "My
 * Articles"); the header dropdown named every row after its GROUP ("Overview",
 * "Blog") and sent it to the group's first page; the desktop sidebar made
 * every group a collapsible heading, so "Dashboard" sat alone inside a
 * section called Overview that had to be opened to reach it. Three menus of
 * the same ten things, and a member moving from a phone to a laptop met
 * different words in a different shape.
 *
 * THE PHONE'S SHAPE IS THE ONE KEPT, because it is the one that was asked for
 * ("make the account menus hierarchy like the main menus") and it is the one
 * that reads right:
 *
 *   a group of ONE is a LEAF     named after its page, and goes there
 *   a group of MORE is a BRANCH  named after the group, and opens to its pages
 *
 * Every renderer takes its rows from here and decides only how a row LOOKS -
 * a drill-down on the phone, an accordion in the sidebar, and in the header
 * dropdown a shortcut to the branch's first page, where that same accordion is
 * already open on it (the header dropdown shows no sub-entries; that was asked
 * for separately, and arriving on the page IS the drill-down on a desktop).
 *
 * `href` is where following the row lands - the page for a leaf, the first
 * page for a branch - so no renderer has to know which it is holding to link
 * it.
 */
export const ACCOUNT_MENU = ACCOUNT_NAV
  .filter((group) => group.items.length > 0)
  .map((group) => {
    const first = group.items[0];

    if (group.items.length === 1) {
      return {
        key: group.section,
        section: group.section,
        label: first.label,
        item: first,
        href: destinationOf(first),
        external: !!first.external
      };
    }

    return {
      key: group.section,
      section: group.section,
      label: group.section,
      links: group.items,
      href: destinationOf(first),
      external: !!first.external
    };
  });

/**
 * A group's pages as plain links, for a menu outside the member centre that
 * lists them - the site menu's Eshop and Appstore branches. Read from here so
 * a page added to the group, or renamed in it, is added or renamed there too.
 */
export function accountLinksOf(section) {
  const group = ACCOUNT_NAV.filter((entry) => entry.section === section)[0];

  return group
    ? group.items.map((item) => (
      item.external
        ? { label: item.label, href: item.href, external: true }
        : { label: item.label, to: hrefOf(item) }
    ))
    : [];
}

/** One page as a plain link, found by its address, wherever it is filed. */
export function accountLinkAt(to) {
  let found = null;

  ACCOUNT_NAV.forEach((group) => {
    group.items.forEach((item) => {
      if (!found && !item.external && hrefOf(item) === to) found = { label: item.label, to: hrefOf(item) };
    });
  });

  return found;
}

/**
 * The name on the account control, the same on every screen: the member's
 * nickname, or "My account" for a profile that has none. The desktop button
 * used to fall back to an untranslated "Account" while the phone said "My
 * account" in the reader's language.
 */
export function accountName(user, t) {
  return user && user.nickname ? user.nickname : t('layout.myAccount');
}

/**
 * The nav entry that best matches a location — the longest path wins, and a
 * preset filter breaks the tie.
 *
 * Four entries point at /account/points, so path alone cannot say which one is
 * open. When the query names a source, the entry whose params match it is the
 * active one; the plain entry wins when nothing is filtered.
 *
 * THE LONGEST PATH IS WHAT KEEPS THE NESTED PAGES APART. /account/wallet is a
 * prefix of the three wallet forms and /account/points of Crystal's and the
 * activity log's pages, so every one of those addresses also "matches" its
 * parent; the parent loses on length, and a Software entry cannot win at all
 * without a `source` in the query.
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
