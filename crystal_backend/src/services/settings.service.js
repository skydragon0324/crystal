const repo = require('../repositories/settings.repository');
const { HttpError } = require('../utils/response');
const audit = require('./audit.service');

const PAGE = '/admin/base/settings';

/**
 * Values that change what the platform does without a release: how long a
 * device has to come back before it counts as a repeat, what a registration
 * awards, how many days before expiry a warranty starts being called
 * "expiring".
 *
 * Cached, because they are read on nearly every write path and changed about
 * once a quarter.  Thirty seconds of staleness after somebody edits one is
 * not a problem worth a round trip per ticket; the cache is dropped on write
 * so the person who made the change sees it immediately anyway.
 */

const TTL = 30 * 1000;
let cache = { at: 0, map: null };

async function map() {
  if (cache.map && Date.now() - cache.at < TTL) return cache.map;

  const rows = await repo.all();
  const out = {};
  rows.forEach(function (row) { out[row.setting_key] = row; });
  cache = { at: Date.now(), map: out };
  return out;
}

function clearCache() { cache = { at: 0, map: null }; }

/**
 * A setting, cast to what value_type says it is.
 *
 * The fallback is not a convenience: a setting nobody has inserted yet has to
 * behave like its default rather than like NaN, so that adding a knob to the
 * code and adding its row to the database can be two separate deployments.
 */
async function value(key, fallback) {
  const rows = await map();
  const row = rows[key];
  if (!row || row.setting_val === null || row.setting_val === '') return fallback;

  switch (row.value_type) {
    case 'number': {
      const n = Number(row.setting_val);
      return isFinite(n) ? n : fallback;
    }
    case 'boolean':
      return row.setting_val === 'true' || row.setting_val === '1';
    case 'json':
      try {
        return JSON.parse(row.setting_val);
      } catch (err) {
        return fallback;
      }
    default:
      return row.setting_val;
  }
}

function number(key, fallback) {
  return value(key, fallback).then(function (v) {
    const n = Number(v);
    return isFinite(n) ? n : fallback;
  });
}

function all() {
  return repo.all();
}

async function set(key, val, actor) {
  const previous = await repo.findByKey(key);
  if (!previous) throw new HttpError(404, 'common.notFound');

  const rows = await repo.upsert(key, val === null || val === undefined ? null : String(val));
  clearCache();

  audit.updated(actor, repo.TABLE, previous.id, previous, rows[0], PAGE);
  return rows[0];
}

/** Saves a whole form. One audit entry per key that actually moved. */
async function setMany(entries, actor) {
  const keys = Object.keys(entries || {});
  if (!keys.length) throw new HttpError(400, 'common.nothingToUpdate');

  const saved = [];
  for (let i = 0; i < keys.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    saved.push(await set(keys[i], entries[keys[i]], actor));
  }
  return saved;
}

module.exports = {
  PAGE: PAGE,
  value: value,
  number: number,
  all: all,
  set: set,
  setMany: setMany,
  clearCache: clearCache
};
