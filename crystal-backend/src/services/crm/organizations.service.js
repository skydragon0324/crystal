const db = require('../../config/db');
const audit = require('../audit.service');
const { transaction } = require('../../repositories/shared/transaction');
const { HttpError } = require('../../utils/response');

/**
 * ORGANIZATIONS - what kind of organization a party is, in which industries,
 * and which people act for it in which roles (design 6: crm_organization_type
 * _assignment, crm_organization_industry, crm_organization_person_relationship
 * and _role).
 *
 * A Crystal service-centre operator, a vendor sales agency, a media provider
 * and a business customer are all organization parties; the TYPE says which,
 * per project or Dream-wide. A person working for one is a relationship with
 * roles - owner, technician, finance contact - so the same person can be a
 * customer in their own right and a contact for their employer.
 */

const PAGE = '/admin/crm/customers';

async function requireType(partyId, type) {
  const party = await db('crm_party').where('party_id', partyId).first('party_type');
  if (!party) throw new HttpError(404, 'common.notFound');
  if (party.party_type !== type) throw new HttpError(409, type === 'ORGANIZATION' ? 'crm.onlyForOrganizations' : 'crm.onlyForPeople');
}

/** Everything organizational about one party, from either side. */
async function forParty(partyId) {
  const [types, industries, people, employers] = await Promise.all([
    db('crm_organization_type_assignment as a').join('crm_organization_type as t', 't.organization_type_id', 'a.organization_type_id')
      .leftJoin('crm_project as j', 'j.project_id', 'a.project_id')
      .where('a.organization_party_id', partyId).orderBy('a.assigned_at', 'desc')
      .select('a.*', 't.type_code', 't.type_name', 'j.project_code'),
    db('crm_organization_industry as oi').join('crm_industry as i', 'i.industry_id', 'oi.industry_id')
      .where('oi.organization_party_id', partyId).select('oi.*', 'i.industry_code', 'i.industry_name'),
    relationships().where('r.organization_party_id', partyId),
    relationships().where('r.person_party_id', partyId)
  ]);
  return { types: types, industries: industries, people: people, employers: employers };
}

function relationships() {
  return db('crm_organization_person_relationship as r')
    .join('crm_party as o', 'o.party_id', 'r.organization_party_id')
    .join('crm_party as p', 'p.party_id', 'r.person_party_id')
    .leftJoin('crm_project as j', 'j.project_id', 'r.project_id')
    .orderBy([{ column: 'r.relationship_status' }, { column: 'r.created_at', order: 'desc' }])
    .select('r.*', 'o.display_name as organization_name', 'o.party_no as organization_party_no',
      'p.display_name as person_name', 'p.party_no as person_party_no', 'j.project_code',
      db.raw(`(SELECT json_agg(json_build_object('role_code', cr.role_code, 'role_name', cr.role_name,
                                                 'department_name', x.department_name, 'is_primary', x.is_primary))
                 FROM crm_organization_person_role x JOIN crm_org_contact_role cr ON cr.contact_role_id = x.contact_role_id
                WHERE x.org_person_relationship_id = r.org_person_relationship_id
                  AND (x.valid_to IS NULL OR x.valid_to >= CURRENT_DATE)) AS roles`));
}

async function assignType(partyId, body, actor) {
  await requireType(partyId, 'ORGANIZATION');
  const [row] = await db('crm_organization_type_assignment').insert({
    organization_party_id: partyId,
    organization_type_id: body.organization_type_id,
    project_id: body.project_id || null
  }).returning('*');
  audit.created(actor, 'crm_organization_type_assignment', row.organization_type_assignment_id, row, PAGE);
  return row;
}

async function endType(partyId, assignmentId, actor) {
  const [row] = await db('crm_organization_type_assignment')
    .where({ organization_type_assignment_id: assignmentId, organization_party_id: partyId })
    .update({ status: 'ENDED', ended_at: db.fn.now() }).returning('*');
  if (!row) throw new HttpError(404, 'common.notFound');
  audit.updated(actor, 'crm_organization_type_assignment', assignmentId, null, row, PAGE);
  return row;
}

async function setIndustry(partyId, body, actor) {
  await requireType(partyId, 'ORGANIZATION');
  const row = await transaction(async function (trx) {
    if (body.is_primary) {
      await trx('crm_organization_industry').where('organization_party_id', partyId).update({ is_primary: false });
    }
    await trx.raw(`
      INSERT INTO crm_organization_industry (organization_party_id, industry_id, is_primary, valid_from)
      VALUES (?, ?, ?, CURRENT_DATE)
      ON CONFLICT (organization_party_id, industry_id) DO UPDATE SET is_primary = EXCLUDED.is_primary, valid_to = NULL`,
    [partyId, body.industry_id, !!body.is_primary]);
    return trx('crm_organization_industry').where({ organization_party_id: partyId, industry_id: body.industry_id }).first();
  });
  audit.updated(actor, 'crm_organization_industry', partyId + ':' + body.industry_id, null, row, PAGE);
  return row;
}

async function removeIndustry(partyId, industryId, actor) {
  const removed = await db('crm_organization_industry').where({ organization_party_id: partyId, industry_id: industryId }).del();
  if (!removed) throw new HttpError(404, 'common.notFound');
  audit.deleted(actor, 'crm_organization_industry', partyId + ':' + industryId, null, PAGE);
}

/** A person who acts for an organization, with the roles they hold there. */
async function addPerson(organizationId, body, actor) {
  await requireType(organizationId, 'ORGANIZATION');
  await requireType(body.person_party_id, 'PERSON');
  const roles = Array.isArray(body.contact_role_ids) ? body.contact_role_ids : (body.contact_role_ids ? [body.contact_role_ids] : []);

  const row = await transaction(async function (trx) {
    const [rel] = await trx('crm_organization_person_relationship').insert({
      organization_party_id: organizationId,
      person_party_id: body.person_party_id,
      project_id: body.project_id || null,
      valid_from: body.valid_from || trx.raw('CURRENT_DATE')
    }).returning('*');
    if (roles.length) {
      await trx('crm_organization_person_role').insert(roles.map(function (roleId, index) {
        return {
          org_person_relationship_id: rel.org_person_relationship_id,
          contact_role_id: roleId,
          department_name: body.department_name || null,
          is_primary: index === 0,
          valid_from: rel.valid_from
        };
      }));
    }
    return rel;
  });
  audit.created(actor, 'crm_organization_person_relationship', row.org_person_relationship_id, row, PAGE);
  return row;
}

async function endPerson(organizationId, relationshipId, actor) {
  const [row] = await db('crm_organization_person_relationship')
    .where({ org_person_relationship_id: relationshipId })
    .where(function () { this.where('organization_party_id', organizationId).orWhere('person_party_id', organizationId); })
    .update({ relationship_status: 'ENDED', valid_to: db.raw('CURRENT_DATE') }).returning('*');
  if (!row) throw new HttpError(404, 'common.notFound');
  await db('crm_organization_person_role').where('org_person_relationship_id', relationshipId).whereNull('valid_to')
    .update({ valid_to: db.raw('CURRENT_DATE') });
  audit.updated(actor, 'crm_organization_person_relationship', relationshipId, null, row, PAGE);
  return row;
}

module.exports = {
  forParty: forParty,
  assignType: assignType,
  endType: endType,
  setIndustry: setIndustry,
  removeIndustry: removeIndustry,
  addPerson: addPerson,
  endPerson: endPerson
};
