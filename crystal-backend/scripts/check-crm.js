/**
 * End to end checks for the CRM, against a running API.
 *
 *   node scripts/check-crm.js [http://localhost:5400]
 *
 * The same shape as scripts/check.js, and for the same reason: the rules
 * worth checking here only exist when the API and the database are both
 * involved - that the grid refuses a centre manager the points ledger, that a
 * event cannot be approved by the manager who wrote it, that a quota
 * cannot be overbooked, that a cancelled reservation gives its points back.
 *
 * It WRITES: customers, a product, an event, a segment and a campaign, each
 * coded CHK-<time> so a second run does not collide with the first. Run it
 * against a development or staging database, not production. A reseed
 * (`npm run db:reset`) clears everything it made.
 */
const axios = require('axios');

const base = (process.argv[2] || 'http://localhost:5400').replace(/\/$/, '');
const ADMIN = base + '/api/admin';
const RUN = 'CHK' + Date.now().toString(36).toUpperCase();

let passed = 0;
let failed = 0;
const failures = [];

function client(token) {
  const instance = axios.create({ baseURL: ADMIN, timeout: 30000 });
  if (token) instance.defaults.headers.common.Authorization = 'Bearer ' + token;
  return instance;
}

function data(response) { return response.data.data; }

async function check(name, test) {
  try {
    const result = await test();
    if (result === true) { passed += 1; console.log('  ok   ' + name); return; }
    failed += 1;
    failures.push(name + (typeof result === 'string' ? ' - ' + result : ''));
    console.log('  FAIL ' + name + (typeof result === 'string' ? ' - ' + result : ''));
  } catch (err) {
    failed += 1;
    const message = err.response && err.response.data ? err.response.data.message : err.message;
    failures.push(name + ' - ' + message);
    console.log('  FAIL ' + name + ' - ' + message);
  }
}

/** A request that must be refused with this status; resolves true or a reason. */
async function refused(promise, status) {
  try {
    await promise;
    return 'was accepted';
  } catch (err) {
    if (!err.response) return err.message;
    return err.response.status === status ? true : 'answered ' + err.response.status + ': ' + err.response.data.message;
  }
}

async function signIn(username) {
  const session = data(await client().post('/auth/login', { username: username, password: 'crystal1234' }));
  return client(session.token);
}

async function main() {
  console.log('checking the CRM at ' + base + '  (run ' + RUN + ')\n');

  const admin = await signIn('admin');
  const ops = await signIn('ops');
  const branch = await signIn('branch');
  const editor = await signIn('editor');

  const meta = data(await admin.get('/crm/meta'));
  const byCode = function (list, field, code) { return (meta[list] || []).filter(function (row) { return row[field] === code; })[0]; };
  const crystal = byCode('projects', 'project_code', 'CRYSTAL');
  const activityPoints = byCode('point_types', 'point_type_code', 'ACTIVITY');

  console.log('vocabularies and the grid');
  await check('the vocabularies come back in one read', function () {
    return crystal && activityPoints && meta.product_classes.length > 10 ? true : 'a list is missing';
  });
  await check('an editor cannot read the CRM at all', function () { return refused(editor.get('/crm/meta'), 403); });
  await check('a centre manager cannot open the points ledger', function () {
    return refused(branch.get('/crm/point-accounts'), 403);
  });
  await check('a centre manager can find a customer through the shared picker', async function () {
    return Array.isArray(data(await branch.get('/crm/parties/lookup', { params: { q: 'a' } }))) ? true : 'not a list';
  });
  await check('the overview answers', async function () {
    const overview = data(await admin.get('/crm/overview'));
    return overview.parties && overview.cases && overview.points ? true : 'incomplete';
  });
  await check('a project in use keeps its code', function () {
    return refused(admin.put('/crm/settings/projects/' + crystal.project_id, { project_code: 'RENAMED' }), 409);
  });

  console.log('\ncustomers');
  const mobile = '+86 139 ' + String(Date.now()).slice(-8);
  const personAda = data(await admin.post('/crm/parties', { origin_project_id: crystal.project_id, party_type: 'PERSON', full_name: RUN + ' Ada', mobile: mobile }));

  let review;
  await check('a 65-point match is staged without creating a party', async function () {
    review = data(await admin.post('/crm/parties', { origin_project_id: crystal.project_id, party_type: 'PERSON', full_name: RUN + ' Ada', mobile: mobile.replace(/ /g, ''), confirm_not_duplicate: true }));
    return review.outcome === 'QUEUED' && !review.party_pk && !!review.intake_id;
  });
  // Explicit reviewed registration creates a second record for the legacy merge test below.
  const personAdaDuplicate = data(await admin.post('/crm/identity-intakes/' + review.intake_id + '/decide', { action: 'NEW' }));
  const personBo = data(await admin.post('/crm/parties', { origin_project_id: crystal.project_id, party_type: 'PERSON', full_name: RUN + ' Bo', email: RUN.toLowerCase() + '@example.com' }));

  await check('a person is given a job from the job list and marked as checked by hand', async function () {
    const meta = data(await admin.get('/crm/meta'));
    const teacher = (meta.job_titles || []).filter(function (job) { return job.job_code === 'TEACHER'; })[0];
    if (!teacher) return 'no TEACHER on the job list';
    await admin.put('/crm/parties/' + personBo.party_pk, { job_title_id: teacher.job_title_id, birth_date: '1990-02-14' });
    await admin.post('/crm/parties/' + personBo.party_pk + '/checked', { is_checked_manually: true });
    const record = data(await admin.get('/crm/parties/' + personBo.party_pk));
    const person = record.person || {};
    if (person.job_title_name !== teacher.job_name) return 'job ' + person.job_title_name;
    if (person.birth_year !== 1990) return 'birth year ' + person.birth_year;
    return person.is_checked_manually === true ? true : 'not checked';
  });

  const SHEET_HEADER = ['E-shop PK', 'E-shop ID', 'User PK', 'User ID', 'Full name', 'Gender', 'Birthday', 'Mobile', 'Location ID', 'Address', 'Job title ID'];
  /* Each person's user-management account follows their e-shop account. */
  const userPkOf = function (pk) { return pk ? String(Number(pk) + 500000000) : ''; };
  let eshopPk = null;
  let sheetPartyPk = null;
  await check('an Excel sheet checks matching rows and stages uncertain matches', async function () {
    const ExcelJS = require('exceljs');
    const FormData = require('form-data');
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Customers');
    sheet.addRow(SHEET_HEADER);
    const fresh = '+86 137 ' + String(Date.now() + 7).slice(-8);
    /* The sheet takes IDs: any location and any job title on their lists. */
    const lists = data(await admin.get('/crm/meta'));
    const placeId = (lists.areas || []).length ? lists.areas[0].location_pk : '';
    const jobId = (lists.job_titles || []).filter(function (job) { return job.is_active; })[0].job_title_id;
    eshopPk = String(Date.now()).slice(-9);
    // Every row is complete; rows 1 and 3 are the same person with the same e-shop account.
    sheet.addRow([eshopPk, RUN.toLowerCase() + '-one', userPkOf(eshopPk), RUN.toLowerCase() + '-user-one', RUN + ' Sheet One', 'F', '1992-06-01', fresh, placeId, '1 ' + RUN + ' Road', jobId]);
    sheet.addRow([String(Number(eshopPk) + 1), RUN.toLowerCase() + '-ada', userPkOf(Number(eshopPk) + 1), RUN.toLowerCase() + '-user-ada', RUN + ' Ada', 'M', '1985-01-20', mobile, placeId, '9 ' + RUN + ' Lane', jobId]);
    sheet.addRow([eshopPk, RUN.toLowerCase() + '-one', userPkOf(eshopPk), RUN.toLowerCase() + '-user-one', RUN + ' Sheet One', 'F', '1992-06-01', fresh.replace(/ /g, ''), placeId, '1 ' + RUN + ' Road', '']);
    const buffer = await book.xlsx.writeBuffer();
    const send = function (dryRun) {
      const form = new FormData();
      form.append('file', Buffer.from(buffer), { filename: 'people.xlsx' });
      form.append('origin_project_id', String(crystal.project_id));
      return admin.post('/crm/parties/import' + (dryRun ? '?dry_run=1' : ''), form, { headers: form.getHeaders() });
    };

    const preview = data(await send(true));
    const statuses = preview.rows.map(function (row) { return row.status; }).join(',');
    if (statuses !== 'NEW,REVIEW,DUPLICATE') return 'preview ' + statuses;

    const done = data(await send(false));
    if (done.summary.created !== 1 || done.summary.duplicate !== 1 || done.summary.review !== 1) return 'import ' + JSON.stringify(done.summary);
    const found = data(await admin.get('/crm/parties', { params: { q: RUN + ' Sheet One' } }));
    if (found.rows.length !== 1) return 'created row not found';
    sheetPartyPk = done.rows[0].party_pk;
    return true;
  });

  await check('spreadsheet e-shop and user identifiers are staged for review, not linked', async function () {
    const detail = data(await admin.get('/crm/parties/' + sheetPartyPk));
    const linked = (detail.accounts || []).filter(function (account) { return account.external_account_id === eshopPk && !account.unlinked_at; });
    if (linked.length) return 'committed as an account';
    const listed = data(await admin.get('/crm/parties/' + sheetPartyPk + '/unverified-accounts'));
    const listedEshop = listed.filter(function (row) { return row.external_account_id === eshopPk; })[0];
    const listedUser = listed.filter(function (row) { return row.external_account_id === userPkOf(eshopPk); })[0];
    if (listed.length !== 2 || !listedEshop || !listedUser || listedEshop.review_status !== 'PENDING' || listedUser.review_status !== 'PENDING') return 'listed ' + JSON.stringify(listed);
    const queue = data(await admin.get('/crm/identity-intakes', { params: { category: 'ESHOP', limit: 100 } }));
    const assignment = queue.rows.filter(function (row) { return row.source_record_id === eshopPk; })[0];
    if (!assignment || String(assignment.candidates[0].party_pk) !== String(sheetPartyPk)) return 'not in the e-shop queue';
    await admin.post('/crm/identity-intakes/' + assignment.intake_id + '/decide', { action: 'ASSIGN', party_pk: sheetPartyPk });
    const after = data(await admin.get('/crm/parties/' + sheetPartyPk));
    const assigned = (after.accounts || []).filter(function (account) { return account.external_account_id === eshopPk && !account.unlinked_at; });
    const relisted = data(await admin.get('/crm/parties/' + sheetPartyPk + '/unverified-accounts'));
    const relistedEshop = relisted.filter(function (row) { return row.external_account_id === eshopPk; })[0];
    return assigned.length === 1 && relistedEshop && relistedEshop.review_status === 'ASSIGNED' ? true : 'assignment did not link the account';
  });

  /* What the forms may not save: each refusal is a 400 naming the field. */
  const refusedField = async function (request, field) {
    try {
      await request;
      return 'saved';
    } catch (err) {
      const problems = (err.response && err.response.data && err.response.data.detail) || [];
      if (!err.response || err.response.status !== 400) return 'status ' + (err.response && err.response.status);
      return problems.some(function (problem) { return problem.field === field; }) ? true : 'no problem on ' + field + ': ' + JSON.stringify(problems);
    }
  };
  await check('a new customer needs a name', function () {
    return refusedField(admin.post('/crm/parties', { origin_project_id: crystal.project_id, party_type: 'PERSON', display_name: '  ', mobile: '+86 135 0000 0001' }), 'display_name');
  });
  await check('a mobile that is not a phone number is refused', function () {
    return refusedField(admin.post('/crm/parties', { origin_project_id: crystal.project_id, party_type: 'PERSON', display_name: RUN + ' Bad Mobile', mobile: 'call me' }), 'mobile');
  });
  await check('a birthday in the future is refused', function () {
    return refusedField(admin.put('/crm/parties/' + personBo.party_pk, { birth_date: '2999-01-01' }), 'birth_date');
  });
  await check('a job title that is not on the job list is refused', function () {
    return refusedField(admin.put('/crm/parties/' + personBo.party_pk, { job_title_id: 999999 }), 'job_title_id');
  });
  await check('a location that is not on the location list is refused', function () {
    return refusedField(admin.put('/crm/parties/' + personBo.party_pk, { home_location_pk: 987654321 }), 'home_location_pk');
  });
  await check('an email contact that is not an email is refused', function () {
    return refusedField(admin.post('/crm/parties/' + personBo.party_pk + '/contacts', { contact_type: 'EMAIL', contact_value: 'not-an-email' }), 'contact_value');
  });

  await check('bad rows do not stop a sheet: each is kept as an import error with its reasons', async function () {
    const ExcelJS = require('exceljs');
    const FormData = require('form-data');
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Customers');
    sheet.addRow(SHEET_HEADER);
    sheet.addRow(['77', 'bad-one', '78', 'bad-user', RUN + ' Bad One', 'X', '1990-01-01', '+86 136 ' + String(Date.now() + 11).slice(-8), 1, '2 Road', 999999]);
    sheet.addRow(['', '', '', '', '', '', '', '123', '', '', '']);
    const form = new FormData();
    form.append('file', Buffer.from(await book.xlsx.writeBuffer()), { filename: 'bad.xlsx' });
    form.append('origin_project_id', String(crystal.project_id));
    const done = data(await admin.post('/crm/parties/import', form, { headers: form.getHeaders() }));
    if (done.summary.error !== 2 || done.summary.created !== 0) return 'summary ' + JSON.stringify(done.summary);
    const kept = data(await admin.get('/crm/import-errors', { params: { limit: 100 } }));
    const mine = kept.rows.filter(function (row) { return row.file_name === 'bad.xlsx' && (row.cells.full_name === RUN + ' Bad One' || row.cells.mobile === '123'); });
    if (mine.length !== 2 || !mine.every(function (row) { return (row.errors || []).length > 0; })) return 'kept ' + JSON.stringify(mine);
    await admin.post('/crm/import-errors/' + mine[0].import_error_id + '/dismiss');
    const after = data(await admin.get('/crm/import-errors', { params: { limit: 100 } }));
    return after.rows.some(function (row) { return row.import_error_id === mine[0].import_error_id; }) ? 'not dismissed' : true;
  });

  await check('a new customer exposes its numeric party_pk', function () {
    return /^[1-9][0-9]*$/.test(personAda.party_pk) && personAda.party_id === undefined;
  });
  await check('a phone typed with spaces is found typed without', async function () {
    const found = data(await admin.get('/crm/parties', { params: { q: mobile.replace(/\D/g, '').slice(-8) } }));
    return found.rows.some(function (row) { return row.party_pk === personAda.party_pk; }) ? true : 'not found';
  });
  await check('the duplicate scan queues the reviewed 65-point pair', async function () {
    await admin.post('/crm/duplicates/scan');
    const queue = data(await admin.get('/crm/duplicates', { params: { limit: 200 } }));
    const hit = queue.rows.filter(function (row) { return row.incoming_party_pk === personAdaDuplicate.party_pk && row.candidate_party_pk === personAda.party_pk; })[0];
    if (!hit) return 'not queued';
    await admin.post('/crm/duplicates/' + hit.match_candidate_id + '/accept');
    const merged = data(await admin.get('/crm/parties/' + personAdaDuplicate.party_pk));
    return merged.party.party_status === 'MERGED' && merged.party.merged_into_party_pk === personAda.party_pk ? true : 'not merged';
  });
  await check('a consent change needs a reason', function () {
    return refused(admin.put('/crm/parties/' + personAda.party_pk + '/consents', { project_communication_option_id: 1, consent_status: 'GRANTED' }), 400);
  });

  console.log('\nproducts, registrations and transfers');
  const phone9 = byCode('product_classes', 'class_code', 'PHONE_9');
  const product = data(await admin.post('/crm/catalog', {
    project_id: crystal.project_id, product_code: RUN + '-P9', product_name: RUN + ' Phone 9',
    product_kind: 'DEVICE', product_class_id: phone9.product_class_id, status: 'ACTIVE'
  }));
  const rule = data(await admin.post('/crm/point-rules', {
    rule_code: RUN + '-REG', rule_name: RUN + ' registration', point_type_id: activityPoints.point_type_id,
    trigger_code: 'PRODUCT_REGISTRATION', product_id: product.product_id, points: 100, is_active: true
  }));
  const serial = RUN + '-SN1';
  let registration;

  await check('registering pays the rule that covers the product', async function () {
    registration = data(await admin.post('/crm/registrations', {
      party_pk: personAda.party_pk, product_id: product.product_id, serial_number: serial, relationship_code: 'OWNER'
    }));
    return registration.point_event && Number(registration.point_event.points_delta) === 100 ? true : 'no points';
  });
  await check('a second owner is refused, naming the first', async function () {
    try {
      await admin.post('/crm/registrations', {
        party_pk: personBo.party_pk, product_instance_id: registration.instance.product_instance_id, relationship_code: 'OWNER'
      });
      return 'accepted';
    } catch (err) {
      return err.response.status === 409 && err.response.data.message.indexOf(personAda.party_pk) !== -1 ? true : err.response.data.message;
    }
  });
  await check('an ownership transfer ends one registration and starts the next', async function () {
    const transfer = data(await admin.post('/crm/transfers', {
      product_instance_id: registration.instance.product_instance_id, transfer_kind: 'OWNERSHIP_TRANSFER', to_party_pk: personBo.party_pk
    }));
    if (transfer.from_party_pk !== personAda.party_pk) return 'from was not worked out';
    const done = data(await admin.post('/crm/transfers/' + transfer.product_transfer_id + '/status', { status: 'COMPLETED' }));
    const history = data(await admin.get('/crm/instances/' + registration.instance.product_instance_id));
    const current = history.registrations.filter(function (row) { return !row.valid_to; });
    return done.closed_registration_id && done.created_registration_id && current.length === 1 && current[0].party_pk === personBo.party_pk
      ? true : 'holders ' + JSON.stringify(current.map(function (row) { return row.party_pk; }));
  });
  await check('assigning a user keeps the owner', async function () {
    const transfer = data(await admin.post('/crm/transfers', {
      product_instance_id: registration.instance.product_instance_id, transfer_kind: 'ASSIGN_USER', to_party_pk: personAda.party_pk
    }));
    await admin.post('/crm/transfers/' + transfer.product_transfer_id + '/status', { status: 'COMPLETED' });
    const history = data(await admin.get('/crm/instances/' + registration.instance.product_instance_id));
    const codes = history.registrations.filter(function (row) { return !row.valid_to; }).map(function (row) { return row.relationship_code; }).sort();
    return codes.join(',') === 'OWNER,USER' ? true : codes.join(',');
  });
  await check('re-registering the same device does not pay twice', async function () {
    const transfer = data(await admin.post('/crm/transfers', {
      product_instance_id: registration.instance.product_instance_id, transfer_kind: 'END_ASSIGNMENT'
    }));
    await admin.post('/crm/transfers/' + transfer.product_transfer_id + '/status', { status: 'COMPLETED' });
    const owner = data(await admin.get('/crm/registrations', { params: { q: serial, current: 1 } })).rows[0];
    await admin.post('/crm/registrations/' + owner.product_registration_id + '/end', { end_reason_code: 'RETURNED' });
    const again = data(await admin.post('/crm/registrations', {
      party_pk: personAda.party_pk, product_instance_id: registration.instance.product_instance_id, relationship_code: 'OWNER'
    }));
    return again.point_event === null ? true : 'paid again';
  });

  console.log('\npoints');
  await check('a debit larger than the balance is refused', function () {
    return refused(admin.post('/crm/point-adjustments', {
      party_pk: personAda.party_pk, point_type_id: activityPoints.point_type_id, points_delta: -999999, description: 'check'
    }), 409);
  });
  await check('an adjustment needs a reason', function () {
    return refused(admin.post('/crm/point-adjustments', {
      party_pk: personAda.party_pk, point_type_id: activityPoints.point_type_id, points_delta: 5
    }), 400);
  });
  await check('an adjustment moves the balance and the ledger together', async function () {
    await admin.post('/crm/point-adjustments', {
      party_pk: personAda.party_pk, point_type_id: activityPoints.point_type_id, points_delta: 50, description: RUN
    });
    const drift = data(await admin.get('/crm/point-drift'));
    return drift.length === 0 ? true : drift.length + ' accounts drifted';
  });

  console.log('\nactivity events');
  const sites = data(await admin.get('/crm/sites/options'));
  const site = sites[0];
  const event = data(await admin.post('/crm/events', {
    event_code: RUN + '-RSV', event_name: RUN + ' reservation', event_type: 'RESERVATION',
    project_id: crystal.project_id, eligibility_basis: 'MANUAL',
    cost_point_type_id: activityPoints.point_type_id, cost_points: 30,
    number_prefix: RUN.slice(-7) + '-', number_start: 1, number_end: 9999
  }));
  const pid = event.event_id;

  await check('the manager who wrote an event cannot approve it', function () {
    return refused(admin.post('/crm/events/' + pid + '/status', { status: 'APPROVED' }), 409);
  });
  await check('another manager can', async function () {
    const approved = data(await ops.post('/crm/events/' + pid + '/status', { status: 'APPROVED' }));
    return approved.status === 'APPROVED' ? true : approved.status;
  });

  await admin.post('/crm/events/' + pid + '/targets', { party_pk: personAda.party_pk, allowed_count: 1 });
  await admin.post('/crm/events/' + pid + '/targets', { party_pk: personBo.party_pk, allowed_count: 3 });
  await admin.post('/crm/events/' + pid + '/quotas', { entry_type: 'NORMAL', quota_count: 2 });
  await admin.post('/crm/events/' + pid + '/locations', { service_center_id: site.service_center_id, service_center_role: 'PICKUP' });
  await admin.post('/crm/point-adjustments', {
    party_pk: personBo.party_pk, point_type_id: activityPoints.point_type_id, points_delta: 200, description: RUN
  });
  await admin.post('/crm/events/' + pid + '/status', { status: 'TARGETS_FROZEN' });
  await admin.post('/crm/events/' + pid + '/status', { status: 'OPEN' });

  await check('a frozen list takes no new targets', function () {
    return refused(admin.post('/crm/events/' + pid + '/targets', { party_pk: personAdaDuplicate.party_pk }), 409);
  });

  let first;
  await check('an entry is numbered and costs its points', async function () {
    const before = data(await admin.get('/crm/point-accounts', { params: { party_pk: personAda.party_pk, point_type_id: activityPoints.point_type_id } })).rows[0];
    first = data(await admin.post('/crm/events/' + pid + '/reservations', {
      party_pk: personAda.party_pk, holder_id_card: 'ID-' + RUN + '-A', service_center_id: site.service_center_id
    }));
    const after = data(await admin.get('/crm/point-accounts', { params: { party_pk: personAda.party_pk, point_type_id: activityPoints.point_type_id } })).rows[0];
    return first.reservation_code === RUN.slice(-7) + '-0001' && Number(before.balance) - Number(after.balance) === 30
      ? true : first.reservation_code + ' / ' + before.balance + ' -> ' + after.balance;
  });
  await check('a target with no entries left is refused', function () {
    return refused(admin.post('/crm/events/' + pid + '/reservations', { party_pk: personAda.party_pk }), 409);
  });
  await check('one ID card, one entry', function () {
    return refused(admin.post('/crm/events/' + pid + '/reservations', { party_pk: personBo.party_pk, holder_id_card: 'id-' + RUN + '-a' }), 409);
  });
  await check('the quota cannot be overbooked', async function () {
    await admin.post('/crm/events/' + pid + '/reservations', { party_pk: personBo.party_pk, holder_id_card: 'ID-' + RUN + '-B' });
    return refused(admin.post('/crm/events/' + pid + '/reservations', { party_pk: personBo.party_pk, holder_id_card: 'ID-' + RUN + '-C' }), 409);
  });
  await check('cancelling gives back the entry, the quota and the points', async function () {
    const before = data(await admin.get('/crm/point-accounts', { params: { party_pk: personAda.party_pk, point_type_id: activityPoints.point_type_id } })).rows[0];
    await admin.post('/crm/reservations/' + first.reservation_id + '/status', { status: 'CANCELLED', note: 'check' });
    const after = data(await admin.get('/crm/point-accounts', { params: { party_pk: personAda.party_pk, point_type_id: activityPoints.point_type_id } })).rows[0];
    if (Number(after.balance) - Number(before.balance) !== 30) return 'no refund';
    const third = data(await admin.post('/crm/events/' + pid + '/reservations', { party_pk: personBo.party_pk, holder_id_card: 'ID-' + RUN + '-C' }));
    return third.reservation_no === 3 ? true : 'number ' + third.reservation_no;
  });
  await check('collecting an entry at a site is recorded as site activity', async function () {
    const open = data(await admin.get('/crm/events/' + pid + '/reservations', { params: { status: 'RESERVED' } })).rows[0];
    await admin.post('/crm/reservations/' + open.reservation_id + '/status', { status: 'FULFILLED', service_center_id: site.service_center_id });
    const log = data(await admin.get('/crm/site-activities', { params: { service_center_id: site.service_center_id, limit: 5 } }));
    return log.rows.some(function (row) { return row.related_reservation_id === open.reservation_id && row.activity_code === 'RESERVATION_PICKUP'; })
      ? true : 'no activity';
  });
  await check('a points reward is paid at once, and runs out', async function () {
    const reward = data(await admin.post('/crm/events/' + pid + '/rewards', {
      reward_name: RUN + ' bonus', reward_type: 'POINTS', point_type_id: activityPoints.point_type_id, points: 10, quantity_total: 1
    }));
    const awarded = data(await admin.post('/crm/events/' + pid + '/awards', { reward_id: reward.reward_id, party_pk: personAda.party_pk }));
    if (awarded.status !== 'CREDITED' || !awarded.point_event_id) return 'not credited';
    return refused(admin.post('/crm/events/' + pid + '/awards', { reward_id: reward.reward_id, party_pk: personBo.party_pk }), 409);
  });
  await check('an event with open entries cannot be marked fulfilled', async function () {
    await admin.post('/crm/events/' + pid + '/status', { status: 'CLOSED' });
    return refused(admin.post('/crm/events/' + pid + '/status', { status: 'FULFILLED' }), 409);
  });

  console.log('\nsites');
  const types = {};
  meta.activity_types.forEach(function (activityType) { types[activityType.activity_code] = activityType; });
  const bare = data(await admin.post('/crm/sites', { service_center_code: RUN + '-SITE', service_center_name: RUN + ' kiosk', service_center_kind: 'PARTNER_SHOP' }));
  await check('a site cannot record what it is not equipped for', function () {
    return refused(branch.post('/crm/site-activities', {
      service_center_id: bare.service_center_id, activity_type_id: types.DEVICE_SALE.activity_type_id, amount: 99
    }), 409);
  });
  await check('once it is, the centre manager can record it', async function () {
    await admin.post('/crm/sites/' + bare.service_center_id + '/capabilities', { capability_code: 'DEVICE_SALE' });
    const row = data(await branch.post('/crm/site-activities', {
      service_center_id: bare.service_center_id, activity_type_id: types.DEVICE_SALE.activity_type_id, amount: 99, party_pk: personAda.party_pk
    }));
    return row.service_center_activity_id && Number(row.amount) === 99 ? true : 'not recorded';
  });
  await check('a target is read against the log', async function () {
    const today = new Date().toISOString().slice(0, 10);
    await admin.post('/crm/site-targets', {
      service_center_id: bare.service_center_id, activity_type_id: types.DEVICE_SALE.activity_type_id,
      period_start: today, period_end: today, target_quantity: 4
    });
    const progress = data(await admin.get('/crm/site-targets', { params: { service_center_id: bare.service_center_id } })).rows[0];
    return Number(progress.actual_quantity) === 1 && Number(progress.quantity_pct) === 25 ? true : JSON.stringify(progress);
  });

  console.log('\nservice cases');
  const fromTicket = data(await admin.get('/crm/cases', { params: { limit: 200 } })).rows.filter(function (row) { return row.crystal_repair_ticket_id; })[0];
  await check('a case that follows a repair ticket is changed on the ticket, not here', function () {
    if (!fromTicket) return 'no imported cases - run the import first';
    return refused(admin.put('/crm/cases/' + fromTicket.case_id, { title: 'x' }), 409);
  });
  await check('its classification is the CRM\'s own and can be set', async function () {
    const cause = (meta.fault_categories || [])[0];
    const classification = data(await admin.put('/crm/cases/' + fromTicket.case_id + '/classification', {
      fault_category_id: cause ? cause.fault_category_id : null, resolution_text: RUN
    }));
    return classification.case_id === fromTicket.case_id ? true : 'not saved';
  });
  await check('a complaint opened here closes with a date', async function () {
    const complaint = byCode('case_types', 'case_type_code', 'COMPLAINT');
    const closed = byCode('service_statuses', 'status_code', 'CLOSED');
    const createdCase = data(await admin.post('/crm/cases', {
      party_pk: personAda.party_pk, project_id: crystal.project_id, case_type_id: complaint.case_type_id, title: RUN
    }));
    const done = data(await admin.put('/crm/cases/' + createdCase.case_id, { service_status_id: closed.service_status_id }));
    return done.closed_at ? true : 'no closed_at';
  });

  console.log('\nsegments and campaigns');
  let segment;
  await check('a rule with an unknown field is refused', function () {
    return refused(admin.post('/crm/segments/preview', { rule_expression: { field: 'drop_table' } }), 400);
  });
  await check('a segment is evaluated into members', async function () {
    segment = data(await admin.post('/crm/segments', {
      segment_code: RUN, segment_name: RUN + ' smartphone owners',
      rule_expression: { all: [{ field: 'party_type', value: 'PERSON' }, { field: 'owns_class', class: 'SMARTPHONE', min: 1 }] }
    }));
    const result = data(await admin.post('/crm/segments/' + segment.segment_id + '/evaluate'));
    return result.members > 0 ? true : 'no members';
  });
  await check('a campaign is approved by somebody else, freezes its audience and checks consent', async function () {
    const campaign = data(await admin.post('/crm/campaigns', {
      campaign_code: RUN, campaign_name: RUN + ' launch', campaign_type: 'PRODUCT_LAUNCH', project_id: crystal.project_id
    }));
    const denied = await refused(admin.post('/crm/campaigns/' + campaign.campaign_id + '/status', { status: 'APPROVED' }), 409);
    if (denied !== true) return 'self-approval ' + denied;
    await ops.post('/crm/campaigns/' + campaign.campaign_id + '/status', { status: 'APPROVED' });
    const audience = data(await admin.post('/crm/campaigns/' + campaign.campaign_id + '/audiences', {
      audience_name: 'owners', audience_type: 'SEGMENT', source_segment_id: segment.segment_id
    }));
    const email = byCode('channels', 'channel_code', 'EMAIL');
    const marketing = byCode('communication_purposes', 'purpose_code', 'MARKETING');
    const action = data(await admin.post('/crm/campaigns/' + campaign.campaign_id + '/actions', {
      audience_id: audience.audience_id, channel_id: email.channel_id, purpose_id: marketing.purpose_id,
      action_name: 'launch mail', content_title: 'Hello', content_body: 'New phone'
    }));
    const tally = data(await admin.post('/crm/campaigns/' + campaign.campaign_id + '/actions/' + action.action_id + '/prepare'));
    const total = Object.keys(tally).reduce(function (sum, key) { return sum + tally[key]; }, 0);
    if (total !== audience.member_count) return 'tally ' + JSON.stringify(tally) + ' for ' + audience.member_count + ' members';
    /* Whoever is eligible must hold a granted consent for this option; everybody else is skipped with a reason. */
    const recipients = data(await admin.get('/crm/campaigns/' + campaign.campaign_id + '/actions/' + action.action_id + '/recipients', { params: { limit: 500 } })).rows;
    const eligibleIds = recipients.filter(function (recipient) { return recipient.recipient_status === 'ELIGIBLE'; })
      .map(function (recipient) { return recipient.party_communication_consent_id; });
    if (eligibleIds.some(function (consentId) { return !consentId; })) return 'an eligible recipient has no consent';
    const consents = eligibleIds.length
      ? await Promise.all(eligibleIds.map(function (consentId) {
        return admin.get('/crm/parties/' + recipients.filter(function (recipient) { return recipient.party_communication_consent_id === consentId; })[0].party_pk)
          .then(function (response) {
            return data(response).consents.filter(function (consent) { return consent.party_communication_consent_id === consentId; })[0];
          });
      }))
      : [];
    const notGranted = consents.filter(function (consent) { return !consent || consent.consent_status !== 'GRANTED'; });
    return notGranted.length ? notGranted.length + ' eligible recipients without a granted consent' : true;
  });

  console.log('\nanalysis, transactions, memberships and departments');
  await check('every Dream-wide snapshot sits in the grade band its score falls in', async function () {
    const summary = data(await admin.get('/crm/analysis/summary'));
    if (!summary.reference_date) return 'no analysis run';
    const snapshots = data(await admin.get('/crm/analysis/snapshots', { params: { scope: 'dream', limit: 200 } })).rows;
    const bands = summary.grades;
    const wrong = snapshots.filter(function (snapshot) {
      const band = bands.filter(function (grade) { return grade.grade_code === snapshot.grade_code; })[0];
      const score = Number(snapshot.corporate_score);
      return !band || score < Number(band.min_score) || (band.max_score !== null && score >= Number(band.max_score) && Number(band.max_score) !== 100);
    });
    return wrong.length ? wrong.length + ' snapshots outside their band' : true;
  });
  await check('a refund is its own negative row pointing at the sale', async function () {
    const refunds = data(await admin.get('/crm/transactions', { params: { transaction_type_code: 'REFUND', limit: 20 } })).rows;
    if (!refunds.length) return 'no refunds imported';
    const bad = refunds.filter(function (refund) { return !(Number(refund.net_amount) < 0); });
    if (bad.length) return bad.length + ' refunds are not negative';
    const linked = refunds.filter(function (refund) { return refund.original_transaction_id; })[0];
    if (!linked) return true;
    const sale = data(await admin.get('/crm/transactions/' + linked.original_transaction_id));
    return sale.refunds.some(function (refund) { return refund.transaction_id === linked.transaction_id; }) ? true : 'the sale does not list its refund';
  });
  await check('a tier change needs a reason, stays in its project and is kept in the history', async function () {
    const membership = data(await admin.get('/crm/memberships', { params: { limit: 1 } })).rows[0];
    if (!membership) return 'no memberships';
    const tiers = (meta.project_tiers || []).filter(function (tier) { return tier.project_id === membership.project_id; });
    const other = tiers.filter(function (tier) { return tier.project_tier_id !== membership.current_tier_id; })[0];
    const foreign = (meta.project_tiers || []).filter(function (tier) { return tier.project_id !== membership.project_id; })[0];
    if (!other) return 'the project has one tier';
    const noReason = await refused(admin.post('/crm/memberships/' + membership.membership_id + '/tier', { tier_id: other.project_tier_id }), 400);
    if (noReason !== true) return 'without a reason: ' + noReason;
    if (foreign) {
      const wrongProject = await refused(admin.post('/crm/memberships/' + membership.membership_id + '/tier', { tier_id: foreign.project_tier_id, reason: RUN }), 409);
      if (wrongProject !== true) return 'another project\'s tier: ' + wrongProject;
    }
    await admin.post('/crm/memberships/' + membership.membership_id + '/tier', { tier_id: other.project_tier_id, reason: RUN });
    const history = data(await admin.get('/crm/memberships/' + membership.membership_id + '/history'));
    const rows = history.rows || history;
    if (membership.current_tier_id) {
      await admin.post('/crm/memberships/' + membership.membership_id + '/tier', { tier_id: membership.current_tier_id, reason: RUN + ' undo' });
    }
    return rows.some(function (change) { return change.change_reason === RUN; }) ? true : 'no history row';
  });
  await check('a role meant for one department cannot be given to somebody in another', async function () {
    const staff = data(await admin.get('/crm/departments/staff'));
    const staffRows = staff.rows || staff;
    const person = staffRows.filter(function (manager) { return manager.username !== 'admin'; })[0] || staffRows[0];
    const departments = meta.departments || [];
    if (!person || departments.length < 2) return 'not enough staff or departments';
    const before = person.role_department_id || null;
    await admin.put('/crm/departments/roles/' + person.role_id, { department_id: departments[0].department_id });
    const answer = await refused(admin.put('/crm/departments/staff/' + person.manager_id, { department_id: departments[1].department_id }), 409);
    await admin.put('/crm/departments/roles/' + person.role_id, { department_id: before });
    return answer;
  });

  console.log('\ncustomer 360');
  const parentOrg = data(await admin.post('/crm/parties', { origin_project_id: crystal.project_id, party_type: 'ORGANIZATION', legal_name: RUN + ' Group', trading_name: RUN + ' Group' }));
  const childOrg = data(await admin.post('/crm/parties', { origin_project_id: crystal.project_id, party_type: 'ORGANIZATION', legal_name: RUN + ' Shop', trading_name: RUN + ' Shop' }));
  await check('the record\'s figures answer for a person and an organization', async function () {
    const personView = data(await admin.get('/crm/parties/' + personAda.party_pk + '/360'));
    const orgView = data(await admin.get('/crm/parties/' + childOrg.party_pk + '/360'));
    return personView.header && personView.reach && Array.isArray(personView.accounts) && orgView.hierarchy && Array.isArray(orgView.key_contacts)
      ? true : 'incomplete';
  });
  await check('a relationship reads from both ends', async function () {
    await admin.post('/crm/parties/' + personAda.party_pk + '/relationships', { related_party_pk: personBo.party_pk, relationship_type_code: 'PARENT' });
    const fromBo = data(await admin.get('/crm/parties/' + personBo.party_pk + '/360')).relationships;
    return fromBo.some(function (row) { return row.other_party_pk === personAda.party_pk && row.type_code === 'CHILD'; }) ? true : JSON.stringify(fromBo);
  });
  await check('a person relationship cannot join an organization', function () {
    return refused(admin.post('/crm/parties/' + personAda.party_pk + '/relationships', { related_party_pk: childOrg.party_pk, relationship_type_code: 'SPOUSE' }), 409);
  });
  await check('a company cannot become its own ancestor', async function () {
    await admin.post('/crm/parties/' + childOrg.party_pk + '/relationships', { related_party_pk: parentOrg.party_pk, relationship_type_code: 'PARENT_COMPANY' });
    const tree = data(await admin.get('/crm/parties/' + childOrg.party_pk + '/360')).hierarchy;
    if (String(tree.root_party_pk) !== String(parentOrg.party_pk)) return 'the group root is ' + tree.root_party_pk;
    return refused(admin.post('/crm/parties/' + parentOrg.party_pk + '/relationships', { related_party_pk: childOrg.party_pk, relationship_type_code: 'PARENT_COMPANY' }), 409);
  });
  await check('a tag is put on and taken off', async function () {
    const tag = (meta.tags || [])[0] || data(await admin.get('/crm/meta')).tags[0];
    await admin.post('/crm/parties/' + personAda.party_pk + '/tags', { tag_id: tag.tag_id });
    const on = data(await admin.get('/crm/parties/' + personAda.party_pk + '/360')).tags.some(function (row) { return row.tag_id === tag.tag_id; });
    await admin.delete('/crm/parties/' + personAda.party_pk + '/tags/' + tag.tag_id);
    const off = !data(await admin.get('/crm/parties/' + personAda.party_pk + '/360')).tags.some(function (row) { return row.tag_id === tag.tag_id; });
    return on && off ? true : 'on ' + on + ', off ' + off;
  });
  await check('a note is written, pinned and removed', async function () {
    const note = data(await admin.post('/crm/parties/' + personAda.party_pk + '/notes', { note_text: RUN + ' note' }));
    await admin.put('/crm/parties/' + personAda.party_pk + '/notes/' + note.note_id, { is_pinned: true });
    const pinned = data(await admin.get('/crm/parties/' + personAda.party_pk + '/notes')).rows[0];
    await admin.delete('/crm/parties/' + personAda.party_pk + '/notes/' + note.note_id);
    const left = data(await admin.get('/crm/parties/' + personAda.party_pk + '/notes')).rows.filter(function (row) { return row.note_id === note.note_id; });
    return pinned.note_id === note.note_id && pinned.is_pinned && !left.length ? true : 'pin or removal failed';
  });
  await check('a document comes back as it went in, and other kinds are refused', async function () {
    const FormData = require('form-data');
    const bytes = Buffer.from('%PDF-1.4\n' + RUN + '\n%%EOF\n');
    const form = new FormData();
    form.append('file', bytes, { filename: RUN + '.pdf', contentType: 'application/pdf' });
    const file = data(await admin.post('/crm/parties/' + personAda.party_pk + '/files', form, { headers: form.getHeaders() }));
    const download = await admin.get('/crm/parties/' + personAda.party_pk + '/files/' + file.file_id + '/download', { responseType: 'arraybuffer' });
    if (Buffer.compare(Buffer.from(download.data), bytes) !== 0) return 'the bytes changed';
    if (!/attachment/.test(download.headers['content-disposition'] || '')) return 'not sent as an attachment';
    await admin.delete('/crm/parties/' + personAda.party_pk + '/files/' + file.file_id);
    const script = new FormData();
    script.append('file', Buffer.from('<script>alert(1)</script>'), { filename: 'x.html', contentType: 'text/html' });
    return refused(admin.post('/crm/parties/' + personAda.party_pk + '/files', script, { headers: script.getHeaders() }), 400);
  });
  await check('a call is logged with its agent', async function () {
    const row = data(await admin.post('/crm/parties/' + personAda.party_pk + '/interactions', {
      direction: 'INBOUND', channel_code: 'PHONE', interaction_type: 'GENERAL_INQUIRY', subject: RUN + ' call', outcome_code: 'ANSWERED'
    }));
    return row.manager_id && row.outcome_code === 'ANSWERED' ? true : JSON.stringify(row);
  });
  await check('a marketing message needs consent; a service notice does not', async function () {
    const email = byCode('channels', 'channel_code', 'EMAIL');
    const sms = byCode('channels', 'channel_code', 'SMS');
    const marketing = byCode('communication_purposes', 'purpose_code', 'MARKETING');
    const notice = byCode('communication_purposes', 'purpose_code', 'SERVICE_NOTICE');
    const denied = await refused(admin.post('/crm/parties/' + personBo.party_pk + '/messages', {
      project_id: crystal.project_id, channel_id: email.channel_id, purpose_id: marketing.purpose_id, subject: 'Offer', body: 'Buy now'
    }), 409);
    if (denied !== true) return 'marketing without consent: ' + denied;
    const queued = data(await admin.post('/crm/parties/' + personAda.party_pk + '/messages', {
      project_id: crystal.project_id, channel_id: sms.channel_id, purpose_id: notice.purpose_id, subject: 'Ready', body: 'Your device is ready'
    }));
    return queued.outcome_code === 'QUEUED' && queued.destination_snapshot ? true : JSON.stringify(queued);
  });
  await check('a new account manager ends the previous one\'s turn', async function () {
    const staff = data(await admin.get('/crm/meta')).staff;
    await admin.post('/crm/parties/' + childOrg.party_pk + '/team', { team_role: 'ACCOUNT_MANAGER', manager_id: staff[0].manager_id });
    await admin.post('/crm/parties/' + childOrg.party_pk + '/team', { team_role: 'ACCOUNT_MANAGER', manager_id: staff[1].manager_id });
    const team = data(await admin.get('/crm/parties/' + childOrg.party_pk + '/team'));
    const current = team.filter(function (row) { return !row.ended_at; });
    return team.length === 2 && current.length === 1 && current[0].manager_id === staff[1].manager_id ? true : JSON.stringify(team);
  });
  await check('a contract cannot end before it starts', function () {
    return refused(admin.post('/crm/parties/' + childOrg.party_pk + '/agreements', {
      agreement_type: 'ENTERPRISE', start_date: '2026-06-01', end_date: '2026-01-01'
    }), 400);
  });
  await check('the search finds a customer by number', async function () {
    const found = data(await admin.get('/crm/search', { params: { q: personAda.party_pk.toLowerCase() } }));
    return found.customers.some(function (row) { return row.party_pk === personAda.party_pk; }) ? true : JSON.stringify(found.customers);
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  if (failed) {
    console.log('\nfailures:\n  ' + failures.join('\n  '));
    process.exit(1);
  }
}

main().catch(function (err) {
  const message = err.response && err.response.data ? err.response.data.message : err.message;
  console.error('check-crm stopped: ' + message);
  process.exit(1);
});
