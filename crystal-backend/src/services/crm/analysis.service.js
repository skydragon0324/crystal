const db = require('../../config/db');
const transactions = require('./transactions.service');

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

/*
 * EACH CUSTOMER'S LATEST DREAM-WIDE SNAPSHOT, in one pass. The overview counts
 * customers exactly as the customer list filters them - active and inactive
 * parties, the latest snapshot, a grade set by hand standing in for the
 * computed one - so a figure here and the list it opens always agree.
 */
const LATEST = `latest AS (
    SELECT DISTINCT ON (snapshot.party_pk) snapshot.party_pk, snapshot.corporate_grade_id, snapshot.activity_status
      FROM crm_party_analysis_snapshot snapshot
     WHERE snapshot.project_id IS NULL
     ORDER BY snapshot.party_pk, snapshot.reference_date DESC)`;

/* Named bindings throughout (:pid, :days); casts are written CAST(...) because "::" reads as a binding. */
const PID = 'CAST(:pid AS int)';
const START = 'now() - make_interval(days => CAST(:days AS int))';
const PRIOR = 'now() - make_interval(days => CAST(:days AS int) * 2)';
const JOINED = 'COALESCE(party.first_seen_at, party.created_at)';
const RETURNS = `('REFUND', 'RETURN', 'REVERSAL')`;

/*
 * WHO DEALS WITH A PROJECT: an account in it, or a product, a service case or
 * a purchase there. An account alone would leave the product projects empty -
 * people own phones and televisions without holding a login in those systems.
 */
const DEALINGS = `dealings AS (
    SELECT party_pk, project_id FROM crm_project_account WHERE unlinked_at IS NULL
    UNION SELECT party_pk, project_id FROM crm_product_registration
    UNION SELECT party_pk, project_id FROM crm_service_case
    UNION SELECT buyer.party_pk, sale.project_id FROM crm_transaction sale
            JOIN crm_transaction_party buyer ON buyer.transaction_id = sale.transaction_id AND buyer.party_role_code = 'BUYER')`;

/** A customer, as the customer list counts one - narrowed, when a project is chosen, to those who deal with it. */
const CUSTOMER = `party.party_status IN ('ACTIVE', 'INACTIVE')
  AND (${PID} IS NULL OR EXISTS (SELECT 1 FROM dealings scope WHERE scope.party_pk = party.party_pk AND scope.project_id = ${PID}))`;

/** Rows of the chosen project, or every project's when none is chosen. */
function inProject(column) { return `(${PID} IS NULL OR ${column} = ${PID})`; }

/** The last `count` calendar months or weeks, this one included. */
const UNITS = { month: 12, week: 12 };
function buckets(unit) {
  return `buckets AS (SELECT generate_series(date_trunc('${unit}', now()) - interval '${UNITS[unit] - 1} ${unit}',
                                              date_trunc('${unit}', now()), interval '1 ${unit}') AS bucket)`;
}

const PERIODS = [7, 30, 90, 365];

/**
 * THE FRONT PAGE OF THE CRM: the business, its customers, the work waiting and
 * the health of every project's data, for a period and optionally one project.
 *
 * Each headline figure comes with the same figure one period earlier, so the
 * page can say how it moved: a count of things that happen (transactions, new
 * cases, people reached) against the period before; a count of things held
 * (customers, products, memberships) against what was held when the period began.
 *
 * Transactions are counted the way the analysis counts them - counted
 * statuses, refunds left out - so a figure here and a customer's spend agree.
 */
async function overview(options) {
  const days = PERIODS.indexOf(Number(options && options.days)) !== -1 ? Number(options.days) : 30;
  const pid = /^[1-9][0-9]*$/.test(String((options && options.project_id) || '')) ? Number(options.project_id) : null;
  const bind = { days: days, pid: pid };
  const counted = '(' + transactions.COUNTED_STATUSES.map(function (status) { return "'" + status.replace(/[^A-Z_]/g, '') + "'"; }).join(', ') + ')';
  const SALE = `sale.transaction_status IN ${counted} AND sale.transaction_type_code NOT IN ${RETURNS} AND ${inProject('sale.project_id')}`;

  const one = function (sql) { return db.raw(sql, bind).then(function (result) { return result.rows[0] || {}; }); };
  const all = function (sql) { return db.raw(sql, bind).then(function (result) { return result.rows; }); };

  const trend = function (unit) {
    return Promise.all([
      all(`WITH ${DEALINGS}, ${buckets(unit)}
           SELECT to_char(bucket, 'YYYY-MM-DD') AS bucket,
                  (SELECT COUNT(*) FROM crm_party party WHERE ${CUSTOMER} AND ${JOINED} < bucket + interval '1 ${unit}')::int AS customers,
                  (SELECT COUNT(*) FROM crm_service_case service_case
                    WHERE ${inProject('service_case.project_id')} AND date_trunc('${unit}', service_case.received_at) = bucket)::int AS received,
                  (SELECT COUNT(*) FROM crm_service_case service_case
                    WHERE ${inProject('service_case.project_id')} AND date_trunc('${unit}', service_case.closed_at) = bucket)::int AS closed
             FROM buckets ORDER BY bucket`),
      all(`WITH ${buckets(unit)}
           SELECT to_char(bucket, 'YYYY-MM-DD') AS bucket, sale.project_id, COUNT(*)::int AS transactions
             FROM buckets JOIN crm_transaction sale ON date_trunc('${unit}', sale.transaction_at) = bucket
            WHERE ${SALE}
            GROUP BY bucket, sale.project_id ORDER BY bucket`)
    ]).then(function (results) { return { series: results[0], transactions: results[1] }; });
  };

  const [kpis, monthly, weekly, projects, grades, activity, attention, recent] = await Promise.all([
    one(`WITH ${DEALINGS}
         SELECT
           (SELECT COUNT(*) FROM crm_party party WHERE ${CUSTOMER})::int AS customers,
           (SELECT COUNT(*) FROM crm_party party WHERE ${CUSTOMER} AND ${JOINED} < ${START})::int AS customers_prior,
           (SELECT COUNT(*) FROM crm_transaction sale WHERE ${SALE} AND sale.transaction_at >= ${START})::int AS transactions,
           (SELECT COUNT(*) FROM crm_transaction sale WHERE ${SALE} AND sale.transaction_at >= ${PRIOR} AND sale.transaction_at < ${START})::int AS transactions_prior,
           (SELECT COUNT(*) FROM crm_product_registration registration JOIN crm_party party ON party.party_pk = registration.party_pk
             WHERE party.party_status IN ('ACTIVE', 'INACTIVE') AND ${inProject('registration.project_id')}
               AND registration.valid_to IS NULL)::int AS registrations,
           (SELECT COUNT(*) FROM crm_product_registration registration JOIN crm_party party ON party.party_pk = registration.party_pk
             WHERE party.party_status IN ('ACTIVE', 'INACTIVE') AND ${inProject('registration.project_id')}
               AND registration.valid_from < ${START} AND (registration.valid_to IS NULL OR registration.valid_to >= ${START}))::int AS registrations_prior,
           (SELECT COUNT(*) FROM crm_membership membership JOIN crm_project_account account ON account.project_account_id = membership.project_account_id
             WHERE ${inProject('account.project_id')} AND membership.membership_status = 'ACTIVE')::int AS memberships,
           (SELECT COUNT(*) FROM crm_membership membership JOIN crm_project_account account ON account.project_account_id = membership.project_account_id
             WHERE ${inProject('account.project_id')} AND COALESCE(membership.joined_at, membership.created_at) < ${START}
               AND (membership.left_at IS NULL OR membership.left_at >= ${START}))::int AS memberships_prior,
           (SELECT COUNT(*) FROM crm_service_case service_case
             WHERE ${inProject('service_case.project_id')} AND service_case.received_at >= ${START})::int AS cases,
           (SELECT COUNT(*) FROM crm_service_case service_case
             WHERE ${inProject('service_case.project_id')} AND service_case.received_at >= ${PRIOR} AND service_case.received_at < ${START})::int AS cases_prior,
           (SELECT COUNT(DISTINCT recipient.party_pk) FROM crm_campaign_recipient recipient JOIN crm_campaign campaign ON campaign.campaign_id = recipient.campaign_id
             WHERE ${inProject('campaign.project_id')} AND COALESCE(recipient.delivered_at, recipient.sent_at) >= ${START})::int AS reach,
           (SELECT COUNT(DISTINCT recipient.party_pk) FROM crm_campaign_recipient recipient JOIN crm_campaign campaign ON campaign.campaign_id = recipient.campaign_id
             WHERE ${inProject('campaign.project_id')} AND COALESCE(recipient.delivered_at, recipient.sent_at) >= ${PRIOR}
               AND COALESCE(recipient.delivered_at, recipient.sent_at) < ${START})::int AS reach_prior`),
    trend('month'),
    trend('week'),
    /*
     * Every project in the database: its customers, and the last time anything
     * arrived from it - a project that has gone quiet shows here before anybody
     * notices its numbers have stopped moving.
     */
    all(`WITH ${DEALINGS}
         SELECT project.project_id, project.project_code, project.project_name, project.status,
                COALESCE(dealt.customers, 0)::int AS customers,
                GREATEST(accounts.last_at, sales.last_at, members.last_at, cases.last_at, intakes.last_at) AS last_data_at,
                GREATEST(accounts.last_linked_at, intakes.last_at) AS last_registration_at
           FROM crm_project project
           LEFT JOIN (SELECT dealing.project_id, COUNT(DISTINCT dealing.party_pk) AS customers
                        FROM dealings dealing JOIN crm_party party ON party.party_pk = dealing.party_pk
                       WHERE party.party_status IN ('ACTIVE', 'INACTIVE')
                       GROUP BY dealing.project_id) dealt ON dealt.project_id = project.project_id
           LEFT JOIN (SELECT account.project_id, MAX(account.updated_at) AS last_at, MAX(account.linked_at) AS last_linked_at
                        FROM crm_project_account account GROUP BY account.project_id) accounts ON accounts.project_id = project.project_id
           LEFT JOIN (SELECT sale.project_id, MAX(sale.ingested_at) AS last_at FROM crm_transaction sale GROUP BY sale.project_id) sales
                  ON sales.project_id = project.project_id
           LEFT JOIN (SELECT account.project_id, MAX(membership.synced_at) AS last_at FROM crm_membership membership
                        JOIN crm_project_account account ON account.project_account_id = membership.project_account_id GROUP BY account.project_id) members
                  ON members.project_id = project.project_id
           LEFT JOIN (SELECT service_case.project_id, MAX(COALESCE(service_case.ingested_at, service_case.created_at)) AS last_at
                        FROM crm_service_case service_case GROUP BY service_case.project_id) cases ON cases.project_id = project.project_id
           LEFT JOIN (SELECT intake.source_project_id AS project_id, MAX(intake.created_at) AS last_at
                        FROM crm_registration_intake intake GROUP BY intake.source_project_id) intakes ON intakes.project_id = project.project_id
          ORDER BY project.project_id`),
    all(`WITH ${DEALINGS}, ${LATEST}
         SELECT grade.corporate_grade_id, grade.grade_code, grade.grade_name, COUNT(graded.party_pk)::int AS parties
           FROM crm_corporate_grade grade
           LEFT JOIN (SELECT party.party_pk, COALESCE(party.assigned_grade_id, latest.corporate_grade_id) AS grade_id
                        FROM crm_party party LEFT JOIN latest ON latest.party_pk = party.party_pk
                       WHERE ${CUSTOMER}) graded ON graded.grade_id = grade.corporate_grade_id
          WHERE grade.is_active
          GROUP BY grade.corporate_grade_id ORDER BY grade.rank_no DESC`),
    all(`WITH ${DEALINGS}, ${LATEST}
         SELECT latest.activity_status, COUNT(*)::int AS parties
           FROM crm_party party JOIN latest ON latest.party_pk = party.party_pk
          WHERE ${CUSTOMER} AND latest.activity_status IS NOT NULL
          GROUP BY 1 ORDER BY 2 DESC`),
    /* Work that waits on a person, each counted the way the screen that clears it lists it. */
    one(`SELECT (SELECT COUNT(*) FROM crm_registration_intake WHERE status = 'PENDING' AND category = 'PERSON')::int AS registrations,
                (SELECT COUNT(*) FROM crm_registration_intake WHERE status = 'PENDING' AND category = 'ESHOP')::int AS assignments,
                (SELECT COUNT(*) FROM crm_identity_match_candidate WHERE match_status = 'PENDING')::int AS duplicates,
                (SELECT COUNT(*) FROM crm_service_case service_case JOIN crm_service_status st ON st.service_status_id = service_case.service_status_id
                  WHERE NOT st.is_terminal AND ${inProject('service_case.project_id')})::int AS open_cases,
                (SELECT COUNT(*) FROM crm_service_case service_case JOIN crm_service_status st ON st.service_status_id = service_case.service_status_id
                  WHERE NOT st.is_terminal AND service_case.due_at < now() AND ${inProject('service_case.project_id')})::int AS overdue_cases,
                (SELECT COUNT(*) FROM crm_person_import_error WHERE status = 'OPEN')::int AS import_errors`),
    /* The latest things that happened, of five kinds, newest first. */
    all(`WITH ${DEALINGS}
         (SELECT 'CUSTOMER' AS kind, ${JOINED} AS at, party.display_name AS label, project.project_code
            FROM crm_party party LEFT JOIN crm_project project ON project.project_id = party.origin_project_id
           WHERE ${CUSTOMER} ORDER BY at DESC LIMIT 8)
         UNION ALL
         (SELECT 'CASE', service_case.received_at, service_case.title, project.project_code
            FROM crm_service_case service_case JOIN crm_project project ON project.project_id = service_case.project_id
           WHERE ${inProject('service_case.project_id')} ORDER BY service_case.received_at DESC LIMIT 8)
         UNION ALL
         (SELECT 'REGISTRATION', registration.registered_at, product.product_name, project.project_code
            FROM crm_product_registration registration
            JOIN crm_project project ON project.project_id = registration.project_id
            JOIN crm_product_instance instance ON instance.product_instance_id = registration.product_instance_id
            JOIN crm_product_catalog product ON product.product_id = instance.product_id
           WHERE ${inProject('registration.project_id')} ORDER BY registration.registered_at DESC LIMIT 8)
         UNION ALL
         (SELECT 'TIER', history.changed_at, tier.tier_name, project.project_code
            FROM crm_membership_tier_history history
            JOIN crm_membership membership ON membership.membership_id = history.membership_id
            JOIN crm_project_account account ON account.project_account_id = membership.project_account_id
            JOIN crm_project project ON project.project_id = account.project_id
            LEFT JOIN crm_project_tier tier ON tier.project_tier_id = history.new_tier_id
           WHERE ${inProject('account.project_id')} ORDER BY history.changed_at DESC LIMIT 8)
         UNION ALL
         (SELECT 'CAMPAIGN', COALESCE(campaign.start_at, campaign.approved_at, campaign.created_at), campaign.campaign_name, project.project_code
            FROM crm_campaign campaign LEFT JOIN crm_project project ON project.project_id = campaign.project_id
           WHERE campaign.campaign_status IN ('APPROVED', 'ACTIVE', 'COMPLETED') AND ${inProject('campaign.project_id')}
             AND COALESCE(campaign.start_at, campaign.approved_at, campaign.created_at) <= now()
           ORDER BY 2 DESC LIMIT 8)
         ORDER BY at DESC NULLS LAST LIMIT 8`)
  ]);

  return {
    as_of: new Date().toISOString(),
    days: days,
    project_id: pid,
    kpis: kpis,
    trends: { month: monthly, week: weekly },
    projects: projects,
    grades: grades,
    activity: activity,
    attention: attention,
    recent: recent
  };
}

module.exports = {
  recalculateClassStats: recalculateClassStats,
  overview: overview
};
