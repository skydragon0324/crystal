/**
 * Single init migration.
 *
 * sql/schema.sql is the source of truth; this migration only executes it, so
 * `knex migrate:latest` and the raw file can never drift apart.  A schema
 * change is a change to that file plus a numbered delta beside it - never a
 * knex schema builder call, which would give the project two descriptions of
 * the same tables and no way to tell which one is right.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', '..', '..', 'sql', 'schema.sql');

const DROP = `
DROP VIEW IF EXISTS v_defect_watch, v_agency_health, v_repair_monthly_stats, v_part_balance CASCADE;
DROP TABLE IF EXISTS
  warranty_claims, repair_ticket_events, repair_ticket_items, repair_tickets,
  part_replenishment_items, part_replenishments, part_movements, part_stock,
  part_compatibility, parts, technician_skills, technicians, symptom_catalog,
  warranties, warranty_policies,
  site_notices, feedback_messages, feedback_threads, point_logs, wallet_transactions, wallets,
  licenses, registered_products, oracle_serials, articles,
  service_prices, faqs, agency_services, agencies,
  product_os_history, os_versions, media_assets, product_images,
  product_accessories, product_colors,
  product_specifications, specification_definitions, specification_groups,
  products, product_series, product_categories,
  otp_codes, users,
  system_settings, audit_log, admin_permissions, admins, admin_roles, admin_pages
  CASCADE;
DROP FUNCTION IF EXISTS check_ticket_warranty() CASCADE;
DROP FUNCTION IF EXISTS set_updated_at() CASCADE;
`;

exports.up = async function up(knex) {
  const sql = fs.readFileSync(SQL_FILE, 'utf8');
  await knex.raw(sql);
};

exports.down = async function down(knex) {
  await knex.raw(DROP);
};
