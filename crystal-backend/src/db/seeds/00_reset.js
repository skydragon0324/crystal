/**
 * Empties every table, in the order the foreign keys allow.
 *
 * The seed files below used to each clear their own tables, which worked
 * until the repair tickets in seed 06 started pointing at the service centres
 * in seed 03: knex runs seeds in filename order, so 03 was deleting rows that
 * 06 still had references to, and RESTRICT quite correctly refused.
 *
 * One ordered reset is the fix, and it belongs in one file rather than being
 * spread across six that each know a little of the order.  Children first,
 * parents last - read it bottom-up and it is the order the seeds insert in.
 */

const TABLES = [
  /* after-sales, deepest first */
  'repair_ticket_events',
  'repair_ticket_items',
  'part_replenishment_items',
  'part_replenishments',
  'warranty_claims',
  'repair_tickets',
  'part_movements',
  'part_stock',
  'part_compatibility',
  'technician_skills',
  'technicians',
  'parts',
  'warranties',
  'warranty_policies',
  'symptom_catalog',

  /* member centre */
  'point_logs',
  'wallet_transactions',
  'wallets',
  'licenses',
  'registered_products',
  'feedback_messages',
  'feedback_threads',
  'otp_codes',
  'oracle_serials',
  'users',

  /* content and catalogue */
  'site_adverts',
  'site_popups',
  'site_notices',
  'notice_origins',
  'articles',
  'product_images',
  'media_assets',
  'product_os_history',
  'os_versions',
  'service_prices',
  'faqs',
  'agency_services',
  'agency_phones',
  'agencies',
  'provinces',
  'product_accessories',
  'product_colors',
  'product_specifications',
  'specification_definitions',
  'specification_groups',
  'products',
  'product_series',
  'product_categories',

  /* the console itself */
  'audit_log',
  'system_settings',
  'manager_permissions',
  'managers',
  'manager_roles',
  'manager_pages'
];

exports.seed = async function seed(knex) {
  /*
   * THE SIGNATURES FOR ROWS THIS RESET IS ABOUT TO RENUMBER.
   *
   * A notice's or an FAQ's signature is keyed by its id, and the ids start
   * again from 1 below - so the signature for yesterday's notice 3 would sit
   * beside today's, fail, and never be replaced: the backfill deliberately
   * does not re-sign an item whose signature fails. They go first, and
   * 99_signatures signs what the seeds write.
   *
   * IMAGE SIGNATURES STAY. They cover files, and a reseed does not touch the
   * upload directory; clearing them would re-sign whatever is on disk, which is
   * exactly the laundering the backfill is written to refuse.
   */
  await knex('content_signatures').whereIn('content_type', ['notification', 'faq']).del();

  for (let i = 0; i < TABLES.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await knex(TABLES[i]).del();
    // eslint-disable-next-line no-await-in-loop
    await restartIdentity(knex, TABLES[i]);
  }
};

/**
 * PUT THE KEY SEQUENCE BACK, which `del()` does not do.
 *
 * Reseeding was not reproducible without this, and `users` showed why. Signing
 * in mirrors a platform member into Crystal under the PLATFORM's id
 * (repositories/users.repository.js, insertWithId), which pushes this table's
 * sequence up into the platform's id space - past ten million. A later reseed
 * then handed freshly seeded members ids from up there, where they collided
 * with the platform's own users and the whole identity bridge came apart.
 *
 * So the sequence is restored to the table it belongs to. At runtime
 * insertWithId still pushes it past any id it mirrors, which is correct - the
 * point is that a reseed starts from Crystal's own numbering rather than
 * inheriting wherever the last mirrored member happened to leave it.
 *
 * A table with no serial key - a join table, one keyed by something else -
 * simply has no sequence to reset, which is what the NULL guard covers.
 */
async function restartIdentity(knex, table) {
  await knex.raw(
    `SELECT setval(pg_get_serial_sequence(c.table_name, c.column_name), 1, false)
       FROM information_schema.columns c
      WHERE c.table_schema = current_schema()
        AND c.table_name = ?
        AND c.column_default LIKE 'nextval(%'`,
    [table]
  );
}
