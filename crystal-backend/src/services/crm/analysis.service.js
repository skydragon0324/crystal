const db = require('../../config/db');

/**
 * Figures the CRM derives rather than records.
 *
 * Each is REBUILT from the rows it summarises, never incremented: a counter
 * that is bumped on every registration drifts the first time a registration
 * is corrected by hand, and the vendor's per-user counter columns
 * (uclass_phone_values, uclass_eprod_values) are exactly the kind of number
 * nobody trusts any more. A rebuild is always right about the moment it ran.
 */

/**
 * HOW MANY PRODUCTS OF EACH CLASS A PARTY HOLDS, and has ever registered.
 *
 * One row per party and class - which is what replaces a column per class -
 * and every class ROLLS UP into its parents: a PHONE_9 is also a SMARTPHONE,
 * so an event for "anyone who owns a smartphone" does not have to know the
 * four phone classes by name.
 *
 * Only ownership counts (OWNER, LICENSEE). A phone a company has assigned to
 * an employee is the company's phone.
 */
async function recalculateClassStats(options) {
  const connection = (options && options.db) || db;
  const partyIds = options && options.partyIds;

  return connection.transaction(async function (trx) {
    const scope = partyIds && partyIds.length
      ? 'AND registration.party_pk IN (' + partyIds.map(function () { return '?'; }).join(', ') + ')'
      : '';
    const bindings = partyIds && partyIds.length ? partyIds : [];

    if (partyIds && partyIds.length) {
      await trx('crm_party_product_class_stat').whereIn('party_pk', partyIds).del();
    } else {
      await trx('crm_party_product_class_stat').del();
    }

    const result = await trx.raw(`
      WITH RECURSIVE lineage AS (
        SELECT product_class_id AS class_id, product_class_id AS ancestor_id
          FROM crm_product_class
        UNION ALL
        SELECT lineage.class_id, product_class.parent_product_class_id
          FROM lineage
          JOIN crm_product_class product_class ON product_class.product_class_id = lineage.ancestor_id
         WHERE product_class.parent_product_class_id IS NOT NULL
      ),
      held AS (
        SELECT registration.party_pk, catalog.product_class_id, registration.valid_to, registration.registered_at
          FROM crm_product_registration registration
          JOIN crm_product_instance instance ON instance.product_instance_id = registration.product_instance_id
          JOIN crm_product_catalog  catalog  ON catalog.product_id = instance.product_id
          JOIN crm_party            party    ON party.party_pk = registration.party_pk
         WHERE registration.relationship_code IN ('OWNER', 'LICENSEE')
           AND registration.registration_status <> 'CANCELLED'
           AND catalog.product_class_id IS NOT NULL
           AND party.party_status IN ('ACTIVE', 'INACTIVE')
           ${scope}
      )
      INSERT INTO crm_party_product_class_stat
        (party_pk, product_class_id, active_owned_count, lifetime_registered_count, last_registered_at, calculated_at)
      SELECT held.party_pk, lineage.ancestor_id,
             COUNT(*) FILTER (WHERE held.valid_to IS NULL),
             COUNT(*),
             MAX(held.registered_at),
             now()
        FROM held
        JOIN lineage ON lineage.class_id = held.product_class_id
       GROUP BY held.party_pk, lineage.ancestor_id
    `, bindings);

    return { rows: result.rowCount };
  });
}

/** The front page of the CRM: one read of the numbers that say whether it is alive. */
async function overview() {
  const one = function (sql, bindings) {
    return db.raw(sql, bindings || []).then(function (result) { return result.rows[0] || {}; });
  };

  const [parties, holdings, cases, points, events, sites, marketing, byProject, byClass, recentActivity] = await Promise.all([
    one(`SELECT COUNT(*) FILTER (WHERE party_status = 'ACTIVE')::int AS active,
                COUNT(*) FILTER (WHERE party_type = 'PERSON' AND party_status = 'ACTIVE')::int AS persons,
                COUNT(*) FILTER (WHERE party_type = 'ORGANIZATION' AND party_status = 'ACTIVE')::int AS organizations,
                COUNT(*) FILTER (WHERE party_status = 'MERGED')::int AS merged,
                COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days')::int AS new_30d,
                (SELECT COUNT(*) FROM crm_identity_match_candidate WHERE match_status = 'PENDING')::int AS duplicates
           FROM crm_party`),
    one(`SELECT COUNT(*) FILTER (WHERE valid_to IS NULL)::int AS current,
                COUNT(*) FILTER (WHERE registered_at >= now() - interval '30 days')::int AS new_30d,
                (SELECT COUNT(*) FROM crm_product_transfer WHERE status IN ('REQUESTED', 'ACCEPTED'))::int AS open_transfers
           FROM crm_product_registration`),
    one(`SELECT COUNT(*) FILTER (WHERE NOT st.is_terminal)::int AS open,
                COUNT(*) FILTER (WHERE NOT st.is_terminal AND service_case.due_at < now())::int AS overdue,
                COUNT(*) FILTER (WHERE service_case.received_at >= now() - interval '30 days')::int AS new_30d,
                ROUND(AVG(service_case.satisfaction_rating) FILTER (WHERE service_case.received_at >= now() - interval '90 days'), 2) AS csat_90d
           FROM crm_service_case service_case JOIN crm_service_status st ON st.service_status_id = service_case.service_status_id`),
    one(`SELECT COALESCE(SUM(balance), 0) AS outstanding,
                (SELECT COALESCE(SUM(points_delta), 0) FROM crm_point_event
                  WHERE points_delta > 0 AND occurred_at >= now() - interval '30 days') AS earned_30d,
                (SELECT COALESCE(-SUM(points_delta), 0) FROM crm_point_event
                  WHERE points_delta < 0 AND occurred_at >= now() - interval '30 days') AS spent_30d,
                (SELECT COUNT(*) FROM v_crm_point_account_drift)::int AS drifted
           FROM crm_point_account`),
    one(`SELECT COUNT(*) FILTER (WHERE status IN ('TARGETS_FROZEN', 'OPEN'))::int AS running,
                COUNT(*) FILTER (WHERE status IN ('DRAFT', 'APPROVED'))::int AS preparing,
                (SELECT COUNT(*) FROM crm_activity_reservation WHERE status IN ('RESERVED', 'PAID'))::int AS reservations_open,
                (SELECT COUNT(*) FROM crm_activity_award WHERE status IN ('PENDING', 'READY', 'DISPATCHED'))::int AS awards_open
           FROM crm_event`),
    one(`SELECT COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active,
                (SELECT COUNT(*) FROM crm_service_center_activity
                  WHERE status = 'COMPLETED' AND occurred_at >= now() - interval '30 days')::int AS activities_30d,
                (SELECT COUNT(*) FROM crm_service_center_event
                  WHERE status IN ('PLANNED', 'CONFIRMED') AND planned_start_at >= now())::int AS events_ahead
           FROM crm_service_center`),
    one(`SELECT (SELECT COUNT(*) FROM crm_segment WHERE status = 'ACTIVE')::int AS segments,
                (SELECT COUNT(*) FROM crm_campaign WHERE campaign_status IN ('APPROVED', 'ACTIVE'))::int AS campaigns_live`),
    db.raw(`SELECT project.project_code, project.project_name,
                   COUNT(DISTINCT account.party_pk) FILTER (WHERE account.unlinked_at IS NULL)::int AS parties
              FROM crm_project project
              LEFT JOIN crm_project_account account ON account.project_id = project.project_id
             GROUP BY project.project_id ORDER BY project.project_id`).then(function (result) { return result.rows; }),
    db.raw(`SELECT product_class.class_code, product_class.class_name, product_class.product_domain,
                   COALESCE(SUM(class_stat.active_owned_count), 0)::int AS owned,
                   COUNT(class_stat.party_pk) FILTER (WHERE class_stat.active_owned_count > 0)::int AS owners
              FROM crm_product_class product_class
              LEFT JOIN crm_party_product_class_stat class_stat ON class_stat.product_class_id = product_class.product_class_id
             WHERE product_class.parent_product_class_id IS NULL
             GROUP BY product_class.product_class_id ORDER BY product_class.product_class_id`).then(function (result) { return result.rows; }),
    db.raw(`SELECT activity_type.activity_code, activity_type.activity_name, COUNT(*)::int AS cnt
              FROM crm_service_center_activity activity
              JOIN crm_service_center_activity_type activity_type ON activity_type.activity_type_id = activity.activity_type_id
             WHERE activity.status = 'COMPLETED' AND activity.occurred_at >= now() - interval '30 days'
             GROUP BY activity_type.activity_type_id ORDER BY cnt DESC LIMIT 8`).then(function (result) { return result.rows; })
  ]);

  return {
    parties: parties,
    holdings: holdings,
    cases: cases,
    points: points,
    events: events,
    sites: sites,
    marketing: marketing,
    by_project: byProject,
    by_class: byClass,
    recent_activity: recentActivity
  };
}

module.exports = {
  recalculateClassStats: recalculateClassStats,
  overview: overview
};
