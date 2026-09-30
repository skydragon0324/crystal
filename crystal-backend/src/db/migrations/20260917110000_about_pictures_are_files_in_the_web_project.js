/**
 * Delta 031, as a migration.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(
  __dirname, '..', '..', '..', 'sql', 'deltas',
  '031_about_pictures_are_files_in_the_web_project.sql'
);

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down(knex) {
  /*
   * The TABLE comes back; THE PICTURES DO NOT.
   *
   * Rolling this back restores the shape of about_images, the console screen
   * and its group - enough for the code of that era to run - but the rows are
   * gone and so are the files under /uploads/about/, which were deleted with
   * the table because the web project holds them now. A database rolled back
   * to here has an About screen with nothing in it; the storefront is
   * unaffected either way, because it draws the page from its own bundle.
   *
   * The signatures are not restored either: they signed files that no longer
   * exist, and an audit would report every one of them MISSING.
   */
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS about_images (
        id             serial       PRIMARY KEY,
        slot           varchar(60)  NOT NULL,
        file_path      varchar(255) NOT NULL,
        file_path_dark varchar(255) NULL,
        alt_text       varchar(255) NULL,
        caption        varchar(255) NULL,
        sort_order     integer      NOT NULL DEFAULT 0,
        status         publish_status NOT NULL DEFAULT 'ACTIVE',
        is_deleted     boolean      NOT NULL DEFAULT false,
        created_at     timestamptz  NOT NULL DEFAULT now(),
        updated_at     timestamptz  NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_about_images_slot ON about_images(slot, sort_order);
  `);

  const group = await knex('manager_pages').where('page_url', '/admin/company').first('id');
  const parent = group
    ? group.id
    : (await knex('manager_pages').insert({
      page_url: '/admin/company',
      page_name: 'Company',
      icon: 'MdBusiness',
      sort_order: 0
    }).returning('id'))[0];

  const exists = await knex('manager_pages').where('page_url', '/admin/company/about-images').first('id');
  if (!exists) {
    await knex('manager_pages').insert({
      parent_id: typeof parent === 'object' ? parent.id : parent,
      page_url: '/admin/company/about-images',
      page_name: 'About images',
      icon: 'MdPhotoLibrary',
      sort_order: 0
    });
  }
};
