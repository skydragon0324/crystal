const db = require('../../config/db');
const contact = require('../../services/crm/contact');
const locations = require('../../services/crm/locations');
const { searchId } = require('../../services/crm/partyId');

/**
 * Parties: the reads.
 *
 * A party is who a customer IS across every project - one row whether they
 * signed up on the Crystal site, registered a television on the eproduct
 * site, bought on the Eshop or walked into a service centre with no account
 * at all. Everything else in the CRM hangs off party_pk, so the questions
 * asked here are mostly "which party is this" and "what do we know about
 * them".
 */

const SORTABLE = {
  party_pk: 'party.party_pk',
  display_name: 'party.display_name',
  last_seen_at: 'party.last_seen_at',
  created_at: 'party.created_at',
  corporate_score: 'snapshot.corporate_score',
  purchase_amount_12m: 'snapshot.purchase_amount_12m'
};

/*
 * EACH PARTY'S LATEST DREAM-WIDE SNAPSHOT, as a lateral join: the list shows
 * and filters by grade, score, spend and activity without the client asking
 * the analysis for each row.
 */
const LATEST = `LEFT JOIN LATERAL (
    SELECT analysis.corporate_score, analysis.corporate_grade_id, analysis.purchase_amount_12m, analysis.activity_status,
           analysis.transaction_count_12m, analysis.reference_date
      FROM crm_party_analysis_snapshot analysis
     WHERE analysis.party_pk = party.party_pk AND analysis.project_id IS NULL
     ORDER BY analysis.reference_date DESC LIMIT 1) snapshot ON true`;

/** The filters the list and the lookup share. */
function narrowed(filters) {
  const qb = db('crm_party as party').joinRaw(LATEST);

  // A grade set by hand stands in for the computed one.
  if (filters.corporate_grade_id) qb.whereRaw('COALESCE(party.assigned_grade_id, snapshot.corporate_grade_id) = ?', [filters.corporate_grade_id]);
  if (filters.activity_status) qb.where('snapshot.activity_status', filters.activity_status);

  if (filters.party_status) qb.where('party.party_status', filters.party_status);
  // Merged and deleted parties are history, not customers: out of the way unless asked for.
  else qb.whereIn('party.party_status', ['ACTIVE', 'INACTIVE']);

  if (filters.party_type) qb.where('party.party_type', filters.party_type);

  /* People a manager has not looked at by hand yet ('0'), or has ('1'). */
  if (filters.is_checked_manually === '0' || filters.is_checked_manually === '1') {
    qb.whereExists(function () {
      this.select(db.raw(1)).from('crm_person as person')
        .whereRaw('person.party_pk = party.party_pk')
        .where('person.is_checked_manually', filters.is_checked_manually === '1');
    });
  }

  if (filters.project_id) {
    qb.whereExists(function () {
      this.select(db.raw(1)).from('crm_project_account as account')
        .whereRaw('account.party_pk = party.party_pk')
        .where('account.project_id', filters.project_id)
        .whereNull('account.unlinked_at');
    });
  }

  if (filters.q) {
    const term = String(filters.q).trim();
    const forms = contact.searchForms(term);

    qb.where(function () {
      this.whereRaw('??::text ILIKE ?', ['party.party_pk', searchId(term)])
        .orWhere('party.display_name', 'ilike', '%' + term + '%');

      forms.forEach((form) => {
        this.orWhereExists(function () {
          this.select(db.raw(1)).from('crm_contact_point as contact')
            .whereRaw('contact.party_pk = party.party_pk')
            .where('contact.normalized_value', 'like', '%' + form + '%');
        });
      });

      /* An account number another project gave them - a platform login, an Eshop id. */
      this.orWhereExists(function () {
        this.select(db.raw(1)).from('crm_project_account as account')
          .whereRaw('account.party_pk = party.party_pk')
          .where(function () {
            this.where('account.external_account_id', term).orWhere('account.external_login', 'ilike', term);
          });
      });
    });
  }

  return qb;
}

/** The first active contact of a kind, primary first - as a correlated subquery. */
function firstContact(type, alias) {
  return db.raw(
    `(SELECT contact.contact_value FROM crm_contact_point contact
       WHERE contact.party_pk = party.party_pk AND contact.contact_type = ? AND contact.status = 'ACTIVE'
       ORDER BY contact.is_primary DESC, contact.contact_point_id LIMIT 1) AS ??`,
    [type, alias]
  );
}

async function search(filters, paging) {
  const count = await narrowed(filters).count({ total: '*' }).first();

  const rows = await narrowed(filters)
    .leftJoin('crm_project as origin_project', 'origin_project.project_id', 'party.origin_project_id')
    .select(
      'party.party_pk', 'party.party_type', 'party.party_status', 'party.display_name',
      'party.origin_project_id', 'origin_project.project_code as origin_project_code',
      'party.first_seen_at', 'party.last_seen_at', 'party.created_at',
      firstContact('MOBILE', 'mobile'),
      firstContact('EMAIL', 'email'),
      db.raw(`(SELECT string_agg(DISTINCT pj.project_code, ',')
                 FROM crm_project_account account JOIN crm_project pj ON pj.project_id = account.project_id
                WHERE account.party_pk = party.party_pk AND account.unlinked_at IS NULL) AS projects`),
      db.raw(`(SELECT COUNT(*) FROM crm_product_registration registration
                WHERE registration.party_pk = party.party_pk AND registration.valid_to IS NULL)::int AS holding_cnt`),
      db.raw(`(SELECT COUNT(*) FROM crm_service_case sc
                WHERE sc.party_pk = party.party_pk)::int AS case_cnt`),
      'snapshot.corporate_score', 'snapshot.purchase_amount_12m', 'snapshot.activity_status', 'snapshot.transaction_count_12m',
      db.raw('(SELECT grade.grade_code FROM crm_corporate_grade grade WHERE grade.corporate_grade_id = COALESCE(party.assigned_grade_id, snapshot.corporate_grade_id)) AS grade_code'),
      db.raw('(party.assigned_grade_id IS NOT NULL) AS grade_assigned')
    )
    .orderByRaw((SORTABLE[paging.sort] || 'party.party_pk') + ' ' + (paging.dir === 'asc' ? 'ASC' : 'DESC') + ' NULLS LAST')
    .limit(paging.limit)
    .offset(paging.offset);

  return { rows: rows, total: Number(count.total) };
}

/** Twenty matches for a picker: enough to choose from, few enough to be quick. */
/*
 * What a picker shows for a customer, on one line: party_pk, name, home
 * address, every phone. Phones are all of their active MOBILE and PHONE
 * contact points, primary first.
 */
const LOOKUP_COLUMNS = [
  'party.party_pk', 'party.party_type', 'party.party_status', 'party.display_name',
  'person.address_line',
  db.raw(locations.fullNameOf('person.home_location_pk') + ' AS home_place'),
  db.raw(`ARRAY(SELECT contact.contact_value FROM crm_contact_point contact
                 WHERE contact.party_pk = party.party_pk AND contact.contact_type IN ('MOBILE', 'PHONE') AND contact.status = 'ACTIVE'
                 ORDER BY contact.is_primary DESC, contact.contact_point_id) AS phones`),
  firstContact('MOBILE', 'mobile')
];

/**
 * Customers for a picker: by name, phone or party_pk (`term`), or the ones
 * named by `ids` (to show who an edit form already holds). A search finds
 * registered customers only - never a merged or deleted record.
 */
function lookup(term, ids) {
  if (ids && ids.length) {
    return db('crm_party as party').leftJoin('crm_person as person', 'person.party_pk', 'party.party_pk')
      .whereIn('party.party_pk', ids).select(LOOKUP_COLUMNS);
  }
  return narrowed({ q: term })
    .leftJoin('crm_person as person', 'person.party_pk', 'party.party_pk')
    .whereIn('party.party_status', ['ACTIVE', 'INACTIVE'])
    .select(LOOKUP_COLUMNS)
    .orderBy('party.party_pk', 'desc')
    .limit(20);
}

function findParty(id, trx) {
  return (trx || db)('crm_party').where('party_pk', id).first();
}

function lockParty(id, trx) {
  return trx('crm_party').where('party_pk', id).forUpdate().first();
}

/**
 * EVERYTHING KNOWN ABOUT ONE PARTY, for the customer screen.
 *
 * Each list is capped: the screen is a summary with a way into each domain,
 * not an export, and a reseller who has registered four thousand devices
 * should not take the page down with them.
 */
async function detail(id) {
  const party = await db('crm_party as party')
    .leftJoin('crm_project as origin_project', 'origin_project.project_id', 'party.origin_project_id')
    .where('party.party_pk', id)
    .first('party.*', 'origin_project.project_code as origin_project_code', 'origin_project.project_name as origin_project_name');
  if (!party) return null;
  delete party.party_id; // Phase 1 exposes party_pk to every consumer.

  const [
    person, organization, contacts, accounts, memberships, holdings, transfers, cases,
    pointAccounts, pointEvents, targets, reservations, awards, activities, consents,
    segments, classStats, merges, snapshot
  ] = await Promise.all([
    db('crm_person as person')
      .leftJoin('crm_job_title as jt', 'jt.job_title_id', 'person.job_title_id')
      .where('person.party_pk', id)
      .first('person.*', db.raw(locations.fullNameOf('person.home_location_pk') + ' AS home_location_name'), 'jt.job_name as job_title_name'),
    db('crm_organization as organization').leftJoin('crm_location as place', 'place.location_pk', 'organization.location_pk')
      .where('organization.party_pk', id)
      .first('organization.*', 'place.location_name', db.raw(locations.fullNameOf('organization.location_pk') + ' AS location_full_name')),
    db('crm_contact_point as contact').leftJoin('crm_project as project', 'project.project_id', 'contact.source_project_id')
      .where('contact.party_pk', id)
      .orderBy([{ column: 'contact.status' }, { column: 'contact.contact_type' }, { column: 'contact.is_primary', order: 'desc' }])
      .select('contact.*', 'project.project_code as source_project_code'),
    db('crm_project_account as account').join('crm_project as project', 'project.project_id', 'account.project_id')
      .where('account.party_pk', id).orderBy([{ column: 'account.unlinked_at', order: 'desc' }, { column: 'project.project_id' }])
      .select('account.*', 'project.project_code', 'project.project_name'),
    db('crm_membership as membership').join('crm_project as project', 'project.project_id', 'membership.project_id')
      .leftJoin('crm_project_tier as tier', 'tier.project_tier_id', 'membership.current_tier_id')
      .where('membership.party_pk', id).orderBy('project.project_id')
      .select('membership.*', 'project.project_code', 'tier.tier_code', 'tier.tier_name'),
    db('crm_product_registration as registration')
      .join('crm_product_instance as instance', 'instance.product_instance_id', 'registration.product_instance_id')
      .join('crm_product_catalog as catalog', 'catalog.product_id', 'instance.product_id')
      .join('crm_project as project', 'project.project_id', 'registration.project_id')
      .leftJoin('crm_product_class as product_class', 'product_class.product_class_id', 'catalog.product_class_id')
      .leftJoin('crm_product_relationship_type as relationship_type', 'relationship_type.relationship_type_id', 'registration.relationship_type_id')
      .where('registration.party_pk', id)
      .orderByRaw('registration.valid_to IS NULL DESC, registration.valid_from DESC')
      .limit(100)
      .select('registration.*', 'instance.external_product_instance_id', 'instance.serial_number', 'instance.imei', 'instance.instance_kind',
        'instance.status as instance_status', 'catalog.product_name', 'catalog.product_code', 'product_class.class_code', 'product_class.class_name',
        'relationship_type.relationship_name', 'project.project_code'),
    db('crm_product_transfer as transfer')
      .join('crm_product_instance as instance', 'instance.product_instance_id', 'transfer.product_instance_id')
      .join('crm_product_catalog as catalog', 'catalog.product_id', 'instance.product_id')
      .leftJoin('crm_party as from_party', 'from_party.party_pk', 'transfer.from_party_pk')
      .leftJoin('crm_party as to_party', 'to_party.party_pk', 'transfer.to_party_pk')
      .where(function () { this.where('transfer.from_party_pk', id).orWhere('transfer.to_party_pk', id); })
      .orderBy('transfer.requested_at', 'desc').limit(50)
      .select('transfer.*', 'catalog.product_name', 'instance.external_product_instance_id',
        'from_party.display_name as from_name', 'to_party.display_name as to_name'),
    db('crm_service_case as service_case')
      .join('crm_service_case_type as ct', 'ct.case_type_id', 'service_case.case_type_id')
      .join('crm_service_status as st', 'st.service_status_id', 'service_case.service_status_id')
      .join('crm_project as project', 'project.project_id', 'service_case.project_id')
      .leftJoin('crm_service_center as center', 'center.service_center_id', 'service_case.service_center_id')
      .where('service_case.party_pk', id).orderBy('service_case.received_at', 'desc').limit(50)
      .select('service_case.case_id', 'service_case.external_case_id', 'service_case.title', 'service_case.received_at',
        'service_case.closed_at', 'service_case.is_warranty',
        'service_case.crystal_repair_ticket_id', 'ct.case_type_code', 'ct.display_name as case_type_name',
        'st.status_code', 'st.display_name as status_name', 'st.is_terminal', 'project.project_code',
        'center.service_center_name'),
    db('crm_point_account as account').join('crm_point_type as point_type', 'point_type.point_type_id', 'account.point_type_id')
      .where('account.party_pk', id).orderBy('point_type.point_type_id')
      .select('account.*', 'point_type.point_type_code', 'point_type.point_type_name', 'point_type.decimal_places'),
    db('crm_point_event as point_event')
      .join('crm_point_account as account', 'account.point_account_id', 'point_event.point_account_id')
      .join('crm_point_type as point_type', 'point_type.point_type_id', 'account.point_type_id')
      .join('crm_point_event_type as et', 'et.point_event_type_id', 'point_event.point_event_type_id')
      .join('crm_project as project', 'project.project_id', 'point_event.project_id')
      .where('account.party_pk', id).orderBy([{ column: 'point_event.occurred_at', order: 'desc' }, { column: 'point_event.point_event_id', order: 'desc' }]).limit(30)
      .select('point_event.*', 'point_type.point_type_code', 'et.event_code', 'project.project_code'),
    db('crm_activity_target as target').join('crm_event as event', 'event.event_id', 'target.event_id')
      .leftJoin('crm_event_tier as tier', 'tier.event_tier_id', 'target.event_tier_id')
      .where('target.party_pk', id).orderBy('target.created_at', 'desc').limit(50)
      .select('target.*', 'event.event_code', 'event.event_name', 'event.event_type', 'event.status as event_status', 'tier.tier_name'),
    db('crm_activity_reservation as reservation').join('crm_event as event', 'event.event_id', 'reservation.event_id')
      .leftJoin('crm_service_center as center', 'center.service_center_id', 'reservation.service_center_id')
      .where('reservation.party_pk', id).orderBy('reservation.created_at', 'desc').limit(50)
      .select('reservation.reservation_id', 'reservation.reservation_code', 'reservation.entry_type', 'reservation.status', 'reservation.reserved_at',
        'reservation.fulfilled_at', 'event.event_name', 'event.event_code', 'center.service_center_name'),
    db('crm_activity_award as award').join('crm_activity_reward as rw', 'rw.reward_id', 'award.reward_id')
      .join('crm_event as event', 'event.event_id', 'award.event_id')
      .where('award.party_pk', id).orderBy('award.awarded_at', 'desc').limit(50)
      .select('award.award_id', 'award.status', 'award.fulfilment_method', 'award.awarded_at', 'award.fulfilled_at',
        'rw.reward_name', 'rw.reward_type', 'event.event_name'),
    db('crm_service_center_activity as activity')
      .join('crm_service_center_activity_type as activity_type', 'activity_type.activity_type_id', 'activity.activity_type_id')
      .join('crm_service_center as center', 'center.service_center_id', 'activity.service_center_id')
      .where('activity.party_pk', id).orderBy('activity.occurred_at', 'desc').limit(30)
      .select('activity.service_center_activity_id', 'activity.occurred_at', 'activity.quantity', 'activity.amount', 'activity.status',
        'activity_type.activity_code', 'activity_type.activity_name', 'center.service_center_name'),
    db('crm_project_communication_option as communication_option')
      .join('crm_project as project', 'project.project_id', 'communication_option.project_id')
      .join('crm_communication_purpose as pp', 'pp.purpose_id', 'communication_option.purpose_id')
      .join('crm_communication_channel as ch', 'ch.channel_id', 'communication_option.channel_id')
      .leftJoin('crm_party_communication_consent as consent', function () {
        this.on('consent.project_communication_option_id', 'communication_option.project_communication_option_id')
          .andOn('consent.party_pk', db.raw('?', [id]));
      })
      .leftJoin('crm_contact_point as cp', 'cp.contact_point_id', 'consent.contact_point_id')
      .where('communication_option.is_enabled', true)
      .orderBy([{ column: 'project.project_id' }, { column: 'pp.purpose_id' }, { column: 'ch.channel_id' }])
      .select('communication_option.project_communication_option_id', 'communication_option.consent_required', 'project.project_code',
        'pp.purpose_code', 'pp.purpose_name', 'ch.channel_code', 'ch.channel_name',
        'consent.party_communication_consent_id', 'consent.consent_status', 'consent.captured_at', 'consent.captured_via',
        'consent.contact_point_id', 'cp.contact_value'),
    db('crm_segment_membership as membership').join('crm_segment as segment', 'segment.segment_id', 'membership.segment_id')
      .where('membership.party_pk', id).whereNull('membership.unmatched_at')
      .select('segment.segment_id', 'segment.segment_code', 'segment.segment_name', 'membership.matched_at'),
    db('crm_party_product_class_stat as class_stat').join('crm_product_class as product_class', 'product_class.product_class_id', 'class_stat.product_class_id')
      .where('class_stat.party_pk', id).orderBy([{ column: 'product_class.product_domain' }, { column: 'product_class.class_code' }])
      .select('class_stat.*', 'product_class.class_code', 'product_class.class_name', 'product_class.parent_product_class_id'),
    db('crm_party_merge_history as merge_history')
      .where('merge_history.surviving_party_pk', id).orWhere('merge_history.merged_party_pk', id)
      .orderBy('merge_history.merged_at', 'desc')
      .select('merge_history.merge_id', 'merge_history.surviving_party_pk', 'merge_history.merged_party_pk', 'merge_history.merge_reason',
        'merge_history.merge_method', 'merge_history.merged_at', 'merge_history.moved_rows'),
    db('crm_party_analysis_snapshot as snapshot').leftJoin('crm_corporate_grade as grade', 'grade.corporate_grade_id', 'snapshot.corporate_grade_id')
      .where('snapshot.party_pk', id).whereNull('snapshot.project_id').orderBy('snapshot.reference_date', 'desc')
      .first('snapshot.*', 'grade.grade_code', 'grade.grade_name')
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
function pendingCandidates(paging, filters) {
  const base = db('crm_identity_match_candidate as candidate').where('candidate.match_status', 'PENDING');
  /* Either customer of the pair, by number or name. */
  const term = String((filters && filters.q) || '').trim();
  if (term) {
    base.where(function () {
      this.whereRaw('candidate.incoming_party_pk::text = ?', [term]).orWhereRaw('candidate.candidate_party_pk::text = ?', [term])
        .orWhereExists(function () {
          this.select(db.raw(1)).from('crm_party as named')
            .whereRaw('named.party_pk IN (candidate.incoming_party_pk, candidate.candidate_party_pk)')
            .where('named.display_name', 'ilike', '%' + term + '%');
        });
    });
  }

  return Promise.all([
    base.clone().count({ total: '*' }).first(),
    base.clone()
      .join('crm_party as incoming_party', 'incoming_party.party_pk', 'candidate.incoming_party_pk')
      .join('crm_party as candidate_party', 'candidate_party.party_pk', 'candidate.candidate_party_pk')
      .join('crm_project as project', 'project.project_id', 'candidate.incoming_project_id')
      .orderBy('candidate.created_at', 'desc')
      .limit(paging.limit).offset(paging.offset)
      .select('candidate.*', 'project.project_code as incoming_project_code',
        'incoming_party.display_name as incoming_name', 'incoming_party.party_status as incoming_status',
        'candidate_party.display_name as candidate_name', 'candidate_party.party_status as candidate_status')
  ]).then(function (res) { return { rows: res[1], total: Number(res[0].total) }; });
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
