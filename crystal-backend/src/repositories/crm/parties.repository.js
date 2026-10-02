const db = require('../../config/db');
const contact = require('../../services/crm/contact');

/**
 * Parties: the reads.
 *
 * A party is who a customer IS across every project - one row whether they
 * signed up on the Crystal site, registered a television on the eproduct
 * site, bought on the Eshop or walked into a service centre with no account
 * at all. Everything else in the CRM hangs off party_id, so the questions
 * asked here are mostly "which party is this" and "what do we know about
 * them".
 */

const SORTABLE = {
  party_id: 'p.party_id',
  party_no: 'p.party_no',
  display_name: 'p.display_name',
  last_seen_at: 'p.last_seen_at',
  created_at: 'p.created_at',
  corporate_score: 's.corporate_score',
  purchase_amount_12m: 's.purchase_amount_12m'
};

/*
 * EACH PARTY'S LATEST DREAM-WIDE SNAPSHOT, as a lateral join: the list shows
 * and filters by grade, score, spend and activity without the client asking
 * the analysis for each row.
 */
const LATEST = `LEFT JOIN LATERAL (
    SELECT x.corporate_score, x.corporate_grade_id, x.purchase_amount_12m, x.activity_status,
           x.transaction_count_12m, x.reference_date
      FROM crm_party_analysis_snapshot x
     WHERE x.party_id = p.party_id AND x.project_id IS NULL
     ORDER BY x.reference_date DESC LIMIT 1) s ON true`;

/** The filters the list and the lookup share. */
function narrowed(filters) {
  const qb = db('crm_party as p').joinRaw(LATEST);

  if (filters.corporate_grade_id) qb.where('s.corporate_grade_id', filters.corporate_grade_id);
  if (filters.activity_status) qb.where('s.activity_status', filters.activity_status);

  if (filters.party_status) qb.where('p.party_status', filters.party_status);
  // Merged and deleted parties are history, not customers: out of the way unless asked for.
  else qb.whereIn('p.party_status', ['ACTIVE', 'INACTIVE']);

  if (filters.party_type) qb.where('p.party_type', filters.party_type);

  if (filters.project_id) {
    qb.whereExists(function () {
      this.select(db.raw(1)).from('crm_project_account as a')
        .whereRaw('a.party_id = p.party_id')
        .where('a.project_id', filters.project_id)
        .whereNull('a.unlinked_at');
    });
  }

  if (filters.q) {
    const term = String(filters.q).trim();
    const forms = contact.searchForms(term);

    qb.where(function () {
      this.where('p.party_no', 'ilike', '%' + term + '%')
        .orWhere('p.display_name', 'ilike', '%' + term + '%');

      forms.forEach((form) => {
        this.orWhereExists(function () {
          this.select(db.raw(1)).from('crm_contact_point as c')
            .whereRaw('c.party_id = p.party_id')
            .where('c.normalized_value', 'like', '%' + form + '%');
        });
      });

      /* An account number another project gave them - a platform login, an Eshop id. */
      this.orWhereExists(function () {
        this.select(db.raw(1)).from('crm_project_account as a')
          .whereRaw('a.party_id = p.party_id')
          .where(function () {
            this.where('a.external_account_id', term).orWhere('a.external_login', 'ilike', term);
          });
      });
    });
  }

  return qb;
}

/** The first active contact of a kind, primary first - as a correlated subquery. */
function firstContact(type, alias) {
  return db.raw(
    `(SELECT c.contact_value FROM crm_contact_point c
       WHERE c.party_id = p.party_id AND c.contact_type = ? AND c.status = 'ACTIVE'
       ORDER BY c.is_primary DESC, c.contact_point_id LIMIT 1) AS ??`,
    [type, alias]
  );
}

async function search(filters, paging) {
  const count = await narrowed(filters).count({ c: '*' }).first();

  const rows = await narrowed(filters)
    .leftJoin('crm_project as o', 'o.project_id', 'p.origin_project_id')
    .select(
      'p.party_id', 'p.party_no', 'p.party_type', 'p.party_status', 'p.display_name',
      'p.origin_project_id', 'o.project_code as origin_project_code',
      'p.first_seen_at', 'p.last_seen_at', 'p.created_at',
      firstContact('MOBILE', 'mobile'),
      firstContact('EMAIL', 'email'),
      db.raw(`(SELECT string_agg(DISTINCT pj.project_code, ',')
                 FROM crm_project_account a JOIN crm_project pj ON pj.project_id = a.project_id
                WHERE a.party_id = p.party_id AND a.unlinked_at IS NULL) AS projects`),
      db.raw(`(SELECT COUNT(*) FROM crm_product_registration r
                WHERE r.party_id = p.party_id AND r.valid_to IS NULL)::int AS holding_cnt`),
      db.raw(`(SELECT COUNT(*) FROM crm_service_case sc
                WHERE sc.party_id = p.party_id)::int AS case_cnt`),
      's.corporate_score', 's.purchase_amount_12m', 's.activity_status', 's.transaction_count_12m',
      db.raw('(SELECT g.grade_code FROM crm_corporate_grade g WHERE g.corporate_grade_id = s.corporate_grade_id) AS grade_code')
    )
    .orderByRaw((SORTABLE[paging.sort] || 'p.party_id') + ' ' + (paging.dir === 'asc' ? 'ASC' : 'DESC') + ' NULLS LAST')
    .limit(paging.limit)
    .offset(paging.offset);

  return { rows: rows, total: Number(count.c) };
}

/** Twenty matches for a picker: enough to choose from, few enough to be quick. */
function lookup(term, ids) {
  const qb = narrowed({ q: term })
    .select('p.party_id', 'p.party_no', 'p.party_type', 'p.display_name', firstContact('MOBILE', 'mobile'))
    .orderBy('p.party_id', 'desc')
    .limit(20);

  if (ids && ids.length) {
    return db('crm_party as p').whereIn('p.party_id', ids)
      .select('p.party_id', 'p.party_no', 'p.party_type', 'p.display_name', firstContact('MOBILE', 'mobile'));
  }
  return qb;
}

function findParty(id, trx) {
  return (trx || db)('crm_party').where('party_id', id).first();
}

function lockParty(id, trx) {
  return trx('crm_party').where('party_id', id).forUpdate().first();
}

/**
 * EVERYTHING KNOWN ABOUT ONE PARTY, for the customer screen.
 *
 * Each list is capped: the screen is a summary with a way into each domain,
 * not an export, and a reseller who has registered four thousand devices
 * should not take the page down with them.
 */
async function detail(id) {
  const party = await db('crm_party as p')
    .leftJoin('crm_project as o', 'o.project_id', 'p.origin_project_id')
    .leftJoin('crm_party as m', 'm.party_id', 'p.merged_into_party_id')
    .where('p.party_id', id)
    .first('p.*', 'o.project_code as origin_project_code', 'o.project_name as origin_project_name',
      'm.party_no as merged_into_party_no');
  if (!party) return null;

  const [
    person, organization, contacts, accounts, memberships, holdings, transfers, cases,
    pointAccounts, pointEvents, targets, reservations, awards, activities, consents,
    segments, classStats, merges, snapshot
  ] = await Promise.all([
    db('crm_person as x').leftJoin('crm_location as l', 'l.location_id', 'x.home_location_id')
      .where('x.party_id', id).first('x.*', 'l.location_name as home_location_name'),
    db('crm_organization').where('party_id', id).first(),
    db('crm_contact_point as c').leftJoin('crm_project as j', 'j.project_id', 'c.source_project_id')
      .where('c.party_id', id)
      .orderBy([{ column: 'c.status' }, { column: 'c.contact_type' }, { column: 'c.is_primary', order: 'desc' }])
      .select('c.*', 'j.project_code as source_project_code'),
    db('crm_project_account as a').join('crm_project as j', 'j.project_id', 'a.project_id')
      .where('a.party_id', id).orderBy([{ column: 'a.unlinked_at', order: 'desc' }, { column: 'j.project_id' }])
      .select('a.*', 'j.project_code', 'j.project_name'),
    db('crm_membership as m').join('crm_project as j', 'j.project_id', 'm.project_id')
      .leftJoin('crm_project_tier as t', 't.project_tier_id', 'm.current_tier_id')
      .where('m.party_id', id).orderBy('j.project_id')
      .select('m.*', 'j.project_code', 't.tier_code', 't.tier_name'),
    db('crm_product_registration as r')
      .join('crm_product_instance as i', 'i.product_instance_id', 'r.product_instance_id')
      .join('crm_product_catalog as c', 'c.product_id', 'i.product_id')
      .join('crm_project as j', 'j.project_id', 'r.project_id')
      .leftJoin('crm_product_class as k', 'k.product_class_id', 'c.product_class_id')
      .leftJoin('crm_product_relationship_type as t', 't.relationship_type_id', 'r.relationship_type_id')
      .where('r.party_id', id)
      .orderByRaw('r.valid_to IS NULL DESC, r.valid_from DESC')
      .limit(100)
      .select('r.*', 'i.external_product_instance_id', 'i.serial_number', 'i.imei', 'i.instance_kind',
        'i.status as instance_status', 'c.product_name', 'c.product_code', 'k.class_code', 'k.class_name',
        't.relationship_name', 'j.project_code'),
    db('crm_product_transfer as x')
      .join('crm_product_instance as i', 'i.product_instance_id', 'x.product_instance_id')
      .join('crm_product_catalog as c', 'c.product_id', 'i.product_id')
      .leftJoin('crm_party as f', 'f.party_id', 'x.from_party_id')
      .leftJoin('crm_party as t', 't.party_id', 'x.to_party_id')
      .where(function () { this.where('x.from_party_id', id).orWhere('x.to_party_id', id); })
      .orderBy('x.requested_at', 'desc').limit(50)
      .select('x.*', 'c.product_name', 'i.external_product_instance_id',
        'f.display_name as from_name', 't.display_name as to_name'),
    db('crm_service_case as s')
      .join('crm_service_case_type as ct', 'ct.case_type_id', 's.case_type_id')
      .join('crm_service_status as st', 'st.service_status_id', 's.service_status_id')
      .join('crm_project as j', 'j.project_id', 's.project_id')
      .leftJoin('crm_service_location as l', 'l.service_location_id', 's.service_location_id')
      .where('s.party_id', id).orderBy('s.received_at', 'desc').limit(50)
      .select('s.case_id', 's.external_case_id', 's.title', 's.received_at', 's.closed_at', 's.is_warranty',
        's.crystal_repair_ticket_id', 'ct.case_type_code', 'ct.display_name as case_type_name',
        'st.status_code', 'st.display_name as status_name', 'st.is_terminal', 'j.project_code',
        'l.location_name'),
    db('crm_point_account as a').join('crm_point_type as t', 't.point_type_id', 'a.point_type_id')
      .where('a.party_id', id).orderBy('t.point_type_id')
      .select('a.*', 't.point_type_code', 't.point_type_name', 't.decimal_places'),
    db('crm_point_event as e')
      .join('crm_point_account as a', 'a.point_account_id', 'e.point_account_id')
      .join('crm_point_type as t', 't.point_type_id', 'a.point_type_id')
      .join('crm_point_event_type as et', 'et.point_event_type_id', 'e.point_event_type_id')
      .join('crm_project as j', 'j.project_id', 'e.project_id')
      .where('a.party_id', id).orderBy([{ column: 'e.occurred_at', order: 'desc' }, { column: 'e.point_event_id', order: 'desc' }]).limit(30)
      .select('e.*', 't.point_type_code', 'et.event_code', 'j.project_code'),
    db('crm_activity_target as x').join('crm_activity_program as g', 'g.activity_program_id', 'x.activity_program_id')
      .leftJoin('crm_activity_program_tier as t', 't.program_tier_id', 'x.program_tier_id')
      .where('x.party_id', id).orderBy('x.created_at', 'desc').limit(50)
      .select('x.*', 'g.program_code', 'g.program_name', 'g.program_type', 'g.status as program_status', 't.tier_name'),
    db('crm_activity_reservation as r').join('crm_activity_program as g', 'g.activity_program_id', 'r.activity_program_id')
      .leftJoin('crm_service_location as l', 'l.service_location_id', 'r.service_location_id')
      .where('r.party_id', id).orderBy('r.created_at', 'desc').limit(50)
      .select('r.reservation_id', 'r.reservation_code', 'r.entry_type', 'r.status', 'r.reserved_at',
        'r.fulfilled_at', 'g.program_name', 'g.program_code', 'l.location_name'),
    db('crm_activity_award as w').join('crm_activity_reward as rw', 'rw.reward_id', 'w.reward_id')
      .join('crm_activity_program as g', 'g.activity_program_id', 'w.activity_program_id')
      .where('w.party_id', id).orderBy('w.awarded_at', 'desc').limit(50)
      .select('w.award_id', 'w.status', 'w.fulfilment_method', 'w.awarded_at', 'w.fulfilled_at',
        'rw.reward_name', 'rw.reward_type', 'g.program_name'),
    db('crm_location_activity as x')
      .join('crm_location_activity_type as t', 't.activity_type_id', 'x.activity_type_id')
      .join('crm_service_location as l', 'l.service_location_id', 'x.service_location_id')
      .where('x.party_id', id).orderBy('x.occurred_at', 'desc').limit(30)
      .select('x.location_activity_id', 'x.occurred_at', 'x.quantity', 'x.amount', 'x.status',
        't.activity_code', 't.activity_name', 'l.location_name'),
    db('crm_project_communication_option as o')
      .join('crm_project as j', 'j.project_id', 'o.project_id')
      .join('crm_communication_purpose as pp', 'pp.purpose_id', 'o.purpose_id')
      .join('crm_communication_channel as ch', 'ch.channel_id', 'o.channel_id')
      .leftJoin('crm_party_communication_consent as c', function () {
        this.on('c.project_communication_option_id', 'o.project_communication_option_id')
          .andOn('c.party_id', db.raw('?', [id]));
      })
      .leftJoin('crm_contact_point as cp', 'cp.contact_point_id', 'c.contact_point_id')
      .where('o.is_enabled', true)
      .orderBy([{ column: 'j.project_id' }, { column: 'pp.purpose_id' }, { column: 'ch.channel_id' }])
      .select('o.project_communication_option_id', 'o.consent_required', 'j.project_code',
        'pp.purpose_code', 'pp.purpose_name', 'ch.channel_code', 'ch.channel_name',
        'c.party_communication_consent_id', 'c.consent_status', 'c.captured_at', 'c.captured_via',
        'c.contact_point_id', 'cp.contact_value'),
    db('crm_segment_membership as m').join('crm_segment as s', 's.segment_id', 'm.segment_id')
      .where('m.party_id', id).whereNull('m.unmatched_at')
      .select('s.segment_id', 's.segment_code', 's.segment_name', 'm.matched_at'),
    db('crm_party_product_class_stat as s').join('crm_product_class as k', 'k.product_class_id', 's.product_class_id')
      .where('s.party_id', id).orderBy([{ column: 'k.product_domain' }, { column: 'k.class_code' }])
      .select('s.*', 'k.class_code', 'k.class_name', 'k.parent_product_class_id'),
    db('crm_party_merge_history as h')
      .leftJoin('crm_party as s', 's.party_id', 'h.surviving_party_id')
      .leftJoin('crm_party as m', 'm.party_id', 'h.merged_party_id')
      .where('h.surviving_party_id', id).orWhere('h.merged_party_id', id)
      .orderBy('h.merged_at', 'desc')
      .select('h.merge_id', 'h.surviving_party_id', 'h.merged_party_id', 'h.merge_reason', 'h.merge_method',
        'h.merged_at', 'h.moved_rows', 's.party_no as surviving_party_no', 'm.party_no as merged_party_no'),
    db('crm_party_analysis_snapshot as s').leftJoin('crm_corporate_grade as g', 'g.corporate_grade_id', 's.corporate_grade_id')
      .where('s.party_id', id).whereNull('s.project_id').orderBy('s.reference_date', 'desc')
      .first('s.*', 'g.grade_code', 'g.grade_name')
  ]);

  return {
    party: party,
    person: person || null,
    organization: organization || null,
    contacts: contacts,
    accounts: accounts,
    memberships: memberships,
    holdings: holdings,
    transfers: transfers,
    cases: cases,
    point_accounts: pointAccounts,
    point_events: pointEvents,
    targets: targets,
    reservations: reservations,
    awards: awards,
    activities: activities,
    consents: consents,
    segments: segments,
    class_stats: classStats,
    merges: merges,
    snapshot: snapshot || null
  };
}

/** Parties sharing an active contact value, for the duplicate queue. */
function pendingCandidates(paging) {
  const base = db('crm_identity_match_candidate as m').where('m.match_status', 'PENDING');

  return Promise.all([
    base.clone().count({ c: '*' }).first(),
    base.clone()
      .join('crm_party as i', 'i.party_id', 'm.incoming_party_id')
      .join('crm_party as c', 'c.party_id', 'm.candidate_party_id')
      .join('crm_project as j', 'j.project_id', 'm.incoming_project_id')
      .orderBy('m.created_at', 'desc')
      .limit(paging.limit).offset(paging.offset)
      .select('m.*', 'j.project_code as incoming_project_code',
        'i.party_no as incoming_party_no', 'i.display_name as incoming_name', 'i.party_status as incoming_status',
        'c.party_no as candidate_party_no', 'c.display_name as candidate_name', 'c.party_status as candidate_status')
  ]).then(function (res) { return { rows: res[1], total: Number(res[0].c) }; });
}

module.exports = {
  SORTABLE: SORTABLE,
  search: search,
  lookup: lookup,
  findParty: findParty,
  lockParty: lockParty,
  detail: detail,
  pendingCandidates: pendingCandidates
};
