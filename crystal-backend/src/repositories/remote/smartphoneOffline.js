const axios = require('axios');
const config = require('../../config');

/**
 * THE SMARTPHONE_OFFLINE SYSTEM, asked who uses a phone number.
 *
 * One user there is one mobile number, and it knows little else - at most the
 * number and a province and city. So the only question the CRM asks it is
 * "which user has this number?", and the answer is the user's ID and,
 * when it has one, its PK.
 *
 * THE CONTRACT IS ASSUMED until the system's own specification is in hand,
 * and this file is the only place that knows it:
 *
 *   GET {SMARTPHONE_OFFLINE_BASE_URL}/users?phone=<number as +8613800138000>
 *   Authorization: Bearer <SMARTPHONE_OFFLINE_API_KEY>        (when one is set)
 *   200 -> [{ user_pk?, user_id, phone, province?, city? }]  (or { data: [...] })
 *   404 or an empty list -> nobody has the number
 *
 * Whatever the real API looks like, it is adapted here to findByPhone()'s
 * return shape and nothing else changes.
 *
 * With no base URL and REMOTE_MOCK on (a development machine), the lookup is
 * answered in-process: a number ending in an even digit belongs to one user,
 * an odd one to nobody - enough to exercise linking end to end.
 */

let client = null;
function http() {
  if (!client) {
    const headers = config.smartphoneOffline.apiKey ? { Authorization: 'Bearer ' + config.smartphoneOffline.apiKey } : {};
    client = axios.create({ baseURL: config.smartphoneOffline.baseUrl, timeout: config.smartphoneOffline.timeout, headers: headers });
  }
  return client;
}

function mocked() {
  return !config.smartphoneOffline.baseUrl && config.remote.mock;
}

/** 'live', 'mock', or 'off' (no base URL and no mock): for the screens and /health. */
function mode() {
  if (config.smartphoneOffline.baseUrl) return 'live';
  return mocked() ? 'mock' : 'off';
}

function mockLookup(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (!digits || Number(digits.slice(-1)) % 2) return [];
  return [{ user_pk: digits.slice(-8), user_id: 'so' + digits.slice(-11), phone: phone, province: null, city: null }];
}

/** One user as the CRM keeps it: ID required, PK optional, the rest for display. */
function userOf(row) {
  const id = row && (row.user_id != null ? row.user_id : row.userId != null ? row.userId : row.id);
  if (id == null || String(id).trim() === '') return null;
  const pk = row.user_pk != null ? row.user_pk : row.userPk != null ? row.userPk : row.pk;
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
 * unknown there. Throws when the system cannot be reached, so the caller can
 * tell "nobody" from "could not ask".
 */
async function findByPhone(phone) {
  let rows;
  if (mocked()) rows = mockLookup(phone);
  else if (!config.smartphoneOffline.baseUrl) {
    const error = new Error('SMARTPHONE_OFFLINE_BASE_URL is not set');
    error.code = 'SMARTPHONE_OFFLINE_OFF';
    throw error;
  } else {
    try {
      const response = await http().get('/users', { params: { phone: phone } });
      rows = response.data;
    } catch (error) {
      if (error.response && error.response.status === 404) return [];
      throw error;
    }
  }
  if (rows && !Array.isArray(rows)) rows = Array.isArray(rows.data) ? rows.data : [rows];
  return (rows || []).map(userOf).filter(Boolean);
}

module.exports = { findByPhone, mode };
