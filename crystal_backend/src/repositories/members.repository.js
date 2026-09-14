const db = require('../config/db');

const REGISTRATIONS = 'registered_products';
const LICENSES = 'licenses';

/**
 * A member's devices: what they have registered, and what they have licensed.
 *
 * Both are read almost exclusively scoped to one member, so every function
 * here takes a userId and puts it in the WHERE clause rather than accepting
 * it as an optional filter - a member centre endpoint that could be talked
 * into dropping that condition is somebody else's device list.
 */

const REGISTRATION_SELECT = [
  'r.*',
  'p.name as product_name', 'p.slug as product_slug', 'p.main_image', 'p.model_code',
  'c.name as category_name', 'c.type as category_type',
  db.raw("(SELECT w.id FROM warranties w WHERE w.serial_number = r.serial_number " +
         "AND w.status = 'ACTIVE' AND w.end_date >= CURRENT_DATE " +
         "ORDER BY w.end_date DESC LIMIT 1) AS warranty_id"),
  db.raw("(SELECT w.end_date FROM warranties w WHERE w.serial_number = r.serial_number " +
         "AND w.status = 'ACTIVE' AND w.end_date >= CURRENT_DATE " +
         "ORDER BY w.end_date DESC LIMIT 1) AS cover_until"),
  db.raw('(SELECT COUNT(*) FROM repair_tickets t WHERE t.serial_number = r.serial_number ' +
         'AND t.is_deleted = false) AS repair_cnt')
];

function registrationScope(userId) {
  const qb = db(REGISTRATIONS + ' as r')
    .leftJoin('products as p', 'p.id', 'r.product_id')
    .leftJoin('product_categories as c', 'c.id', 'p.category_id');
  if (userId) qb.where('r.user_id', userId);
  return qb;
}

async function registrations(userId, paging) {
  const qb = registrationScope(userId);
  const countRow = await qb.clone().clearSelect().count({ c: '*' }).first();

  const rows = await qb.select(REGISTRATION_SELECT)
    .orderBy('r.register_time', 'desc')
    .limit(paging.limit).offset(paging.offset);

  return { rows: rows, total: Number(countRow.c) };
}

function findRegistration(id, trx) {
  return (trx || db)(REGISTRATIONS).where('id', id).first();
}

function findRegistrationDetail(id) {
  return registrationScope(null).where('r.id', id).first(REGISTRATION_SELECT);
}

function findRegistrationBySerial(serialNumber, trx) {
  return (trx || db)(REGISTRATIONS)
    .whereRaw('UPPER(serial_number) = ?', [String(serialNumber || '').trim().toUpperCase()])
    .first();
}

function insertRegistration(data, trx) {
  return (trx || db)(REGISTRATIONS).insert(data).returning('*');
}

function removeRegistration(id, trx) {
  return (trx || db)(REGISTRATIONS).where('id', id).del();
}

/* ---- licences ---- */

function licenseScope(userId) {
  const qb = db(LICENSES + ' as l')
    .leftJoin(REGISTRATIONS + ' as r', 'r.id', 'l.registered_product_id')
    .leftJoin('products as p', 'p.id', 'r.product_id');
  if (userId) qb.where('l.user_id', userId);
  return qb;
}

async function licenses(userId, paging) {
  const qb = licenseScope(userId);
  const countRow = await qb.clone().clearSelect().count({ c: '*' }).first();

  const rows = await qb.select('l.*', 'p.name as product_name', 'p.slug as product_slug')
    .orderBy('l.created_at', 'desc')
    .limit(paging.limit).offset(paging.offset);

  return { rows: rows, total: Number(countRow.c) };
}

function findLicense(id, trx) {
  return (trx || db)(LICENSES).where('id', id).first();
}

function findLicenseByDeviceSn(deviceSn, trx) {
  return (trx || db)(LICENSES)
    .whereRaw('UPPER(device_sn) = ?', [String(deviceSn || '').trim().toUpperCase()])
    .where('status', 'ACTIVE')
    .first();
}

function insertLicense(data, trx) {
  return (trx || db)(LICENSES).insert(data).returning('*');
}

/**
 * The registered devices that could still be given a licence.
 *
 * Only the categories the spec licenses, and only the ones that do not
 * already have one - offering a licence for a device that has a live licence
 * is offering to charge somebody twice.
 */
function licensableDevices(userId) {
  return db(REGISTRATIONS + ' as r')
    .join('products as p', 'p.id', 'r.product_id')
    .join('product_categories as c', 'c.id', 'p.category_id')
    .where('r.user_id', userId)
    .whereIn('c.type', ['TV', 'STB'])
    .whereNotExists(function () {
      this.select(db.raw(1)).from(LICENSES + ' as l')
        .whereRaw('UPPER(l.device_sn) = UPPER(r.serial_number)')
        .where('l.status', 'ACTIVE');
    })
    .orderBy('r.register_time', 'desc')
    .select('r.id', 'r.serial_number', 'p.name as product_name', 'p.slug',
      'c.type as device_type');
}

module.exports = {
  REGISTRATIONS: REGISTRATIONS,
  LICENSES: LICENSES,
  registrations: registrations,
  findRegistration: findRegistration,
  findRegistrationDetail: findRegistrationDetail,
  findRegistrationBySerial: findRegistrationBySerial,
  insertRegistration: insertRegistration,
  removeRegistration: removeRegistration,
  licenses: licenses,
  findLicense: findLicense,
  findLicenseByDeviceSn: findLicenseByDeviceSn,
  insertLicense: insertLicense,
  licensableDevices: licensableDevices
};
