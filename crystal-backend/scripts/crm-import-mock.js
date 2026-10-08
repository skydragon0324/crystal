'use strict';

/**
 * WRITES docs/samples/crm-customers-test-import.xlsx - a customer import file
 * for testing Customers > Import from Excel, with every case the import has
 * to handle and, on a second sheet, what each row should come out as.
 *
 *   node scripts/crm-import-mock.js          (npm run crm:mock-import)
 *
 * The job title, location and project IDs are read from the database, so the
 * valid rows are valid and the invalid ones are invalid against this
 * database's own lists. The rows are generated from a fixed seed: the same
 * database gives the same file. Nothing is written to the database.
 *
 * Expected results assume an empty CRM (no customers yet) and that the
 * origin project is chosen on the import screen.
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const db = require('../src/config/db');
const personImport = require('../src/services/crm/personImport.service');

const OUT = path.join(__dirname, '..', 'docs', 'samples', 'crm-customers-test-import.xlsx');

/* A small seeded generator, so the file is the same every time. */
function seeded(seed) {
  let state = seed >>> 0;
  return function () {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = seeded(20261008);
const pick = (list) => list[Math.floor(random() * list.length)];

const SURNAMES = ['Wang', 'Li', 'Zhang', 'Liu', 'Chen', 'Yang', 'Zhao', 'Huang', 'Zhou', 'Wu', 'Xu', 'Sun', 'Hu', 'Zhu', 'Gao',
  'Lin', 'He', 'Guo', 'Ma', 'Luo', 'Liang', 'Song', 'Zheng', 'Xie', 'Han', 'Tang', 'Feng', 'Yu', 'Dong', 'Xiao'];
const GIVEN = ['Wei', 'Fang', 'Na', 'Min', 'Jing', 'Lei', 'Qiang', 'Yan', 'Jun', 'Hui', 'Ping', 'Gang', 'Xia', 'Tao', 'Ming',
  'Chao', 'Hua', 'Ying', 'Bo', 'Lan', 'Hong', 'Yong', 'Jie', 'Juan', 'Kai', 'Rui', 'Xin', 'Yu', 'Hao', 'Lu'];
const STREETS = ['Renmin Road', 'Zhongshan Avenue', 'Jiefang Street', 'Heping Road', 'Xinhua Street', 'Chang\'an Avenue',
  'Binhai Road', 'Hongqi Street', 'Wenhua Road', 'Jianshe Avenue', 'Yingbin Road', 'Dongfeng Street'];

/* Unique names: every surname with every given name, shuffled. */
const NAMES = [];
SURNAMES.forEach((surname) => GIVEN.forEach((given) => NAMES.push(surname + ' ' + given)));
for (let index = NAMES.length - 1; index > 0; index -= 1) {
  const other = Math.floor(random() * (index + 1));
  const kept = NAMES[index]; NAMES[index] = NAMES[other]; NAMES[other] = kept;
}
let nameAt = 0;
const nextName = () => NAMES[nameAt++];

let phoneAt = 0;
/* Distinct mobiles, written the way people write them: with and without the country code and spaces. */
function nextPhone() {
  phoneAt += 1;
  const number = String(13800000000 + phoneAt * 7919).slice(0, 11);
  const style = phoneAt % 3;
  if (style === 0) return '+86 ' + number.slice(0, 3) + ' ' + number.slice(3, 7) + ' ' + number.slice(7);
  if (style === 1) return number;
  return number.slice(0, 3) + '-' + number.slice(3, 7) + '-' + number.slice(7);
}
let accountAt = 0;
function nextAccounts(name) {
  accountAt += 1;
  const login = name.toLowerCase().replace(/[^a-z]/g, '') + accountAt;
  return { eshop_pk: String(300000 + accountAt), eshop_id: login, user_pk: String(700000 + accountAt), user_id: 'u.' + login };
}
function birthday() {
  const year = 1950 + Math.floor(random() * 55);
  const month = 1 + Math.floor(random() * 12);
  const day = 1 + Math.floor(random() * 28);
  return year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
}

async function main() {
  const [jobs, places, projects] = await Promise.all([
    db('crm_job_title').where('is_active', true).orderBy('job_title_id').select('job_title_id'),
    db('crm_location').orderBy('location_pk').select('location_pk'),
    db('crm_project').where('status', 'ACTIVE').orderBy('project_id').select('project_id', 'project_code', 'identity_role')
  ]);
  if (!jobs.length || !places.length || !projects.length) throw new Error('add job titles, locations and projects first');
  const jobIds = jobs.map((job) => job.job_title_id);
  const placeIds = places.map((place) => place.location_pk);
  let missingJob = 1;
  while (jobIds.indexOf(missingJob) !== -1) missingJob += 1;

  const rows = [];
  /* One row: the cells in template order, and what the row is meant to test. */
  /* Rows of one group stay together and in order (a repeat after the row it repeats); groups are shuffled. */
  let group = 0;
  const startGroup = () => { group += 1; };
  const add = (person, testCase, check, imported, note) => {
    rows.push({ person: Object.assign({}, person), testCase: testCase, check: check, imported: imported, note: note || '', group: group });
    return person;
  };
  const person = (overrides) => {
    const name = (overrides && overrides.full_name) || nextName();
    return Object.assign({
      full_name: name, gender: random() < 0.5 ? 'M' : 'F', birth_date: birthday(), mobile: nextPhone(),
      location_id: pick(placeIds), address: (1 + Math.floor(random() * 300)) + ' ' + pick(STREETS),
      job_title_id: random() < 0.8 ? pick(jobIds) : '', origin_project: ''
    }, nextAccounts(name), overrides || {});
  };
  const otherPlace = (id) => placeIds.filter((place) => String(place) !== String(id))[0];

  /* ---------------------------------------------------------------- A. new customers */
  for (let index = 0; index < 150; index += 1) {
    const origin = index % 25 === 0 ? projects[0].project_code : index % 25 === 1 ? projects[projects.length - 1].project_code : '';
    startGroup();
    add(person({ origin_project: origin }), 'A. New customer', 'New customers', 'Created',
      origin ? 'Names its own origin project (' + origin + ') in the Origin project column' : '');
  }

  /* ---------------------------------------------------------------- B. one person, a row per phone */
  for (let index = 0; index < 15; index += 1) {
    startGroup();
    const first = add(person(), 'B. Same person, several phones', 'New customers', 'Created', 'First row of this person');
    const extra = index % 3 === 0 ? 2 : 1;
    for (let more = 0; more < extra; more += 1) {
      add(Object.assign({}, first, { mobile: nextPhone() }), 'B. Same person, several phones', 'Already customers', 'Merged',
        'Same User PK as row of ' + first.full_name + ': merged, this phone added');
    }
  }

  /* ---------------------------------------------------------------- C. the same row twice */
  for (let index = 0; index < 8; index += 1) {
    startGroup();
    const first = add(person(), 'C. Exact duplicate row', 'New customers', 'Created', 'First copy');
    add(first, 'C. Exact duplicate row', 'Already customers', 'Merged', 'Identical copy: phone 40 + name 25 + birthday 25 + location 15 (+ job 5)');
  }

  /* ---------------------------------------------------------------- D. same person, other accounts */
  for (let index = 0; index < 4; index += 1) {
    startGroup();
    const first = add(person(), 'D. Same person, another e-shop and user account', 'New customers', 'Created', 'First account');
    add(Object.assign({}, first, nextAccounts(first.full_name)), 'D. Same person, another e-shop and user account', 'Already customers', 'Merged',
      'Same phone, name, birthday and location (90+): merged; both accounts become candidate IDs of the one customer');
  }

  /* ---------------------------------------------------------------- E-G. for review */
  const reviewed = [];
  for (let index = 0; index < 4; index += 1) {
    startGroup();
    const first = add(person(), 'E. Same name and birthday (50)', 'New customers', 'Created', 'First of the pair');
    add(Object.assign(person({ full_name: first.full_name, birth_date: first.birth_date }), { location_id: otherPlace(first.location_id), job_title_id: '' }),
      'E. Same name and birthday (50)', 'Review customers', 'Pending registration', 'Name 25 + birthday 25 = 50; other phone, location and accounts');
  }
  for (let index = 0; index < 4; index += 1) {
    startGroup();
    const first = add(person({ job_title_id: '' }), 'F. Same name, birthday and location (65)', 'New customers', 'Created', 'First of the pair');
    reviewed.push(add(person({ full_name: first.full_name, birth_date: first.birth_date, location_id: first.location_id, job_title_id: '' }),
      'F. Same name, birthday and location (65)', 'Review customers', 'Pending registration', 'Name 25 + birthday 25 + location 15 = 65'));
  }
  for (let index = 0; index < 3; index += 1) {
    startGroup();
    const first = add(person({ job_title_id: '' }), 'G. Same phone and name, other birthday (65)', 'New customers', 'Created', 'First of the pair');
    add(person({ full_name: first.full_name, mobile: first.mobile, location_id: otherPlace(first.location_id), job_title_id: '' }),
      'G. Same phone and name, other birthday (65)', 'Review customers', 'Pending registration', 'Phone 40 + name 25 = 65');
  }
  /* A row that matches a row going to review joins it in review, not as a new customer. */
  reviewed.slice(0, 2).forEach((pending) => {
    group = rows.filter((row) => row.person === pending || row.person.eshop_pk === pending.eshop_pk)[0].group;
    add(pending, 'H. Copy of a row that is under review', 'Review customers', 'Pending registration',
      'Matches a registration waiting for review: decided by the administrator too');
  });

  /* ---------------------------------------------------------------- I. similar, but different people */
  for (let index = 0; index < 3; index += 1) {
    startGroup();
    const first = add(person(), 'I. Family sharing a phone (40)', 'New customers', 'Created', 'First of the family');
    add(person({ mobile: first.mobile, location_id: otherPlace(first.location_id) }), 'I. Family sharing a phone (40)', 'New customers', 'Created',
      'Same phone only (40): another name, birthday and location - a different person');
  }
  for (let index = 0; index < 3; index += 1) {
    startGroup();
    const first = add(person(), 'J. Same name only (25-45)', 'New customers', 'Created', 'First of the namesakes');
    add(person({ full_name: first.full_name, location_id: first.location_id, job_title_id: first.job_title_id || jobIds[0] }),
      'J. Same name only (25-45)', 'New customers', 'Created', 'Name 25 + location 15 (+ job 5) = at most 45: a different person');
  }

  /* ---------------------------------------------------------------- K. errors */
  const victim = rows[4].person;
  const errors = [
    [{ eshop_pk: '' }, 'E-shop PK is missing'],
    [{ eshop_pk: 'ES-1001' }, 'E-shop PK is not a number'],
    [{ user_id: '' }, 'User ID is missing'],
    [{ user_pk: 'abc' }, 'User PK is not a number'],
    [{ full_name: '' }, 'Full name is missing'],
    [{ gender: 'X' }, 'Gender is not M or F'],
    [{ birth_date: '1990-13-40' }, 'Birthday is not a real date'],
    [{ birth_date: '1985' }, 'Birthday is a year only'],
    [{ birth_date: '2099-01-01' }, 'Birthday is in the future'],
    [{ birth_date: 'unknown' }, 'Birthday is not a date'],
    [{ mobile: 'call me' }, 'Mobile is not a phone number'],
    [{ mobile: '12345' }, 'Mobile is too short'],
    [{ mobile: '' }, 'Mobile is missing'],
    [{ location_id: 999 }, 'Location ID is not on the location list'],
    [{ location_id: '' }, 'Location ID is missing'],
    [{ job_title_id: missingJob }, 'Job title ID ' + missingJob + ' is not on the job list'],
    [{ address: '' }, 'Address is missing'],
    [{ origin_project: 'NOPE' }, 'Origin project is not a project'],
    [{ eshop_pk: victim.eshop_pk }, 'E-shop PK already used by another person (row of ' + victim.full_name + ')'],
    [{ user_pk: victim.user_pk, user_id: 'someone.else' }, 'User PK already used with another User ID (row of ' + victim.full_name + ')'],
    [{ gender: 'X', birth_date: 'soon', mobile: 'none', location_id: 999 }, 'Several problems in one row']
  ];
  errors.forEach((error, index) => {
    // The two conflicts must come after the row they conflict with: they go last.
    group = index >= errors.length - 3 && index < errors.length - 1 ? 1000000 : group + 1;
    add(person(error[0]), 'K. Error', 'Errors', 'Kept under Import errors', error[1]);
  });

  /* Spread the groups through the file, as a real export would have them; the conflict rows stay last. */
  const groups = Array.from(new Set(rows.map((row) => row.group))).filter((id) => id !== 1000000);
  for (let index = groups.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    const kept = groups[index]; groups[index] = groups[other]; groups[other] = kept;
  }
  groups.push(1000000);
  const placed = [].concat.apply([], groups.map((id) => rows.filter((row) => row.group === id)));

  /* ---------------------------------------------------------------- the workbook */
  const book = new ExcelJS.Workbook();
  book.creator = 'Crystal CRM';
  const sheet = book.addWorksheet('Customers');
  sheet.columns = personImport.COLUMNS.map((column) => ({ header: column.header + (column.required ? ' *' : ''), key: column.key, width: column.width }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  placed.forEach((row) => {
    const cells = {};
    personImport.COLUMNS.forEach((column) => { cells[column.key] = row.person[column.key] === undefined ? '' : row.person[column.key]; });
    sheet.addRow(cells);
  });

  const cases = book.addWorksheet('Test cases');
  cases.columns = [
    { header: 'Row', key: 'row', width: 6 }, { header: 'Case', key: 'testCase', width: 44 },
    { header: 'After "Check the file"', key: 'check', width: 22 }, { header: 'After "Add new users"', key: 'imported', width: 26 },
    { header: 'Name', key: 'name', width: 20 }, { header: 'Note', key: 'note', width: 90 }
  ];
  cases.getRow(1).font = { bold: true };
  cases.views = [{ state: 'frozen', ySplit: 1 }];
  placed.forEach((row, index) => {
    row.sheetRow = index + 2;
    cases.addRow({ row: row.sheetRow, testCase: row.testCase, check: row.check, imported: row.imported, name: row.person.full_name, note: row.note });
  });

  const summary = book.addWorksheet('Summary');
  summary.columns = [{ header: 'Case', key: 'testCase', width: 48 }, { header: 'Rows', key: 'rows', width: 8 }];
  summary.getRow(1).font = { bold: true };
  const byCase = {};
  placed.forEach((row) => { byCase[row.testCase] = (byCase[row.testCase] || 0) + 1; });
  Object.keys(byCase).sort().forEach((key) => summary.addRow({ testCase: key, rows: byCase[key] }));
  summary.addRow({});
  ['New customers', 'Review customers', 'Already customers', 'Errors'].forEach((tab) => {
    summary.addRow({ testCase: 'Expected in "' + tab + '"', rows: placed.filter((row) => row.check === tab).length });
  });
  summary.addRow({ testCase: 'Total rows', rows: placed.length });
  summary.addRow({});
  summary.addRow({ testCase: 'Choose an origin project on the import screen: rows with an empty Origin project use it.' });
  summary.addRow({ testCase: 'Expected results assume the CRM has no customers yet.' });

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await book.xlsx.writeFile(OUT);
  console.log('written: ' + OUT + ' (' + placed.length + ' rows)');
  return { file: OUT, rows: placed };
}

module.exports = { main: main };

if (require.main === module) {
  main().catch((err) => { console.error(err.message); process.exitCode = 1; }).finally(() => db.destroy());
}
