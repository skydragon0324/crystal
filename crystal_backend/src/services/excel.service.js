const ExcelJS = require('exceljs');
const { HttpError } = require('../utils/response');

/**
 * Spreadsheets, in and out.
 *
 * One column list drives both directions, deliberately: the file a user gets
 * from Export is the file Import expects back, so the round trip is edit the
 * sheet and send it - not export one shape, read the documentation, and hand
 * type another.
 *
 * A column is:
 *
 *   key       the database column
 *   header    what the sheet calls it (matched back on the way in)
 *   width     column width in the exported sheet
 *   type      'text' | 'number' | 'integer' | 'boolean' | 'date'
 *   readOnly  exported for context, ignored on the way in
 *   required  refused on the way in when blank
 *   values    a whitelist; anything else is a per-row error
 *   format    fn(row) -> what to write, for a column the table does not hold
 */

/** The most rows an export will produce, so one click cannot page out a table. */
const EXPORT_LIMIT = 5000;

/** A header, reduced to something two humans would agree is the same word. */
function normalise(text) {
  return String(text === null || text === undefined ? '' : text)
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

/* ------------------------------------------------------------------ */
/*  out                                                                */
/* ------------------------------------------------------------------ */

/**
 * Values are written as their real types rather than as text.
 *
 * A price written as a string is a price Excel will not sum, and a date
 * written as a string is one it will not sort - which is most of the reason
 * somebody asked for a spreadsheet rather than a screenshot.
 */
function cellValue(column, row) {
  const raw = column.format ? column.format(row) : row[column.key];
  if (raw === null || raw === undefined) return null;

  switch (column.type) {
    case 'number':
      return Number(raw);
    case 'integer':
      return Math.round(Number(raw));
    case 'boolean':
      return !!raw;
    case 'date':
      // Date only, no clock: these are business dates, and a time component
      // is what makes the same day read differently in two timezones.
      return String(raw).slice(0, 10);
    default:
      return String(raw);
  }
}

async function toBuffer(columns, rows, sheetName) {
  const book = new ExcelJS.Workbook();
  book.creator = 'Crystal';
  book.created = new Date();

  const sheet = book.addWorksheet(sheetName || 'Export');

  sheet.columns = columns.map(function (column) {
    return {
      header: column.header || column.key,
      key: column.key,
      width: column.width || 18
    };
  });

  rows.forEach(function (row) {
    const record = {};
    columns.forEach(function (column) { record[column.key] = cellValue(column, row); });
    sheet.addRow(record);
  });

  // The header is what an editor reads to know which column is which, so it
  // is made to look like one and stays put while the sheet is scrolled.
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { vertical: 'middle' };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length }
  };

  return book.xlsx.writeBuffer();
}

/* ------------------------------------------------------------------ */
/*  in                                                                 */
/* ------------------------------------------------------------------ */

/** What a cell actually holds, whatever ExcelJS decided to wrap it in. */
function plain(cell) {
  const value = cell === null || cell === undefined ? null : cell;
  if (value === null) return null;

  // A formula cell carries its result beside the formula; a hyperlink and a
  // rich-text run both carry their text under a different key.
  if (typeof value === 'object') {
    if (value instanceof Date) return value;
    if (value.result !== undefined) return value.result;
    if (value.text !== undefined) return value.text;
    if (Array.isArray(value.richText)) {
      return value.richText.map(function (part) { return part.text; }).join('');
    }
    if (value.hyperlink !== undefined) return value.text || value.hyperlink;
    return null;
  }

  return value;
}

/** One cell, cast to what its column says it is. Throws a plain Error. */
function parseCell(column, raw) {
  const value = plain(raw);
  const blank = value === null || value === undefined || String(value).trim() === '';

  if (blank) {
    if (column.required) throw new Error(column.header + ' is required');
    return null;
  }

  switch (column.type) {
    case 'number':
    case 'integer': {
      const number = Number(String(value).replace(/,/g, '').trim());
      if (!isFinite(number)) throw new Error(column.header + ' is not a number');
      return column.type === 'integer' ? Math.round(number) : number;
    }

    case 'boolean': {
      const text = String(value).trim().toLowerCase();
      if (['1', 'true', 'yes', 'y'].indexOf(text) !== -1) return true;
      if (['0', 'false', 'no', 'n'].indexOf(text) !== -1) return false;
      throw new Error(column.header + ' should be yes or no');
    }

    case 'date': {
      const date = value instanceof Date ? value : new Date(String(value).trim());
      if (isNaN(date.getTime())) throw new Error(column.header + ' is not a date');
      return date.toISOString().slice(0, 10);
    }

    default: {
      const text = String(value).trim();
      if (column.values && column.values.indexOf(text) === -1) {
        throw new Error(column.header + ' should be one of ' + column.values.join(', '));
      }
      return text;
    }
  }
}

/**
 * Reads a sheet back into rows, by MATCHING THE HEADER rather than by
 * position.
 *
 * Somebody who exports a sheet, deletes the two columns they do not care
 * about and sends the rest back has done something entirely reasonable, and
 * a positional reader would silently write their names into the price column.
 *
 * Every row is reported, good or bad: the errors come back as a list rather
 * than as the first failure, because "row 14 is wrong" followed by "row 19 is
 * wrong" is two round trips through a file somebody has to open by hand.
 */
async function fromBuffer(buffer, columns) {
  const book = new ExcelJS.Workbook();
  try {
    await book.xlsx.load(buffer);
  } catch (err) {
    throw new HttpError(400, 'excel.thatFileIsNot');
  }

  const sheet = book.worksheets[0];
  if (!sheet || sheet.rowCount < 2) throw new HttpError(400, 'excel.thatSpreadsheetHasNo');

  /* ---- which column of the sheet is which field ---- */
  const byHeader = {};
  columns.forEach(function (column) {
    byHeader[normalise(column.header || column.key)] = column;
    byHeader[normalise(column.key)] = column;
  });

  const position = {};
  sheet.getRow(1).eachCell(function (cell, index) {
    const column = byHeader[normalise(plain(cell.value))];
    if (column && !column.readOnly) position[column.key] = index;
  });

  const mapped = columns.filter(function (c) { return position[c.key] !== undefined; });
  if (!mapped.length) {
    throw new HttpError(400, 'excel.noneOfTheColumns');
  }

  const missing = columns.filter(function (c) {
    return c.required && position[c.key] === undefined;
  });
  if (missing.length) {
    throw new HttpError(400, 'excel.thatSpreadsheetIsMissing', null, {
      columns: missing.map(function (c) { return c.header || c.key; }).join(', ')
    });
  }

  /* ---- the rows ---- */
  const rows = [];
  const errors = [];

  for (let number = 2; number <= sheet.rowCount; number += 1) {
    const sheetRow = sheet.getRow(number);
    const data = {};
    const problems = [];
    let empty = true;

    mapped.forEach(function (column) {
      const raw = sheetRow.getCell(position[column.key]).value;
      if (plain(raw) !== null && String(plain(raw)).trim() !== '') empty = false;

      try {
        data[column.key] = parseCell(column, raw);
      } catch (err) {
        problems.push(err.message);
      }
    });

    // A trailing blank row is what a spreadsheet looks like after somebody
    // deletes the last entry, not something to complain about.
    if (empty) continue;

    if (problems.length) errors.push({ row: number, message: problems.join('; ') });
    else rows.push({ row: number, data: data });
  }

  return { rows: rows, errors: errors };
}

module.exports = {
  EXPORT_LIMIT: EXPORT_LIMIT,
  toBuffer: toBuffer,
  fromBuffer: fromBuffer
};
