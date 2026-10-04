const db = require('../../config/db');
const contact = require('./contact');

/**
 * IS THIS PERSON ALREADY A CUSTOMER?
 *
 * Asked before a person is created - from the console's "new customer" form
 * and for every row of an Excel import - so the same human is not added
 * twice. One function answers it for both, so the two can never disagree.
 *
 * THE RULES BELOW ARE A PLACEHOLDER. The owner of the CRM is writing the real
 * matching logic; when it arrives it replaces the body of `findSimilar` and
 * nothing else changes: callers only rely on the shape of what comes back.
 *
 * Today a person is "similar" to an existing ACTIVE or INACTIVE person when
 *   SAME_MOBILE         the mobile is the same number (the last 10 digits
 *                       agree, so "+86 138 0013 8000" and "13800138000" meet)
 *   SAME_NAME_BIRTHDAY  the full name (case and spacing ignored) and the
 *                       birthday are the same
 *
 * Returns [{ party_id, display_name, mobile, birth_date, rule_code,
 *            score, reason }], best match first, at most `limit`.
 */

const RULES = {
  SAME_MOBILE: { score: 0.9, reason: 'Same mobile number' },
  SAME_NAME_BIRTHDAY: { score: 0.85, reason: 'Same name and birthday' }
};

/** The part of a phone number two spellings of it share. */
function phoneKey(value) {
  const digits = contact.normalise('MOBILE', value).replace('+', '');
  return digits.length >= 7 ? digits.slice(-10) : '';
}

/** A name as two people typing it would agree on. */
function nameKey(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** A birthday as YYYY-MM-DD, or '' when there is none. */
function dateKey(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

async function findSimilar(candidate, options) {
  const opts = options || {};
  const query = opts.trx || db;
  const limit = opts.limit || 5;
  const found = {};

  const add = function (rows, ruleCode) {
    rows.forEach(function (row) {
      if (opts.excludePartyId && String(row.party_id) === String(opts.excludePartyId)) return;
      const rule = RULES[ruleCode];
      const existing = found[row.party_id];
      if (existing && existing.score >= rule.score) return;
      found[row.party_id] = Object.assign({}, row, { rule_code: ruleCode, score: rule.score, reason: rule.reason });
    });
  };

  const base = function () {
    return query('crm_party as party')
      .join('crm_person as person', 'person.party_id', 'party.party_id')
      .whereIn('party.party_status', ['ACTIVE', 'INACTIVE'])
      .select('party.party_id', 'party.party_id', 'party.display_name', 'person.birth_date',
        query.raw(`(SELECT contact.contact_value FROM crm_contact_point contact
                 WHERE contact.party_id = party.party_id AND contact.contact_type = 'MOBILE' AND contact.status = 'ACTIVE'
                 ORDER BY contact.is_primary DESC, contact.contact_point_id LIMIT 1) AS mobile`))
      .limit(limit);
  };

  const mobile = phoneKey(candidate.mobile);
  if (mobile) {
    add(await base().whereExists(function () {
      this.select(query.raw(1)).from('crm_contact_point as contact')
        .whereRaw('contact.party_id = party.party_id')
        .whereIn('contact.contact_type', ['MOBILE', 'PHONE'])
        .where('contact.status', 'ACTIVE')
        .whereRaw("right(replace(contact.normalized_value, '+', ''), 10) = ?", [mobile]);
    }), 'SAME_MOBILE');
  }

  const name = nameKey(candidate.full_name);
  const birthday = dateKey(candidate.birth_date);
  if (name && birthday) {
    add(await base()
      .whereRaw("lower(regexp_replace(trim(person.full_name), '\\s+', ' ', 'g')) = ?", [name])
      .where('person.birth_date', birthday), 'SAME_NAME_BIRTHDAY');
  }

  return Object.keys(found).map(function (key) { return found[key]; })
    .sort(function (left, right) { return right.score - left.score || String(left.party_id).localeCompare(String(right.party_id)); })
    .slice(0, limit)
    .map(function (row) {
      return Object.assign({}, row, {
        mobile: row.mobile ? contact.mask(row.mobile) : null,
        birth_date: dateKey(row.birth_date) || null
      });
    });
}

/**
 * The same question asked of two rows in one import file, which the database
 * cannot answer because neither is saved yet. Same keys as above.
 */
function sameInFile(first, second) {
  const mobileA = phoneKey(first.mobile);
  if (mobileA && mobileA === phoneKey(second.mobile)) return 'SAME_MOBILE';
  const nameA = nameKey(first.full_name);
  const dayA = dateKey(first.birth_date);
  if (nameA && dayA && nameA === nameKey(second.full_name) && dayA === dateKey(second.birth_date)) return 'SAME_NAME_BIRTHDAY';
  return null;
}

module.exports = {
  RULES: RULES,
  findSimilar: findSimilar,
  sameInFile: sameInFile,
  phoneKey: phoneKey
};
