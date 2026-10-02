const db = require('../../config/db');
const { HttpError } = require('../../utils/response');
const { COUNTED_STATUSES } = require('./transactions.service');

/**
 * CUSTOMER 360 - the figures and cards at the top of the customer record.
 *
 * The record's tabs read the party's own rows (parties.service detail). This
 * adds what the header and the overview cards show, worked out here once
 * rather than in the browser:
 *
 *   header      grade and since when, lifetime spend, orders, products held,
 *               open cases - the five figures across the top
 *   value       lifetime value, average order, purchase frequency, each with
 *               its change against the year before, and twelve months of spend
 *   rfm         recency, frequency and monetary out of 100, from the parts of
 *               the corporate score the analysis wrote
 *   service     cases open and resolved, response and resolution times,
 *               satisfaction, and the cases of the last six months
 *   reach       the customer's contact points, which channels they agreed to,
 *               and the one they prefer
 *   people      relationships to other customers, the employers or the people
 *               of an organization, the group an organization belongs to
 *   the rest    tags, segments, accounts with their last activity, recent
 *               orders, products, interactions, campaigns, notes, the account
 *               team and the agreement in force
 *
 * An amount is in the reporting currency (crm_transaction.reporting_net_amount),
 * so spend in different projects adds up. Orders are transactions that count -
 * a cancelled order is not an order - and refunds reduce spend, not orders.
 */

const NOT_AN_ORDER = ['REFUND', 'RETURN', 'REVERSAL'];
const DAY = 86400000;

function percentChange(current, previous) {
  const now = Number(current || 0);
  const before = Number(previous || 0);
  if (!before) return now ? null : 0;
  return Math.round(((now - before) / before) * 1000) / 10;
}

function round(value, places) {
  if (value === null || value === undefined || value === '') return null;
  const factor = Math.pow(10, places || 0);
  return Math.round(Number(value) * factor) / factor;
}

/** Spend and orders of one party, as one query over their counted transactions. */
async function purchaseFacts(partyId) {
  const result = await db.raw(`
    WITH bought AS (
      SELECT x.transaction_id, x.transaction_type_code, x.transaction_at, x.project_id,
             COALESCE(x.reporting_net_amount, 0) AS amount
        FROM crm_transaction x
        JOIN crm_transaction_party tp ON tp.transaction_id = x.transaction_id
       WHERE tp.party_id = ? AND tp.party_role_code = 'BUYER'
         AND x.transaction_status IN (${COUNTED_STATUSES.map(function () { return '?'; }).join(', ')})
    )
    SELECT
      COALESCE(SUM(amount), 0) AS lifetime_spend,
      COALESCE(SUM(amount) FILTER (WHERE transaction_at > now() - interval '12 months'), 0) AS spend_12m,
      COALESCE(SUM(amount) FILTER (WHERE transaction_at <= now() - interval '12 months'
                                     AND transaction_at > now() - interval '24 months'), 0) AS spend_prev_12m,
      COUNT(*) FILTER (WHERE transaction_type_code NOT IN ('REFUND', 'RETURN', 'REVERSAL'))::int AS orders_total,
      COUNT(*) FILTER (WHERE transaction_type_code NOT IN ('REFUND', 'RETURN', 'REVERSAL')
                         AND transaction_at > now() - interval '12 months')::int AS orders_12m,
      COUNT(*) FILTER (WHERE transaction_type_code NOT IN ('REFUND', 'RETURN', 'REVERSAL')
                         AND transaction_at <= now() - interval '12 months' AND transaction_at > now() - interval '24 months')::int AS orders_prev_12m,
      COUNT(*) FILTER (WHERE transaction_type_code NOT IN ('REFUND', 'RETURN', 'REVERSAL')
                         AND transaction_at > now() - interval '24 months')::int AS orders_24m,
      COUNT(*) FILTER (WHERE transaction_type_code NOT IN ('REFUND', 'RETURN', 'REVERSAL')
                         AND transaction_at <= now() - interval '24 months' AND transaction_at > now() - interval '48 months')::int AS orders_prev_24m,
      MIN(transaction_at) AS first_order_at,
      MAX(transaction_at) FILTER (WHERE transaction_type_code NOT IN ('REFUND', 'RETURN', 'REVERSAL')) AS last_order_at
    FROM bought`, [partyId].concat(COUNTED_STATUSES));
  return result.rows[0];
}

/** Spend per calendar month for the last twelve months, oldest first, every month present. */
async function monthlySpend(partyId) {
  const result = await db.raw(`
    SELECT to_char(m.month, 'YYYY-MM') AS month, COALESCE(SUM(x.reporting_net_amount), 0) AS amount
      FROM generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') AS m(month)
      LEFT JOIN crm_transaction_party tp ON tp.party_id = ? AND tp.party_role_code = 'BUYER'
      LEFT JOIN crm_transaction x ON x.transaction_id = tp.transaction_id
            AND date_trunc('month', x.transaction_at) = m.month
            AND x.transaction_status IN (${COUNTED_STATUSES.map(function () { return '?'; }).join(', ')})
     GROUP BY m.month ORDER BY m.month`, [partyId].concat(COUNTED_STATUSES));
  return result.rows.map(function (row) { return { month: row.month, amount: round(row.amount, 2) }; });
}

/** Spend per calendar year, the last five years. */
async function yearlySpend(partyId) {
  const result = await db.raw(`
    SELECT y.year::int AS year, COALESCE(SUM(x.reporting_net_amount), 0) AS amount
      FROM generate_series(extract(year FROM now())::int - 4, extract(year FROM now())::int) AS y(year)
      LEFT JOIN crm_transaction_party tp ON tp.party_id = ? AND tp.party_role_code = 'BUYER'
      LEFT JOIN crm_transaction x ON x.transaction_id = tp.transaction_id
            AND extract(year FROM x.transaction_at)::int = y.year
            AND x.transaction_status IN (${COUNTED_STATUSES.map(function () { return '?'; }).join(', ')})
     GROUP BY y.year ORDER BY y.year`, [partyId].concat(COUNTED_STATUSES));
  return result.rows.map(function (row) { return { year: row.year, amount: round(row.amount, 2) }; });
}

/** Cases: counts, times, satisfaction, the last six months, and the latest few. */
async function serviceFacts(partyId) {
  const [totals, monthly, recent, interactions] = await Promise.all([
    db.raw(`
      SELECT COUNT(*)::int AS total_cases,
             COUNT(*) FILTER (WHERE NOT st.is_terminal)::int AS open_cases,
             COUNT(*) FILTER (WHERE st.status_code = 'CLOSED')::int AS resolved_cases,
             AVG(EXTRACT(EPOCH FROM (s.first_response_at - s.received_at)) / 3600)
               FILTER (WHERE s.first_response_at IS NOT NULL) AS avg_response_hours,
             AVG(EXTRACT(EPOCH FROM (s.closed_at - s.received_at)) / 86400)
               FILTER (WHERE s.closed_at IS NOT NULL) AS avg_resolution_days,
             AVG(s.satisfaction_rating) AS csat,
             COUNT(s.satisfaction_rating)::int AS csat_responses
        FROM crm_service_case s JOIN crm_service_status st ON st.service_status_id = s.service_status_id
       WHERE s.party_id = ?`, [partyId]).then(function (result) { return result.rows[0]; }),
    db.raw(`
      SELECT to_char(m.month, 'YYYY-MM') AS month,
             COUNT(s.case_id)::int AS opened,
             COUNT(s.case_id) FILTER (WHERE s.closed_at IS NOT NULL)::int AS resolved
        FROM generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') AS m(month)
        LEFT JOIN crm_service_case s ON s.party_id = ? AND date_trunc('month', s.received_at) = m.month
       GROUP BY m.month ORDER BY m.month`, [partyId]).then(function (result) { return result.rows; }),
    db('crm_service_case as s')
      .join('crm_service_case_type as ct', 'ct.case_type_id', 's.case_type_id')
      .join('crm_service_status as st', 'st.service_status_id', 's.service_status_id')
      .leftJoin('crm_service_location as l', 'l.service_location_id', 's.service_location_id')
      .where('s.party_id', partyId).orderBy('s.received_at', 'desc').limit(5)
      .select('s.case_id', 's.external_case_id', 's.title', 's.received_at', 's.closed_at', 's.reception_channel_code',
        'ct.display_name as case_type_name', 'st.status_code', 'st.display_name as status_name', 'st.is_terminal', 'l.location_name'),
    db('crm_party_interaction').where('party_id', partyId).count({ total: '*' }).first()
  ]);
  return {
    total_cases: totals.total_cases,
    open_cases: totals.open_cases,
    resolved_cases: totals.resolved_cases,
    total_interactions: Number(interactions.total) + totals.total_cases,
    avg_response_hours: round(totals.avg_response_hours, 1),
    avg_resolution_days: round(totals.avg_resolution_days, 1),
    csat: round(totals.csat, 1),
    csat_responses: totals.csat_responses,
    monthly: monthly,
    recent_cases: recent
  };
}

/**
 * Each project: the customer's account there if any, and when they last did
 * something in it - a purchase or a case. A project they have no account in
 * is listed as not linked, so the gap shows.
 */
async function accountsByProject(partyId) {
  const [projects, accounts, lastActivity] = await Promise.all([
    db('crm_project').where('status', 'ACTIVE').whereNot('project_code', 'PLATFORM').orderBy('project_id')
      .select('project_id', 'project_code', 'project_name'),
    db('crm_project_account').where('party_id', partyId).orderBy([{ column: 'unlinked_at', order: 'desc' }, { column: 'is_primary', order: 'desc' }]),
    db.raw(`
      SELECT project_id, MAX(at) AS last_activity_at FROM (
        SELECT x.project_id, x.transaction_at AS at FROM crm_transaction x
          JOIN crm_transaction_party tp ON tp.transaction_id = x.transaction_id WHERE tp.party_id = ?
        UNION ALL
        SELECT project_id, received_at FROM crm_service_case WHERE party_id = ?
      ) activity GROUP BY project_id`, [partyId, partyId]).then(function (result) { return result.rows; })
  ]);
  const lastOf = {};
  lastActivity.forEach(function (row) { lastOf[row.project_id] = row.last_activity_at; });

  const rows = [];
  projects.forEach(function (project) {
    const mine = accounts.filter(function (account) { return account.project_id === project.project_id; });
    const live = mine.filter(function (account) { return !account.unlinked_at; });
    const shown = live.length ? live : mine.slice(0, 1);
    if (!shown.length) {
      rows.push({ project_id: project.project_id, project_code: project.project_code, project_name: project.project_name,
        account_status: 'NOT_LINKED', last_activity_at: lastOf[project.project_id] || null });
      return;
    }
    shown.forEach(function (account) {
      rows.push({
        project_id: project.project_id, project_code: project.project_code, project_name: project.project_name,
        project_account_id: account.project_account_id, external_account_id: account.external_account_id,
        external_login: account.external_login,
        account_status: account.unlinked_at ? 'UNLINKED' : (account.is_primary ? 'PRIMARY' : 'LINKED'),
        first_used_at: account.source_created_at || account.linked_at,
        last_activity_at: lastOf[project.project_id] || null
      });
    });
  });
  return rows;
}

/** Relationships seen from this party: what each other party is to them. */
async function relationshipsOf(partyId) {
  const result = await db.raw(`
    SELECT r.party_relationship_id, r.status, r.valid_from, r.valid_to, r.note,
           r.related_party_id AS other_party_id, r.relationship_type_code AS type_code, 'OWN' AS side
      FROM crm_party_relationship r WHERE r.party_id = ?
    UNION ALL
    SELECT r.party_relationship_id, r.status, r.valid_from, r.valid_to, r.note,
           r.party_id, t.inverse_code, 'INVERSE'
      FROM crm_party_relationship r JOIN crm_party_relationship_type t ON t.relationship_type_code = r.relationship_type_code
     WHERE r.related_party_id = ?`, [partyId, partyId]);
  const rows = result.rows;
  if (!rows.length) return [];
  const [parties, types] = await Promise.all([
    db('crm_party').whereIn('party_id', rows.map(function (row) { return row.other_party_id; }))
      .select('party_id', 'party_no', 'display_name', 'party_type', 'party_status'),
    db('crm_party_relationship_type').select('relationship_type_code', 'relationship_name', 'is_hierarchy')
  ]);
  const partyOf = {};
  parties.forEach(function (party) { partyOf[party.party_id] = party; });
  const typeOf = {};
  types.forEach(function (type) { typeOf[type.relationship_type_code] = type; });
  return rows.map(function (row) {
    const other = partyOf[row.other_party_id] || {};
    return Object.assign(row, {
      relationship_name: (typeOf[row.type_code] || {}).relationship_name || row.type_code,
      other_party_no: other.party_no, other_name: other.display_name, other_party_type: other.party_type
    });
  }).sort(function (first, second) { return (first.status === 'ACTIVE' ? 0 : 1) - (second.status === 'ACTIVE' ? 0 : 1); });
}

/**
 * THE GROUP AN ORGANIZATION BELONGS TO: up the parent-company links to the
 * top, then everything under the top, with affiliates of this organization
 * beside it. A child-to-parent edge is either (child, parent, PARENT_COMPANY)
 * or (parent, child, SUBSIDIARY) - the same fact entered from either end.
 */
const EDGES = `
  SELECT party_id AS child_id, related_party_id AS parent_id FROM crm_party_relationship
   WHERE relationship_type_code = 'PARENT_COMPANY' AND status = 'ACTIVE'
  UNION
  SELECT related_party_id, party_id FROM crm_party_relationship
   WHERE relationship_type_code = 'SUBSIDIARY' AND status = 'ACTIVE'`;

async function hierarchyOf(partyId) {
  const up = await db.raw(`
    WITH RECURSIVE edges AS (${EDGES}),
    chain AS (
      SELECT ?::bigint AS party_id, 0 AS depth
      UNION
      SELECT e.parent_id, c.depth + 1 FROM chain c JOIN edges e ON e.child_id = c.party_id WHERE c.depth < 10
    )
    SELECT party_id FROM chain ORDER BY depth DESC LIMIT 1`, [partyId]);
  const rootId = up.rows.length ? up.rows[0].party_id : partyId;

  const down = await db.raw(`
    WITH RECURSIVE edges AS (${EDGES}),
    tree AS (
      SELECT ?::bigint AS party_id, NULL::bigint AS parent_id, 0 AS depth
      UNION
      SELECT e.child_id, e.parent_id, t.depth + 1 FROM tree t JOIN edges e ON e.parent_id = t.party_id WHERE t.depth < 10
    )
    SELECT t.party_id, t.parent_id, t.depth, p.party_no, p.display_name
      FROM tree t JOIN crm_party p ON p.party_id = t.party_id
     ORDER BY t.depth, p.display_name`, [rootId]);

  const affiliates = await db.raw(`
    SELECT CASE WHEN r.party_id = ? THEN r.related_party_id ELSE r.party_id END AS party_id, p.party_no, p.display_name
      FROM crm_party_relationship r
      JOIN crm_party p ON p.party_id = CASE WHEN r.party_id = ? THEN r.related_party_id ELSE r.party_id END
     WHERE r.relationship_type_code = 'AFFILIATE' AND r.status = 'ACTIVE' AND ? IN (r.party_id, r.related_party_id)`,
  [partyId, partyId, partyId]);

  return { root_party_id: rootId, nodes: down.rows, affiliates: affiliates.rows };
}

/** The people of an organization, each with their roles, title and how to reach them. */
async function keyContacts(partyId) {
  const people = await db('crm_organization_person_relationship as r')
    .join('crm_party as p', 'p.party_id', 'r.person_party_id')
    .leftJoin('crm_person as n', 'n.party_id', 'r.person_party_id')
    .where({ 'r.organization_party_id': partyId, 'r.relationship_status': 'ACTIVE' })
    .orderBy('r.created_at')
    .select('r.org_person_relationship_id', 'r.person_party_id', 'p.party_no', 'p.display_name', 'n.job_title');
  if (!people.length) return [];
  const ids = people.map(function (person) { return person.person_party_id; });
  const [roles, contacts] = await Promise.all([
    db('crm_organization_person_role as o').join('crm_org_contact_role as c', 'c.contact_role_id', 'o.contact_role_id')
      .whereIn('o.org_person_relationship_id', people.map(function (person) { return person.org_person_relationship_id; }))
      .whereNull('o.valid_to').select('o.org_person_relationship_id', 'o.is_primary', 'o.department_name', 'c.role_code', 'c.role_name'),
    db('crm_contact_point').whereIn('party_id', ids).where('status', 'ACTIVE').whereIn('contact_type', ['EMAIL', 'MOBILE', 'PHONE'])
      .orderBy([{ column: 'is_primary', order: 'desc' }, { column: 'contact_point_id' }]).select('party_id', 'contact_type', 'contact_value')
  ]);
  return people.map(function (person) {
    const mine = roles.filter(function (role) { return role.org_person_relationship_id === person.org_person_relationship_id; });
    const reach = function (types) {
      const hit = contacts.filter(function (contact) { return contact.party_id === person.person_party_id && types.indexOf(contact.contact_type) !== -1; })[0];
      return hit ? hit.contact_value : null;
    };
    return Object.assign(person, {
      roles: mine.map(function (role) { return { role_code: role.role_code, role_name: role.role_name }; }),
      is_primary: mine.some(function (role) { return role.is_primary; }),
      department_name: (mine[0] || {}).department_name || null,
      email: reach(['EMAIL']),
      phone: reach(['MOBILE', 'PHONE'])
    });
  }).sort(function (first, second) { return (second.is_primary ? 1 : 0) - (first.is_primary ? 1 : 0); });
}

/** Which channels the customer agreed to be contacted on, across purposes and projects. */
async function reachOf(partyId) {
  const [contacts, consents, channels] = await Promise.all([
    db('crm_contact_point').where({ party_id: partyId, status: 'ACTIVE' })
      .orderBy([{ column: 'is_primary', order: 'desc' }, { column: 'contact_point_id' }]),
    db('crm_party_communication_consent as c')
      .join('crm_project_communication_option as o', 'o.project_communication_option_id', 'c.project_communication_option_id')
      .join('crm_communication_channel as ch', 'ch.channel_id', 'o.channel_id')
      .where('c.party_id', partyId)
      .select('ch.channel_code', 'c.consent_status', 'c.is_preferred', 'c.captured_at'),
    db('crm_communication_channel').where('is_active', true).orderBy('channel_id').select('channel_code', 'channel_name')
  ]);
  const byChannel = channels.map(function (channel) {
    const mine = consents.filter(function (consent) { return consent.channel_code === channel.channel_code; });
    return {
      channel_code: channel.channel_code, channel_name: channel.channel_name,
      asked: mine.length > 0,
      granted: mine.some(function (consent) { return consent.consent_status === 'GRANTED'; })
    };
  });
  const preferred = consents.filter(function (consent) { return consent.is_preferred && consent.consent_status === 'GRANTED'; })[0]
    || consents.filter(function (consent) { return consent.consent_status === 'GRANTED'; })
      .sort(function (first, second) { return new Date(second.captured_at) - new Date(first.captured_at); })[0];
  const first = function (types) { return contacts.filter(function (contact) { return types.indexOf(contact.contact_type) !== -1; })[0] || null; };
  return {
    email: first(['EMAIL']),
    phone: first(['MOBILE', 'PHONE']),
    preferred_channel: preferred ? preferred.channel_code : null,
    consent_by_channel: byChannel
  };
}

/** The last campaigns that reached the customer, and how they answered. */
async function campaignHistory(partyId) {
  const result = await db.raw(`
    SELECT r.recipient_id, c.campaign_id, c.campaign_name, ch.channel_code, ch.channel_name,
           COALESCE(r.delivered_at, r.sent_at, r.created_at) AS at, r.recipient_status, r.skip_reason_code,
           EXISTS (SELECT 1 FROM crm_campaign_conversion v WHERE v.recipient_id = r.recipient_id) AS converted,
           EXISTS (SELECT 1 FROM crm_campaign_interaction i WHERE i.recipient_id = r.recipient_id AND i.interaction_type = 'CLICK') AS clicked,
           EXISTS (SELECT 1 FROM crm_campaign_interaction i WHERE i.recipient_id = r.recipient_id AND i.interaction_type = 'OPEN') AS opened
      FROM crm_campaign_recipient r
      JOIN crm_campaign c ON c.campaign_id = r.campaign_id
      JOIN crm_campaign_action a ON a.action_id = r.action_id
      JOIN crm_communication_channel ch ON ch.channel_id = a.channel_id
     WHERE r.party_id = ?
     ORDER BY at DESC LIMIT 8`, [partyId]);
  return result.rows.map(function (row) {
    let outcome = 'NOT_OPENED';
    if (row.recipient_status === 'SKIPPED') outcome = 'SKIPPED';
    else if (row.recipient_status === 'FAILED') outcome = 'FAILED';
    else if (row.recipient_status === 'ELIGIBLE' || row.recipient_status === 'QUEUED') outcome = 'NOT_SENT';
    else if (row.converted) outcome = 'PURCHASED';
    else if (row.clicked) outcome = 'CLICKED';
    else if (row.opened) outcome = 'OPENED';
    return Object.assign(row, { outcome: outcome });
  });
}

async function overview(partyId) {
  const party = await db('crm_party').where('party_id', partyId).first();
  if (!party) throw new HttpError(404, 'common.notFound');
  const isOrganization = party.party_type === 'ORGANIZATION';

  const [
    purchases, monthly, yearly, service, accounts, reach, relationships, campaigns, snapshots,
    tags, segments, recentOrders, products, interactions, notes, team, agreement, organization, extra
  ] = await Promise.all([
    purchaseFacts(partyId),
    monthlySpend(partyId),
    isOrganization ? yearlySpend(partyId) : Promise.resolve([]),
    serviceFacts(partyId),
    accountsByProject(partyId),
    reachOf(partyId),
    relationshipsOf(partyId),
    campaignHistory(partyId),
    db('crm_party_analysis_snapshot as s').leftJoin('crm_corporate_grade as g', 'g.corporate_grade_id', 's.corporate_grade_id')
      .where('s.party_id', partyId).whereNull('s.project_id').orderBy('s.reference_date', 'desc').limit(60)
      .select('s.reference_date', 's.corporate_score', 's.score_components', 's.activity_status', 's.registered_device_count',
        's.purchase_amount_lifetime', 'g.grade_code', 'g.grade_name'),
    db('crm_party_tag as pt').join('crm_tag as t', 't.tag_id', 'pt.tag_id').where('pt.party_id', partyId)
      .orderBy('pt.tagged_at').select('t.tag_id', 't.tag_code', 't.tag_name', 't.color_scheme', 'pt.tagged_at'),
    db('crm_segment_membership as m').join('crm_segment as s', 's.segment_id', 'm.segment_id')
      .where('m.party_id', partyId).whereNull('m.unmatched_at').where('s.status', 'ACTIVE')
      .orderBy('m.matched_at', 'desc').select('s.segment_id', 's.segment_name', 'm.matched_at'),
    db('crm_transaction as x').join('crm_transaction_party as tp', 'tp.transaction_id', 'x.transaction_id')
      .join('crm_project as j', 'j.project_id', 'x.project_id')
      .where({ 'tp.party_id': partyId, 'tp.party_role_code': 'BUYER' }).whereNotIn('x.transaction_type_code', NOT_AN_ORDER)
      .orderBy('x.transaction_at', 'desc').limit(5)
      .select('x.transaction_id', 'x.external_transaction_id', 'x.transaction_at', 'x.transaction_status', 'x.transaction_type_code',
        'x.net_amount', 'x.currency_code', 'x.reporting_net_amount', 'j.project_code', 'j.project_name',
        db.raw('EXISTS (SELECT 1 FROM crm_transaction r WHERE r.original_transaction_id = x.transaction_id) AS refunded')),
    db('crm_product_registration as r')
      .join('crm_product_instance as i', 'i.product_instance_id', 'r.product_instance_id')
      .join('crm_product_catalog as c', 'c.product_id', 'i.product_id')
      .join('crm_project as j', 'j.project_id', 'r.project_id')
      .leftJoin('crm_product_class as k', 'k.product_class_id', 'c.product_class_id')
      .where('r.party_id', partyId).whereNull('r.valid_to')
      .orderBy('r.valid_from', 'desc').limit(6)
      .select('r.product_registration_id', 'r.valid_from', 'i.product_instance_id', 'i.external_product_instance_id', 'i.serial_number',
        'i.imei', 'i.status as instance_status', 'c.product_name', 'k.class_code', 'k.product_domain', 'j.project_code', 'j.project_name'),
    db('crm_party_interaction as i').leftJoin('managers as m', 'm.id', 'i.manager_id')
      .leftJoin('crm_service_case as s', 's.case_id', 'i.case_id')
      .where('i.party_id', partyId).orderBy('i.occurred_at', 'desc').limit(5)
      .select('i.*', 'm.name as agent_name', 's.external_case_id'),
    db('crm_party_note as n').leftJoin('managers as m', 'm.id', 'n.created_by_manager_id')
      .where('n.party_id', partyId).whereNull('n.deleted_at')
      .orderBy([{ column: 'n.is_pinned', order: 'desc' }, { column: 'n.created_at', order: 'desc' }]).limit(3)
      .select('n.note_id', 'n.note_text', 'n.is_pinned', 'n.created_at', 'm.name as author_name'),
    db('crm_party_team_member as t').join('managers as m', 'm.id', 't.manager_id')
      .where('t.party_id', partyId).whereNull('t.ended_at').select('t.team_member_id', 't.team_role', 't.manager_id', 'm.name as manager_name'),
    db('crm_party_agreement').where('party_id', partyId)
      .orderByRaw("CASE status WHEN 'ACTIVE' THEN 0 WHEN 'DRAFT' THEN 1 ELSE 2 END, start_date DESC").first(),
    isOrganization
      ? db('crm_organization as o').leftJoin('crm_location as l', 'l.location_id', 'o.headquarters_location_id')
        .where('o.party_id', partyId).first('o.*', 'l.location_name as headquarters_location_name', 'l.full_name as headquarters_full_name')
      : db('crm_person as n').leftJoin('crm_location as l', 'l.location_id', 'n.home_location_id')
        .where('n.party_id', partyId).first('n.*', 'l.location_name as home_location_name', 'l.full_name as home_full_name'),
    isOrganization
      ? Promise.all([
        hierarchyOf(partyId),
        keyContacts(partyId),
        db('crm_organization_industry as oi').join('crm_industry as i', 'i.industry_id', 'oi.industry_id')
          .where('oi.organization_party_id', partyId).whereNull('oi.valid_to')
          .orderBy('oi.is_primary', 'desc').select('i.industry_id', 'i.industry_name', 'oi.is_primary'),
        db('crm_organization_type_assignment as a').join('crm_organization_type as t', 't.organization_type_id', 'a.organization_type_id')
          .where({ 'a.organization_party_id': partyId, 'a.status': 'ACTIVE' }).select('t.type_code', 't.type_name')
      ]).then(function (parts) { return { hierarchy: parts[0], key_contacts: parts[1], industries: parts[2], organization_types: parts[3] }; })
      : db('crm_organization_person_relationship as r').join('crm_party as p', 'p.party_id', 'r.organization_party_id')
        .where({ 'r.person_party_id': partyId, 'r.relationship_status': 'ACTIVE' })
        .select('r.org_person_relationship_id', 'p.party_id', 'p.party_no', 'p.display_name')
        .then(function (employers) { return { employers: employers }; })
  ]);

  const latest = snapshots[0] || null;
  /* The grade is held "since" the oldest run in the unbroken stretch of runs that gave this grade. */
  let gradeSince = null;
  if (latest && latest.grade_code) {
    for (let position = 0; position < snapshots.length && snapshots[position].grade_code === latest.grade_code; position += 1) {
      gradeSince = snapshots[position].reference_date;
    }
  }

  const components = latest && latest.score_components
    ? (typeof latest.score_components === 'string' ? JSON.parse(latest.score_components) : latest.score_components) : null;
  const rfm = components ? (function () {
    const recency = Math.round((Number(components.recency || 0) / 15) * 100);
    const frequency = Math.round((Number(components.frequency || 0) / 15) * 100);
    const monetary = Math.round((Number(components.value || 0) / 40) * 100);
    return { score: Math.round((recency + frequency + monetary) / 3), recency: recency, frequency: frequency, monetary: monetary };
  }()) : null;

  const lifetime = Number(purchases.lifetime_spend);
  const yearsActive = purchases.first_order_at
    ? Math.max(1, (Date.now() - new Date(purchases.first_order_at).getTime()) / (365 * DAY)) : null;
  const averageOrder = purchases.orders_total ? lifetime / purchases.orders_total : null;
  const averageOrder12m = purchases.orders_12m ? Number(purchases.spend_12m) / purchases.orders_12m : null;
  const averageOrderBefore = purchases.orders_prev_12m ? Number(purchases.spend_prev_12m) / purchases.orders_prev_12m : null;

  const relatedPeople = relationships.slice();
  if (!isOrganization) {
    (extra.employers || []).forEach(function (employer) {
      relatedPeople.push({ party_relationship_id: 'employer-' + employer.org_person_relationship_id, status: 'ACTIVE',
        other_party_id: employer.party_id, other_party_no: employer.party_no, other_name: employer.display_name,
        other_party_type: 'ORGANIZATION', type_code: 'EMPLOYER', relationship_name: 'Employer', side: 'EMPLOYMENT' });
    });
  }

  return Object.assign({
    party_id: party.party_id,
    party_type: party.party_type,
    profile: organization || null,
    header: {
      grade_code: latest ? latest.grade_code : null,
      grade_name: latest ? latest.grade_name : null,
      grade_since: gradeSince,
      corporate_score: latest ? latest.corporate_score : null,
      activity_status: latest ? latest.activity_status : null,
      reference_date: latest ? latest.reference_date : null,
      lifetime_spend: round(lifetime, 2),
      orders_total: purchases.orders_total,
      orders_12m: purchases.orders_12m,
      orders_24m: purchases.orders_24m,
      products_registered: products.length === 6
        ? await db('crm_product_registration').where('party_id', partyId).whereNull('valid_to').count({ total: '*' }).first()
          .then(function (row) { return Number(row.total); })
        : products.length,
      open_cases: service.open_cases,
      total_cases: service.total_cases
    },
    value: {
      lifetime_value: round(lifetime, 2),
      spend_12m: round(purchases.spend_12m, 2),
      spend_trend_pct: percentChange(purchases.spend_12m, purchases.spend_prev_12m),
      average_order_value: round(averageOrder, 2),
      average_order_trend_pct: percentChange(averageOrder12m, averageOrderBefore),
      purchase_frequency_per_year: yearsActive ? round(purchases.orders_total / yearsActive, 1) : null,
      frequency_trend_pct: percentChange(purchases.orders_12m, purchases.orders_prev_12m),
      orders_24m: purchases.orders_24m,
      orders_24m_trend_pct: percentChange(purchases.orders_24m, purchases.orders_prev_24m),
      last_order_at: purchases.last_order_at,
      monthly: monthly,
      yearly: yearly
    },
    rfm: rfm,
    service: service,
    reach: reach,
    accounts: accounts,
    recent_orders: recentOrders,
    products: products,
    interactions: interactions,
    campaigns: campaigns,
    segments: segments,
    tags: tags,
    relationships: relatedPeople,
    notes: notes,
    team: team,
    agreement: agreement || null,
    score_history: snapshots.slice(0, 24).reverse().map(function (row) {
      return { reference_date: row.reference_date, corporate_score: row.corporate_score, grade_code: row.grade_code };
    })
  }, isOrganization ? {
    hierarchy: extra.hierarchy,
    key_contacts: extra.key_contacts,
    industries: extra.industries,
    organization_types: extra.organization_types,
    projects_active: accounts.filter(function (account) {
      /* Active: something happened there in the last year, whether or not an account is linked yet. */
      return account.last_activity_at && Date.now() - new Date(account.last_activity_at).getTime() < 365 * DAY;
    }).length,
    projects_total: accounts.length
  } : {});
}

module.exports = { overview: overview, relationshipsOf: relationshipsOf, hierarchyOf: hierarchyOf, EDGES: EDGES };
