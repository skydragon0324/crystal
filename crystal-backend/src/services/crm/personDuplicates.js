const db = require('../../config/db');
const contact = require('./contact');
const WEIGHTS = { phone: 40, name: 25, birth_date: 25, location: 15, occupation: 5 };
/* 70 or more: the same person, merged. 50-69: an administrator decides. Below 50: a new customer. */
const MERGE_FROM = 70;
const REVIEW_FROM = 50;
function textKey(value) { return String(value == null ? '' : value).trim().replace(/\s+/g, ' ').toLowerCase(); }
function phoneKey(value) { return contact.normalise('MOBILE', value).replace(/\D/g, ''); }
function dateKey(value) { return value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10); }
function phones(value) { return [value.mobile, value.phone].concat((value.contacts || []).filter(c => ['MOBILE','PHONE'].includes(c.contact_type)).map(c => c.contact_value)).map(phoneKey).filter(Boolean); }
/*
 * The user-management (PLATFORM) user_pks a person carries: an Excel row has
 * one (user_pk); a customer loaded as a candidate has every one linked to it
 * or listed for it by an earlier import (user_pks).
 */
function userPks(value) { return [value.user_pk].concat(value.user_pks || []).filter(Boolean).map(String); }
/*
 * options.userPkMerges: the Excel import's rule. A sheet lists one row per
 * phone number, so one person can be several rows; the same user_pk is the
 * same person and is merged (score at least 70), whatever the phones.
 */
function score(first, second, options) {
 const evidence = [];
 const add = (key, a, b) => { if (a && b && a === b) evidence.push({ field: key, points: WEIGHTS[key] }); };
 if (phones(first).some(p => phones(second).includes(p))) evidence.push({ field: 'phone', points: 40 });
 add('name', textKey(first.full_name || first.display_name), textKey(second.full_name || second.display_name));
 add('birth_date', dateKey(first.birth_date), dateKey(second.birth_date));
 // The home location is compared by its ID on the vendor location list. The
 // street text (address_line) is free text kept for search and display, and
 // is not evidence: the same street is written in too many ways.
 add('location', textKey(first.home_location_pk), textKey(second.home_location_pk));
 add('occupation', textKey(first.job_title_id || first.occupation), textKey(second.job_title_id || second.occupation));
 let points = evidence.reduce((total, item) => total + item.points, 0);
 if (options && options.userPkMerges && points < MERGE_FROM && userPks(first).some(pk => userPks(second).includes(pk))) {
  evidence.push({ field: 'same_user_pk', points: MERGE_FROM - points });
  points = MERGE_FROM;
 }
 return { score: points, evidence, rule_code: 'WEIGHTED_PERSON', reason: evidence.map(e => e.field + ' +' + e.points).join(', '), decision: points >= MERGE_FROM ? 'MERGE' : points >= REVIEW_FROM ? 'REVIEW' : 'NEW' };
}
// Every score of 50 or more shares a phone, name or birthday (or, in an Excel import, a user_pk). Keep raw evidence
// in the index; masking is only for the response, never for future matching.
function matchKeys(value) {
 return phones(value).map(p => 'p:' + p).concat(userPks(value).map(pk => 'u:' + pk), [
  textKey(value.full_name || value.display_name) && 'n:' + textKey(value.full_name || value.display_name),
  dateKey(value.birth_date) && 'b:' + dateKey(value.birth_date)
 ]).filter(Boolean);
}
function createIndex() {
 const buckets = new Map(); const entries = new Map(); let sequence = 0;
 return {
  set(id, value) {
   const previous = entries.get(id);
   if (previous) previous.keys.forEach(key => { const bucket = buckets.get(key); bucket.delete(id); if (!bucket.size) buckets.delete(key); });
   const entry = { value, keys: Array.from(new Set(matchKeys(value))), order: previous ? previous.order : sequence++ };
   entries.set(id, entry);
   entry.keys.forEach(key => { if (!buckets.has(key)) buckets.set(key, new Set()); buckets.get(key).add(id); });
  },
  find(value) {
   const ids = new Set();
   matchKeys(value).forEach(key => { const bucket = buckets.get(key); if (bucket) bucket.forEach(id => ids.add(id)); });
   return Array.from(ids).map(id => entries.get(id)).sort((a,b) => a.order-b.order).map(entry => entry.value);
  }
 };
}
/*
 * Every user-management (PLATFORM) user_pk known for a customer: accounts
 * linked to them, and the candidate IDs an Excel import listed for them. Rows
 * of (party_pk, pk). The Excel template's User PK column is PLATFORM's user_pk.
 */
const USER_PKS_SQL = `
  SELECT account.party_pk, account.external_account_id AS pk
    FROM crm_project_account account JOIN crm_project project ON project.project_id = account.project_id
   WHERE project.project_code = 'PLATFORM' AND account.unlinked_at IS NULL
  UNION
  SELECT registration.party_pk, listed->>'external_account_id' AS pk
    FROM crm_registration_intake registration
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(registration.payload->'unverified_accounts', '[]'::jsonb)) listed
    JOIN crm_project project ON project.project_id::text = listed->>'project_id'
   WHERE registration.category = 'PERSON' AND registration.party_pk IS NOT NULL AND project.project_code = 'PLATFORM'`;
async function loadCandidates(candidates, options) {
 const opts = options || {}; const query = opts.trx || db;
 const names = Array.from(new Set(candidates.map(candidate => textKey(candidate.full_name || candidate.display_name)).filter(Boolean)));
 const birthdays = Array.from(new Set(candidates.map(candidate => dateKey(candidate.birth_date)).filter(Boolean)));
 const numbers = Array.from(new Set([].concat(...candidates.map(phones))));
 const userKeys = Array.from(new Set([].concat(...candidates.map(userPks))));
 // Every score of 50 or more must share a phone, name or birthday (or a user_pk,
 // in an Excel import). Fetch complete evidence for those candidates, score
 // them, and only then apply the limit.
 if (!opts.partyPk && !names.length && !birthdays.length && !numbers.length && !userKeys.length) return [];
 const withUserPk = userKeys.length ? (await query.raw(`SELECT party_pk FROM (${USER_PKS_SQL}) pks WHERE pk = ANY(?)`, [userKeys])).rows.map(row => row.party_pk) : [];
 // A user_pk nobody has, and nothing else to match on: no candidates (an empty condition would match everyone).
 if (!opts.partyPk && !names.length && !birthdays.length && !numbers.length && !withUserPk.length) return [];
 const rows = await query('crm_party as party').join('crm_person as person', 'person.party_pk', 'party.party_pk')
 .whereIn('party.party_status', ['ACTIVE','INACTIVE'])
 .where(function () {
  if (opts.partyPk) { this.where('party.party_pk', opts.partyPk); return; }
  if (names.length) this.orWhereIn(query.raw("lower(trim(regexp_replace(person.full_name, '\\s+', ' ', 'g')))"), names);
  if (birthdays.length) this.orWhereIn('person.birth_date', birthdays);
  if (withUserPk.length) this.orWhereIn('party.party_pk', withUserPk);
  if (numbers.length) this.orWhereExists(function () {
   this.select(query.raw('1')).from('crm_contact_point as cp').whereRaw('cp.party_pk=party.party_pk')
    .where('cp.status','ACTIVE').whereIn('cp.contact_type',['MOBILE','PHONE'])
    .whereIn(query.raw("regexp_replace(cp.normalized_value, '[^0-9]', '', 'g')"), numbers);
  });
 })
 .select('party.party_pk','party.display_name','person.full_name','person.gender_code','person.birth_date','person.address_line','person.home_location_pk','person.job_title_id',
 query.raw(`COALESCE((SELECT json_agg(json_build_object('contact_type', c.contact_type, 'contact_value', c.contact_value)) FROM crm_contact_point c WHERE c.party_pk=party.party_pk AND c.status='ACTIVE' AND c.contact_type IN ('MOBILE','PHONE')), '[]') AS contacts`),
 query.raw(`COALESCE((SELECT array_agg(DISTINCT pks.pk) FROM (${USER_PKS_SQL}) pks WHERE pks.party_pk = party.party_pk), '{}') AS user_pks`));
 return rows;
}
function rank(candidate, rows, options) {
 const opts = options || {};
 return rows.filter(r => String(r.party_pk) !== String(opts.excludePartyId || ''))
 .map(r => Object.assign({}, r, score(candidate, r, opts)))
 .filter(r => r.score >= REVIEW_FROM).sort((a,b) => b.score-a.score || String(a.party_pk).localeCompare(String(b.party_pk)))
 .slice(0, opts.limit || rows.length).map(r => Object.assign({}, r, { mobile: r.contacts.length ? contact.mask(r.contacts[0].contact_value) : null, contacts: undefined }));
}
async function findSimilar(candidate, options) {
 return rank(candidate, await loadCandidates([candidate], options), options);
}
function sameInFile(a,b,options) { const match = score(a,b,options); return match.score >= REVIEW_FROM ? match : null; }
module.exports = { WEIGHTS, MERGE_FROM, REVIEW_FROM, score, userPks, findSimilar, sameInFile, phoneKey, createIndex, loadCandidates, rank };
