const db = require('../../config/db');
const contact = require('./contact');
const { HttpError } = require('../../utils/response');

/**
 * WHAT A CUSTOMER'S DETAILS MAY BE, written once.
 *
 * The "new customer" form, the edit form, adding or editing a contact, and
 * every row of an Excel import go through these same checks, so a value the
 * form refuses is refused by the import too, and the other way round.
 *
 * `check(values, mode)` collects EVERY problem rather than stopping at the
 * first, so a form or a sheet row can be fixed in one go. A problem is
 * { field, message, params? }, the message an address the error handler
 * translates; `assert` turns a non-empty list into a 400 whose `detail` is
 * that list.
 */

const GENDERS = ['M', 'F', 'OTHER', 'UNKNOWN'];
const SIZE_BANDS = ['1-10', '11-50', '51-200', '201-1000', '1001-5000', '5001+'];
const CONTACT_TYPES = ['EMAIL', 'MOBILE', 'PHONE', 'SIM_CID', 'WECHAT_ID', 'WHATSAPP', 'PUSH_TOKEN'];

function present(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

/**
 * One problem: { message, params? }. The message is an address, and so is a
 * `label` param - the field's name, translated along with the sentence.
 */
function problem(message, params) {
  return params ? { message: message, params: params } : { message: message };
}

/** YYYY-MM-DD that is a real day, from 1900 to today. `label` is an address under crm.fields. */
function dateProblem(value, label) {
  const text = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return problem('crm.problems.mustBeADate', { label: label });
  const date = new Date(text + 'T00:00:00Z');
  if (isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) return problem('crm.problems.notARealDate', { label: label });
  if (text < '1900-01-01') return problem('crm.problems.isBefore1900', { label: label });
  if (date.getTime() > Date.now()) return problem('crm.problems.isInTheFuture', { label: label });
  return null;
}

/** A phone number: at least 7 digits once spaces and dashes are taken out, at most 15. */
function phoneProblem(value, label) {
  const digits = contact.normalise('MOBILE', value).replace('+', '');
  if (digits.length < 7) return problem('crm.problems.notAPhoneNumber', { label: label, value: value });
  if (digits.length > 15) return problem('crm.problems.tooManyDigits', { label: label, value: value });
  if (/[a-z]/i.test(String(value))) return problem('crm.problems.containsLetters', { label: label, value: value });
  return null;
}

function emailProblem(value, label) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value).trim()) ? null : problem('crm.problems.notAnEmailAddress', { label: label, value: value });
}

/** The problem with one contact value for its type, or null. */
function contactProblem(type, value) {
  const kind = String(type || '').toUpperCase();
  if (CONTACT_TYPES.indexOf(kind) === -1) return problem('crm.problems.chooseAContactType');
  if (!present(value)) return problem('crm.customers.contactValueIsRequired');
  if (String(value).trim().length > 500) return problem('crm.problems.contactIsTooLong', { max: 500 });
  if (kind === 'EMAIL') return emailProblem(value, 'crm.fields.email');
  if (kind === 'MOBILE' || kind === 'PHONE') return phoneProblem(value, kind === 'MOBILE' ? 'crm.fields.mobile' : 'crm.fields.phone');
  return null;
}

/**
 * Every problem with a customer's details.
 *
 *   mode 'create'  the name is required
 *   mode 'update'  only the fields sent are checked; a name, if sent, may not be blank
 *
 * `partyType` is PERSON or ORGANIZATION. `current` is the stored person (for an
 * update), so a job title that has since been switched off can be kept.
 */
async function check(values, mode, partyType, current) {
  const details = values || {};
  const problems = [];
  const add = function (field, found) { if (found) problems.push(Object.assign({ field: field }, typeof found === 'string' ? problem(found) : found)); };
  const isPerson = partyType !== 'ORGANIZATION';
  const sent = function (field) { return mode === 'create' ? present(details[field]) : details[field] !== undefined && details[field] !== null && details[field] !== ''; };

  if (mode === 'create' && ['PERSON', 'ORGANIZATION', undefined, null, ''].indexOf(details.party_type) === -1) {
    add('party_type', 'crm.problems.chooseAPartyType');
  }

  /* the name */
  const nameField = details.display_name !== undefined ? 'display_name' : 'full_name';
  if (mode === 'create' && !present(details.display_name) && !present(details.full_name)) add('display_name', 'crm.problems.nameIsRequired');
  if (mode === 'update' && details.display_name !== undefined && !present(details.display_name)) add('display_name', 'crm.problems.nameCannotBeBlank');
  [nameField, 'full_name', 'company_name'].forEach(function (field) {
    if (present(details[field]) && String(details[field]).trim().length > 250) add(field, problem('crm.problems.nameIsTooLong', { max: 250 }));
  });

  /* contacts given with the customer */
  if (sent('mobile')) add('mobile', phoneProblem(details.mobile, 'crm.fields.mobile'));
  if (sent('email')) add('email', emailProblem(details.email, 'crm.fields.email'));

  if (isPerson) {
    if (sent('gender_code') && GENDERS.indexOf(String(details.gender_code)) === -1) add('gender_code', 'crm.problems.genderMustBeMOrF');
    if (sent('birth_date')) add('birth_date', dateProblem(details.birth_date, 'crm.fields.dateOfBirth'));
    if (sent('birth_year')) {
      const year = Number(details.birth_year);
      if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear()) add('birth_year', 'crm.problems.birthYearIsOutOfRange');
    }
    if (sent('address_line') && String(details.address_line).length > 255) add('address_line', problem('crm.problems.addressIsTooLong', { max: 255 }));

    if (sent('job_title_id')) {
      const job = await db('crm_job_title').where('job_title_id', Number(details.job_title_id) || 0).first('job_title_id', 'is_active');
      const keeping = current && String(current.job_title_id) === String(details.job_title_id);
      if (!job) add('job_title_id', 'crm.problems.jobTitleIsNotOnTheList');
      else if (!job.is_active && !keeping) add('job_title_id', 'crm.problems.jobTitleIsSwitchedOff');
    }
    if (sent('home_location_pk')) {
      const place = await db('crm_location').where('location_pk', Number(details.home_location_pk) || 0).first('location_pk');
      if (!place) add('home_location_pk', 'crm.problems.locationIsNotOnTheList');
    }
  } else {
    if (sent('location_pk')) {
      const place = await db('crm_location').where('location_pk', Number(details.location_pk) || 0).first('location_pk');
      if (!place) add('location_pk', 'crm.problems.locationIsNotOnTheList');
    }
    if (sent('founded_date')) add('founded_date', dateProblem(details.founded_date, 'crm.fields.established'));
    if (sent('website_url') && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(String(details.website_url).trim())) {
      add('website_url', 'crm.problems.websiteMustStartWithHttp');
    }
    if (sent('employee_count_band') && SIZE_BANDS.indexOf(String(details.employee_count_band)) === -1) {
      add('employee_count_band', 'crm.problems.companySizeIsNotABand');
    }
    if (sent('registration_number') && String(details.registration_number).length > 100) {
      add('registration_number', problem('crm.problems.registrationNumberIsTooLong', { max: 100 }));
    }
  }

  if (sent('origin_project_id')) {
    const project = await db('crm_project').where('project_id', Number(details.origin_project_id) || 0).first('project_id');
    if (!project) add('origin_project_id', 'crm.problems.projectDoesNotExist');
  }

  return problems;
}

/** 400 with every problem in `detail`, or nothing. */
function assert(problems) {
  if (problems && problems.length) throw new HttpError(400, 'crm.common.checkTheDetails', problems);
}

module.exports = {
  GENDERS: GENDERS,
  check: check,
  assert: assert,
  problem: problem,
  contactProblem: contactProblem,
  dateProblem: dateProblem,
  phoneProblem: phoneProblem,
  emailProblem: emailProblem
};
