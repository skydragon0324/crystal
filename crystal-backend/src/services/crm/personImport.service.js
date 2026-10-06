const ExcelJS = require('exceljs');
const crypto = require('crypto');
const intake = require('./registrationIntake.service');

const db = require('../../config/db');
const vocabulary = require('../../repositories/crm/vocabulary.repository');
const duplicates = require('./personDuplicates');
const locations = require('./locations');
const rules = require('./personRules');
const audit = require('../audit.service');
const { transaction } = require('../../repositories/shared/transaction');
const { HttpError } = require('../../utils/response');

/** Excel rows use the shared weighted registration gate. Preview writes nothing;
 * import rechecks under the same lock as project and console registration.
 * Source User IDs are retained as provenance, never used as CRM foreign keys.
 */

const PAGE = '/admin/crm/customers';
const MAX_ROWS = 2000;

/*
 * header -> field. Headers are matched loosely: case, spaces, '*' and '_' ignored.
 * The `location_id` key names the sheet's "Location ID" column (the file format,
 * also the key of template example rows); a row's value is saved as the person's
 * home_location_pk.
 */
const COLUMNS = [
  { key: 'user_id', header: 'User ID', width: 16, note: 'Optional source User ID. This is not a CRM party_pk.',
    aliases: ['userid', 'source user id', 'customer id'] },
  { key: 'full_name', header: 'Full name', required: true, width: 24, aliases: ['name'] },
  { key: 'gender', header: 'Gender', width: 10, note: 'M or F' },
  { key: 'birth_date', header: 'Birthday', width: 14, note: 'YYYY-MM-DD, or a year alone' , aliases: ['birth date', 'date of birth'] },
  { key: 'mobile', header: 'Mobile', required: true, width: 18, aliases: ['phone', 'phone number', 'mobile number'] },
  { key: 'location_id', header: 'Location ID', width: 14, note: 'A number from the ID column of the Locations sheet', aliases: ['location_pk', 'home_location_pk'] },
  { key: 'job_title_id', header: 'Job title ID', width: 14, note: 'A number from the ID column of the Job titles sheet' },
  { key: 'address', header: 'Address', width: 30, aliases: ['address line'] },
  { key: 'email', header: 'Email', width: 26 }
];

function normaliseHeader(text) {
  return String(text === null || text === undefined ? '' : text).toLowerCase().replace(/[\s_*\-]+/g, '');
}

/** What a cell holds, as text (rich text, formulas and hyperlinks flattened). */
function cellText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if (value.richText) return value.richText.map(function (part) { return part.text; }).join('');
    if (value.text !== undefined) return String(value.text);
    if (value.result !== undefined) return cellText(value.result);
  }
  return String(value).trim();
}

/* ------------------------------------------------------------ parsing */

function parseGender(text) {
  const value = text.trim().toUpperCase();
  if (!value) return { value: null };
  if (['M', 'MALE', '男'].indexOf(value) !== -1) return { value: 'M' };
  if (['F', 'FEMALE', '女'].indexOf(value) !== -1) return { value: 'F' };
  return { error: 'Gender must be M or F' };
}

/** A birthday as a date, or a year alone; Excel date cells arrive as Date objects. */
function parseBirthday(raw) {
  if (raw === null || raw === undefined || raw === '') return { value: null };
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return { error: 'Birthday is not a date' };
    return checkedDate(raw.toISOString().slice(0, 10));
  }
  const text = cellText(raw);
  if (/^\d{4}$/.test(text)) {
    const year = Number(text);
    if (year < 1900 || year > new Date().getFullYear()) return { error: 'Birthday year is out of range' };
    return { value: null, year: year };
  }
  const match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!match) return { error: 'Birthday must be YYYY-MM-DD' };
  return checkedDate(match[1] + '-' + match[2].padStart(2, '0') + '-' + match[3].padStart(2, '0'));
}

function checkedDate(iso) {
  const date = new Date(iso + 'T00:00:00Z');
  if (isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return { error: 'Birthday is not a real date' };
  if (iso < '1900-01-01' || date > new Date()) return { error: 'Birthday is out of range' };
  return { value: iso, year: Number(iso.slice(0, 4)) };
}

/* ------------------------------------------------------------ the lists a row is matched against */

/** The job list and the location list, keyed by id, to check each row's ids against. */
async function loadLookups() {
  const [jobs, places] = await Promise.all([
    db('crm_job_title').where('is_active', true).select('job_title_id', 'job_code', 'job_name'),
    locations.all()
  ]);

  const jobById = {};
  jobs.forEach(function (job) { jobById[job.job_title_id] = job; });

  const locationById = {};
  places.forEach(function (place) { locationById[place.location_pk] = place; });

  return { jobById: jobById, locationById: locationById };
}

/**
 * An id cell: a whole number, or nothing. Excel hands a typed number back as
 * a number and a pasted one as text, so both are accepted.
 */
function parseId(rawValue, label) {
  const text = cellText(rawValue);
  if (!text) return { value: null };
  if (!/^\d+$/.test(text)) return { error: label + ' "' + text + '" must be a number from its list' };
  return { value: Number(text) };
}

/* ------------------------------------------------------------ reading the sheet */

async function readRows(buffer) {
  const book = new ExcelJS.Workbook();
  try {
    await book.xlsx.load(buffer);
  } catch (err) {
    throw new HttpError(400, 'crm.thisIsNotAnExcelFile');
  }

  const sheet = book.worksheets[0];
  if (!sheet) throw new HttpError(400, 'crm.theFileHasNoSheet');

  const headerRow = sheet.getRow(1);
  const positions = {};
  headerRow.eachCell(function (cell, position) {
    const header = normaliseHeader(cellText(cell.value));
    COLUMNS.forEach(function (column) {
      const names = [column.header].concat(column.aliases || []).map(normaliseHeader);
      if (names.indexOf(header) !== -1 && positions[column.key] === undefined) positions[column.key] = position;
    });
  });

  const missing = COLUMNS.filter(function (column) { return column.required && positions[column.key] === undefined; });
  if (missing.length) {
    throw new HttpError(400, 'crm.requiredColumnsAreMissing', missing.map(function (column) { return column.header; }));
  }

  const rows = [];
  sheet.eachRow({ includeEmpty: false }, function (row, number) {
    if (number === 1) return;
    const record = { row_number: number, raw: {} };
    COLUMNS.forEach(function (column) {
      const value = positions[column.key] === undefined ? null : row.getCell(positions[column.key]).value;
      record.raw[column.key] = value;
    });
    const blank = COLUMNS.every(function (column) { return cellText(record.raw[column.key]) === ''; });
    if (!blank) rows.push(record);
  });

  if (!rows.length) throw new HttpError(400, 'crm.theFileHasNoRows');
  if (rows.length > MAX_ROWS) throw new HttpError(400, 'crm.tooManyRows', null, { max: MAX_ROWS });
  return rows;
}

/** One row checked: its clean values, or every reason it cannot be loaded. */
function checkRow(record, lookups) {
  const raw = record.raw;
  const errors = [];
  const out = {};

  const userId = cellText(raw.user_id);
  if (userId.length > 128) errors.push('User ID is longer than 128 characters');
  if (userId) out.source_user_id = userId;

  out.full_name = cellText(raw.full_name).replace(/\s+/g, ' ');
  if (!out.full_name) errors.push('Full name is required');
  else if (out.full_name.length > 250) errors.push('Full name is longer than 250 characters');

  const mobileText = cellText(raw.mobile);
  if (!mobileText) errors.push('Mobile is required');
  else if (rules.phoneProblem(mobileText, 'Mobile')) errors.push(rules.phoneProblem(mobileText, 'Mobile'));
  out.mobile = mobileText;

  const gender = parseGender(cellText(raw.gender));
  if (gender.error) errors.push(gender.error); else out.gender_code = gender.value;

  const birthday = parseBirthday(raw.birth_date);
  if (birthday.error) errors.push(birthday.error);
  else { out.birth_date = birthday.value; out.birth_year = birthday.year || null; }

  const locationId = parseId(raw.location_id, 'Location ID');
  if (locationId.error) errors.push(locationId.error);
  else if (locationId.value !== null) {
    const place = lookups.locationById[locationId.value];
    if (!place) errors.push('Location ID ' + locationId.value + ' is not on the location list');
    else { out.home_location_pk = place.location_pk; out.location_label = place.full_name || place.location_name; }
  }

  const jobTitleId = parseId(raw.job_title_id, 'Job title ID');
  if (jobTitleId.error) errors.push(jobTitleId.error);
  else if (jobTitleId.value !== null) {
    const job = lookups.jobById[jobTitleId.value];
    if (!job) errors.push('Job title ID ' + jobTitleId.value + ' is not on the job list');
    else { out.job_title_id = job.job_title_id; out.job_name = job.job_name; }
  }

  out.address_line = cellText(raw.address).slice(0, 255) || null;

  const emailText = cellText(raw.email);
  if (emailText) {
    if (rules.emailProblem(emailText, 'Email')) errors.push(rules.emailProblem(emailText, 'Email'));
    out.email = emailText;
  }

  return { values: out, errors: errors };
}

/* ------------------------------------------------------------ preview and import */

/**
 * Every row with its verdict: NEW, DUPLICATE or ERROR. Writes nothing.
 * `summary` counts each; `rows` keeps the sheet's own row numbers.
 */
async function preview(buffer) {
 const records = await readRows(buffer);
 const lookups = await loadLookups();
 const rows = [];
 for (const record of records) {
  const checked = checkRow(record, lookups);
  const result = { row_number: record.row_number, values: checked.values };
  if (checked.errors.length) { result.status = 'ERROR'; result.errors = checked.errors; }
  else {
   const found = await intake.candidates(db, checked.values);
   rows.filter(r => r.status !== 'ERROR').forEach(other => {
    const match = duplicates.score(checked.values, other.values);
    if (match.score > 40) found.push(Object.assign({ row_number: other.row_number }, match));
   });
   found.sort((a,b) => b.score-a.score);
   result.similar = found;
   const strong = found.filter(r => r.score >= 70);
   result.status = strong.length === 1 && !strong[0].intake_id ? 'DUPLICATE' : found.length ? 'REVIEW' : 'NEW';
   if (found.length && found[0].row_number) result.duplicate_of_row = found[0].row_number;
  }
  rows.push(result);
 }
 const count = status => rows.filter(r => r.status === status).length;
 return { summary: { total: rows.length, new: count('NEW'), duplicate: count('DUPLICATE'), review: count('REVIEW'), error: count('ERROR') }, rows };
}
async function importPeople(buffer, actor) {
 const report = await preview(buffer);
 const failed = report.rows.filter(r => r.status === 'ERROR');
 if (failed.length) throw new HttpError(400, 'crm.fixTheRowsAndUploadAgain', failed);
 const crystal = await vocabulary.idOf('crm_project', 'CRYSTAL');
 const batch = crypto.createHash('sha256').update(buffer).digest('hex');
 await transaction(async trx => {
  await intake.lock(trx);
  for (const row of report.rows) {
   const contacts = [{ contact_type: 'MOBILE', contact_value: row.values.mobile, source_project_id: crystal }];
   if (row.values.email) contacts.push({ contact_type: 'EMAIL', contact_value: row.values.email, source_project_id: crystal });
   const result = await intake.submit(trx, Object.assign({}, row.values, { party_type: 'PERSON', origin_project_id: crystal, contacts }),
    { source_record_id: 'excel:' + batch + ':' + row.row_number });
   row.status = result.outcome === 'QUEUED' ? 'REVIEW' : result.outcome;
   row.party_pk = result.party_pk;
   row.intake_id = result.intake_id;
   if (result.candidates) row.similar = result.candidates;
  }
 });
 const count = status => report.rows.filter(r => r.status === status).length;
 const summary = { total: report.rows.length, created: count('CREATED'), duplicate: count('MERGED'), review: count('REVIEW'), error: 0 };
 audit.imported(actor, 'crm_registration_intake', summary, PAGE);
 return { summary, rows: report.rows };
}

/* ------------------------------------------------------------ the template */

/**
 * THE SHEET THE IMPORT READS BACK, with the job titles and the locations it
 * accepts on sheets of their own - each with its ID, which is what the
 * Customers sheet takes. The location and job columns have dropdowns of those
 * IDs, so a number that is not on a list is caught while typing.
 *
 * `options.examples` are rows to put in; without them the sheet gets two
 * example rows built from the first job titles and locations on the lists.
 */
async function template(options) {
  const templateOptions = options || {};
  const [jobs, places] = await Promise.all([
    db('crm_job_title').where('is_active', true).orderBy(['sort_order', 'job_name']).select('job_title_id', 'job_name'),
    locations.all()
  ]);

  const book = new ExcelJS.Workbook();
  book.creator = 'Crystal CRM';
  book.created = new Date();

  const sheet = book.addWorksheet('Customers');
  sheet.columns = COLUMNS.map(function (column) {
    return { header: column.header + (column.required ? ' *' : ''), key: column.key, width: column.width };
  });
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.getColumn('birth_date').numFmt = 'yyyy-mm-dd';
  COLUMNS.forEach(function (column, position) {
    if (column.note) sheet.getRow(1).getCell(position + 1).note = column.note;
  });

  const firstPlace = places[0] ? places[0].location_pk : null;
  const secondPlace = places[1] ? places[1].location_pk : firstPlace;
  const firstJob = jobs[0] ? jobs[0].job_title_id : null;
  const secondJob = jobs[1] ? jobs[1].job_title_id : firstJob;
  const examples = templateOptions.examples || [
    { user_id: 'U10001', full_name: 'Li Wei', gender: 'M', birth_date: new Date(Date.UTC(1988, 4, 17)), mobile: '+86 138 0013 8000',
      location_id: firstPlace, job_title_id: firstJob, address: '18 Tianhe Road', email: 'li.wei@example.com' },
    { user_id: '', full_name: 'Wang Fang', gender: 'F', birth_date: new Date(Date.UTC(1995, 10, 3)), mobile: '13900139000',
      location_id: secondPlace, job_title_id: secondJob, address: '', email: '' }
  ];
  examples.forEach(function (example) { sheet.addRow(example); });

  const jobSheet = book.addWorksheet('Job titles');
  jobSheet.columns = [
    { header: 'ID', key: 'job_title_id', width: 8 },
    { header: 'Job title', key: 'job_name', width: 28 }
  ];
  jobSheet.getRow(1).font = { bold: true };
  jobs.forEach(function (job) { jobSheet.addRow(job); });

  const locationSheet = book.addWorksheet('Locations');
  locationSheet.columns = [
    { header: 'ID', key: 'location_pk', width: 10 },
    { header: 'Location', key: 'full_name', width: 40 },
    { header: 'Code', key: 'location_code', width: 10 }
  ];
  locationSheet.getRow(1).font = { bold: true };
  places.forEach(function (place) { locationSheet.addRow(place); });

  // Dropdowns on gender, location ID and job title ID, so a value not on a list is caught while typing.
  const lastJobRow = Math.max(2, jobs.length + 1);
  const lastLocationRow = Math.max(2, places.length + 1);
  const columnLetter = function (key) { return sheet.getColumn(key).letter; };
  for (let rowNumber = 2; rowNumber <= 1001; rowNumber += 1) {
    sheet.getCell(columnLetter('gender') + rowNumber).dataValidation = {
      type: 'list', allowBlank: true, formulae: ['"M,F"'],
      showErrorMessage: true, errorTitle: 'Gender', error: 'M or F'
    };
    sheet.getCell(columnLetter('location_id') + rowNumber).dataValidation = {
      type: 'list', allowBlank: true, formulae: ["'Locations'!$A$2:$A$" + lastLocationRow],
      showErrorMessage: true, errorTitle: 'Location ID', error: 'Choose an ID from the Locations sheet'
    };
    sheet.getCell(columnLetter('job_title_id') + rowNumber).dataValidation = {
      type: 'list', allowBlank: true, formulae: ["'Job titles'!$A$2:$A$" + lastJobRow],
      showErrorMessage: true, errorTitle: 'Job title ID', error: 'Choose an ID from the Job titles sheet'
    };
  }

  return book.xlsx.writeBuffer();
}

module.exports = {
  COLUMNS: COLUMNS,
  preview: preview,
  importPeople: importPeople,
  template: template
};
