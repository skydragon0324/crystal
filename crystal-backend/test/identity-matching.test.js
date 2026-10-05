const assert = require('assert');
const match = require('../src/services/crm/personDuplicates');
const db = require('../src/config/db');
const base = { full_name: 'Ada Lovelace', mobile: '+44 1234 567890', birth_date: '1980-12-10', address_line: '12 River Road', home_location_pk: 1, job_title_id: 3 };
assert.equal(match.score({}, {}).score, 0, 'missing fields are not evidence');
assert.equal(match.score(base, base).score, 110);
assert.equal(match.score(base, { mobile: '441234567890' }).decision, 'NEW', '40 is new');
assert.equal(match.score(base, { full_name: ' ADA   LOVELACE ', birth_date: '1980-12-10' }).score, 50);
assert.equal(match.score(base, { full_name: base.full_name, mobile: base.mobile }).decision, 'REVIEW');
assert.equal(match.score(base, { full_name: base.full_name, mobile: base.mobile, job_title_id: '3' }).score, 70);
assert.equal(match.score(base, { full_name: base.full_name, mobile: base.mobile, job_title_id: '3' }).decision, 'MERGE');
assert.equal(match.score(base, { mobile: '+33 1234 567890' }).score, 0, 'country codes cannot be truncated');
assert.equal(match.score(base, { home_location_pk: 1 }).score, 0, 'town alone is not an address');
assert.equal(match.score(base, { birth_year: 1980 }).score, 0, 'birth year alone is not a birthday');
assert.equal(match.score(base, { contacts: [{ contact_type: 'PHONE', contact_value: base.mobile }, { contact_type: 'MOBILE', contact_value: base.mobile }] }).score, 40, 'phone is counted once');
assert.equal(match.sameInFile(base, base).decision, 'MERGE');
assert.equal(match.sameInFile(base, { mobile: base.mobile }), null);
// Compile the real Knex query and supply rows without opening a connection.
let compiled;
function fakeConnection(table) {
 const builder = db(table);
 builder.then = (resolve, reject) => {
  compiled = builder.toSQL();
  const fixtures = [
   Object.assign({}, base, { party_pk: '8', contacts: [{ contact_type: 'MOBILE', contact_value: base.mobile }] }),
   { party_pk: '7', full_name: base.full_name, birth_date: base.birth_date, contacts: [] }
  ];
  return Promise.resolve(fixtures).then(resolve, reject);
 };
 return builder;
}
fakeConnection.raw = db.raw.bind(db);
match.findSimilar(base, { trx: fakeConnection, limit: 1 }).then(rows => {
 assert.equal(rows.length, 1);
 assert.equal(rows[0].party_pk, '8');
 assert.equal(rows[0].score, 110);
 assert(compiled.sql.includes('"person"."party_pk" = "party"."party_pk"'));
 assert(compiled.sql.includes('cp.party_pk=party.party_pk'));
 assert(compiled.bindings.includes('ada lovelace'));
 console.log('Weighted identity tests passed (19 assertions, including SQL query compilation)');
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.destroy());
