const repo = require('../repositories/agencies.repository');
const { transaction } = require('../repositories/shared/transaction');
const { HttpError } = require('../utils/response');
const audit = require('./audit.service');

const PAGE = '/admin/support/agencies';
const TABLE = repo.TABLE;

/*
 * The columns a save may write. `phone` is not one any more - a centre's
 * numbers are a list in agency_phones, sent as `phones` and replaced whole.
 * `landmark` is, and it is only ever read back by the console.
 */
const COLUMNS = ['name', 'code', 'province', 'address', 'landmark', 'tier',
  'sla_hours', 'daily_capacity', 'sort_order', 'status'];

const SORTABLE = ['id', 'name', 'code', 'province', 'tier', 'open_cnt', 'sla_hours', 'sort_order'];

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

const PHONE_MAX = 40;
const LABEL_MAX = 60;

/**
 * A centre's numbers as the form sent them, checked - or a 400 that says which.
 *
 * Accepts [{ phone, label }] and, for a caller that has only numbers, plain
 * strings. Blank rows are dropped rather than refused: the console's list
 * editor always has an empty row waiting at the bottom, and saving it is not
 * a mistake. A number given twice is kept once, at its first position - the
 * table's unique key would otherwise turn a repeated paste into a 500.
 *
 * `undefined` means "the save did not mention numbers" and leaves them alone;
 * an empty list means "this centre has none now".
 */
function assertPhones(phones) {
  if (phones === undefined) return undefined;
  if (phones === null) return [];
  if (!Array.isArray(phones)) throw new HttpError(400, 'agencies.phonesMustBeAList');

  const out = [];
  const seen = {};

  phones.forEach(function (entry) {
    const raw = entry && typeof entry === 'object' ? entry : { phone: entry };
    const phone = String(raw.phone === null || raw.phone === undefined ? '' : raw.phone).trim();
    const label = String(raw.label === null || raw.label === undefined ? '' : raw.label).trim();

    if (!phone) return;
    if (phone.length > PHONE_MAX) throw new HttpError(400, 'agencies.aPhoneNumberIsTooLong', null, { phone: phone });
    if (label.length > LABEL_MAX) throw new HttpError(400, 'agencies.aPhoneLabelIsTooLong', null, { label: label });
    if (seen[phone]) return;

    seen[phone] = true;
    out.push({ phone: phone, label: label || null });
  });

  return out;
}

/**
 * The province must be one the Provinces screen knows.
 *
 * The foreign key would refuse it anyway - as "referenced record is missing",
 * which tells the person at the form nothing about what to do next. This says
 * which name was not found and where provinces are added.
 */
async function assertProvince(name, trx) {
  if (name === undefined) return;
  if (!name || !(await repo.provinceExists(name, trx))) {
    throw new HttpError(400, 'agencies.thereIsNoProvinceCalled', null, { province: String(name || '') });
  }
}

/*
 * THE DEFAULT ORDER IS THE DISPLAY ORDER - the same chain the storefront reads
 * (repositories/agencies.repository.js, inDisplayOrder). It was the name, which
 * made the console the one place the list was never in the order a customer
 * saw it in.
 */
const DEFAULT_SORT = 'sort_order';

function search(filters, paging) {
  return repo.search(filters, paging);
}

function options(deleted) {
  return repo.options(deleted);
}

/** The provinces with live centres, in the configured order - see the repository. */
function provinces(filters) {
  return repo.provinces(filters);
}

/** Every province a centre may be filed under, empty ones included, in order. */
function provinceOptions() {
  return repo.provinceOptions();
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
  delete data.phones;

  if (!data.name || !data.province || !data.address) {
    throw new HttpError(400, 'common.valueFailedAValidation');
  }
  await assertProvince(data.province);
  const phones = assertPhones(body.phones);

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
    if (phones) await repo.replacePhones(rows[0].id, phones, trx);

    audit.created(actor, TABLE, rows[0].id, Object.assign({}, rows[0], { phones: phones || [] }), PAGE);
    return rows[0];
  });
}

async function update(id, body, actor) {
  const data = Object.assign({}, body);
  delete data.services;
  delete data.section;
  delete data.phones;

  const previous = await repo.findWithPhones(id);
  if (!previous) throw new HttpError(404, 'common.notFound');

  await assertProvince(data.province);
  const phones = assertPhones(body.phones);

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
    if (phones) await repo.replacePhones(id, phones, trx);

    /*
     * The numbers go into the audit entry beside the columns, so "who changed
     * the repair line's number" has an answer - they are a child table, and
     * the row diff alone would never show them moving.
     */
    audit.updated(actor, TABLE, id, previous,
      Object.assign({}, rows[0], { phones: phones || previous.phones }), PAGE);
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
  provinceOptions: provinceOptions,
  assertPhones: assertPhones,
  detail: detail,
  nearest: nearest,
  create: create,
  update: update,
  remove: remove,
  restore: restore
};
