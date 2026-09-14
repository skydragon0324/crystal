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

  /* Re-runnable: everything below owns an id at or above OLD_BASE. */
  await db('ora_license.keygen_karaoke_error').where('lic_id', 'like', 'KOLD%').del();
  await db('ora_license.keygen_karaoke_log').where('id', 'like', 'KOLD%').del();
  await db('ora_media.media_license_log').where('id', 'like', 'MOLD%').del();
  await db('ora_media.media_score').where('userid', 'in', members.map(function (m) { return m.pvendor_id; })).del();
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
    { id: 1, short_name: 'MRS', name: 'Mansudae Radio Service' },
    { id: 2, short_name: 'KCT', name: 'Korea Central TV' },
    { id: 3, short_name: 'RGN', name: 'Ryugyong Network' }
  ];
  await insertMissing('ora_media.media_provider', 'id', providers);

  members.forEach(function (member, m) {
    const login = member.pvendor_id;

    for (let i = 0; i < 9; i += 1) {
      const id = 'KOLD' + m + '-' + i;

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
        bonus_score: 4 + i,
        is_agent: agency ? 1 : 0,
        resultlog: failed ? 3 : 0,
        /* SPREAD ACROSS THE MERGE INSTANT, which is forty days back. A
           merged member sees the older half and nothing newer; an unmerged
           one sees all nine. Bunched on one side of it, the cap either
           hides everything or hides nothing, and neither shows it works. */
        created_at: daysAgo((i * 12) + m + 5)
      });

      if (reversed) errors.push({ lic_id: id, error_status: 2 });
      /* A note that is NOT a reversal, so the OR NULL branch is not the only
         one that ever lets a row through. */
      if (i === 4) errors.push({ lic_id: id, error_status: 1 });
    }

    for (let i = 0; i < 7; i += 1) {
      media.push({
        id: 'MOLD' + m + '-' + i,
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
        prize_val: 50 + (i * 25),
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

  await db('ora_license.keygen_karaoke_log').insert(karaoke);
  if (errors.length) await db('ora_license.keygen_karaoke_error').insert(errors);
  await db('ora_media.media_license_log').insert(media);
  await db('ora_media.media_score').insert(scores);
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
  const blog = await mirrorBlog();
  const points = await mirrorPoints();
  const written = await mirrorMemberArticles();
  const old = await mirrorOldLogs();

  console.log('feedback: ' + feedback.threads + ' threads, ' + feedback.messages + ' messages');
  console.log('blog: ' + blog.added + ' articles mirrored, ' + blog.kept + ' left untouched');
  console.log('points: ' + points.rows + ' movements across 5 systems for ' + points.members + ' members');
  console.log('member articles: ' + written + ' written by members themselves');
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

main()
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
