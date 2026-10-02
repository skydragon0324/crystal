const db = require('../../config/db');
const vocabulary = require('../../repositories/crm/vocabulary.repository');
const audit = require('../audit.service');
const { transaction } = require('../../repositories/shared/transaction');
const { HttpError } = require('../../utils/response');

/**
 * SEGMENTS AND CAMPAIGNS.
 *
 * A SEGMENT is a rule with a stable name - "owns a class 9 phone and has not
 * been in a service centre this year" - and its membership is materialised
 * each time it is evaluated, with the date a party entered and left. The rule
 * is versioned: editing it starts a new version, so the members a program
 * took its targets from can always be traced to the rule that chose them.
 *
 * A CAMPAIGN freezes an audience before it does anything: from a segment, a
 * program's targets, a rule, or a list. The frozen list is what was actually
 * used, whatever the segment says tomorrow. Preparing an action decides, per
 * member, whether they may be contacted on that channel for that purpose -
 * consent and a usable contact - and records the reason when they may not.
 * Nothing is SENT from here: that needs a message gateway, which this
 * console does not have, and the prepared recipients are what one would read.
 */

const SEGMENT_PAGE = '/admin/crm/segments';
const CAMPAIGN_PAGE = '/admin/crm/campaigns';

/* ------------------------------------------------------------ the rule language */

/**
 * WHAT A RULE MAY SAY, and nothing else.
 *
 * A rule arrives as JSON and becomes SQL, so it is compiled from this list of
 * conditions rather than accepted as text: every value is a bound parameter,
 * every column is written here. `fields()` hands the same list to the console
 * so the editor can only offer what the compiler understands.
 */
/* The snapshot columns a rule may compare, and how. Written here, never taken from the rule. */
const SNAPSHOT_MEASURES = ['purchase_amount_12m', 'purchase_amount_lifetime', 'transaction_count_12m',
  'transaction_count_lifetime', 'active_purchase_days_12m', 'average_transaction_amount_12m',
  'service_case_count_12m', 'complaint_count_12m', 'corporate_score', 'registered_device_count',
  'points_earned_12m', 'location_visit_count_12m'];
const OPERATORS = { '>=': '>=', '<=': '<=', '>': '>', '<': '<', '=': '=' };

function operator(operatorCode) {
  const found = OPERATORS[String(operatorCode || '>=')];
  if (!found) throw new HttpError(400, 'crm.unknownRuleField', null, { field: String(operatorCode) });
  return found;
}

const CONDITIONS = {
  party_type: {
    params: ['value'],
    sql: function (condition) { return ['p.party_type = ?', [condition.value]]; }
  },
  project_member: {
    params: ['project'],
    sql: function (condition) {
      return [`EXISTS (SELECT 1 FROM crm_project_account a JOIN crm_project j ON j.project_id = a.project_id
                WHERE a.party_id = p.party_id AND a.unlinked_at IS NULL AND j.project_code = ?)`, [condition.project]];
    }
  },
  tier: {
    params: ['project', 'tier'],
    sql: function (condition) {
      return [`EXISTS (SELECT 1 FROM crm_membership m JOIN crm_project j ON j.project_id = m.project_id
                JOIN crm_project_tier t ON t.project_tier_id = m.current_tier_id
                WHERE m.party_id = p.party_id AND m.membership_status = 'ACTIVE' AND j.project_code = ? AND t.tier_code = ?)`,
      [condition.project, condition.tier]];
    }
  },
  owns_class: {
    params: ['class', 'min'],
    sql: function (condition) {
      return [`EXISTS (SELECT 1 FROM crm_party_product_class_stat s JOIN crm_product_class k ON k.product_class_id = s.product_class_id
                WHERE s.party_id = p.party_id AND k.class_code = ? AND s.active_owned_count >= ?)`,
      [condition.class, Number(condition.min || 1)]];
    }
  },
  owns_no_class: {
    params: ['class'],
    sql: function (condition) {
      return [`NOT EXISTS (SELECT 1 FROM crm_party_product_class_stat s JOIN crm_product_class k ON k.product_class_id = s.product_class_id
                WHERE s.party_id = p.party_id AND k.class_code = ? AND s.active_owned_count > 0)`, [condition.class]];
    }
  },
  points_balance: {
    params: ['point_type', 'min'],
    sql: function (condition) {
      return [`EXISTS (SELECT 1 FROM crm_point_account a JOIN crm_point_type t ON t.point_type_id = a.point_type_id
                WHERE a.party_id = p.party_id AND t.point_type_code = ? AND a.balance >= ?)`,
      [condition.point_type, Number(condition.min || 0)]];
    }
  },
  service_cases: {
    params: ['days', 'min'],
    sql: function (condition) {
      return [`(SELECT COUNT(*) FROM crm_service_case s
                WHERE s.party_id = p.party_id AND s.received_at >= now() - (? || ' days')::interval) >= ?`,
      [String(Number(condition.days || 365)), Number(condition.min === undefined ? 1 : condition.min)]];
    }
  },
  no_service_cases: {
    params: ['days'],
    sql: function (condition) {
      return [`NOT EXISTS (SELECT 1 FROM crm_service_case s
                WHERE s.party_id = p.party_id AND s.received_at >= now() - (? || ' days')::interval)`,
      [String(Number(condition.days || 365))]];
    }
  },
  site_visits: {
    params: ['days', 'min', 'activity'],
    sql: function (condition) {
      const byType = condition.activity ? ' AND t.activity_code = ?' : '';
      const bindings = [String(Number(condition.days || 365))].concat(condition.activity ? [condition.activity] : []).concat([Number(condition.min || 1)]);
      return [`(SELECT COUNT(*) FROM crm_location_activity a JOIN crm_location_activity_type t ON t.activity_type_id = a.activity_type_id
                WHERE a.party_id = p.party_id AND a.status = 'COMPLETED'
                  AND a.occurred_at >= now() - (? || ' days')::interval${byType}) >= ?`, bindings];
    }
  },
  registered_within: {
    params: ['days'],
    sql: function (condition) {
      return [`EXISTS (SELECT 1 FROM crm_product_registration r
                WHERE r.party_id = p.party_id AND r.registered_at >= now() - (? || ' days')::interval)`,
      [String(Number(condition.days || 30))]];
    }
  },
  corporate_grade: {
    params: ['min_rank'],
    sql: function (condition) {
      return [`(SELECT g.rank_no FROM crm_party_analysis_snapshot s JOIN crm_corporate_grade g ON g.corporate_grade_id = s.corporate_grade_id
                WHERE s.party_id = p.party_id AND s.project_id IS NULL ORDER BY s.reference_date DESC LIMIT 1) >= ?`,
      [Number(condition.min_rank || 1)]];
    }
  },
  has_contact: {
    params: ['type'],
    sql: function (condition) {
      return [`EXISTS (SELECT 1 FROM crm_contact_point cp WHERE cp.party_id = p.party_id AND cp.status = 'ACTIVE' AND cp.contact_type = ?)`,
      [condition.type]];
    }
  },
  /*
   * THE ANALYSIS, read from each party's LATEST snapshot - Dream-wide, or for
   * one project when `project` is given. This is what makes a segment like
   * "spent over 1,000 across Dream in the last 12 months" possible.
   */
  snapshot: {
    params: ['measure', 'op', 'value', 'project'],
    optional: ['op', 'project'],
    sql: function (condition) {
      if (SNAPSHOT_MEASURES.indexOf(condition.measure) === -1) throw new HttpError(400, 'crm.unknownRuleField', null, { field: String(condition.measure) });
      const sqlOperator = operator(condition.op);
      const scope = condition.project
        ? 's.project_id = (SELECT project_id FROM crm_project WHERE project_code = ?)'
        : 's.project_id IS NULL';
      return [`(SELECT s.${condition.measure} FROM crm_party_analysis_snapshot s
                WHERE s.party_id = p.party_id AND ${scope} ORDER BY s.reference_date DESC LIMIT 1) ${sqlOperator} ?`,
      (condition.project ? [condition.project] : []).concat([Number(condition.value)])];
    }
  },
  activity_status: {
    params: ['value'],
    sql: function (condition) {
      return [`(SELECT s.activity_status FROM crm_party_analysis_snapshot s
                WHERE s.party_id = p.party_id AND s.project_id IS NULL ORDER BY s.reference_date DESC LIMIT 1) = ?`, [condition.value]];
    }
  },
  metric: {
    params: ['metric', 'op', 'value'],
    optional: ['op'],
    sql: function (condition) {
      return [`(SELECT v.numeric_value FROM crm_party_metric_value v
                JOIN crm_metric_definition d ON d.metric_definition_id = v.metric_definition_id
                WHERE v.party_id = p.party_id AND v.project_id IS NULL AND d.metric_code = ?
                ORDER BY v.reference_date DESC LIMIT 1) ${operator(condition.op)} ?`, [condition.metric, Number(condition.value)]];
    }
  },
  bought_in_project: {
    params: ['project', 'days'],
    optional: ['days'],
    sql: function (condition) {
      return [`EXISTS (SELECT 1 FROM crm_transaction t
                JOIN crm_transaction_party tp ON tp.transaction_id = t.transaction_id AND tp.party_role_code = 'BUYER'
                JOIN crm_project j ON j.project_id = t.project_id
                WHERE tp.party_id = p.party_id AND j.project_code = ?
                  AND t.transaction_type_code NOT IN ('REFUND', 'RETURN', 'REVERSAL')
                  AND t.transaction_at >= now() - (? || ' days')::interval)`,
      [condition.project, String(Number(condition.days || 365))]];
    }
  },
  consented: {
    params: ['project', 'purpose', 'channel'],
    sql: function (condition) {
      return [`EXISTS (SELECT 1 FROM crm_party_communication_consent x
                JOIN crm_project_communication_option o ON o.project_communication_option_id = x.project_communication_option_id
                JOIN crm_project j ON j.project_id = o.project_id
                JOIN crm_communication_purpose pp ON pp.purpose_id = o.purpose_id
                JOIN crm_communication_channel ch ON ch.channel_id = o.channel_id
                WHERE x.party_id = p.party_id AND x.consent_status = 'GRANTED'
                  AND j.project_code = ? AND pp.purpose_code = ? AND ch.channel_code = ?)`,
      [condition.project, condition.purpose, condition.channel]];
    }
  }
};

function fields() {
  return Object.keys(CONDITIONS).map(function (name) {
    return {
      field: name,
      params: CONDITIONS[name].params,
      optional: CONDITIONS[name].optional || ['min', 'days', 'activity'],
      measures: name === 'snapshot' ? SNAPSHOT_MEASURES : undefined,
      operators: ['snapshot', 'metric'].indexOf(name) !== -1 ? Object.keys(OPERATORS) : undefined
    };
  });
}

/** { all: [...] } / { any: [...] } / a single condition -> [sql, bindings]. Nested groups are allowed. */
function compile(rule, depth) {
  if (!rule || typeof rule !== 'object') throw new HttpError(400, 'crm.theRuleIsEmpty');
  if ((depth || 0) > 4) throw new HttpError(400, 'crm.theRuleIsTooDeep');

  const group = rule.all ? 'all' : (rule.any ? 'any' : null);
  if (group) {
    const parts = rule[group];
    if (!Array.isArray(parts) || !parts.length) throw new HttpError(400, 'crm.theRuleIsEmpty');
    const compiled = parts.map(function (part) { return compile(part, (depth || 0) + 1); });
    return [
      '(' + compiled.map(function (part) { return part[0]; }).join(group === 'all' ? ' AND ' : ' OR ') + ')',
      compiled.reduce(function (all, part) { return all.concat(part[1]); }, [])
    ];
  }

  const condition = CONDITIONS[rule.field];
  if (!condition) throw new HttpError(400, 'crm.unknownRuleField', null, { field: String(rule.field) });
  const optional = condition.optional || ['min', 'days', 'activity'];
  const missing = condition.params.filter(function (param) {
    return optional.indexOf(param) === -1 && (rule[param] === undefined || rule[param] === '');
  });
  if (missing.length) throw new HttpError(400, 'crm.theRuleNeedsAValue', null, { field: rule.field, value: missing[0] });

  const out = condition.sql(rule);
  return ['(' + out[0] + ')', out[1]];
}

function parseRule(value) {
  if (!value) throw new HttpError(400, 'crm.theRuleIsEmpty');
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (error) { throw new HttpError(400, 'crm.theRuleIsNotValidJson'); }
}

/** The party ids a rule matches today. */
async function matchRule(rule, connection) {
  const compiled = compile(rule);
  const res = await (connection || db).raw(
    `SELECT p.party_id FROM crm_party p WHERE p.party_status = 'ACTIVE' AND ${compiled[0]}`, compiled[1]);
  return res.rows.map(function (row) { return row.party_id; });
}

/* ------------------------------------------------------------ segments */

async function searchSegments(filters, paging) {
  const qb = function () {
    const query = db('crm_segment as s').leftJoin('crm_project as j', 'j.project_id', 's.project_id');
    if (filters.status) query.where('s.status', filters.status);
    if (filters.q) {
      const like = '%' + String(filters.q).trim() + '%';
      query.where(function () { this.where('s.segment_code', 'ilike', like).orWhere('s.segment_name', 'ilike', like); });
    }
    return query;
  };
  const count = await qb().count({ c: '*' }).first();
  const rows = await qb()
    .leftJoin('crm_segment_version as v', 'v.segment_version_id', 's.current_version_id')
    .select('s.*', 'j.project_code', 'v.version_no', 'v.rule_expression')
    .orderBy('s.segment_id', paging.dir).limit(paging.limit).offset(paging.offset);
  return { rows: rows, total: Number(count.c) };
}

function segmentOptions() {
  return db('crm_segment').whereNot('status', 'ARCHIVED').orderBy('segment_name')
    .select('segment_id', 'segment_code', 'segment_name', 'member_count');
}

async function segmentDetail(id) {
  const segment = await db('crm_segment as s').leftJoin('crm_project as j', 'j.project_id', 's.project_id')
    .where('s.segment_id', id).first('s.*', 'j.project_code');
  if (!segment) throw new HttpError(404, 'common.notFound');
  const versions = await db('crm_segment_version as v').leftJoin('managers as m', 'm.id', 'v.created_by_manager_id')
    .where('v.segment_id', id).orderBy('v.version_no', 'desc').select('v.*', 'm.name as created_by_name');
  return { segment: segment, versions: versions };
}

async function segmentMembers(id, filters, paging) {
  const qb = function () {
    const query = db('crm_segment_membership as m').join('crm_party as p', 'p.party_id', 'm.party_id')
      .where('m.segment_id', id);
    if (filters.past === '1') query.whereNotNull('m.unmatched_at'); else query.whereNull('m.unmatched_at');
    if (filters.q) {
      const like = '%' + String(filters.q).trim() + '%';
      query.where(function () { this.where('p.display_name', 'ilike', like).orWhere('p.party_no', 'ilike', like); });
    }
    return query;
  };
  const count = await qb().count({ c: '*' }).first();
  const rows = await qb().select('m.*', 'p.party_no', 'p.display_name as party_name', 'p.party_type')
    .orderBy('m.matched_at', 'desc').limit(paging.limit).offset(paging.offset);
  return { rows: rows, total: Number(count.c) };
}

async function createSegment(body, actor) {
  if (!body.segment_code || !body.segment_name) throw new HttpError(400, 'crm.codeAndNameAreRequired');
  const rule = parseRule(body.rule_expression);
  compile(rule);

  const segment = await transaction(async function (trx) {
    const [row] = await trx('crm_segment').insert({
      project_id: body.project_id || null,
      segment_code: body.segment_code,
      segment_name: body.segment_name,
      segment_description: body.segment_description || null,
      calculation_frequency: body.calculation_frequency || 'ON_DEMAND',
      status: 'ACTIVE',
      created_by_manager_id: actor.manager_id
    }).returning('*');

    const [version] = await trx('crm_segment_version').insert({
      segment_id: row.segment_id, version_no: 1, rule_expression: JSON.stringify(rule),
      created_by_manager_id: actor.manager_id
    }).returning('*');

    const [done] = await trx('crm_segment').where('segment_id', row.segment_id)
      .update({ current_version_id: version.segment_version_id }).returning('*');
    return done;
  });

  audit.created(actor, 'crm_segment', segment.segment_id, segment, SEGMENT_PAGE);
  return segment;
}

async function updateSegment(id, body, actor) {
  const before = await db('crm_segment').where('segment_id', id).first();
  if (!before) throw new HttpError(404, 'common.notFound');

  const patch = {};
  ['segment_name', 'segment_description', 'calculation_frequency', 'status'].forEach(function (column) {
    if (body[column] !== undefined) patch[column] = body[column] === '' ? null : body[column];
  });
  if (!Object.keys(patch).length) throw new HttpError(400, 'common.nothingToUpdate');

  const [after] = await db('crm_segment').where('segment_id', id).update(patch).returning('*');
  audit.updated(actor, 'crm_segment', id, before, after, SEGMENT_PAGE);
  return after;
}

/** A new rule is a new version; the old one is closed, not overwritten. */
async function newVersion(id, body, actor) {
  const rule = parseRule(body.rule_expression);
  compile(rule);

  const version = await transaction(async function (trx) {
    const segment = await trx('crm_segment').where('segment_id', id).forUpdate().first();
    if (!segment) throw new HttpError(404, 'common.notFound');

    const last = await trx('crm_segment_version').where('segment_id', id).max({ n: 'version_no' }).first();
    await trx('crm_segment_version').where('segment_id', id).whereNull('effective_to').update({ effective_to: trx.fn.now() });

    const [row] = await trx('crm_segment_version').insert({
      segment_id: id, version_no: Number(last.n || 0) + 1, rule_expression: JSON.stringify(rule),
      created_by_manager_id: actor.manager_id
    }).returning('*');
    await trx('crm_segment').where('segment_id', id).update({ current_version_id: row.segment_version_id });
    return row;
  });

  audit.created(actor, 'crm_segment_version', version.segment_version_id, version, SEGMENT_PAGE);
  return version;
}

/**
 * RE-EVALUATE: who matches the current rule now.
 *
 * Newcomers get a membership row; parties who no longer match get their row
 * closed rather than deleted, so "who was in this segment when the program
 * froze its targets" stays answerable.
 */
async function evaluate(id, actor) {
  const result = await transaction(async function (trx) {
    const segment = await trx('crm_segment').where('segment_id', id).forUpdate().first();
    if (!segment) throw new HttpError(404, 'common.notFound');
    if (segment.status === 'ARCHIVED') throw new HttpError(409, 'crm.thisSegmentIsArchived');

    const version = await trx('crm_segment_version').where('segment_version_id', segment.current_version_id).first();
    const matched = await matchRule(parseRule(version.rule_expression), trx);

    const current = await trx('crm_segment_membership').where('segment_id', id).whereNull('unmatched_at').select('party_id');
    const had = {};
    current.forEach(function (row) { had[row.party_id] = true; });
    const now = {};
    matched.forEach(function (pid) { now[pid] = true; });

    const joining = matched.filter(function (pid) { return !had[pid]; });
    const leaving = current.map(function (row) { return row.party_id; }).filter(function (pid) { return !now[pid]; });

    for (let index = 0; index < joining.length; index += 500) {
      // eslint-disable-next-line no-await-in-loop
      await trx('crm_segment_membership').insert(joining.slice(index, index + 500).map(function (pid) {
        return {
          segment_id: id, segment_version_id: version.segment_version_id, party_id: pid,
          evaluation_reference_date: trx.raw('CURRENT_DATE')
        };
      }));
    }
    if (leaving.length) {
      await trx('crm_segment_membership').where('segment_id', id).whereNull('unmatched_at')
        .whereIn('party_id', leaving).update({ unmatched_at: trx.fn.now() });
    }

    await trx('crm_segment').where('segment_id', id).update({ member_count: matched.length, last_evaluated_at: trx.fn.now() });
    return { members: matched.length, joined: joining.length, left: leaving.length };
  });

  audit.imported(actor, 'crm_segment_membership', Object.assign({ segment_id: id }, result), SEGMENT_PAGE);
  return result;
}

/** How many a rule would match, without saving anything - for the editor's preview. */
async function preview(body) {
  const rule = parseRule(body.rule_expression);
  const ids = await matchRule(rule);
  return { members: ids.length };
}

/* ------------------------------------------------------------ campaigns */

const CAMPAIGN_FLOW = {
  DRAFT: ['APPROVED', 'CANCELLED'],
  APPROVED: ['DRAFT', 'ACTIVE', 'CANCELLED'],
  ACTIVE: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: []
};
const CAMPAIGN_TYPES = ['PROMOTION', 'RETENTION', 'WIN_BACK', 'PRODUCT_LAUNCH', 'SERVICE', 'PROGRAM_NOTICE', 'SURVEY'];

async function searchCampaigns(filters, paging) {
  const qb = function () {
    const query = db('crm_campaign as c').leftJoin('crm_project as j', 'j.project_id', 'c.project_id')
      .leftJoin('managers as m', 'm.id', 'c.owner_manager_id');
    if (filters.campaign_status) query.where('c.campaign_status', filters.campaign_status);
    if (filters.campaign_type) query.where('c.campaign_type', filters.campaign_type);
    if (filters.q) {
      const like = '%' + String(filters.q).trim() + '%';
      query.where(function () { this.where('c.campaign_code', 'ilike', like).orWhere('c.campaign_name', 'ilike', like); });
    }
    return query;
  };
  const count = await qb().count({ c: '*' }).first();
  const rows = await qb().select('c.*', 'j.project_code', 'm.name as owner_name',
    db.raw('(SELECT COALESCE(SUM(member_count), 0) FROM crm_campaign_audience a WHERE a.campaign_id = c.campaign_id)::int AS audience_cnt'),
    db.raw('(SELECT COALESCE(SUM(amount), 0) FROM crm_campaign_cost x WHERE x.campaign_id = c.campaign_id) AS cost_total'))
    .orderBy('c.campaign_id', paging.dir).limit(paging.limit).offset(paging.offset);
  return { rows: rows, total: Number(count.c) };
}

function campaignOptions() {
  return db('crm_campaign').whereNot('campaign_status', 'CANCELLED').orderBy('campaign_id', 'desc').limit(500)
    .select('campaign_id', 'campaign_code', 'campaign_name');
}

async function campaignDetail(id) {
  const campaign = await db('crm_campaign as c')
    .leftJoin('crm_project as j', 'j.project_id', 'c.project_id')
    .leftJoin('managers as mo', 'mo.id', 'c.owner_manager_id')
    .leftJoin('managers as mc', 'mc.id', 'c.created_by_manager_id')
    .leftJoin('managers as ma', 'ma.id', 'c.approved_by_manager_id')
    .where('c.campaign_id', id)
    .first('c.*', 'j.project_code', 'mo.name as owner_name', 'mc.name as created_by_name', 'ma.name as approved_by_name');
  if (!campaign) throw new HttpError(404, 'common.notFound');

  const [audiences, actions, costs, funnel] = await Promise.all([
    db('crm_campaign_audience as a').leftJoin('crm_segment as s', 's.segment_id', 'a.source_segment_id')
      .leftJoin('crm_activity_program as g', 'g.activity_program_id', 'a.source_activity_program_id')
      .where('a.campaign_id', id).orderBy('a.audience_id')
      .select('a.*', 's.segment_name', 'g.program_name'),
    db('crm_campaign_action as x')
      .join('crm_communication_channel as ch', 'ch.channel_id', 'x.channel_id')
      .join('crm_communication_purpose as pp', 'pp.purpose_id', 'x.purpose_id')
      .join('crm_campaign_audience as a', 'a.audience_id', 'x.audience_id')
      .leftJoin('crm_campaign_content as ct', 'ct.content_id', 'x.content_id')
      .where('x.campaign_id', id).orderByRaw('x.execution_order NULLS LAST, x.action_id')
      .select('x.*', 'ch.channel_code', 'ch.channel_name', 'pp.purpose_code', 'pp.purpose_name', 'a.audience_name',
        'ct.title as content_title', 'ct.body as content_body', 'ct.content_type', 'ct.locked_at',
        db.raw(`(SELECT json_object_agg(s.recipient_status, s.n) FROM (
                   SELECT recipient_status, COUNT(*)::int AS n FROM crm_campaign_recipient r
                    WHERE r.action_id = x.action_id GROUP BY recipient_status) s) AS recipients`),
        db.raw(`(SELECT json_object_agg(s.skip_reason_code, s.n) FROM (
                   SELECT skip_reason_code, COUNT(*)::int AS n FROM crm_campaign_recipient r
                    WHERE r.action_id = x.action_id AND r.skip_reason_code IS NOT NULL GROUP BY skip_reason_code) s) AS skipped`)),
    db('crm_campaign_cost as x').leftJoin('managers as m', 'm.id', 'x.created_by_manager_id')
      .where('x.campaign_id', id).orderBy('x.occurred_at', 'desc').select('x.*', 'm.name as created_by_name'),
    db.raw(`SELECT
        (SELECT COALESCE(SUM(member_count), 0) FROM crm_campaign_audience WHERE campaign_id = ?)::int AS audience,
        (SELECT COUNT(*) FROM crm_campaign_recipient WHERE campaign_id = ? AND recipient_status IN ('ELIGIBLE', 'QUEUED', 'SENT', 'DELIVERED'))::int AS reachable,
        (SELECT COUNT(*) FROM crm_campaign_recipient WHERE campaign_id = ? AND recipient_status IN ('SENT', 'DELIVERED'))::int AS sent,
        (SELECT COUNT(*) FROM crm_campaign_interaction WHERE campaign_id = ?)::int AS interactions,
        (SELECT COUNT(*) FROM crm_campaign_conversion WHERE campaign_id = ?)::int AS conversions,
        (SELECT COALESCE(SUM(conversion_value), 0) FROM crm_campaign_conversion WHERE campaign_id = ?) AS conversion_value,
        (SELECT COALESCE(SUM(amount), 0) FROM crm_campaign_cost WHERE campaign_id = ?) AS cost`,
    [id, id, id, id, id, id, id]).then(function (result) { return result.rows[0]; })
  ]);

  return { campaign: campaign, audiences: audiences, actions: actions, costs: costs, funnel: funnel };
}

async function saveCampaign(id, body, actor) {
  const data = {};
  ['project_id', 'campaign_code', 'campaign_name', 'campaign_type', 'description', 'start_at', 'end_at',
    'owner_manager_id'].forEach(function (column) {
    if (body[column] !== undefined) data[column] = body[column] === '' ? null : body[column];
  });
  if (data.campaign_type && CAMPAIGN_TYPES.indexOf(data.campaign_type) === -1) throw new HttpError(400, 'crm.chooseACampaignType');

  if (id) {
    const before = await db('crm_campaign').where('campaign_id', id).first();
    if (!before) throw new HttpError(404, 'common.notFound');
    if (['COMPLETED', 'CANCELLED'].indexOf(before.campaign_status) !== -1) throw new HttpError(409, 'crm.thisCampaignIsFinished');
    const [after] = await db('crm_campaign').where('campaign_id', id).update(data).returning('*');
    audit.updated(actor, 'crm_campaign', id, before, after, CAMPAIGN_PAGE);
    return after;
  }

  if (!data.campaign_code || !data.campaign_name || !data.campaign_type) throw new HttpError(400, 'crm.codeNameAndTypeAreRequired');
  const [row] = await db('crm_campaign').insert(Object.assign(data, {
    campaign_status: 'DRAFT',
    created_by_manager_id: actor.manager_id,
    owner_manager_id: data.owner_manager_id || actor.manager_id
  })).returning('*');
  audit.created(actor, 'crm_campaign', row.campaign_id, row, CAMPAIGN_PAGE);
  return row;
}

async function transitionCampaign(id, status, actor) {
  const result = await transaction(async function (trx) {
    const campaign = await trx('crm_campaign').where('campaign_id', id).forUpdate().first();
    if (!campaign) throw new HttpError(404, 'common.notFound');
    if ((CAMPAIGN_FLOW[campaign.campaign_status] || []).indexOf(status) === -1) {
      throw new HttpError(409, 'crm.cannotMoveFromTo', null, { from: campaign.campaign_status, to: status });
    }

    const patch = { campaign_status: status };
    if (status === 'APPROVED') {
      if (String(campaign.created_by_manager_id) === String(actor.manager_id)) throw new HttpError(409, 'crm.anotherManagerMustApprove');
      patch.approved_by_manager_id = actor.manager_id;
      patch.approved_at = trx.fn.now();
    }
    if (status === 'DRAFT') { patch.approved_by_manager_id = null; patch.approved_at = null; }
    if (status === 'COMPLETED') patch.completed_at = trx.fn.now();
    if (status === 'CANCELLED') {
      await trx('crm_campaign_action').where('campaign_id', id).whereNotIn('action_status', ['COMPLETE', 'CANCELLED'])
        .update({ action_status: 'CANCELLED' });
    }

    const [after] = await trx('crm_campaign').where('campaign_id', id).update(patch).returning('*');
    return { before: campaign, after: after };
  });
  audit.updated(actor, 'crm_campaign', id, result.before, result.after, CAMPAIGN_PAGE);
  return result.after;
}

async function openCampaign(trx, id) {
  const campaign = await trx('crm_campaign').where('campaign_id', id).forUpdate().first();
  if (!campaign) throw new HttpError(404, 'common.notFound');
  if (['COMPLETED', 'CANCELLED'].indexOf(campaign.campaign_status) !== -1) throw new HttpError(409, 'crm.thisCampaignIsFinished');
  return campaign;
}

/** FREEZE AN AUDIENCE: the parties it names today are the ones it will always name. */
async function addAudience(id, body, actor) {
  const types = ['SEGMENT', 'RULE', 'MANUAL', 'PROGRAM_TARGETS'];
  if (types.indexOf(body.audience_type) === -1) throw new HttpError(400, 'crm.chooseAnAudienceType');
  if (!body.audience_name) throw new HttpError(400, 'crm.nameTheAudience');

  const result = await transaction(async function (trx) {
    await openCampaign(trx, id);

    let members = [];
    let rule = null;
    if (body.audience_type === 'SEGMENT') {
      if (!body.source_segment_id) throw new HttpError(400, 'crm.chooseASegment');
      members = (await trx('crm_segment_membership as m').join('crm_party as p', 'p.party_id', 'm.party_id')
        .where('m.segment_id', body.source_segment_id).whereNull('m.unmatched_at').where('p.party_status', 'ACTIVE')
        .select('m.party_id', 'm.segment_membership_id'))
        .map(function (row) { return { party_id: row.party_id, source_segment_membership_id: row.segment_membership_id }; });
    } else if (body.audience_type === 'PROGRAM_TARGETS') {
      if (!body.source_activity_program_id) throw new HttpError(400, 'crm.chooseAProgram');
      members = (await trx('crm_activity_target as t').join('crm_party as p', 'p.party_id', 't.party_id')
        .where('t.activity_program_id', body.source_activity_program_id).whereNot('t.status', 'REVOKED')
        .where('p.party_status', 'ACTIVE')
        .select('t.party_id', 't.activity_target_id'))
        .map(function (row) { return { party_id: row.party_id, source_activity_target_id: row.activity_target_id }; });
    } else if (body.audience_type === 'RULE') {
      rule = parseRule(body.rule_expression);
      members = (await matchRule(rule, trx)).map(function (pid) { return { party_id: pid }; });
    } else {
      const ids = (Array.isArray(body.party_ids) ? body.party_ids : String(body.party_ids || '').split(/[\s,]+/))
        .map(Number).filter(Boolean);
      if (!ids.length) throw new HttpError(400, 'crm.chooseAtLeastOneCustomer');
      members = (await trx('crm_party').whereIn('party_id', ids).where('party_status', 'ACTIVE').select('party_id'))
        .map(function (row) { return { party_id: row.party_id }; });
    }

    /* One entry per party even if the source lists somebody twice. */
    const seen = {};
    members = members.filter(function (member) { if (seen[member.party_id]) return false; seen[member.party_id] = true; return true; });

    const [audience] = await trx('crm_campaign_audience').insert({
      campaign_id: id,
      audience_name: body.audience_name,
      audience_type: body.audience_type,
      source_segment_id: body.audience_type === 'SEGMENT' ? body.source_segment_id : null,
      source_activity_program_id: body.audience_type === 'PROGRAM_TARGETS' ? body.source_activity_program_id : null,
      rule_expression: rule ? JSON.stringify(rule) : null,
      snapshot_at: trx.fn.now(),
      member_count: members.length
    }).returning('*');

    for (let index = 0; index < members.length; index += 500) {
      // eslint-disable-next-line no-await-in-loop
      await trx('crm_campaign_audience_member').insert(members.slice(index, index + 500).map(function (member) {
        return Object.assign({ audience_id: audience.audience_id, campaign_id: id }, member);
      }));
    }
    return audience;
  });

  audit.created(actor, 'crm_campaign_audience', result.audience_id, result, CAMPAIGN_PAGE);
  return result;
}

async function saveAction(campaignId, actionId, body, actor) {
  const result = await transaction(async function (trx) {
    await openCampaign(trx, campaignId);

    let action = null;
    if (actionId) {
      action = await trx('crm_campaign_action').where({ action_id: actionId, campaign_id: campaignId }).forUpdate().first();
      if (!action) throw new HttpError(404, 'common.notFound');
      if (action.action_status !== 'DRAFT') throw new HttpError(409, 'crm.onlyADraftActionCanChange');
    }

    const channel = await trx('crm_communication_channel').where('channel_id', body.channel_id || (action && action.channel_id)).first();
    if (!channel) throw new HttpError(400, 'crm.chooseAChannel');

    /* The message itself, one content row per action. */
    let contentId = action ? action.content_id : null;
    const content = {
      content_type: { EMAIL: 'EMAIL', SMS: 'SMS', PUSH: 'PUSH', IN_APP: 'IN_APP' }[channel.channel_code] || 'IN_APP',
      content_name: body.action_name || null,
      title: body.content_title || null,
      body: body.content_body || null,
      landing_page_url: body.landing_page_url || null,
      language_code: body.language_code || null
    };
    if (contentId) await trx('crm_campaign_content').where('content_id', contentId).update(content);
    else contentId = (await trx('crm_campaign_content').insert(content).returning('content_id'))[0];
    if (contentId && typeof contentId === 'object') contentId = contentId.content_id;

    const data = {
      campaign_id: campaignId,
      audience_id: body.audience_id || (action && action.audience_id),
      action_name: body.action_name || null,
      action_type: body.action_type || ({ PHONE_CALL: 'CALL', PUSH: 'PUSH', IN_APP: 'IN_APP' }[channel.channel_code] || 'SEND_MESSAGE'),
      channel_id: channel.channel_id,
      purpose_id: body.purpose_id || (action && action.purpose_id),
      content_id: contentId,
      execution_order: body.execution_order === '' ? null : (body.execution_order || null),
      scheduled_at: body.scheduled_at || null,
      attribution_window_days: body.attribution_window_days || 14
    };
    if (!data.audience_id || !data.purpose_id) throw new HttpError(400, 'crm.audienceAndPurposeAreRequired');

    if (action) {
      const rows = await trx('crm_campaign_action').where('action_id', actionId).update(data).returning('*');
      return rows[0];
    }
    const rows = await trx('crm_campaign_action').insert(data).returning('*');
    return rows[0];
  });

  audit.updated(actor, 'crm_campaign_action', result.action_id, null, result, CAMPAIGN_PAGE);
  return result;
}

/**
 * PREPARE AN ACTION: decide, for every frozen member, whether they may be
 * contacted this way.
 *
 * In order, and the first reason that applies is the one recorded:
 *   NO_OPTION   the project does not offer this purpose on this channel;
 *   OPTED_OUT   the member said no, or withdrew;
 *   NO_CONSENT  the purpose needs an opt-in and there is none;
 *   NO_CONTACT  there is nothing to send it to.
 * Everyone else is ELIGIBLE, with the address it will go to copied onto the
 * row - so a later change of number does not change what was prepared. The
 * message is locked from here on: what members were chosen for is what they
 * will be sent.
 */
async function prepareAction(campaignId, actionId, actor) {
  const result = await transaction(async function (trx) {
    const campaign = await openCampaign(trx, campaignId);
    if (['APPROVED', 'ACTIVE'].indexOf(campaign.campaign_status) === -1) throw new HttpError(409, 'crm.approveTheCampaignFirst');

    const action = await trx('crm_campaign_action').where({ action_id: actionId, campaign_id: campaignId }).forUpdate().first();
    if (!action) throw new HttpError(404, 'common.notFound');
    if (action.action_status !== 'DRAFT') throw new HttpError(409, 'crm.thisActionIsAlreadyPrepared');

    const channel = await trx('crm_communication_channel').where('channel_id', action.channel_id).first();
    const purpose = await trx('crm_communication_purpose').where('purpose_id', action.purpose_id).first();
    const projectId = campaign.project_id || await vocabulary.idOf('crm_project', 'PLATFORM', trx);
    /* The option, enabled or not: a disabled one is a reason of its own, not "not offered". */
    const option = await trx('crm_project_communication_option')
      .where({ project_id: projectId, purpose_id: action.purpose_id, channel_id: action.channel_id }).first();

    const members = await trx('crm_campaign_audience_member as m')
      .leftJoin('crm_party_communication_consent as c', function () {
        this.on('c.party_id', 'm.party_id')
          .andOn('c.project_communication_option_id', trx.raw('?', [option ? option.project_communication_option_id : 0]));
      })
      .where('m.audience_id', action.audience_id)
      .select('m.audience_member_id', 'm.party_id', 'c.party_communication_consent_id', 'c.consent_status',
        'c.contact_point_id', 'c.effective_from', 'c.effective_to');

    /* Every contact of the right type, active or not - a retired chosen contact is INVALID_CONTACT, not NO_CONTACT. */
    const contacts = channel.required_contact_type
      ? await trx('crm_contact_point').whereIn('party_id', members.map(function (member) { return member.party_id; }))
        .where('contact_type', channel.required_contact_type)
        .orderBy([{ column: 'is_primary', order: 'desc' }, { column: 'is_verified', order: 'desc' }, { column: 'contact_point_id' }])
      : [];
    const chosen = {};
    const usable = {};
    const now = new Date();
    const live = function (contact) {
      return contact.status === 'ACTIVE' && (!contact.valid_to || new Date(contact.valid_to) > now) && (!contact.valid_from || new Date(contact.valid_from) <= now);
    };
    contacts.forEach(function (contact) {
      chosen[contact.contact_point_id] = contact;
      if (live(contact) && !usable[contact.party_id]) usable[contact.party_id] = contact;
    });
    const needsOptIn = option ? (option.consent_required || purpose.requires_opt_in) : true;
    const inForce = function (member) {
      return (!member.effective_from || new Date(member.effective_from) <= now) && (!member.effective_to || new Date(member.effective_to) > now);
    };

    /*
     * The decision per member, first reason wins (design 12.4):
     *   PROJECT_OPTION_DISABLED  the project does not (or no longer) offer this purpose on this channel
     *   WITHDRAWN / DENIED       the member said no
     *   NO_CONSENT               the option needs an opt-in and there is none in force
     *   INVALID_CONTACT          the contact the member chose, or every one they have of the channel's
     *                            type, is retired, invalid or out of date
     *   NO_CONTACT               they have nothing of the channel's type at all
     */
    const tally = {};
    const rows = members.map(function (member) {
      let reason = null;
      let point = null;
      if (!option || !option.is_enabled) reason = 'PROJECT_OPTION_DISABLED';
      else if (member.consent_status === 'WITHDRAWN') reason = 'WITHDRAWN';
      else if (member.consent_status === 'DENIED') reason = 'DENIED';
      else if (needsOptIn && !(member.consent_status === 'GRANTED' && inForce(member))) reason = 'NO_CONSENT';
      else if (channel.required_contact_type) {
        const picked = member.contact_point_id ? chosen[member.contact_point_id] : null;
        if (picked && picked.party_id === member.party_id && live(picked)) point = picked;
        else if (!picked) point = usable[member.party_id] || null;
        if (!point) {
          const hasType = contacts.some(function (contact) { return contact.party_id === member.party_id; });
          reason = picked || hasType ? 'INVALID_CONTACT' : 'NO_CONTACT';
        }
      }
      const status = reason ? 'SKIPPED' : 'ELIGIBLE';
      tally[reason || status] = (tally[reason || status] || 0) + 1;
      return {
        action_id: actionId,
        campaign_id: campaignId,
        audience_member_id: member.audience_member_id,
        party_id: member.party_id,
        contact_point_id: point ? point.contact_point_id : null,
        party_communication_consent_id: member.party_communication_consent_id || null,
        destination_snapshot: point ? point.contact_value : null,
        recipient_status: status,
        skip_reason_code: reason
      };
    });

    for (let index = 0; index < rows.length; index += 500) {
      // eslint-disable-next-line no-await-in-loop
      await trx('crm_campaign_recipient').insert(rows.slice(index, index + 500));
    }
    if (action.content_id) await trx('crm_campaign_content').where('content_id', action.content_id).update({ locked_at: trx.fn.now() });
    await trx('crm_campaign_action').where('action_id', actionId).update({ action_status: 'READY' });

    return tally;
  });

  audit.imported(actor, 'crm_campaign_recipient', Object.assign({ action_id: actionId }, result), CAMPAIGN_PAGE);
  return result;
}

async function setActionStatus(campaignId, actionId, status, actor) {
  const flow = { READY: ['RUNNING', 'CANCELLED'], RUNNING: ['COMPLETE', 'CANCELLED'], DRAFT: ['CANCELLED'] };
  const before = await db('crm_campaign_action').where({ action_id: actionId, campaign_id: campaignId }).first();
  if (!before) throw new HttpError(404, 'common.notFound');
  if ((flow[before.action_status] || []).indexOf(status) === -1) {
    throw new HttpError(409, 'crm.cannotMoveFromTo', null, { from: before.action_status, to: status });
  }
  const [after] = await db('crm_campaign_action').where('action_id', actionId).update({ action_status: status }).returning('*');
  audit.updated(actor, 'crm_campaign_action', actionId, before, after, CAMPAIGN_PAGE);
  return after;
}

async function addCost(campaignId, body, actor) {
  const types = ['MEDIA', 'SMS', 'EMAIL_PROVIDER', 'COUPON', 'AGENCY', 'PRIZE', 'OTHER'];
  if (types.indexOf(body.cost_type) === -1) throw new HttpError(400, 'crm.chooseACostType');
  const campaign = await db('crm_campaign').where('campaign_id', campaignId).first();
  if (!campaign) throw new HttpError(404, 'common.notFound');

  const [row] = await db('crm_campaign_cost').insert({
    campaign_id: campaignId,
    action_id: body.action_id || null,
    cost_type: body.cost_type,
    amount: body.amount,
    currency_code: body.currency_code || 'USD',
    occurred_at: body.occurred_at || db.fn.now(),
    created_by_manager_id: actor.manager_id
  }).returning('*');
  audit.created(actor, 'crm_campaign_cost', row.campaign_cost_id, row, CAMPAIGN_PAGE);
  return row;
}

async function removeCost(campaignId, costId, actor) {
  const before = await db('crm_campaign_cost').where({ campaign_cost_id: costId, campaign_id: campaignId }).first();
  if (!before) throw new HttpError(404, 'common.notFound');
  await db('crm_campaign_cost').where('campaign_cost_id', costId).del();
  audit.deleted(actor, 'crm_campaign_cost', costId, before, CAMPAIGN_PAGE);
}

async function recipients(campaignId, actionId, filters, paging) {
  const qb = function () {
    const query = db('crm_campaign_recipient as r').join('crm_party as p', 'p.party_id', 'r.party_id')
      .where({ 'r.campaign_id': campaignId, 'r.action_id': actionId });
    if (filters.recipient_status) query.where('r.recipient_status', filters.recipient_status);
    return query;
  };
  const count = await qb().count({ c: '*' }).first();
  const rows = await qb().select('r.*', 'p.party_no', 'p.display_name as party_name')
    .orderBy('r.recipient_id').limit(paging.limit).offset(paging.offset);
  return { rows: rows, total: Number(count.c) };
}

module.exports = {
  SEGMENT_PAGE: SEGMENT_PAGE,
  CAMPAIGN_PAGE: CAMPAIGN_PAGE,
  fields: fields,
  compile: compile,
  matchRule: matchRule,
  searchSegments: searchSegments,
  segmentOptions: segmentOptions,
  segmentDetail: segmentDetail,
  segmentMembers: segmentMembers,
  createSegment: createSegment,
  updateSegment: updateSegment,
  newVersion: newVersion,
  evaluate: evaluate,
  preview: preview,
  searchCampaigns: searchCampaigns,
  campaignOptions: campaignOptions,
  campaignDetail: campaignDetail,
  saveCampaign: saveCampaign,
  transitionCampaign: transitionCampaign,
  addAudience: addAudience,
  saveAction: saveAction,
  prepareAction: prepareAction,
  setActionStatus: setActionStatus,
  addCost: addCost,
  removeCost: removeCost,
  recipients: recipients
};
