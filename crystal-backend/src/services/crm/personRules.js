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
 * { field, message }; `assert` turns a non-empty list into a 400 whose
 * `detail` is that list.
 */

const GENDERS = ['M', 'F', 'OTHER', 'UNKNOWN'];
const SIZE_BANDS = ['1-10', '11-50', '51-200', '201-1000', '1001-5000', '5001+'];
const CONTACT_TYPES = ['EMAIL', 'MOBILE', 'PHONE', 'SIM_CID', 'WECHAT_ID', 'WHATSAPP', 'PUSH_TOKEN'];

function present(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

/** YYYY-MM-DD that is a real day, from 1900 to today. */
function dateProblem(value, label) {
  const text = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return label + ' must be a date (YYYY-MM-DD)';
  const date = new Date(text + 'T00:00:00Z');
  if (isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) return label + ' is not a real date';
  if (text < '1900-01-01') return label + ' is before 1900';
  if (date.getTime() > Date.now()) return label + ' is in the future';
  return null;
}

/** A phone number: at least 7 digits once spaces and dashes are taken out, at most 15. */
function phoneProblem(value, label) {
  const digits = contact.normalise('MOBILE', value).replace('+', '');
  if (digits.length < 7) return label + ' "' + value + '" is not a phone number';
  if (digits.length > 15) return label + ' "' + value + '" has too many digits';
  if (/[a-z]/i.test(String(value))) return label + ' "' + value + '" contains letters';
  return null;
}

function emailProblem(value, label) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value).trim()) ? null : label + ' "' + value + '" is not an email address';
}

/** The problem with one contact value for its type, or null. */
function contactProblem(type, value) {
  const kind = String(type || '').toUpperCase();
  if (CONTACT_TYPES.indexOf(kind) === -1) return 'Choose a contact type';
  if (!present(value)) return 'The contact is required';
  if (String(value).trim().length > 500) return 'The contact is longer than 500 characters';
  if (kind === 'EMAIL') return emailProblem(value, 'Email');
  if (kind === 'MOBILE' || kind === 'PHONE') return phoneProblem(value, kind === 'MOBILE' ? 'Mobile' : 'Phone');
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
  const add = function (field, message) { if (message) problems.push({ field: field, message: message }); };
  const isPerson = partyType !== 'ORGANIZATION';
  const sent = function (field) { return mode === 'create' ? present(details[field]) : details[field] !== undefined && details[field] !== null && details[field] !== ''; };

  if (mode === 'create' && ['PERSON', 'ORGANIZATION', undefined, null, ''].indexOf(details.party_type) === -1) {
    add('party_type', 'Type must be a person or an organization');
  }

  /* the name */
  const nameField = details.display_name !== undefined ? 'display_name' : 'full_name';
  if (mode === 'create' && !present(details.display_name) && !present(details.full_name)
    && !present(details.legal_name) && !present(details.trading_name)) add('display_name', 'Name is required');
  if (mode === 'update' && details.display_name !== undefined && !present(details.display_name)) add('display_name', 'Name cannot be blank');
  [nameField, 'full_name', 'legal_name', 'trading_name'].forEach(function (field) {
    if (present(details[field]) && String(details[field]).trim().length > 250) add(field, 'Name is longer than 250 characters');
  });

  /* contacts given with the customer */
  if (sent('mobile')) add('mobile', phoneProblem(details.mobile, 'Mobile'));
  if (sent('email')) add('email', emailProblem(details.email, 'Email'));

  if (isPerson) {
    if (sent('gender_code') && GENDERS.indexOf(String(details.gender_code)) === -1) add('gender_code', 'Gender must be M or F');
    if (sent('birth_date')) add('birth_date', dateProblem(details.birth_date, 'Date of birth'));
    if (sent('birth_year')) {
      const year = Number(details.birth_year);
      if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear()) add('birth_year', 'Year of birth is out of range');
    }
    if (sent('address_line') && String(details.address_line).length > 255) add('address_line', 'Address is longer than 255 characters');

    if (sent('job_title_id')) {
      const job = await db('crm_job_title').where('job_title_id', Number(details.job_title_id) || 0).first('job_title_id', 'is_active');
      const keeping = current && String(current.job_title_id) === String(details.job_title_id);
      if (!job) add('job_title_id', 'Job title is not on the job list');
      else if (!job.is_active && !keeping) add('job_title_id', 'Job title is switched off on the job list');
    }
    if (sent('home_location_pk')) {
      const place = await db('crm_location').where('location_pk', Number(details.home_location_pk) || 0).first('location_pk');
      if (!place) add('home_location_pk', 'Location is not on the location list');
    }
  } else {
    if (sent('location_pk')) {
      const place = await db('crm_location').where('location_pk', Number(details.location_pk) || 0).first('location_pk');
      if (!place) add('location_pk', 'Location is not on the location list');
    }
    if (sent('founded_date')) add('founded_date', dateProblem(details.founded_date, 'Established'));
    if (sent('website_url') && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(String(details.website_url).trim())) {
      add('website_url', 'Website must start with http:// or https://');
    }
    if (sent('employee_count_band') && SIZE_BANDS.indexOf(String(details.employee_count_band)) === -1) {
      add('employee_count_band', 'Company size is not one of the bands');
    }
    if (sent('registration_number') && String(details.registration_number).length > 100) {
      add('registration_number', 'Registration number is longer than 100 characters');
    }
  }

  if (sent('origin_project_id')) {
    const project = await db('crm_project').where('project_id', Number(details.origin_project_id) || 0).first('project_id');
    if (!project) add('origin_project_id', 'Project does not exist');
  }

  return problems;
}

/** 400 with every problem in `detail`, or nothing. */
function assert(problems) {
  if (problems && problems.length) throw new HttpError(400, 'crm.checkTheDetails', problems);
}

module.exports = {
  GENDERS: GENDERS,
  check: check,
  assert: assert,
  contactProblem: contactProblem,
  dateProblem: dateProblem,
  phoneProblem: phoneProblem,
  emailProblem: emailProblem
};
