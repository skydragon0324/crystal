const db = require('../../config/db');
const { HttpError } = require('../../utils/response');

/**
 * ONE PHONE NUMBER, ONE CUSTOMER.
 *
 * A customer may have many phone numbers, but a number belongs to one
 * customer only - person or organization. So:
 *   - a contact is never added to a customer when another live customer
 *     (ACTIVE or INACTIVE) already has that number (assertFree);
 *   - a registration carrying a number someone already has is merged into
 *     that customer only when it is clearly them (same name, 70 or more) and
 *     otherwise waits for an administrator (registrationIntake.submit);
 *   - an administrator may merge it into the number's owner, or create a new
 *     customer WITHOUT that number - never give the number to someone else.
 *
 * Numbers are compared by their digits, the way they are stored.
 */

const PHONE_TYPES = ['MOBILE', 'PHONE'];

function digitsOf(value) { return String(value == null ? '' : value).replace(/\D/g, ''); }

/** Every number a registration or a person carries, as digits. */
function numbersOf(data) {
  const list = [data.mobile, data.phone].concat((data.contacts || [])
    .filter(function (item) { return item && PHONE_TYPES.indexOf(String(item.contact_type || '').toUpperCase()) !== -1; })
    .map(function (item) { return item.contact_value; }));
  return Array.from(new Set(list.map(digitsOf).filter(Boolean)));
}

/**
 * The live customers who already have any of these numbers: one row per
 * (customer, number), with what an administrator needs to recognise them.
 */
async function find(trx, numbers, exceptPartyPk) {
  const wanted = Array.from(new Set((numbers || []).map(digitsOf).filter(Boolean)));
  if (!wanted.length) return [];
  const query = (trx || db)('crm_contact_point as cp').join('crm_party as party', 'party.party_pk', 'cp.party_pk')
    .leftJoin('crm_person as person', 'person.party_pk', 'party.party_pk')
    .where('cp.status', 'ACTIVE').whereIn('cp.contact_type', PHONE_TYPES)
    .whereIn('party.party_status', ['ACTIVE', 'INACTIVE'])
    .whereIn((trx || db).raw("regexp_replace(cp.normalized_value, '[^0-9]', '', 'g')"), wanted)
    .distinct('party.party_pk', 'party.display_name', 'party.party_type', 'person.full_name',
      (trx || db).raw("regexp_replace(cp.normalized_value, '[^0-9]', '', 'g') AS phone"));
  if (exceptPartyPk) query.whereNot('party.party_pk', exceptPartyPk);
  return query;
}

/** Refuses a number that is already another customer's; `field` names the form field to mark. */
async function assertFree(trx, partyPk, value, field) {
  const owners = await module.exports.find(trx, [value], partyPk);
  if (!owners.length) return;
  const customer = (owners[0].display_name || '') + ' #' + owners[0].party_pk;
  throw new HttpError(409, 'crm.customers.phoneBelongsToAnother',
    [{ field: field || 'contact_value', message: 'crm.customers.phoneBelongsToAnother', params: { customer: customer } }], { customer: customer });
}

/**
 * The registration without the numbers other customers already have - for
 * "create a new customer" on a registration whose number is taken. Returns
 * the cleaned data and the numbers left out.
 */
async function withoutTaken(trx, data, exceptPartyPk) {
  const owners = await module.exports.find(trx, numbersOf(data), exceptPartyPk);
  const taken = Array.from(new Set(owners.map(function (owner) { return owner.phone; })));
  if (!taken.length) return { data: data, left_out: [] };
  const free = function (value) { return taken.indexOf(digitsOf(value)) === -1; };
  const clean = Object.assign({}, data, {
    mobile: data.mobile && free(data.mobile) ? data.mobile : null,
    phone: data.phone && free(data.phone) ? data.phone : null,
    contacts: (data.contacts || []).filter(function (item) {
      return !item || PHONE_TYPES.indexOf(String(item.contact_type || '').toUpperCase()) === -1 || free(item.contact_value);
    })
  });
  return { data: clean, left_out: taken };
}

/**
 * Numbers more than one live customer has - left from before the rule, to be
 * merged or corrected by hand. One row per number, with its customers.
 */
async function shared() {
  const rows = await db.raw(`
    SELECT number.phone,
           json_agg(json_build_object('party_pk', party.party_pk::text, 'display_name', party.display_name, 'party_type', party.party_type)
                    ORDER BY party.party_pk) AS customers
      FROM (SELECT DISTINCT regexp_replace(cp.normalized_value, '[^0-9]', '', 'g') AS phone, cp.party_pk
              FROM crm_contact_point cp
             WHERE cp.status = 'ACTIVE' AND cp.contact_type IN ('MOBILE','PHONE')) number
      JOIN crm_party party ON party.party_pk = number.party_pk AND party.party_status IN ('ACTIVE','INACTIVE')
     WHERE number.phone <> ''
     GROUP BY number.phone
    HAVING count(*) > 1
     ORDER BY number.phone
     LIMIT 500`);
  return rows.rows;
}

module.exports = { PHONE_TYPES, digitsOf, numbersOf, find, assertFree, withoutTaken, shared };
