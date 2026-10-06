const defaultDb = require('../../config/db');
const transactions = require('./transactions.service');

/**
 * THE ANALYSIS RUN - design sections 3.7, 3.8 and 10.
 *
 * For one reference date it writes, for every active party:
 *
 *   A PROJECT SNAPSHOT per project the party has facts in (project_id set):
 *   what they spent there, how often, how recently, their service cases and
 *   complaints, what they hold, what points they earned, how often they
 *   visited a service centre.
 *
 *   ONE DREAM-WIDE SNAPSHOT (project_id NULL), RECALCULATED FROM THE FACTS -
 *   never from the project rows. Spend and counts are summed across projects
 *   in the reporting currency; purchase DAYS are counted distinct across
 *   projects (a customer who bought on the Eshop and at a Crystal centre on
 *   the same day was active on one day, not two); the average is total spend
 *   over total transactions, not an average of averages.
 *
 *   THE CORPORATE SCORE AND GRADE, on the Dream-wide row only. The score is
 *   the versioned model below; the grade is the crm_corporate_grade band it
 *   falls in, so moving a band boundary on the basic-data screen regrades the
 *   next run without touching code.
 *
 *   METRIC VALUES for the metric definitions this run knows how to compute.
 *   A new metric is a new definition plus a line in METRICS, not a new
 *   snapshot column - which is why the design has the metric tables.
 *
 * A run replaces whatever an earlier run wrote for the same reference date,
 * so running it twice in a day gives the same answer once.
 */

const MODEL_VERSION = 'dream-v1';

/**
 * THE CORPORATE SCORE, 0 to 100, as six capped parts.
 *
 * VALUE and FREQUENCY are scored by PERCENTILE RANK among the customers who
 * bought anything in the last 12 months: a customer who spent more than 70%
 * of buyers earns 70% of the value weight. Spend is not comparable to a fixed
 * number across a customer base whose projects sell in different currencies
 * at different price points - a fixed scale put every Eshop customer in the
 * top grade - while a rank always spreads the base across the grades.
 * Recency, breadth, ownership and care are absolute.
 *
 * Every part is capped, so no single behaviour can carry a customer to the
 * top grade on its own. The parts are stored with the snapshot
 * (score_components), so a grade can always be explained; changing any number
 * here is a new MODEL_VERSION.
 */
const MODEL = {
  value: { weight: 40 },                          // percentile rank of 12-month spend
  frequency: { weight: 15 },                      // percentile rank of distinct purchase days in 12 months
  recency: { weight: 15, freshDays: 30, goneDays: 365 },
  breadth: { weight: 15, perProject: 5 },         // projects with activity in 12 months
  ownership: { weight: 10, perProduct: 2.5 },     // products held now
  care: { weight: 5, perComplaint: 2.5 }          // starts full, loses points per complaint
};

const NOT_A_PURCHASE = ['REFUND', 'RETURN', 'REVERSAL'];

function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
function round2(value) { return Math.round(value * 100) / 100; }
function daysBetween(later, earlier) { return (later - new Date(earlier)) / 86400000; }

/** The share of `sorted` at or below `value`, 0..1; 0 for a customer who did not buy. */
function rankIn(sorted, value) {
  if (!(value > 0) || !sorted.length) return 0;
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (sorted[mid] <= value) low = mid + 1; else high = mid;
  }
  return low / sorted.length;
}

function score(facts, ref, population) {
  const days = facts.last_transaction_at ? daysBetween(ref, facts.last_transaction_at) : null;
  const parts = {
    value: MODEL.value.weight * rankIn(population.spend, facts.purchase_amount_12m),
    frequency: MODEL.frequency.weight * rankIn(population.days, facts.active_purchase_days_12m),
    recency: days === null ? 0 : clamp(MODEL.recency.weight *
      (1 - (days - MODEL.recency.freshDays) / (MODEL.recency.goneDays - MODEL.recency.freshDays)), 0, MODEL.recency.weight),
    breadth: clamp(MODEL.breadth.perProject * facts.projects_active_12m, 0, MODEL.breadth.weight),
    ownership: clamp(MODEL.ownership.perProduct * facts.registered_device_count, 0, MODEL.ownership.weight),
    care: clamp(MODEL.care.weight - MODEL.care.perComplaint * facts.complaint_count_12m, 0, MODEL.care.weight)
  };
  Object.keys(parts).forEach(function (key) { parts[key] = round2(parts[key]); });
  return { total: round2(Object.keys(parts).reduce(function (sum, key) { return sum + parts[key]; }, 0)), parts: parts };
}

/** NEW, ACTIVE, AT_RISK, LAPSED or NEVER_BOUGHT, from the first and last purchase. */
function activity(facts, ref) {
  if (!facts.first_transaction_at) return 'NEVER_BOUGHT';
  if (daysBetween(ref, facts.first_transaction_at) <= 90) return 'NEW';
  const sinceLast = daysBetween(ref, facts.last_transaction_at);
  if (sinceLast <= 180) return 'ACTIVE';
  if (sinceLast <= 365) return 'AT_RISK';
  return 'LAPSED';
}

/**
 * Every fact the run needs, one row per party and project. `project_id` is
 * the source project of the fact; the Dream-wide row is built from these in
 * JavaScript, which is where "distinct days across projects" is done right.
 */
async function load(connection, refDate) {
  const counted = transactions.COUNTED_STATUSES;
  const marks = counted.map(function () { return '?'; }).join(', ');
  const selectRows = function (sql, bindings) { return connection.raw(sql, bindings).then(function (result) { return result.rows; }); };
  const end = '(?::date + 1)';
  const start = '(?::date + 1 - interval \'12 months\')';

  const [purchases, cases, held, earned, visits] = await Promise.all([
    /* one row per counted transaction: amount, day, type - grouping happens in JS */
    selectRows(`SELECT tp.party_pk, sale.project_id, sale.transaction_at, sale.transaction_type_code,
              COALESCE(sale.reporting_net_amount, 0) AS amount
         FROM crm_transaction sale
         JOIN crm_transaction_party tp ON tp.transaction_id = sale.transaction_id AND tp.party_role_code = 'BUYER'
        WHERE sale.transaction_status IN (${marks}) AND sale.transaction_at < ${end}`, counted.concat([refDate])),
    selectRows(`SELECT service_case.party_pk, service_case.project_id, service_case.received_at, ct.case_type_code
         FROM crm_service_case service_case JOIN crm_service_case_type ct ON ct.case_type_id = service_case.case_type_id
        WHERE service_case.received_at < ${end} AND service_case.received_at >= ${start}`, [refDate, refDate]),
    selectRows(`SELECT party_pk, project_id, COUNT(*)::int AS held_count FROM crm_product_registration
        WHERE valid_to IS NULL AND relationship_code IN ('OWNER', 'LICENSEE') GROUP BY 1, 2`, []),
    selectRows(`SELECT account.party_pk, point_event.project_id, COALESCE(SUM(point_event.points_delta), 0) AS points_earned
         FROM crm_point_event point_event JOIN crm_point_account account ON account.point_account_id = point_event.point_account_id
        WHERE point_event.points_delta > 0 AND point_event.occurred_at < ${end} AND point_event.occurred_at >= ${start} GROUP BY 1, 2`, [refDate, refDate]),
    selectRows(`SELECT party_pk, project_id, COUNT(*)::int AS visit_count FROM crm_service_center_activity
        WHERE party_pk IS NOT NULL AND status = 'COMPLETED' AND occurred_at < ${end} AND occurred_at >= ${start}
        GROUP BY 1, 2`, [refDate, refDate])
  ]);

  return { purchases: purchases, cases: cases, held: held, earned: earned, visits: visits };
}

/** Folds the loaded facts into per-scope accumulators, keyed "party:project" ("party:" = Dream-wide). */
function accumulate(data, ref) {
  const yearAgo = new Date(ref);
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const rows = {};

  const factsFor = function (partyId, projectId) {
    const key = partyId + ':' + (projectId || '');
    if (!rows[key]) {
      rows[key] = {
        party_pk: partyId, project_id: projectId || null,
        first_transaction_at: null, last_transaction_at: null,
        purchase_amount_lifetime: 0, purchase_amount_12m: 0,
        transaction_count_lifetime: 0, transaction_count_12m: 0,
        days: {}, projects: {},
        service_case_count_12m: 0, complaint_count_12m: 0,
        registered_device_count: 0, points_earned_12m: 0, location_visit_count_12m: 0
      };
    }
    return rows[key];
  };
  /* every fact counts in its project's row and in the party's Dream-wide row */
  const both = function (partyId, projectId, callback) {
    callback(factsFor(partyId, projectId), projectId);
    callback(factsFor(partyId, null), projectId);
  };

  data.purchases.forEach(function (purchaseRow) {
    const when = new Date(purchaseRow.transaction_at);
    const recent = when >= yearAgo;
    const purchase = NOT_A_PURCHASE.indexOf(purchaseRow.transaction_type_code) === -1;
    both(purchaseRow.party_pk, purchaseRow.project_id, function (facts, projectId) {
      facts.purchase_amount_lifetime += Number(purchaseRow.amount);
      if (recent) facts.purchase_amount_12m += Number(purchaseRow.amount);
      if (!purchase) return;
      facts.transaction_count_lifetime += 1;
      if (!facts.first_transaction_at || when < facts.first_transaction_at) facts.first_transaction_at = when;
      if (!facts.last_transaction_at || when > facts.last_transaction_at) facts.last_transaction_at = when;
      if (recent) {
        facts.transaction_count_12m += 1;
        facts.days[when.toISOString().slice(0, 10)] = true;     // distinct across projects on the Dream-wide row
        facts.projects[projectId] = true;
      }
    });
  });

  data.cases.forEach(function (caseRow) {
    both(caseRow.party_pk, caseRow.project_id, function (facts, projectId) {
      facts.service_case_count_12m += 1;
      if (caseRow.case_type_code === 'COMPLAINT') facts.complaint_count_12m += 1;
      facts.projects[projectId] = true;
    });
  });
  data.held.forEach(function (heldRow) {
    both(heldRow.party_pk, heldRow.project_id, function (facts) { facts.registered_device_count += Number(heldRow.held_count); });
  });
  data.earned.forEach(function (earnedRow) {
    both(earnedRow.party_pk, earnedRow.project_id, function (facts) { facts.points_earned_12m += Number(earnedRow.points_earned); });
  });
  data.visits.forEach(function (visitRow) {
    both(visitRow.party_pk, visitRow.project_id, function (facts, projectId) {
      facts.location_visit_count_12m += Number(visitRow.visit_count);
      if (projectId) facts.projects[projectId] = true;
    });
  });

  return Object.keys(rows).map(function (key) {
    const facts = rows[key];
    facts.active_purchase_days_12m = Object.keys(facts.days).length;
    facts.projects_active_12m = Object.keys(facts.projects).filter(Boolean).length;
    return facts;
  });
}

/** The metrics this run writes, from a Dream-wide row and the party's accounts. */
const METRICS = {
  DAYS_SINCE_LAST_PURCHASE: function (facts, ref) {
    return facts.last_transaction_at ? { numeric_value: Math.floor(daysBetween(ref, facts.last_transaction_at)) } : null;
  },
  CROSS_PROJECT_COUNT: function (facts) { return { numeric_value: facts.projects_active_12m }; },
  PRODUCT_OWNERSHIP_COUNT: function (facts) { return { numeric_value: facts.registered_device_count }; },
  CHURN_RISK: function (facts, ref) {
    if (!facts.last_transaction_at) return null;
    const risk = clamp(daysBetween(ref, facts.last_transaction_at) / 365 * 0.7 + Math.min(facts.complaint_count_12m, 3) * 0.1 -
      Math.min(facts.active_purchase_days_12m, 12) / 12 * 0.2, 0, 1);
    return { numeric_value: Math.round(risk * 10000) / 10000 };
  },
  POINTS_BALANCE: function (facts, ref, extra) { return { numeric_value: extra.points || 0 }; },
  IS_MULTI_PROJECT: function (facts, ref, extra) { return { boolean_value: (extra.projects || 0) >= 2 }; },
  LAST_SERVICE_DATE: function (facts, ref, extra) { return extra.lastService ? { date_value: extra.lastService } : null; }
};

/**
 * Run the analysis for `options.referenceDate` (default today).
 * Returns how many snapshots and metric values were written.
 */
async function run(options) {
  const connection = (options && options.db) || defaultDb;
  const refDate = (options && options.referenceDate) || new Date().toISOString().slice(0, 10);
  const ref = new Date(refDate + 'T23:59:59Z');

  const [data, grades, definitions, reporting, balances, accounts, lastService, platform] = await Promise.all([
    load(connection, refDate),
    connection('crm_corporate_grade').where('is_active', true).orderBy('rank_no', 'desc'),
    connection('crm_metric_definition').where('is_active', true),
    connection('crm_currency').where('is_reporting', true).first('currency_code'),
    connection('crm_point_account').select('party_pk').sum({ balance_total: 'balance' }).groupBy('party_pk'),
    connection('crm_project_account as account').join('crm_project as project', 'project.project_id', 'account.project_id')
      .whereNull('account.unlinked_at').whereNot('project.project_code', 'PLATFORM')
      .select('account.party_pk').countDistinct({ project_count: 'account.project_id' }).groupBy('account.party_pk'),
    connection('crm_service_case').where('received_at', '<', connection.raw('?::date + 1', [refDate]))
      .select('party_pk').max({ last_received_at: 'received_at' }).groupBy('party_pk'),
    connection('crm_project').where('project_code', 'PLATFORM').first('project_id')
  ]);

  const rows = accumulate(data, ref);
  const dream = rows.filter(function (facts) { return facts.project_id === null; });
  const population = {
    spend: dream.map(function (facts) { return facts.purchase_amount_12m; }).filter(function (value) { return value > 0; }).sort(function (first, second) { return first - second; }),
    days: dream.map(function (facts) { return facts.active_purchase_days_12m; }).filter(function (value) { return value > 0; }).sort(function (first, second) { return first - second; })
  };
  const byParty = function (list, field) {
    const out = {};
    list.forEach(function (row) { out[row.party_pk] = row[field]; });
    return out;
  };
  const pointsOf = byParty(balances, 'balance_total');
  const projectsOf = byParty(accounts, 'project_count');
  const serviceOf = byParty(lastService, 'last_received_at');
  const gradeFor = function (value) {
    return grades.filter(function (grade) {
      return (grade.min_score === null || value >= Number(grade.min_score)) && (grade.max_score === null || value < Number(grade.max_score));
    })[0] || null;
  };
  const defs = {};
  definitions.forEach(function (definition) { defs[definition.metric_code] = definition; });

  const snapshots = rows
    .filter(function (facts) { return !platform || facts.project_id !== platform.project_id; })
    .map(function (facts) {
      const row = {
        party_pk: facts.party_pk,
        project_id: facts.project_id,
        reference_date: refDate,
        reporting_currency_code: reporting ? reporting.currency_code : null,
        first_transaction_at: facts.first_transaction_at,
        last_transaction_at: facts.last_transaction_at,
        purchase_amount_lifetime: round2(facts.purchase_amount_lifetime),
        purchase_amount_12m: round2(facts.purchase_amount_12m),
        transaction_count_lifetime: facts.transaction_count_lifetime,
        transaction_count_12m: facts.transaction_count_12m,
        active_purchase_days_12m: facts.active_purchase_days_12m,
        average_transaction_amount_12m: facts.transaction_count_12m ? round2(facts.purchase_amount_12m / facts.transaction_count_12m) : null,
        service_case_count_12m: facts.service_case_count_12m,
        complaint_count_12m: facts.complaint_count_12m,
        registered_device_count: facts.registered_device_count,
        points_earned_12m: round2(facts.points_earned_12m),
        location_visit_count_12m: facts.location_visit_count_12m,
        activity_status: activity(facts, ref),
        model_version: MODEL_VERSION
      };
      if (facts.project_id === null) {
        const scored = score(facts, ref, population);
        const grade = gradeFor(scored.total);
        row.corporate_score = scored.total;
        row.corporate_grade_id = grade ? grade.corporate_grade_id : null;
        row.score_components = JSON.stringify(Object.assign({ model: MODEL_VERSION, projects_active_12m: facts.projects_active_12m }, scored.parts));
      }
      return row;
    });

  const metricRows = [];
  rows.filter(function (snapshot) { return snapshot.project_id === null; }).forEach(function (snapshot) {
    const extra = { points: Number(pointsOf[snapshot.party_pk] || 0), projects: Number(projectsOf[snapshot.party_pk] || 0), lastService: serviceOf[snapshot.party_pk] || null };
    Object.keys(METRICS).forEach(function (code) {
      if (!defs[code]) return;
      const value = METRICS[code](snapshot, ref, extra);
      if (!value) return;
      metricRows.push(Object.assign({
        party_pk: snapshot.party_pk, project_id: null, metric_definition_id: defs[code].metric_definition_id,
        reference_date: refDate, model_version: MODEL_VERSION
      }, value));
    });
  });

  await connection.transaction(async function (trx) {
    await trx('crm_party_analysis_snapshot').where('reference_date', refDate).del();
    await trx('crm_party_metric_value').where('reference_date', refDate).where('model_version', MODEL_VERSION).del();
    for (let index = 0; index < snapshots.length; index += 500) {
      // eslint-disable-next-line no-await-in-loop
      await trx('crm_party_analysis_snapshot').insert(snapshots.slice(index, index + 500));
    }
    for (let index = 0; index < metricRows.length; index += 500) {
      // eslint-disable-next-line no-await-in-loop
      await trx('crm_party_metric_value').insert(metricRows.slice(index, index + 500));
    }
  });

  const graded = snapshots.filter(function (snapshot) { return snapshot.project_id === null && snapshot.corporate_grade_id; }).length;
  return { reference_date: refDate, snapshots: snapshots.length, graded: graded, metric_values: metricRows.length, model: MODEL_VERSION };
}

module.exports = { MODEL: MODEL, MODEL_VERSION: MODEL_VERSION, run: run };
