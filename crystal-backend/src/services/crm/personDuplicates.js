const db = require('../../config/db');
const contact = require('./contact');
const WEIGHTS = { phone: 40, name: 25, birth_date: 25, address: 15, occupation: 5 };
function textKey(value) { return String(value == null ? '' : value).trim().replace(/\s+/g, ' ').toLowerCase(); }
function phoneKey(value) { return contact.normalise('MOBILE', value).replace(/\D/g, ''); }
function dateKey(value) { return value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10); }
function phones(value) { return [value.mobile, value.phone].concat((value.contacts || []).filter(c => ['MOBILE','PHONE'].includes(c.contact_type)).map(c => c.contact_value)).map(phoneKey).filter(Boolean); }
function score(first, second) {
 const evidence = [];
 const add = (key, a, b) => { if (a && b && a === b) evidence.push({ field: key, points: WEIGHTS[key] }); };
 if (phones(first).some(p => phones(second).includes(p))) evidence.push({ field: 'phone', points: 40 });
 add('name', textKey(first.full_name || first.display_name), textKey(second.full_name || second.display_name));
 add('birth_date', dateKey(first.birth_date), dateKey(second.birth_date));
 // A shared town alone is not a shared home address.
 const address = v => v.address_line ? textKey(v.address_line) + '|' + textKey(v.home_location_pk) : '';
 add('address', address(first), address(second));
 add('occupation', textKey(first.job_title_id || first.occupation), textKey(second.job_title_id || second.occupation));
 const points = evidence.reduce((total, item) => total + item.points, 0);
 return { score: points, evidence, rule_code: 'WEIGHTED_PERSON', reason: evidence.map(e => e.field + ' +' + e.points).join(', '), decision: points >= 70 ? 'MERGE' : points > 40 ? 'REVIEW' : 'NEW' };
}
async function findSimilar(candidate, options) {
 const opts = options || {}; const query = opts.trx || db;
 const name = textKey(candidate.full_name || candidate.display_name);
 const birthday = dateKey(candidate.birth_date);
 const numbers = phones(candidate);
 // Every score above 40 must share a phone, name or birthday. Fetch complete
 // evidence for those candidates, score them, and only then apply the limit.
 if (!name && !birthday && !numbers.length) return [];
 const rows = await query('crm_party as party').join('crm_person as person', 'person.party_pk', 'party.party_pk')
 .whereIn('party.party_status', ['ACTIVE','INACTIVE'])
 .where(function () {
  if (name) this.orWhereRaw("lower(trim(regexp_replace(person.full_name, '\\s+', ' ', 'g'))) = ?", [name]);
  if (birthday) this.orWhere('person.birth_date', birthday);
  if (numbers.length) this.orWhereExists(function () {
   this.select(query.raw('1')).from('crm_contact_point as cp').whereRaw('cp.party_pk=party.party_pk')
    .where('cp.status','ACTIVE').whereIn('cp.contact_type',['MOBILE','PHONE'])
    .whereIn(query.raw("regexp_replace(cp.normalized_value, '[^0-9]', '', 'g')"), numbers);
  });
 })
 .select('party.party_pk','party.display_name','person.full_name','person.birth_date','person.address_line','person.home_location_pk','person.job_title_id',
 query.raw(`COALESCE((SELECT json_agg(json_build_object('contact_type', c.contact_type, 'contact_value', c.contact_value)) FROM crm_contact_point c WHERE c.party_pk=party.party_pk AND c.status='ACTIVE' AND c.contact_type IN ('MOBILE','PHONE')), '[]') AS contacts`));
 return rows.filter(r => String(r.party_pk) !== String(opts.excludePartyId || ''))
 .map(r => Object.assign({}, r, score(candidate, r)))
 .filter(r => r.score > 40).sort((a,b) => b.score-a.score || String(a.party_pk).localeCompare(String(b.party_pk)))
 .slice(0, opts.limit || rows.length).map(r => Object.assign({}, r, { mobile: r.contacts.length ? contact.mask(r.contacts[0].contact_value) : null, contacts: undefined }));
}
function sameInFile(a,b) { const match = score(a,b); return match.score > 40 ? match : null; }
module.exports = { WEIGHTS, score, findSimilar, sameInFile, phoneKey };
