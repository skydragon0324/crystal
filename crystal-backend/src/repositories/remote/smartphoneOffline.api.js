const remote = require('../../config/remote');
const config = require('../../config');

/**
 * SMARTPHONE_OFFLINE, over HTTP - the vendor's phone server.
 *
 * The same server vendor_backend/api/phoneApi.js reaches at PHONE_SERVER_URL,
 * and spoken to the same way: form-encoded POSTs (see config/remote.js). One
 * user there is one mobile number; the CRM links those users to customers as
 * SMARTPHONE_OFFLINE accounts, and an account's Account ID is the user's
 * MASTER ID - the key the server is asked by.
 *
 * Four questions are asked of it:
 *
 *   USERS    which user has this phone number?            linking by phone
 *   DEVICES  which devices are registered to these ids?    the Products tab
 *   SERVICES what service have these ids' devices had?    the Service tab
 *   PRIVILEGES the privileges of these ids' devices         the Privileges tab
 *
 * With REMOTE_MOCK on, mock.js answers both in the server's wire format.
 */

const PHONE = 'phone';

/*
 * THE PATHS. DEVICES is the one the server's owners gave, still a placeholder
 * ("/xxxx") until they name it; USERS was never specified and is the CRM's
 * assumption. Each is used in exactly one place below and keyed in mock.js,
 * so naming the real one is a change to this line and that route.
 */
const USERS_PATH = '/getUserByPhone';
const DEVICES_PATH = '/phone_devices';
/* Given as "/xxxx" like the devices path; named apart so the mock can route both. */
const SERVICES_PATH = '/phone_services';
/* Given as "/xxxx" too; named apart so the mock can route it. */
const PRIVILEGES_PATH = '/phone_privileges';

/** 'live', 'mock', or 'off' (no URL and no mock): for the screens and /health. */
function mode() {
  if (config.remote.mock) return 'mock';
  return config.remote.phoneServerUrl ? 'live' : 'off';
}

/**
 * One user as the CRM keeps it: ID required, PK optional, the rest for
 * display. The server's names for them are not settled, so the likely ones
 * are each read - and that guessing stops at this function.
 */
function userOf(row) {
  const id = row && (row.user_id != null ? row.user_id : row.master_id != null ? row.master_id : row.id);
  if (id == null || String(id).trim() === '') return null;
  const pk = row.user_pk != null ? row.user_pk : row.pk;
  return {
    user_id: String(id).trim(),
    user_pk: pk == null || String(pk).trim() === '' ? null : String(pk).trim(),
    phone: row.phone || null,
    province: row.province || null,
    city: row.city || null
  };
}

/**
 * The users holding one phone number: usually one, none when the number is
 * unknown there. Throws when the server cannot be asked, so the caller can
 * tell "nobody" from "could not ask".
 */
async function findByPhone(phone) {
  const data = await remote.post(PHONE, USERS_PATH, { phone: phone });
  const rows = Array.isArray(data && data.items) ? data.items : [];
  return rows.map(userOf).filter(Boolean);
}

/**
 * THE DEVICES REGISTERED TO SOME USERS, by their master ids - all asked in
 * one call, as the server takes them: one comma-separated string.
 *
 *   master_ids=s2342523, sd652342, ej234234
 *   -> { items: [{ master_id, device, color, IMEI, created_at }] }
 *
 * `IMEI` arrives upper-case; it is `imei` from here on. `created_at` is the
 * server's own text ("2025.10.20") and is passed through as it is.
 */
async function devices(masterIds) {
  const ids = Array.from(new Set((masterIds || []).map(function (id) { return String(id || '').trim(); }).filter(Boolean)));
  if (!ids.length) return { items: [] };

  const data = await remote.post(PHONE, DEVICES_PATH, { master_ids: ids.join(', ') });
  const rows = Array.isArray(data && data.items) ? data.items : [];

  return {
    items: rows.map(function (row) {
      return {
        master_id: row.master_id == null ? null : String(row.master_id),
        device: row.device || null,
        color: row.color || null,
        imei: row.IMEI || row.imei || null,
        created_at: row.created_at || null
      };
    })
  };
}

/**
 * THE SERVICE HISTORY OF SOME USERS' DEVICES, by their master ids - one call,
 * the ids as one comma-separated string, like the devices:
 *
 *   master_ids=s2342523, sd652342, ej234234
 *   -> { items: [{ master_id, customer_name, phone_number, address, imei_1,
 *        imei_2, modal_name, agent_name, created_at, updated_at, reason_name,
 *        point, reason_type_name }] }
 *
 * `modal_name` is the server's spelling of the device model and is
 * `model_name` from here on. Times are the server's own text, passed through.
 */
async function services(masterIds) {
  const ids = Array.from(new Set((masterIds || []).map(function (id) { return String(id || '').trim(); }).filter(Boolean)));
  if (!ids.length) return { items: [] };

  const data = await remote.post(PHONE, SERVICES_PATH, { master_ids: ids.join(', ') });
  const rows = Array.isArray(data && data.items) ? data.items : [];

  return {
    items: rows.map(function (row) {
      return {
        master_id: row.master_id == null ? null : String(row.master_id),
        customer_name: row.customer_name || null,
        phone_number: row.phone_number || null,
        address: row.address || null,
        model_name: row.modal_name || row.model_name || null,
        imei_1: row.imei_1 || null,
        imei_2: row.imei_2 || null,
        agent_name: row.agent_name || null,
        created_at: row.created_at || null,
        updated_at: row.updated_at || null,
        reason_name: row.reason_name || null,
        point: row.point == null || row.point === '' ? null : Number(row.point),
        reason_type_name: row.reason_type_name || null
      };
    })
  };
}

/**
 * THE PRIVILEGES OF SOME USERS' DEVICES, by their master ids - one call, the
 * ids as one comma-separated string:
 *
 *   master_ids=s2342523, sd652342, ej234234
 *   -> { items: [{ master_id, modal, imei, phone_number, color, title }] }
 *
 * `modal` is the server's spelling of the device model and is `model` from
 * here on; `title` is the privilege's own one-line summary, passed through.
 */
async function privileges(masterIds) {
  const ids = Array.from(new Set((masterIds || []).map(function (id) { return String(id || '').trim(); }).filter(Boolean)));
  if (!ids.length) return { items: [] };

  const data = await remote.post(PHONE, PRIVILEGES_PATH, { master_ids: ids.join(', ') });
  const rows = Array.isArray(data && data.items) ? data.items : [];

  return {
    items: rows.map(function (row) {
      return {
        master_id: row.master_id == null ? null : String(row.master_id),
        model: row.modal || row.model || null,
        imei: row.imei || row.IMEI || null,
        phone_number: row.phone_number || null,
        color: row.color || null,
        title: row.title || null
      };
    })
  };
}

module.exports = {
  USERS_PATH: USERS_PATH,
  DEVICES_PATH: DEVICES_PATH,
  SERVICES_PATH: SERVICES_PATH,
  PRIVILEGES_PATH: PRIVILEGES_PATH,
  mode: mode,
  findByPhone: findByPhone,
  devices: devices,
  services: services,
  privileges: privileges
};
