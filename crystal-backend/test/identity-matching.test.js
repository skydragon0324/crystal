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
assert.equal(match.score(base, { home_location_pk: 1 }).score, 15, 'the same location ID is location evidence');
assert.equal(match.score(base, { home_location_pk: '1', address_line: 'Another Street' }).score, 15, 'locations compare by ID; the street text is not evidence');
assert.equal(match.score(base, { address_line: base.address_line, home_location_pk: 2 }).score, 0, 'the same street text in another location is not evidence');
assert.equal(match.score(base, { birth_year: 1980 }).score, 0, 'birth year alone is not a birthday');
assert.equal(match.score(base, { contacts: [{ contact_type: 'PHONE', contact_value: base.mobile }, { contact_type: 'MOBILE', contact_value: base.mobile }] }).score, 40, 'phone is counted once');
assert.equal(match.sameInFile(base, base).decision, 'MERGE');
// Bands: 70+ merge, 50-69 review, below 50 new.
assert.equal(match.score(base, { full_name: base.full_name, birth_date: base.birth_date }).decision, 'REVIEW', '50 is reviewed');
assert.equal(match.score(base, { full_name: base.full_name, home_location_pk: 1, job_title_id: 3 }).decision, 'NEW', '45 is new');
// The Excel rule: the same user_pk is the same person whatever the phone.
const otherPhone = { full_name: base.full_name, birth_date: base.birth_date, home_location_pk: 1, mobile: '+44 9999 999999', user_pk: '5001' };
assert.equal(match.score(Object.assign({ user_pk: '5001' }, base), otherPhone).decision, 'REVIEW', 'outside an Excel import a user_pk is not evidence');
assert.equal(match.score(Object.assign({ user_pk: '5001' }, base), otherPhone, { userPkMerges: true }).decision, 'MERGE', 'in an Excel import the same user_pk is merged');
assert.equal(match.score({ full_name: 'Someone', user_pks: ['5001'] }, { full_name: 'Other', user_pk: '5001' }, { userPkMerges: true }).score, 70, 'a customer already carrying the user_pk matches');
assert.equal(match.score(Object.assign({ user_pk: '5002' }, base), otherPhone, { userPkMerges: true }).decision, 'REVIEW', 'another user_pk falls back to the scores');
assert.equal(match.sameInFile(base, { mobile: base.mobile }), null);
// Indexed matching must retain every >40 match, including secondary phones,
// and replace old keys when merge evidence changes.
const index = match.createIndex();
const fixtures = Array.from({ length: 150 }, (_, i) => ({
 full_name: 'Person ' + (i % 17), birth_date: '1980-01-' + String(i % 28 + 1).padStart(2, '0'),
 mobile: String(1000000000 + i % 31), address_line: 'Address ' + (i % 5), job_title_id: i % 3,
 contacts: [{ contact_type: 'PHONE', contact_value: String(2000000000 + i % 11) }]
}));
fixtures.forEach((row, i) => index.set(i, row));
fixtures.forEach(candidate => {
 const expected = fixtures.filter(row => match.score(candidate, row).score > 40);
 const actual = index.find(candidate).filter(row => match.score(candidate, row).score > 40);
 assert.deepStrictEqual(actual, expected, 'index must preserve all matches and insertion order');
});
const replacement = match.createIndex();
replacement.set('one', { mobile: '1234567890', contacts: [{ contact_type: 'MOBILE', contact_value: '1234567890' }] });
replacement.set('one', { mobile: '9999999999' });
assert.equal(replacement.find({ mobile: '1234567890' }).length, 0);
assert.equal(replacement.find({ mobile: '9999999999' }).length, 1);
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
 console.log('Weighted identity tests passed (27 assertions, including SQL query compilation)');
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.destroy());
