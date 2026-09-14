/** Parse ?page=&limit=&sort=&dir= into safe values. */
function readPaging(query, allowedSort, fallbackSort) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 20));
  let sort = fallbackSort;
  if (query.sort && allowedSort.indexOf(query.sort) !== -1) sort = query.sort;
  const dir = String(query.dir).toLowerCase() === 'desc' ? 'desc' : 'asc';
  return { page: page, limit: limit, offset: (page - 1) * limit, sort: sort, dir: dir };
}

/**
 * Apply an ILIKE search over several columns.
 *
 * The column list is a constant in the repository, never anything off the
 * query string - it is interpolated into the SQL, and the only reason that is
 * safe is that no request can influence it.  The term itself is bound.
 */
function applySearch(qb, columns, term) {
  if (!term || !columns.length) return qb;
  const like = '%' + term + '%';
  return qb.where(function () {
    const self = this;
    columns.forEach(function (col, i) {
      const method = i === 0 ? 'whereRaw' : 'orWhereRaw';
      self[method]('CAST(' + col + ' AS TEXT) ILIKE ?', [like]);
    });
  });
}

/**
 * Keep only the whitelisted keys, dropping undefined.
 *
 * An empty string becomes NULL: a form clearing a field sends '', and storing
 * that in a date or a numeric column is an error rather than a blank.
 */
function pick(body, columns) {
  const out = {};
  columns.forEach(function (c) {
    if (body[c] !== undefined) out[c] = body[c] === '' ? null : body[c];
  });
  return out;
}

/**
 * Rounds the named keys of a body to whole numbers, in place.
 *
 * Quantities are integers in the database, and Postgres refuses '3.5' for an
 * integer column outright - so without this a decimal arriving from an older
 * client, a spreadsheet or a hand made request is a 500 rather than the 400
 * it meant.  An absent key is left absent: a PATCH-shaped update must not
 * acquire a column it did not mention.
 */
function roundWhole(body, columns) {
  columns.forEach(function (c) {
    if (body[c] === undefined || body[c] === null || body[c] === '') return;
    const n = Number(body[c]);
    body[c] = isFinite(n) ? Math.round(n) : body[c];
  });
  return body;
}

/** Money, to the cent - see the note in services/repairTickets.service.js. */
function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/** '1' | 'true' | 1 -> true.  Everything else, including undefined, is false. */
function flag(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

module.exports = {
  readPaging: readPaging,
  applySearch: applySearch,
  pick: pick,
  roundWhole: roundWhole,
  money: money,
  flag: flag
};
