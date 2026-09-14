const repo = require('../repositories/audit.repository');
const table = require('../repositories/table.repository');

/**
 * The audit trail.
 *
 * Every call here is fire-and-forget on purpose: a failure to write the log
 * must never fail the write it was describing.  Losing one audit row is bad;
 * refusing a legitimate repair because the log was busy is worse, and would
 * make the audit trail the least reliable part of the system rather than the
 * most.  Anything that goes wrong is printed, so it is visible rather than
 * silent.
 *
 * Every entry point takes an `actor` - the plain object utils/actor.js builds
 * from a request - rather than the request itself.  That is what lets the
 * nightly warranty sweep, an import or a test write a row without one of them
 * having to fake an express request.
 */

/** Columns nobody needs a history of - they change on every write by design. */
const IGNORED = ['created_at', 'updated_at'];

/** Never copy these into the log, whatever table they turn up on. */
const SECRET = ['password', 'password_hash', 'pay_password_hash', 'token', 'refresh_token', 'license_key'];

const ACTIONS = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  RESTORE: 'restore',
  IMPORT: 'import'
};

/** Dates, numerics and buffers all have to survive JSON.stringify intact. */
function plain(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return '<binary ' + value.length + ' bytes>';
  return value;
}

/** A row reduced to what is worth keeping: no noise, no secrets. */
function clean(row) {
  if (!row || typeof row !== 'object') return null;

  const out = {};
  Object.keys(row).forEach(function (key) {
    if (IGNORED.indexOf(key) >= 0) return;
    if (SECRET.indexOf(key) >= 0) {
      out[key] = '<redacted>';
      return;
    }
    out[key] = plain(row[key]);
  });
  return out;
}

/**
 * Postgres hands numerics back as strings and dates as Date objects, so a
 * value that did not move can still look different between two reads of the
 * same row.  Comparing the printed form is what stops an untouched column
 * being reported as a change.
 */
function same(a, b) {
  if (a === b) return true;
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  return String(a) === String(b);
}

/**
 * The columns that actually moved, with both sides of each.
 *
 * Only what changed is kept: an update that fixes one typo should read as one
 * typo, not as a wall of forty unchanged fields with the answer hidden in it.
 */
function diff(before, after) {
  const from = clean(before) || {};
  const to = clean(after) || {};

  const changed = [];
  const wasValues = {};
  const nowValues = {};

  Object.keys(to).forEach(function (key) {
    if (same(from[key], to[key])) return;
    changed.push(key);
    wasValues[key] = from[key] === undefined ? null : from[key];
    nowValues[key] = to[key];
  });

  return { changed: changed, before: wasValues, after: nowValues };
}

/**
 * Writes one entry.  Callers do not await this - see the note at the top - so
 * the promise is swallowed here rather than left unhandled.
 */
function write(entry) {
  repo.insert(entry)
    .catch(function (err) {
      console.error('[audit] could not record ' + entry.action + ' on ' +
        entry.entity + ' ' + entry.entity_pk + ': ' + err.message);
    });
}

function base(actor, entity, entityPk, action, page) {
  return Object.assign({}, actor || {}, {
    entity: entity,
    entity_pk: entityPk === null || entityPk === undefined ? '' : String(entityPk),
    action: action,
    page_url: page || null
  });
}

/** A new row: the whole thing is the change. */
function created(actor, entity, entityPk, row, page) {
  write(Object.assign(base(actor, entity, entityPk, ACTIONS.CREATE, page), {
    changed: JSON.stringify(Object.keys(clean(row) || {})),
    after_data: JSON.stringify(clean(row))
  }));
}

/**
 * An edit.  Nothing is written when nothing moved - a save that changed no
 * value is not an event, and logging it would bury the ones that are.
 */
function updated(actor, entity, entityPk, before, after, page) {
  const change = diff(before, after);
  if (!change.changed.length) return;

  write(Object.assign(base(actor, entity, entityPk, ACTIONS.UPDATE, page), {
    changed: JSON.stringify(change.changed),
    before_data: JSON.stringify(change.before),
    after_data: JSON.stringify(change.after)
  }));
}

/** A removal, hard or soft: the whole row is kept, because it is what is gone. */
function deleted(actor, entity, entityPk, before, page) {
  write(Object.assign(base(actor, entity, entityPk, ACTIONS.DELETE, page), {
    before_data: JSON.stringify(clean(before))
  }));
}

function restored(actor, entity, entityPk, after, page) {
  write(Object.assign(base(actor, entity, entityPk, ACTIONS.RESTORE, page), {
    after_data: JSON.stringify(clean(after))
  }));
}

/**
 * A spreadsheet import: one entry for the run, not one per row.  A hundred
 * rows arriving together is a single act, and logging it a hundred times
 * would push a day's real edits off the front page of the trail.
 */
function imported(actor, entity, summary, page) {
  write(Object.assign(base(actor, entity, '', ACTIONS.IMPORT, page), {
    after_data: JSON.stringify(summary || {})
  }));
}

/*
 * Wrappers for the three shapes almost every write in this codebase takes.
 *
 * They exist so a service reads the same as it did - one line to insert, one
 * to update - while the read-before-write the trail needs happens in one
 * place rather than being copied, and forgotten, at fifty call sites.
 *
 * The storage underneath is the generic table repository, so these know as
 * little about SQL as anything else in this layer does.
 */

/** insert ... returning('*'), recorded. Returns the inserted rows. */
async function trackInsert(actor, tableName, pk, body, page, trx) {
  const rows = await table.insert(tableName, body, trx);
  if (rows.length) created(actor, tableName, rows[0][pk], rows[0], page);
  return rows;
}

/** update ... returning('*'), recorded against what was there. */
async function trackUpdate(actor, tableName, pk, id, body, page, trx) {
  const previous = await table.findById(tableName, pk, id, trx);
  const rows = await table.update(tableName, pk, id, body, trx);
  if (rows.length) updated(actor, tableName, id, previous, rows[0], page);
  return rows;
}

/**
 * A removal, soft by default.  Returns the number of rows affected, so the
 * caller still decides what a miss means.
 */
async function trackDelete(actor, tableName, pk, id, page, hard, trx) {
  const previous = await table.findById(tableName, pk, id, trx);
  const affected = hard
    ? await table.hardDelete(tableName, pk, id, trx)
    : await table.softDelete(tableName, pk, id, trx);

  if (affected) deleted(actor, tableName, id, previous, page);
  return affected;
}

/** Undo of the above. Returns the restored rows. */
async function trackRestore(actor, tableName, pk, id, page, trx) {
  const rows = await table.restore(tableName, pk, id, trx);
  if (rows.length) restored(actor, tableName, id, rows[0], page);
  return rows;
}

/* ------------------------------------------------------------------ */
/*  reading the trail                                                  */
/* ------------------------------------------------------------------ */

/** How much of one record's history the screen shows at once. */
const HISTORY_LIMIT = 500;

const SORTABLE = ['id', 'created_at', 'entity', 'action', 'manager_name'];
const DEFAULT_SORT = 'created_at';

function search(filters, paging) {
  return repo.search(filters, paging);
}

async function filters() {
  const [entities, admins] = await Promise.all([
    repo.distinctEntities(),
    repo.distinctAdmins()
  ]);
  return { entities: entities, admins: admins };
}

function historyOf(entity, entityPk) {
  return repo.historyOf(entity, entityPk, HISTORY_LIMIT);
}

module.exports = {
  PAGE: '/admin/management/audit',
  SORTABLE: SORTABLE,
  DEFAULT_SORT: DEFAULT_SORT,
  ACTIONS: ACTIONS,

  created: created,
  updated: updated,
  deleted: deleted,
  restored: restored,
  imported: imported,

  trackInsert: trackInsert,
  trackUpdate: trackUpdate,
  trackDelete: trackDelete,
  trackRestore: trackRestore,

  diff: diff,
  clean: clean,
  search: search,
  filters: filters,
  historyOf: historyOf
};
