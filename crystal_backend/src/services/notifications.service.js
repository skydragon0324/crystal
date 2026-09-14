const db = require('../config/db');
const permissions = require('../repositories/permissions.repository');
const legacy = require('../config/legacy');
const codes = require('../repositories/legacy/codes');

/**
 * The header bell: what is going wrong right now.
 *
 * Deliberately not a message inbox.  Nothing in this system sends an
 * administrator a message, and a bell that has to be marked as read is a bell
 * people learn to clear without looking.  These are QUERIES over live tables,
 * so an item disappears when the thing it describes is dealt with - the only
 * definition of "read" that cannot go stale.
 *
 * Every signal names the page it belongs to, which gates it: a role that
 * cannot open the claims screen is not told there are claims waiting, because
 * being told about work you are not allowed to do is just noise.
 */

/** Examples carried with each signal, so the bell says which ones. */
const SAMPLE = 4;

const SIGNALS = [
  {
    key: 'overdue_repairs',
    page: '/admin/service/tickets',
    tone: 'red',
    /*
     * Promised and not delivered.  This is the one number the whole
     * after-sales module exists to keep at zero, which is why it is first and
     * why it is the only one that turns the bell red.
     */
    run: function () {
      return db('repair_tickets as t')
        .leftJoin('agencies as a', 'a.id', 't.agency_id')
        .where('t.is_deleted', false)
        .where('t.status', '<', 7)
        .whereRaw('t.promised_at < now()')
        .orderBy('t.promised_at')
        .select('t.id', 't.ticket_no as title', 'a.name as subtitle', 't.promised_at as at');
    }
  },
  {
    key: 'claims_awaiting',
    page: '/admin/service/claims',
    tone: 'orange',
    /* Submitted, not yet approved or rejected - a centre waiting on money. */
    run: function () {
      return db('warranty_claims as c')
        .leftJoin('agencies as a', 'a.id', 'c.agency_id')
        .where('c.is_deleted', false)
        .where('c.status', 1)
        .orderBy('c.submitted_at')
        .select('c.id', 'c.claim_no as title', 'a.name as subtitle', 'c.submitted_at as at');
    }
  },
  {
    key: 'low_stock',
    page: '/admin/service/stock',
    tone: 'orange',
    /*
     * At or under the reorder level, counting only what is actually available
     * - stock reserved against an open repair is spoken for, and treating it
     * as on the shelf is how a centre discovers it cannot finish a job.
     */
    run: function () {
      return db('part_stock as s')
        .join('parts as p', 'p.id', 's.part_id')
        .join('agencies as a', 'a.id', 's.agency_id')
        .where('p.is_deleted', false)
        .where('s.reorder_level', '>', 0)
        .whereRaw('(s.on_hand - s.reserved) <= s.reorder_level')
        .orderByRaw('(s.on_hand - s.reserved) - s.reorder_level')
        .select('s.id', 'p.name as title',
          db.raw("a.name || ' · ' || (s.on_hand - s.reserved) || ' left' AS subtitle"),
          's.updated_at as at');
    }
  },
  {
    key: 'feedback_waiting',
    page: '/admin/members/feedback',
    tone: 'blue',
    /*
     * A member has written and it is back with us.
     *
     * "Waiting" is not a status: a thread is waiting when the MEMBER wrote
     * last, which is true of a brand new enquiry and of a follow-up to an
     * answer we already gave.
     *
     * THE ONLY SIGNAL THAT CANNOT BE ONE QUERY. The threads are in the
     * vendor's database and the member names are in Crystal's, so this one
     * gathers its own total and its own sample instead of handing back a
     * builder for summary() to count and slice. Everything else here is a
     * single table in one database and stays a plain run().
     */
    gather: async function (limit) {
      const conn = legacy.connection();
      const scope = function () {
        return conn(legacy.pid('feedback_threads'))
          .where('is_deleted', 0)
          .where('last_type', codes.SIDE_TO_CODE.MEMBER)
          .where('status', codes.STATUS.DISCUSSING);
      };

      const [counted, rows] = await Promise.all([
        scope().count({ c: '*' }).first(),
        scope().orderBy('updated_at').limit(limit)
          .select('thread_pk', 'title', 'user_pk', 'updated_at')
      ]);

      const ids = rows.map(function (row) { return Number(row.user_pk); });
      const members = ids.length
        ? await db('users').whereIn('id', ids).select('id', 'nickname')
        : [];

      const byId = {};
      members.forEach(function (row) { byId[row.id] = row.nickname; });

      return {
        total: Number(counted.c),
        items: rows.map(function (row) {
          return {
            id: Number(row.thread_pk),
            title: row.title,
            subtitle: byId[Number(row.user_pk)] || null,
            at: row.updated_at
          };
        })
      };
    }
  }
];

async function readablePages(roleId) {
  const grants = await permissions.grantsOf(roleId);
  const set = {};
  grants.forEach(function (grant) { set[grant.page_url] = true; });
  return set;
}

/**
 * The count is the WHOLE set and the items are the first few of it.
 *
 * A badge reading "4" beside a list of four when there are ninety is a badge
 * that makes a crisis look like a quiet afternoon, so the two numbers are
 * gathered separately and the reply says both.
 */
async function summary(admin) {
  const allowed = await readablePages(admin.role_id);
  const wanted = SIGNALS.filter(function (signal) { return allowed[signal.page]; });

  const results = await Promise.all(wanted.map(async function (signal) {
    /*
     * A signal is either one query or its own gatherer.
     *
     * run() is the ordinary case: one builder, counted and then sliced, so
     * a signal is four lines of knex. gather() exists for the one signal that
     * spans two databases and so cannot be a single builder at all.
     */
    const gathered = signal.gather
      ? await signal.gather(SAMPLE)
      : await (async function () {
        const query = signal.run();
        const counted = await query.clone().clearSelect().clearOrder().count({ c: '*' }).first();
        return { total: Number(counted.c), items: await query.limit(SAMPLE) };
      }());

    return {
      key: signal.key,
      page: signal.page,
      tone: signal.tone,
      total: gathered.total,
      items: gathered.items.map(function (row) {
        return {
          id: row.id,
          title: row.title,
          subtitle: row.subtitle || null,
          at: row.at || null,
          url: signal.page
        };
      })
    };
  }));

  const groups = results.filter(function (group) { return group.total > 0; });

  return {
    total: groups.reduce(function (sum, group) { return sum + group.total; }, 0),
    // What makes the bell red rather than just occupied.
    urgent: groups
      .filter(function (group) { return group.tone === 'red'; })
      .reduce(function (sum, group) { return sum + group.total; }, 0),
    groups: groups
  };
}

module.exports = { summary: summary };
