/**
 * A CUSTOMER'S ID IS ITS party_id - a 12-character code such as K7M3QX9TBD2H,
 * or the User ID an imported customer came with. crm_party.party_pk is the
 * internal row key and is never shown.
 *
 * Every search box that finds customers by name also finds them by id: the
 * whole id, any case, with or without a leading "#".
 */

const ID_FORMAT = /^[A-Za-z0-9_-]{1,32}$/;

/** True when `text` can be a party_id (the same rule as the column's CHECK). */
function isPartyId(text) {
  return ID_FORMAT.test(String(text === null || text === undefined ? '' : text));
}

/**
 * The id in a search text ("K7M3QX9TBD2H", "#k7m3qx9tbd2h", or the '%...%' of
 * an ilike), as an ilike pattern for the whole id: LIKE's own characters are
 * escaped, so "_" in an id matches only "_". Text that cannot be an id gives
 * '', which no party_id matches.
 */
function searchId(text) {
  const candidate = String(text === null || text === undefined ? '' : text).replace(/%/g, '').replace(/\\(.)/g, '$1').trim().replace(/^#/, '');
  if (!isPartyId(candidate)) return '';
  return candidate.replace(/[\\_%]/g, '\\$&');
}

/** A crm_party row as a client may see it: without party_pk, the internal key. */
function publicParty(row) {
  if (!row) return row;
  const copy = Object.assign({}, row);
  delete copy.party_pk;
  return copy;
}

module.exports = { ID_FORMAT: ID_FORMAT, isPartyId: isPartyId, searchId: searchId, publicParty: publicParty };
