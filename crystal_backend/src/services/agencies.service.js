const repo = require('../repositories/agencies.repository');
const { transaction } = require('../repositories/shared/transaction');
const { HttpError } = require('../utils/response');
const audit = require('./audit.service');

const PAGE = '/admin/support/agencies';
const TABLE = repo.TABLE;

const COLUMNS = ['name', 'code', 'province', 'address', 'phone', 'tier',
  'sla_hours', 'daily_capacity', 'status'];

const SORTABLE = ['id', 'name', 'code', 'province', 'tier', 'open_cnt', 'sla_hours'];

/**
 * WHAT A CENTRE MAY OFFER, and it is a different list per section.
 *
 * Fixed rather than free text, because these are the counters a customer
 * picks from on the storefront: a centre that typed "Repairs" instead of
 * "REPAIR" would simply not appear under the filter, and nobody would
 * notice until somebody drove there.
 *
 * The two lists overlap only at REPAIR, which is deliberate - it is the
 * same word for two different counters, which is exactly why the section is
 * part of the key rather than something inferred from the service name.
 */
const SECTION_SERVICES = {
  SMARTPHONE: ['OS', 'REPAIR', 'INSURANCE', 'REPLACEMENT'],
  EPRODUCT: ['MEDIA_SERVICE', 'REPAIR', 'STREAMING_DEVICES', 'COMPUTER',
    'CORDLESS_PHONE', 'CAMERA_DEVICE']
};

const SECTIONS = Object.keys(SECTION_SERVICES);

/**
 * The section a request is talking about, or a 400.
 *
 * Never defaulted: a save that guessed SMARTPHONE would quietly write the
 * wrong counter's list, and the two are edited by different people.
 */
function assertSection(section) {
  const upper = String(section || '').toUpperCase();
  if (SECTIONS.indexOf(upper) === -1) throw new HttpError(400, 'common.valueFailedAValidation');
  return upper;
}

/** The service list for one section, rejecting anything outside it. */
function assertServices(section, types) {
  const allowed = SECTION_SERVICES[section];
  const wanted = (types || []).map(function (type) { return String(type).toUpperCase(); });

  const stray = wanted.filter(function (type) { return allowed.indexOf(type) === -1; });
  if (stray.length) throw new HttpError(400, 'common.valueFailedAValidation');

  // A list that named the same service twice would violate the unique key
  // as a 500 rather than as the 400 it is.
  return wanted.filter(function (type, index) { return wanted.indexOf(type) === index; });
}
const DEFAULT_SORT = 'name';

function search(filters, paging) {
  return repo.search(filters, paging);
}

function options(deleted) {
  return repo.options(deleted);
}

function provinces() {
  return repo.provinces();
}

async function detail(id, deleted, section) {
  const agency = await repo.findById(id, deleted);
  if (!agency) throw new HttpError(404, 'common.notFound');

  // Both sections when none is asked for, which is what a centre
  // overview wants; one when a section page is asking.
  const services = await repo.servicesOf(id, section);
  return { agency: agency, services: services };
}

/** The storefront's locator - published centres only, nearest first. */
function nearest(filters) {
  return repo.nearest(filters);
}

async function create(body, actor) {
  const data = Object.assign({}, body);
  delete data.services;
  delete data.section;

  if (!data.name || !data.province || !data.address) {
    throw new HttpError(400, 'common.valueFailedAValidation');
  }

  /*
   * A new centre is created FROM a section page, so it arrives with that
   * section's service list and nothing else. It is a real place either way
   * - the other counter simply has no list yet.
   */
  const section = body.services ? assertSection(body.section) : null;
  const services = section ? assertServices(section, body.services) : null;

  return transaction(async function (trx) {
    const rows = await repo.insert(data, trx);
    if (section) await repo.replaceServices(rows[0].id, section, services, trx);

    audit.created(actor, TABLE, rows[0].id, rows[0], PAGE);
    return rows[0];
  });
}

async function update(id, body, actor) {
  const data = Object.assign({}, body);
  delete data.services;
  delete data.section;

  const previous = await repo.findRow(id);
  if (!previous) throw new HttpError(404, 'common.notFound');

  /*
   * `services` replaces ONE SECTION and leaves the other alone - see the
   * repository. Saving the smartphone counter must not clear the eproduct
   * one, because a different person maintains it.
   */
  const section = body.services ? assertSection(body.section) : null;
  const services = section ? assertServices(section, body.services) : null;

  return transaction(async function (trx) {
    const rows = Object.keys(data).length ? await repo.update(id, data, trx) : [previous];
    if (section) await repo.replaceServices(id, section, services, trx);

    audit.updated(actor, TABLE, id, previous, rows[0], PAGE);
    return rows[0];
  });
}

async function remove(id, actor) {
  const previous = await repo.findRow(id);
  const affected = await repo.softDelete(id);
  if (!affected) throw new HttpError(404, 'common.notFound');
  audit.deleted(actor, TABLE, id, previous, PAGE);
}

async function restore(id, actor) {
  const rows = await repo.restore(id);
  if (!rows.length) throw new HttpError(404, 'common.notFound');
  audit.restored(actor, TABLE, id, rows[0], PAGE);
}

module.exports = {
  PAGE: PAGE,
  COLUMNS: COLUMNS,
  SECTIONS: SECTIONS,
  SECTION_SERVICES: SECTION_SERVICES,
  SORTABLE: SORTABLE,
  DEFAULT_SORT: DEFAULT_SORT,
  search: search,
  options: options,
  provinces: provinces,
  detail: detail,
  nearest: nearest,
  create: create,
  update: update,
  remove: remove,
  restore: restore
};
