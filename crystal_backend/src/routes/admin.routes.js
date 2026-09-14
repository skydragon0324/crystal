const Router = require('express-promise-router');
const { authenticate } = require('../middleware/auth');
const { attachActor } = require('../utils/actor');
const crudFactory = require('./crud.routes');
const { SYSTEMS } = require('../utils/systems');


/**
 * The console's API, mounted at /api/admin.
 *
 * Kept under its own prefix rather than at the root because the customer
 * website is at the root and the two would collide: /categories means the
 * published sections to a visitor and every row including the drafts to an
 * administrator, and one path cannot honestly be both.
 *
 * Sign-in is mounted OUTSIDE this router - see routes/index.js - because it
 * is what produces the token the guard below requires.
 */
const router = Router();

router.use(authenticate);

/*
 * Who is asking, reduced to plain data once per request.
 *
 * Router level rather than per route, so no handler has to remember it and
 * nothing underneath the controllers ever has to take a request object in
 * order to write an audit row.
 */
router.use(attachActor);

/* ---- the front page ---- */
router.use('/dashboard', require('./dashboard.routes'));

/*
 * The chrome's own two endpoints.
 *
 * No requirePermission: neither belongs to a page, and both narrow what they
 * return against the signed-in role's grid from the inside - see
 * controllers/console.controller.js.
 */
const consoleController = require('../controllers/console.controller');
router.get('/search', consoleController.globalSearch);
router.get('/notifications', consoleController.bell);

/* ---- 8. after-sales service operations ---- */
router.use('/tickets', require('./repairTickets.routes'));
router.use('/warranties', require('./warranties.routes'));
router.use('/technicians', require('./technicians.routes'));
router.use('/parts', require('./parts.routes'));
router.use('/stock', require('./stock.routes'));
router.use('/replenishments', require('./replenishments.routes'));
router.use('/claims', require('./claims.routes'));

/* ---- 9. the scoreboard ---- */
router.use('/analysis', require('./analysis.routes'));

/* ---- 4. the support network ---- */
router.use('/agencies', require('./agencies.routes'));

/* ---- 3. the catalogue ---- */
router.use('/products', require('./products.routes'));

/* ---- 10. content ---- */
router.use('/articles', require('./articles.routes'));
router.use('/media', require('./media.routes'));

/* ---- 11. members ---- */
router.use('/members', require('./members.routes'));
router.use('/wallets', require('./wallets.routes'));

/* ---- 1. management ---- */
router.use('/admins', require('./managers.routes'));
router.use('/permissions', require('./permissions.routes'));
router.use('/audit', require('./audit.routes'));
router.use('/settings', require('./settings.routes'));

/*
 * The tables with no rules of their own.
 *
 * Several of these started as hand written routers and lost every line that
 * was not "list, read, write, soft delete" - which is the whole argument for
 * the factory.  A table that grows a rule graduates back out of it, the way
 * repair tickets and part stock both did.
 */
router.use('/symptoms', crudFactory({
  table: 'symptom_catalog', pk: 'id', page: '/admin/service/symptoms',
  columns: ['code', 'name', 'category_id', 'component', 'severity', 'sort_order'],
  searchable: ['code', 'name', 'component'],
  sortable: ['id', 'code', 'name', 'component', 'severity', 'sort_order'],
  defaultSort: 'sort_order',
  /*
   * The symptom catalogue is the clearest case for a spreadsheet in the whole
   * system: it is a long flat list that a service manager wants to review in
   * bulk and hand back, and `code` is a real natural key, so a re-import
   * updates the rows it came from rather than duplicating them.
   */
  excel: {
    matchOn: 'code',
    filename: 'symptoms',
    columns: [
      { key: 'id', header: 'Id', width: 8, type: 'integer', readOnly: true },
      { key: 'code', header: 'Code', width: 16, required: true },
      { key: 'name', header: 'Name', width: 34, required: true },
      // NOT NULL in the table, so it is required here too - the sheet should
      // say so before the row is attempted, not report a constraint after.
      { key: 'component', header: 'Component', width: 20, required: true },
      { key: 'severity', header: 'Severity', width: 12, type: 'integer' },
      { key: 'sort_order', header: 'Order', width: 10, type: 'integer' }
    ]
  }
}));

router.use('/warranty-policies', crudFactory({
  table: 'warranty_policies', pk: 'id', page: '/admin/service/policies',
  columns: ['code', 'name', 'category_id', 'series_id', 'kind', 'months',
    'covers_parts', 'covers_labour', 'covers_accidental', 'claim_limit',
    'price', 'points_price', 'currency', 'is_default', 'sort_order', 'status'],
  searchable: ['code', 'name', 'kind'],
  sortable: ['id', 'code', 'name', 'kind', 'months', 'price', 'sort_order'],
  defaultSort: 'sort_order',
  excel: {
    matchOn: 'code',
    filename: 'warranty-policies',
    columns: [
      { key: 'id', header: 'Id', width: 8, type: 'integer', readOnly: true },
      { key: 'code', header: 'Code', width: 16, required: true },
      { key: 'name', header: 'Name', width: 32, required: true },
      { key: 'kind', header: 'Kind', width: 14, values: ['STANDARD', 'EXTENDED', 'ACCIDENTAL'] },
      { key: 'months', header: 'Months', width: 10, type: 'integer' },
      { key: 'covers_parts', header: 'Covers parts', width: 14, type: 'boolean' },
      { key: 'covers_labour', header: 'Covers labour', width: 14, type: 'boolean' },
      { key: 'covers_accidental', header: 'Covers accidental', width: 18, type: 'boolean' },
      { key: 'claim_limit', header: 'Claim limit', width: 12, type: 'integer' },
      { key: 'price', header: 'Price', width: 12, type: 'number' },
      { key: 'points_price', header: 'Points price', width: 14, type: 'integer' },
      { key: 'currency', header: 'Currency', width: 10 },
      { key: 'sort_order', header: 'Order', width: 10, type: 'integer' },
      { key: 'status', header: 'Status', width: 12, values: ['ACTIVE', 'INACTIVE'] }
    ]
  }
}));

router.use('/faqs', crudFactory({
  table: 'faqs', pk: 'id', page: '/admin/support/faqs',
  columns: ['category', 'product_category_id', 'question', 'answer', 'sort_order', 'status'],
  searchable: ['question', 'answer', 'category'],
  sortable: ['id', 'category', 'question', 'sort_order', 'view_count'],
  defaultSort: 'sort_order',
  /*
   * Matched on the primary key, not on the question: two FAQs may legitimately
   * be worded the same under different topics, and a natural key that is not
   * actually unique silently merges rows on the way back in.
   */
  excel: {
    filename: 'faqs',
    columns: [
      { key: 'id', header: 'Id', width: 8, type: 'integer' },
      /*
       * The SYSTEM the question is about, not the topic it covers. A fixed
       * vocabulary in the sheet as well as in the table, so an import says
       * "Category must be one of ..." on the row rather than failing on a
       * check constraint nobody outside the database can read.
       */
      { key: 'category', header: 'Category', width: 18, required: true, values: SYSTEMS },
      { key: 'question', header: 'Question', width: 46, required: true },
      { key: 'answer', header: 'Answer', width: 70, required: true },
      { key: 'view_count', header: 'Reads', width: 10, type: 'integer', readOnly: true },
      { key: 'sort_order', header: 'Order', width: 10, type: 'integer' },
      /*
       * DRAFT and PUBLISHED, which is what this column has always held.
       *
       * The sheet offered ACTIVE and INACTIVE - neither of which the
       * storefront reads, and the column had no CHECK to refuse them - so a
       * spreadsheet round trip could set a status that quietly took the answer
       * off the website while the console still listed it. The column is a
       * publish_status now and would refuse it, but the sheet should say the
       * right words rather than let the database be the one to object.
       */
      { key: 'status', header: 'Status', width: 12, values: ['DRAFT', 'PUBLISHED'] }
    ]
  }
}));

/*
 * WHO A NOTICE IS FROM, as a plain master table of its own.
 *
 * A separate table rather than a CHECK constraint on the notice, because the
 * list is operational rather than structural: a campaign, a new store, a
 * regulator. Somebody in operations adds one, and none of them is worth a
 * release - which is the same argument every other master table here makes.
 *
 * Declared BEFORE '/notices' only for readability; the router matches on the
 * full path, so the order carries no meaning between two distinct mounts.
 */
/*
 * THE ABOUT PAGE, as ONE table of pictures.
 *
 * It used to be three tables and ten console screens, because every word of
 * the page was data. The words are now in crystal-web/src/pages/about/
 * content.js - a company's account of itself is rewritten every few years by
 * somebody who cares about the wording, not edited through a form, and as rows
 * it could not be reviewed or translated with the rest of the site's copy.
 *
 * What remains is the photographs, which genuinely are data: uploaded,
 * replaced, and served from somewhere. One screen edits them.
 *
 * `slot` IS WRITABLE, unlike the old `code`, and that is the difference
 * between a vocabulary and a name. A chapter code was read by the storefront
 * and retyping one silently emptied a band of the website; a slot is just
 * where a picture goes, an unknown one renders nothing, and the page decides
 * what it asks for.
 */
router.use('/about-images', crudFactory({
  table: 'about_images', pk: 'id', page: '/admin/company/about-images',
  columns: ['slot', 'file_path', 'file_path_dark', 'alt_text', 'caption',
    'sort_order', 'status'],
  searchable: ['slot', 'alt_text', 'caption'],
  sortable: ['id', 'slot', 'sort_order'],
  filterable: ['slot'],
  defaultSort: 'sort_order'
}));

router.use('/notice-origins', crudFactory({
  table: 'notice_origins', pk: 'id', page: '/admin/base/notice-origins',
  columns: ['code', 'name', 'colour', 'sort_order', 'status'],
  searchable: ['code', 'name'],
  sortable: ['id', 'code', 'name', 'sort_order', 'status'],
  defaultSort: 'sort_order'
}));

/*
 * THE POPUP NOTICES, as a plain master table.
 *
 * A window and a switch decide whether each one is live; the storefront asks
 * for whatever is live now and gets all of it. See services/notices.service.js
 * for the liveness rule, which is deliberately in one place.
 */
router.use('/notices', crudFactory({
  table: 'site_notices', pk: 'id', page: '/admin/base/notices',
  columns: ['title', 'content', 'origin_id', 'status', 'starts_at', 'ends_at',
    'sort_order'],
  searchable: ['title'],
  sortable: ['id', 'title', 'status', 'sort_order', 'starts_at', 'updated_at'],
  defaultSort: 'sort_order',
  defaultDir: 'desc',
  /*
   * The origin's NAME rides along, so the list can label a notice without
   * the console holding a second copy of the origin table to look it up in.
   */
  decorate: function (qb) {
    qb.leftJoin('notice_origins as o', 'o.id', 'site_notices.origin_id')
      .select('site_notices.*', 'o.name as origin_name', 'o.colour as origin_colour');
  }
}));

router.use('/service-prices', crudFactory({
  table: 'service_prices', pk: 'id', page: '/admin/support/pricing',
  /*
   * THE PUBLISHED PRICE LIST, and only that.
   *
   * It used to carry the ticket side of a repair as well - the shelf item a
   * line consumed, its bench minutes, how many were covered, an internal
   * costing price beside the counter one, and a table of attached documents.
   * All of that is the REPAIR's business rather than the price list's, and a
   * ticket already keeps its own copy of every figure it charged.
   */
  columns: ['product_id', 'part_name', 'part_price', 'service_price', 'approval_no',
    'sort_order'],
  searchable: ['part_name', 'approval_no'],
  sortable: ['id', 'part_name', 'part_price', 'service_price', 'approval_no', 'sort_order'],
  defaultSort: 'sort_order',

  /*
   * Smartphone and eproduct price lists are maintained by different
   * people, so they are two pages granted separately - exactly as the
   * product catalogue is. A price line reaches its section through its
   * product, so the join is supplied here.
   */
  sectionFilter: function (qb, types) {
    qb.whereIn('service_prices.product_id', function () {
      this.select('p.id').from('products as p')
        .join('product_categories as c', 'c.id', 'p.category_id')
        .whereIn('c.type', types);
    });
  },

  decorate: function (qb) {
    qb.leftJoin('products as p', 'p.id', 'service_prices.product_id')
      .select('service_prices.*', 'p.name as product_name', 'p.slug as product_slug');
  },
  /*
   * Repair prices are the one list a service manager genuinely maintains in
   * bulk - a supplier raises the cost of every C9 display at once - so the
   * product name rides along READ ONLY, to make the sheet legible without
   * letting somebody rename a product from inside it.
   */
  excel: {
    filename: 'service-prices',
    columns: [
      { key: 'id', header: 'Id', width: 8, type: 'integer' },
      { key: 'product_name', header: 'Product', width: 26, readOnly: true },
      { key: 'part_name', header: 'Part', width: 32, required: true },
      { key: 'part_price', header: 'Part price', width: 12, type: 'number' },
      { key: 'service_price', header: 'Service price', width: 14, type: 'number' },
      { key: 'approval_no', header: 'Approval number', width: 20 },
      { key: 'sort_order', header: 'Order', width: 10, type: 'integer' }
    ]
  }
}));

/*
 * A product's own artwork: the studio set and the advertising run.
 *
 * Its own resource rather than a corner of /media, because it is its own
 * table now - product_images is a real relation with a foreign key, where
 * media_assets is polymorphic and cannot have one.
 */
router.use('/product-images', crudFactory({
  table: 'product_images', pk: 'id', page: '/admin/catalog/products',
  columns: ['product_id', 'kind', 'device_type', 'file_path', 'alt_text',
    'width', 'height', 'sort_order'],
  searchable: ['file_path', 'alt_text'],
  sortable: ['id', 'kind', 'device_type', 'sort_order'],
  defaultSort: 'sort_order',
  decorate: function (qb) {
    qb.leftJoin('products as p', 'p.id', 'product_images.product_id')
      .select('product_images.*', 'p.name as product_name', 'p.slug as product_slug');
  }
}));

/*
 * A product's OWN update record.
 *
 * Nothing joins this to os_versions any more: the firmware a television
 * ships is not a Crystal OS build, and even a handset reports its own
 * version string. It is edited from the product editor, and it is a plain
 * master table like any other.
 */
router.use('/product-os-history', crudFactory({
  table: 'product_os_history', pk: 'id', page: '/admin/catalog/products',
  columns: ['product_id', 'os_version', 'release_date', 'content',
    'pub_approve_number', 'sort_order'],
  searchable: ['os_version', 'content', 'pub_approve_number'],
  sortable: ['id', 'os_version', 'release_date', 'sort_order'],
  defaultSort: 'sort_order',
  decorate: function (qb) {
    qb.leftJoin('products as p', 'p.id', 'product_os_history.product_id')
      .select('product_os_history.*', 'p.name as product_name', 'p.slug as product_slug');
  }
}));

router.use('/categories', crudFactory({
  table: 'product_categories', pk: 'id', page: '/admin/catalog/categories',
  columns: ['name', 'slug', 'type', 'icon', 'description', 'sort_order', 'status'],
  searchable: ['name', 'slug', 'type'],
  sortable: ['id', 'name', 'type', 'sort_order'],
  defaultSort: 'sort_order',
  excel: {
    matchOn: 'slug',
    filename: 'categories',
    columns: [
      { key: 'id', header: 'Id', width: 8, type: 'integer', readOnly: true },
      { key: 'name', header: 'Name', width: 24, required: true },
      { key: 'slug', header: 'Slug', width: 20, required: true },
      { key: 'type', header: 'Type', width: 16, required: true },
      { key: 'description', header: 'Description', width: 60 },
      { key: 'icon', header: 'Icon path', width: 34 },
      { key: 'sort_order', header: 'Order', width: 10, type: 'integer' },
      { key: 'status', header: 'Status', width: 12, values: ['ACTIVE', 'INACTIVE'] }
    ]
  }
}));

router.use('/series', crudFactory({
  table: 'product_series', pk: 'id', page: '/admin/catalog/series',
  columns: ['category_id', 'name', 'slug', 'description', 'banner_image',
    'banner_image_mobile', 'sort_order', 'status'],
  searchable: ['name', 'slug'],
  sortable: ['id', 'name', 'sort_order'],
  defaultSort: 'sort_order',
  decorate: function (qb) {
    qb.leftJoin('product_categories as c', 'c.id', 'product_series.category_id')
      /*
       * THE SECTION'S TYPE TRAVELS WITH THE SERIES.
       *
       * A series belongs to a section and a section is either a smartphone one
       * or it is not - which is what the console's two product pages are split
       * by. Without this the Series dropdown on the smartphone page offered
       * television series, and picking one produced a product filed under a
       * section it could not belong to.
       */
      .select('product_series.*', 'c.name as category_name', 'c.type as category_type');
  },
  filterable: ['category_id'],
  excel: {
    matchOn: 'slug',
    filename: 'series',
    columns: [
      { key: 'id', header: 'Id', width: 8, type: 'integer', readOnly: true },
      { key: 'category_name', header: 'Section', width: 20, readOnly: true },
      { key: 'name', header: 'Name', width: 22, required: true },
      { key: 'slug', header: 'Slug', width: 18, required: true },
      { key: 'description', header: 'Description', width: 60 },
      { key: 'sort_order', header: 'Order', width: 10, type: 'integer' },
      { key: 'status', header: 'Status', width: 12, values: ['ACTIVE', 'INACTIVE'] }
    ]
  }
}));

router.use('/specification-groups', crudFactory({
  table: 'specification_groups', pk: 'id', page: '/admin/catalog/specifications',
  /*
   * The category is what makes a sheet different per section - a television
   * asked about its panel rather than a front camera. NULL applies to every
   * product, which is what Build and In the box are.
   */
  columns: ['product_category_id', 'name', 'code', 'sort_order'],
  searchable: ['name', 'code'],
  sortable: ['id', 'name', 'code', 'sort_order'],
  defaultSort: 'sort_order',
  softDelete: false,
  decorate: function (qb) {
    qb.leftJoin('product_categories as c', 'c.id', 'specification_groups.product_category_id')
      .select('specification_groups.*', 'c.name as category_name', 'c.type as category_type');
  }
}));

router.use('/specification-definitions', crudFactory({
  table: 'specification_definitions', pk: 'id', page: '/admin/catalog/specifications',
  columns: ['group_id', 'name', 'unit', 'compare_enabled', 'sort_order'],
  searchable: ['name', 'unit'],
  sortable: ['id', 'name', 'sort_order'],
  defaultSort: 'sort_order',
  softDelete: false,
  decorate: function (qb) {
    qb.leftJoin('specification_groups as g', 'g.id', 'specification_definitions.group_id')
      .select('specification_definitions.*', 'g.name as group_name', 'g.code as group_code');
  }
}));

router.use('/os-versions', crudFactory({
  table: 'os_versions', pk: 'id', page: '/admin/catalog/os',
  columns: ['version', 'title', 'description', 'highlights', 'cover_image',
    'release_date', 'status'],
  searchable: ['version', 'title'],
  sortable: ['id', 'version', 'release_date'],
  defaultSort: 'release_date',
  excel: {
    matchOn: 'version',
    filename: 'os-versions',
    columns: [
      { key: 'id', header: 'Id', width: 8, type: 'integer', readOnly: true },
      { key: 'version', header: 'Version', width: 12, required: true },
      { key: 'title', header: 'Title', width: 36, required: true },
      { key: 'description', header: 'Description', width: 60 },
      { key: 'highlights', header: 'Highlights', width: 70 },
      { key: 'release_date', header: 'Released', width: 14, type: 'date' },
      { key: 'status', header: 'Status', width: 12, values: ['DRAFT', 'PUBLISHED'] }
    ]
  }
}));

router.use('/roles', crudFactory({
  table: 'manager_roles', pk: 'id', page: '/admin/management/roles',
  columns: ['role_code', 'role_name', 'default_page'],
  searchable: ['role_code', 'role_name'],
  sortable: ['id', 'role_code', 'role_name'],
  defaultSort: 'role_name',
  softDelete: false,
  decorate: function (qb) {
    qb.leftJoin('manager_pages as p', 'p.id', 'manager_roles.default_page')
      .select('manager_roles.*', 'p.page_name as default_page_name', 'p.page_url as default_page_url');
  }
}));

router.use('/pages', crudFactory({
  table: 'manager_pages', pk: 'id', page: '/admin/management/pages',
  columns: ['parent_id', 'page_url', 'page_name', 'icon', 'sort_order', 'is_menu'],
  searchable: ['page_url', 'page_name'],
  sortable: ['id', 'page_url', 'page_name', 'sort_order'],
  defaultSort: 'sort_order',
  softDelete: false
}));

module.exports = router;
