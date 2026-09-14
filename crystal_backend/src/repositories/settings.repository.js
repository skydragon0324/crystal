const db = require('../config/db');

const TABLE = 'system_settings';

function all() {
  return db(TABLE).orderBy([{ column: 'category' }, { column: 'sort_order' }, { column: 'id' }]).select('*');
}

function findByKey(key, trx) {
  return (trx || db)(TABLE).where('setting_key', key).first();
}

function upsert(key, value, trx) {
  return (trx || db)(TABLE)
    .where('setting_key', key)
    .update({ setting_val: value, updated_at: db.fn.now() })
    .returning('*');
}

module.exports = { TABLE: TABLE, all: all, findByKey: findByKey, upsert: upsert };
