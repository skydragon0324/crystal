const excel = require('../services/excel.service');
const table = require('../repositories/table.repository');
const audit = require('../services/audit.service');
const { transaction } = require('../repositories/shared/transaction');
const { createSignedRows } = require('../security/signedRows');
const { ok, HttpError } = require('../utils/response');
const { flag } = require('../utils/query');

/**
 * Export and import, for any resource that can describe its columns.
 *
 *   table     the table rows are written back to
 *   pk        its primary key
 *   page      the permission page, for the audit entry
 *   columns   the shared column list - see services/excel.service.js
 *   matchOn   the column an incoming row is matched on, defaulting to the pk.
 *             A natural key is usually the better answer: somebody who
 *             deleted the id column from the sheet still means the same
 *             products, and matching on the model code finds them.
 *   list      fn(filters, paging) -> { rows } - the same read the screen does
 *   filters   fn(req) -> the filter object, when the resource takes more than
 *             ?q= and ?deleted=
 *   readOnly  export only.  Some tables are records of what happened - an
 *             audit trail, a repair, a wallet - and a spreadsheet is not a
 *             legitimate way to rewrite one.
 *   signed    { type, content } - the rows are SIGNED content (security/).
 *             Every row the import creates, updates or brings back is signed
 *             inside the import's own transaction, and a row that no longer
 *             matches its stored signature is a failure on its line rather
 *             than something a spreadsheet quietly re-signs. A spreadsheet is
 *             the widest write path in the console; it is not a way round the
 *             rule the single-row save keeps.
 */

/**
 * What went wrong with one row, in words.
 *
 * A constraint violation arrives carrying the whole INSERT statement, and
 * handing that to somebody who edited a spreadsheet tells them nothing they
 * can act on - they did not write the SQL and cannot read it.  The three
 * failures a sheet actually causes are a missing value, a duplicate and a
 * reference to something that is not there, and all three name their column,
 * so all three can be said plainly.
 */
function describe(err, columns) {
  const named = function (column) {
    const found = columns.filter(function (c) { return c.key === column; })[0];
    return (found && found.header) || column;
  };

  switch (err.code) {
    case '23502':   // not_null_violation
      return named(err.column) + ' is required';
    case '23505':   // unique_violation
      return 'another row already uses that ' +
        (err.detail && /\(([^)]+)\)/.exec(err.detail)
          ? named(/\(([^)]+)\)/.exec(err.detail)[1])
          : 'value');
    case '23503':   // foreign_key_violation
      return 'that row points at something that does not exist';
    case '22P02':   // invalid_text_representation
    case '22003':   // numeric_value_out_of_range
      return 'a value on that row is the wrong shape for its column';
    default:
      // Anything unrecognised still says something, but not the statement.
      return err.message.split(' - ').pop().split('\n')[0];
  }
}

/** The factory itself - see the note at the top of this file for the options. */
module.exports = function createExcelController(cfg) {
  const columns = cfg.columns;
  const pk = cfg.pk || 'id';
  const matchOn = cfg.matchOn || pk;
  const signed = cfg.signed ? createSignedRows(Object.assign({ pk: pk }, cfg.signed)) : null;

  /*
   * Columns the table does not hold, written by their own `store` after the
   * row - see excel.service.js. Only the ones the sheet actually carried:
   * a column left out of the file is "no opinion", not "empty".
   */
  const stored = columns.filter(function (column) { return typeof column.store === 'function'; });

  function filtersOf(req) {
    if (cfg.filters) return cfg.filters(req);
    return { q: req.query.q, deleted: flag(req.query.deleted) };
  }

  /**
   * The export matches WHAT IS ON SCREEN, filters and all.
   *
   * An export that ignored the filters would answer a different question from
   * the one the user had just asked, and they would have no way of telling
   * except by counting the rows.
   */
  async function exportRows(req, res) {
    const result = await cfg.list(filtersOf(req), {
      limit: excel.EXPORT_LIMIT,
      offset: 0,
      page: 1,
      sort: cfg.defaultSort || pk,
      dir: 'asc'
    });

    const rows = result.rows || result;
    const buffer = await excel.toBuffer(columns, rows, cfg.sheetName || cfg.table);

    const name = (cfg.filename || cfg.table) + '-' + new Date().toISOString().slice(0, 10) + '.xlsx';

    res.setHeader('Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="' + name + '"');
    // The browser reads the count off the header rather than the sheet, so a
    // truncated export can say so without opening the file.
    res.setHeader('X-Total-Rows', String(rows.length));

    return res.send(Buffer.from(buffer));
  }

  /**
   * The import is ALL OR NOTHING.
   *
   * A spreadsheet is one act - somebody edited a file and sent it - and half
   * of one applied is a table nobody can reason about: the rows that landed
   * are not marked, so the only way back is to work out which of two hundred
   * lines took and undo them by hand.  Every bad row is reported together,
   * for the same reason: fixing them one round trip at a time is how a
   * twenty-minute job becomes an afternoon.
   */
  async function importRows(req, res) {
    if (cfg.readOnly) throw new HttpError(400, 'excel.thisResourceCannotBe');
    if (!req.file || !req.file.buffer) throw new HttpError(400, 'excel.noSpreadsheetWasUploaded');

    const parsed = await excel.fromBuffer(req.file.buffer, columns);

    if (parsed.errors.length) {
      throw new HttpError(400, 'excel.theSpreadsheetCouldNot', parsed.errors);
    }
    if (!parsed.rows.length) throw new HttpError(400, 'excel.thatSpreadsheetHasNo');

    const summary = await transaction(async function (trx) {
      let created = 0;
      let updated = 0;
      let restored = 0;
      const failures = [];

      for (let i = 0; i < parsed.rows.length; i += 1) {
        const entry = parsed.rows[i];
        const data = Object.assign({}, entry.data);
        const key = data[matchOn];

        const extra = {};
        stored.forEach(function (column) {
          if (Object.prototype.hasOwnProperty.call(data, column.key)) {
            extra[column.key] = data[column.key];
            delete data[column.key];
          }
        });

        // The matching column identifies the row; it is not something the
        // import gets to rewrite, and the primary key never is.
        delete data[pk];

        if (!Object.keys(data).length && !Object.keys(extra).length) {
          failures.push({ row: entry.row, message: 'excel.nothingToWriteOn' });
          continue;
        }

        try {
          const existing = key === null || key === undefined || key === ''
            ? null
            // eslint-disable-next-line no-await-in-loop
            : await trx(cfg.table).where(matchOn, key).first();

          /*
           * A blank cell means two different things, and which one depends on
           * whether the row already exists.
           *
           * On a row that is already there it is an INSTRUCTION - the editor
           * cleared the field and means it emptied.  On a row being brought
           * into existence it is an ABSENCE - the sheet has no opinion about
           * that column - so it is left out entirely and the table's own
           * default applies.  Writing an explicit NULL in the second case is
           * how a blank "Order" column became a not-null violation on a
           * column that has DEFAULT 0.
           */
          const withoutBlanks = function () {
            const out = {};
            Object.keys(data).forEach(function (column) {
              if (data[column] !== null) out[column] = data[column];
            });
            if (matchOn !== pk) out[matchOn] = key;
            return out;
          };

          /* A signed row that no longer matches its signature fails its line; the check only reads. */
          if (existing && signed) {
            // eslint-disable-next-line no-await-in-loop
            await signed.assertUntampered(existing, trx);
          }

          let written;

          if (existing && existing.is_deleted) {
            /*
             * The match is in the recycle bin.
             *
             * Inserting alongside it would collide with the unique key that
             * found it, and updating it in place would write the editor's row
             * into a record that stays invisible - so it comes BACK.  A sheet
             * that carries the row is a sheet that says the row exists, and
             * the natural key is what says it is the same one.
             */
            // eslint-disable-next-line no-await-in-loop
            written = await table.update(cfg.table, pk, existing[pk],
              Object.assign(withoutBlanks(), { is_deleted: false }), trx);
            restored += 1;
          } else if (existing) {
            // eslint-disable-next-line no-await-in-loop
            written = Object.keys(data).length
              ? await table.update(cfg.table, pk, existing[pk], data, trx)
              : [existing];
            updated += 1;
          } else {
            // eslint-disable-next-line no-await-in-loop
            written = await table.insert(cfg.table, withoutBlanks(), trx);
            created += 1;
          }

          for (let c = 0; c < stored.length; c += 1) {
            const column = stored[c];
            if (written && written[0] && Object.prototype.hasOwnProperty.call(extra, column.key)) {
              // eslint-disable-next-line no-await-in-loop
              await column.store(written[0], extra[column.key], trx);
            }
          }

          // eslint-disable-next-line no-await-in-loop
          if (signed && written && written[0]) await signed.sign(written[0], trx);
        } catch (err) {
          // A constraint the sheet could not know about - a duplicate slug, a
          // foreign key naming a row that is not there - reads as this row's
          // problem rather than as a five hundred. So does a signed row that
          // no longer matches its signature.
          failures.push({
            row: entry.row,
            message: err instanceof HttpError ? err.message : describe(err, columns)
          });
        }
      }

      if (failures.length) throw new HttpError(400, 'excel.theSpreadsheetCouldNot', failures);
      return { created: created, updated: updated, restored: restored };
    });

    audit.imported(req.actor, cfg.table, summary, cfg.page);
    return ok(res, summary, 'excel.imported');
  }

  return { exportRows: exportRows, importRows: importRows };
};
