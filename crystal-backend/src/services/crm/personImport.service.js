const ExcelJS = require('exceljs');
const crypto = require('crypto');
const intake = require('./registrationIntake.service');

const db = require('../../config/db');
const identityProjects = require('./identityProjects');
const duplicates = require('./personDuplicates');
const locations = require('./locations');
const rules = require('./personRules');
const audit = require('../audit.service');
const { transaction } = require('../../repositories/shared/transaction');
const { HttpError } = require('../../utils/response');

/** Excel rows use the shared weighted registration gate. Preview writes nothing;
 * import rechecks under the same lock as project and console registration.
 *
 * Phase 1 loads only complete people who already have an e-shop account and
 * a user-management account (the projects given the E-shop and User management
 * roles in Settings > Projects). The sheet's e-shop PK/ID and user
 * PK/ID are not trusted enough for crm_project_account: they are kept with
 * the registration and, once the person is resolved, staged as identifier
 * assignments an administrator verifies or rejects.
 *
 * A row that fails the file check does not stop the others: valid rows are
 * imported and failed rows are kept in crm_person_import_error with their
 * reasons. Nothing is written until the import itself is run.
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
  { key: 'eshop_pk', header: 'E-shop PK', required: true, width: 14, note: 'The customer\'s user_pk in the e-shop (a number). Kept as an unverified identifier.',
    aliases: ['eshop pk', 'eshop user pk'] },
  { key: 'eshop_id', header: 'E-shop ID', required: true, width: 18, note: 'The customer\'s login (user ID) in the e-shop. Kept as an unverified identifier.',
    aliases: ['eshop id', 'eshop login', 'eshop user id'] },
  { key: 'user_pk', header: 'User PK', required: true, width: 14, note: 'The customer\'s user_pk in the user management system (a number). Kept as an unverified identifier.',
    aliases: ['user_pk', 'platform pk', 'platform user pk'] },
  { key: 'user_id', header: 'User ID', required: true, width: 18, note: 'The customer\'s user_id (login) in the user management system. Kept as an unverified identifier.',
    aliases: ['user_id', 'platform id', 'platform user id', 'platform login'] },
  { key: 'full_name', header: 'Full name', required: true, width: 24, aliases: ['name'] },
  { key: 'gender', header: 'Gender', required: true, width: 10, note: 'M or F' },
  { key: 'birth_date', header: 'Birthday', required: true, width: 14, note: 'YYYY-MM-DD', aliases: ['birth date', 'date of birth'] },
  { key: 'mobile', header: 'Mobile', required: true, width: 18, aliases: ['phone', 'phone number', 'mobile number'] },
  { key: 'location_id', header: 'Location ID', required: true, width: 14, note: 'A number from the ID column of the Locations sheet', aliases: ['location_pk', 'home_location_pk'] },
  { key: 'address', header: 'Address', required: true, width: 30, aliases: ['address line', 'home address'] },
  { key: 'job_title_id', header: 'Job title ID', width: 14, note: 'Optional. A number from the ID column of the Job titles sheet' },
  { key: 'origin_project', header: 'Origin project', width: 16,
    note: 'Optional. The project the customer came from: a code or ID from the Projects sheet. Empty rows use the project chosen on the import screen.',
    aliases: ['origin project id', 'origin project code', 'origin_project_id', 'project'] }
];
const ESHOP_ID_MAX = 100;

/*
 * A sheet lists one row per phone number, so the same person can appear on
 * several rows with different phones. For an Excel import the same user_pk
 * (the user-management account) is the same person: the rows are merged
 * automatically, every phone is kept on the one customer, and the account is
 * not staged twice.
 */
const EXCEL_SCORING = { userPkMerges: true };

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

/**
 * The job, location and project lists, keyed, to check each row against.
 * `originProjectId` is the project chosen on the import screen: the origin of
 * every row whose Origin project cell is empty. Nothing is assumed when it is
 * not chosen - such rows are errors.
 */
async function loadLookups(originProjectId) {
  const [jobs, places, projects] = await Promise.all([
    db('crm_job_title').where('is_active', true).select('job_title_id', 'job_code', 'job_name'),
    locations.all(),
    db('crm_project').where('status', 'ACTIVE').select('project_id', 'project_code', 'project_name')
  ]);

  const jobById = {};
  jobs.forEach(function (job) { jobById[job.job_title_id] = job; });

  const locationById = {};
  places.forEach(function (place) { locationById[place.location_pk] = place; });

  // A project is named in a cell by its ID or its code, in any case.
  const projectByKey = {};
  projects.forEach(function (project) {
    projectByKey[String(project.project_id)] = project;
    projectByKey[String(project.project_code).toUpperCase()] = project;
  });

  let defaultProject = null;
  if (originProjectId !== undefined && originProjectId !== null && originProjectId !== '') {
    defaultProject = projectByKey[String(originProjectId)];
    if (!defaultProject || String(defaultProject.project_id) !== String(originProjectId)) throw new HttpError(400, 'crm.customerImport.chooseAnActiveOriginProject');
  }

  return { jobById: jobById, locationById: locationById, projectByKey: projectByKey, defaultProject: defaultProject };
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
    throw new HttpError(400, 'crm.common.thisIsNotAnExcelFile');
  }

  const sheet = book.worksheets[0];
  if (!sheet) throw new HttpError(400, 'crm.customerImport.theFileHasNoSheet');

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
    throw new HttpError(400, 'crm.customerImport.requiredColumnsAreMissing', missing.map(function (column) { return column.header; }));
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

  if (!rows.length) throw new HttpError(400, 'crm.customerImport.theFileHasNoRows');
  if (rows.length > MAX_ROWS) throw new HttpError(400, 'crm.customerImport.tooManyRows', null, { max: MAX_ROWS });
  return rows;
}

/** One row checked: its clean values, or every reason it cannot be loaded. */
function checkRow(record, lookups) {
  const raw = record.raw;
  const errors = [];
  const out = {};

  const eshopPk = cellText(raw.eshop_pk);
  if (!eshopPk) errors.push('E-shop PK is required');
  else if (!/^[1-9][0-9]{0,17}$/.test(eshopPk)) errors.push('E-shop PK "' + eshopPk + '" must be a whole number');
  else out.eshop_pk = eshopPk;

  const eshopId = cellText(raw.eshop_id);
  if (!eshopId) errors.push('E-shop ID is required');
  else if (eshopId.length > ESHOP_ID_MAX) errors.push('E-shop ID is longer than ' + ESHOP_ID_MAX + ' characters');
  else out.eshop_id = eshopId;

  const userPk = cellText(raw.user_pk);
  if (!userPk) errors.push('User PK is required');
  else if (!/^[1-9][0-9]{0,17}$/.test(userPk)) errors.push('User PK "' + userPk + '" must be a whole number');
  else out.user_pk = userPk;

  const userId = cellText(raw.user_id);
  if (!userId) errors.push('User ID is required');
  else if (userId.length > ESHOP_ID_MAX) errors.push('User ID is longer than ' + ESHOP_ID_MAX + ' characters');
  else out.user_id = userId;

  out.full_name = cellText(raw.full_name).replace(/\s+/g, ' ');
  if (!out.full_name) errors.push('Full name is required');
  else if (out.full_name.length > 250) errors.push('Full name is longer than 250 characters');

  const mobileText = cellText(raw.mobile);
  if (!mobileText) errors.push('Mobile is required');
  else if (rules.phoneProblem(mobileText, 'Mobile')) errors.push(rules.phoneProblem(mobileText, 'Mobile'));
  out.mobile = mobileText;

  const gender = parseGender(cellText(raw.gender));
  if (gender.error) errors.push(gender.error);
  else if (!gender.value) errors.push('Gender is required');
  else out.gender_code = gender.value;

  // Matching needs the full date; a year alone is not a complete birthday.
  const birthday = parseBirthday(raw.birth_date);
  if (birthday.error) errors.push(birthday.error);
  else if (!birthday.value) errors.push('Birthday is required as YYYY-MM-DD');
  else { out.birth_date = birthday.value; out.birth_year = birthday.year; }

  const locationId = parseId(raw.location_id, 'Location ID');
  if (locationId.error) errors.push(locationId.error);
  else if (locationId.value === null) errors.push('Location ID is required');
  else {
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

  out.address_line = cellText(raw.address).replace(/\s+/g, ' ');
  if (!out.address_line) errors.push('Address is required');
  else if (out.address_line.length > 255) errors.push('Address is longer than 255 characters');

  // The row's own origin project wins; an empty cell takes the one chosen on the import screen.
  const originText = cellText(raw.origin_project);
  const origin = originText ? lookups.projectByKey[originText.toUpperCase()] : lookups.defaultProject;
  if (originText && !origin) errors.push('Origin project "' + originText + '" is not an active project code or ID');
  else if (!origin) errors.push('Origin project is required: fill the Origin project column or choose a project on the import screen');
  else { out.origin_project_id = origin.project_id; out.origin_project_code = origin.project_code; }

  return { values: out, errors: errors };
}

/*
 * One e-shop account belongs to one person. Rows that repeat an E-shop PK must
 * describe the same person (a strong match) with the same E-shop ID; anything
 * else is an error in the file rather than something to stage.
 */
function addEshopConflicts(checkedRows, records) {
  // The same rule for both identifiers a row carries: [pk field, id field, label].
  [['eshop_pk', 'eshop_id', 'E-shop'], ['user_pk', 'user_id', 'User']].forEach(function (identifier) {
    const firstByPk = {};
    checkedRows.forEach(function (checked, index) {
      const pk = checked.values[identifier[0]];
      if (!pk || checked.errors.length) return;
      const first = firstByPk[pk];
      if (first === undefined) { firstByPk[pk] = index; return; }
      const earlier = checkedRows[first].values;
      if (earlier[identifier[1]] !== checked.values[identifier[1]] || duplicates.score(earlier, checked.values, EXCEL_SCORING).score < duplicates.MERGE_FROM) {
        checked.errors.push(identifier[2] + ' PK ' + pk + ' is also on row ' + records[first].row_number + ' for a different person or ' + identifier[2] + ' ID');
      }
    });
  });
  return checkedRows;
}

/** The identifiers a row claims - its e-shop account and its user-management account - staged for review instead of committed. */
function unverifiedAccounts(values, projects) {
  return [
    { project_id: projects.eshop, external_account_id: values.eshop_pk, external_login: values.eshop_id,
      external_account_type: 'ESHOP_CUSTOMER', source: 'EXCEL_IMPORT' },
    { project_id: projects.user, external_account_id: values.user_pk, external_login: values.user_id,
      external_account_type: 'USER_ACCOUNT', source: 'EXCEL_IMPORT' }
  ];
}

/** Each cell of a failed row as text, keyed by column, so the row can be shown as it was written. */
function cellsOf(record) {
  const cells = {};
  COLUMNS.forEach(function (column) { cells[column.key] = cellText(record.raw[column.key]); });
  return cells;
}

/* ------------------------------------------------------------ preview and import */

/**
 * Every row with its verdict: NEW, DUPLICATE or ERROR. Writes nothing.
 * `summary` counts each; `rows` keeps the sheet's own row numbers.
 */
async function preview(buffer, options) {
 const records = await readRows(buffer);
 const lookups = await loadLookups((options || {}).origin_project_id);
 const checkedRows = addEshopConflicts(records.map(record => checkRow(record, lookups)), records);
 const context = await intake.candidateContext(db, checkedRows.filter(row => !row.errors.length).map(row => row.values), EXCEL_SCORING);
 /*
  * EARLIER ROWS AS THE IMPORT WILL HAVE LEFT THEM, so the check says what the
  * import will do. A NEW row is a customer; a DUPLICATE row is part of the
  * customer it matched (its phones and user_pk are added to that one entry);
  * a REVIEW row is a pending registration, which a later row can only join by
  * review. One index entry per resulting person, keyed by its first row.
  */
 const earlier = duplicates.createIndex();
 const entries = new Map();
 const remember = (key, values) => { entries.set(key, values); earlier.set(key, values); };
 const absorb = (key, values) => {
  const target = entries.get(key);
  remember(key, Object.assign({}, target, {
   contacts: (target.contacts || []).concat([{ contact_type: 'MOBILE', contact_value: values.mobile }]),
   user_pks: Array.from(new Set((target.user_pks || []).concat(duplicates.userPks(values))))
  }));
 };
 const rows = [];
 for (let index = 0; index < records.length; index += 1) {
  const record = records[index];
  const checked = checkedRows[index];
  const result = { row_number: record.row_number, values: checked.values };
  if (checked.errors.length) { result.status = 'ERROR'; result.errors = checked.errors; result.cells = cellsOf(record); }
  else {
   const found = await intake.candidates(db, checked.values, context);
   earlier.find(checked.values).forEach(other => {
    const match = duplicates.score(checked.values, other, EXCEL_SCORING);
    if (match.score < duplicates.REVIEW_FROM) return;
    // A row merged into a customer on file stands for that customer, not for a second person.
    if (other.party_pk) { if (!found.some(row => String(row.party_pk) === String(other.party_pk))) found.push(Object.assign({ party_pk: other.party_pk, display_name: other.full_name }, match)); return; }
    found.push(Object.assign({ row_number: other.row_number, pending: other.pending }, match));
   });
   found.sort((a,b) => b.score-a.score);
   result.similar = found;
   const strong = found.filter(r => r.score >= duplicates.MERGE_FROM);
   // A strong match with a pending registration (on file, or a row going to review) is decided by review.
   result.status = strong.length === 1 && !strong[0].intake_id && !strong[0].pending ? 'DUPLICATE' : found.length ? 'REVIEW' : 'NEW';
   if (found.length && found[0].row_number) result.duplicate_of_row = found[0].row_number;
   const key = 'row:' + record.row_number;
   if (result.status === 'DUPLICATE' && strong[0].row_number) absorb('row:' + strong[0].row_number, checked.values);
   else if (result.status === 'DUPLICATE' && entries.has('party:' + strong[0].party_pk)) absorb('party:' + strong[0].party_pk, checked.values);
   else if (result.status === 'DUPLICATE') remember('party:' + strong[0].party_pk, Object.assign({}, checked.values, { party_pk: strong[0].party_pk }));
   else remember(key, Object.assign({}, checked.values, { row_number: record.row_number, pending: result.status === 'REVIEW' }));
  }
  rows.push(result);
 }
 const count = status => rows.filter(r => r.status === status).length;
 return { summary: { total: rows.length, new: count('NEW'), duplicate: count('DUPLICATE'), review: count('REVIEW'), error: count('ERROR') }, rows };
}
async function importPeople(buffer, actor, options) {
 // Validate first, but do not repeat the read-only preview's duplicate pass:
 // submit performs the authoritative check under the registration lock below.
 const opts = options || {};
 const records = await readRows(buffer);
 const lookups = await loadLookups(opts.origin_project_id);
 const checkedRows = addEshopConflicts(records.map(record => checkRow(record, lookups)), records);
 const report = { rows: records.map((record, index) => {
  const checked = checkedRows[index];
  return { row_number: record.row_number, values: checked.values, status: checked.errors.length ? 'ERROR' : 'NEW', errors: checked.errors, cells: cellsOf(record) };
 }) };
 const valid = report.rows.filter(r => r.status !== 'ERROR');
 const failed = report.rows.filter(r => r.status === 'ERROR');
 // The projects the E-shop and User columns belong to are the ones given those roles in Settings > Projects.
 const eshopProject = await identityProjects.byRole('ESHOP');
 const userProject = await identityProjects.byRole('USER_MANAGEMENT');
 if (!eshopProject) throw new HttpError(409, 'crm.customerImport.noEshopProject');
 if (!userProject) throw new HttpError(409, 'crm.customerImport.noUserManagementProject');
 const projects = { eshop: eshopProject.project_id, user: userProject.project_id };
 const batch = crypto.createHash('sha256').update(buffer).digest('hex');
 await transaction(async trx => {
  await intake.lock(trx);
  const context = await intake.candidateContext(trx, valid.map(row => row.values), EXCEL_SCORING);
  for (const row of valid) {
   const origin = row.values.origin_project_id;
   const contacts = [{ contact_type: 'MOBILE', contact_value: row.values.mobile, source_project_id: origin }];
   const result = await intake.submit(trx, Object.assign({}, row.values, { party_type: 'PERSON', origin_project_id: origin, contacts }),
    { source_record_id: 'excel:' + batch + ':' + row.row_number, candidateContext: context, unverified_accounts: unverifiedAccounts(row.values, projects) });
   await context.refresh(result);
   row.status = result.outcome === 'QUEUED' ? 'REVIEW' : result.outcome;
   row.party_pk = result.party_pk;
   row.intake_id = result.intake_id;
   if (result.candidates) row.similar = result.candidates;
  }
  // Failed rows are kept, cells as written and every reason; the same file run again adds nothing new.
  for (const row of failed) {
   await trx('crm_person_import_error').insert({
    batch_hash: batch, file_name: opts.file_name ? String(opts.file_name).slice(0, 255) : null, row_number: row.row_number,
    cells: JSON.stringify(row.cells), errors: JSON.stringify(row.errors), imported_by_manager_id: actor ? actor.manager_id : null
   }).onConflict(['batch_hash', 'row_number']).ignore();
  }
 });
 const count = status => report.rows.filter(r => r.status === status).length;
 const summary = { total: report.rows.length, created: count('CREATED'), duplicate: count('MERGED'), review: count('REVIEW'), error: failed.length };
 audit.imported(actor, 'crm_registration_intake', summary, PAGE);
 return { summary, rows: report.rows };
}

/* ------------------------------------------------------------ rows that failed, kept for review */

async function importErrors(filters) {
 const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
 const page = Math.max(1, Number(filters.page) || 1);
 const base = db('crm_person_import_error as failed').where('failed.status', filters.status === 'DISMISSED' ? 'DISMISSED' : 'OPEN');
 // The file name, and any cell or reason of the row.
 const term = String(filters.q || '').trim();
 if (term) base.where(function () {
  this.where('failed.file_name', 'ilike', '%' + term + '%')
   .orWhereRaw('failed.cells::text ILIKE ?', ['%' + term + '%']).orWhereRaw('failed.errors::text ILIKE ?', ['%' + term + '%']);
 });
 const [count, rows] = await Promise.all([
  base.clone().count({ total: '*' }).first(),
  base.clone().leftJoin('managers as manager', 'manager.id', 'failed.imported_by_manager_id')
   .select('failed.*', 'manager.name as imported_by').orderBy([{ column: 'failed.created_at', order: 'desc' }, { column: 'failed.row_number' }])
   .limit(limit).offset((page - 1) * limit)
 ]);
 return { rows, total: Number(count.total), page, limit };
}

/** Put a failed row aside once it has been fixed (by importing it again) or is not wanted. */
async function dismissImportError(id, actor) {
 if (!/^[1-9][0-9]*$/.test(String(id))) throw new HttpError(404, 'common.notFound');
 const rows = await db('crm_person_import_error').where({ import_error_id: id, status: 'OPEN' })
  .update({ status: 'DISMISSED', dismissed_at: db.fn.now(), dismissed_by_manager_id: actor ? actor.manager_id : null }).returning('import_error_id');
 if (!rows.length) throw new HttpError(404, 'common.notFound');
 audit.updated(actor, 'crm_person_import_error', id, null, { status: 'DISMISSED' }, PAGE);
 return { import_error_id: id, status: 'DISMISSED' };
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
  const [jobs, places, projects] = await Promise.all([
    db('crm_job_title').where('is_active', true).orderBy(['sort_order', 'job_name']).select('job_title_id', 'job_name'),
    locations.all(),
    db('crm_project').where('status', 'ACTIVE').orderBy('project_id').select('project_id', 'project_code', 'project_name')
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
    { eshop_pk: '100245', eshop_id: 'liwei88', user_pk: '500245', user_id: 'liwei88', full_name: 'Li Wei', gender: 'M', birth_date: new Date(Date.UTC(1988, 4, 17)), mobile: '+86 138 0013 8000',
      location_id: firstPlace, address: '18 Tianhe Road', job_title_id: firstJob },
    { eshop_pk: '100391', eshop_id: 'wangfang', user_pk: '500391', user_id: 'wang.fang', full_name: 'Wang Fang', gender: 'F', birth_date: new Date(Date.UTC(1995, 10, 3)), mobile: '13900139000',
      location_id: secondPlace, address: '7 Zhongshan Avenue', job_title_id: secondJob }
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

  const projectSheet = book.addWorksheet('Projects');
  projectSheet.columns = [
    { header: 'Code', key: 'project_code', width: 14 },
    { header: 'ID', key: 'project_id', width: 8 },
    { header: 'Project', key: 'project_name', width: 30 }
  ];
  projectSheet.getRow(1).font = { bold: true };
  projects.forEach(function (project) { projectSheet.addRow(project); });

  // Dropdowns on gender, location ID, job title ID and origin project, so a value not on a list is caught while typing.
  const lastJobRow = Math.max(2, jobs.length + 1);
  const lastLocationRow = Math.max(2, places.length + 1);
  const lastProjectRow = Math.max(2, projects.length + 1);
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
    sheet.getCell(columnLetter('origin_project') + rowNumber).dataValidation = {
      type: 'list', allowBlank: true, formulae: ["'Projects'!$A$2:$A$" + lastProjectRow],
      showErrorMessage: true, errorTitle: 'Origin project', error: 'Choose a code from the Projects sheet, or leave it empty'
    };
  }

  return book.xlsx.writeBuffer();
}

module.exports = {
  COLUMNS: COLUMNS,
  preview: preview,
  importPeople: importPeople,
  template: template,
  importErrors: importErrors,
  dismissImportError: dismissImportError
};
