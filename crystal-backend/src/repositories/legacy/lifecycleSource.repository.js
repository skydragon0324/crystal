'use strict';

const legacy = require('../../config/legacy');

/**
 * THE SOURCE SIDE OF THE LIFECYCLE FEED: everything read out of the platform.
 *
 * Four tables, read-only, and that is the whole contract. Requirement 2 is
 * explicit that the Oracle schema is not Crystal's to change and that
 * `USERS.STATUS` is never written with a lifecycle verdict; nothing in this
 * file writes anything at all.
 *
 * EVERY NAME GOES THROUGH `legacy.pid()`, so the same query runs against the
 * vendor's Oracle in deployment and against the `bs_prhnid` schema in
 * development - see config/legacy.js. That is also why this uses the query
 * builder rather than hand-written SQL wherever it can: knex compiles
 * `limit()` to LIMIT on PostgreSQL and to a FETCH/ROWNUM wrapper on
 * oracledb, and a raw LIMIT would simply be a syntax error on the real
 * source.
 *
 * NO N+1. The profile read fetches a batch of customers, then one query for
 * that batch's phone numbers and one for its locations - three statements per
 * batch however many customers are in it, rather than three per customer
 * (requirement 13).
 */

const USERS = 'users';
const LOGIN_LOG = 'user_login_log';
const PHONES = 'user_phone_numbers';
const LOCATIONS = 'locations';

function conn() {
  return legacy.connection();
}

/* ------------------------------------------------------------------ */
/*  customers                                                          */
/* ------------------------------------------------------------------ */

/**
 * A page of customers by key, with their display phone and location name.
 *
 * Keyset pagination rather than OFFSET: an offset scan re-reads everything it
 * has already passed, which on half a million customers is the difference
 * between a backfill that finishes and one that is still going.
 */
/**
 * ORACLE REFUSES AN `IN` LIST LONGER THAN 1000 TERMS - ORA-01795.
 *
 * This is why the production KPI page was empty while the journal filled up.
 * The login import walks a keyset cursor (`table_pk > ?`) and never builds a
 * list, so eleven million logins arrived without trouble. The PROFILE read
 * does build one - a batch of customers, then their phones in a single
 * `whereIn` - and the batch is LIFECYCLE_IMPORT_BATCH, five thousand. So on
 * Oracle the profile sweep failed on its first page, every time, and without
 * profiles a rebuild produces nothing: no periods, no current status, no
 * daily snapshots, an empty screen behind a full journal.
 *
 * It never showed in development because the stand-in is PostgreSQL, which
 * takes a list of any length (its limit is 65,535 BIND PARAMETERS, which is a
 * different ceiling and a much higher one).
 *
 * So every list this file sends is cut into runs of a thousand. The cost is
 * one extra round trip per thousand keys; the alternative is a feature that
 * works on the development driver and not on the real one.
 *
 * feedback.repository.js caps a search for the same reason.
 */
const IN_LIST_MAX = 1000;

/** Runs `read(slice)` over the keys in runs of a thousand, concatenated. */
async function inChunks(keys, read) {
  const out = [];

  for (let at = 0; at < keys.length; at += IN_LIST_MAX) {
    /* eslint-disable no-await-in-loop */
    const rows = await read(keys.slice(at, at + IN_LIST_MAX));
    /* eslint-enable no-await-in-loop */
    rows.forEach(function (row) { out.push(row); });
  }

  return out;
}

/** The columns a profile is built from. Both reads below select exactly these. */
const CUSTOMER_COLUMNS = [
  'user_pk',
  'user_id',
  'user_name',
  'birthday',
  'job',
  'location_pk',
  'status',
  'created_at',
  'updated_at'
];

async function customersAfter(afterPk, limit) {
  const rows = await conn()(legacy.pid(USERS))
    .select(CUSTOMER_COLUMNS)
    .where('user_pk', '>', afterPk || 0)
    .orderBy('user_pk', 'asc')
    .limit(limit);

  return withDisplayPhone(rows);
}

/**
 * THE SAME CUSTOMERS, NAMED RATHER THAN PAGED.
 *
 * The login poll knows whose logins it has just imported, and a rebuild needs
 * their profile for the registration instant. Without this the only road to a
 * profile was the daily sweep over the whole customer table - so a journal
 * filling every ten minutes built nothing at all until the next morning. See
 * services/lifecycle/sync.service.js.
 *
 * Bounded by its caller: the keys come from one import batch, which is
 * `LIFECYCLE_IMPORT_BATCH` rows at most.
 */
async function customersByKeys(keys) {
  const wanted = (keys || [])
    .map(Number)
    .filter(function (key) { return Number.isFinite(key) && key > 0; });

  if (!wanted.length) return [];

  const rows = await inChunks(wanted, function (slice) {
    return conn()(legacy.pid(USERS)).select(CUSTOMER_COLUMNS).whereIn('user_pk', slice);
  });

  return withDisplayPhone(rows);
}

/** One display phone per customer, and the shape both reads above answer in. */
async function withDisplayPhone(rows) {
  if (!rows.length) return [];

  const keys = rows.map(function (row) { return row.user_pk; });

  /*
   * ONE DETERMINISTIC DISPLAY PHONE PER CUSTOMER.
   *
   * The source has no primary flag, so the choice is ours and has to be
   * stated: newest `updated_at`, then highest `phone_pk` to break a tie.
   * Requirement 3 forbids calling the result a verified primary number, and
   * the column comment in the migration says so too.
   *
   * Sorted here rather than in SQL because `NULLS LAST` ordering differs
   * between the two drivers, and a silent difference in which phone is shown
   * is worse than four lines of JavaScript.
   */
  const phones = await inChunks(keys, function (slice) {
    return conn()(legacy.pid(PHONES))
      .select('user_pk', 'phone_pk', 'phone_number', 'phone_type', 'updated_at')
      .whereIn('user_pk', slice);
  });

  const display = {};
  phones.forEach(function (phone) {
    const held = display[phone.user_pk];
    if (!held) {
      display[phone.user_pk] = phone;
      return;
    }

    const mine = phone.updated_at ? new Date(phone.updated_at).getTime() : -Infinity;
    const theirs = held.updated_at ? new Date(held.updated_at).getTime() : -Infinity;

    if (mine > theirs || (mine === theirs && Number(phone.phone_pk) > Number(held.phone_pk))) {
      display[phone.user_pk] = phone;
    }
  });

  return rows.map(function (row) {
    const phone = display[row.user_pk];

    return {
      userPk: row.user_pk,
      userId: row.user_id,
      userName: row.user_name,
      birthday: row.birthday,
      jobCode: row.job,
      locationPk: row.location_pk,
      displayPhone: phone ? phone.phone_number : null,
      accountStatus: row.status,
      registeredAt: row.created_at,
      sourceUpdatedAt: row.updated_at
    };
  });
}

/** Every phone a customer has, for the detail view only. */
function phonesOf(userPk) {
  return conn()(legacy.pid(PHONES))
    .select('phone_pk', 'phone_number', 'phone_type', 'created_at', 'updated_at')
    .where('user_pk', userPk)
    .orderBy([{ column: 'updated_at', order: 'desc' }, { column: 'phone_pk', order: 'desc' }]);
}

/** How many customers there are, for progress reporting. */
async function countCustomers() {
  const row = await conn()(legacy.pid(USERS)).count('* as n').first();
  return Number(row.n);
}

/* ------------------------------------------------------------------ */
/*  the login log                                                      */
/* ------------------------------------------------------------------ */

/**
 * A page of login rows by key.
 *
 * THREE COLUMNS, and the omissions are the point: `cid`, `phone_imei`,
 * `phone_brand` and `phone_model` are never selected, so no handset or SIM
 * identity can reach the analytics database even by accident (requirement 3).
 */
function loginsAfter(afterPk, limit) {
  return conn()(legacy.pid(LOGIN_LOG))
    .select('table_pk', 'user_pk', 'action_at')
    .where('table_pk', '>', afterPk || 0)
    .orderBy('table_pk', 'asc')
    .limit(limit);
}

/**
 * JUST THE KEYS, for reconciliation.
 *
 * The full comparison streams every `TABLE_PK` in the source and checks it
 * against the journal. Reading only the key makes that affordable: a million
 * bigints is a few megabytes, where a million full rows is not.
 */
function loginKeysBetween(fromPk, toPk) {
  return conn()(legacy.pid(LOGIN_LOG))
    .select('table_pk')
    .where('table_pk', '>', fromPk)
    .andWhere('table_pk', '<=', toPk)
    .orderBy('table_pk', 'asc');
}

/** The rows behind a set of keys reconciliation found missing. */
function loginsByKeys(keys) {
  /*
   * In runs of a thousand - see IN_LIST_MAX. The reconciliation compares the
   * source key space in bands of LIFECYCLE_RECONCILE_BATCH (fifty thousand),
   * so this list is the longest one this file builds and the one furthest
   * past what Oracle accepts.
   */
  return inChunks(keys, function (slice) {
    return conn()(legacy.pid(LOGIN_LOG))
      .select('table_pk', 'user_pk', 'action_at')
      .whereIn('table_pk', slice);
  });
}

/** The highest key in the source, which bounds a reconciliation pass. */
async function maxLoginPk() {
  const row = await conn()(legacy.pid(LOGIN_LOG)).max('table_pk as pk').first();
  return row && row.pk !== null ? Number(row.pk) : 0;
}

async function countLogins() {
  const row = await conn()(legacy.pid(LOGIN_LOG)).count('* as n').first();
  return Number(row.n);
}

/* ------------------------------------------------------------------ */
/*  locations                                                          */
/* ------------------------------------------------------------------ */

/**
 * The location list, read whole.
 *
 * It is seven rows in development and a few hundred in production - small
 * enough to resolve an address in memory rather than joining per customer.
 * Crystal already keeps its own copy in `crm_location`, refreshed by the CRM
 * import; this reads the source directly so the lifecycle feature does not
 * depend on whether that import has been run.
 */
function locations() {
  return conn()(legacy.pid(LOCATIONS))
    .select('location_pk', 'location_name', 'location_code', 'parent_code')
    .orderBy('location_pk', 'asc');
}

module.exports = {
  customersAfter: customersAfter,
  customersByKeys: customersByKeys,
  phonesOf: phonesOf,
  countCustomers: countCustomers,
  loginsAfter: loginsAfter,
  loginKeysBetween: loginKeysBetween,
  loginsByKeys: loginsByKeys,
  maxLoginPk: maxLoginPk,
  countLogins: countLogins,
  locations: locations
};
