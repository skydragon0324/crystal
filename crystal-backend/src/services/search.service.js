const db = require('../config/db');
const permissions = require('../repositories/permissions.repository');

/**
 * One search box for the whole console.
 *
 * Somebody arrives at a search box holding a ticket number off a printed job
 * sheet, half a customer's name, or a model code from a box - not the name of
 * a screen.  Finding only screens meant knowing which one held the thing and
 * then searching again once you got there.
 *
 * Every group is FILTERED BY PERMISSION before it is run: a role that cannot
 * open the member list must not be able to read member names out of a search
 * box either, and the cheapest way to guarantee that is not to run the query.
 */

/** Rows per group. A search box is a shortcut, not a report. */
const PER_GROUP = 5;

/** Below this the term matches half the database, so nothing is asked. */
const MIN_TERM = 2;

/**
 * Each group names the page it belongs to, which does double duty: it is the
 * permission that gates it, and it is where a hit navigates to.
 *
 * `url` carries the term the row is best found by - a ticket number, a model
 * code - rather than the id, because the destination screen searches, it does
 * not address rows.
 */
const GROUPS = [
  {
    type: 'product',
    page: '/admin/catalog/products',
    run: function (term) {
      return db('products as p')
        .leftJoin('product_categories as c', 'c.id', 'p.category_id')
        .where('p.is_deleted', false)
        .where(function () {
          this.whereRaw('lower(p.name) like ?', [term])
            .orWhereRaw('lower(p.model_code) like ?', [term])
            .orWhereRaw('lower(p.slug) like ?', [term]);
        })
        .orderBy('p.sort_order')
        .limit(PER_GROUP)
        .select('p.id', 'p.name as title', 'p.model_code as ref', 'c.name as subtitle');
    }
  },
  {
    type: 'ticket',
    page: '/admin/service/tickets',
    run: function (term) {
      return db('repair_tickets as t')
        .leftJoin('agencies as a', 'a.id', 't.agency_id')
        .where('t.is_deleted', false)
        .where(function () {
          this.whereRaw('lower(t.ticket_no) like ?', [term])
            .orWhereRaw('lower(t.serial_number) like ?', [term])
            .orWhereRaw('lower(t.customer_name) like ?', [term])
            .orWhereRaw('lower(t.customer_phone) like ?', [term]);
        })
        .orderBy('t.received_at', 'desc')
        .limit(PER_GROUP)
        .select('t.id', 't.ticket_no as title', 't.ticket_no as ref',
          db.raw("COALESCE(t.customer_name, '') || ' · ' || COALESCE(a.name, '') AS subtitle"));
    }
  },
  {
    type: 'member',
    page: '/admin/members/accounts',
    run: function (term) {
      return db('users')
        .where(function () {
          this.whereRaw('lower(nickname) like ?', [term])
            .orWhereRaw('lower(email) like ?', [term])
            .orWhereRaw('lower(phone) like ?', [term]);
        })
        .orderBy('created_at', 'desc')
        .limit(PER_GROUP)
        .select('id', 'nickname as title', 'email as ref',
          db.raw("COALESCE(email, phone, '') AS subtitle"));
    }
  },
  {
    type: 'agency',
    page: '/admin/support/agencies',
    run: function (term) {
      return db('agencies')
        .where('is_deleted', false)
        .where(function () {
          this.whereRaw('lower(name) like ?', [term])
            .orWhereRaw('lower(code) like ?', [term])
            .orWhereRaw('lower(province) like ?', [term])
            .orWhereRaw('lower(address) like ?', [term]);
        })
        .orderBy('name')
        .limit(PER_GROUP)
        .select('id', 'name as title', 'code as ref',
          // The city was a column once; it is part of the address now.
          db.raw("province || ' - ' || address AS subtitle"));
    }
  },
  {
    type: 'part',
    page: '/admin/service/parts',
    run: function (term) {
      return db('parts')
        .where('is_deleted', false)
        .where(function () {
          this.whereRaw('lower(part_no) like ?', [term])
            .orWhereRaw('lower(name) like ?', [term]);
        })
        .orderBy('part_no')
        .limit(PER_GROUP)
        .select('id', 'name as title', 'part_no as ref', 'component as subtitle');
    }
  },
  {
    type: 'article',
    page: '/admin/blog/articles',
    run: function (term) {
      return db('articles')
        .where('is_deleted', false)
        .where(function () {
          this.whereRaw('lower(title) like ?', [term])
            .orWhereRaw('lower(slug) like ?', [term]);
        })
        .orderBy('published_at', 'desc')
        .limit(PER_GROUP)
        .select('id', 'title', 'slug as ref', 'category as subtitle');
    }
  }
];

/**
 * The pages this role may read, as a set.
 *
 * Read per search rather than cached: a search is a deliberate act a few
 * times a minute, and a permission that was revoked this morning should stop
 * answering this morning.
 */
async function readablePages(roleId) {
  const grants = await permissions.grantsOf(roleId);
  const set = {};
  grants.forEach(function (grant) { set[grant.page_url] = true; });
  return set;
}

async function query(term, admin) {
  const needle = String(term || '').trim().toLowerCase();
  if (needle.length < MIN_TERM) return { groups: [] };

  const like = '%' + needle + '%';
  const allowed = await readablePages(admin.role_id);
  const wanted = GROUPS.filter(function (group) { return allowed[group.page]; });

  const found = await Promise.all(wanted.map(function (group) { return group.run(like); }));

  return {
    groups: wanted
      .map(function (group, index) {
        return {
          type: group.type,
          page: group.page,
          items: found[index].map(function (row) {
            return {
              id: row.id,
              title: row.title,
              subtitle: row.subtitle || null,
              // The destination is the screen, searched for this row - the
              // console addresses rows by searching, not by id in the url.
              url: group.page + '?q=' + encodeURIComponent(row.ref || row.title)
            };
          })
        };
      })
      .filter(function (group) { return group.items.length > 0; })
  };
}

module.exports = { MIN_TERM: MIN_TERM, query: query };
