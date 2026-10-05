const db = require('../../config/db');
const audit = require('../audit.service');
const { HttpError } = require('../../utils/response');
const { EDGES } = require('./customer360.service');

/**
 * HOW CUSTOMERS ARE RELATED, AND THE LABELS ON THEM.
 *
 * A relationship row (A, B, T) reads "B is the T of A": (John, Mary, SPOUSE),
 * (Acme Manufacturing, Acme Holdings, PARENT_COMPANY). Each type names its
 * inverse, so the same row reads from Mary's record as "John is my spouse"
 * and from Acme Holdings' as "Acme Manufacturing is my subsidiary" - one fact,
 * stored once, readable from both ends.
 *
 * A type says which kind of party it joins: a spouse is between people, a
 * parent company between organizations, a referral between anyone.
 *
 * The parent-company links make a tree - the group an organization belongs
 * to - so one that would make a company its own ancestor is refused.
 *
 * Tags are labels staff put on a customer from a list kept in CRM basic data.
 */

const PAGE = '/admin/crm/customers';

async function requireParty(id) {
  const party = await db('crm_party').where('party_pk', id).first('party_pk', 'party_type', 'party_status', 'display_name');
  if (!party) throw new HttpError(404, 'common.notFound');
  return party;
}

/** Would making `parentId` the parent of `childId` close a loop? */
async function wouldLoop(childId, parentId) {
  if (String(childId) === String(parentId)) return true;
  const result = await db.raw(`
    WITH RECURSIVE edges AS (${EDGES}),
    below AS (
      SELECT ?::bigint AS party_pk, 0 AS depth
      UNION
      SELECT edge.child_id, below_row.depth + 1 FROM below below_row JOIN edges edge ON edge.parent_id = below_row.party_pk WHERE below_row.depth < 20
    )
    SELECT 1 FROM below WHERE party_pk = ? LIMIT 1`, [childId, parentId]);
  return result.rows.length > 0;
}

async function add(partyId, body, actor) {
  const party = await requireParty(partyId);
  if (!body.related_party_pk) throw new HttpError(400, 'crm.chooseTheRelatedCustomer');
  const related = await requireParty(body.related_party_pk);
  if (String(party.party_pk) === String(related.party_pk)) throw new HttpError(409, 'crm.aCustomerCannotBeRelatedToThemselves');

  const type = await db('crm_party_relationship_type').where({ relationship_type_code: body.relationship_type_code, is_active: true }).first();
  if (!type) throw new HttpError(400, 'crm.chooseARelationship');
  if (type.applies_to !== 'ANY' && (party.party_type !== type.applies_to || related.party_type !== type.applies_to)) {
    throw new HttpError(409, 'crm.thatRelationshipIsNotForThem', null, { relationship: type.relationship_name });
  }

  /* Parent company: related is the parent of party. Subsidiary: party is the parent of related. */
  if (type.relationship_type_code === 'PARENT_COMPANY' && await wouldLoop(party.party_pk, related.party_pk)) {
    throw new HttpError(409, 'crm.thatWouldMakeACircle');
  }
  if (type.relationship_type_code === 'SUBSIDIARY' && await wouldLoop(related.party_pk, party.party_pk)) {
    throw new HttpError(409, 'crm.thatWouldMakeACircle');
  }

  /* The same fact entered from the other end is already there. */
  const already = await db('crm_party_relationship').where('status', 'ACTIVE').where(function () {
    this.where({ party_pk: party.party_pk, related_party_pk: related.party_pk, relationship_type_code: type.relationship_type_code })
      .orWhere({ party_pk: related.party_pk, related_party_pk: party.party_pk, relationship_type_code: type.inverse_code });
  }).first();
  if (already) throw new HttpError(409, 'crm.theyAreAlreadyRelatedThatWay');

  const [row] = await db('crm_party_relationship').insert({
    party_pk: party.party_pk,
    related_party_pk: related.party_pk,
    relationship_type_code: type.relationship_type_code,
    valid_from: body.valid_from || db.raw('CURRENT_DATE'),
    note: body.note ? String(body.note).slice(0, 255) : null,
    created_by_manager_id: actor.manager_id
  }).returning('*');
  audit.created(actor, 'crm_party_relationship', row.party_relationship_id, row, PAGE);
  return row;
}

async function end(partyId, relationshipId, actor) {
  const before = await db('crm_party_relationship').where('party_relationship_id', relationshipId)
    .where(function () { this.where('party_pk', partyId).orWhere('related_party_pk', partyId); }).first();
  if (!before) throw new HttpError(404, 'common.notFound');
  if (before.status !== 'ACTIVE') throw new HttpError(409, 'crm.thatRelationshipHasEnded');
  const [after] = await db('crm_party_relationship').where('party_relationship_id', relationshipId)
    .update({ status: 'ENDED', valid_to: db.raw('GREATEST(CURRENT_DATE, COALESCE(valid_from, CURRENT_DATE))'), updated_at: db.fn.now() })
    .returning('*');
  audit.updated(actor, 'crm_party_relationship', relationshipId, before, after, PAGE);
  return after;
}

/* ------------------------------------------------------------ tags */

async function addTag(partyId, body, actor) {
  await requireParty(partyId);
  const tag = await db('crm_tag').where({ tag_id: body.tag_id || null, is_active: true }).first();
  if (!tag) throw new HttpError(400, 'crm.chooseATag');
  await db('crm_party_tag').insert({ party_pk: partyId, tag_id: tag.tag_id, tagged_by_manager_id: actor.manager_id })
    .onConflict(['party_pk', 'tag_id']).ignore();
  audit.created(actor, 'crm_party_tag', partyId + ':' + tag.tag_id, { party_pk: partyId, tag_code: tag.tag_code }, PAGE);
  return tag;
}

async function removeTag(partyId, tagId, actor) {
  const removed = await db('crm_party_tag').where({ party_pk: partyId, tag_id: tagId }).del();
  if (!removed) throw new HttpError(404, 'common.notFound');
  audit.deleted(actor, 'crm_party_tag', partyId + ':' + tagId, null, PAGE);
}

module.exports = { add: add, end: end, addTag: addTag, removeTag: removeTag, wouldLoop: wouldLoop };
