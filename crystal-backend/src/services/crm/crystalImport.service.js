const crypto = require('crypto');
const defaultDb = require('../../config/db');
const legacy = require('../../config/legacy');
const vocabulary = require('../../repositories/crm/vocabulary.repository');
const contact = require('./contact');
const ledger = require('./ledger');
const parties = require('./parties.service');
const identity = require('./identity.service');
const transactions = require('./transactions.service');
const analysis = require('./analysis.service');

/**
 * CRYSTAL INTO THE CRM - the CRYSTAL project's adapter.
 *
 * READS Crystal's tables and never writes them. Every row it creates in the
 * CRM carries the Crystal key it came from - crystal_user_id,
 * crystal_agency_id, crystal_repair_ticket_id, a source_record_id - so a
 * second run finds what the first one made and updates it instead of adding
 * it again. It can be run as often as anybody likes; the console's Overview
 * has the button, and seed 09_crm runs it after a reseed.
 *
 * Each step is its own transaction, in dependency order: places before the
 * sites in them, members before their devices, devices before the repairs
 * done on them. A failure stops the run where it is and names the step; what
 * earlier steps wrote is complete and consistent on its own.
 *
 * Other projects - the vendor platform, the eproduct site, the Eshop, the
 * Appstore - get adapters of the same shape, reading their own sources.
 */

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function context(connection) {
  return Promise.all([
    vocabulary.mapOf('crm_project', connection),
    vocabulary.mapOf('crm_product_class', connection),
    vocabulary.mapOf('crm_product_relationship_type', connection),
    vocabulary.mapOf('crm_acquisition_type', connection),
    vocabulary.mapOf('crm_point_type', connection),
    vocabulary.mapOf('crm_service_case_type', connection),
    vocabulary.mapOf('crm_service_priority', connection),
    vocabulary.mapOf('crm_service_center_activity_type', connection),
    connection('crm_currency').pluck('currency_code'),
    connection('crm_currency').where('is_reporting', true).first('currency_code')
  ]).then(function (results) {
    return {
      project: results[0], productClass: results[1], relationship: results[2], acquisition: results[3], pointType: results[4],
      caseType: results[5], priority: results[6], activityType: results[7], currencies: results[8],
      reporting: results[9] ? results[9].currency_code : 'USD'
    };
  });
}

/* ------------------------------------------------------------ 1. places */

/**
 * THE VENDOR'S LOCATION LIST, copied as it is: same columns, same keys
 * (crm_location.location_pk = ora_pid.locations.location_pk). Read through the
 * legacy handle, so it works whether the vendor runs on PostgreSQL or Oracle.
 * A row already here is updated; nothing is deleted - a location a customer
 * points at stays even if the vendor removes it.
 */
async function importLocations(connection) {
  const rows = await legacy.connection()(legacy.pid('locations'))
    .select('location_pk', 'location_name', 'location_code', 'parent_code', 'position');
  let added = 0;
  let updated = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    // eslint-disable-next-line no-await-in-loop
    const result = await connection.raw(`
      INSERT INTO crm_location (location_pk, location_name, location_code, parent_code, position)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (location_pk) DO UPDATE SET
        location_name = EXCLUDED.location_name, location_code = EXCLUDED.location_code,
        parent_code = EXCLUDED.parent_code, position = EXCLUDED.position
      RETURNING (xmax = 0) AS inserted`,
    [row.location_pk, row.location_name, row.location_code, row.parent_code === undefined ? null : row.parent_code, Number(row.position) || 0]);
    if (result.rows[0] && result.rows[0].inserted) added += 1; else updated += 1;
  }
  return { added: added, updated: updated };
}

/**
 * Service centres become sites; what each OFFERS becomes its capabilities.
 *
 * A centre that offers REPAIR in both the smartphone and the eproduct section
 * has one REPAIR capability with no section, rather than two rows the
 * uniqueness rule would refuse: it can repair, and which products it repairs
 * is the section's question, not the site's.
 */
async function importSites(connection, ctx) {
  /* A centre's province is matched to the vendor province of the same name. */
  const agencies = await connection('agencies as agency')
    .joinRaw(`LEFT JOIN LATERAL (
        SELECT place.location_pk FROM crm_location place
         WHERE lower(trim(place.location_name)) = lower(trim(agency.province))
         ORDER BY (place.parent_code IS NULL OR place.parent_code IN ('', '0')) DESC, place.location_pk
         LIMIT 1) loc ON true`)
    .select('agency.*', 'loc.location_pk as location_pk');
  let added = 0;
  let updated = 0;

  for (let index = 0; index < agencies.length; index += 1) {
    const agency = agencies[index];
    const values = {
      service_center_name: agency.name,
      service_center_kind: agency.tier === 0 ? 'COLLECTION_POINT' : 'SERVICE_CENTER',
      location_pk: agency.location_pk || null,
      address_line: agency.address,
      landmark: agency.landmark,
      status: agency.is_deleted ? 'CLOSED' : (agency.status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED'),
      source_project_id: ctx.project.CRYSTAL,
      source_table_code: 'agencies',
      source_service_center_key: String(agency.id)
    };

    // eslint-disable-next-line no-await-in-loop
    const existing = await connection('crm_service_center').where('crystal_agency_id', agency.id).first('service_center_id');
    let siteId;
    if (existing) {
      // eslint-disable-next-line no-await-in-loop
      await connection('crm_service_center').where('service_center_id', existing.service_center_id).update(values);
      siteId = existing.service_center_id;
      updated += 1;
    } else {
      const code = agency.code || ('AG-' + agency.id);
      // eslint-disable-next-line no-await-in-loop
      const clash = await connection('crm_service_center').where('service_center_code', code).first('service_center_id');
      // eslint-disable-next-line no-await-in-loop
      const rows = await connection('crm_service_center').insert(Object.assign(values, {
        service_center_code: clash ? 'AG-' + agency.id : code,
        crystal_agency_id: agency.id
      })).returning('service_center_id');
      siteId = typeof rows[0] === 'object' ? rows[0].service_center_id : rows[0];
      added += 1;
    }

    // eslint-disable-next-line no-await-in-loop
    const offered = await connection('agency_services').where('agency_id', agency.id).select('section', 'service_type');
    const bySection = {};
    offered.forEach(function (offer) { (bySection[offer.service_type] = bySection[offer.service_type] || []).push(offer.section); });

    const codes = Object.keys(bySection);
    for (let codeIndex = 0; codeIndex < codes.length; codeIndex += 1) {
      const sections = bySection[codes[codeIndex]];
      // eslint-disable-next-line no-await-in-loop
      await connection.raw(`
        INSERT INTO crm_service_center_capability (service_center_id, project_id, capability_code, crystal_section)
        SELECT ?, ?, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM crm_service_center_capability
                            WHERE service_center_id = ? AND COALESCE(project_id, 0) = ? AND capability_code = ? AND is_active)`,
      [siteId, ctx.project.CRYSTAL, codes[codeIndex], sections.length === 1 ? sections[0] : null,
        siteId, ctx.project.CRYSTAL, codes[codeIndex]]);
    }

    /* What a centre no longer offers is ended, not deleted. */
    // eslint-disable-next-line no-await-in-loop
    await connection('crm_service_center_capability')
      .where({ service_center_id: siteId, project_id: ctx.project.CRYSTAL, is_active: true })
      .whereNotIn('capability_code', codes.length ? codes : ['-'])
      .update({ is_active: false, valid_to: connection.raw('CURRENT_DATE') });
  }

  return { added: added, updated: updated };
}

/* ------------------------------------------------------------ 2. catalogue */

async function importFaults(connection, ctx) {
  const res = await connection.raw(`
    INSERT INTO crm_fault_category (project_id, fault_code, display_name, crystal_symptom_id)
    SELECT ?, symptom.code, symptom.name, symptom.id FROM symptom_catalog symptom
     WHERE NOT EXISTS (SELECT 1 FROM crm_fault_category fault WHERE fault.crystal_symptom_id = symptom.id)`, [ctx.project.CRYSTAL]);
  await connection.raw(`
    UPDATE crm_fault_category fault SET display_name = symptom.name, fault_code = symptom.code
      FROM symptom_catalog symptom WHERE fault.crystal_symptom_id = symptom.id`);
  return { added: res.rowCount };
}

/** product_categories.type -> the CRM class a product of that kind falls in. */
const KIND_CLASS = { SMARTPHONE: 'SMARTPHONE', TV: 'EPRODUCT', STB: 'STB', COMPUTER: 'PC', CAMERA: 'CAMERA' };
const LICENCE_CLASS = { KARAOKE: 'KARAOKE_LICENCE', MEDIA: 'MEDIA_LICENCE', TV: 'MEDIA_LICENCE', STB: 'MEDIA_LICENCE' };

async function importCatalogue(connection, ctx) {
  const products = await connection('products as product').join('product_categories as category', 'category.id', 'product.category_id')
    .select('product.id', 'product.name', 'product.slug', 'product.model_code', 'product.price', 'product.currency',
      'product.status', 'product.is_deleted', 'category.type');
  let added = 0;

  for (let index = 0; index < products.length; index += 1) {
    const product = products[index];
    const values = {
      product_name: product.name,
      product_type: product.type,
      product_kind: 'DEVICE',
      product_class_id: ctx.productClass[KIND_CLASS[product.type]] || null,
      model_code: product.model_code,
      list_price: Number(product.price) >= 0 ? product.price : null,
      currency_code: ctx.currencies.indexOf(product.currency) !== -1 ? product.currency : null,
      status: product.is_deleted ? 'DISCONTINUED' : (product.status === 'PUBLISHED' ? 'ACTIVE' : 'INACTIVE')
    };
    // eslint-disable-next-line no-await-in-loop
    const existing = await connection('crm_product_catalog').where('crystal_product_id', product.id).first('product_id');
    if (existing) {
      // eslint-disable-next-line no-await-in-loop
      await connection('crm_product_catalog').where('product_id', existing.product_id).update(values);
    } else {
      // eslint-disable-next-line no-await-in-loop
      await connection('crm_product_catalog').insert(Object.assign(values, {
        project_id: ctx.project.CRYSTAL, product_code: product.slug, crystal_product_id: product.id
      }));
      added += 1;
    }
  }

  /* The ones a registration can need that are not catalogue products. */
  const extra = [['UNKNOWN-DEVICE', 'Device not in the catalogue', 'DEVICE', null]];
  Object.keys(LICENCE_CLASS).forEach(function (kind) {
    extra.push(['LICENCE-' + kind, kind + ' licence', 'LICENCE', LICENCE_CLASS[kind]]);
  });
  for (let index = 0; index < extra.length; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    const res = await connection.raw(`
      INSERT INTO crm_product_catalog (project_id, product_code, product_name, product_kind, product_class_id)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT (project_id, product_code) DO NOTHING`,
    [ctx.project.CRYSTAL, extra[index][0], extra[index][1], extra[index][2], ctx.productClass[extra[index][3]] || null]);
    added += res.rowCount;
  }

  return { added: added };
}

/* ------------------------------------------------------------ 3. people */

const MEMBERSHIP_STATUS = { ACTIVE: 'ACTIVE', LOCKED: 'SUSPENDED', DELETED: 'LEFT' };

/**
 * Members become parties, each with a CRYSTAL account and - because
 * users.id IS the platform's user_pk - a PLATFORM account too. Their phone
 * and email become contact points.
 *
 * A member already imported is found by their CRYSTAL account and refreshed.
 * New members pass the shared weighted matcher before a party is created.
 * Uncertain registrations remain staged; dependent records wait for resolution.
 */
async function importMembers(connection, ctx) {
  const users = await connection('users').orderBy('id');
  let added = 0;
  let updated = 0;
  const counts = {};

  for (let index = 0; index < users.length; index += 1) {
    const user = users[index];
    // eslint-disable-next-line no-await-in-loop
    await connection.transaction(async function (trx) {
      /*
       * Through identity resolution, like every project's accounts: a member
       * who first turned up as a walk-in at a service centre, with the same
       * mobile and email, is linked to that customer rather than duplicated.
       */
      const contacts = [
        user.phone ? { contact_type: 'MOBILE', contact_value: user.phone } : null,
        user.email ? { contact_type: 'EMAIL', contact_value: user.email } : null
      ].filter(Boolean);

      const resolved = await identity.resolveAccount(trx, {
        project_id: ctx.project.CRYSTAL,
        external_account_id: user.id,
        external_login: user.login,
        external_account_type: 'MEMBER',
        account_status: user.status,
        crystal_user_id: user.id,
        source_created_at: user.created_at,
        source_updated_at: user.last_login_at || user.updated_at,
        party: { party_type: 'PERSON', display_name: user.nickname, full_name: user.nickname },
        contacts: contacts
      });
      if (!resolved.party_pk) { counts[resolved.outcome] = (counts[resolved.outcome] || 0) + 1; return; }
      const partyId = resolved.party_pk;
      if (resolved.outcome === 'CREATED') added += 1; else updated += 1;
      counts[resolved.outcome] = (counts[resolved.outcome] || 0) + 1;

      /* users.id IS the platform's user_pk, so the platform account is certain. */
      if (ctx.project.PLATFORM) {
        await identity.resolveAccount(trx, {
          project_id: ctx.project.PLATFORM,
          external_account_id: user.id,
          external_login: user.login,
          external_account_type: 'PID',
          crystal_user_id: user.id,
          source_created_at: user.created_at,
          resolved_party_pk: partyId
        });
      }

      await trx.raw(`
        INSERT INTO crm_membership (party_pk, project_id, external_member_id, membership_status, joined_at, synced_at)
        VALUES (?, ?, ?, ?, ?, now())
        ON CONFLICT (party_pk, project_id) DO UPDATE SET membership_status = EXCLUDED.membership_status, synced_at = now()`,
      [partyId, ctx.project.CRYSTAL, String(user.id), MEMBERSHIP_STATUS[user.status] || 'ACTIVE', user.created_at]);
    });
  }

  return { added: added, updated: updated, outcomes: counts };
}

/** user id -> party id, for the steps that follow. */
async function partyByUser(connection, ctx) {
  const rows = await connection('crm_project_account').where('project_id', ctx.project.CRYSTAL).whereNull('unlinked_at')
    .whereNotNull('crystal_user_id').select('crystal_user_id', 'party_pk');
  const out = {};
  rows.forEach(function (row) { out[row.crystal_user_id] = row.party_pk; });
  return out;
}

/* ------------------------------------------------------------ 4. what they own */

async function instanceFor(trx, ctx, productId, external, extra) {
  const found = await trx('crm_product_instance')
    .where({ project_id: ctx.project.CRYSTAL, external_product_instance_id: external }).first();
  if (found) return found;
  const rows = await trx('crm_product_instance').insert(Object.assign({
    product_id: productId, project_id: ctx.project.CRYSTAL, external_product_instance_id: external
  }, extra)).returning('*');
  return rows[0];
}

async function importRegistrations(connection, ctx) {
  const owners = await partyByUser(connection, ctx);
  const catalogue = {};
  (await connection('crm_product_catalog').where('project_id', ctx.project.CRYSTAL).select('product_id', 'product_code', 'crystal_product_id'))
    .forEach(function (row) {
      if (row.crystal_product_id) catalogue['p' + row.crystal_product_id] = row.product_id;
      catalogue[row.product_code] = row.product_id;
    });

  let added = 0;
  const regs = await connection('registered_products').orderBy('id');

  for (let index = 0; index < regs.length; index += 1) {
    const registration = regs[index];
    const partyId = owners[registration.user_id];
    if (!partyId) continue;

    // eslint-disable-next-line no-await-in-loop
    await connection.transaction(async function (trx) {
      const source = 'registered_products:' + registration.id;
      const seen = await trx('crm_product_registration').where({ project_id: ctx.project.CRYSTAL, source_record_id: source }).first();
      if (seen) return;

      const productId = catalogue['p' + registration.product_id] || catalogue['UNKNOWN-DEVICE'];
      const instance = await instanceFor(trx, ctx, productId, registration.serial_number, {
        instance_kind: 'DEVICE', serial_number: registration.serial_number
      });

      const current = await trx('crm_product_registration')
        .where({ product_instance_id: instance.product_instance_id, relationship_code: 'OWNER' }).whereNull('valid_to').first();
      if (current) return;

      await trx('crm_product_registration').insert({
        party_pk: partyId,
        product_instance_id: instance.product_instance_id,
        relationship_type_id: ctx.relationship.OWNER,
        relationship_code: 'OWNER',
        project_id: ctx.project.CRYSTAL,
        registration_channel: 'WEB',
        acquisition_type_id: ctx.acquisition.PURCHASED || null,
        purchase_date: registration.purchase_date,
        registration_status: 'ACTIVE',
        registered_at: registration.register_time,
        valid_from: registration.register_time,
        source_record_id: source,
        crystal_registered_product_id: registration.id
      });
      added += 1;
    });
  }

  /* Licences: an instance of their own, bound to the device they unlock. */
  const licences = await connection('licenses').orderBy('id');
  for (let index = 0; index < licences.length; index += 1) {
    const licence = licences[index];
    const partyId = owners[licence.user_id];
    if (!partyId) continue;

    // eslint-disable-next-line no-await-in-loop
    await connection.transaction(async function (trx) {
      const source = 'licenses:' + licence.id;
      const seen = await trx('crm_product_registration').where({ project_id: ctx.project.CRYSTAL, source_record_id: source }).first();
      if (seen) return;

      const device = await trx('crm_product_instance')
        .where({ project_id: ctx.project.CRYSTAL, external_product_instance_id: licence.device_sn }).first('product_instance_id');
      const instance = await instanceFor(trx, ctx, catalogue['LICENCE-' + licence.device_type], 'LIC-' + licence.id, {
        instance_kind: 'LICENCE',
        license_key_hash: sha256(licence.license_key),
        bound_instance_id: device ? device.product_instance_id : null,
        valid_until: licence.valid_until,
        activated_at: licence.created_at,
        status: licence.status === 'ACTIVE' ? 'ACTIVE' : (licence.status === 'EXPIRED' ? 'EXPIRED' : 'VOID')
      });

      const active = licence.status === 'ACTIVE';
      const ended = licence.valid_until && new Date(licence.valid_until) > new Date(licence.created_at) ? licence.valid_until : licence.created_at;
      await trx('crm_product_registration').insert({
        party_pk: partyId,
        product_instance_id: instance.product_instance_id,
        relationship_type_id: ctx.relationship.LICENSEE,
        relationship_code: 'LICENSEE',
        project_id: ctx.project.CRYSTAL,
        registration_channel: 'WEB',
        acquisition_type_id: ctx.acquisition.PURCHASED || null,
        registration_status: active ? 'ACTIVE' : 'ENDED',
        end_reason_code: active ? null : (licence.status === 'EXPIRED' ? 'EXPIRED' : 'CANCELLED'),
        registered_at: licence.created_at,
        valid_from: licence.created_at,
        valid_to: active ? null : ended,
        source_record_id: source
      });
      added += 1;
    });
  }

  return { added: added };
}

/* ------------------------------------------------------------ 5. points */

/**
 * point_logs into the CRYSTAL currency, one event per log row, in order.
 *
 * Crystal's own ledger already decided every movement, so this mirrors it
 * exactly - including a balance Crystal let go below zero, if it ever did.
 * A wallet whose cached balance was set without logs behind it (seed data
 * does this) gets one OPENING adjustment for the difference, once.
 */
async function importPoints(connection, ctx) {
  const owners = await partyByUser(connection, ctx);
  const typeId = ctx.pointType.CRYSTAL;
  if (!typeId) return { added: 0 };

  const logs = await connection('point_logs as point_log')
    .whereNotExists(function () {
      this.select(connection.raw(1)).from('crm_point_event as point_event')
        .where('point_event.project_id', ctx.project.CRYSTAL).where('point_event.source_table_code', 'point_logs')
        .whereRaw('point_event.external_event_id = point_log.id::text');
    })
    .orderBy([{ column: 'point_log.user_id' }, { column: 'point_log.created_at' }, { column: 'point_log.id' }]);

  let added = 0;
  await connection.transaction(async function (trx) {
    for (let index = 0; index < logs.length; index += 1) {
      const pointLog = logs[index];
      const partyId = owners[pointLog.user_id];
      if (!partyId || Number(pointLog.amount) === 0) continue;

      const code = pointLog.type === 'ADJUST' ? 'ADJUST' : (Number(pointLog.amount) > 0 ? 'EARN' : 'REDEEM');
      // eslint-disable-next-line no-await-in-loop
      await ledger.post(trx, {
        party_pk: partyId, point_type_id: typeId, event_code: code, points_delta: Number(pointLog.amount),
        project_id: ctx.project.CRYSTAL, description: pointLog.description || pointLog.type,
        source_table_code: 'point_logs', external_event_id: String(pointLog.id), occurred_at: pointLog.created_at,
        allow_negative: true, allow_inactive: true
      });
      added += 1;
    }

    const wallets = await trx('wallets').select('user_id', 'point_balance');
    for (let index = 0; index < wallets.length; index += 1) {
      const wallet = wallets[index];
      const partyId = owners[wallet.user_id];
      if (!partyId) continue;
      // eslint-disable-next-line no-await-in-loop
      const opened = await trx('crm_point_event').where({
        project_id: ctx.project.CRYSTAL, source_table_code: 'wallets', external_event_id: String(wallet.user_id)
      }).first('point_event_id');
      if (opened) continue;
      // eslint-disable-next-line no-await-in-loop
      const account = await trx('crm_point_account').where({ party_pk: partyId, point_type_id: typeId }).first('balance');
      const gap = Math.round((Number(wallet.point_balance) - Number(account ? account.balance : 0)) * 1000) / 1000;
      if (!gap) continue;
      // eslint-disable-next-line no-await-in-loop
      await ledger.post(trx, {
        party_pk: partyId, point_type_id: typeId, event_code: 'ADJUST', points_delta: gap,
        project_id: ctx.project.CRYSTAL, description: 'Opening balance from the Crystal wallet',
        source_table_code: 'wallets', external_event_id: String(wallet.user_id),
        allow_negative: true, allow_inactive: true
      });
      added += 1;
    }
  });

  return { added: added };
}

/* ------------------------------------------------------------ 6. service */

const CHANNEL = { 0: 'WALK_IN', 1: 'MAIL_IN', 2: 'ON_SITE', 3: 'COURIER' };
const PRIORITY = { 0: 'LOW', 1: 'NORMAL', 2: 'HIGH' };

/**
 * Repair tickets become service cases, and their intake and hand-back become
 * site activity.
 *
 * The customer is the member's party when the ticket has one. A walk-in with
 * no account is found by the phone number on the ticket, and becomes a party
 * of their own the first time they are seen - which is the gap the design
 * called out: until now, nothing connected a walk-in's second visit to their
 * first.
 */
async function importCases(connection, ctx) {
  const owners = await partyByUser(connection, ctx);
  const statusMap = {};
  (await connection('crm_service_status_map').where('project_id', ctx.project.CRYSTAL))
    .forEach(function (row) { statusMap[row.source_status_code] = row.service_status_id; });
  const sites = {};
  (await connection('crm_service_center').whereNotNull('crystal_agency_id').select('crystal_agency_id', 'service_center_id'))
    .forEach(function (row) { sites[row.crystal_agency_id] = row.service_center_id; });
  const faults = {};
  (await connection('crm_fault_category').whereNotNull('crystal_symptom_id').select('crystal_symptom_id', 'fault_category_id'))
    .forEach(function (row) { faults[row.crystal_symptom_id] = row.fault_category_id; });

  const tickets = await connection('repair_tickets').where('is_deleted', false).orderBy('id');
  let added = 0;
  let updated = 0;
  const caseByTicket = {};

  for (let index = 0; index < tickets.length; index += 1) {
    const ticket = tickets[index];

    // eslint-disable-next-line no-await-in-loop
    await connection.transaction(async function (trx) {
      let partyId = ticket.user_id ? owners[ticket.user_id] : null;

      if (!partyId) {
          const party = await require('./registrationIntake.service').submit(trx, {
            party_type: 'PERSON', display_name: ticket.customer_name, full_name: ticket.customer_name,
            origin_project_id: ctx.project.CRYSTAL, first_seen_at: ticket.received_at,
            contacts: [
              ticket.customer_phone ? { contact_type: 'MOBILE', contact_value: ticket.customer_phone, source_project_id: ctx.project.CRYSTAL } : null,
              ticket.customer_email ? { contact_type: 'EMAIL', contact_value: ticket.customer_email, source_project_id: ctx.project.CRYSTAL } : null
            ].filter(Boolean)
          }, { source_record_id: 'repair:' + ticket.id });
          partyId = party.party_pk;
      }
      if (!partyId) return;

      const instance = await trx('crm_product_instance')
        .where({ project_id: ctx.project.CRYSTAL, external_product_instance_id: ticket.serial_number }).first('product_instance_id');

      const total = Number(ticket.total_amount || 0) + Number(ticket.covered_amount || 0);
      const values = {
        party_pk: partyId,
        project_id: ctx.project.CRYSTAL,
        external_case_id: ticket.ticket_no,
        service_center_id: sites[ticket.agency_id] || null,
        case_type_id: ticket.is_warranty ? ctx.caseType.WARRANTY_REPAIR : ctx.caseType.REPAIR,
        service_status_id: statusMap[String(ticket.status)],
        service_priority_id: ctx.priority[PRIORITY[ticket.priority]] || null,
        reception_channel_code: CHANNEL[ticket.intake_channel] || null,
        related_product_instance_id: instance ? instance.product_instance_id : null,
        is_warranty: ticket.is_warranty,
        title: ticket.ticket_no,
        description: ticket.fault_description,
        received_at: ticket.received_at,
        first_response_at: ticket.diagnosed_at,
        due_at: ticket.promised_at,
        completed_at: ticket.repaired_at,
        closed_at: [7, 9].indexOf(Number(ticket.status)) !== -1 ? (ticket.closed_at || ticket.updated_at) : null,
        total_cost: total,
        customer_paid_amount: ticket.total_amount,
        currency_code: ctx.currencies.indexOf(ticket.currency) !== -1 ? ticket.currency : null,
        satisfaction_rating: ticket.rating || null,
        source_created_at: ticket.created_at,
        source_updated_at: ticket.updated_at,
        ingested_at: trx.fn.now()
      };
      if (!values.service_status_id) return;

      const existing = await trx('crm_service_case').where('crystal_repair_ticket_id', ticket.id).first('case_id');
      let caseId;
      if (existing) {
        await trx('crm_service_case').where('case_id', existing.case_id).update(values);
        caseId = existing.case_id;
        updated += 1;
      } else {
        const rows = await trx('crm_service_case').insert(Object.assign(values, { crystal_repair_ticket_id: ticket.id })).returning('case_id');
        caseId = typeof rows[0] === 'object' ? rows[0].case_id : rows[0];
        added += 1;
      }
      caseByTicket[ticket.id] = caseId;

      /* A classification the CRM has not been given yet starts from what the bench found. */
      await trx.raw(`
        INSERT INTO crm_service_case_classification (case_id, fault_category_id, resolution_text)
        SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM crm_service_case_classification WHERE case_id = ?)`,
      [caseId, faults[ticket.symptom_id] || null, ticket.resolution || null, caseId]);

      const site = sites[ticket.agency_id];
      if (site) {
        const rows = [[ctx.activityType.REPAIR_INTAKE, ticket.received_at, 'intake']];
        if (Number(ticket.status) === 7 && ticket.closed_at) rows.push([ctx.activityType.REPAIR_DELIVERY, ticket.closed_at, 'delivery']);
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
          if (!rows[rowIndex][0]) continue;
          // eslint-disable-next-line no-await-in-loop
          await trx.raw(`
            INSERT INTO crm_service_center_activity
              (service_center_id, activity_type_id, project_id, occurred_at, party_pk,
               related_service_case_id, related_product_instance_id, external_activity_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (project_id, activity_type_id, external_activity_id) WHERE external_activity_id IS NOT NULL DO NOTHING`,
          [site, rows[rowIndex][0], ctx.project.CRYSTAL, rows[rowIndex][1], partyId, caseId,
            instance ? instance.product_instance_id : null, 'repair_tickets:' + ticket.id + ':' + rows[rowIndex][2]]);
        }
      }
    });
  }

  /* A repeat visit points at the case it came back from. */
  const reopened = tickets.filter(function (ticket) { return ticket.reopened_from && caseByTicket[ticket.reopened_from] && caseByTicket[ticket.id]; });
  for (let index = 0; index < reopened.length; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await connection('crm_service_case').where('case_id', caseByTicket[reopened[index].id])
      .update({ reopened_from_case_id: caseByTicket[reopened[index].reopened_from] });
  }

  return { added: added, updated: updated };
}

/* ------------------------------------------------------------ 7. transactions */

/**
 * WHAT CRYSTAL CUSTOMERS PAID, as CRYSTAL transactions.
 *
 *   a paid repair ticket       SERVICE_PAYMENT, linked to its service case and centre
 *   a wallet PURCHASE          SALE (the Crystal store)
 *   a wallet REFUND            REFUND, pointing at the purchase it reverses
 *   a licence bought in points LICENCE_PURCHASE, amount 0, points_used set
 *
 * Wallet REPAIR movements are NOT imported: they are the same money as the
 * repair ticket's payment, and counting both would double a customer's
 * service spend.
 *
 * A wallet refund names no purchase. It is matched to the latest earlier
 * purchase by the same member large enough to cover it; one with no such
 * purchase cannot be a REFUND row (a refund must point at an original) and is
 * counted as unmatched instead of being guessed at.
 */
async function importTransactions(connection, ctx) {
  const owners = await partyByUser(connection, ctx);
  const sites = {};
  (await connection('crm_service_center').whereNotNull('crystal_agency_id').select('crystal_agency_id', 'service_center_id'))
    .forEach(function (row) { sites[row.crystal_agency_id] = row.service_center_id; });
  const reporting = ctx.reporting;
  const cur = function (code) { return ctx.currencies.indexOf(code) !== -1 ? code : reporting; };

  const result = { added: 0, updated: 0, unmatched_refunds: 0 };
  const count = function (outcome) { if (outcome.created) result.added += 1; else result.updated += 1; };

  await connection.transaction(async function (trx) {
    /* repairs */
    const paid = await trx('repair_tickets as ticket')
      .join('crm_service_case as service_case', 'service_case.crystal_repair_ticket_id', 'ticket.id')
      .where('ticket.pay_state', 2).where('ticket.total_amount', '>', 0).where('ticket.is_deleted', false)
      .select('ticket.id', 'ticket.ticket_no', 'ticket.total_amount', 'ticket.currency', 'ticket.agency_id', 'ticket.closed_at', 'ticket.updated_at',
        'ticket.received_at', 'service_case.case_id', 'service_case.party_pk', 'service_case.related_product_instance_id');
    for (let index = 0; index < paid.length; index += 1) {
      const ticket = paid[index];
      // eslint-disable-next-line no-await-in-loop
      const outcome = await transactions.upsert(trx, {
        project_id: ctx.project.CRYSTAL,
        external_transaction_id: 'repair:' + ticket.ticket_no,
        transaction_type_code: 'SERVICE_PAYMENT',
        transaction_status: 'PAID',
        currency_code: cur(ticket.currency),
        net_amount: Number(ticket.total_amount),
        sales_channel_code: 'SERVICE_CENTRE',
        service_center_id: sites[ticket.agency_id] || null,
        transaction_at: ticket.closed_at || ticket.updated_at || ticket.received_at,
        parties: [{ party_pk: ticket.party_pk, party_role_code: 'BUYER' }, { party_pk: ticket.party_pk, party_role_code: 'PAYER' }],
        items: [{
          external_item_id: ticket.ticket_no, product_instance_id: ticket.related_product_instance_id,
          quantity: 1, net_amount: Number(ticket.total_amount)
        }]
      }, reporting);
      count(outcome);
      // eslint-disable-next-line no-await-in-loop
      await trx('crm_service_case').where('case_id', ticket.case_id).update({ related_transaction_id: outcome.transaction_id });
    }

    /* the wallet: purchases first, so refunds can find them */
    const moves = await trx('wallet_transactions').whereIn('type', ['PURCHASE', 'REFUND']).where('status', 'SUCCESS')
      .orderBy([{ column: 'created_at' }, { column: 'id' }]);
    const bought = {};
    for (let index = 0; index < moves.length; index += 1) {
      const move = moves[index];
      const partyId = owners[move.user_id];
      if (!partyId) continue;
      const amount = Math.abs(Number(move.amount));

      if (move.type === 'PURCHASE') {
        // eslint-disable-next-line no-await-in-loop
        const outcome = await transactions.upsert(trx, {
          project_id: ctx.project.CRYSTAL,
          external_transaction_id: 'wallet:' + move.id,
          transaction_type_code: 'SALE',
          transaction_status: 'COMPLETED',
          currency_code: cur(move.currency),
          net_amount: amount,
          sales_channel_code: 'WALLET',
          transaction_at: move.created_at,
          parties: [{ party_pk: partyId, party_role_code: 'BUYER' }],
          items: [{ external_item_id: move.reference, quantity: 1, net_amount: amount }]
        }, reporting);
        count(outcome);
        (bought[move.user_id] = bought[move.user_id] || []).push({ id: outcome.transaction_id, left: amount });
        continue;
      }

      const original = (bought[move.user_id] || []).slice().reverse().filter(function (purchase) { return purchase.left >= amount; })[0];
      if (!original) { result.unmatched_refunds += 1; continue; }
      original.left -= amount;
      // eslint-disable-next-line no-await-in-loop
      count(await transactions.upsert(trx, {
        project_id: ctx.project.CRYSTAL,
        external_transaction_id: 'wallet:' + move.id,
        original_transaction_id: original.id,
        transaction_type_code: 'REFUND',
        transaction_status: 'REFUNDED',
        currency_code: cur(move.currency),
        net_amount: -amount,
        sales_channel_code: 'WALLET',
        transaction_at: move.created_at,
        parties: [{ party_pk: partyId, party_role_code: 'BUYER' }]
      }, reporting));
    }

    /* licences bought with points */
    const licences = await trx('licenses as licence_row')
      .leftJoin('crm_product_instance as instance', function () {
        this.on('instance.external_product_instance_id', trx.raw("'LIC-' || licence_row.id"))
          .andOn('instance.project_id', trx.raw('?', [ctx.project.CRYSTAL]));
      })
      .where('licence_row.points_used', '>', 0).select('licence_row.*', 'instance.product_instance_id', 'instance.product_id');
    for (let index = 0; index < licences.length; index += 1) {
      const licence = licences[index];
      const partyId = owners[licence.user_id];
      if (!partyId) continue;
      // eslint-disable-next-line no-await-in-loop
      count(await transactions.upsert(trx, {
        project_id: ctx.project.CRYSTAL,
        external_transaction_id: 'licence:' + licence.id,
        transaction_type_code: 'LICENCE_PURCHASE',
        transaction_status: 'COMPLETED',
        currency_code: reporting,
        net_amount: 0,
        points_used: licence.points_used,
        sales_channel_code: 'WEB',
        transaction_at: licence.created_at,
        parties: [{ party_pk: partyId, party_role_code: 'BUYER' }],
        items: [{
          product_id: licence.product_id, product_instance_id: licence.product_instance_id,
          external_item_id: 'LIC-' + licence.id, quantity: 1, net_amount: 0
        }]
      }, reporting));
    }
  });

  return result;
}

/* ------------------------------------------------------------ the run */

const STEPS = [
  ['locations', importLocations],
  ['sites', importSites],
  ['faults', importFaults],
  ['catalogue', importCatalogue],
  ['members', importMembers],
  ['registrations', importRegistrations],
  ['points', importPoints],
  ['cases', importCases],
  ['transactions', importTransactions]
];

/**
 * Everything, in order. `options.db` is the handle to run on - the seed passes
 * its own, so a run against a throwaway schema imports into that schema.
 */
async function run(options) {
  const connection = (options && options.db) || defaultDb;
  const ctx = await context(connection);
  if (!ctx.project.CRYSTAL) throw new Error('the CRYSTAL project is missing from crm_project');

  const summary = {};
  for (let index = 0; index < STEPS.length; index += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      summary[STEPS[index][0]] = await STEPS[index][1](connection, ctx);
    } catch (err) {
      err.message = 'Crystal import, step "' + STEPS[index][0] + '": ' + err.message;
      throw err;
    }
  }

  summary.class_stats = await analysis.recalculateClassStats({ db: connection });
  return summary;
}

module.exports = { run: run, STEPS: STEPS.map(function (step) { return step[0]; }) };
