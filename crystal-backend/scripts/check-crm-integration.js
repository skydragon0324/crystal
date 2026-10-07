/**
 * End to end checks for the department API (/api/integration/crm) and for
 * editing projects, against a running API.
 *
 *   PG_SCHEMA=<schema the API uses> node scripts/check-crm-integration.js [http://localhost:5400]
 *
 * It issues (and revokes) API keys directly in the database the API runs on,
 * so PG_SCHEMA must name the same schema. It WRITES customers, accounts, keys
 * and a project, each coded with this run's id. Run it against a development
 * or staging database, never production.
 */
const axios = require('axios');
const db = require('../src/config/db');
const apiKeys = require('../src/services/crm/projectApiKeys.service');

const base = (process.argv[2] || 'http://localhost:5400').replace(/\/$/, '');
const RUN = 'INT' + Date.now().toString(36).toUpperCase();
const DIGITS = String(Date.now()).slice(-8);

let passed = 0;
let failed = 0;

async function check(name, test) {
  try {
    const result = await test();
    if (result === true) { passed += 1; console.log('  ok   ' + name); return; }
    failed += 1;
    console.log('  FAIL ' + name + (typeof result === 'string' ? ' - ' + result : ''));
  } catch (err) {
    failed += 1;
    const message = err.response && err.response.data ? err.response.status + ' ' + err.response.data.message : err.message;
    console.log('  FAIL ' + name + ' - ' + message);
  }
}

function department(key) {
  const headers = key ? { Authorization: 'Bearer ' + key } : {};
  return axios.create({ baseURL: base + '/api/integration/crm', timeout: 30000, headers: headers });
}

async function status(promise) {
  try { await promise; return 200; } catch (err) { return err.response ? err.response.status : err.message; }
}

function data(response) { return response.data.data; }

async function main() {
  console.log('checking the department API and projects at ' + base + '  (run ' + RUN + ')\n');
  const session = data(await axios.post(base + '/api/admin/auth/login', { username: 'admin', password: 'crystal1234' }));
  const admin = axios.create({ baseURL: base + '/api/admin', timeout: 30000, headers: { Authorization: 'Bearer ' + session.token } });

  const appstoreKey = await apiKeys.issue('APPSTORE', RUN + ' appstore');
  const eshopKey = await apiKeys.issue('ESHOP', RUN + ' eshop');
  const appstore = department(appstoreKey.key);
  const eshop = department(eshopKey.key);

  const person = { full_name: RUN + ' Grace', mobile: '+86 135 ' + DIGITS, birth_date: '1971-03-04', gender_code: 'F', address_line: '5 ' + RUN + ' Street' };
  let created;

  console.log('keys');
  await check('a request without a key is refused', async function () {
    return (await status(department(null).get('/identity-resolutions'))) === 401 ? true : 'not 401';
  });
  await check('a made-up key is refused', async function () {
    const fake = appstoreKey.key.slice(0, -4) + '0000';
    return (await status(department(fake).get('/identity-resolutions'))) === 401 ? true : 'not 401';
  });

  console.log('\nregistration');
  await check('an unknown person is created and the account linked', async function () {
    created = data(await appstore.post('/registrations', { external_account_id: RUN + '-A1', external_login: 'grace', party: person }));
    if (created.outcome !== 'CREATED' || !/^[1-9][0-9]*$/.test(created.party_pk)) return JSON.stringify(created);
    const lookup = data(await appstore.get('/accounts/' + RUN + '-A1'));
    return lookup.status === 'LINKED' && lookup.party_pk === created.party_pk ? true : JSON.stringify(lookup);
  });
  await check('the same account again is the same customer', async function () {
    const again = data(await appstore.post('/registrations', { external_account_id: RUN + '-A1', party: person }));
    return again.outcome === 'EXISTING' && again.party_pk === created.party_pk ? true : JSON.stringify(again);
  });
  await check('a second account of a strongly matching person is linked to that customer', async function () {
    const second = data(await appstore.post('/registrations', { external_account_id: RUN + '-A2', party: person }));
    if (second.outcome !== 'MERGED' || second.party_pk !== created.party_pk) return JSON.stringify(second);
    const detail = data(await admin.get('/crm/parties/' + created.party_pk));
    const ids = (detail.accounts || []).filter(function (row) { return !row.unlinked_at; }).map(function (row) { return row.external_account_id; });
    return ids.indexOf(RUN + '-A1') !== -1 && ids.indexOf(RUN + '-A2') !== -1 ? true : 'accounts ' + ids.join(',');
  });
  let queued;
  await check('an uncertain match (41-69) is queued and creates nobody', async function () {
    const before = data(await admin.get('/crm/parties', { params: { q: RUN + ' Grace' } })).rows.length;
    queued = data(await appstore.post('/registrations', { external_account_id: RUN + '-A3',
      party: { full_name: RUN + ' Grace', mobile: person.mobile, birth_date: '1980-01-01' } }));
    const after = data(await admin.get('/crm/parties', { params: { q: RUN + ' Grace' } })).rows.length;
    if (queued.outcome !== 'QUEUED' || queued.party_pk !== null || after !== before) return JSON.stringify(queued) + ' parties ' + before + '->' + after;
    const lookup = data(await appstore.get('/accounts/' + RUN + '-A3'));
    return lookup.status === 'PENDING' ? true : JSON.stringify(lookup);
  });
  await check('an administrator decision reaches the department feed, once', async function () {
    const decided = data(await admin.post('/crm/identity-intakes/' + queued.intake_id + '/decide', { action: 'NEW' }));
    const feed = data(await appstore.get('/identity-resolutions'));
    const mine = feed.filter(function (row) { return row.source_record_id === RUN + '-A3'; });
    if (mine.length !== 1 || String(mine[0].party_pk) !== String(decided.party_pk)) return 'feed ' + JSON.stringify(mine);
    const lookup = data(await appstore.get('/accounts/' + RUN + '-A3'));
    if (lookup.status !== 'LINKED') return 'account not linked after the decision';
    await appstore.post('/identity-resolutions/' + mine[0].resolution_id + '/acknowledge');
    const later = data(await appstore.get('/identity-resolutions')).filter(function (row) { return row.source_record_id === RUN + '-A3'; });
    return later.length === 0 ? true : 'still in the feed after acknowledging';
  });
  await check("one project's key does not see another project's results", async function () {
    const feed = data(await eshop.get('/identity-resolutions'));
    return feed.every(function (row) { return String(row.source_project_id) === String(eshopKey.project_id); })
      ? true : 'saw another project';
  });
  await check('a registration without a name is refused', async function () {
    return (await status(appstore.post('/registrations', { external_account_id: RUN + '-X', party: { mobile: '+86 135 ' + DIGITS } }))) === 400 ? true : 'not 400';
  });
  await check('a registration with a bad mobile is refused', async function () {
    return (await status(appstore.post('/registrations', { external_account_id: RUN + '-Y', party: { full_name: 'X', mobile: 'call me' } }))) === 400 ? true : 'not 400';
  });
  await check('an unknown account lookup is 404', async function () {
    return (await status(appstore.get('/accounts/' + RUN + '-NOPE'))) === 404 ? true : 'not 404';
  });
  await check('an e-shop registration through the API is matched and linked, not queued', async function () {
    const shop = data(await eshop.post('/registrations', { external_account_id: RUN + '-E1', external_login: 'grace-shop', party: person }));
    return shop.outcome === 'MERGED' && shop.party_pk === created.party_pk ? true : JSON.stringify(shop);
  });
  await check('a revoked key is refused', async function () {
    await apiKeys.revoke(appstoreKey.api_key_id);
    return (await status(appstore.get('/identity-resolutions'))) === 401 ? true : 'not 401';
  });
  await apiKeys.revoke(eshopKey.api_key_id);

  console.log('\nprojects');
  const code = ('T' + RUN).slice(0, 20);
  let project;
  await check('an administrator can add a project of any kind', async function () {
    project = data(await admin.post('/crm/settings/projects', { project_code: code, project_name: RUN + ' project', project_type_code: 'CRM', status: 'ACTIVE' }));
    return project && project.project_type_code === 'CRM' ? true : JSON.stringify(project);
  });
  await check('a project nothing uses can change its code', async function () {
    const changed = data(await admin.put('/crm/settings/projects/' + project.project_id, { project_code: code + 'X', project_name: RUN + ' renamed' }));
    return changed.project_code === code + 'X' ? true : JSON.stringify(changed);
  });
  await check('a project nothing uses can be deleted', async function () {
    await admin.delete('/crm/settings/projects/' + project.project_id);
    return (await status(admin.get('/crm/settings/projects/' + project.project_id))) === 404 ? true : 'still there';
  });
  const meta = data(await admin.get('/crm/meta'));
  const crystal = (meta.projects || []).filter(function (row) { return row.project_code === 'CRYSTAL'; })[0];
  await check('a project in use keeps its code, naming what uses it', async function () {
    try {
      await admin.put('/crm/settings/projects/' + crystal.project_id, { project_code: 'RENAMED' });
      return 'accepted';
    } catch (err) {
      return err.response.status === 409 && /crm_/.test(err.response.data.message) ? true : err.response.status + ' ' + err.response.data.message;
    }
  });
  await check('a project in use cannot be deleted', async function () {
    return (await status(admin.delete('/crm/settings/projects/' + crystal.project_id))) === 409 ? true : 'not 409';
  });
  await check('a project in use can still change its name and kind', async function () {
    const before = crystal.project_name;
    const changed = data(await admin.put('/crm/settings/projects/' + crystal.project_id, { project_name: before + ' (edited)', project_type_code: 'CRM' }));
    await admin.put('/crm/settings/projects/' + crystal.project_id, { project_name: before, project_type_code: crystal.project_type_code || null });
    return changed.project_name === before + ' (edited)' && changed.project_type_code === 'CRM' ? true : JSON.stringify(changed);
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  if (failed) process.exitCode = 1;
}

main().catch(function (err) {
  console.log('check stopped: ' + (err.response ? err.response.status + ' ' + JSON.stringify(err.response.data) : err.stack));
  process.exitCode = 1;
}).finally(function () { return db.destroy(); });
