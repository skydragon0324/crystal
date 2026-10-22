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
 * Five questions are asked of it:
 *
 *   USERS    which user has this phone number?            linking by phone
 *   DEVICES  which devices are registered to these ids?    the Products tab
 *   SERVICES what service have these ids' devices had?    the Service tab
 *   PRIVILEGES the privileges of these ids' devices         the Privileges tab
 *   LEVELS   these ids' level, grade and points            Sync on the Accounts tab
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
const DEVICES_PATH = '/getPhonesInfo';
/* Given as "/xxxx" like the devices path; named apart so the mock can route both. */
const SERVICES_PATH = '/getAfterInfo';
/* Given as "/xxxx" too; named apart so the mock can route it. */
const PRIVILEGES_PATH = '/getEventInfo';
const LEVELS_PATH = '/getLevelInfo';

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
 *   -> { items: [{ master_id, name, gender, phone_number, device, color, rgb, IMEI, created_at }] }
 *
 * `name` is the customer the device is registered to; it is `customer_name`
 * from here on, and `gender` ("1" male) is the CRM's M / F.
 * `IMEI` arrives upper-case; it is `imei` from here on. `created_at` is the
 * server's own text ("2025.10.20") and is passed through as it is. `rgb` is
 * the colour itself, as "#1a2b3c" (see rgbOf); null when it cannot be read.
 */
/**
 * A device colour as "#rrggbb". The server sends it as "#1a2b3c"; the same
 * without its "#" or in the three-digit short form ("#abc") is read too.
 * Anything else is null, so a page never paints with a value it cannot trust.
 */
function rgbOf(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().toLowerCase();
  let match = /^#?([0-9a-f]{6})$/.exec(text);
  if (match) return '#' + match[1];
  match = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(text);
  if (match) return '#' + match[1] + match[1] + match[2] + match[2] + match[3] + match[3];
  return null;
}

async function devices(masterIds) {
  const ids = Array.from(new Set((masterIds || []).map(function (id) { return String(id || '').trim(); }).filter(Boolean)));
  if (!ids.length) return { items: [] };

  const data = await remote.post(PHONE, DEVICES_PATH, { master_ids: ids.join(', ') });
  const rows = Array.isArray(data && data.items) ? data.items : [];

  return {
    items: rows.map(function (row) {
      return {
        master_id: row.master_id == null ? null : String(row.master_id),
        customer_name: row.name || null,
        /* "1" is male, anything else sent is female; nothing sent is unknown. As the CRM's gender codes. */
        gender: row.gender == null || row.gender === '' ? null : String(row.gender) === '1' ? 'M' : 'F',
        phone_number: row.phone_number || null,
        device: row.device || null,
        color: row.color || null,
        rgb: rgbOf(row.rgb),
        imei: row.imei || row.imei_1 || null,
        created_at: row.created_at || null
      };
    })
  };
}

/**
 * THE SERVICE HISTORY OF SOME USERS' DEVICES, by their master ids - one call,
 * the ids as one comma-separated string, like the devices. One item per
 * master id, its history in three lists, each kind in a shape of its own:
 *
 *   master_ids=s2342523, sd652342, ej234234
 *   -> { items: [{ master_id, repair_histories, os_histories, replace_histories }] }
 *
 *   repair   { agent_name, details: { desc, name, phone, imei_1, imei_2, free,
 *              total, qty }, items: [{ qty, model_name, item_name, price,
 *              service_price }], type, status, step, imei, point, qty,
 *              created_at, updated_at }
 *   os       { customer_name, phone_number, address, imei_1, imei_2, id_card_no,
 *              modal_name, agent_name, created_at, updated_at, reason_name,
 *              point, reason_type_name }
 *   replace  { agent_name, model_name, description, name, phone_number, address,
 *              imei_old, imei_new, reason, status, created_at, updated_at }
 *
 * The lists are flattened into one, each record tagged with its `kind` -
 * REPAIR, OS or REPLACE (SERVICE_KINDS) - and read into one set of names
 * (see the readers below), so the Service tab can split them and the summary
 * count them all alike. A record without a master id takes its item's.
 * Times are the server's own text, passed through.
 */
const SERVICE_KINDS = { REPAIR: 'repair_histories', OS: 'os_histories', REPLACE: 'replace_histories' };

function text(value) { return value === null || value === undefined || String(value).trim() === '' ? null : String(value).trim(); }
function amount(value) { return value === null || value === undefined || value === '' || isNaN(Number(value)) ? null : Number(value); }

/*
 * What every kind is read into: who and when, plus `title` (what was done)
 * and `reason` (why), which the summary and the timeline use. The rest is
 * the kind's own and only its sub-tab shows it.
 */
function common(kind, masterId, row) {
  return {
    kind: kind,
    master_id: text(row.master_id) || text(masterId),
    agent_name: text(row.agent_name),
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
    point: amount(row.point)
  };
}

const READERS = {
  /* A repair: who brought it (details), the parts and labour (items), the job's own state. */
  REPAIR: function (masterId, row) {
    const details = row.details || {};
    const items = (Array.isArray(row.items) ? row.items : []).map(function (item) {
      return { qty: amount(item.qty), model_name: text(item.model_name), item_name: text(item.item_name), price: amount(item.price), service_price: amount(item.service_price) };
    });
    return Object.assign(common('REPAIR', masterId, row), {
      customer_name: text(details.name),
      phone_number: text(details.phone),
      imei_1: text(details.imei_1),
      imei_2: text(details.imei_2),
      description: text(details.desc),
      free: details.free === undefined || details.free === null ? null : Boolean(details.free),
      total: amount(details.total),
      qty: amount(details.qty !== undefined ? details.qty : row.qty),
      items: items,
      /* The sum of the items' service prices - the Details cell's figure. */
      service_total: Math.round(items.reduce(function (sum, item) { return sum + (item.service_price || 0); }, 0) * 100) / 100,
      model_name: items.map(function (item) { return item.model_name; }).filter(Boolean)[0] || null,
      imei: text(row.imei),
      type: text(row.type),
      status: text(row.status),
      step: text(row.step),
      title: text(details.desc),
      reason: text(details.desc)
    });
  },
  /* An OS service; `modal_name` is the server's spelling of the model. */
  OS: function (masterId, row) {
    return Object.assign(common('OS', masterId, row), {
      customer_name: text(row.customer_name),
      phone_number: text(row.phone_number),
      address: text(row.address),
      id_card_no: text(row.id_card_no),
      imei_1: text(row.imei_1),
      imei_2: text(row.imei_2),
      model_name: text(row.modal_name || row.model_name),
      reason_name: text(row.reason_name),
      reason_type_name: text(row.reason_type_name),
      title: text(row.reason_name),
      reason: text(row.reason_type_name)
    });
  },
  /* A replacement: the old device's IMEI and the new one's. */
  REPLACE: function (masterId, row) {
    return Object.assign(common('REPLACE', masterId, row), {
      customer_name: text(row.name),
      phone_number: text(row.phone_number),
      address: text(row.address),
      id_card_no: text(row.id_card_no),
      model_name: text(row.model_name),
      description: text(row.description),
      imei_old: text(row.imei_old),
      imei_new: text(row.imei_new),
      imei_1: text(row.imei_old),
      status: text(row.status),
      title: text(row.description) || text(row.reason),
      reason: text(row.reason)
    });
  }
};

async function services(masterIds) {
  const ids = Array.from(new Set((masterIds || []).map(function (id) { return String(id || '').trim(); }).filter(Boolean)));
  if (!ids.length) return { items: [] };

  const data = await remote.post(PHONE, SERVICES_PATH, { master_ids: ids.join(', ') });
  const groups = Array.isArray(data && data.items) ? data.items : [];
  const items = [];
  groups.forEach(function (group) {
    Object.keys(SERVICE_KINDS).forEach(function (kind) {
      const list = group && Array.isArray(group[SERVICE_KINDS[kind]]) ? group[SERVICE_KINDS[kind]] : [];
      list.forEach(function (row) { if (row) items.push(READERS[kind](group.master_id, row)); });
    });
  });
  return { items: items };
}

/**
 * THE PRIVILEGES OF SOME USERS' DEVICES, by their master ids - one call, the
 * ids as one comma-separated string:
 *
 *   master_ids=s2342523, sd652342, ej234234
 *   -> { items: [{ master_id, modal, imei, phone_number, color, title, status }] }
 *
 * `modal` is the server's spelling of the device model and is `model` from
 * here on; `title` is the privilege's own one-line summary, passed through.
 * `status` arrives as a number - 1 accepted, 0 not accepted - and is
 * ACCEPTED / NOT_ACCEPTED from here on; a number outside those is passed through.
 */
const PRIVILEGE_STATUS = { 1: 'ACCEPTED', 0: 'NOT_ACCEPTED' };

function privilegeStatus(value) {
  const code = text(value);
  if (code === null) return null;
  return /^\d+$/.test(code) && PRIVILEGE_STATUS[Number(code)] ? PRIVILEGE_STATUS[Number(code)] : code;
}

async function privileges(masterIds) {
  const ids = Array.from(new Set((masterIds || []).map(function (id) { return String(id || '').trim(); }).filter(Boolean)));
  if (!ids.length) return { items: [] };

  const data = await remote.post(PHONE, PRIVILEGES_PATH, { master_ids: ids.join(', ') });
  const rows = Array.isArray(data && data.items) ? data.items : [];

  return {
    items: rows.map(function (row) {
      return {
        master_id: row.master_id == null ? null : String(row.master_id),
        customer_name: row.name || null,
        model: row.modal || row.model || null,
        imei: row.imei || row.IMEI || null,
        phone_number: row.phone_number || null,
        color: row.color || null,
        title: row.title || null,
        status: privilegeStatus(row.status)
      };
    })
  };
}

/**
 * THE LEVEL, GRADE AND POINTS OF SOME USERS, by their master ids - one call,
 * the ids as one comma-separated string:
 *
 *   master_ids=s2342523, sd652342, ej234234
 *   -> { items: [{ master_id, loyal_level, purchase_level, reward_point }] }
 *
 * `loyal_level` is the CRM's LEVEL and `purchase_level` its GRADE; both are
 * passed on as text, the form a tier's "Code in the project" is matched in.
 * `reward_point` is the points the user holds there. Each is null when not sent.
 */
async function levels(masterIds) {
  const ids = Array.from(new Set((masterIds || []).map(function (id) { return String(id || '').trim(); }).filter(Boolean)));
  if (!ids.length) return { items: [] };

  const data = await remote.post(PHONE, LEVELS_PATH, { master_ids: ids.join(', ') });
  const rows = Array.isArray(data && data.items) ? data.items : [];

  return {
    items: rows.map(function (row) {
      return {
        master_id: text(row.master_id),
        loyal_level: text(row.loyal_level),
        purchase_level: text(row.purchase_level),
        reward_point: amount(row.reward_point)
      };
    }).filter(function (row) { return row.master_id; })
  };
}

module.exports = {
  USERS_PATH: USERS_PATH,
  DEVICES_PATH: DEVICES_PATH,
  SERVICES_PATH: SERVICES_PATH,
  PRIVILEGES_PATH: PRIVILEGES_PATH,
  LEVELS_PATH: LEVELS_PATH,
  SERVICE_KINDS: SERVICE_KINDS,
  mode: mode,
  findByPhone: findByPhone,
  devices: devices,
  services: services,
  privileges: privileges,
  levels: levels
};
