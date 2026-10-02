on your implementation, site means service center?
also, you implemented same code from vendor, 
I don't think you implemented what I designed for CRM
please refer my new version of CRM
for example, on customers page, you didn't mentioned that I added on DB - 
Table crm_party_analysis_snapshot {
  analysis_snapshot_id bigint [pk, increment] // Snapshot identifier.
  party_id bigint [not null] // Party being analyzed.
  project_id int // NULL = Dream-wide; otherwise one project.
  reference_date date [not null] // Date represented by the snapshot.
  calculated_at timestamptz [not null] // Calculation time.
  reporting_currency_code varchar(3) // Common currency for monetary analytical values.
  first_transaction_at timestamptz // Earliest transaction in scope.
  last_transaction_at timestamptz // Latest transaction in scope.
  purchase_amount_lifetime numeric(20,4) // Lifetime normalized purchase amount in scope.
  purchase_amount_12m numeric(20,4) // Normalized purchase amount over prior 12 months.
  transaction_count_lifetime int // Lifetime transaction count in scope.
  transaction_count_12m int // 12-month transaction count.
  active_purchase_days_12m int // Distinct purchase dates across the scope; corporate rows must de-duplicate dates across projects.
  average_transaction_amount_12m numeric(20,4) // Derived from total 12m amount / total 12m transaction count, not average of project averages.
  service_case_count_12m int // 12-month service-case count.
  complaint_count_12m int // 12-month complaint count.
  activity_status varchar(30) // Derived activity category.
  corporate_score numeric(8,4) // Dream-wide score; expected primarily when project_id is NULL.
  corporate_grade_id smallint // Dream-wide grade derived from corporate_score; normally NULL for project-scoped rows.
  model_version varchar(50) // Version of aggregation/scoring logic.
  created_at timestamptz [not null] // Snapshot row creation time.
}

also you don't have basic data management which I implemented on DB design
please review my DB design for CRM again, and implement all features correctly

another one is UI/UX
please check current UI/UX, which is not good enough
one example, on customers page, if I click one row, it shows the detailed page
But, it doesn't have good UX design

of course, it is important to implement current logic on vendor project, but also more important to add my new CRM design
I added the DB design and logic again
But, consider that this design and logic were made without this crystal and vendor projects
so, think about the current features on verdor, while implementing new CRM
