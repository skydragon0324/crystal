// Phase 1 uses the numeric party_pk in API payloads, URLs and relationships.
const ID_FORMAT = /^[1-9][0-9]*$/;
function isPartyId(value) { return ID_FORMAT.test(String(value == null ? '' : value)); }
function searchId(value) { const key = String(value || '').replace(/%/g, '').trim().replace(/^#/, ''); return isPartyId(key) ? key : ''; }
function publicParty(row) { if (!row) return row; const result = Object.assign({}, row); delete result.party_id; return result; }
module.exports = { ID_FORMAT, isPartyId, searchId, publicParty };
