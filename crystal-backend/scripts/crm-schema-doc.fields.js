'use strict';

/**
 * What each CRM table and field MEANS, for scripts/crm-schema-doc.js.
 *
 * `common` covers a field name that means the same thing wherever it appears;
 * `tables[name].fields` overrides it for one table. The generator refuses to
 * write the document while any field has no meaning here or in a schema comment.
 */

/* [topic, rule]: shown as the Conventions table at the top of the document. */
const conventions = [
  ['Customer key', '`party_pk` is the customer key in phase 1: every CRM link to a person or organization uses it. `crm_party.party_id` is reserved for a later phase and is not generated or used in phase 1.'],
  ['Project', '`project_id` names the Dream project (business system) a row came from or belongs to - the projects defined in Settings > Projects. An external id is only unique inside its project.'],
  ['Who did it', '`*_manager_id` points at `managers.id`, the console user who did something. It is set to NULL if the manager is deleted, so history survives.'],
  ['History', '`valid_from` / `valid_to`: a row is current while `valid_to` is NULL (or in the future). Closing a row sets `valid_to` instead of deleting it.'],
  ['Source ids', '`source_*`, `external_*` and `crystal_*` fields keep the id a row had in the system it was imported from, so re-running an import updates rather than duplicates.'],
  ['Account ids', 'In a project account, `external_account_id` is the project\'s internal key (shown as "Account PK" in the console) and `external_login` is the id the customer signs in with (shown as "Account ID").'],
  ['Money and points', 'Money is `numeric(20,4)` with a `currency_code`; `reporting_*` amounts are converted to the reporting currency (`crm_currency.is_reporting`). Points are `numeric(14,3)`.']
];

const common = {
  created_at: 'When the row was created.',
  updated_at: 'When the row was last changed.',
  deleted_at: 'When the row was soft-deleted; NULL while it is live.',
  is_active: 'false hides the row from pickers and new use; existing references stay valid.',
  sort_order: 'Display order in lists (lowest first).',
  rank_no: 'Order or level within its list; a higher rank is a higher level unless stated otherwise.',
  description: 'Free-text explanation shown to staff.',
  display_name: 'Name shown in the console.',
  note: 'Free-text remark by staff.',
  project_id: 'The Dream project this row belongs to (→ crm_project).',
  party_pk: 'The customer (person or organization) this row belongs to (→ crm_party).',
  currency_code: 'ISO currency of the amounts on this row (→ crm_currency).',
  valid_from: 'Start of the period in which this row applies.',
  valid_to: 'End of the period; NULL means still current.',
  occurred_at: 'When the thing happened in the real world (not when it was recorded).',
  created_by_manager_id: 'Console manager who created the row.',
  is_primary: 'Marks the preferred row among several of the same kind for one owner.',
  source_created_at: 'Creation time in the source system.',
  source_updated_at: 'Last change time in the source system.',
  ingested_at: 'When the CRM import last loaded this row.',
  calculated_at: 'When the value was last calculated.',
  assigned_at: 'When the assignment started.',
  status: 'Lifecycle state of the row (see allowed values).',
  event_id: 'The activity event this row belongs to (→ crm_event).',
  event_tier_id: 'Tier of the event the row applies to (→ crm_event_tier); NULL = every tier.',
  service_center_id: 'Site (service centre, agency, shop, ...) concerned (→ crm_service_center).',
  campaign_id: 'The campaign this row belongs to (→ crm_campaign).',
  action_id: 'The campaign action (step) concerned (→ crm_campaign_action).',
  recipient_id: 'The campaign delivery the row is attributed to (→ crm_campaign_recipient).',
  audience_id: 'The frozen audience (→ crm_campaign_audience).',
  product_id: 'Catalogue product (→ crm_product_catalog).',
  product_instance_id: 'The concrete device, licence or entitlement (→ crm_product_instance).',
  product_class_id: 'Product class (→ crm_product_class).',
  point_type_id: 'Point currency (→ crm_point_type).',
  purpose_id: 'Communication purpose (→ crm_communication_purpose).',
  channel_id: 'Communication channel (→ crm_communication_channel).',
  contact_point_id: 'The contact value used (→ crm_contact_point).',
  related_transaction_id: 'Purchase or payment this row relates to (→ crm_transaction).',
  related_product_instance_id: 'Device or licence this row relates to (→ crm_product_instance).',
  related_reservation_id: 'Event reservation this row relates to (→ crm_activity_reservation).',
  related_service_case_id: 'Service case this row relates to (→ crm_service_case).',
  related_award_id: 'Event award this row relates to (→ crm_activity_award).',
  case_id: 'Service case (→ crm_service_case).',
  membership_id: 'Project membership (→ crm_membership).',
  segment_id: 'Segment (→ crm_segment).',
  question_id: 'Registration question (→ crm_registration_question).',
  transaction_id: 'Transaction (→ crm_transaction).',
  reservation_id: 'Event reservation (→ crm_activity_reservation).',
  activity_target_id: 'Event target (→ crm_activity_target).',
  activity_type_id: 'Kind of service center activity (→ crm_service_center_activity_type).',
  acquisition_type_id: 'How the holder obtained the product (→ crm_acquisition_type).',
  service_status_id: 'CRM service status (→ crm_service_status).',
  department_id: 'Internal department (→ crm_department).',
  manager_id: 'Console manager (→ managers).',
  location_pk: 'Place on the vendor location list (→ crm_location).',
  job_title_id: 'Job title (→ crm_job_title).',
  organization_party_pk: 'The organization (→ crm_organization).',
  entry_type: 'NORMAL entries are the ordinary allocation; REWARD entries are extra entries given as a reward.',
  source_project_id: 'Project the data came from (→ crm_project).',
  decimal_places: 'How many decimals amounts in this unit show.',
  title: 'Short title shown in lists.',
  party_communication_consent_id: 'The consent record that allowed or blocked the contact (→ crm_party_communication_consent).',
  model_version: 'Version of the calculation that produced the value, so results from different formulas are not compared blindly.',
  reference_date: 'Day the figures were calculated for.',
  explanation_json: 'Why the rule matched, as structured evidence shown to reviewers.',
  qualification_reason: 'Why the party qualified (structured evidence).',
  source_segment_membership_id: 'Segment membership the party qualified through (→ crm_segment_membership).',
  legacy_key: 'Primary key of the row in the vendor (legacy) table it was migrated from.',
  attribution_window_days: 'How many days after contact a conversion still counts for the campaign.',
  completed_at: 'When the work was completed.',
  min_value: 'Lowest qualifying value for this level.',
  max_value: 'Highest qualifying value (exclusive); NULL = no upper bound.'
};

const groups = [
  { title: 'Projects and integration',
    intro: 'Each Dream business system is one project. Department systems call the CRM with a key issued to their project.',
    tables: ['crm_project', 'crm_project_api_key', 'crm_project_tier', 'crm_currency'] },
  { title: 'Customers (parties)',
    intro: 'A party is anyone the CRM knows: a person or an organization. Every other customer table hangs off `crm_party.party_pk`.',
    tables: ['crm_party', 'crm_person', 'crm_organization', 'crm_contact_point', 'crm_job_title', 'crm_location',
      'crm_party_note', 'crm_party_file', 'crm_party_tag', 'crm_tag', 'crm_party_relationship', 'crm_party_relationship_type',
      'crm_party_team_member', 'crm_party_agreement', 'crm_party_interaction'] },
  { title: 'Organizations',
    intro: 'Extra facts about ORGANIZATION parties: what kind of organization it is, its industries, and the people who work there with their roles.',
    tables: ['crm_organization_type', 'crm_organization_type_assignment', 'crm_industry', 'crm_organization_industry',
      'crm_organization_person_relationship', 'crm_organization_person_role', 'crm_org_contact_role'] },
  { title: 'Identity resolution (duplicate check, review, department accounts)',
    intro: 'How an incoming person becomes a customer: weighted duplicate check, staging for review, merges, and the link from each project account to its customer. See crm-logic.md, section 5.',
    tables: ['crm_project_account', 'crm_registration_intake', 'crm_identity_resolution', 'crm_identity_match_candidate',
      'crm_party_merge_history', 'crm_party_split_history', 'crm_person_import_error'] },
  { title: 'Communication and consent',
    intro: 'What each project may send, through which channel and for which purpose, and what each customer agreed to. Consent changes are kept as an append-only history.',
    tables: ['crm_communication_channel', 'crm_communication_purpose', 'crm_project_communication_option',
      'crm_party_communication_consent', 'crm_consent_event'] },
  { title: 'Products, registrations and transfers',
    intro: 'The product catalogue, concrete product instances (by serial, IMEI or licence key), who holds each instance over time, and requests to hand an instance to someone else.',
    tables: ['crm_product_class', 'crm_product_catalog', 'crm_product_instance', 'crm_product_registration',
      'crm_product_relationship_type', 'crm_product_transfer', 'crm_acquisition_type', 'crm_purchase_purpose',
      'crm_product_usage_type', 'crm_registration_question', 'crm_registration_question_option', 'crm_registration_answer',
      'v_crm_current_holding'] },
  { title: 'Transactions',
    intro: 'Sales, purchases, refunds and reversals from every project, with their lines and the customers involved.',
    tables: ['crm_transaction', 'crm_transaction_item', 'crm_transaction_party'] },
  { title: 'Memberships and points',
    intro: 'Each customer membership and tier in each project, and the points ledger: one append-only ledger, one balance per point currency.',
    tables: ['crm_membership', 'crm_membership_tier_history', 'crm_point_type', 'crm_point_account', 'crm_point_event',
      'crm_point_event_type', 'crm_point_rule', 'v_crm_point_account_drift'] },
  { title: 'Service cases',
    intro: 'A summary of every service contact (repair, complaint, enquiry) from any project, with its status and classification.',
    tables: ['crm_service_case', 'crm_service_case_type', 'crm_service_status', 'crm_service_status_map', 'crm_service_priority',
      'crm_service_case_classification', 'crm_issue_category', 'crm_fault_category', 'crm_root_cause', 'crm_resolution_category'] },
  { title: 'Sites (service centres) and service center activity',
    intro: 'Physical places (service centres, agencies, shops), what each may do, what happened there, and the targets set for them.',
    tables: ['crm_service_center', 'crm_service_center_capability', 'crm_service_center_activity_type', 'crm_service_center_activity',
      'crm_service_center_activity_target', 'crm_service_center_event', 'v_crm_service_center_activity_progress'] },
  { title: 'Events (formerly "programs")',
    intro: 'Customer activity events: phone reservations, lotteries, prize services, puzzles, survey rewards, attendance events. An event decides who may take part (targets), how many entries exist (quotas), and what is handed out (rewards and awards).',
    tables: ['crm_event', 'crm_event_tier', 'crm_event_service_center', 'crm_event_quota', 'crm_activity_target',
      'crm_activity_reservation', 'crm_activity_reservation_event', 'crm_activity_reward', 'crm_activity_award'] },
  { title: 'Segments and campaigns',
    intro: 'Versioned rules that group customers, and campaigns that freeze an audience, contact it and measure the result.',
    tables: ['crm_segment', 'crm_segment_version', 'crm_segment_membership', 'crm_campaign', 'crm_campaign_audience',
      'crm_campaign_audience_member', 'crm_campaign_content', 'crm_campaign_action', 'crm_campaign_recipient',
      'crm_campaign_interaction', 'crm_campaign_conversion', 'crm_campaign_cost'] },
  { title: 'Analysis',
    intro: 'Figures computed per customer on each analysis run, the corporate score and grade bands, and custom metrics.',
    tables: ['crm_party_analysis_snapshot', 'crm_corporate_grade', 'crm_party_product_class_stat', 'crm_metric_definition', 'crm_party_metric_value'] },
  { title: 'Internal organization',
    intro: 'Departments, which manager belongs to which, and roles reserved for a department.',
    tables: ['crm_department', 'crm_manager_department', 'crm_role_department'] }
];

const tables = {
  /* ---------------------------------------------------------------- projects */
  crm_project: {
    usedBy: 'Settings > Projects; imports and the department API. The Excel import finds its e-shop and user-management projects by `identity_role`, not by code.',
    fields: {
      project_id: 'Numeric key referenced by every project_id in the CRM.',
      project_code: 'Short code the code looks up (CRYSTAL, ESHOP, ...). It cannot change while other rows reference the project.',
      project_name: 'Name shown in the console.',
      project_type_code: 'Free label for the kind of business (PLATFORM, COMMERCE, SERVICE, CRM, ...). Informational only.',
      source_system_code: 'Which technical system feeds this project (VENDOR_ORACLE, ESHOP_API, ...). Informational only.',
      legal_entity_code: 'Legal entity that operates the project, for reporting.',
      status: 'INACTIVE projects stay in history but are not offered for new data.',
      identity_role: 'ESHOP: the project of the Excel import’s E-shop PK / ID columns. USER_MANAGEMENT: the project of its User PK / User ID columns (the same user_pk is the same person). At most one project per role; set in Settings > Projects.'
    }
  },
  crm_project_api_key: {
    usedBy: 'Department API authentication (`/api/integration/crm`); issued with `npm run crm:api-key`.',
    fields: {
      api_key_id: 'Key number, used to revoke it.',
      project_id: 'Project the key acts for; every request made with it belongs to this project.',
      key_prefix: 'Public part of the key (`crmk_<prefix>_...`), used to find the row.',
      key_hash: 'SHA-256 of the secret part. The secret itself is never stored.',
      label: 'Who the key was issued to, e.g. "Eshop production".',
      last_used_at: 'Last successful request with this key.',
      revoked_at: 'When the key was revoked; a revoked key is refused.'
    }
  },
  crm_project_tier: {
    usedBy: 'Settings > Project tiers; Memberships; vendor import (e-shop card levels).',
    fields: {
      project_tier_id: 'Tier key.',
      tier_code: 'Code unique within the project.',
      tier_name: 'Name shown in the console.',
      rank_no: 'Order of the tier within its project (only comparable inside one project).',
      tier_kind: 'LEVEL = activity level, GRADE = customer grade, CARD_CLASS = membership card class.',
      source_code: 'The value the project itself uses for this tier, for import mapping.',
      min_value: 'Minimum qualifying value (points, spend, ...) for this tier, when the project defines one.'
    }
  },
  crm_currency: {
    usedBy: 'Every money field; Settings.',
    fields: {
      currency_code: 'ISO 4217 code (USD, ...).',
      currency_name: 'Name shown in the console.',
      is_reporting: 'The single currency reports are converted into.'
    }
  },

  /* ---------------------------------------------------------------- parties */
  crm_party: {
    usedBy: 'Customers list and Customer 360; every customer-linked table.',
    fields: {
      party_type: 'PERSON (details in crm_person) or ORGANIZATION (details in crm_organization).',
      party_status: 'ACTIVE / INACTIVE customers are usable; MERGED points to the survivor; DELETED is kept for history.',
      display_name: 'Name shown everywhere; for a person the full name, for an organization its trading or legal name.',
      origin_project_id: 'Project through which the customer first reached the CRM: chosen on the console form, and per Excel row (its Origin project column, or the project chosen on the import screen). Never assumed.',
      merged_into_party_pk: 'When MERGED: the surviving customer. Required exactly when status is MERGED.',
      first_seen_at: 'First known activity anywhere.',
      last_seen_at: 'Latest known activity anywhere.',
      assigned_grade_id: 'Corporate grade set by hand on the customer record (→ crm_corporate_grade); while set it is the grade shown and filtered on, instead of the computed one.',
      assigned_grade_reason: 'Why the manager set the grade.',
      assigned_grade_at: 'When the grade was set by hand.',
      assigned_grade_by_manager_id: 'The manager who set it (→ managers).'
    }
  },
  crm_person: {
    usedBy: 'Customers (create, edit, Excel import), duplicate check, Customer 360.',
    fields: {
      party_pk: 'The PERSON party these details belong to (also the primary key).',
      full_name: 'Full name; used by the duplicate check (+25 when equal).',
      gender_code: 'M, F, OTHER or UNKNOWN.',
      birth_date: 'Full date of birth; used by the duplicate check (+25 when equal).',
      birth_year: 'Year of birth, kept when only the year is known; must equal the year of birth_date when both are set.',
      job_title_id: 'Occupation (→ crm_job_title); used by the duplicate check (+5).',
      home_location_pk: 'Home area on the vendor location list (→ crm_location). Used by the duplicate check (+15 when the same location ID).',
      address_line: 'The written address, free text, kept for search and display. When set it is the address shown (instead of the location name). Not used by the duplicate check.'
    }
  },
  crm_organization: {
    usedBy: 'Customers (organizations), Group details, Sites (operators).',
    fields: {
      party_pk: 'The ORGANIZATION party these details belong to (also the primary key).',
      legal_name: 'Registered legal name.',
      trading_name: 'Name the organization trades under.',
      registration_number: 'Company registration number.',
      website_url: 'Website.',
      founded_date: 'Date founded.',
      organization_status: 'Status reported by the source (free text).',
      local_name: 'Name in the local language.',
      employee_count_band: 'Size band by number of employees.',
      location_pk: 'Where the organization is (→ crm_location).',
      headquarters_address: 'Street address of the head office.'
    }
  },
  crm_contact_point: {
    usedBy: 'Customer 360 (header, Contact points card, Consent tab list); duplicate check (phones); campaigns (where to send); consent. A customer has as many phones as rows; merges keep them all.',
    fields: {
      contact_point_id: 'Contact key.',
      party_pk: 'Owner of the contact (deleted with the party).',
      contact_type: 'Kind of contact value. One customer can have many phones: one row each.',
      contact_value: 'The value as entered.',
      normalized_value: 'Canonical form used for matching and uniqueness (digits only for phones, lower case for e-mail).',
      label: 'Staff label such as "home" or "work".',
      is_verified: 'The customer proved they own this contact.',
      is_primary: 'Preferred contact of this type for the customer.',
      status: 'ACTIVE contacts are used; INVALID (bounced) and RETIRED are kept for history.',
      source_project_id: 'Project that supplied the contact.'
    }
  },
  crm_job_title: {
    usedBy: 'Settings > Job titles; customer form; Excel template "Job titles" sheet.',
    fields: { job_title_id: 'Job title key; the Excel sheet takes this number.', job_code: 'Stable code.', job_name: 'Name shown in the console.' }
  },
  crm_location: {
    usedBy: 'Every location picker; refreshed by Overview > Import (step "locations"); Excel template "Locations" sheet.',
    fields: {
      location_pk: 'The vendor\'s own location number; the Excel sheet takes this number.',
      location_name: 'Name of the place.',
      location_code: 'Vendor location code; the hierarchy runs on codes.',
      position: 'Display order within the parent.'
    }
  },
  crm_party_note: {
    purpose: 'Notes staff write on a customer record (Customer 360 > Notes and files).',
    usedBy: 'Customer 360 > Notes and files.',
    fields: { note_id: 'Note key.', note_text: 'The note.', is_pinned: 'Pinned notes are shown first.' }
  },
  crm_party_file: {
    usedBy: 'Customer 360 > Notes and files (upload, download, delete).',
    fields: {
      file_id: 'File key.', file_name: 'Original file name.', storage_key: 'Name of the stored file in the private CRM folder.',
      content_type: 'MIME type.', byte_size: 'Size in bytes.', description: 'What the file is.',
      uploaded_by_manager_id: 'Manager who uploaded it.'
    }
  },
  crm_party_tag: {
    purpose: 'Which tags are on which customer.',
    usedBy: 'Customer 360 tags; segment rules.',
    fields: { tag_id: 'The tag (→ crm_tag).', tagged_at: 'When the tag was added.', tagged_by_manager_id: 'Manager who added it.' }
  },
  crm_tag: {
    usedBy: 'Settings > Tags; Customer 360.',
    fields: { tag_id: 'Tag key.', tag_code: 'Stable code.', tag_name: 'Label shown on the customer.', color_scheme: 'Badge colour.' }
  },
  crm_party_relationship: {
    purpose: 'A link between two customers: family, colleague, parent company, ... Read "related_party is the <type> of party".',
    usedBy: 'Customer 360 > Relationships; Group details tree.',
    fields: {
      party_relationship_id: 'Relationship key.',
      party_pk: 'The customer the relationship is recorded on.',
      related_party_pk: 'The other customer.',
      relationship_type_code: 'Kind of relationship (→ crm_party_relationship_type).',
      status: 'ACTIVE or ENDED.'
    }
  },
  crm_party_relationship_type: {
    usedBy: 'Settings > Relationship types; Customer 360.',
    fields: {
      relationship_type_code: 'Code of the relationship.', relationship_name: 'Name shown in the console.',
      inverse_code: 'The relationship seen from the other side (parent ↔ subsidiary).',
      applies_to: 'Which kind of party it can link.', is_hierarchy: 'The link the group (parent company) tree follows.'
    }
  },
  crm_party_team_member: {
    purpose: 'Staff assigned to look after a customer (account team).',
    usedBy: 'Customer 360 > Team.',
    fields: {
      team_member_id: 'Assignment key.', manager_id: 'Assigned console manager.',
      team_role: 'Role on the account.', ended_at: 'When the assignment ended; NULL = current.',
      assigned_by_manager_id: 'Manager who made the assignment.'
    }
  },
  crm_party_agreement: {
    purpose: 'Contracts with a customer (mostly organizations): reseller, service level, purchase agreements.',
    usedBy: 'Customer 360 > Agreements.',
    fields: {
      agreement_id: 'Agreement key.', agreement_no: 'Contract number.', agreement_type: 'Kind of agreement.',
      start_date: 'Start of the agreement.', end_date: 'End of the agreement.', renewal_date: 'Date it must be renewed.',
      status: 'DRAFT, ACTIVE, EXPIRED or TERMINATED.', annual_value: 'Contract value per year.'
    }
  },
  crm_party_interaction: {
    usedBy: 'Customer 360 > Interactions; "send message" from the customer record.',
    fields: {
      interaction_id: 'Interaction key.', direction: 'INBOUND (customer contacted us) or OUTBOUND.',
      channel_code: 'How the contact happened.', interaction_type: 'What it was about.',
      subject: 'Subject line.', body: 'Content or summary.', case_id: 'Service case it belongs to, if any.',
      destination_snapshot: 'The address/number used, copied at the time.', manager_id: 'Manager who handled it.',
      outcome_code: 'Result of the contact.', duration_seconds: 'Call length.'
    }
  },

  /* ---------------------------------------------------------------- organizations */
  crm_organization_type: {
    usedBy: 'Settings > Organization types; Customers (organizations).',
    fields: { organization_type_id: 'Type key.', type_code: 'Stable code.', type_name: 'Name shown in the console.' }
  },
  crm_organization_type_assignment: {
    usedBy: 'Customer 360 (organization types).',
    fields: {
      organization_type_assignment_id: 'Assignment key.', organization_type_id: 'The type (→ crm_organization_type).',
      project_id: 'Project in which the organization has this type; NULL = Dream-wide.',
      status: 'ACTIVE or ENDED.', ended_at: 'When the type ended.'
    }
  },
  crm_industry: {
    usedBy: 'Settings > Industries; organization records.',
    fields: { industry_id: 'Industry key.', industry_code: 'Stable code.', industry_name: 'Name shown in the console.', parent_industry_id: 'Broader industry (→ crm_industry).' }
  },
  crm_organization_industry: {
    usedBy: 'Customer 360 (organizations).',
    fields: { industry_id: 'Industry (→ crm_industry).', is_primary: 'Main industry of the organization.' }
  },
  crm_organization_person_relationship: {
    usedBy: 'Group details > Contacts ("Link contact"); Customer 360.',
    fields: {
      org_person_relationship_id: 'Relationship key.', person_party_pk: 'The person (→ crm_person).',
      project_id: 'Project the relationship is limited to; NULL = Dream-wide.', relationship_status: 'ACTIVE or ENDED.'
    }
  },
  crm_organization_person_role: {
    usedBy: 'Group details > Contacts (the role shown under the person\'s name).',
    fields: {
      org_person_role_id: 'Role key.', org_person_relationship_id: 'The person-organization link (→ crm_organization_person_relationship).',
      contact_role_id: 'Role held (→ crm_org_contact_role).', department_name: 'Department inside the organization (free text).',
      is_primary: 'Main role shown for the person.'
    }
  },
  crm_org_contact_role: {
    usedBy: 'Settings > Contact roles; Group details.',
    fields: { contact_role_id: 'Role key.', role_code: 'Stable code.', role_name: 'Name shown in the console.' }
  },

  /* ---------------------------------------------------------------- identity */
  crm_project_account: {
    usedBy: 'Customer 360 > Accounts; department API; Crystal and vendor imports; account assignment review (Customers > Account assignments).',
    fields: {
      project_account_id: 'Account link key.',
      party_pk: 'Customer the account belongs to.',
      project_id: 'Project that issued the account.',
      external_account_id: 'The account\'s internal key in that project (e-shop: eshop_pk; Crystal: users.id). Shown as "Account PK" in the console. Only one active link per project + key.',
      external_login: 'The id the customer signs in with in that project (e-shop: eshop_id). Shown as "Account ID" in the console.',
      external_account_type: 'Kind of account in the project (MEMBER, PID, ESHOP_CUSTOMER, ...).',
      crystal_user_id: 'For Crystal accounts, the Crystal user row (→ users).',
      account_status: 'Status reported by the project.',
      is_primary: 'Main account of this customer in this project.',
      link_method: 'How the link was made: PLATFORM (certain), EXACT/MATCHED (automatic match), REVIEWED (administrator decision), MANUAL, IMPORT.',
      link_confidence: 'Match confidence 0-1 when the link came from a score.',
      linked_at: 'When the link was made.',
      unlinked_at: 'When the link was ended; ended links stay for history.'
    }
  },
  crm_registration_intake: {
    purpose: 'Every incoming registration (console, Excel row, department API, imports) and every e-shop or user-management identifier waiting for review. A PERSON intake that scores 50-69, or matches several strong candidates, waits here without creating a customer.',
    usedBy: 'Customers > Pending registrations / Account assignments / Resolved registrations; department API; Excel import.',
    fields: {
      intake_id: 'Intake key; departments receive it for QUEUED registrations.',
      source_project_id: 'Project the registration came from.',
      source_record_id: 'The record\'s id in the source (account id, `excel:<file hash>:<row>` - shown as "Excel row N" -, an e-shop or user PK). Unique with project and category, so retries reuse the intake.',
      category: 'PERSON = who is this person; ESHOP = which customer does this identifier (e-shop or user management) belong to - an account assignment.',
      status: 'PENDING until decided; then CREATED, MERGED (person) or ASSIGNED, REJECTED (account assignment).',
      payload: 'What was submitted: `party` (person data, with every phone in `contacts`), `account` (project account to link once resolved), `unverified_accounts` (the spreadsheet\'s e-shop and user identifiers, staged for review once the person is resolved).',
      candidates: 'Matching customers or pending intakes with their scores and evidence, shown to the reviewer.',
      party_pk: 'Customer the intake resolved to.',
      reviewed_by_manager_id: 'Administrator who decided; NULL when decided automatically.',
      reviewed_at: 'When it was decided.'
    }
  },
  crm_identity_resolution: {
    purpose: 'Results departments collect: for each resolved intake, the customer key to store in the department\'s own record. Read through the department API and acknowledged once saved.',
    usedBy: 'Department API `GET /identity-resolutions` and acknowledge.',
    fields: {
      resolution_id: 'Result key; the department acknowledges by this id.',
      intake_id: 'The intake that was resolved (one result per intake).',
      source_record_id: 'The department\'s own record id, so it can update the right record.',
      party_pk: 'Customer key to store. Updated if the customer is later merged.',
      outcome: 'CREATED, MERGED or ASSIGNED.',
      acknowledged_at: 'When the department confirmed it saved the key; acknowledged results leave the feed.'
    }
  },
  crm_identity_match_candidate: {
    usedBy: 'Customers > Existing duplicate records (pairs among existing customers).',
    fields: {
      match_candidate_id: 'Candidate key.', incoming_project_id: 'Project of the record being matched.',
      incoming_external_record_id: 'Its id in that project.', incoming_party_pk: 'Customer created for it, if any.',
      candidate_party_pk: 'Existing customer it may duplicate.', match_rule_code: 'Rule that found the pair (WEIGHTED_PERSON).',
      match_score: 'Weighted score 0-110.', match_status: 'PENDING, ACCEPTED (merged) or REJECTED (kept apart).',
      reviewed_at: 'When decided.', reviewed_by_manager_id: 'Who decided.'
    }
  },
  crm_party_merge_history: {
    usedBy: 'Customer merge (Customer 360 > Merge; duplicate review).',
    fields: {
      merge_id: 'Merge key.', surviving_party_pk: 'Customer that remains.', merged_party_pk: 'Customer that was merged away.',
      merge_reason: 'Why.', merge_method: 'How the merge was decided.', match_score: 'Score when the merge came from matching.',
      moved_rows: 'Which rows moved from the merged customer, so a merge can be split again.',
      platform_merge_log_pk: 'Vendor merge log row when the merge came from the platform.',
      merged_by_manager_id: 'Manager who merged.', merged_at: 'When.', merge_metadata: 'Extra details.'
    }
  },
  crm_person_import_error: {
    usedBy: 'Customers > Import errors; written by the customer Excel import for rows that failed the file check.',
    fields: {
      import_error_id: 'Failed-row key.',
      batch_hash: 'SHA-256 of the imported file; with row_number it keeps a re-run of the same file from adding the row twice.',
      file_name: 'Name of the uploaded file.',
      row_number: 'Row in the sheet, as Excel numbers it (the header is row 1).',
      cells: 'Every cell of the row as text, keyed by column (eshop_pk, eshop_id, user_pk, user_id, full_name, ...), as it was written.',
      errors: 'Every reason the row failed the check.',
      status: 'OPEN until an administrator dismisses it (DISMISSED) - after importing the corrected row, or deciding it is not wanted.',
      imported_by_manager_id: 'Manager who ran the import.',
      dismissed_by_manager_id: 'Manager who dismissed the row.',
      dismissed_at: 'When it was dismissed.'
    }
  },
  crm_party_split_history: {
    usedBy: 'Undoing a wrong merge.',
    fields: {
      split_id: 'Split key.', original_party_pk: 'Customer the data was split from.', new_party_pk: 'Customer recreated by the split.',
      reversed_merge_id: 'Merge being undone (→ crm_party_merge_history).', split_reason: 'Why.',
      split_by_manager_id: 'Manager who split.', split_at: 'When.', split_metadata: 'Extra details.'
    }
  },

  /* ---------------------------------------------------------------- communication */
  crm_communication_channel: {
    usedBy: 'Settings; campaigns; consent.',
    fields: { channel_code: 'Stable code.', channel_name: 'Name shown in the console.', required_contact_type: 'Contact type needed to use the channel (SMS needs a MOBILE).' }
  },
  crm_communication_purpose: {
    usedBy: 'Settings; campaigns; consent; interactions.',
    fields: { purpose_code: 'Stable code.', purpose_name: 'Name shown in the console.', requires_opt_in: 'The customer must have opted in before contact for this purpose.' }
  },
  crm_project_communication_option: {
    usedBy: 'Settings > Communication; consent capture; campaign eligibility.',
    fields: {
      project_communication_option_id: 'Option key.', consent_required: 'Explicit consent is needed for this project/purpose/channel.',
      is_enabled: 'The option is offered at all.'
    }
  },
  crm_party_communication_consent: {
    usedBy: 'Customer 360 > Consent; campaigns check it before every send.',
    fields: {
      project_communication_option_id: 'Which project/purpose/channel the consent is for.',
      consent_status: 'GRANTED, DENIED, WITHDRAWN or NOT_REQUIRED.', is_preferred: 'Customer\'s preferred way to be contacted.',
      frequency_code: 'How often the customer agreed to be contacted.', captured_via: 'Where the consent was given (web, counter, ...).',
      captured_at: 'When it was given.', effective_from: 'Start of validity.', effective_to: 'End of validity.'
    }
  },
  crm_consent_event: {
    usedBy: 'Written on every consent change; shown in consent history.',
    fields: {
      consent_event_id: 'Row key.', old_status: 'Status before.', new_status: 'Status after.', changed_by_type: 'Who changed it.',
      changed_by_manager_id: 'Manager, when a manager changed it.', reason: 'Why.', evidence_json: 'Proof of consent (form, IP, ...).'
    }
  },

  /* ---------------------------------------------------------------- products */
  crm_product_class: {
    usedBy: 'Settings > Product classes; catalogue; point rules; analysis per class.',
    fields: {
      class_code: 'Stable code.', class_name: 'Name shown in the console.', parent_product_class_id: 'Broader class (SMARTPHONE > PHONE_9).',
      product_domain: 'Product family.', legacy_column: 'Vendor counter column this class replaces.'
    }
  },
  crm_product_catalog: {
    usedBy: 'Products > Catalogue; registrations; transactions; events (reserved product); point rules.',
    fields: {
      product_code: 'Code unique within the project.', product_name: 'Name shown in the console.',
      parent_product_id: 'Parent product (a variant\'s model).', product_type: 'Project\'s own product type (free text).',
      product_kind: 'What sort of thing it is.', crystal_product_id: 'Crystal products row (→ products).',
      model_code: 'Manufacturer model code.', imei_prefixes: 'IMEI prefixes (TAC) that identify this model.',
      list_price: 'List price.', is_reservable: 'Can be the reserved product of an event.', status: 'ACTIVE, INACTIVE or DISCONTINUED.'
    }
  },
  crm_product_instance: {
    usedBy: 'Products > Instances; registrations; transfers; service cases.',
    fields: {
      external_product_instance_id: 'Id of the instance in its project.', instance_kind: 'DEVICE, LICENCE or ENTITLEMENT.',
      serial_number: 'Serial number.', imei: 'Phone IMEI.', license_key_hash: 'Hash of a licence key (the key itself is not stored).',
      bound_instance_id: 'Device a licence is bound to.', provider_party_pk: 'Organization providing the licence/content.',
      valid_until: 'Expiry of a licence or entitlement.', manufactured_at: 'Manufacture date.', batch_code: 'Production batch.',
      activated_at: 'First activation.', status: 'ACTIVE, LOST, STOLEN, SCRAPPED, VOID or EXPIRED.'
    }
  },
  crm_product_registration: {
    usedBy: 'Products > Registrations; Customer 360 > Products; transfers; point rules (registration points).',
    fields: {
      product_registration_id: 'Registration key.', party_pk: 'Customer holding the product.',
      relationship_type_id: 'How the customer holds it (→ crm_product_relationship_type).', relationship_code: 'Same, as a code (OWNER, USER, ...).',
      registration_channel: 'Where it was registered.', registered_at_service_center_id: 'Site where it was registered.',
      purchase_purpose_id: 'Why it was bought (→ crm_purchase_purpose).', usage_type_id: 'Intended use (→ crm_product_usage_type).',
      previous_owner_party_pk: 'Previous owner after a transfer.', transfer_id: 'Transfer that created this registration.',
      purchase_date: 'Date bought.', purchase_place: 'Where bought.', sim_cid: 'SIM card id given at registration.',
      registration_status: 'ACTIVE, ENDED or CANCELLED.', end_reason_code: 'Why it ended.', registered_at: 'When registered.',
      valid_from: 'Start of holding (database clock).', valid_to: 'End of holding; NULL = current holder.',
      source_record_id: 'Id in the source system.', crystal_registered_product_id: 'Crystal registered_products row.'
    }
  },
  crm_product_relationship_type: {
    usedBy: 'Registrations and transfers.',
    fields: {
      relationship_type_id: 'Type key.', relationship_code: 'Stable code.', relationship_name: 'Name shown in the console.',
      is_exclusive: 'Only one current holder of this kind per instance (OWNER).', awards_registration_points: 'Registering this way pays registration points.'
    }
  },
  crm_product_transfer: {
    usedBy: 'Transfers screen; Products.',
    fields: {
      product_transfer_id: 'Transfer key.', transfer_kind: 'What should happen (ownership transfer, assign user, end assignment, return, lease, licence rebind).',
      from_party_pk: 'Current holder, worked out from the registration.', to_party_pk: 'Receiving customer; required unless the kind only ends something.',
      to_instance_id: 'Device a licence is rebound to.', requested_by_type: 'Who asked.', requested_by_party_pk: 'Customer who asked.',
      requested_by_manager_id: 'Manager who asked.', handled_at_service_center_id: 'Site that handled it.',
      status: 'REQUESTED → ACCEPTED → COMPLETED, or REJECTED / CANCELLED / EXPIRED.', reason: 'Why.',
      requested_at: 'When asked.', expires_at: 'Deadline for acceptance.', responded_at: 'When accepted or rejected.',
      closed_registration_id: 'Registration ended when it completed.', created_registration_id: 'Registration created when it completed.'
    }
  },
  crm_acquisition_type: {
    usedBy: 'Registrations and transfers.',
    fields: { acquisition_type_id: 'Type key.', acquisition_code: 'Stable code.', acquisition_name: 'Name shown in the console.' }
  },
  crm_purchase_purpose: {
    usedBy: 'Registration form.',
    fields: { purchase_purpose_id: 'Purpose key.', purpose_code: 'Stable code.', purpose_name: 'Name shown in the console.' }
  },
  crm_product_usage_type: {
    usedBy: 'Registration form.',
    fields: { usage_type_id: 'Usage key.', usage_code: 'Stable code.', usage_name: 'Name shown in the console.' }
  },
  crm_registration_question: {
    usedBy: 'Settings > Registration questions; registration form.',
    fields: {
      project_id: 'Project the question is asked in; NULL = all.', product_class_id: 'Class it is asked for; NULL = all.',
      question_code: 'Stable code.', question_label: 'Question text.', answer_type: 'How it is answered.', is_required: 'Must be answered.'
    }
  },
  crm_registration_question_option: {
    usedBy: 'Registration form.',
    fields: { option_id: 'Option key.', option_label: 'Text of the option.' }
  },
  crm_registration_answer: {
    usedBy: 'Registrations (answers given).',
    fields: {
      answer_id: 'Answer key.', product_registration_id: 'Registration answered for.', option_id: 'Chosen option.',
      text_value: 'Text answer.', number_value: 'Numeric answer.', rating: 'Rating answer.'
    }
  },
  v_crm_current_holding: {
    purpose: 'View: who currently holds each product instance (registrations with no valid_to), with the product.',
    usedBy: 'Analysis and product reports.',
    fields: {
      external_product_instance_id: 'Instance id in its project.', instance_kind: 'DEVICE, LICENCE or ENTITLEMENT.',
      product_name: 'Catalogue name.', relationship_code: 'How it is held.', valid_from: 'Since when.',
      product_registration_id: 'The current registration.'
    }
  },

  /* ---------------------------------------------------------------- transactions */
  crm_transaction: {
    usedBy: 'Transactions screen; Customer 360 > Orders; analysis; imports.',
    fields: {
      external_transaction_id: 'Id in the source project.', original_transaction_id: 'For refunds/returns/reversals: the transaction they undo.',
      transaction_type_code: 'Kind of transaction.', transaction_status: 'Status reported by the source.',
      gross_amount: 'Amount before discount.', discount_amount: 'Discount.', net_amount: 'Amount paid.',
      reporting_currency_code: 'Reporting currency.', reporting_net_amount: 'Net amount converted to the reporting currency.',
      points_used: 'Points spent towards the payment.', sales_channel_code: 'Channel of the sale.', transaction_at: 'When it happened.'
    }
  },
  crm_transaction_item: {
    usedBy: 'Transaction detail.',
    fields: {
      transaction_item_id: 'Line key.', external_item_id: 'Line id in the source.', quantity: 'Quantity.', unit_price: 'Price per unit.',
      gross_amount: 'Line amount before discount.', discount_amount: 'Line discount.', net_amount: 'Line amount paid.'
    }
  },
  crm_transaction_party: {
    usedBy: 'Transaction detail; Customer 360 > Orders.',
    fields: { transaction_party_id: 'Row key.', party_role_code: 'Role of the customer in the transaction.' }
  },

  /* ---------------------------------------------------------------- memberships and points */
  crm_membership: {
    usedBy: 'Memberships screen; Customer 360 > Accounts; vendor import.',
    fields: {
      external_member_id: 'Member/card number in the project.', current_tier_id: 'Current tier (→ crm_project_tier).',
      tier_value: 'Value the tier is based on.', available_reward_points: 'Points available as reported by the project.',
      membership_status: 'ACTIVE, INACTIVE, SUSPENDED or LEFT.', source_payload: 'Raw data received from the project.',
      joined_at: 'When the customer joined.', left_at: 'When they left.', synced_at: 'Last sync from the project.'
    }
  },
  crm_membership_tier_history: {
    usedBy: 'Customer 360 > tier changes.',
    fields: {
      membership_tier_history_id: 'Row key.', old_tier_id: 'Tier before.', new_tier_id: 'Tier after.',
      change_reason: 'Why it changed.', changed_at: 'When.'
    }
  },
  crm_point_type: {
    usedBy: 'Points screen; Settings > Point types; point rules; events (ranking and cost).',
    fields: {
      point_type_code: 'Stable code.', point_type_name: 'Name shown in the console.', owner_project_id: 'Project that owns the currency.',
      is_dream_managed: 'Balance is kept by the CRM ledger (not only mirrored from a project).', expires_after_days: 'Points expire this many days after earning; NULL = never.'
    }
  },
  crm_point_account: {
    usedBy: 'Points screen; Customer 360 > Point balances; ledger.',
    fields: {
      point_account_id: 'Account key.', balance: 'Current balance (cached sum of the ledger).', lifetime_earned: 'Total ever earned.',
      lifetime_spent: 'Total ever spent.', last_event_at: 'Last ledger entry.'
    }
  },
  crm_point_event: {
    usedBy: 'Points ledger (every earn, spend, adjustment); events; registrations; service center activity.',
    fields: {
      point_event_id: 'Ledger entry key.', point_account_id: 'Account the entry belongs to.', point_event_type_id: 'Kind of entry.',
      point_rule_id: 'Rule that paid it.', points_delta: 'Points added (positive) or removed (negative).',
      pay_amount: 'Money amount the points relate to, when earned on a purchase.', points_balance_after: 'Balance right after this entry.',
      related_product_registration_id: 'Registration that earned it.', related_service_center_activity_id: 'Service center activity that earned it.',
      performed_by_service_center_id: 'Site that recorded it.', performed_by_manager_id: 'Manager who recorded it.',
      description: 'What it was for.', device_ref: 'Device the action came from.', source_table_code: 'Legacy table it was migrated from.',
      external_event_id: 'Id in the source; unique, so re-imports do not pay twice.', ip_address: 'IP of the request, for fraud review.'
    }
  },
  crm_point_event_type: {
    usedBy: 'Ledger; Settings > Point event types.',
    fields: { point_event_type_id: 'Type key.', event_code: 'Stable code (EARN, REDEEM, EVENT_AWARD, ...).', direction: '1 adds points, -1 removes, 0 either.' }
  },
  crm_point_rule: {
    usedBy: 'Reward points > Rules; paid automatically on registrations, purchases, logins, tasks.',
    fields: {
      point_rule_id: 'Rule key.', rule_code: 'Stable code.', rule_name: 'Name shown in the console.',
      trigger_code: 'What earns the points.', main_type: 'Vendor activity main type, for migrated rules.', sub_type: 'Vendor activity sub type.',
      product_class_id: 'Only for products of this class.', product_id: 'Only for this product.', points: 'Points paid.',
      daily_cap_count: 'Most times per day a customer can earn it.', source_rule_key: 'Vendor rule key it was migrated from.'
    }
  },
  v_crm_point_account_drift: {
    purpose: 'View: point accounts whose cached balance differs from the sum of their ledger. Should be empty.',
    usedBy: 'Health checks.',
    fields: { point_account_id: 'Account.', balance: 'Cached balance.', ledger_balance: 'Sum of the ledger.' }
  },

  /* ---------------------------------------------------------------- service */
  crm_service_case: {
    usedBy: 'Service cases screen; Customer 360; Crystal import (repair tickets).',
    fields: {
      external_case_id: 'Case id in the source project.', crystal_repair_ticket_id: 'Crystal repair ticket (→ repair_tickets).',
      service_provider_party_pk: 'Organization doing the work.', case_type_id: 'Kind of case (→ crm_service_case_type).',
      service_priority_id: 'Priority (→ crm_service_priority).', reception_channel_code: 'How the case came in.',
      reopened_from_case_id: 'Earlier case this one reopens.', is_warranty: 'Covered by warranty.', title: 'Short summary.',
      description: 'Customer\'s description.', received_at: 'When received.', first_response_at: 'First response to the customer.',
      due_at: 'Promised completion.', completed_at: 'Work finished.', closed_at: 'Case closed.', total_cost: 'Cost of the work.',
      customer_paid_amount: 'Amount the customer paid.', satisfaction_rating: 'Customer rating.'
    }
  },
  crm_service_case_type: {
    usedBy: 'Settings > Case types; service cases.',
    fields: { case_type_id: 'Type key.', case_type_code: 'Stable code.' }
  },
  crm_service_status: {
    usedBy: 'Settings > Service statuses; service cases.',
    fields: { status_code: 'Stable code.', sequence_no: 'Order in the workflow.', is_terminal: 'Case is finished in this status.' }
  },
  crm_service_status_map: {
    usedBy: 'Settings > Status map; imports.',
    fields: { source_status_code: 'Status code in the project.', source_status_label: 'Its label in the project.' }
  },
  crm_service_priority: {
    usedBy: 'Settings > Priorities; service cases.',
    fields: { service_priority_id: 'Priority key.', priority_code: 'Stable code.', priority_name: 'Name shown in the console.' }
  },
  crm_service_case_classification: {
    usedBy: 'Service case detail.',
    fields: {
      service_case_classification_id: 'Row key.', issue_category_id: 'What the customer reported.', fault_category_id: 'Fault found.',
      root_cause_id: 'Root cause.', resolution_category_id: 'How it was resolved.', resolution_text: 'Resolution details.',
      classified_at: 'When classified.', classified_by_manager_id: 'Who classified.'
    }
  },
  crm_issue_category: {
    usedBy: 'Settings > Issue categories; service cases.',
    fields: { issue_category_id: 'Category key.', parent_issue_category_id: 'Broader category.', category_code: 'Stable code.' }
  },
  crm_fault_category: {
    usedBy: 'Settings > Fault categories; service cases; Crystal import.',
    fields: { fault_category_id: 'Category key.', parent_fault_category_id: 'Broader category.', fault_code: 'Stable code.', crystal_symptom_id: 'Crystal symptom_catalog row.' }
  },
  crm_root_cause: {
    usedBy: 'Settings > Root causes; service cases.',
    fields: { root_cause_id: 'Root cause key.', root_cause_code: 'Stable code.' }
  },
  crm_resolution_category: {
    usedBy: 'Settings > Resolutions; service cases.',
    fields: { resolution_category_id: 'Resolution key.', resolution_code: 'Stable code.' }
  },

  /* ---------------------------------------------------------------- sites */
  crm_service_center: {
    usedBy: 'Sites screen; service center activity; events (pickup sites); service cases; Crystal import (agencies).',
    fields: {
      service_center_code: 'Stable code.', service_center_name: 'Name shown in the console.', service_center_kind: 'What sort of site it is.',
      operator_party_pk: 'Organization that runs the site.', address_line: 'Street address.', landmark: 'Nearby landmark to find it.',
      map_position: 'Coordinates on the map.', crystal_agency_id: 'Crystal agencies row (→ agencies).',
      source_service_center_key: 'Key in the source table.', source_table_code: 'Which vendor table it came from.',
      rating: 'Customer rating.', status: 'ACTIVE, SUSPENDED or CLOSED.', opened_on: 'Opening date.', closed_on: 'Closing date.'
    }
  },
  crm_service_center_capability: {
    usedBy: 'Sites > Capabilities; checks before recording site activity.',
    fields: {
      capability_id: 'Capability key.', capability_code: 'What the site may do (REPAIR, SALES, ...).',
      crystal_section: 'Crystal agency_services section it mirrors.'
    }
  },
  crm_service_center_activity_type: {
    usedBy: 'Settings > Activity types; Site activity.',
    fields: {
      activity_code: 'Stable code.', activity_name: 'Name shown in the console.', activity_group: 'Area the activity belongs to.',
      required_capability_code: 'Capability a site needs to record it.', counts_quantity: 'Targets count a quantity.', counts_amount: 'Targets count an amount.'
    }
  },
  crm_service_center_activity: {
    usedBy: 'Site activity (record, reverse); site dashboards; point rules.',
    fields: {
      service_center_activity_id: 'Activity key.', service_center_event_id: 'On-site event it happened at.',
      performed_by_party_pk: 'Site staff person who did it.', performed_by_manager_id: 'Manager who recorded it.',
      quantity: 'How many.', amount: 'Money amount.', status: 'COMPLETED, CANCELLED or REVERSED (reversed rows stop counting).',
      external_activity_id: 'Id in the source.'
    }
  },
  crm_service_center_activity_target: {
    usedBy: 'Site activity > Targets.',
    fields: {
      service_center_activity_target_id: 'Target key.', period_start: 'First day.', period_end: 'Last day.',
      target_quantity: 'Quantity to reach.', target_amount: 'Amount to reach.', set_by_manager_id: 'Who set it.'
    }
  },
  crm_service_center_event: {
    usedBy: 'Site activity > Events (on-site events).',
    fields: {
      service_center_event_id: 'On-site event key.', event_type_code: 'Kind of on-site event.', title: 'Title.',
      event_id: 'Customer activity event it serves, e.g. a pickup day (→ crm_event).', campaign_id: 'Campaign it supports.',
      planned_start_at: 'Planned start.', planned_end_at: 'Planned end.', actual_start_at: 'Actual start.', actual_end_at: 'Actual end.',
      capacity: 'Places available.', attendee_count: 'People who came.', owner_manager_id: 'Responsible manager.', outcome_note: 'How it went.'
    }
  },
  v_crm_service_center_activity_progress: {
    purpose: 'View: each site target with the activity done so far in its period.',
    usedBy: 'Site activity > Targets.',
    fields: {
      service_center_name: 'Site name.', activity_code: 'Activity code.', period_start: 'First day.', period_end: 'Last day.',
      target_quantity: 'Quantity target.', actual_quantity: 'Quantity done.', target_amount: 'Amount target.', actual_amount: 'Amount done.',
      quantity_pct: 'Quantity done as a percentage of the target.', service_center_activity_target_id: 'Target.'
    }
  },

  /* ---------------------------------------------------------------- events */
  crm_event: {
    usedBy: 'Events screen (create, approve, open, close, fulfil); campaigns (event targets as an audience).',
    fields: {
      event_id: 'Event key.', event_code: 'Stable code.', event_name: 'Name shown to staff and customers.', event_type: 'Kind of event.',
      summary: 'One-line summary for lists.', approval_no: 'Internal approval document number.',
      reserved_product_id: 'For reservations: the product being reserved.',
      eligibility_basis: 'How targets are chosen (segment, point ranking, grade, registration, site activity, manual, import, open to all).',
      eligibility_segment_id: 'Segment whose members are targets (basis SEGMENT).', eligibility_rule: 'Extra eligibility rule.',
      ranking_point_type_id: 'Point currency ranked (basis POINT_RANKING).', ranking_cutoff_at: 'Balance date for the ranking.',
      ranking_top_n: 'How many top customers qualify.', cost_point_type_id: 'Currency an entry costs.', cost_points: 'Points an entry costs (refunded on cancel).',
      number_prefix: 'Prefix of entry numbers.', number_suffix: 'Suffix of entry numbers.', number_start: 'First entry number.', number_end: 'Last entry number.',
      display_at: 'When it becomes visible.', starts_at: 'When entries open.', ends_at: 'When entries close.', fulfilment_ends_at: 'Deadline to hand out rewards.',
      is_private: 'Only targets can see it.', status: 'DRAFT → APPROVED → TARGETS_FROZEN → OPEN → CLOSED → FULFILLED, or CANCELLED.',
      external_system_code: 'System that runs the event outside the CRM.', is_test: 'Test event, excluded from reports.',
      approved_by_manager_id: 'Approver; must differ from the creator.', approved_at: 'When approved.',
      legacy_table_code: 'Vendor table it was migrated from.'
    }
  },
  crm_event_tier: {
    usedBy: 'Event detail > Tiers.',
    fields: {
      tier_code: 'Code unique within the event.', tier_name: 'Name shown.', rank_no: 'Order of the tier.',
      entries_per_target: 'Entries each target in this tier may take.', number_range_start: 'First entry number for this tier.',
      number_range_end: 'Last entry number for this tier.'
    }
  },
  crm_event_service_center: {
    usedBy: 'Event detail > Sites.',
    fields: { event_service_center_id: 'Row key.', service_center_role: 'What the site does for the event.' }
  },
  crm_event_quota: {
    usedBy: 'Event detail > Quotas; checked on every reservation.',
    fields: {
      event_quota_id: 'Quota key.', event_tier_id: 'Tier it limits; NULL = all.', service_center_id: 'Site it limits; NULL = all sites.',
      quota_count: 'Entries available.', used_count: 'Entries taken; never above quota_count.'
    }
  },
  crm_activity_target: {
    usedBy: 'Event detail > Targets (add, build from the basis, revoke).',
    fields: {
      allowed_count: 'Entries the target may take.', used_count: 'Entries taken.', qualification_value: 'Value the target qualified with.',
      qualification_rank: 'Rank in a point ranking.', source: 'How the target was added.', status: 'ELIGIBLE, NOTIFIED, EXHAUSTED or REVOKED.',
      added_by_manager_id: 'Manager who added it.'
    }
  },
  crm_activity_reservation: {
    usedBy: 'Event detail > Reservations; site activity (pickup).',
    fields: {
      reservation_no: 'Entry number.', reservation_code: 'Printed code (prefix + number + suffix).', holder_name: 'Name of the person who will collect.',
      holder_id_card_hash: 'Hash of their ID card number (one card, one entry).', holder_id_card_masked: 'Masked ID card number shown to staff.',
      holder_phone: 'Phone of the holder.', service_center_id: 'Pickup site.', product_instance_id: 'Device handed over.',
      status: 'PENDING → RESERVED → PAID → FULFILLED, or CANCELLED / EXPIRED / FAILED.', external_booking_ref: 'Booking id in another system.',
      reserved_at: 'When reserved.', paid_at: 'When paid.', fulfilled_at: 'When handed over.', cancelled_at: 'When cancelled.', cancel_reason: 'Why cancelled.'
    }
  },
  crm_activity_reservation_event: {
    usedBy: 'Reservation history.',
    fields: {
      reservation_event_id: 'Row key.', old_status: 'Status before.', new_status: 'Status after.', actor_type: 'Who changed it.',
      actor_manager_id: 'Manager.', actor_service_center_id: 'Site.'
    }
  },
  crm_activity_reward: {
    usedBy: 'Event detail > Rewards.',
    fields: {
      reward_id: 'Reward key.', reward_name: 'Name shown.', reward_type: 'What is given.', points: 'Points for a POINTS reward.',
      unit_value: 'Value of one unit.', quantity_total: 'How many exist.', quantity_awarded: 'How many were given (never above the total).'
    }
  },
  crm_activity_award: {
    usedBy: 'Event detail > Awards.',
    fields: {
      award_id: 'Award key.', reward_id: 'Reward given (→ crm_activity_reward).', fulfilment_method: 'How it reaches the customer.',
      status: 'Where the award is.', recipient_name: 'Who receives it.', recipient_phone: 'Their phone.',
      recipient_id_card_hash: 'Hash of their ID card.', delivery_location_pk: 'Delivery area.', delivery_address: 'Delivery address.',
      pickup_service_center_id: 'Pickup site.', point_event_id: 'Ledger entry for a POINTS award.', external_credit_ref: 'Reference of a wallet credit.',
      awarded_at: 'When awarded.', fulfilled_at: 'When delivered, picked up or credited.', handled_by_manager_id: 'Manager who handled it.'
    }
  },

  /* ---------------------------------------------------------------- segments and campaigns */
  crm_segment: {
    usedBy: 'Segments screen; events (eligibility); campaigns (audiences).',
    fields: {
      segment_code: 'Stable code.', segment_name: 'Name shown.', segment_description: 'What the segment is for.',
      current_version_id: 'Rule version in use (→ crm_segment_version).', calculation_frequency: 'How often members are recalculated.',
      status: 'DRAFT, ACTIVE, PAUSED or ARCHIVED.', member_count: 'Members at the last evaluation.', last_evaluated_at: 'Last evaluation.'
    }
  },
  crm_segment_version: {
    usedBy: 'Segments (rule history).',
    fields: { segment_version_id: 'Version key.', version_no: 'Version number.', rule_expression: 'Rule as JSON.', effective_from: 'In use from.', effective_to: 'In use until.' }
  },
  crm_segment_membership: {
    usedBy: 'Segments > Members; events; campaigns.',
    fields: {
      segment_membership_id: 'Row key.', segment_version_id: 'Version that matched.', matched_at: 'When the customer entered the segment.',
      unmatched_at: 'When they left; NULL = current member.', evaluation_reference_date: 'Date the rule was evaluated for.'
    }
  },
  crm_campaign: {
    usedBy: 'Campaigns screen; Customer 360 > Campaigns.',
    fields: {
      campaign_code: 'Stable code.', campaign_name: 'Name shown.', campaign_type: 'Kind of campaign.',
      campaign_status: 'DRAFT → APPROVED → ACTIVE → COMPLETED, or CANCELLED.', start_at: 'Start.', end_at: 'End.',
      owner_manager_id: 'Responsible manager.', approved_by_manager_id: 'Approver.', approved_at: 'When approved.'
    }
  },
  crm_campaign_audience: {
    usedBy: 'Campaign detail > Audiences.',
    fields: {
      audience_name: 'Name shown.', audience_type: 'Where members come from.', source_segment_id: 'Segment used (type SEGMENT).',
      source_event_id: 'Event whose targets are used (type EVENT_TARGETS).', rule_expression: 'Rule (type RULE).',
      snapshot_at: 'When the members were frozen.', member_count: 'Members frozen.'
    }
  },
  crm_campaign_audience_member: {
    usedBy: 'Campaign execution.',
    fields: { audience_member_id: 'Row key.', source_activity_target_id: 'Event target it came from.' }
  },
  crm_campaign_content: {
    usedBy: 'Campaign detail > Content.',
    fields: {
      content_id: 'Content key.', content_type: 'Kind of content.', content_name: 'Internal name.', body: 'Message body.',
      media_url: 'Image or video.', landing_page_url: 'Link target.', language_code: 'Language.', locked_at: 'When it was frozen by a send.'
    }
  },
  crm_campaign_action: {
    usedBy: 'Campaign detail > Actions (prepare, run).',
    fields: {
      action_name: 'Name shown.', action_type: 'What the step does.', content_id: 'Content sent.', execution_order: 'Order of the steps.',
      scheduled_at: 'When it runs.', action_status: 'DRAFT → READY → RUNNING → COMPLETE, or CANCELLED.'
    }
  },
  crm_campaign_recipient: {
    usedBy: 'Campaign detail > Recipients.',
    fields: {
      audience_member_id: 'Frozen member.', destination_snapshot: 'Address/number used.', recipient_status: 'Delivery state.',
      skip_reason_code: 'Why it was skipped (no consent, no contact, ...).', provider_message_id: 'Id from the sending provider.',
      queued_at: 'Queued.', sent_at: 'Sent.', delivered_at: 'Delivered.', failed_at: 'Failed.', party_pk: 'Customer.'
    }
  },
  crm_campaign_interaction: {
    usedBy: 'Campaign results.',
    fields: {
      interaction_id: 'Row key.', interaction_type: 'What the customer did.', interaction_url: 'Link clicked.',
      source_event_id: 'Id from the tracking system (unique).', utm_source: 'UTM source.', utm_medium: 'UTM medium.',
      utm_campaign: 'UTM campaign.', utm_content: 'UTM content.', event_metadata: 'Extra tracking data.'
    }
  },
  crm_campaign_conversion: {
    usedBy: 'Campaign results (ROI).',
    fields: {
      conversion_id: 'Row key.', conversion_type: 'What the customer did.', conversion_value: 'Value of the outcome.',
      attribution_model: 'How credit was assigned.', attribution_score: 'Share of credit given to the campaign.', recorded_at: 'When recorded.'
    }
  },
  crm_campaign_cost: {
    usedBy: 'Campaign detail > Costs.',
    fields: { campaign_cost_id: 'Row key.', cost_type: 'What the cost was for.', amount: 'Cost.' }
  },

  /* ---------------------------------------------------------------- analysis */
  crm_party_analysis_snapshot: {
    usedBy: 'Analysis screen; Customer 360 > Snapshots; segments.',
    fields: {
      analysis_snapshot_id: 'Row key.', project_id: 'Project the figures are for; NULL = Dream-wide.',
      reporting_currency_code: 'Currency of the amounts.', first_transaction_at: 'First purchase.', last_transaction_at: 'Latest purchase.',
      purchase_amount_lifetime: 'Total spent.', purchase_amount_12m: 'Spent in the last 12 months.', transaction_count_lifetime: 'Purchases ever.',
      transaction_count_12m: 'Purchases in 12 months.', active_purchase_days_12m: 'Days with a purchase in 12 months.',
      average_transaction_amount_12m: 'Average purchase in 12 months.', service_case_count_12m: 'Service cases in 12 months.',
      complaint_count_12m: 'Complaints in 12 months.', registered_device_count: 'Devices currently registered.',
      points_earned_12m: 'Points earned in 12 months.', location_visit_count_12m: 'Site visits in 12 months.',
      score_components: 'Parts of the corporate score.', activity_status: 'NEW, ACTIVE, AT_RISK, LAPSED or NEVER_BOUGHT.',
      corporate_score: 'Dream-wide customer score.', corporate_grade_id: 'Grade the score falls in.'
    }
  },
  crm_corporate_grade: {
    usedBy: 'Settings > Grades; analysis.',
    fields: { corporate_grade_id: 'Grade key.', grade_code: 'Stable code.', grade_name: 'Name shown.', min_score: 'Lowest score in the band.', max_score: 'Highest score in the band.' }
  },
  crm_party_product_class_stat: {
    usedBy: 'Analysis; recalculated after registrations and transfers.',
    fields: { active_owned_count: 'Products of the class held now.', lifetime_registered_count: 'Products of the class ever registered.', last_registered_at: 'Latest registration.' }
  },
  crm_metric_definition: {
    usedBy: 'Analysis (custom metrics).',
    fields: {
      metric_definition_id: 'Metric key.', metric_code: 'Stable code.', metric_name: 'Name shown.', value_type: 'Kind of value.', unit_code: 'Unit.'
    }
  },
  crm_party_metric_value: {
    usedBy: 'Analysis.',
    fields: {
      party_metric_value_id: 'Row key.', metric_definition_id: 'Metric.', numeric_value: 'Value for NUMBER metrics.',
      text_value: 'Value for TEXT metrics.', boolean_value: 'Value for BOOLEAN metrics.', date_value: 'Value for DATE metrics.'
    }
  },

  /* ---------------------------------------------------------------- internal */
  crm_department: {
    usedBy: 'Settings > Departments; managers.',
    fields: { department_code: 'Stable code.', department_name: 'Name shown.' }
  },
  crm_manager_department: {
    usedBy: 'Managers (department of each console user).',
    fields: { manager_id: 'Console manager.', assigned_by_manager_id: 'Who assigned the department.' }
  },
  crm_role_department: {
    usedBy: 'Managers (which roles a department may receive).',
    fields: { role_id: 'Console role (→ manager_roles).' }
  }
};

module.exports = { conventions, common, groups, tables };
