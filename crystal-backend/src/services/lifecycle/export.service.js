'use strict';

const excel = require('../excel.service');
const config = require('../../config');
const reports = require('./reports.service');

/**
 * THE THREE REPORTS, AS A SPREADSHEET.
 *
 * Requirement 11 asks for large exports to be permissioned and bounded or
 * streamed; requirement 12 asks for the numeric table under the chart to be
 * downloadable where the repository already has a pattern for it. It does -
 * services/excel.service.js drives every other export in this console - so
 * these produce the same .xlsx with the same frozen, filtered header rather
 * than a second file format with its own quirks.
 *
 * BOUNDED BY PAGING THROUGH THE API'S OWN QUERY.
 *
 * The transition and customer sheets are built by asking reports.service for
 * page after page of exactly the rows the screen is showing, until the export
 * ceiling. Two things fall out of that and both are the point:
 *
 *   The export cannot disagree with the screen. It is the same SQL, the same
 *   filters and the same ordering - not a second query that has to be kept in
 *   step with the first.
 *
 *   Nothing unbounded is ever held. The page size is the API's own cap, so
 *   neither the database nor this process is ever asked for more rows at once
 *   than an ordinary request already asks for, and the total is capped by
 *   excel.EXPORT_LIMIT.
 *
 * A TRUNCATED EXPORT SAYS SO. Reaching the ceiling is reported back to the
 * caller, which puts it in the response header and the audit entry - an
 * export that quietly stopped at five thousand of forty thousand rows is a
 * spreadsheet somebody will total up and believe.
 *
 * WHAT IS IN THE SHEETS. The same columns as the screen, birthday included -
 * requirement 12.B lists it among the detail columns and makes it permission
 * controlled, and the page grant is that control. Nothing here carries a
 * password, a citizen id or a handset identifier; none of them is copied into
 * the analytics store at all. These exports are audited BECAUSE of the
 * columns they do carry - requirement 13.
 */

/** Rows per underlying request: the API's own page cap, not a new number. */
const PAGE_SIZE = 200;

/* ------------------------------------------------------------------ */
/*  columns                                                            */
/* ------------------------------------------------------------------ */

const TRANSITION_COLUMNS = [
  { key: 'transitionedAt', header: 'When', width: 22, type: 'text' },
  { key: 'userId', header: 'Login name', width: 18 },
  { key: 'userName', header: 'Customer', width: 20 },
  { key: 'birthday', header: 'Birthday', width: 12, type: 'date' },
  { key: 'displayPhone', header: 'Phone', width: 16 },
  { key: 'jobCode', header: 'Job', width: 12 },
  { key: 'fromStatus', header: 'Previous status', width: 15 },
  { key: 'toStatus', header: 'New status', width: 14 },
  { key: 'reason', header: 'Why', width: 18 },
  { key: 'currentStatus', header: 'Status now', width: 14 },
  { key: 'lastLoginAt', header: 'Last login', width: 22, type: 'text' },
  { key: 'oracleAccountStatus', header: 'Platform account flag', width: 20 },
  { key: 'userPk', header: 'Customer key', width: 14, type: 'integer' }
];

const CUSTOMER_COLUMNS = [
  { key: 'userId', header: 'Login name', width: 18 },
  { key: 'userName', header: 'Customer', width: 20 },
  { key: 'birthday', header: 'Birthday', width: 12, type: 'date' },
  { key: 'displayPhone', header: 'Phone', width: 16 },
  { key: 'jobCode', header: 'Job', width: 12 },
  { key: 'statusAsOf', header: 'Status', width: 14 },
  { key: 'statusSince', header: 'In that status since', width: 22, type: 'text' },
  { key: 'reason', header: 'Why', width: 18 },
  { key: 'currentStatus', header: 'Status now', width: 14 },
  { key: 'lastLoginAt', header: 'Last login', width: 22, type: 'text' },
  { key: 'registeredAt', header: 'Registered', width: 22, type: 'text' },
  { key: 'userPk', header: 'Customer key', width: 14, type: 'integer' }
];

/*
 * THE STOCK SHEET NAMES ITS OWN MEANING.
 *
 * "Measured at end of" rather than "Date", and the sheet is called stock at
 * the end of the bucket, because the one thing a reader must not do with
 * these columns is select them and press sum - requirement 5. The flow column
 * is the only one that may be added up and is the only one labelled flow.
 */
const TREND_COLUMNS = [
  { key: 'periodStart', header: 'Period start', width: 14, type: 'date' },
  { key: 'periodEnd', header: 'Period end', width: 14, type: 'date' },
  { key: 'snapshotDate', header: 'Measured at end of', width: 20, type: 'date' },
  { key: 'new', header: 'New', width: 10, type: 'integer' },
  { key: 'active', header: 'Active', width: 10, type: 'integer' },
  { key: 'dormant', header: 'Dormant', width: 10, type: 'integer' },
  { key: 'churned', header: 'Churned', width: 10, type: 'integer' },
  { key: 'total', header: 'Total', width: 10, type: 'integer' },
  { key: 'registeredInBucket', header: 'Registered in period (flow)', width: 26, type: 'integer' }
];

/* ------------------------------------------------------------------ */
/*  building                                                           */
/* ------------------------------------------------------------------ */

/** An instant as text, in the report timezone, so a cell cannot shift a day. */
function instant(value) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return null;

  /*
   * Written as text rather than as an Excel date: a spreadsheet date carries
   * no zone, so a timestamp handed over as one is re-read in whatever zone the
   * reader's machine is in and silently moves. The report timezone is named in
   * the filename and the audit entry; the cell holds the instant it means.
   */
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: config.lifecycle.reportTimezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  }).formatToParts(date);

  const take = function (type) {
    const found = parts.filter(function (part) { return part.type === type; })[0];
    return found ? found.value : '';
  };

  return take('year') + '-' + take('month') + '-' + take('day')
    + ' ' + take('hour') + ':' + take('minute') + ':' + take('second');
}

/**
 * Pages through one of the paginated reports up to the export ceiling.
 *
 * `fetch(page, pageSize)` is the report function itself, so this knows
 * nothing about what is being exported.
 */
async function collect(fetch) {
  const rows = [];
  let total = 0;

  for (let page = 1; rows.length < excel.EXPORT_LIMIT; page += 1) {
    const result = await fetch(page, PAGE_SIZE);
    total = result.total;

    if (!result.rows.length) break;
    result.rows.forEach(function (row) { rows.push(row); });

    if (rows.length >= total) break;
  }

  return {
    rows: rows.slice(0, excel.EXPORT_LIMIT),
    total: total,
    truncated: total > excel.EXPORT_LIMIT
  };
}

/** The transition detail list, with the filters the screen is using. */
async function transitions(filters) {
  const collected = await collect(function (page, pageSize) {
    return reports.transitions(Object.assign({}, filters, { page: page, pageSize: pageSize }));
  });

  return {
    columns: TRANSITION_COLUMNS,
    sheetName: 'Transitions',
    filename: 'lifecycle-transitions',
    entity: 'lifecycle_export_transitions',
    total: collected.total,
    truncated: collected.truncated,
    rows: collected.rows.map(function (row) {
      return Object.assign({}, row, {
        transitionedAt: instant(row.transitionedAt),
        lastLoginAt: instant(row.lastLoginAt)
      });
    })
  };
}

/** Who was in a status at the end of a day. */
async function customers(filters) {
  const collected = await collect(function (page, pageSize) {
    return reports.customersInStatus(
      Object.assign({}, filters, { page: page, pageSize: pageSize })
    );
  });

  return {
    columns: CUSTOMER_COLUMNS,
    sheetName: 'Customers',
    filename: 'lifecycle-customers',
    entity: 'lifecycle_export_customers',
    total: collected.total,
    truncated: collected.truncated,
    rows: collected.rows.map(function (row) {
      return Object.assign({}, row, {
        statusSince: instant(row.statusSince),
        lastLoginAt: instant(row.lastLoginAt),
        registeredAt: instant(row.registeredAt)
      });
    })
  };
}

/**
 * The numeric table under the chart.
 *
 * Not paged: a bucket series is already bounded by the controller's range cap
 * - at worst one row per day of the longest window it allows - so this is the
 * one export that is simply the report.
 */
async function trend(filters) {
  const report = await reports.trend(filters);

  return {
    columns: TREND_COLUMNS,
    sheetName: 'Stock at end of bucket',
    filename: 'lifecycle-stock',
    entity: 'lifecycle_export_stock',
    total: report.buckets.length,
    truncated: false,
    rows: report.buckets
  };
}

/** The workbook itself, and the name it is downloaded under. */
async function workbook(sheet) {
  const buffer = await excel.toBuffer(sheet.columns, sheet.rows, sheet.sheetName);

  return {
    buffer: Buffer.from(buffer),
    filename: sheet.filename + '-' + new Date().toISOString().slice(0, 10) + '.xlsx',
    rows: sheet.rows.length,
    total: sheet.total,
    truncated: sheet.truncated
  };
}

module.exports = {
  PAGE_SIZE: PAGE_SIZE,
  LIMIT: excel.EXPORT_LIMIT,

  transitions: transitions,
  customers: customers,
  trend: trend,
  workbook: workbook,

  /* exported for the check script */
  instant: instant
};
