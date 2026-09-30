'use strict';

/**
 * THE DEVELOPMENT STAND-IN for the vendor's database.
 *
 * Feedback and the blog are read and written in the vendor's Oracle instance
 * (see src/config/legacy.js). There is no Oracle on a development machine, so
 * the same two schemas - `ora_pid` and `ora_blog` - are ordinary schemas in
 * the PostgreSQL database Crystal already uses, and this fills them.
 *
 *   npm run legacy:install        (run it AFTER `npm run seed`)
 *
 * IT IS ADDITIVE AND IT NEVER TRUNCATES.
 *
 * On the machine this was written against, both schemas already existed and
 * ora_blog.blog_article already held 48 articles - the vendor's own converted
 * data, which is exactly what production will look like. Wiping that to make
 * room for Crystal's demo content would have destroyed the only realistic
 * fixture in the database. So this ADDS Crystal's rows alongside, and removes
 * only rows it put there itself on a previous run.
 *
 * IT MIRRORS CRYSTAL'S OWN ROWS, KEEPING THEIR IDS.
 *
 * The obvious thing to do is invent some threads and some articles. This
 * copies the ones sql/schema.sql's tables were already seeded with instead,
 * primary key included:
 *
 *   1. media_assets stays in Crystal's database and points at articles by id.
 *      New ids would leave every seeded article's artwork attached to nothing
 *      - the blog would render, with no images, and the reason would take an
 *      afternoon to find.
 *
 *   2. it makes the eventual migration legible. The PostgreSQL tables were
 *      kept precisely because this data is going back into them one day, and
 *      a development database holding the same rows under the same ids on
 *      both sides is the clearest statement of what that migration produces.
 *
 * THE IDENTITY BRIDGE IS MADE TRUE HERE.
 *
 * feedback_threads.user_pk has a foreign key to ora_pid.users, and
 * session_by one to ora_pid.managers. Crystal's members are ids 1160-1220 and
 * the vendor's stand-in users table had four rows, none of them matching - so
 * every insert failed. In PRODUCTION this is not a problem, because Crystal's
 * members ARE the vendor's users; the bridge that repositories/legacy/ relies
 * on is a fact there. In development it has to be made a fact, so the members
 * and admins Crystal seeded are given matching rows.
 *
 * That is a write to two tables outside the feedback/blog remit, and it is
 * the reason this script REFUSES to run against Oracle: there those rows
 * already exist, Crystal is a guest, and it has no business creating users.
 *
 * Re-runnable.
 */

const fs = require('fs');
const path = require('path');

const config = require('../src/config');
const db = require('../src/config/db');
const legacy = require('../src/config/legacy');
const codes = require('../src/repositories/legacy/codes');
const articlesRepo = require('../src/repositories/legacy/articles.repository');

const SQL_DIR = path.join(__dirname, '..', 'sql', 'legacy');

function run(file) {
  return db.raw(fs.readFileSync(path.join(SQL_DIR, file), 'utf8'));
}

/** knex 0.21 has no onConflict, and these are small lists. */
async function insertMissing(table, key, rows) {
  if (!rows.length) return 0;

  const existing = await db(table).whereIn(key, rows.map(function (r) { return r[key]; })).pluck(key);
  const have = {};
  existing.forEach(function (id) { have[String(id)] = true; });

  const missing = rows.filter(function (row) { return !have[String(row[key])]; });
  if (missing.length) await db(table).insert(missing);

  return missing.length;
}

/* ------------------------------------------------------------------ */
/*  the identity bridge                                                */
/* ------------------------------------------------------------------ */

/**
 * REMOVE THE MIRROR ROWS FOR MEMBERS WHO NO LONGER EXIST.
 *
 * `npm run seed` clears Crystal's users and renumbers them from 1, and the
 * platform schema keeps whatever the previous run mirrored - so after a reseed
 * ora_pid holds rows for members nobody has any more, and their logins collide
 * with the new ones on the unique index. The installer put them there, so the
 * installer takes them away.
 *
 * WHICH ROWS ARE OURS is not a guess: every member this script bridges gets a
 * merge row with a synthetic `eshop_pk` of 800000000 + their id, which nothing
 * else writes. That range is the marker.
 *
 * The vendor's own users are outside it and are never touched.
 */
const MIRROR_ESHOP_BASE = 800000000;

async function pruneStaleMirror() {
  const live = await db('users').pluck('id');

  const stale = await db('ora_pid.user_merge_ids')
    .where('eshop_pk', '>=', MIRROR_ESHOP_BASE)
    .where('eshop_pk', '<', MIRROR_ESHOP_BASE + 1000000)
    .whereNotIn('pvendor_pk', live.length ? live : [-1])
    .pluck('pvendor_pk');

  if (!stale.length) return 0;

  /*
   * In dependency order. These are all tables this script writes into for a
   * mirrored member, and every one of them has a foreign key to the user row
   * that has to go last.
   */
  const threads = await db('ora_pid.feedback_threads').whereIn('user_pk', stale).pluck('thread_pk');
  if (threads.length) {
    await db('ora_pid.feedback_messages').whereIn('thread_pk', threads).del();
    await db('ora_pid.feedback_threads').whereIn('thread_pk', threads).del();
  }

  const ledgers = ['soft', 'appstore', 'karaoke', 'bmedia', 'activity'];
  for (let i = 0; i < ledgers.length; i += 1) {
    /* eslint-disable no-await-in-loop */
    await db('ora_pid.' + ledgers[i] + '_point_log').whereIn('user_pk', stale).del();
    await db('ora_pid.' + ledgers[i] + '_point_stats').whereIn('user_pk', stale).del();
    /* eslint-enable no-await-in-loop */
  }

  /* Written by mirrorRegistrations below, and keyed to the user row the same way. */
  await db('ora_pid.register_point_log').whereIn('user_pk', stale).del();
  await db('ora_pid.user_phone_numbers').whereIn('user_pk', stale).del();

  await db('ora_pid.user_merge_ids').whereIn('pvendor_pk', stale).del();
  await db('ora_pid.users').whereIn('user_pk', stale).del();

  return stale.length;
}

/**
 * The same, for managers. Marked by the placeholder password this script
 * writes - managers do not sign in through Crystal, so nothing else uses it.
 */
async function pruneStaleManagers() {
  const live = await db('managers').pluck('id');

  return db('ora_pid.managers')
    .where('password', 'not-a-credential')
    .whereNotIn('manager_pk', live.length ? live : [-1])
    .del();
}

async function bridgeIdentities() {
  /* Anything left over from a previous seed goes first; see above. */
  const prunedUsers = await pruneStaleMirror();
  const prunedManagers = await pruneStaleManagers();

  const members = await db('users').select('id', 'email', 'nickname');
  const managerRows = await db('managers').select('id', 'username', 'name');

  /*
   * The logins already in use on the platform, so a Crystal member is never
   * handed one that belongs to somebody else.
   */
  const existing = await db('ora_pid.users')
    .whereNotIn('user_pk', members.map(function (row) { return row.id; }))
    .pluck('user_id');

  const taken = {};
  existing.forEach(function (login) { taken[String(login).toLowerCase()] = true; });

  const logins = {};
  members.forEach(function (row) {
    logins[row.id] = loginFromEmail(row.email, row.id, taken);
    taken[logins[row.id]] = true;
  });

  const users = await insertMissing('ora_pid.users', 'user_pk', members.map(function (row) {
    return {
      user_pk: row.id,
      user_id: logins[row.id],
      /*
       * A REAL, USABLE CREDENTIAL - because sign-in now checks THIS row.
       *
       * ora_pid.users is the platform's user table and Crystal authenticates
       * against it, so a placeholder here is a member who cannot log in. The
       * platform stores an unsalted MD5 (see repositories/legacy/
       * members.repository.js for why Crystal cannot change that), and this is
       * md5('crystal1234') - the same development password the seeds have
       * always used, so nothing anybody has memorised changes.
       */
      password: require('crypto').createHash('md5').update('crystal1234').digest('hex'),
      user_name: row.nickname || ('Member ' + row.id)
    };
  }));

  const managers = await insertMissing('ora_pid.managers', 'manager_pk', managerRows.map(function (row) {
    return {
      manager_pk: row.id,
      manager_id: row.username || ('crystal' + row.id),
      /* Managers do not sign in through Crystal; the column is only NOT NULL. */
      password: 'not-a-credential',
      manager_name: row.name || ('Admin ' + row.id)
    };
  }));

  /*
   * AND THE KEYS THE TWO STOREFRONTS KNOW THEM BY.
   *
   * user_merge_ids is how a Crystal member becomes an Eshop customer and an
   * Appstore one - three different identifiers for the same person, which
   * services/storefronts.service.js resolves before every remote call. Without
   * a row the member simply has no account in either store, which is a real
   * state the pages handle but a poor one to develop against.
   *
   * The mock derives its data from these keys, so a member with a merge row
   * gets a consistent set of orders and purchases of their own.
   */
  const merges = await insertMissing('ora_pid.user_merge_ids', 'pvendor_pk', members.map(function (row) {
    /* The SAME login the users row got - computed once, above, with the
       collision map. Recomputing it here with an empty map produced a
       different name and collided on the merge table unique index. */
    const login = logins[row.id];

    return {
      pvendor_pk: row.id,
      pvendor_id: login,
      eshop_pk: 800000000 + row.id,
      eshop_id: login,
      appstore_pk: 'as-' + row.id,
      appstore_id: login
    };
  }));

  /*
   * AND CRYSTAL'S MIRROR OF THE LOGIN IS BROUGHT BACK INTO STEP.
   *
   * users.login is a copy of ora_pid.users.user_id, refreshed at sign-in - so
   * a member who has not signed in since a login changed still carries the old
   * one, and anything reading it (the blog's author, the storefront identity
   * fallback) looks at the wrong person or at nobody. The installer owns both
   * sides here, so it syncs them rather than waiting for a sign-in.
   */
  const synced = await db.raw(`
    UPDATE users u
       SET login = p.user_id
      FROM ora_pid.users p
     WHERE p.user_pk = u.id
       AND u.login IS DISTINCT FROM p.user_id
  `);

  return {
    users: users,
    managers: managers,
    merges: merges,
    synced: synced.rowCount || 0,
    pruned: prunedUsers + prunedManagers
  };
}

/* ------------------------------------------------------------------ */
/*  feedback                                                           */
/* ------------------------------------------------------------------ */

async function mirrorFeedback() {
  const threads = await db('feedback_threads').orderBy('id');
  const messages = await db('feedback_messages').orderBy('id');
  if (!threads.length) return { threads: 0, messages: 0 };

  const ids = threads.map(function (row) { return row.id; });

  /* Only what a previous run of this script put there. */
  await db('ora_pid.feedback_messages').whereIn('thread_pk', ids).del();
  await db('ora_pid.feedback_threads').whereIn('thread_pk', ids).del();

  await db('ora_pid.feedback_threads').insert(threads.map(function (row) {
    return {
      thread_pk: row.id,
      user_pk: row.user_id,
      title: row.title,
      /* The vendor's own filing, which Crystal does not use. */
      category: 0,
      thread_source: codes.sourceToCode(row.thread_source),
      last_message: row.last_message,
      /*
       * last_type comes from the ROW, not from statusToColumns: it records who
       * actually wrote last, and a RESOLVED thread still has an answer to
       * that. The pair function only supplies it for the two states that are
       * DEFINED by it.
       */
      last_type: codes.sideToCode(row.last_type),
      status: codes.statusToColumns(row.status).status,
      is_read: codes.fromBool(row.is_read),
      is_deleted: codes.fromBool(row.is_deleted),
      session_by: row.session_by,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }));

  await db('ora_pid.feedback_messages').insert(messages.map(function (row) {
    return {
      message_pk: row.id,
      thread_pk: row.thread_id,
      message: row.message,
      action_type: codes.sideToCode(row.action_type),
      action_by: row.action_by,
      action_at: row.action_at
    };
  }));

  await bump('ora_pid.feedback_threads_s', 'ora_pid.feedback_threads', 'thread_pk');
  await bump('ora_pid.feedback_messages_s', 'ora_pid.feedback_messages', 'message_pk');

  return { threads: threads.length, messages: messages.length };
}

/* ------------------------------------------------------------------ */
/*  points                                                             */
/* ------------------------------------------------------------------ */

/**
 * The five vendor point ledgers, for Crystal's demo members.
 *
 * The rows already in these tables belong to the vendor's own four users -
 * 1001, 1002, 2001, 10000000 - so a Crystal member signing in on a development
 * machine sees five empty ledgers and an account page that looks broken rather
 * than one that looks new. This gives the demo member a history in each.
 *
 * It is COPIED FROM THE VENDOR'S OWN ROWS, not invented: the same reasons, the
 * same equipment numbers, the same shape of amounts, re-keyed to Crystal's
 * members and spread over recent weeks. The point of a fixture is to look like
 * the production data, and the production data is right there.
 *
 * Only rows this script wrote are replaced - the vendor's four users keep
 * theirs untouched, exactly as the blog does.
 */
const POINT_TABLES = [
  { log: 'soft_point_log', stats: 'soft_point_stats' },
  { log: 'appstore_point_log', stats: 'appstore_point_stats' },
  { log: 'karaoke_point_log', stats: 'karaoke_point_stats' },
  { log: 'bmedia_point_log', stats: 'bmedia_point_stats' }
];

/* The pk space this script writes in, kept clear of the vendor's 9000010xxxxx. */
const FIXTURE_BASE = 950000000000;

async function mirrorPoints() {
  const members = await db('users').select('id').orderBy('id').limit(6);
  if (!members.length) return { members: 0, rows: 0 };

  const ids = members.map(function (row) { return row.id; });
  let written = 0;

  for (let t = 0; t < POINT_TABLES.length; t += 1) {
    const table = POINT_TABLES[t];

    /* eslint-disable no-await-in-loop */
    const template = await db('ora_pid.' + table.log).orderBy('table_pk').limit(8);
    if (!template.length) continue;

    await db('ora_pid.' + table.log).where('table_pk', '>=', FIXTURE_BASE).del();
    await db('ora_pid.' + table.stats).where('table_pk', '>=', FIXTURE_BASE).del();

    const rows = [];
    const totals = {};

    ids.forEach(function (userId, m) {
      template.forEach(function (source, i) {
        const soft = Number(source.soft_points) || 0;
        totals[userId] = (totals[userId] || 0) + soft;

        rows.push(Object.assign({}, source, {
          table_pk: FIXTURE_BASE + (t * 1000000) + (m * 1000) + i,
          user_pk: userId,
          /* Spread backwards a few days each, so the merged ledger interleaves
             the five systems instead of stacking them by table. */
          action_at: daysAgo((i * 3) + t)
        }));
      });
    });

    await db('ora_pid.' + table.log).insert(rows);
    await db('ora_pid.' + table.stats).insert(ids.map(function (userId, m) {
      return {
        table_pk: FIXTURE_BASE + (t * 1000000) + 900000 + m,
        user_pk: userId,
        total_points: Math.round(totals[userId] || 0),
        limit_points: 5000,
        updated_at: new Date()
      };
    }));

    written += rows.length;
    /* eslint-enable no-await-in-loop */
  }

  written += await mirrorActivityPoints(ids);
  return { members: ids.length, rows: written };
}

/** Activity is the fifth system and the one with a different shape. */
async function mirrorActivityPoints(ids) {
  const template = await db('ora_pid.activity_point_log').orderBy('table_pk').limit(6);
  if (!template.length) return 0;

  await db('ora_pid.activity_point_log').where('table_pk', '>=', FIXTURE_BASE).del();
  await db('ora_pid.activity_point_stats').where('table_pk', '>=', FIXTURE_BASE).del();

  const rows = [];
  const totals = {};

  ids.forEach(function (userId, m) {
    template.forEach(function (source, i) {
      totals[userId] = (totals[userId] || 0) + (Number(source.points) || 0);
      rows.push(Object.assign({}, source, {
        table_pk: FIXTURE_BASE + 5000000 + (m * 1000) + i,
        user_pk: userId,
        action_at: daysAgo((i * 2) + 1)
      }));
    });
  });

  await db('ora_pid.activity_point_log').insert(rows);
  await db('ora_pid.activity_point_stats').insert(ids.map(function (userId, m) {
    return {
      table_pk: FIXTURE_BASE + 5900000 + m,
      user_pk: userId,
      total_points: Math.round(totals[userId] || 0),
      limit_points: 3000,
      minus_points: 0,
      updated_at: new Date()
    };
  }));

  return rows.length;
}

function daysAgo(n) {
  return new Date(Date.now() - (n * 24 * 60 * 60 * 1000));
}

/* ------------------------------------------------------------------ */
/*  registration points, and who the member is                         */
/* ------------------------------------------------------------------ */

/**
 * WHAT THE MEMBER DASHBOARD'S REGISTER CARD AND DETAILS PANEL READ, for the
 * demo members: register_point_log and user_phone_numbers, which are EMPTY in
 * the vendor's converted stand-in - so without this the card's phone half is
 * 0 for everybody and the panel has no number to show.
 *
 * EVERY FILTER THE DASHBOARD APPLIES HAS SOMETHING TO EXCLUDE, the same rule
 * the old logs below are written to. A phone registration (point_type 0) sits
 * beside an eproduct one (1) and a manager's deduction (2); the member's own
 * numbers (phone_type 0) sit beside one left on a device report (1), one on a
 * feedback thread (2) and one a manager typed in (3). A query that forgot its
 * point_type or phone_type would show a different figure, and
 * scripts/check.js compares the two.
 *
 * SHAPED LIKE THE VENDOR'S OWN WRITES: a phone registration carries the
 * handset's product, its name and its IMEI in equ_num, status PLUS
 * (clientProductController); a deduction is MANAGER / MINUS with a negative
 * amount (adminPointController).
 *
 * THE DEMO MEMBER GETS A GENDER AND A BIRTHDAY where the platform row has
 * none, so the panel has something to format - a value somebody set is never
 * overwritten. The second member is deliberately left without either, so a
 * dash is on a real page as well as in a test.
 *
 * Its own pk space, as every writer here: only rows this wrote are replaced.
 */
const REGISTER_FIXTURE_BASE = FIXTURE_BASE + 7000000;
const PHONE_FIXTURE_BASE = FIXTURE_BASE + 8000000;

async function mirrorRegistrations() {
  const members = await db('users').select('id').orderBy('id').limit(6);
  if (!members.length) return { registrations: 0, phones: 0 };

  const ids = members.map(function (row) { return row.id; });
  const handsets = await db('ora_pid.products').orderBy('product_pk').limit(4)
    .select('product_pk', 'product_name');

  await db('ora_pid.register_point_log')
    .where('table_pk', '>=', REGISTER_FIXTURE_BASE)
    .where('table_pk', '<', REGISTER_FIXTURE_BASE + 1000000)
    .del();
  await db('ora_pid.user_phone_numbers')
    .where('phone_pk', '>=', PHONE_FIXTURE_BASE)
    .where('phone_pk', '<', PHONE_FIXTURE_BASE + 1000000)
    .del();

  const registrations = [];
  const phones = [];

  ids.forEach(function (userId, m) {
    const at = function (i) { return REGISTER_FIXTURE_BASE + (m * 1000) + i; };
    /* Fifteen digits, as an IMEI is; unique per member and handset. */
    const imei = function (i) { return '86' + String(4321000000000 + (userId * 1000) + i); };

    /* Two or three handsets - enough that the sum is a sum. */
    const owned = 2 + (m % 2);
    for (let i = 0; i < owned && handsets.length; i += 1) {
      const handset = handsets[(m + i) % handsets.length];
      registrations.push({
        table_pk: at(i), user_pk: userId,
        point_type: 0, status: 0,
        product_pk: handset.product_pk, product_name: handset.product_name,
        equ_num: imei(i), reason: null,
        points: [300, 500, 200][i], action_at: daysAgo(40 - (i * 9) + m)
      });
    }

    /* Not phone registrations - here to be left out of the phone figure. */
    registrations.push({
      table_pk: at(10), user_pk: userId, point_type: 1, status: 0,
      product_pk: null, product_name: 'C9 Pro set-top box', equ_num: 'CR' + (700000000 + userId),
      reason: null, points: 650, action_at: daysAgo(12 + m)
    });
    registrations.push({
      table_pk: at(11), user_pk: userId, point_type: 2, status: 1,
      product_pk: null, product_name: null, equ_num: null,
      reason: 'Registration reversed by support', points: -150, action_at: daysAgo(6 + m)
    });

    const number = function (i) { return '138' + String(10000000 + (userId * 7919) + (i * 1111)).slice(-8); };
    const own = m === 0 ? 2 : 1;
    for (let i = 0; i < own; i += 1) {
      phones.push({ phone_pk: PHONE_FIXTURE_BASE + (m * 100) + i, user_pk: userId, phone_number: number(i), phone_type: 0 });
    }
    [1, 2, 3].forEach(function (type) {
      phones.push({ phone_pk: PHONE_FIXTURE_BASE + (m * 100) + 10 + type, user_pk: userId, phone_number: number(10 + type), phone_type: type });
    });
  });

  await db('ora_pid.register_point_log').insert(registrations);
  await db('ora_pid.user_phone_numbers').insert(phones);

  await db('ora_pid.users').where('user_pk', ids[0]).whereNull('gender').update({ gender: 'F' });
  await db('ora_pid.users').where('user_pk', ids[0]).whereNull('birthday').update({ birthday: '1992-03-18' });

  return { registrations: registrations.length, phones: phones.length };
}

/* ------------------------------------------------------------------ */
/*  the three systems that ran before this one                         */
/* ------------------------------------------------------------------ */

/**
 * THE OLD LOGS, for the members this script has bridged.
 *
 * Three history pages read three satellite databases - the karaoke keygen
 * service, the media service, and the customer database that predates the
 * platform. None of them exist on a development machine, so without this the
 * pages are correct and empty, which is indistinguishable from broken.
 *
 * EVERY FILTER THE REPOSITORY APPLIES IS EXERCISED. The rows below are not
 * uniformly valid: some are agency keyings, some failed, one is reversed, and
 * some fall before the cutover date. A seed where everything passes proves
 * only that the query runs - it cannot show that the filtering does anything,
 * and a filter that has never excluded a row is a filter nobody has tested.
 *
 * ONE MEMBER IS MERGED. The merge log caps their old history at the moment
 * they became one account, which is the rule most likely to be quietly
 * dropped and the hardest to notice: without a merged member in the data,
 * `limitFor` returns null on every request and the whole cap is dead code.
 */
const OLD_BASE = 960000000;

/*
 * One band per table, so four sets of rows can share one OLD_BASE without
 * colliding and each can still be deleted by a single range. A member index
 * times a hundred leaves room for the nine rows any of them writes.
 */
const KARAOKE_BAND = 100000;
const MEDIA_BAND = 200000;
const ERROR_BAND = 300000;
const SCORE_BAND = 400000;

async function mirrorOldLogs() {
  /*
   * EVERY MEMBER WITH A PLATFORM IDENTITY, not a chosen few.
   *
   * Two narrower answers were tried and both left somebody staring at three
   * empty pages. Taking the lowest six merge rows covers the accounts the
   * SEED created and nobody else, so an account registered on the site
   * afterwards - which is every real one - gets nothing. Taking the highest
   * few as well does not help either: the ids are not ordered by when
   * somebody signed up, so a real account can sit in the middle and be
   * missed by both ends. It did.
   *
   * There is no selection that is obviously right, which is the signal that
   * there should not be one. A few thousand rows in a development database
   * costs nothing, and "which members did we happen to pick" stops being a
   * question anybody has to answer.
   */
  const memberIds = await db('users').pluck('id');

  const members = await db('ora_pid.user_merge_ids')
    .whereIn('pvendor_pk', memberIds.length ? memberIds : [-1])
    .select('pvendor_pk', 'pvendor_id', 'fixed_id', 'eshop_pk')
    .orderBy('pvendor_pk');

  if (!members.length) return { karaoke: 0, media: 0, prizes: 0, merged: 0 };

  /*
   * Re-runnable: everything below owns an id at or above OLD_BASE.
   *
   * THE IDS ARE NUMBERS, one band per table. They used to be strings -
   * 'KOLD0-3', 'MOLD1-5' - which read beautifully and only worked against
   * the stand-in this script created. The real satellite tables declare
   * every one of these keys BIGINT, so the strings were a seed that could
   * never be run against a converted instance, and a delete like
   * `id LIKE 'KOLD%'` is not even a legal comparison there.
   */
  await db('ora_license.tbl_error_list').where('id', '>=', OLD_BASE).del();
  await db('ora_license.tbl_licgen').where('id', '>=', OLD_BASE).del();
  await db('ora_media.tbl_licenses').where('id', '>=', OLD_BASE).del();
  await db('ora_media.tbl_old_license_score').where('id', '>=', OLD_BASE).del();
  await db('ora_old_db.customer_prize_log').where('id', '>=', OLD_BASE).del();
  await db('ora_pid.user_merge_log').where('table_pk', '>=', OLD_BASE).del();

  const karaoke = [];
  const errors = [];
  const media = [];
  const scores = [];
  const prizes = [];
  const merges = [];
  const fixedIds = [];

  const providers = [
    { id: 1, short_name: 'MRS', full_name: 'Mansudae Radio Service' },
    { id: 2, short_name: 'KCT', full_name: 'Korea Central TV' },
    { id: 3, short_name: 'RGN', full_name: 'Ryugyong Network' }
  ];
  await insertMissing('ora_media.tbl_media_providers', 'id', providers);

  members.forEach(function (member, m) {
    const login = member.pvendor_id;

    for (let i = 0; i < 9; i += 1) {
      const id = OLD_BASE + KARAOKE_BAND + (m * 100) + i;

      /*
       * Three rows in nine are excluded, one by each rule: an agency keying,
       * a failed one, and one that was reversed afterwards.
       */
      const agency = i === 2;
      const failed = i === 5;
      const reversed = i === 7;

      karaoke.push({
        id: id,
        userid: login,
        machinekey: 'MK-' + (100000 + (m * 1000) + i) + '-' + (500000 + i),
        real_price: 40 + (i * 13),
        /*
         * A TENTH OF A POINT ON EVERY OTHER ROW, because the column holds
         * three decimals and a fixture of whole numbers cannot tell a page
         * that rounds from one that does not. 0.4 displayed as 0 is the
         * complaint this data exists to reproduce.
         */
        bonus_score: 4 + i + (i % 2 ? 0.4 : 0),
        is_agent: agency ? 1 : 0,
        resultlog: failed ? 3 : 0,
        /* SPREAD ACROSS THE MERGE INSTANT, which is forty days back. A
           merged member sees the older half and nothing newer; an unmerged
           one sees all nine. Bunched on one side of it, the cap either
           hides everything or hides nothing, and neither shows it works. */
        created_at: daysAgo((i * 12) + m + 5)
      });

      if (reversed) {
        errors.push({
          id: OLD_BASE + ERROR_BAND + (m * 100) + i,
          lic_id: id,
          error_status: 2,
          note: 'reversed by the service'
        });
      }

      /* A note that is NOT a reversal, so the OR NULL branch is not the only
         one that ever lets a row through. */
      if (i === 4) {
        errors.push({
          id: OLD_BASE + ERROR_BAND + (m * 100) + i,
          lic_id: id,
          error_status: 1,
          note: 'reported, not reversed'
        });
      }
    }

    for (let i = 0; i < 7; i += 1) {
      media.push({
        id: OLD_BASE + MEDIA_BAND + (m * 100) + i,
        userid: login,
        dev_id: 'DEV-' + (200000000 + (m * 10000) + i),
        provider: providers[i % providers.length].id,
        cal_price: 25 + (i * 9),
        bonus_score: 2 + i,
        /* One failure, which the `result = 1` filter has to drop. */
        result: i === 3 ? 0 : 1,
        date_time: daysAgo((i * 16) + m + 8)
      });
    }

    /* The carry-forward balance, one per member, shown last on the last page. */
    scores.push({
      id: OLD_BASE + SCORE_BAND + m,
      userid: login,
      cal_price: 120 + (m * 15),
      score: 15 * (30 + m),
      status: 1,
      date_time: daysAgo(120 + m)
    });

    /* The prize log is keyed by the OLD customer id, not the platform one. */
    for (let i = 0; i < 8; i += 1) {
      prizes.push({
        id: OLD_BASE + (m * 100) + i,
        customer_id: Number(member.eshop_pk),
        /* Fractional on every third row - prize_val is numeric(10,1) and a
           prize of 0.4 points is a real award, not a rounding artefact. */
        prize_val: 50 + (i * 25) + (i % 3 === 1 ? 0.4 : 0),
        note: PRIZE_NOTES[i % PRIZE_NOTES.length],
        fill_date: daysAgo((i * 11) + m + 3)
      });
    }

    /*
     * THE FIRST MEMBER IS MERGED and nobody else is.
     *
     * Their old history is capped forty days back, so their pages show fewer
     * rows than an unmerged member's - which is the only way to see that the
     * cap is doing anything at all.
     *
     * THE FIXED ID IS GIVEN HERE, because the identity bridge does not set
     * one: it writes the storefront keys and leaves `fixed_id` null. The
     * merge log is keyed by that id, so without one the rule cannot fire for
     * any member and `limitFor` is dead code that always answers null.
     */
    if (m === 0) {
      const fixedId = member.fixed_id || (member.pvendor_id + '_fx');

      if (!member.fixed_id) fixedIds.push({ pvendor_pk: member.pvendor_pk, fixed_id: fixedId });

      merges.push({
        table_pk: OLD_BASE + 1,
        pvendor_pk: Number(member.pvendor_pk),
        pvendor_id: member.pvendor_id,
        id_type: 0,
        merge_id: fixedId,
        merge_type: 0,
        action_at: daysAgo(40),
        /* Both are NOT NULL on the real table; the merge was self-service. */
        action_type: 0,
        action_by: Number(member.pvendor_pk)
      });
    }
  });

  /*
   * The old customer database, which identity.repository falls back to when a
   * member has no merge row. It has never existed in the stand-in, so that
   * path has always failed silently here.
   */
  await insertMissing('ora_old_db.customers', 'user_pk', members.map(function (member) {
    return {
      user_pk: Number(member.eshop_pk),
      user_userid: member.pvendor_id,
      user_name: member.pvendor_id
    };
  }));

  await db('ora_license.tbl_licgen').insert(karaoke);
  if (errors.length) await db('ora_license.tbl_error_list').insert(errors);
  await db('ora_media.tbl_licenses').insert(media);
  await db('ora_media.tbl_old_license_score').insert(scores);
  await db('ora_old_db.customer_prize_log').insert(prizes);
  /* The merge log is keyed by the fixed id, so it has to exist first. */
  for (let f = 0; f < fixedIds.length; f += 1) {
    /* eslint-disable no-await-in-loop */
    await db('ora_pid.user_merge_ids')
      .where('pvendor_pk', fixedIds[f].pvendor_pk)
      .update({ fixed_id: fixedIds[f].fixed_id });
    /* eslint-enable no-await-in-loop */
  }

  if (merges.length) await db('ora_pid.user_merge_log').insert(merges);

  return {
    karaoke: karaoke.length,
    media: media.length,
    prizes: prizes.length,
    merged: merges.length
  };
}

const PRIZE_NOTES = [
  'Spring campaign prize',
  'Referred a friend',
  'Survey completed',
  'Anniversary bonus',
  'Community event'
];

/* ------------------------------------------------------------------ */
/*  the blog                                                           */
/* ------------------------------------------------------------------ */

async function mirrorBlog() {
  const articles = await db('articles').orderBy('id');
  if (!articles.length) return { added: 0, kept: 0 };

  const ids = articles.map(function (row) { return row.id; });

  const kept = await db('ora_blog.blog_article').whereNotIn('id', ids).count({ c: '*' }).first();

  await db('ora_blog.blog_article_lob').whereIn('id', ids).del();
  await db('ora_blog.blog_article_info').whereIn('id', ids).del();
  await db('ora_blog.blog_article').whereIn('id', ids).del();

  await db('ora_blog.blog_article').insert(articles.map(function (row) {
    return {
      id: row.id,
      /*
       * The byline is a LOGIN NAME in this schema, not a display name - the
       * vendor's blog joins that string to resolve an author. The seeded
       * articles carry a display name, so it is folded into something
       * login-shaped, which is what a real migration would have to do too.
       */
      user_userid: loginish(row.author),
      subject_id: codes.topicToSubject(row.category),
      parent: 0,
      title: row.title,
      summary: row.summary,
      cleaned_content: String(row.content || '').replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ').trim(),
      image_url: row.cover_image,
      state: codes.articleStatusToState(row.is_deleted ? 'ARCHIVED' : row.status),
      /* OLD_BLOG_ARTICLE_TYPES: 2 is a blog article rather than a forum post. */
      type: 2,
      create_at: row.created_at,
      modify_at: row.updated_at,
      publish_at: row.published_at
    };
  }));

  await db('ora_blog.blog_article_info').insert(articles.map(function (row) {
    return {
      id: row.id,
      visited_num: row.view_count || 0,
      reply_num: 0,
      /* Featured is the GOLD recommendation in this schema; see the repository. */
      gold_recom_num: row.is_featured ? 1 : 0
    };
  }));

  await db('ora_blog.blog_article_lob').insert(articles.map(function (row) {
    return { id: row.id, content: row.content };
  }));

  await bump('ora_blog.blog_article_s', 'ora_blog.blog_article', 'id');

  return { added: articles.length, kept: Number(kept.c) };
}

/**
 * A FEW ARTICLES WRITTEN BY THE DEMO MEMBERS THEMSELVES.
 *
 * The blog rows mirrored above are Crystal's editorial ones, authored by staff
 * - so "My Articles" in the member centre was correctly empty and looked
 * broken. These are the member's own, one per state, so the page shows what it
 * is actually for: a draft, something awaiting review, something published and
 * something that was refused.
 *
 * Written in the fixture id range, additive, and replaced on re-run - the
 * vendor's own 48 articles are never touched.
 */
const MEMBER_ARTICLES = [
  { title: 'Two weeks with the C9 Pro', state: 'PUBLISHED', topic: 'PRODUCTS' },
  { title: 'How I fixed my sync drop-outs', state: 'PUBLISHED', topic: 'SOFTWARE' },
  { title: 'Battery notes, still writing this one', state: 'DRAFT', topic: 'PRODUCTS' },
  { title: 'A guide to the camera modes', state: 'REVIEW', topic: 'PRODUCTS' },
  { title: 'Why my repair took nine days', state: 'ARCHIVED', topic: 'SERVICE' }
];

async function mirrorMemberArticles() {
  const members = await db('users').whereNotNull('login').orderBy('id').limit(3);
  if (!members.length) return 0;

  const base = FIXTURE_BASE + 700000;
  const ids = [];
  members.forEach(function (member, m) {
    MEMBER_ARTICLES.forEach(function (article, i) { ids.push(base + (m * 100) + i); });
  });

  await db('ora_blog.blog_article_lob').whereIn('id', ids).del();
  await db('ora_blog.blog_article_info').whereIn('id', ids).del();
  await db('ora_blog.blog_article').whereIn('id', ids).del();

  const rows = [];
  const infos = [];
  const lobs = [];

  members.forEach(function (member, m) {
    MEMBER_ARTICLES.forEach(function (article, i) {
      const id = base + (m * 100) + i;
      const at = daysAgo((i * 6) + 2);

      rows.push({
        id: id,
        user_userid: member.login,
        subject_id: codes.topicToSubject(article.topic),
        parent: 0,
        title: article.title,
        summary: '<p>' + article.title + '.</p>',
        cleaned_content: article.title + '.',
        state: codes.articleStatusToState(article.state),
        type: 2,
        create_at: at,
        modify_at: at,
        publish_at: article.state === 'PUBLISHED' ? at : null
      });

      infos.push({ id: id, visited_num: (i + 1) * 37, reply_num: i });
      lobs.push({ id: id, content: '<p>' + article.title + ' - written by ' + member.login + '.</p>' });
    });
  });

  await db('ora_blog.blog_article').insert(rows);
  await db('ora_blog.blog_article_info').insert(infos);
  await db('ora_blog.blog_article_lob').insert(lobs);

  return rows.length;
}

/**
 * THE SHELVES, ONLY WHERE THERE ARE NONE.
 *
 * blog_subject is the vendor's reference data, not Crystal's, and on a machine
 * that already has the vendor's converted schemas it is there and is left
 * exactly as it is. The one case this writes is a stand-in whose table
 * sql/legacy/ora_blog.sql has just created EMPTY - nobody's rows to disturb,
 * and without shelves the storefront's index has nothing to navigate by.
 *
 * The ids are the vendor's own, from BLOG_OLD_CATEGORIES in vendor_client's
 * constants.js, and the names are the ones its development seed gives them.
 * `state` 0 is what the vendor's model reads as live.
 */
const VENDOR_SUBJECTS = [
  { id: 1, name: 'Discussion', parent: 0, order_no: 1 },
  { id: 2, name: 'Product', parent: 0, order_no: 2 },
  { id: 21, name: 'Mobile phone', parent: 2, order_no: 1 },
  { id: 22, name: 'TV', parent: 2, order_no: 2 },
  { id: 23, name: 'Computer', parent: 2, order_no: 3 },
  { id: 24, name: 'Other', parent: 2, order_no: 4 },
  { id: 3, name: 'IT', parent: 0, order_no: 3 },
  { id: 4, name: 'Science', parent: 0, order_no: 4 },
  { id: 5, name: 'Economy', parent: 0, order_no: 5 },
  { id: 6, name: 'Help', parent: 0, order_no: 6 }
];

/* The two shelves the questions below are filed on, by the vendor's ids above. */
const SUBJECT_HELP = 6;
const SUBJECT_MOBILE = 21;

async function seedSubjects() {
  const have = await db('ora_blog.blog_subject').count({ c: '*' }).first();
  if (Number(have.c) > 0) return 0;

  await db('ora_blog.blog_subject').insert(VENDOR_SUBJECTS.map(function (row) {
    return Object.assign({ state: 0 }, row);
  }));

  return VENDOR_SUBJECTS.length;
}

/**
 * CONVERSATIONS: replies, and a question that got its answer.
 *
 * Everything above writes ARTICLES, so the development blog had no replies in
 * it at all - and a thread page with nothing to page, no reply to link to and
 * no answer to surface is a page nobody can develop against. These are the
 * shapes the storefront has to get right, each on purpose:
 *
 *   A LONG THREAD on the newest editorial article: 23 published replies, so
 *   ten a page is three pages and the last one is short. Two more replies on
 *   it are a DRAFT and one AWAITING REVIEW, and a reader must never see either.
 *
 *   A SHORT THREAD on the next article, and two replies on a demo member's own
 *   article - so "My articles" has somebody else's replies under its owner's
 *   article, and the members' own replies elsewhere.
 *
 *   A QUESTION WITH AN ACCEPTED ANSWER, asked by the first demo member and
 *   filed under Help: three replies, the middle one of which is marked
 *   correct the way the vendor marks it (help_status CORRECT_CHECK on the
 *   reply, CORRECT on the question). One reply carries a picture and a link,
 *   so what the reader is shown of stored HTML is exercised by real data.
 *
 *   AN OPEN QUESTION with no replies yet, on a SUB-shelf (Product > Mobile
 *   phone) - the empty thread, and a shelf that only its parent's filter
 *   reaches if the tree is not honoured.
 *
 * Own rows only: everything is written in one band of the fixture range and
 * removed by that range on re-run, and the parents' reply counters are
 * corrected only on articles this script wrote itself.
 */
const THREAD_BASE = FIXTURE_BASE + 710000;
const THREAD_BAND = 10000;

const LONG_THREAD_LINES = [
  'The staged rollout reached my C9 this morning. Photo search found a receipt from March in about two seconds.',
  'Is the service-book export available on the C5 yet, or does that arrive with the second wave?',
  'The C5 got it yesterday here. Settings, then About, then Service book.',
  'Battery drain after the update settled down after the second night, for what it is worth.',
  'Does the on-device search index photos in a shared album, or only ones taken on the phone?',
  'Shared albums are indexed once they are downloaded. Streamed-only photos are not.',
  'Update took eleven minutes on Wi-Fi. No settings lost.',
  'Any word on when televisions get it? The changelog says a month.',
  'A month behind, as the article says - a set-top rollback is a service visit.',
  'The new quick settings layout took a day to get used to and now I prefer it.',
  'Is there a way to turn off the search suggestions on the lock screen?',
  'Settings, Privacy, Lock screen, and switch off Suggestions.',
  'Thank you - that was exactly it.',
  'My banking app asked me to sign in again after the update, which is normal after a security patch.',
  'Keyboard vibration seems stronger than before. Anyone else?',
  'It reset to the default strength for me too. It is under Sounds and vibration.',
  'Very happy the rollback path is documented this time.',
  'Photo search works in Chinese as well - searched for 发票 and it found the receipt.',
  'Did anyone else lose their always-on display schedule?',
  'Mine kept it. Worth checking whether battery saver was on during the update.',
  'The update notes in the Service book are a good idea. Easier than hunting for a changelog.',
  'C9 Pro here, no problems after a week.',
  'First post on the new blog. Glad the replies are readable on a phone now.'
];

async function mirrorThreads() {
  const members = await db('users').whereNotNull('login').orderBy('id').limit(3);
  /*
   * The long thread is a conversation about a software update, so it goes on
   * the newest SOFTWARE article when there is one - the same lines under a
   * piece about spare parts would read as a fixture, not a thread.
   */
  const editorial = await db('articles')
    .where('status', 'PUBLISHED')
    .where('is_deleted', false)
    .orderByRaw('CASE WHEN category = ? THEN 0 ELSE 1 END', ['SOFTWARE'])
    .orderBy('published_at', 'desc')
    .limit(2);

  await db('ora_blog.blog_article_lob').where('id', '>=', THREAD_BASE).where('id', '<', THREAD_BASE + THREAD_BAND).del();
  await db('ora_blog.blog_article_info').where('id', '>=', THREAD_BASE).where('id', '<', THREAD_BASE + THREAD_BAND).del();
  await db('ora_blog.blog_article').where('id', '>=', THREAD_BASE).where('id', '<', THREAD_BASE + THREAD_BAND).del();

  if (!members.length) return { replies: 0, questions: 0 };

  const login = function (n) { return members[n % members.length].login; };
  const staff = editorial.length ? loginish(editorial[0].author) : login(0);

  const rows = [];
  const infos = [];
  const lobs = [];
  let next = THREAD_BASE;

  /** One row in all three tables. `minutesAgo` sets when it was published. */
  const write = function (spec) {
    const id = next;
    next += 1;

    const at = new Date(Date.now() - spec.minutesAgo * 60 * 1000);
    const text = String(spec.html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const published = spec.state === codes.ARTICLE_STATE.PUB_APPROVED;

    rows.push({
      id: id,
      user_userid: spec.author,
      subject_id: spec.subject,
      parent: spec.parent,
      title: spec.title,
      summary: text.slice(0, 200),
      cleaned_content: text,
      state: spec.state,
      /* OLD_BLOG_ARTICLE_TYPES.BLOG - the vendor's compose page sends it for replies too. */
      type: 2,
      create_at: at,
      modify_at: at,
      publish_at: published ? at : null
    });

    infos.push({
      id: id,
      is_help_request: spec.question ? 1 : 0,
      help_status: spec.helpStatus || 0,
      visited_num: spec.visits || 0,
      reply_num: 0,
      gold_recom_num: spec.gold || 0,
      silber_recom_num: 0,
      recommended_num: 0,
      is_new: 0
    });

    lobs.push({ id: id, content: spec.html });
    return id;
  };

  const approved = codes.ARTICLE_STATE.PUB_APPROVED;

  /* ---- a long thread, and a short one ---- */
  if (editorial.length) {
    const long = editorial[0];
    const subject = codes.topicToSubject(long.category);

    LONG_THREAD_LINES.forEach(function (line, i) {
      write({
        parent: long.id,
        subject: subject,
        author: i % 4 === 3 ? staff : login(i),
        title: 'Re: ' + long.title,
        html: '<p>' + line + '</p>',
        state: approved,
        /* Oldest first in the list, so the newest - the last line - is on top. */
        minutesAgo: (LONG_THREAD_LINES.length - i) * 97,
        visits: 3 + (i * 7) % 40
      });
    });

    /*
     * Both by the FIRST member - the demo account - so the member centre shows
     * them as that member's own unpublished replies, and check.js can prove
     * from the outside that the thread does not.
     */
    write({
      parent: long.id, subject: subject, author: login(0), title: 'Re: ' + long.title,
      html: '<p>Still writing this one - a draft a reader must never see.</p>',
      state: codes.ARTICLE_STATE.PUB_TEMP, minutesAgo: 5
    });
    write({
      parent: long.id, subject: subject, author: login(0), title: 'Re: ' + long.title,
      html: '<p>Submitted and waiting for review - not public yet.</p>',
      state: codes.ARTICLE_STATE.PUB_REQUEST, minutesAgo: 3
    });
  }

  if (editorial.length > 1) {
    const short = editorial[1];
    const subject = codes.topicToSubject(short.category);

    ['<p>Useful write-up, thank you.</p>',
      '<p>Would be good to see the same for the <strong>C5</strong>.</p>',
      '<p>Agreed - and a date for when it lands.</p>'
    ].forEach(function (html, i) {
      write({
        parent: short.id, subject: subject, author: login(i + 1), title: 'Re: ' + short.title,
        html: html, state: approved, minutesAgo: (3 - i) * 180, visits: 4 + i
      });
    });
  }

  /* ---- replies under a member's own article ---- */
  const ownArticle = FIXTURE_BASE + 700000;
  const owned = await db('ora_blog.blog_article').where('id', ownArticle).first('id', 'title', 'subject_id');
  if (owned) {
    write({
      parent: owned.id, subject: owned.subject_id, author: login(1), title: 'Re: ' + owned.title,
      html: '<p>Two weeks in and the battery numbers match mine almost exactly.</p>',
      state: approved, minutesAgo: 600, visits: 9
    });
    write({
      parent: owned.id, subject: owned.subject_id, author: login(2), title: 'Re: ' + owned.title,
      html: '<p>Did you keep the adaptive refresh rate on?</p>',
      state: approved, minutesAgo: 420, visits: 6
    });
  }

  /* ---- a question, answered ---- */
  const questionTitle = 'My C9 Pro stops charging at 80% - is that a fault?';
  const question = write({
    parent: 0,
    subject: SUBJECT_HELP,
    author: login(0),
    title: questionTitle,
    html: '<p>Since last week my C9 Pro stops charging at <strong>80%</strong> overnight and only '
      + 'finishes when I unplug and plug it in again.</p><p>Is this a fault with the charger, or '
      + 'something the phone is doing on purpose?</p>',
    state: approved,
    question: true,
    helpStatus: codes.HELP_STATUS.CORRECT,
    minutesAgo: 3 * 24 * 60,
    visits: 214
  });

  write({
    parent: question, subject: SUBJECT_HELP, author: login(2), title: 'Re: ' + questionTitle,
    html: '<p>Mine does the same. I assumed it was the cable.</p>',
    state: approved, minutesAgo: 3 * 24 * 60 - 45, visits: 31
  });
  write({
    parent: question, subject: SUBJECT_HELP, author: login(1), title: 'Re: ' + questionTitle,
    html: '<p>That is <strong>Adaptive charging</strong>, not a fault. The phone learns when you '
      + 'usually unplug and holds at 80% until shortly before then, which is kinder to the battery.</p>'
      + '<ul><li>Settings</li><li>Battery</li><li>Adaptive charging - switch it off to charge straight to 100%.</li></ul>'
      + '<p><img src="https://example.com/adaptive-charging.png" alt="The Adaptive charging switch">'
      + 'There is more in the <a href="https://example.com/battery-guide">battery guide</a>.</p>',
    state: approved,
    helpStatus: codes.HELP_CORRECT_CHECK,
    minutesAgo: 2 * 24 * 60,
    visits: 188,
    gold: 3
  });
  write({
    parent: question, subject: SUBJECT_HELP, author: staff, title: 'Re: ' + questionTitle,
    html: '<p>Confirming the answer above. If it still stops at 80% with the setting off, '
      + 'book a battery check at any service centre.</p>',
    state: approved, minutesAgo: 2 * 24 * 60 - 30, visits: 96
  });

  /* ---- a question nobody has answered yet, on a sub-shelf ---- */
  write({
    parent: 0,
    subject: SUBJECT_MOBILE,
    author: login(1),
    title: 'Can the C5 use two eSIM profiles at once?',
    html: '<p>I would like to keep a work number and a personal number on one C5 without a '
      + 'physical SIM. Is that supported?</p>',
    state: approved,
    question: true,
    helpStatus: codes.HELP_STATUS.IN_PROGRESS,
    minutesAgo: 26 * 60,
    visits: 41
  });

  await db('ora_blog.blog_article').insert(rows);
  await db('ora_blog.blog_article_info').insert(infos);
  await db('ora_blog.blog_article_lob').insert(lobs);

  /*
   * THE PARENTS' reply_num, corrected - on rows this script owns, and only
   * those: the editorial mirror and the member articles are rewritten on every
   * run, and a counter that disagrees with the thread under it is exactly the
   * vendor data this integration had to stop trusting.
   */
  const parents = {};
  rows.forEach(function (row) {
    if (row.parent && row.state === approved) parents[row.parent] = (parents[row.parent] || 0) + 1;
  });

  const editorialIds = editorial.map(function (row) { return Number(row.id); });
  const ownIds = Object.keys(parents).map(Number).filter(function (id) {
    return editorialIds.indexOf(id) !== -1 || id >= FIXTURE_BASE;
  });

  for (let i = 0; i < ownIds.length; i += 1) {
    /* eslint-disable no-await-in-loop */
    await db('ora_blog.blog_article_info').where('id', ownIds[i]).update({ reply_num: parents[ownIds[i]] });
    /* eslint-enable no-await-in-loop */
  }

  return {
    replies: rows.filter(function (row) { return row.parent; }).length,
    questions: rows.filter(function (row, i) { return !row.parent && infos[i].is_help_request; }).length
  };
}

/** A display name as a login: lower case, letters and digits only. */
function loginish(name) {
  const cleaned = String(name || 'crystal').toLowerCase().replace(/[^a-z0-9]+/g, '');
  return (cleaned || 'crystal').slice(0, 50);
}

/**
 * AN EMAIL AS A PLATFORM LOGIN, and the local part is the whole answer.
 *
 * ora_pid.users is keyed by `user_id`, and sign-in now checks that table - so
 * this is the name a member actually types. Flattening the whole address gave
 * "democrystalexample", which nobody would guess and which does not match the
 * email fallback the login service tries.
 *
 * Dots and hyphens survive because they are legal in a login and are part of
 * how people write their own names. A collision with a login the platform
 * already has - "demo" is taken by the vendor's own demo user - takes the
 * member's id as a suffix rather than overwriting somebody else's account.
 */
function loginFromEmail(email, id, taken) {
  const local = String(email || '').split('@')[0].toLowerCase().replace(/[^a-z0-9._-]+/g, '');
  const base = (local || ('crystal' + id)).slice(0, 40);

  /*
   * On collision, qualify with the site before falling back to the id.
   * "demo" belongs to the vendor's own demo user, so Crystal's becomes
   * "demo.crystal" - a name somebody can be told over the phone, which
   * "demo.1160" is not.
   */
  if (!taken[base]) return base;
  if (!taken[base + '.crystal']) return base + '.crystal';
  return base + '.' + id;
}

/**
 * Move a sequence past every key in its table.
 *
 * Oracle's are long past them already. A stand-in whose sequence still sits at
 * 1 hands the next new row a primary key that is taken, and the first thing
 * anybody writes in development fails on a duplicate.
 */
async function bump(sequence, table, key) {
  const row = await db(table).max({ m: key }).first();
  await db.raw('SELECT setval(?, ?)', [sequence, Number(row.m || 0) + 1]);
}

/* ------------------------------------------------------------------ */

async function main() {
  if (legacy.driver() !== 'postgres') {
    throw new Error(
      'LEGACY_DRIVER is oracle. This script builds the DEVELOPMENT stand-in and ' +
      'must never be pointed at the vendor\'s instance - those tables already ' +
      'exist there and Crystal does not own them.'
    );
  }

  /*
   * IF NOT EXISTS throughout, so on a machine where the vendor's converted
   * schemas are already present - which is the normal case - this changes
   * nothing and the real tables are used as they stand.
   */
  await run('ora_pid.sql');
  await run('ora_blog.sql');
  await run('ora_satellite.sql');
  console.log('schemas ' + config.legacy.pidSchema + ', ' + config.legacy.blogSchema
    + ' and the three satellites are in place');

  const bridged = await bridgeIdentities();
  console.log('identity bridge: +' + bridged.users + ' users, +' + bridged.managers + ' managers, +'
    + bridged.merges + ' storefront keys, ' + bridged.synced + ' logins resynced, '
    + bridged.pruned + ' stale rows pruned');

  const feedback = await mirrorFeedback();
  const subjects = await seedSubjects();
  const blog = await mirrorBlog();
  const points = await mirrorPoints();
  const registrations = await mirrorRegistrations();
  const written = await mirrorMemberArticles();
  /* After both article writers: the threads hang replies off rows they wrote. */
  const threads = await mirrorThreads();
  const old = await mirrorOldLogs();

  console.log('feedback: ' + feedback.threads + ' threads, ' + feedback.messages + ' messages');
  console.log('blog: ' + blog.added + ' articles mirrored, ' + blog.kept + ' left untouched'
    + (subjects ? ', ' + subjects + ' subjects created in an empty stand-in' : ''));
  console.log('points: ' + points.rows + ' movements across 5 systems for ' + points.members + ' members');
  console.log('registrations: ' + registrations.registrations + ' register points, ' + registrations.phones + ' phone numbers');
  console.log('member articles: ' + written + ' written by members themselves');
  console.log('threads: ' + threads.replies + ' replies, ' + threads.questions + ' help requests');
  console.log('old logs: ' + old.karaoke + ' karaoke, ' + old.media + ' media, ' + old.prizes
    + ' prizes, ' + old.merged + ' member merged (their history is capped)');

  if (!feedback.threads && !blog.added) {
    console.log('\nnothing to mirror - run `npm run seed` first, then this again.');
  }

  /* Proof that the handle the application will use can read what was written. */
  const seen = await legacy.connection()(legacy.pid('feedback_threads'))
    .count({ c: '*' }).first();
  console.log('through the legacy handle: ' + seen.c + ' threads');

  const published = await articlesRepo.published({ limit: 1 });
  if (published.length) console.log('a published article resolves as /blog/' + published[0].slug);
}

/*
 * Run when invoked, and only then: required, it hands over the one writer the
 * member dashboard's fixtures need, so they can be laid down on a database
 * that is in use without re-running every other mirror under it.
 */
module.exports = { mirrorRegistrations: mirrorRegistrations };

if (require.main === module) main()
  .then(async function () {
    await legacy.disconnect();
    await db.destroy();
  })
  .catch(async function (err) {
    console.error('legacy install failed: ' + err.message);
    try { await legacy.disconnect(); } catch (e) { /* shutting down */ }
    await db.destroy();
    process.exit(1);
  });
