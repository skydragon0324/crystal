'use strict';

/**
 * DEMO DATA FOR EVERY CRM SCREEN.
 *
 *   npm run demo:crm          (also run by seed 10_crm_demo after the imports)
 *
 * The imports fill the CRM with what Crystal, the Eshop and the Appstore
 * already know: customers, accounts, purchases, devices, repair tickets,
 * points. What no project knows yet is what the CRM itself is for - the
 * organizations behind the agencies, what each customer agreed to be sent,
 * how a complaint was classified, a programme with entries and prizes, a
 * campaign that went out and what came back. This script adds that, so every
 * screen and every tab has something on it to try.
 *
 * IT GOES THROUGH THE API, NOT AROUND IT. The app is mounted on a private port
 * inside this process and every change is a request a manager could have
 * made: a programme or campaign is written by one manager and approved by
 * another, an entry costs its quota, a campaign checks consent before it
 * sends. Only what would come from outside the console is written straight
 * to the tables - the consents customers ticked in the apps, the answers to
 * registration questions, and the delivery, open and purchase feedback an
 * email or SMS provider would send back.
 *
 * It runs once: a database that already has the demo segment is left alone.
 * `npm run seed` empties the CRM first, so a reseed brings the demo back.
 */

const axios = require('axios');
const db = require('../src/config/db');

const PASSWORD = 'crystal1234';
const MARKER = 'DEMO_VIP';
const DAY = 86400000;

/* A fixed sequence, so two runs on the same data choose the same customers. */
function sequence(start) {
  let state = start;
  return function next() {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

function daysAgo(days) { return new Date(Date.now() - days * DAY).toISOString(); }
function daysAhead(days) { return new Date(Date.now() + days * DAY).toISOString(); }
function data(response) { return response.data.data; }
function rowsOf(payload) { return Array.isArray(payload) ? payload : ((payload && payload.rows) || []); }

/** A job title's id, adding the title to the job list when the demo uses one it does not have. */
async function jobTitleId(name) {
  const found = await db('crm_job_title').whereRaw('lower(job_name) = lower(?)', [name]).first('job_title_id');
  if (found) return found.job_title_id;
  const code = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 30);
  const [row] = await db('crm_job_title').insert({ job_code: code, job_name: name, sort_order: 100 }).returning('job_title_id');
  return typeof row === 'object' ? row.job_title_id : row;
}

/** Who signs in, what the CRM's vocabularies are, and the customers the demo works with. */
async function buildContext(signIn) {
  const admin = await signIn('admin');
  const ops = await signIn('ops');
  const branch = await signIn('branch');
  const random = sequence(20261001);
  const pick = function (list) { return list[Math.floor(random() * list.length)]; };
  const meta = data(await admin.get('/crm/meta'));
  const byCode = function (listName, field, code) {
    return (meta[listName] || []).filter(function (row) { return row[field] === code; })[0] || {};
  };
  const people = await db('crm_party as party').join('crm_person as person', 'person.party_pk', 'party.party_pk')
    .where('party.party_status', 'ACTIVE').whereNot('party.display_name', 'like', 'CHK%')
    .orderBy('party.party_pk').select('party.party_pk', 'party.display_name');
  return {
    admin: admin, ops: ops, branch: branch, random: random, pick: pick, meta: meta, byCode: byCode, people: people,
    projectId: function (code) { return byCode('projects', 'project_code', code).project_id; },
    channelId: function (code) { return byCode('channels', 'channel_code', code).channel_id; },
    purposeId: function (code) { return byCode('communication_purposes', 'purpose_code', code).purpose_id; },
    activityPoints: byCode('point_types', 'point_type_code', 'ACTIVITY')
  };
}

async function run(options) {
  const log = (options && options.log) || console.log;
  const app = require('../app');
  const server = await new Promise(function (resolve) { const listening = app.listen(0, function () { resolve(listening); }); });
  const apiBase = 'http://127.0.0.1:' + server.address().port + require('../src/config').apiPrefix + '/admin';
  const warnings = [];

  async function signIn(username) {
    const session = data(await axios.post(apiBase + '/auth/login', { username: username, password: PASSWORD }));
    return axios.create({ baseURL: apiBase, timeout: 120000, headers: { Authorization: 'Bearer ' + session.token } });
  }

  /* One step that may be refused by a rule the data does not meet; the rest of the demo carries on. */
  async function attempt(label, step) {
    try {
      return await step();
    } catch (error) {
      const message = error.response && error.response.data ? error.response.data.message : error.message;
      warnings.push(label + ': ' + message);
      return null;
    }
  }

  /* Basic data outlives a reseed; reuse a row that is already there rather than adding it twice. */
  async function existingOr(table, codeColumn, code, create) {
    const found = await db(table).where(codeColumn, code).first();
    return found || attempt(table + ' ' + code, create);
  }

  try {
    const already = await db('crm_segment').where('segment_code', MARKER).first();
    const context = await buildContext(signIn);
    const { admin, ops, branch, random, pick, meta, byCode, projectId, channelId, purposeId, activityPoints, people } = context;
    if (people.length < 10) { log('CRM demo: fewer than ten customers - run the imports first'); return { skipped: true }; }

    /* Loaded before the Customer 360 record existed: add only what the record needs. */
    if (already) {
      const added = await customer360Demo(context, attempt);
      if (added) await attempt('analysis', function () { return admin.post('/crm/analysis/run'); });
      log('CRM demo: ' + (added ? 'customer 360 data added: ' + JSON.stringify(added) : 'already loaded, nothing added'));
      if (warnings.length) log('CRM demo: ' + warnings.length + ' steps were refused:\n  ' + warnings.join('\n  '));
      return { summary: added, warnings: warnings };
    }

    const summary = {};

    /* ---------------------------------------------------------------- basic data */

    const industryRows = {};
    const industries = [
      ['ELECTRONICS', 'Electronics', null], ['ELECTRONICS_RETAIL', 'Electronics retail', 'ELECTRONICS'],
      ['REPAIR_SERVICES', 'Repair services', 'ELECTRONICS'], ['TELECOM', 'Telecommunications', null],
      ['LOGISTICS', 'Logistics and delivery', null], ['EDUCATION', 'Education', null], ['HOSPITALITY', 'Hotels and hospitality', null]
    ];
    for (const [code, name, parentCode] of industries) {
      // eslint-disable-next-line no-await-in-loop
      industryRows[code] = await existingOr('crm_industry', 'industry_code', code, async function () {
        return data(await admin.post('/crm/settings/industries', {
          industry_code: code, industry_name: name, parent_industry_id: parentCode ? industryRows[parentCode].industry_id : null, is_active: true
        }));
      });
    }

    const issueRows = {};
    const issues = [
      ['HARDWARE', 'Hardware fault', null], ['SCREEN', 'Screen and touch', 'HARDWARE'], ['BATTERY', 'Battery and charging', 'HARDWARE'],
      ['SOFTWARE', 'Software problem', null], ['UPDATE', 'Failed update', 'SOFTWARE'], ['ACCOUNT', 'Account and sign-in', 'SOFTWARE'],
      ['SERVICE_QUALITY', 'Service quality', null], ['DELAY', 'Repair took too long', 'SERVICE_QUALITY'], ['STAFF', 'Staff behaviour', 'SERVICE_QUALITY'],
      ['DELIVERY', 'Order and delivery', null]
    ];
    for (const [code, name, parentCode] of issues) {
      // eslint-disable-next-line no-await-in-loop
      issueRows[code] = await existingOr('crm_issue_category', 'category_code', code, async function () {
        return data(await admin.post('/crm/settings/issue-categories', {
          category_code: code, display_name: name, parent_issue_category_id: parentCode ? issueRows[parentCode].issue_category_id : null, is_active: true
        }));
      });
    }

    const rootCauses = [];
    for (const [code, name] of [['WEAR', 'Normal wear'], ['USER_DAMAGE', 'Accidental damage'], ['MANUFACTURING', 'Manufacturing defect'],
      ['WATER', 'Liquid damage'], ['FIRMWARE', 'Firmware bug'], ['PROCESS', 'Our process failed']]) {
      // eslint-disable-next-line no-await-in-loop
      const created = await existingOr('crm_root_cause', 'root_cause_code', code, async function () {
        return data(await admin.post('/crm/settings/root-causes', { root_cause_code: code, display_name: name, is_active: true }));
      });
      if (created) rootCauses.push(created);
    }

    const resolutions = [];
    for (const [code, name] of [['PART_REPLACED', 'Part replaced'], ['REFLASHED', 'Software reinstalled'], ['DEVICE_SWAPPED', 'Device exchanged'],
      ['REFUNDED', 'Refunded'], ['ADVICE', 'Advice given'], ['NO_FAULT', 'No fault found']]) {
      // eslint-disable-next-line no-await-in-loop
      const created = await existingOr('crm_resolution_category', 'resolution_code', code, async function () {
        return data(await admin.post('/crm/settings/resolution-categories', { resolution_code: code, display_name: name, is_active: true }));
      });
      if (created) resolutions.push(created);
    }

    const smartphoneClass = byCode('product_classes', 'class_code', 'SMARTPHONE');
    const questions = [
      { question_code: 'WHERE_BOUGHT', question_label: 'Where did you buy this phone?', answer_type: 'SINGLE', sort_order: 1, is_required: true,
        options: ['Service centre', 'Partner shop', 'Eshop', 'A gift'] },
      { question_code: 'USED_FOR', question_label: 'What will you use it for most?', answer_type: 'MULTIPLE', sort_order: 2,
        options: ['Calls and messages', 'Photos and video', 'Games', 'Work'] },
      { question_code: 'HAPPY', question_label: 'Are you happy with the purchase?', answer_type: 'RATING', sort_order: 3, options: ['Yes', 'No'] }
    ];
    for (const question of questions) {
      // eslint-disable-next-line no-await-in-loop
      await existingOr('crm_registration_question', 'question_code', question.question_code, async function () {
        const created = data(await admin.post('/crm/settings/registration-questions', {
          question_code: question.question_code, question_label: question.question_label, answer_type: question.answer_type,
          project_id: projectId('CRYSTAL'), product_class_id: smartphoneClass.product_class_id || null,
          is_required: !!question.is_required, sort_order: question.sort_order, is_active: true
        }));
        await db('crm_registration_question_option').insert(question.options.map(function (label, position) {
          return { question_id: created.question_id, option_label: label, sort_order: position + 1 };
        }));
      });
    }
    /* What customers answered when they registered - the apps would send these. */
    await attempt('registration answers', async function () {
      const firstQuestion = await db('crm_registration_question').where('question_code', 'WHERE_BOUGHT').first();
      if (!firstQuestion) return;
      const answerOptions = await db('crm_registration_question_option').where('question_id', firstQuestion.question_id).orderBy('sort_order');
      const registrations = await db('crm_product_registration').orderBy('product_registration_id').limit(40).select('product_registration_id');
      await db('crm_registration_answer').insert(registrations.map(function (registration) {
        return { product_registration_id: registration.product_registration_id, question_id: firstQuestion.question_id, option_id: pick(answerOptions).option_id };
      }));
    });
    summary.basicData = 'industries, issue categories, root causes, resolutions, registration questions';

    /* Who works where: the four console accounts, and the department each role is meant for. */
    const departmentId = function (code) { return byCode('departments', 'department_code', code).department_id; };
    const staff = rowsOf(data(await admin.get('/crm/departments/staff')));
    const placement = { admin: 'IT', ops: 'OPERATIONS', branch: 'SERVICE', editor: 'MARKETING' };
    for (const member of staff) {
      if (!placement[member.username]) continue;
      // eslint-disable-next-line no-await-in-loop
      await attempt('department for ' + member.username, function () {
        return admin.put('/crm/departments/staff/' + member.manager_id, { department_id: departmentId(placement[member.username]) });
      });
    }
    const branchMember = staff.filter(function (member) { return member.username === 'branch'; })[0];
    if (branchMember) {
      await attempt('role department', function () {
        return admin.put('/crm/departments/roles/' + branchMember.role_id, { department_id: departmentId('SERVICE') });
      });
    }

    /* ---------------------------------------------------------------- organizations */

    const organizations = [
      { legal_name: 'Harbor Electronics Trading Co., Ltd.', trading_name: 'Harbor Electronics', registration_number: 'BR-2018-00412',
        website_url: 'https://harbor-electronics.example', founded_date: '2018-03-12', mobile: '+86 138 0000 4101', email: 'contact@harbor-electronics.example',
        types: [['SALES_AGENCY', 'ESHOP'], ['BUSINESS_CUSTOMER', null]], industry: 'ELECTRONICS_RETAIL', roles: [['OWNER', 'Management'], ['SALES_STAFF', 'Sales floor']] },
      { legal_name: 'City Repair Partners LLC', trading_name: 'City Repair Partners', registration_number: 'BR-2020-01877',
        website_url: 'https://cityrepair.example', founded_date: '2020-07-01', mobile: '+86 138 0000 4102', email: 'desk@cityrepair.example',
        types: [['SERVICE_CENTER_OPERATOR', 'CRYSTAL']], industry: 'REPAIR_SERVICES', roles: [['MANAGER', 'Workshop'], ['TECHNICIAN', 'Workshop']] },
      { legal_name: 'Northwind Logistics Group', trading_name: 'Northwind Logistics', registration_number: 'BR-2015-00093',
        website_url: 'https://northwind.example', founded_date: '2015-01-20', mobile: '+86 138 0000 4103', email: 'ops@northwind.example',
        types: [['LOGISTICS_PARTNER', 'ESHOP'], ['COLLECTION_POINT_OPERATOR', 'CRYSTAL']], industry: 'LOGISTICS', roles: [['FINANCE_CONTACT', 'Finance']] },
      { legal_name: 'Bright Future International School', trading_name: 'Bright Future School', registration_number: 'ED-2011-00007',
        website_url: 'https://brightfuture.example', founded_date: '2011-09-01', mobile: '+86 138 0000 4104', email: 'it@brightfuture.example',
        types: [['BUSINESS_CUSTOMER', null]], industry: 'EDUCATION', roles: [['PROCUREMENT_CONTACT', 'IT office']] }
    ];
    const createdOrganizations = [];
    for (const organization of organizations) {
      // eslint-disable-next-line no-await-in-loop
      const party = await attempt('organization ' + organization.trading_name, async function () {
        const created = data(await admin.post('/crm/parties', {
          party_type: 'ORGANIZATION', legal_name: organization.legal_name, trading_name: organization.trading_name,
          registration_number: organization.registration_number, website_url: organization.website_url,
          founded_date: organization.founded_date, organization_status: 'ACTIVE', mobile: organization.mobile, email: organization.email
        }));
        for (const [typeCode, projectCode] of organization.types) {
          // eslint-disable-next-line no-await-in-loop
          await admin.post('/crm/parties/' + created.party_pk + '/org-types', {
            organization_type_id: byCode('organization_types', 'type_code', typeCode).organization_type_id,
            project_id: projectCode ? projectId(projectCode) : null
          });
        }
        if (industryRows[organization.industry]) {
          await admin.put('/crm/parties/' + created.party_pk + '/industries', { industry_id: industryRows[organization.industry].industry_id, is_primary: true });
        }
        for (const [roleCode, departmentName] of organization.roles) {
          // eslint-disable-next-line no-await-in-loop
          await admin.post('/crm/parties/' + created.party_pk + '/people', {
            person_party_pk: pick(people).party_pk, department_name: departmentName,
            contact_role_ids: [byCode('contact_roles', 'role_code', roleCode).contact_role_id]
          });
        }
        return created;
      });
      if (party) createdOrganizations.push(party);
    }
    /* The partner shops are run by the first two organizations. */
    const partnerShops = await db('crm_service_center').where('service_center_kind', 'PARTNER_SHOP').orderBy('service_center_id').select('service_center_id');
    for (let position = 0; position < partnerShops.length && createdOrganizations.length; position += 1) {
      const operator = createdOrganizations[position % Math.min(2, createdOrganizations.length)];
      // eslint-disable-next-line no-await-in-loop
      await attempt('site operator', function () {
        return admin.put('/crm/sites/' + partnerShops[position].service_center_id, { operator_party_pk: operator.party_pk });
      });
    }
    summary.organizations = createdOrganizations.length;

    /* ---------------------------------------------------------------- consents */

    /*
     * What customers ticked in the apps and on the web, over the last year. A
     * customer answers for the projects they have an account in, plus the
     * platform. Most say yes; some say no; a few said yes and later withdrew -
     * which is what lets a campaign show every reason it skips somebody.
     */
    const consentCount = await attempt('consents', async function () {
      const options = await db('crm_project_communication_option as option')
        .join('crm_communication_channel as channel', 'channel.channel_id', 'option.channel_id')
        .where('option.consent_required', true).where('option.is_enabled', true)
        .select('option.project_communication_option_id', 'option.project_id', 'channel.channel_code');
      const platformId = projectId('PLATFORM');
      const accounts = await db('crm_project_account').whereNull('unlinked_at').select('party_pk', 'project_id');
      const projectsOf = {};
      accounts.forEach(function (account) { (projectsOf[account.party_pk] = projectsOf[account.party_pk] || {})[account.project_id] = true; });
      const contacts = await db('crm_contact_point').where('status', 'ACTIVE').select('contact_point_id', 'party_pk', 'contact_type');
      const contactOf = {};
      contacts.forEach(function (contact) { contactOf[contact.party_pk + ':' + contact.contact_type] = contactOf[contact.party_pk + ':' + contact.contact_type] || contact.contact_point_id; });

      let written = 0;
      for (const person of people) {
        for (const option of options) {
          const inProject = option.project_id === platformId || (projectsOf[person.party_pk] || {})[option.project_id];
          if (!inProject || random() < 0.2) continue;
          const contactType = { EMAIL: 'EMAIL', SMS: 'MOBILE' }[option.channel_code];
          const roll = random();
          const finalStatus = roll < 0.72 ? 'GRANTED' : (roll < 0.88 ? 'DENIED' : 'WITHDRAWN');
          const capturedAt = daysAgo(20 + Math.floor(random() * 380));
          // eslint-disable-next-line no-await-in-loop
          const [consent] = await db('crm_party_communication_consent').insert({
            party_pk: person.party_pk, project_communication_option_id: option.project_communication_option_id,
            contact_point_id: contactType ? (contactOf[person.party_pk + ':' + contactType] || null) : null,
            consent_status: finalStatus, captured_via: pick(['APP', 'WEB', 'APP', 'IMPORT']), captured_at: capturedAt, effective_from: capturedAt
          }).onConflict(['party_pk', 'project_communication_option_id']).ignore().returning('*');
          if (!consent) continue;
          const events = finalStatus === 'WITHDRAWN'
            ? [{ old_status: null, new_status: 'GRANTED', occurred_at: daysAgo(400) }, { old_status: 'GRANTED', new_status: 'WITHDRAWN', occurred_at: capturedAt }]
            : [{ old_status: null, new_status: finalStatus, occurred_at: capturedAt }];
          // eslint-disable-next-line no-await-in-loop
          await db('crm_consent_event').insert(events.map(function (event) {
            return Object.assign({ party_communication_consent_id: consent.party_communication_consent_id, changed_by_type: 'PARTY', reason: 'Answered in the app' }, event);
          }));
          written += 1;
        }
      }
      return written;
    });
    /* And one a manager changed, on the phone, with the reason the console asks for. */
    await attempt('consent by a manager', async function () {
      const crystalMarketingEmail = await db('crm_project_communication_option')
        .where({ project_id: projectId('CRYSTAL'), purpose_id: purposeId('MARKETING'), channel_id: channelId('EMAIL') }).first();
      if (!crystalMarketingEmail) return null;
      return admin.put('/crm/parties/' + people[0].party_pk + '/consents', {
        project_communication_option_id: crystalMarketingEmail.project_communication_option_id,
        consent_status: 'WITHDRAWN', reason: 'Customer called the hotline and asked to stop marketing emails'
      });
    });
    summary.consents = consentCount;

    /* ---------------------------------------------------------------- customers: a likely duplicate */

    await attempt('possible duplicate', async function () {
      const withMobile = await db('crm_contact_point as contact').join('crm_party as party', 'party.party_pk', 'contact.party_pk')
        .where({ 'contact.contact_type': 'MOBILE', 'contact.status': 'ACTIVE', 'party.party_status': 'ACTIVE', 'party.party_type': 'PERSON' })
        .whereNot('party.display_name', 'like', 'CHK%').orderBy('party.party_pk', 'desc').first('contact.contact_value', 'party.display_name');
      if (!withMobile) return;
      // A 65-point match waits in intake without creating a second party.
      await admin.post('/crm/parties', {
        party_type: 'PERSON', full_name: withMobile.display_name, mobile: withMobile.contact_value
      });
    });

    /* ---------------------------------------------------------------- service cases */

    const imported = rowsOf(data(await admin.get('/crm/cases', { params: { limit: 80, sort: 'received_at', dir: 'desc' } })));
    const hardwareIssues = ['SCREEN', 'BATTERY', 'UPDATE', 'HARDWARE'].map(function (code) { return issueRows[code]; }).filter(Boolean);
    let classified = 0;
    for (const serviceCase of imported.slice(0, 60)) {
      // eslint-disable-next-line no-await-in-loop
      const saved = await attempt('classify case ' + serviceCase.case_id, function () {
        return admin.put('/crm/cases/' + serviceCase.case_id + '/classification', {
          issue_category_id: hardwareIssues.length ? pick(hardwareIssues).issue_category_id : null,
          fault_category_id: (meta.fault_categories || []).length ? pick(meta.fault_categories).fault_category_id : null,
          root_cause_id: rootCauses.length ? pick(rootCauses).root_cause_id : null,
          resolution_category_id: resolutions.length ? pick(resolutions).resolution_category_id : null,
          resolution_text: pick(['Replaced the display assembly and tested.', 'Battery swapped; charge cycle verified.',
            'Reinstalled firmware 4.2 and restored the customer data.', 'No fault found after a 24-hour soak test.'])
        });
      });
      if (saved) classified += 1;
    }

    const caseType = function (code) { return byCode('case_types', 'case_type_code', code).case_type_id; };
    const statusId = function (code) { return byCode('service_statuses', 'status_code', code).service_status_id; };
    const priorityId = function (code) { return byCode('priorities', 'priority_code', code).service_priority_id; };
    const serviceCentres = await db('crm_service_center').where({ service_center_kind: 'SERVICE_CENTER', status: 'ACTIVE' })
      .orderBy('service_center_id').limit(12).select('service_center_id', 'service_center_name');
    const newCases = [
      ['COMPLAINT', 'CRYSTAL', 'HIGH', 'DIAGNOSING', 'PHONE', 'Repair took three weeks and the screen still flickers', 'DELAY'],
      ['COMPLAINT', 'CRYSTAL', 'URGENT', 'RECEIVED', 'WALK_IN', 'Staff refused a warranty repair at the counter', 'STAFF'],
      ['INQUIRY', 'CRYSTAL', 'NORMAL', 'CLOSED', 'APP', 'Is the Phone 9 covered for water damage?', null],
      ['SOFTWARE_SUPPORT', 'APPSTORE', 'NORMAL', 'IN_REPAIR', 'WEB', 'Karaoke licence not recognised after the update', 'ACCOUNT'],
      ['RETURN_SUPPORT', 'ESHOP', 'HIGH', 'WAITING_APPROVAL', 'APP', 'Order arrived with a cracked box - wants a return', 'DELIVERY'],
      ['INQUIRY', 'ESHOP', 'LOW', 'CLOSED', 'PHONE', 'When will LV3 members get the new coupon?', null],
      ['COMPLAINT', 'ESHOP', 'NORMAL', 'CLOSED', 'WEB', 'Refund was smaller than the price paid', 'DELIVERY'],
      ['INSTALLATION', 'CRYSTAL', 'NORMAL', 'READY', 'ON_SITE', 'Set-top box installation at home', null]
    ];
    let opened = 0;
    for (const [typeCode, projectCode, priorityCode, statusCode, channelCode, title, issueCode] of newCases) {
      // eslint-disable-next-line no-await-in-loop
      const created = await attempt('case ' + title, async function () {
        const caseRow = data(await admin.post('/crm/cases', {
          party_pk: pick(people).party_pk, project_id: projectId(projectCode), case_type_id: caseType(typeCode),
          service_priority_id: priorityId(priorityCode), reception_channel_code: channelCode, title: title,
          service_center_id: projectCode === 'CRYSTAL' && serviceCentres.length ? pick(serviceCentres).service_center_id : null,
          received_at: daysAgo(2 + Math.floor(random() * 40))
        }));
        if (statusCode !== 'RECEIVED') await admin.put('/crm/cases/' + caseRow.case_id, { service_status_id: statusId(statusCode) });
        if (issueCode && issueRows[issueCode]) {
          await admin.put('/crm/cases/' + caseRow.case_id + '/classification', {
            issue_category_id: issueRows[issueCode].issue_category_id,
            root_cause_id: rootCauses.length ? pick(rootCauses).root_cause_id : null,
            resolution_category_id: statusCode === 'CLOSED' && resolutions.length ? pick(resolutions).resolution_category_id : null
          });
        }
        return caseRow;
      });
      if (created) opened += 1;
    }
    summary.cases = classified + ' classified, ' + opened + ' opened';

    /* ---------------------------------------------------------------- points */

    let adjustments = 0;
    for (const [partyRow, delta, reason] of [
      [people[1], 300, 'Goodwill for the delayed repair'], [people[2], 150, 'Hotline survey completed'],
      [people[3], 500, 'Store opening promotion'], [people[4], 200, 'Referred a friend'], [people[5], 100, 'Birthday gift']]) {
      // eslint-disable-next-line no-await-in-loop
      const adjusted = await attempt('points for ' + partyRow.display_name, function () {
        return admin.post('/crm/point-adjustments', { party_pk: partyRow.party_pk, point_type_id: activityPoints.point_type_id, points_delta: delta, description: reason });
      });
      if (adjusted) adjustments += 1;
    }
    summary.points = adjustments + ' adjustments';

    /* ---------------------------------------------------------------- products: transfers */

    const owned = rowsOf(data(await admin.get('/crm/registrations', { params: { current: 1, relationship_code: 'OWNER', limit: 30 } })));
    let transfers = 0;
    for (let position = 0; position < Math.min(4, owned.length); position += 1) {
      const registration = owned[position];
      const receiver = people.filter(function (person) { return person.party_pk !== registration.party_pk; })[position * 3 % (people.length - 1)];
      const kind = position < 2 ? 'OWNERSHIP_TRANSFER' : 'ASSIGN_USER';
      // eslint-disable-next-line no-await-in-loop
      const requested = await attempt('transfer ' + registration.product_registration_id, async function () {
        const transfer = data(await admin.post('/crm/transfers', {
          product_instance_id: registration.product_instance_id, transfer_kind: kind, to_party_pk: receiver.party_pk,
          note: kind === 'OWNERSHIP_TRANSFER' ? 'Sold to a family member' : 'Phone given to a child'
        }));
        if (position % 2 === 1) await admin.post('/crm/transfers/' + transfer.product_transfer_id + '/status', { status: 'COMPLETED' });
        return transfer;
      });
      if (requested) transfers += 1;
    }
    summary.transfers = transfers;

    /* ---------------------------------------------------------------- memberships */

    const eshopMembers = rowsOf(data(await admin.get('/crm/memberships', { params: { project_id: projectId('ESHOP'), limit: 60 } })));
    const eshopTiers = (meta.project_tiers || []).filter(function (tier) { return tier.project_id === projectId('ESHOP'); })
      .sort(function (first, second) { return first.rank_no - second.rank_no; });
    let tierChanges = 0;
    for (const membership of eshopMembers) {
      if (tierChanges >= 3) break;
      const current = eshopTiers.findIndex(function (tier) { return tier.project_tier_id === membership.current_tier_id; });
      const next = eshopTiers[Math.min(eshopTiers.length - 1, current + 1)] || eshopTiers[0];
      if (!next || next.project_tier_id === membership.current_tier_id) continue;
      // eslint-disable-next-line no-await-in-loop
      const changed = await attempt('tier change', function () {
        return admin.post('/crm/memberships/' + membership.membership_id + '/tier', {
          tier_id: next.project_tier_id, reason: 'Upgraded after the annual spend review'
        });
      });
      if (changed) tierChanges += 1;
    }
    summary.tierChanges = tierChanges;

    /* ---------------------------------------------------------------- location activity */

    const visitType = byCode('activity_types', 'activity_code', 'CUSTOMER_VISIT');
    let visits = 0;
    for (let position = 0; position < 18 && serviceCentres.length; position += 1) {
      // eslint-disable-next-line no-await-in-loop
      const recorded = await attempt('customer visit', function () {
        return branch.post('/crm/site-activities', {
          service_center_id: pick(serviceCentres).service_center_id, activity_type_id: visitType.activity_type_id,
          party_pk: pick(people).party_pk, quantity: 1, note: pick(['Asked about trade-in', 'Collected a brochure', 'Tried the new Phone 9'])
        });
      });
      if (recorded) visits += 1;
    }
    const intakeType = byCode('activity_types', 'activity_code', 'REPAIR_INTAKE');
    const monthStart = new Date(); monthStart.setDate(1);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    const isoDate = function (value) { return value.toISOString().slice(0, 10); };
    for (const centre of serviceCentres.slice(0, 5)) {
      // eslint-disable-next-line no-await-in-loop
      await attempt('site target', function () {
        return admin.post('/crm/site-targets', {
          service_center_id: centre.service_center_id, activity_type_id: intakeType.activity_type_id,
          period_start: isoDate(monthStart), period_end: isoDate(monthEnd), target_quantity: 20 + Math.floor(random() * 30),
          note: 'Monthly repair intake goal'
        });
      });
      // eslint-disable-next-line no-await-in-loop
      await attempt('site target', function () {
        return admin.post('/crm/site-targets', {
          service_center_id: centre.service_center_id, activity_type_id: visitType.activity_type_id,
          period_start: isoDate(monthStart), period_end: isoDate(monthEnd), target_quantity: 10, note: 'Walk-in visitors'
        });
      });
    }
    summary.siteActivity = visits + ' visits, targets for ' + Math.min(5, serviceCentres.length) + ' centres';

    /* ---------------------------------------------------------------- customers who drifted away */

    /*
     * Everybody the imports bring bought recently, so nobody is at risk or
     * lapsed and a win-back campaign has nobody to win back. These customers
     * shopped on the Eshop months or years ago and then stopped. Their orders
     * arrive the way the Eshop's do - through the transaction code the
     * importers use - because no console screen records a purchase.
     */
    const driftedNames = ['Lina Park', 'Omar Haddad', 'Grace Liu', 'Ivan Petrov', 'Sofia Rossi', 'Daniel Kim',
      'Mei Tanaka', 'Lucas Silva', 'Anna Novak', 'Yusuf Demir', 'Chloe Martin', 'Ravi Sharma'];
    const transactionService = require('../src/services/crm/transactions.service');
    const reporting = await db('crm_currency').where('is_reporting', true).first();
    let drifted = 0;
    for (let position = 0; position < driftedNames.length; position += 1) {
      const fullName = driftedNames[position];
      const lastOrderDaysAgo = position < 6 ? 120 + position * 35 : 400 + position * 25;
      // eslint-disable-next-line no-await-in-loop
      const customer = await attempt('drifted customer ' + fullName, async function () {
        const party = data(await admin.post('/crm/parties', {
          party_type: 'PERSON', full_name: fullName, origin_project_id: projectId('ESHOP'),
          mobile: '+86 137 ' + String(20260000 + position * 7919).slice(-8), email: fullName.toLowerCase().replace(' ', '.') + '@mail.example'
        }));
        await admin.post('/crm/parties/' + party.party_pk + '/accounts', {
          project_id: projectId('ESHOP'), external_account_id: 'demo-eshop-' + party.party_pk, external_login: fullName.split(' ')[0].toLowerCase()
        });
        await db.transaction(async function (trx) {
          for (let order = 0; order < 2 + (position % 3); order += 1) {
            const amount = 40 + Math.round(random() * 360);
            // eslint-disable-next-line no-await-in-loop
            await transactionService.upsert(trx, {
              project_id: projectId('ESHOP'), external_transaction_id: 'DEMO-' + party.party_pk + '-' + order,
              transaction_type_code: 'SALE', transaction_status: 'DELIVERED', currency_code: reporting.currency_code,
              net_amount: amount, sales_channel_code: 'ESHOP', transaction_at: daysAgo(lastOrderDaysAgo + order * 60),
              parties: [{ party_pk: party.party_pk, party_role_code: 'BUYER' }]
            }, reporting.currency_code);
          }
        });
        /* Most of them agreed to platform marketing email in the app, long ago - which is what lets the win-back reach them. */
        if (position % 4 !== 3) {
          const platformEmail = await db('crm_project_communication_option')
            .where({ project_id: projectId('PLATFORM'), purpose_id: purposeId('MARKETING'), channel_id: channelId('EMAIL') }).first();
          const emailContact = await db('crm_contact_point').where({ party_pk: party.party_pk, contact_type: 'EMAIL' }).first();
          if (platformEmail) {
            const agreedAt = daysAgo(lastOrderDaysAgo + 200);
            const [consent] = await db('crm_party_communication_consent').insert({
              party_pk: party.party_pk, project_communication_option_id: platformEmail.project_communication_option_id,
              contact_point_id: emailContact ? emailContact.contact_point_id : null, consent_status: 'GRANTED',
              captured_via: 'APP', captured_at: agreedAt, effective_from: agreedAt
            }).returning('*');
            await db('crm_consent_event').insert({
              party_communication_consent_id: consent.party_communication_consent_id, new_status: 'GRANTED',
              changed_by_type: 'PARTY', reason: 'Answered in the app', occurred_at: agreedAt
            });
          }
        }
        return party;
      });
      if (customer) drifted += 1;
    }
    summary.driftedCustomers = drifted;

    /* The segments below read the analysis, so it has to see these customers first. */
    await attempt('analysis before segments', function () { return admin.post('/crm/analysis/run'); });

    /* ---------------------------------------------------------------- segments */

    const segmentDefinitions = [
      [MARKER, 'VIP customers (AA and above)', 'Corporate grade AA or AAA across Dream.', { all: [{ field: 'corporate_grade', min_rank: 4 }] }],
      ['DEMO_AT_RISK', 'At risk or lapsed', 'Bought before but not lately - the win-back list.',
        { any: [{ field: 'activity_status', value: 'AT_RISK' }, { field: 'activity_status', value: 'LAPSED' }] }],
      ['DEMO_CROSS_SHOPPERS', 'Crystal members who buy on the Eshop', 'Members of Crystal with an Eshop purchase in the last year.',
        { all: [{ field: 'project_member', project: 'CRYSTAL' }, { field: 'bought_in_project', project: 'ESHOP', days: 365 }] }],
      ['DEMO_FREQUENT', 'Frequent buyers', 'Five or more purchases in 12 months.',
        { all: [{ field: 'snapshot', measure: 'transaction_count_12m', op: '>=', value: 5 }] }],
      ['DEMO_STB_PROSPECTS', 'Smartphone owners without a set-top box', 'Own a smartphone but no set-top box - a cross-sell list.',
        { all: [{ field: 'owns_class', class: 'SMARTPHONE', min: 1 }, { field: 'owns_no_class', class: 'STB' }] }],
      ['DEMO_EMAIL_OK', 'Agreed to Crystal marketing email', 'Consent in force for Crystal marketing by email.',
        { all: [{ field: 'consented', project: 'CRYSTAL', purpose: 'MARKETING', channel: 'EMAIL' }] }]
    ];
    const segments = {};
    for (const [code, name, description, rule] of segmentDefinitions) {
      // eslint-disable-next-line no-await-in-loop
      segments[code] = await attempt('segment ' + code, async function () {
        const segment = data(await admin.post('/crm/segments', {
          segment_code: code, segment_name: name, segment_description: description, rule_expression: rule, calculation_frequency: 'DAILY'
        }));
        await admin.post('/crm/segments/' + segment.segment_id + '/evaluate');
        return segment;
      });
    }
    summary.segments = Object.keys(segments).filter(function (code) { return segments[code]; }).length;

    /* ---------------------------------------------------------------- activity programs */

    let pickupSites = await db('crm_service_center_capability as capability').join('crm_service_center as center', 'center.service_center_id', 'capability.service_center_id')
      .where({ 'capability.capability_code': 'RESERVATION_PICKUP', 'capability.is_active': true, 'center.status': 'ACTIVE' })
      .distinct('center.service_center_id').orderBy('center.service_center_id').limit(3);
    /* No centre takes reservation pickups yet: equip two, as a manager would on the Service network screen. */
    if (!pickupSites.length) {
      for (const centre of serviceCentres.slice(0, 2)) {
        // eslint-disable-next-line no-await-in-loop
        await attempt('reservation pickup capability', function () {
          return admin.post('/crm/sites/' + centre.service_center_id + '/capabilities', { capability_code: 'RESERVATION_PICKUP', project_id: projectId('CRYSTAL') });
        });
      }
      pickupSites = serviceCentres.slice(0, 2).map(function (centre) { return { service_center_id: centre.service_center_id }; });
    }
    let prizeSites = await db('crm_service_center_capability').where({ capability_code: 'PRIZE_PICKUP', is_active: true })
      .distinct('service_center_id').orderBy('service_center_id').limit(2);
    /* No centre hands out prizes yet: equip the first pickup centre for it, as a manager would on the Service network screen. */
    if (!prizeSites.length && pickupSites.length) {
      await attempt('prize pickup capability', function () {
        return admin.post('/crm/sites/' + pickupSites[0].service_center_id + '/capabilities', { capability_code: 'PRIZE_PICKUP', project_id: projectId('CRYSTAL') });
      });
      prizeSites = [{ service_center_id: pickupSites[0].service_center_id }];
    }

    /* 1. A launch reservation: owners of a smartphone reserve the new model, collect it at a centre, and get a gift. */
    const launch = await attempt('launch program', async function () {
      const program = data(await admin.post('/crm/programs', {
        program_code: 'DEMO-P9-LAUNCH', program_name: 'Phone 9 launch - reserve yours first', program_type: 'RESERVATION',
        project_id: projectId('CRYSTAL'), eligibility_basis: 'PRODUCT_REGISTRATION', eligibility_rule: { product_class_code: 'SMARTPHONE', min_count: 1 },
        summary: 'Owners of a smartphone may reserve the Phone 9 before the public launch.',
        description: 'One entry per owner, two for owners of more than one device. Collect at a participating centre.',
        number_prefix: 'P9-', number_start: 1, number_end: 500, starts_at: daysAgo(10), ends_at: daysAhead(30), fulfilment_ends_at: daysAhead(45)
      }));
      const programId = program.activity_program_id;
      await admin.post('/crm/programs/' + programId + '/tiers', { tier_code: 'OWNER', tier_name: 'Owner', rank_no: 1, min_value: 1, max_value: 2, entries_per_target: 1 });
      await admin.post('/crm/programs/' + programId + '/tiers', { tier_code: 'LOYAL', tier_name: 'Loyal owner', rank_no: 2, min_value: 2, entries_per_target: 2 });
      for (const site of pickupSites) {
        // eslint-disable-next-line no-await-in-loop
        await admin.post('/crm/programs/' + programId + '/locations', { service_center_id: site.service_center_id, service_center_role: 'PICKUP' });
      }
      await admin.post('/crm/programs/' + programId + '/quotas', { entry_type: 'NORMAL', quota_count: 40 });
      await admin.post('/crm/programs/' + programId + '/rewards', {
        reward_name: 'Launch gift box', reward_type: 'PICKUP_GOODS', quantity_total: 25, unit_value: 15, currency_code: 'USD', note: 'Case and charger'
      });
      await ops.post('/crm/programs/' + programId + '/status', { status: 'APPROVED' });
      await admin.post('/crm/programs/' + programId + '/targets/build');
      let targets = rowsOf(data(await admin.get('/crm/programs/' + programId + '/targets', { params: { limit: 100 } })));
      if (targets.length < 6) {
        for (const person of people.slice(0, 10)) {
          // eslint-disable-next-line no-await-in-loop
          await attempt('launch target', function () { return admin.post('/crm/programs/' + programId + '/targets', { party_pk: person.party_pk, allowed_count: 1 }); });
        }
        targets = rowsOf(data(await admin.get('/crm/programs/' + programId + '/targets', { params: { limit: 100 } })));
      }
      await admin.post('/crm/programs/' + programId + '/status', { status: 'TARGETS_FROZEN' });
      await admin.post('/crm/programs/' + programId + '/status', { status: 'OPEN' });

      const reward = rowsOf(data(await admin.get('/crm/programs/' + programId)).rewards)[0];
      let position = 0;
      for (const target of targets.slice(0, 12)) {
        position += 1;
        // eslint-disable-next-line no-await-in-loop
        const reservation = await attempt('reservation', async function () {
          return data(await admin.post('/crm/programs/' + programId + '/reservations', {
            party_pk: target.party_pk, holder_id_card: 'DEMO-ID-' + target.party_pk,
            service_center_id: pickupSites.length ? pickupSites[position % pickupSites.length].service_center_id : null
          }));
        });
        if (!reservation) continue;
        if (position % 4 === 1) {
          // eslint-disable-next-line no-await-in-loop
          await attempt('collect reservation', function () {
            return admin.post('/crm/reservations/' + reservation.reservation_id + '/status', {
              status: 'FULFILLED', service_center_id: reservation.service_center_id, note: 'Collected with ID'
            });
          });
          if (reward) {
            // eslint-disable-next-line no-await-in-loop
            await attempt('gift', async function () {
              const awarded = data(await admin.post('/crm/programs/' + programId + '/awards', {
                reward_id: reward.reward_id, party_pk: target.party_pk, reservation_id: reservation.reservation_id,
                fulfilment_method: 'PICKUP', pickup_service_center_id: prizeSites.length ? prizeSites[0].service_center_id : null
              }));
              await admin.post('/crm/awards/' + awarded.award_id + '/status', { status: 'READY' });
              await admin.post('/crm/awards/' + awarded.award_id + '/status', { status: 'PICKED_UP' });
            });
          }
        } else if (position % 6 === 0) {
          // eslint-disable-next-line no-await-in-loop
          await attempt('cancel reservation', function () {
            return admin.post('/crm/reservations/' + reservation.reservation_id + '/status', { status: 'CANCELLED', note: 'Customer changed their mind' });
          });
        }
      }
      return program;
    });

    /* 2. A thank-you draw for the best customers, already paid out. */
    const draw = await attempt('thank-you draw', async function () {
      const program = data(await admin.post('/crm/programs', {
        program_code: 'DEMO-VIP-DRAW', program_name: 'VIP thank-you draw', program_type: 'LOTTERY', project_id: projectId('PLATFORM'),
        eligibility_basis: 'CORPORATE_GRADE', eligibility_rule: { min_grade_rank: 4 },
        summary: 'Every AA and AAA customer is in the draw for 200 activity points.', starts_at: daysAgo(40), ends_at: daysAgo(5)
      }));
      const programId = program.activity_program_id;
      await admin.post('/crm/programs/' + programId + '/tiers', { tier_code: 'AA', tier_name: 'AA customers', rank_no: 1, min_value: 0, max_value: 80, entries_per_target: 1 });
      await admin.post('/crm/programs/' + programId + '/tiers', { tier_code: 'AAA', tier_name: 'AAA customers', rank_no: 2, min_value: 80, entries_per_target: 2 });
      const reward = data(await admin.post('/crm/programs/' + programId + '/rewards', {
        reward_name: '200 activity points', reward_type: 'POINTS', point_type_id: activityPoints.point_type_id, points: 200, quantity_total: 8
      }));
      await ops.post('/crm/programs/' + programId + '/status', { status: 'APPROVED' });
      await admin.post('/crm/programs/' + programId + '/targets/build');
      await admin.post('/crm/programs/' + programId + '/status', { status: 'TARGETS_FROZEN' });
      await admin.post('/crm/programs/' + programId + '/status', { status: 'OPEN' });
      const winners = rowsOf(data(await admin.get('/crm/programs/' + programId + '/targets', { params: { limit: 100 } })));
      for (const winner of winners.slice(0, 6)) {
        // eslint-disable-next-line no-await-in-loop
        await attempt('draw prize', function () { return admin.post('/crm/programs/' + programId + '/awards', { reward_id: reward.reward_id, party_pk: winner.party_pk }); });
      }
      await admin.post('/crm/programs/' + programId + '/status', { status: 'CLOSED' });
      await admin.post('/crm/programs/' + programId + '/status', { status: 'FULFILLED' });
      return program;
    });

    /* 3. An open day still waiting for a second manager to approve it. */
    const openDay = await attempt('open day program', async function () {
      return data(await admin.post('/crm/programs', {
        program_code: 'DEMO-OPEN-DAY', program_name: 'Service centre open day', program_type: 'EVENT_ATTENDANCE', project_id: projectId('CRYSTAL'),
        eligibility_basis: 'LOCATION_ACTIVITY', eligibility_rule: { activity_code: 'REPAIR_INTAKE', since_days: 365, min_count: 1 },
        summary: 'Customers who brought a device in this year are invited to a behind-the-scenes tour.',
        starts_at: daysAhead(14), ends_at: daysAhead(15)
      }));
    });
    summary.programs = [launch, draw, openDay].filter(Boolean).length;

    /* ---------------------------------------------------------------- campaigns */

    /*
     * The console prepares a send and checks consent; the provider sends it and
     * reports back. There is no provider in development, so its reports -
     * delivered, opened, clicked, bought - are written here the way its
     * webhook would write them.
     */
    async function providerFeedback(campaignId, actionId, label) {
      const recipients = await db('crm_campaign_recipient').where({ campaign_id: campaignId, action_id: actionId, recipient_status: 'ELIGIBLE' })
        .orderBy('recipient_id');
      let conversions = 0;
      for (let position = 0; position < recipients.length; position += 1) {
        const recipient = recipients[position];
        const sentAt = daysAgo(13);
        const failed = position % 20 === 19;
        // eslint-disable-next-line no-await-in-loop
        await db('crm_campaign_recipient').where('recipient_id', recipient.recipient_id).update(failed
          ? { recipient_status: 'FAILED', queued_at: sentAt, failed_at: sentAt, provider_message_id: 'demo-' + recipient.recipient_id }
          : { recipient_status: 'DELIVERED', queued_at: sentAt, sent_at: sentAt, delivered_at: sentAt, provider_message_id: 'demo-' + recipient.recipient_id });
        /* About two in three open it, half of those click, and one in four comes back and buys. */
        if (failed || position % 3 === 2) continue;
        const touch = { campaign_id: campaignId, action_id: actionId, recipient_id: recipient.recipient_id, party_pk: recipient.party_pk,
          utm_source: 'crm', utm_medium: 'email', utm_campaign: label };
        // eslint-disable-next-line no-await-in-loop
        await db('crm_campaign_interaction').insert([
          Object.assign({ interaction_type: 'OPEN', occurred_at: daysAgo(12), source_event_id: 'demo-' + label + '-open-' + recipient.recipient_id }, touch),
          Object.assign({ interaction_type: 'CLICK', occurred_at: daysAgo(12), interaction_url: 'https://eshop.example/offer/' + label,
            source_event_id: 'demo-' + label + '-click-' + recipient.recipient_id }, touch)
        ].slice(0, position % 2 ? 2 : 1));
        if (position % 4 !== 0) continue;
        /* The purchase they came back for arrives from the Eshop like any other order. */
        // eslint-disable-next-line no-await-in-loop
        const buyer = await db('crm_party').where('party_pk', recipient.party_pk).first('party_pk');
        // eslint-disable-next-line no-await-in-loop
        const sale = await db.transaction(function (trx) {
          return transactionService.upsert(trx, {
            project_id: projectId('ESHOP'), external_transaction_id: 'DEMO-' + buyer.party_pk + '-' + label, transaction_type_code: 'SALE',
            transaction_status: 'DELIVERED', currency_code: reporting.currency_code, net_amount: 89, sales_channel_code: 'ESHOP',
            transaction_at: daysAgo(9), parties: [{ party_pk: recipient.party_pk, party_role_code: 'BUYER' }]
          }, reporting.currency_code);
        });
        // eslint-disable-next-line no-await-in-loop
        await db('crm_campaign_conversion').insert({
          campaign_id: campaignId, action_id: actionId, recipient_id: recipient.recipient_id, party_pk: recipient.party_pk,
          conversion_type: 'PURCHASE', source_project_id: projectId('ESHOP'), related_transaction_id: sale.transaction_id,
          conversion_value: 89, currency_code: reporting.currency_code,
          attribution_model: 'LAST_TOUCH', attribution_window_days: 14, attribution_score: 1, occurred_at: daysAgo(9)
        });
        conversions += 1;
      }
      return conversions;
    }

    async function campaignWith(spec) {
      const campaign = data(await admin.post('/crm/campaigns', {
        campaign_code: spec.code, campaign_name: spec.name, campaign_type: spec.type, project_id: projectId(spec.project),
        description: spec.description, start_at: spec.startAt, end_at: spec.endAt
      }));
      const campaignId = campaign.campaign_id;
      if (spec.stage === 'DRAFT') {
        return campaign;
      }
      await ops.post('/crm/campaigns/' + campaignId + '/status', { status: 'APPROVED' });
      const segment = segments[spec.segment];
      if (!segment) return campaign;
      const audience = data(await admin.post('/crm/campaigns/' + campaignId + '/audiences', {
        audience_name: segment.segment_name, audience_type: 'SEGMENT', source_segment_id: segment.segment_id
      }));
      const action = data(await admin.post('/crm/campaigns/' + campaignId + '/actions', {
        audience_id: audience.audience_id, channel_id: channelId(spec.channel), purpose_id: purposeId(spec.purpose),
        action_name: spec.actionName, content_title: spec.title, content_body: spec.body, scheduled_at: spec.startAt
      }));
      await admin.post('/crm/campaigns/' + campaignId + '/actions/' + action.action_id + '/prepare');
      if (spec.stage === 'APPROVED') return campaign;
      await admin.post('/crm/campaigns/' + campaignId + '/status', { status: 'ACTIVE' });
      await admin.post('/crm/campaigns/' + campaignId + '/actions/' + action.action_id + '/status', { status: 'RUNNING' });
      const conversions = await providerFeedback(campaignId, action.action_id, spec.code.toLowerCase());
      for (const [costType, amount] of spec.costs) {
        // eslint-disable-next-line no-await-in-loop
        await admin.post('/crm/campaigns/' + campaignId + '/costs', { action_id: action.action_id, cost_type: costType, amount: amount, currency_code: 'USD', occurred_at: daysAgo(12) });
      }
      if (spec.stage === 'COMPLETED') {
        await admin.post('/crm/campaigns/' + campaignId + '/actions/' + action.action_id + '/status', { status: 'COMPLETE' });
        await admin.post('/crm/campaigns/' + campaignId + '/status', { status: 'COMPLETED' });
      }
      return Object.assign(campaign, { conversions: conversions });
    }

    const campaigns = [];
    for (const spec of [
      { code: 'DEMO-WINBACK', name: 'We miss you - 10% back on your next order', type: 'WIN_BACK', project: 'PLATFORM', segment: 'DEMO_AT_RISK',
        channel: 'EMAIL', purpose: 'MARKETING', stage: 'COMPLETED', startAt: daysAgo(14), endAt: daysAgo(1),
        actionName: 'Win-back email', title: 'It has been a while', body: 'Come back this month and get 10% back in points.',
        description: 'Customers who stopped buying, across every project.', costs: [['EMAIL_PROVIDER', 35], ['COUPON', 120]] },
      { code: 'DEMO-VIP-LAUNCH', name: 'Phone 9 early access for VIPs', type: 'PRODUCT_LAUNCH', project: 'CRYSTAL', segment: MARKER,
        channel: 'SMS', purpose: 'MARKETING', stage: 'ACTIVE', startAt: daysAgo(13), endAt: daysAhead(20),
        actionName: 'Launch SMS', title: 'Phone 9', body: 'VIP early access: reserve your Phone 9 before anyone else.',
        description: 'AA and AAA customers hear first.', costs: [['SMS', 18.5]] },
      { code: 'DEMO-CROSS-SELL', name: 'Eshop picks for Crystal members', type: 'PROMOTION', project: 'ESHOP', segment: 'DEMO_CROSS_SHOPPERS',
        channel: 'EMAIL', purpose: 'MARKETING', stage: 'APPROVED', startAt: daysAhead(3), endAt: daysAhead(30),
        actionName: 'Weekly picks', title: 'Picked for you', body: 'Accessories for the phone you already own.',
        description: 'Approved and prepared; not sent yet.', costs: [] },
      { code: 'DEMO-SURVEY', name: 'How was your repair?', type: 'SURVEY', project: 'CRYSTAL', stage: 'DRAFT', startAt: daysAhead(7), endAt: daysAhead(37),
        description: 'Waiting for a second manager to approve it.' }
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const campaign = await attempt('campaign ' + spec.code, function () { return campaignWith(spec); });
      if (campaign) campaigns.push(campaign);
    }
    summary.campaigns = campaigns.length;

    /* ---------------------------------------------------------------- location events */

    const eventCampaign = campaigns.filter(function (campaign) { return campaign.campaign_code === 'DEMO-VIP-LAUNCH'; })[0];
    const eventDefinitions = [
      ['PRODUCT_LAUNCH', 'Phone 9 launch day', 'CONFIRMED', 6, 120, null, { campaign_id: eventCampaign ? eventCampaign.campaign_id : null }],
      ['PROGRAM_PICKUP_DAY', 'Phone 9 reservation pickup', 'PLANNED', 12, 80, null, { activity_program_id: launch ? launch.activity_program_id : null }],
      ['PROMOTION_DAY', 'Weekend trade-in promotion', 'COMPLETED', -9, 60, 47, {}],
      ['TRAINING', 'Technician training: Phone 9 repairs', 'COMPLETED', -20, 15, 14, {}],
      ['COMMUNITY_EVENT', 'Repair cafe with Bright Future School', 'PLANNED', 21, 40, null, {}],
      ['INSPECTION', 'Quarterly quality inspection', 'CANCELLED', -3, null, null, {}]
    ];
    let events = 0;
    for (const [typeCode, title, status, startInDays, capacity, attendees, links] of eventDefinitions) {
      const centre = serviceCentres[events % Math.max(1, serviceCentres.length)];
      if (!centre) break;
      const startAt = new Date(Date.now() + startInDays * DAY);
      const endAt = new Date(startAt.getTime() + 6 * 3600000);
      // eslint-disable-next-line no-await-in-loop
      const created = await attempt('event ' + title, function () {
        return admin.post('/crm/site-events', Object.assign({
          service_center_id: centre.service_center_id, event_type_code: typeCode, title: title, status: status,
          project_id: projectId('CRYSTAL'), planned_start_at: startAt.toISOString(), planned_end_at: endAt.toISOString(),
          actual_start_at: status === 'COMPLETED' ? startAt.toISOString() : null, actual_end_at: status === 'COMPLETED' ? endAt.toISOString() : null,
          capacity: capacity, attendee_count: attendees,
          outcome_note: status === 'COMPLETED' ? 'Busy all day; most visitors asked about trade-in prices.' : null
        }, links));
      });
      if (created) events += 1;
    }
    summary.events = events;

    summary.customer360 = JSON.stringify(await customer360Demo(context, attempt));

    /* ---------------------------------------------------------------- the analysis, over all of it */

    const analysed = await attempt('analysis', async function () { return data(await admin.post('/crm/analysis/run')); });
    summary.analysis = analysed ? analysed.snapshots + ' snapshots' : 'not run';

    log('CRM demo: ' + Object.keys(summary).map(function (key) { return key + ' ' + summary[key]; }).join(', '));
    if (warnings.length) log('CRM demo: ' + warnings.length + ' steps were refused:\n  ' + warnings.join('\n  '));
    return { summary: summary, warnings: warnings };
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
  }
}

/**
 * WHAT THE CUSTOMER 360 RECORD SHOWS THAT THE REST OF THE DEMO DOES NOT:
 * profiles filled in, tags, family and referral links, a corporate group,
 * account teams and contracts, organizations that buy and own products,
 * logged calls and messages, notes and documents.
 *
 * Through the API like the rest. The organizations' orders arrive the way the
 * Eshop's do (transactions.service), and a customer's preferred channel is
 * what they chose in the app, so both are written to the tables.
 *
 * Runs once: a database where any customer already has a tag is left alone.
 */
async function customer360Demo(context, attempt) {
  if (await db('crm_party_tag').first()) return null;
  const { admin, ops, random, people, projectId, channelId, purposeId } = context;
  const meta = data(await admin.get('/crm/meta'));
  const added = {};
  const tagId = function (code) { return ((meta.tags || []).filter(function (tag) { return tag.tag_code === code; })[0] || {}).tag_id; };
  const roleId = function (code) { return ((meta.contact_roles || []).filter(function (role) { return role.role_code === code; })[0] || {}).contact_role_id; };
  const staffId = function (name) { return ((meta.staff || []).filter(function (member) { return member.name === name; })[0] || {}).manager_id; };
  const managers = await db('managers').whereIn('username', ['admin', 'ops', 'branch']).select('id', 'username');
  const managerId = function (username) { return (managers.filter(function (manager) { return manager.username === username; })[0] || {}).id || staffId(username); };

  /* ---- profiles: what a member fills in on their account page ---- */
  const titles = ['Software engineer', 'Teacher', 'Store manager', 'Designer', 'Nurse', 'Sales manager', 'Student', 'Accountant'];
  const streets = ['12 Huaihai Road, Xuhui', '88 Nanjing West Road, Jing\'an', '5 Zhongshan Avenue, Tianhe', '301 Renmin Road, Wuhou',
    '17 Jianguo Road, Chaoyang', '46 Dongfeng Road, Futian'];
  let profiles = 0;
  for (let position = 0; position < Math.min(30, people.length); position += 1) {
    const person = await db('crm_person').where('party_pk', people[position].party_pk).first();
    if (!person) continue;
    const patch = {};
    if (!person.gender_code) patch.gender_code = position % 2 ? 'F' : 'M';
    if (!person.birth_date) patch.birth_date = (1970 + (position * 7) % 33) + '-' + String(1 + position % 12).padStart(2, '0') + '-' + String(1 + (position * 3) % 27).padStart(2, '0');
    // eslint-disable-next-line no-await-in-loop
    if (!person.job_title_id) patch.job_title_id = await jobTitleId(titles[position % titles.length]);
    if (!person.address_line) patch.address_line = streets[position % streets.length];
    if (!Object.keys(patch).length) continue;
    // eslint-disable-next-line no-await-in-loop
    if (await attempt('profile', function () { return admin.put('/crm/parties/' + person.party_pk, patch); })) profiles += 1;
  }
  added.profiles = profiles;

  /* ---- tags, from what the CRM already knows about each customer ---- */
  const graded = await db('crm_party_analysis_snapshot as snapshot').join('crm_corporate_grade as grade', 'grade.corporate_grade_id', 'snapshot.corporate_grade_id')
    .whereNull('snapshot.project_id').where('snapshot.reference_date', db('crm_party_analysis_snapshot').max('reference_date'))
    .whereIn('snapshot.party_pk', people.map(function (person) { return person.party_pk; }))
    .orderBy('snapshot.corporate_score', 'desc').select('snapshot.party_pk', 'grade.grade_code', 'snapshot.purchase_amount_12m', 'snapshot.registered_device_count', 'snapshot.complaint_count_12m');
  const tagPlan = [];
  graded.forEach(function (row, position) {
    if (row.grade_code === 'AAA') tagPlan.push([row.party_pk, 'VIP']);
    if (position < 12) tagPlan.push([row.party_pk, 'HIGH_VALUE']);
    if (Number(row.registered_device_count) >= 3) tagPlan.push([row.party_pk, 'TECH_ENTHUSIAST']);
    if (Number(row.complaint_count_12m) > 0) tagPlan.push([row.party_pk, 'NEEDS_ATTENTION']);
    if (position % 9 === 4) tagPlan.push([row.party_pk, 'PRICE_SENSITIVE']);
  });
  (await db('crm_activity_reservation').distinct('party_pk').limit(8)).forEach(function (row) { tagPlan.push([row.party_pk, 'EARLY_ADOPTER']); });
  let tagged = 0;
  for (const [partyId, code] of tagPlan) {
    if (!tagId(code)) continue;
    // eslint-disable-next-line no-await-in-loop
    if (await attempt('tag', function () { return admin.post('/crm/parties/' + partyId + '/tags', { tag_id: tagId(code) }); })) tagged += 1;
  }
  added.tags = tagged;

  /* ---- people related to each other ---- */
  let relationships = 0;
  const relate = async function (partyId, relatedId, code, note) {
    if (await attempt('relationship ' + code, function () {
      return admin.post('/crm/parties/' + partyId + '/relationships', { related_party_pk: relatedId, relationship_type_code: code, note: note || null });
    })) relationships += 1;
  };
  for (let position = 0; position + 1 < Math.min(12, people.length); position += 4) {
    // eslint-disable-next-line no-await-in-loop
    await relate(people[position].party_pk, people[position + 1].party_pk, 'SPOUSE', 'Same household address');
  }
  if (people.length > 14) {
    await relate(people[13].party_pk, people[14].party_pk, 'CHILD', 'Registered the phone for their son');
    await relate(people[2].party_pk, people[9].party_pk, 'REFERRER', 'Came in with a referral code');
    await relate(people[3].party_pk, people[10].party_pk, 'REFERRER', 'Came in with a referral code');
  }

  /* ---- the organizations: profile, group, people, team, contract, purchases, products, cases ---- */
  const organizations = await db('crm_party as party').join('crm_organization as organization', 'organization.party_pk', 'party.party_pk')
    .where('party.party_status', 'ACTIVE').orderBy('party.party_pk').select('party.party_pk', 'party.display_name');
  const profileOf = {
    'Harbor Electronics': { local_name: '海港电子贸易有限公司', employee_count_band: '201-1000', headquarters_address: '1 Harbour Road, Pudong, Shanghai',
      description: 'Regional distributor and retailer of smartphones, set-top boxes and accessories, with eleven stores and an online shop. A Dream partner since 2018 and one of the largest resellers of Crystal phones in the east.' },
    'City Repair Partners': { local_name: '城市维修伙伴', employee_count_band: '51-200', headquarters_address: '220 Zhongshan Road, Guangzhou',
      description: 'Independent repair network that runs authorised Crystal service counters in shopping centres.' },
    'Northwind Logistics': { local_name: '北风物流集团', employee_count_band: '1001-5000', headquarters_address: '9 Airport Logistics Park, Shenzhen',
      description: 'Courier and warehousing group that delivers Eshop orders and runs collection points for repairs.' },
    'Bright Future School': { local_name: '光明未来国际学校', employee_count_band: '201-1000', headquarters_address: '66 Garden Road, Hangzhou',
      description: 'International school that buys tablets and licences for its students and staff every school year.' }
  };
  for (const organization of organizations) {
    if (!profileOf[organization.display_name]) continue;
    // eslint-disable-next-line no-await-in-loop
    await attempt('organization profile', function () { return admin.put('/crm/parties/' + organization.party_pk, profileOf[organization.display_name]); });
  }
  const harbor = organizations.filter(function (row) { return row.display_name === 'Harbor Electronics'; })[0];
  const northwind = organizations.filter(function (row) { return row.display_name === 'Northwind Logistics'; })[0];
  const cityRepair = organizations.filter(function (row) { return row.display_name === 'City Repair Partners'; })[0];
  const school = organizations.filter(function (row) { return row.display_name === 'Bright Future School'; })[0];

  /* A group: Harbor Holdings over Harbor Electronics and a new Harbor Online, Northwind an affiliate, City Repair a partner. */
  const holdings = await attempt('group company', async function () {
    return data(await admin.post('/crm/parties', {
      party_type: 'ORGANIZATION', legal_name: 'Harbor Holdings Group Co., Ltd.', trading_name: 'Harbor Holdings', local_name: '海港控股集团',
      registration_number: 'BR-2009-00051', employee_count_band: '5001+', website_url: 'https://harbor-holdings.example',
      founded_date: '2009-06-01', organization_status: 'ACTIVE', headquarters_address: '1 Harbour Road, Pudong, Shanghai',
      description: 'Holding company of the Harbor retail and online businesses.', mobile: '+86 21 5000 1000', email: 'office@harbor-holdings.example'
    }));
  });
  const online = await attempt('subsidiary', async function () {
    return data(await admin.post('/crm/parties', {
      party_type: 'ORGANIZATION', legal_name: 'Harbor Online Commerce Co., Ltd.', trading_name: 'Harbor Online', local_name: '海港在线',
      registration_number: 'BR-2021-00733', employee_count_band: '51-200', founded_date: '2021-02-15', organization_status: 'ACTIVE',
      description: 'The group\'s web shop; resells Eshop accessories.', email: 'shop@harbor-online.example'
    }));
  });
  if (holdings && harbor) await relate(harbor.party_pk, holdings.party_pk, 'PARENT_COMPANY', 'Wholly owned');
  if (holdings && online) await relate(holdings.party_pk, online.party_pk, 'SUBSIDIARY', 'Wholly owned');
  if (harbor && northwind) await relate(harbor.party_pk, northwind.party_pk, 'AFFILIATE', 'Shared logistics contract');
  if (harbor && cityRepair) await relate(harbor.party_pk, cityRepair.party_pk, 'PARTNER', 'Repairs devices sold in Harbor stores');
  added.relationships = relationships;

  /* People who decide and buy for the organizations, with their titles. */
  const contactPlan = [
    [harbor, 16, 'CEO', ['REPRESENTATIVE', 'DECISION_MAKER'], 'Management'],
    [harbor, 17, 'IT manager', ['INFLUENCER'], 'IT'],
    [harbor, 18, 'Procurement lead', ['PURCHASING'], 'Procurement'],
    [harbor, 19, 'Store operations', ['OPERATIONAL'], 'Operations'],
    [northwind, 20, 'Account director', ['DECISION_MAKER'], 'Sales'],
    [school, 21, 'Head of IT', ['DECISION_MAKER', 'PURCHASING'], 'IT office'],
    [cityRepair, 22, 'Workshop lead', ['OPERATIONAL'], 'Workshop'],
    [holdings, 23, 'Chairman', ['REPRESENTATIVE'], 'Board']
  ];
  let linked = 0;
  for (const [organization, index, title, roles, department] of contactPlan) {
    const person = people[index % people.length];
    if (!organization || !person) continue;
    // eslint-disable-next-line no-await-in-loop
    const jobId = await jobTitleId(title);
    // eslint-disable-next-line no-await-in-loop
    await attempt('contact title', function () { return admin.put('/crm/parties/' + person.party_pk, { job_title_id: jobId }); });
    // eslint-disable-next-line no-await-in-loop
    if (await attempt('key contact', function () {
      return admin.post('/crm/parties/' + organization.party_pk + '/people', {
        person_party_pk: person.party_pk, department_name: department, contact_role_ids: roles.map(roleId).filter(Boolean)
      });
    })) linked += 1;
  }
  added.keyContacts = linked;

  /* Who looks after the organizations, and the contracts they are on. */
  let teams = 0;
  const assign = async function (party, role, username) {
    if (!party || !managerId(username)) return;
    if (await attempt('team', function () { return admin.post('/crm/parties/' + party.party_pk + '/team', { team_role: role, manager_id: managerId(username) }); })) teams += 1;
  };
  for (const organization of [harbor, holdings, northwind, school, cityRepair]) {
    // eslint-disable-next-line no-await-in-loop
    await assign(organization, 'ACCOUNT_MANAGER', 'ops');
    // eslint-disable-next-line no-await-in-loop
    await assign(organization, 'SALES_REP', 'admin');
    // eslint-disable-next-line no-await-in-loop
    await assign(organization, 'SUPPORT_MANAGER', 'branch');
  }
  for (const row of graded.slice(0, 3)) {
    // eslint-disable-next-line no-await-in-loop
    await assign({ party_pk: row.party_pk }, 'ACCOUNT_MANAGER', 'ops');
  }
  added.teamMembers = teams;

  const today = new Date();
  const isoDate = function (offsetDays) { return new Date(today.getTime() + offsetDays * DAY).toISOString().slice(0, 10); };
  const contracts = [
    [harbor, { agreement_type: 'ENTERPRISE', agreement_no: 'EA-2025-0412', title: 'Enterprise agreement 2025-2027', start_date: isoDate(-540),
      end_date: isoDate(190), renewal_date: isoDate(120), status: 'ACTIVE', annual_value: 480000, note: 'Volume pricing on Crystal phones and accessories.' }],
    [northwind, { agreement_type: 'SERVICE_LEVEL', agreement_no: 'SLA-2024-0093', title: 'Delivery and collection SLA', start_date: isoDate(-700),
      end_date: isoDate(30), renewal_date: isoDate(0), status: 'ACTIVE', annual_value: 96000 }],
    [cityRepair, { agreement_type: 'PARTNERSHIP', agreement_no: 'PA-2023-0021', title: 'Authorised repair partner', start_date: isoDate(-900), status: 'ACTIVE' }],
    [school, { agreement_type: 'PURCHASE', agreement_no: 'PO-2024-0317', title: 'Tablets for the 2024 school year', start_date: isoDate(-400),
      end_date: isoDate(-35), status: 'EXPIRED', annual_value: 52000 }]
  ];
  let agreements = 0;
  for (const [party, body] of contracts) {
    if (!party) continue;
    // eslint-disable-next-line no-await-in-loop
    if (await attempt('agreement', function () { return admin.post('/crm/parties/' + party.party_pk + '/agreements', body); })) agreements += 1;
  }
  added.agreements = agreements;

  /* Business orders on the Eshop over two years: they arrive from the Eshop like any order. */
  const transactionService = require('../src/services/crm/transactions.service');
  const reporting = await db('crm_currency').where('is_reporting', true).first();
  let businessOrders = 0;
  for (const [party, count, size] of [[harbor, 26, 9000], [northwind, 8, 2400], [school, 6, 5200], [cityRepair, 10, 1500], [online, 5, 900]]) {
    if (!party) continue;
    const buyer = await db('crm_party').where('party_pk', party.party_pk).first('party_pk');
    await db.transaction(async function (trx) {
      for (let order = 0; order < count; order += 1) {
        const daysBack = Math.round((order / count) * 700) + 3;
        // eslint-disable-next-line no-await-in-loop
        await transactionService.upsert(trx, {
          project_id: projectId('ESHOP'), external_transaction_id: 'B2B-' + buyer.party_pk + '-' + order, transaction_type_code: 'SALE',
          transaction_status: order === 3 ? 'CANCELLED' : 'DELIVERED', currency_code: reporting.currency_code,
          net_amount: Math.round(size * (0.6 + random() * 0.8)), sales_channel_code: 'ESHOP', transaction_at: new Date(today.getTime() - daysBack * DAY).toISOString(),
          parties: [{ party_pk: party.party_pk, party_role_code: 'BUYER' }]
        }, reporting.currency_code);
        businessOrders += 1;
      }
    });
  }
  added.businessOrders = businessOrders;

  /* Their business accounts on the Eshop, and how staff label them. */
  for (const [party, tagCodes] of [[harbor, ['KEY_ACCOUNT', 'STRATEGIC_ACCOUNT']], [holdings, ['STRATEGIC_ACCOUNT']],
    [northwind, ['KEY_ACCOUNT']], [school, ['PRICE_SENSITIVE']], [online, []], [cityRepair, []]]) {
    if (!party) continue;
    const owner = await db('crm_party').where('party_pk', party.party_pk).first('party_pk');
    await attempt('business account', function () {
      return admin.post('/crm/parties/' + party.party_pk + '/accounts', {
        project_id: projectId('ESHOP'), external_account_id: 'B2B-' + owner.party_pk, external_login: 'b2b-' + owner.party_pk
      });
    });
    for (const code of tagCodes) {
      // eslint-disable-next-line no-await-in-loop
      await attempt('organization tag', function () { return admin.post('/crm/parties/' + party.party_pk + '/tags', { tag_id: tagId(code) }); });
    }
  }

  /* Devices registered to the organizations, and the cases they raised. */
  const catalogue = await db('crm_product_catalog').where({ project_id: projectId('CRYSTAL'), status: 'ACTIVE' })
    .whereNot('product_name', 'like', 'CHK%').orderBy('product_id').limit(4).select('product_id', 'product_name');
  let assets = 0;
  for (const [party, count, prefix] of [[harbor, 6, 'HB'], [school, 5, 'BF'], [northwind, 3, 'NW']]) {
    if (!party || !catalogue.length) continue;
    for (let unit = 0; unit < count; unit += 1) {
      // eslint-disable-next-line no-await-in-loop
      if (await attempt('organization asset', function () {
        return admin.post('/crm/registrations', {
          party_pk: party.party_pk, product_id: catalogue[unit % catalogue.length].product_id,
          serial_number: 'DEMO-' + prefix + '-' + String(1001 + unit), relationship_code: 'OWNER'
        });
      })) assets += 1;
    }
  }
  added.organizationAssets = assets;

  const caseType = function (code) { return ((meta.case_types || []).filter(function (type) { return type.case_type_code === code; })[0] || {}).case_type_id; };
  const statusId = function (code) { return ((meta.service_statuses || []).filter(function (status) { return status.status_code === code; })[0] || {}).service_status_id; };
  let organizationCases = 0;
  for (const [party, typeCode, title, statusCode] of [
    [harbor, 'SOFTWARE_SUPPORT', 'Licence keys not activating on 20 store demo phones', 'DIAGNOSING'],
    [harbor, 'WARRANTY_REPAIR', 'Batch of 6 phones with charging faults', 'IN_REPAIR'],
    [harbor, 'INQUIRY', 'Request for the 2027 price list', 'CLOSED'],
    [school, 'RETURN_SUPPORT', 'Two tablets dead on arrival', 'CLOSED'],
    [northwind, 'COMPLAINT', 'Collection point scanner keeps rejecting labels', 'RECEIVED']
  ]) {
    if (!party) continue;
    // eslint-disable-next-line no-await-in-loop
    const created = await attempt('organization case', async function () {
      const serviceCase = data(await admin.post('/crm/cases', {
        party_pk: party.party_pk, project_id: projectId('CRYSTAL'), case_type_id: caseType(typeCode), title: title,
        reception_channel_code: 'PHONE', received_at: new Date(today.getTime() - (5 + organizationCases * 9) * DAY).toISOString()
      }));
      if (statusCode !== 'RECEIVED') await admin.put('/crm/cases/' + serviceCase.case_id, { service_status_id: statusId(statusCode) });
      return serviceCase;
    });
    if (created) organizationCases += 1;
  }
  added.organizationCases = organizationCases;

  /* ---- calls, emails and chats, logged by the agents who had them ---- */
  const scripts = [
    ['PHONE', 'GENERAL_INQUIRY', 'Question about warranty', 'ANSWERED'],
    ['PHONE', 'PRODUCT_SUPPORT', 'Charging issue', 'FOLLOW_UP'],
    ['CHAT', 'ORDER_INQUIRY', 'Delivery status', 'RESOLVED'],
    ['EMAIL', 'GENERAL_INQUIRY', 'Store location', 'ANSWERED'],
    ['EMAIL', 'FEEDBACK', 'Positive feedback after repair', 'CLOSED'],
    ['PHONE', 'COMPLAINT', 'Repair took longer than promised', 'FOLLOW_UP'],
    ['IN_PERSON', 'SALES', 'Asked about trade-in for the Phone 9', 'ANSWERED'],
    ['CHAT', 'PRODUCT_SUPPORT', 'Cannot restore backup after update', 'RESOLVED']
  ];
  const agents = [admin, ops];
  let interactions = 0;
  const callers = people.slice(0, 24).concat([harbor, school].filter(Boolean));
  for (let position = 0; position < callers.length; position += 1) {
    const caller = callers[position];
    const cases = await db('crm_service_case').where('party_pk', caller.party_pk).orderBy('received_at', 'desc').limit(2).select('case_id');
    const count = 1 + (position % 4);
    for (let call = 0; call < count; call += 1) {
      const script = scripts[(position + call * 3) % scripts.length];
      // eslint-disable-next-line no-await-in-loop
      if (await attempt('interaction', function () {
        return agents[(position + call) % agents.length].post('/crm/parties/' + caller.party_pk + '/interactions', {
          direction: 'INBOUND', channel_code: script[0], interaction_type: script[1], subject: script[2], outcome_code: script[3],
          body: 'Logged by the agent during the conversation.',
          case_id: script[1] === 'PRODUCT_SUPPORT' && cases[call % Math.max(1, cases.length)] ? cases[call % cases.length].case_id : null,
          occurred_at: new Date(today.getTime() - (2 + call * 17 + position) * DAY).toISOString(),
          duration_minutes: script[0] === 'PHONE' ? 4 + (position % 9) : null
        });
      })) interactions += 1;
    }
  }
  /* Service notices sent from the record - checked against consent and queued for the provider. */
  for (const person of people.slice(0, 6)) {
    // eslint-disable-next-line no-await-in-loop
    if (await attempt('message', function () {
      return admin.post('/crm/parties/' + person.party_pk + '/messages', {
        project_id: projectId('CRYSTAL'), channel_id: channelId('SMS'), purpose_id: purposeId('SERVICE_NOTICE'),
        subject: 'Your device is ready', body: 'Your repaired device is ready for collection at the service centre.'
      });
    })) interactions += 1;
  }
  added.interactions = interactions;

  /* ---- the channel each customer said they prefer, in the app ---- */
  const preferred = await db.raw(`
    UPDATE crm_party_communication_consent consent SET is_preferred = true
      FROM (SELECT DISTINCT ON (party_pk) party_communication_consent_id FROM crm_party_communication_consent
             WHERE consent_status = 'GRANTED' ORDER BY party_pk, party_communication_consent_id DESC) chosen
     WHERE consent.party_communication_consent_id = chosen.party_communication_consent_id AND consent.party_pk % 3 <> 0`);
  added.preferredChannels = preferred.rowCount;

  /* ---- notes and documents ---- */
  const noteTexts = [
    ['Prefers email communication.', false], ['Interested in the new smartphone model - call when stock arrives.', true],
    ['High potential for the premium segment.', false], ['Asked not to be called before 10am.', true],
    ['Had a bad experience with the first repair; handle with care.', false]
  ];
  let notes = 0;
  const noted = graded.slice(0, 10).map(function (row) { return row.party_pk; }).concat([harbor, school, northwind].filter(Boolean).map(function (party) { return party.party_pk; }));
  for (let position = 0; position < noted.length; position += 1) {
    for (let note = 0; note < 1 + (position % 3); note += 1) {
      const text = noteTexts[(position + note) % noteTexts.length];
      // eslint-disable-next-line no-await-in-loop
      if (await attempt('note', function () {
        return agents[note % agents.length].post('/crm/parties/' + noted[position] + '/notes', { note_text: text[0], is_pinned: text[1] && note === 0 });
      })) notes += 1;
    }
  }
  added.notes = notes;

  const FormData = require('form-data');
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n'
    + '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
  let files = 0;
  for (const [party, name, description] of [[harbor, 'enterprise-agreement-2025.pdf', 'Signed enterprise agreement'],
    [school, 'purchase-order-2024.pdf', 'Purchase order for 120 tablets'],
    [graded[0] ? { party_pk: graded[0].party_pk } : null, 'warranty-card.pdf', 'Scanned warranty card']]) {
    if (!party) continue;
    const form = new FormData();
    form.append('file', pdf, { filename: name, contentType: 'application/pdf' });
    form.append('description', description);
    // eslint-disable-next-line no-await-in-loop
    if (await attempt('file', function () { return admin.post('/crm/parties/' + party.party_pk + '/files', form, { headers: form.getHeaders() }); })) files += 1;
  }
  added.files = files;

  return added;
}

module.exports = { run: run };

if (require.main === module) {
  run()
    .then(function () { return db.destroy(); })
    .catch(function (error) {
      console.error('CRM demo stopped: ' + (error.response && error.response.data ? error.response.data.message : error.message));
      process.exit(1);
    });
}
