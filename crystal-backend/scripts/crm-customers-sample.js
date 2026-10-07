'use strict';

/**
 * WRITES A FILLED-IN SAMPLE of the customer import sheet.
 *
 *   node scripts/crm-customers-sample.js [output.xlsx]
 *
 * The same workbook the console's "Download template" gives (job titles and
 * locations on their own sheets, dropdowns on gender and job), with eight
 * made-up people in it, so the import can be tried end to end. The job titles
 * and locations are read from the database the script points at, so the
 * sample only uses values that database accepts.
 *
 * Default output: docs/samples/crm-customers-sample.xlsx
 */
const fs = require('fs');
const path = require('path');

const db = require('../src/config/db');
const personImport = require('../src/services/crm/personImport.service');

const OUT = process.argv[2] || path.join(__dirname, '..', 'docs', 'samples', 'crm-customers-sample.xlsx');

/*
 * Made-up people, each complete (phase 1 imports only complete people who
 * already have an e-shop account). Phone numbers are in the 138 0000 test
 * block; e-shop PKs and IDs are invented.
 */
const PEOPLE = [
  ['Zhang Wei', 'M', [1985, 2, 14], '+86 138 0000 0101', 'Beijing', 'Engineer', '21 Chaoyang Road', 'zhang.wei@example.com', '500101', 'zhangwei85'],
  ['Liu Yang', 'F', [1992, 7, 3], '+86 138 0000 0102', 'Shanghai', 'Teacher', '9 Huaihai Road', '', '500102', 'liuyang'],
  ['Chen Jie', 'M', [1978, 11, 21], '13800000103', 'Guangdong', 'Doctor', '45 Tianhe North Road', 'chen.jie@example.com', '500103', 'chenjie'],
  ['Huang Min', 'F', [2001, 4, 9], '13800000104', 'Zhejiang', 'Student', '3 Wensan Road', '', '500104', 'huangmin01'],
  ['Zhao Lei', 'M', [1969, 9, 30], '+86 138 0000 0105', 'Jiangsu', 'Farmer', '12 Zhongshan East Road', '', '500105', 'zhaolei'],
  ['Wu Ting', 'F', [1988, 1, 17], '+86 138 0000 0106', 'Sichuan', 'Employee', '77 Renmin South Road', 'wu.ting@example.com', '500106', 'wuting88'],
  ['Zhou Bin', 'M', [1995, 12, 2], '13800000107', 'Guangdong', 'Worker', '8 Binjiang Road', '', '500107', 'zhoubin'],
  ['Sun Li', 'F', [1983, 6, 25], '+86 138 0000 0108', 'Shanghai', 'Scientist', '120 Zhangjiang Road', '', '500108', 'sunli83']
];

async function main() {
  const [jobs, places] = await Promise.all([
    db('crm_job_title').where('is_active', true).orderBy('sort_order').select('job_title_id', 'job_name'),
    db('crm_location').orderBy('position').select('location_pk', 'location_name')
  ]);

  /*
   * The sheet takes IDs. A person's job and place are written by name above
   * for readability and turned into the ID this database has for that name;
   * a name it does not have takes the list's first entry instead, so every
   * row of the sample imports.
   */
  const idOf = function (list, nameKey, idKey, wanted) {
    const match = list.filter(function (item) { return item[nameKey].toLowerCase() === wanted.toLowerCase(); })[0] || list[0];
    return match ? match[idKey] : null;
  };

  const examples = PEOPLE.map(function (person) {
    return {
      eshop_pk: person[8],
      eshop_id: person[9],
      full_name: person[0],
      gender: person[1],
      birth_date: new Date(Date.UTC(person[2][0], person[2][1] - 1, person[2][2])),
      mobile: person[3],
      location_id: idOf(places, 'location_name', 'location_pk', person[4]),
      job_title_id: idOf(jobs, 'job_name', 'job_title_id', person[5]),
      address: person[6],
      email: person[7]
    };
  });

  const buffer = await personImport.template({ examples: examples });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, Buffer.from(buffer));
  console.log('sample written: ' + OUT + ' (' + examples.length + ' people)');
}

main()
  .then(function () { return db.destroy(); })
  .catch(function (err) {
    console.error('sample failed: ' + err.message);
    return db.destroy().then(function () { process.exitCode = 1; });
  });
