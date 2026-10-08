const db = require('../../config/db');
const { HttpError } = require('../../utils/response');
const locations = require('./locations');
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
      SELECT txn.transaction_id, txn.transaction_type_code, txn.transaction_at, txn.project_id,
             COALESCE(txn.reporting_net_amount, 0) AS amount
        FROM crm_transaction txn
        JOIN crm_transaction_party tp ON tp.transaction_id = txn.transaction_id
       WHERE tp.party_pk = ? AND tp.party_role_code = 'BUYER'
         AND txn.transaction_status IN (${COUNTED_STATUSES.map(function () { return '?'; }).join(', ')})
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
    SELECT to_char(calendar.month, 'YYYY-MM') AS month, COALESCE(SUM(txn.reporting_net_amount), 0) AS amount
      FROM generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') AS calendar(month)
      LEFT JOIN crm_transaction_party tp ON tp.party_pk = ? AND tp.party_role_code = 'BUYER'
      LEFT JOIN crm_transaction txn ON txn.transaction_id = tp.transaction_id
            AND date_trunc('month', txn.transaction_at) = calendar.month
            AND txn.transaction_status IN (${COUNTED_STATUSES.map(function () { return '?'; }).join(', ')})
     GROUP BY calendar.month ORDER BY calendar.month`, [partyId].concat(COUNTED_STATUSES));
  return result.rows.map(function (row) { return { month: row.month, amount: round(row.amount, 2) }; });
}

/** Spend per calendar year, the last five years. */
async function yearlySpend(partyId) {
  const result = await db.raw(`
    SELECT calendar.year::int AS year, COALESCE(SUM(txn.reporting_net_amount), 0) AS amount
      FROM generate_series(extract(year FROM now())::int - 4, extract(year FROM now())::int) AS calendar(year)
      LEFT JOIN crm_transaction_party tp ON tp.party_pk = ? AND tp.party_role_code = 'BUYER'
      LEFT JOIN crm_transaction txn ON txn.transaction_id = tp.transaction_id
            AND extract(year FROM txn.transaction_at)::int = calendar.year
            AND txn.transaction_status IN (${COUNTED_STATUSES.map(function () { return '?'; }).join(', ')})
     GROUP BY calendar.year ORDER BY calendar.year`, [partyId].concat(COUNTED_STATUSES));
  return result.rows.map(function (row) { return { year: row.year, amount: round(row.amount, 2) }; });
}

/** Cases: counts, times, satisfaction, the last six months, and the latest few. */
async function serviceFacts(partyId) {
  const [totals, monthly, recent, interactions] = await Promise.all([
    db.raw(`
      SELECT COUNT(*)::int AS total_cases,
             COUNT(*) FILTER (WHERE NOT st.is_terminal)::int AS open_cases,
             COUNT(*) FILTER (WHERE st.status_code = 'CLOSED')::int AS resolved_cases,
             AVG(EXTRACT(EPOCH FROM (service_case.first_response_at - service_case.received_at)) / 3600)
               FILTER (WHERE service_case.first_response_at IS NOT NULL) AS avg_response_hours,
             AVG(EXTRACT(EPOCH FROM (service_case.closed_at - service_case.received_at)) / 86400)
               FILTER (WHERE service_case.closed_at IS NOT NULL) AS avg_resolution_days,
             AVG(service_case.satisfaction_rating) AS csat,
             COUNT(service_case.satisfaction_rating)::int AS csat_responses
        FROM crm_service_case service_case JOIN crm_service_status st ON st.service_status_id = service_case.service_status_id
       WHERE service_case.party_pk = ?`, [partyId]).then(function (result) { return result.rows[0]; }),
    db.raw(`
      SELECT to_char(calendar.month, 'YYYY-MM') AS month,
             COUNT(service_case.case_id)::int AS opened,
             COUNT(service_case.case_id) FILTER (WHERE service_case.closed_at IS NOT NULL)::int AS resolved
        FROM generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') AS calendar(month)
        LEFT JOIN crm_service_case service_case ON service_case.party_pk = ? AND date_trunc('month', service_case.received_at) = calendar.month
       GROUP BY calendar.month ORDER BY calendar.month`, [partyId]).then(function (result) { return result.rows; }),
    db('crm_service_case as service_case')
      .join('crm_service_case_type as ct', 'ct.case_type_id', 'service_case.case_type_id')
      .join('crm_service_status as st', 'st.service_status_id', 'service_case.service_status_id')
      .leftJoin('crm_service_center as center', 'center.service_center_id', 'service_case.service_center_id')
      .where('service_case.party_pk', partyId).orderBy('service_case.received_at', 'desc').limit(5)
      .select('service_case.case_id', 'service_case.external_case_id', 'service_case.title', 'service_case.received_at',
        'service_case.closed_at', 'service_case.reception_channel_code',
        'ct.display_name as case_type_name', 'st.status_code', 'st.display_name as status_name', 'st.is_terminal', 'center.service_center_name'),
    db('crm_party_interaction').where('party_pk', partyId).count({ total: '*' }).first()
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
    db('crm_project_account').where('party_pk', partyId).orderBy([{ column: 'unlinked_at', order: 'desc' }, { column: 'is_primary', order: 'desc' }]),
    db.raw(`
      SELECT project_id, MAX(at) AS last_activity_at FROM (
        SELECT txn.project_id, txn.transaction_at AS at FROM crm_transaction txn
          JOIN crm_transaction_party tp ON tp.transaction_id = txn.transaction_id WHERE tp.party_pk = ?
        UNION ALL
        SELECT project_id, received_at FROM crm_service_case WHERE party_pk = ?
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
    SELECT relationship.party_relationship_id, relationship.status, relationship.valid_from, relationship.valid_to, relationship.note,
           relationship.related_party_pk AS other_party_pk, relationship.relationship_type_code AS type_code, 'OWN' AS side
      FROM crm_party_relationship relationship WHERE relationship.party_pk = ?
    UNION ALL
    SELECT relationship.party_relationship_id, relationship.status, relationship.valid_from, relationship.valid_to, relationship.note,
           relationship.party_pk, relationship_type.inverse_code, 'INVERSE'
      FROM crm_party_relationship relationship
      JOIN crm_party_relationship_type relationship_type ON relationship_type.relationship_type_code = relationship.relationship_type_code
     WHERE relationship.related_party_pk = ?`, [partyId, partyId]);
  const rows = result.rows;
  if (!rows.length) return [];
  const [parties, types] = await Promise.all([
    db('crm_party').whereIn('party_pk', rows.map(function (row) { return row.other_party_pk; }))
      .select('party_pk', 'display_name', 'party_type', 'party_status'),
    db('crm_party_relationship_type').select('relationship_type_code', 'relationship_name', 'is_hierarchy')
  ]);
  const partyOf = {};
  parties.forEach(function (party) { partyOf[party.party_pk] = party; });
  const typeOf = {};
  types.forEach(function (type) { typeOf[type.relationship_type_code] = type; });
  return rows.map(function (row) {
    const other = partyOf[row.other_party_pk] || {};
    return Object.assign(row, {
      relationship_name: (typeOf[row.type_code] || {}).relationship_name || row.type_code,
      other_name: other.display_name, other_party_type: other.party_type
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
  SELECT party_pk AS child_id, related_party_pk AS parent_id FROM crm_party_relationship
   WHERE relationship_type_code = 'PARENT_COMPANY' AND status = 'ACTIVE'
  UNION
  SELECT related_party_pk, party_pk FROM crm_party_relationship
   WHERE relationship_type_code = 'SUBSIDIARY' AND status = 'ACTIVE'`;

async function hierarchyOf(partyId) {
  const up = await db.raw(`
    WITH RECURSIVE edges AS (${EDGES}),
    chain AS (
      SELECT ?::bigint AS party_pk, 0 AS depth
      UNION
      SELECT edge.parent_id, link.depth + 1 FROM chain link JOIN edges edge ON edge.child_id = link.party_pk WHERE link.depth < 10
    )
    SELECT party_pk FROM chain ORDER BY depth DESC LIMIT 1`, [partyId]);
  const rootId = up.rows.length ? up.rows[0].party_pk : partyId;

  const down = await db.raw(`
    WITH RECURSIVE edges AS (${EDGES}),
    tree AS (
      SELECT ?::bigint AS party_pk, NULL::bigint AS parent_id, 0 AS depth
      UNION
      SELECT edge.child_id, edge.parent_id, node.depth + 1 FROM tree node JOIN edges edge ON edge.parent_id = node.party_pk WHERE node.depth < 10
    )
    SELECT node.party_pk, node.parent_id, node.depth, party.display_name
      FROM tree node JOIN crm_party party ON party.party_pk = node.party_pk
     ORDER BY node.depth, party.display_name`, [rootId]);

  const affiliates = await db.raw(`
    SELECT CASE WHEN relationship.party_pk = ? THEN relationship.related_party_pk ELSE relationship.party_pk END AS party_pk,
           party.display_name
      FROM crm_party_relationship relationship
      JOIN crm_party party ON party.party_pk = CASE WHEN relationship.party_pk = ? THEN relationship.related_party_pk ELSE relationship.party_pk END
     WHERE relationship.relationship_type_code = 'AFFILIATE' AND relationship.status = 'ACTIVE'
       AND ? IN (relationship.party_pk, relationship.related_party_pk)`,
  [partyId, partyId, partyId]);

  return { root_party_pk: rootId, nodes: down.rows, affiliates: affiliates.rows };
}

/** The people of an organization, each with their roles, title and how to reach them. */
async function keyContacts(partyId) {
  const people = await db('crm_organization_person_relationship as relationship')
    .join('crm_party as party', 'party.party_pk', 'relationship.person_party_pk')
    .leftJoin('crm_person as person', 'person.party_pk', 'relationship.person_party_pk')
    .leftJoin('crm_job_title as jt', 'jt.job_title_id', 'person.job_title_id')
    .where({ 'relationship.organization_party_pk': partyId, 'relationship.relationship_status': 'ACTIVE' })
    .orderBy('relationship.created_at')
    .select('relationship.org_person_relationship_id', 'relationship.person_party_pk', 'party.party_pk', 'party.display_name',
      'jt.job_name as job_title_name');
  if (!people.length) return [];
  const ids = people.map(function (person) { return person.person_party_pk; });
  const [roles, contacts] = await Promise.all([
    db('crm_organization_person_role as person_role').join('crm_org_contact_role as contact_role', 'contact_role.contact_role_id', 'person_role.contact_role_id')
      .whereIn('person_role.org_person_relationship_id', people.map(function (person) { return person.org_person_relationship_id; }))
      .whereNull('person_role.valid_to').select('person_role.org_person_relationship_id', 'person_role.is_primary',
        'person_role.department_name', 'contact_role.role_code', 'contact_role.role_name'),
    db('crm_contact_point').whereIn('party_pk', ids).where('status', 'ACTIVE').whereIn('contact_type', ['EMAIL', 'MOBILE', 'PHONE'])
      .orderBy([{ column: 'is_primary', order: 'desc' }, { column: 'contact_point_id' }]).select('party_pk', 'contact_type', 'contact_value')
  ]);
  return people.map(function (person) {
    const mine = roles.filter(function (role) { return role.org_person_relationship_id === person.org_person_relationship_id; });
    const reach = function (types) {
      const hit = contacts.filter(function (contact) { return contact.party_pk === person.person_party_pk && types.indexOf(contact.contact_type) !== -1; })[0];
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
    db('crm_contact_point').where({ party_pk: partyId, status: 'ACTIVE' })
      .orderBy([{ column: 'is_primary', order: 'desc' }, { column: 'contact_point_id' }]),
    db('crm_party_communication_consent as consent')
      .join('crm_project_communication_option as communication_option', 'communication_option.project_communication_option_id',
        'consent.project_communication_option_id')
      .join('crm_communication_channel as ch', 'ch.channel_id', 'communication_option.channel_id')
      .where('consent.party_pk', partyId)
      .select('ch.channel_code', 'consent.consent_status', 'consent.is_preferred', 'consent.captured_at'),
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
  const every = function (types) { return contacts.filter(function (contact) { return types.indexOf(contact.contact_type) !== -1; }); };
  return {
    email: first(['EMAIL']),
    phone: first(['MOBILE', 'PHONE']),
    /* Every active phone and email, primary first: a merged customer keeps the numbers of both records. */
    phones: every(['MOBILE', 'PHONE']),
    emails: every(['EMAIL']),
    preferred_channel: preferred ? preferred.channel_code : null,
    consent_by_channel: byChannel
  };
}

/** The last campaigns that reached the customer, and how they answered. */
async function campaignHistory(partyId) {
  const result = await db.raw(`
    SELECT recipient.recipient_id, campaign.campaign_id, campaign.campaign_name, ch.channel_code, ch.channel_name,
           COALESCE(recipient.delivered_at, recipient.sent_at, recipient.created_at) AS at, recipient.recipient_status, recipient.skip_reason_code,
           EXISTS (SELECT 1 FROM crm_campaign_conversion conversion
                    WHERE conversion.recipient_id = recipient.recipient_id) AS converted,
           EXISTS (SELECT 1 FROM crm_campaign_interaction interaction
                    WHERE interaction.recipient_id = recipient.recipient_id AND interaction.interaction_type = 'CLICK') AS clicked,
           EXISTS (SELECT 1 FROM crm_campaign_interaction interaction
                    WHERE interaction.recipient_id = recipient.recipient_id AND interaction.interaction_type = 'OPEN') AS opened
      FROM crm_campaign_recipient recipient
      JOIN crm_campaign campaign ON campaign.campaign_id = recipient.campaign_id
      JOIN crm_campaign_action campaign_action ON campaign_action.action_id = recipient.action_id
      JOIN crm_communication_channel ch ON ch.channel_id = campaign_action.channel_id
     WHERE recipient.party_pk = ?
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
  const party = await db('crm_party').where('party_pk', partyId).first();
  if (!party) throw new HttpError(404, 'common.notFound');
  const isOrganization = party.party_type === 'ORGANIZATION';
  /* A grade a manager set by hand, with who set it; it stands in for the computed grade below. */
  const assigned = party.assigned_grade_id ? await db('crm_corporate_grade').where('corporate_grade_id', party.assigned_grade_id)
    .first('corporate_grade_id', 'grade_code', 'grade_name') : null;
  if (assigned && party.assigned_grade_by_manager_id) {
    const manager = await db('managers').where('id', party.assigned_grade_by_manager_id).first('name');
    assigned.manager_name = manager ? manager.name : null;
  }

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
    db('crm_party_analysis_snapshot as snapshot').leftJoin('crm_corporate_grade as grade', 'grade.corporate_grade_id', 'snapshot.corporate_grade_id')
      .where('snapshot.party_pk', partyId).whereNull('snapshot.project_id').orderBy('snapshot.reference_date', 'desc').limit(60)
      .select('snapshot.reference_date', 'snapshot.corporate_score', 'snapshot.score_components', 'snapshot.activity_status',
        'snapshot.registered_device_count', 'snapshot.purchase_amount_lifetime', 'grade.grade_code', 'grade.grade_name'),
    db('crm_party_tag as pt').join('crm_tag as tag', 'tag.tag_id', 'pt.tag_id').where('pt.party_pk', partyId)
      .orderBy('pt.tagged_at').select('tag.tag_id', 'tag.tag_code', 'tag.tag_name', 'tag.color_scheme', 'pt.tagged_at'),
    db('crm_segment_membership as membership').join('crm_segment as segment', 'segment.segment_id', 'membership.segment_id')
      .where('membership.party_pk', partyId).whereNull('membership.unmatched_at').where('segment.status', 'ACTIVE')
      .orderBy('membership.matched_at', 'desc').select('segment.segment_id', 'segment.segment_name', 'membership.matched_at'),
    db('crm_transaction as txn').join('crm_transaction_party as tp', 'tp.transaction_id', 'txn.transaction_id')
      .join('crm_project as project', 'project.project_id', 'txn.project_id')
      .where({ 'tp.party_pk': partyId, 'tp.party_role_code': 'BUYER' }).whereNotIn('txn.transaction_type_code', NOT_AN_ORDER)
      .orderBy('txn.transaction_at', 'desc').limit(5)
      .select('txn.transaction_id', 'txn.external_transaction_id', 'txn.transaction_at', 'txn.transaction_status', 'txn.transaction_type_code',
        'txn.net_amount', 'txn.currency_code', 'txn.reporting_net_amount', 'project.project_code', 'project.project_name',
        db.raw('EXISTS (SELECT 1 FROM crm_transaction refund WHERE refund.original_transaction_id = txn.transaction_id) AS refunded')),
    db('crm_product_registration as registration')
      .join('crm_product_instance as instance', 'instance.product_instance_id', 'registration.product_instance_id')
      .join('crm_product_catalog as catalog', 'catalog.product_id', 'instance.product_id')
      .join('crm_project as project', 'project.project_id', 'registration.project_id')
      .leftJoin('crm_product_class as product_class', 'product_class.product_class_id', 'catalog.product_class_id')
      .where('registration.party_pk', partyId).whereNull('registration.valid_to')
      .orderBy('registration.valid_from', 'desc').limit(6)
      .select('registration.product_registration_id', 'registration.valid_from', 'instance.product_instance_id',
        'instance.external_product_instance_id', 'instance.serial_number', 'instance.imei', 'instance.status as instance_status',
        'catalog.product_name', 'product_class.class_code', 'product_class.product_domain', 'project.project_code', 'project.project_name'),
    db('crm_party_interaction as interaction').leftJoin('managers as manager', 'manager.id', 'interaction.manager_id')
      .leftJoin('crm_service_case as service_case', 'service_case.case_id', 'interaction.case_id')
      .where('interaction.party_pk', partyId).orderBy('interaction.occurred_at', 'desc').limit(5)
      .select('interaction.*', 'manager.name as agent_name', 'service_case.external_case_id'),
    db('crm_party_note as note').leftJoin('managers as manager', 'manager.id', 'note.created_by_manager_id')
      .where('note.party_pk', partyId).whereNull('note.deleted_at')
      .orderBy([{ column: 'note.is_pinned', order: 'desc' }, { column: 'note.created_at', order: 'desc' }]).limit(3)
      .select('note.note_id', 'note.note_text', 'note.is_pinned', 'note.created_at', 'manager.name as author_name'),
    db('crm_party_team_member as team_member').join('managers as manager', 'manager.id', 'team_member.manager_id')
      .where('team_member.party_pk', partyId).whereNull('team_member.ended_at')
      .select('team_member.team_member_id', 'team_member.team_role', 'team_member.manager_id', 'manager.name as manager_name'),
    db('crm_party_agreement').where('party_pk', partyId)
      .orderByRaw("CASE status WHEN 'ACTIVE' THEN 0 WHEN 'DRAFT' THEN 1 ELSE 2 END, start_date DESC").first(),
    isOrganization
      ? db('crm_organization as organization').leftJoin('crm_location as place', 'place.location_pk', 'organization.location_pk')
        .where('organization.party_pk', partyId)
        .first('organization.*', 'place.location_name', db.raw(locations.fullNameOf('organization.location_pk') + ' AS location_full_name'))
      : db('crm_person as person').leftJoin('crm_location as place', 'place.location_pk', 'person.home_location_pk')
        .leftJoin('crm_job_title as jt', 'jt.job_title_id', 'person.job_title_id')
        .where('person.party_pk', partyId).first('person.*', 'place.location_name as home_location_name',
          db.raw(locations.fullNameOf('person.home_location_pk') + ' AS home_full_name'), 'jt.job_name as job_title_name'),
    isOrganization
      ? Promise.all([
        hierarchyOf(partyId),
        keyContacts(partyId),
        db('crm_organization_industry as oi').join('crm_industry as industry', 'industry.industry_id', 'oi.industry_id')
          .where('oi.organization_party_pk', partyId).whereNull('oi.valid_to')
          .orderBy('oi.is_primary', 'desc').select('industry.industry_id', 'industry.industry_name', 'oi.is_primary'),
        db('crm_organization_type_assignment as assignment')
          .join('crm_organization_type as organization_type', 'organization_type.organization_type_id', 'assignment.organization_type_id')
          .where({ 'assignment.organization_party_pk': partyId, 'assignment.status': 'ACTIVE' })
          .select('organization_type.type_code', 'organization_type.type_name')
      ]).then(function (parts) { return { hierarchy: parts[0], key_contacts: parts[1], industries: parts[2], organization_types: parts[3] }; })
      : db('crm_organization_person_relationship as relationship').join('crm_party as employer', 'employer.party_pk', 'relationship.organization_party_pk')
        .where({ 'relationship.person_party_pk': partyId, 'relationship.relationship_status': 'ACTIVE' })
        .select('relationship.org_person_relationship_id', 'employer.party_pk', 'employer.party_pk', 'employer.display_name')
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
        other_party_pk: employer.party_pk, other_name: employer.display_name,
        other_party_type: 'ORGANIZATION', type_code: 'EMPLOYER', relationship_name: 'Employer', side: 'EMPLOYMENT' });
    });
  }

  return Object.assign({
    party_pk: party.party_pk,
    party_type: party.party_type,
    profile: organization || null,
    header: {
      grade_code: assigned ? assigned.grade_code : latest ? latest.grade_code : null,
      grade_name: assigned ? assigned.grade_name : latest ? latest.grade_name : null,
      grade_since: assigned ? party.assigned_grade_at : gradeSince,
      grade_assigned: !!assigned,
      assigned_grade_id: assigned ? assigned.corporate_grade_id : null,
      assigned_grade_reason: assigned ? party.assigned_grade_reason : null,
      assigned_grade_by: assigned ? assigned.manager_name : null,
      computed_grade_code: latest ? latest.grade_code : null,
      computed_grade_name: latest ? latest.grade_name : null,
      corporate_score: latest ? latest.corporate_score : null,
      activity_status: latest ? latest.activity_status : null,
      reference_date: latest ? latest.reference_date : null,
      lifetime_spend: round(lifetime, 2),
      orders_total: purchases.orders_total,
      orders_12m: purchases.orders_12m,
      orders_24m: purchases.orders_24m,
      products_registered: products.length === 6
        ? await db('crm_product_registration').where('party_pk', partyId).whereNull('valid_to').count({ total: '*' }).first()
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
