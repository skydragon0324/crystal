const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const db = require('../../config/db');
const config = require('../../config');
const audit = require('../audit.service');
const { HttpError } = require('../../utils/response');

/**
 * WORKING WITH ONE CUSTOMER: notes, files, interactions and messages.
 *
 * NOTES are what staff want the next person to know. One can be pinned so it
 * stays at the top; a removed note is kept, marked deleted, for the audit.
 *
 * FILES are documents kept with the customer - a contract, a signed form, a
 * photo of a damaged device. They are personal, so they are NOT written under
 * the public uploads folder the web server hands out: they go to a private
 * folder and come back only through the CRM, to a signed-in manager allowed
 * to read customers, as a download.
 *
 * INTERACTIONS are contacts outside a campaign: a call taken, an email
 * answered, a chat - logged with the agent and how it ended, and linked to a
 * service case when it was about one.
 *
 * A MESSAGE sent from the record is an outbound interaction, and it obeys the
 * same rules a campaign does (marketing.service prepareAction): the project
 * must offer that purpose on that channel, a purpose that needs an opt-in
 * needs one in force, and the customer needs a live contact of the channel's
 * type. It is recorded as QUEUED for the channel's provider to deliver.
 */

const PAGE = '/admin/crm/customers';
const INTERACTION_CHANNELS = ['EMAIL', 'PHONE', 'SMS', 'CHAT', 'IN_PERSON', 'APP', 'WEB', 'LETTER', 'PUSH'];
const INTERACTION_TYPES = ['GENERAL_INQUIRY', 'PRODUCT_SUPPORT', 'ORDER_INQUIRY', 'COMPLAINT', 'FEEDBACK', 'SALES', 'SERVICE_NOTICE', 'MARKETING', 'FOLLOW_UP'];
const OUTCOMES = ['ANSWERED', 'FOLLOW_UP', 'RESOLVED', 'CLOSED', 'NO_ANSWER'];
/* A campaign channel, and what the interaction log calls it. */
const MESSAGE_CHANNELS = { EMAIL: 'EMAIL', SMS: 'SMS', PUSH: 'PUSH', IN_APP: 'APP' };

const FILE_DIR = process.env.CRM_FILE_DIR
  ? path.resolve(process.env.CRM_FILE_DIR)
  : path.join(path.dirname(config.storage.uploadDir), 'crm-private');
const FILE_TYPES = config.storage.allowedDocumentTypes.concat(config.storage.allowedImageTypes.filter(function (type) {
  return type !== 'image/svg+xml';
}));

async function requireParty(id) {
  const party = await db('crm_party').where('party_id', id).first('party_id', 'party_type', 'party_status');
  if (!party) throw new HttpError(404, 'common.notFound');
  return party;
}

/* ------------------------------------------------------------ notes */

async function notes(partyId, filters, paging) {
  const query = function () {
    return db('crm_party_note as note').leftJoin('managers as manager', 'manager.id', 'note.created_by_manager_id')
      .where('note.party_id', partyId).whereNull('note.deleted_at');
  };
  const count = await query().count({ total: '*' }).first();
  const rows = await query().select('note.*', 'manager.name as author_name')
    .orderBy([{ column: 'note.is_pinned', order: 'desc' }, { column: 'note.created_at', order: 'desc' }])
    .limit(paging.limit).offset(paging.offset);
  return { rows: rows, total: Number(count.total) };
}

async function addNote(partyId, body, actor) {
  await requireParty(partyId);
  const text = String(body.note_text || '').trim();
  if (!text) throw new HttpError(400, 'crm.writeTheNote');
  const [row] = await db('crm_party_note').insert({
    party_id: partyId, note_text: text.slice(0, 5000), is_pinned: !!body.is_pinned, created_by_manager_id: actor.manager_id
  }).returning('*');
  audit.created(actor, 'crm_party_note', row.note_id, row, PAGE);
  return row;
}

async function updateNote(partyId, noteId, body, actor) {
  const before = await db('crm_party_note').where({ note_id: noteId, party_id: partyId }).whereNull('deleted_at').first();
  if (!before) throw new HttpError(404, 'common.notFound');
  const patch = { updated_at: db.fn.now() };
  if (body.note_text !== undefined) {
    const text = String(body.note_text || '').trim();
    if (!text) throw new HttpError(400, 'crm.writeTheNote');
    patch.note_text = text.slice(0, 5000);
  }
  if (body.is_pinned !== undefined) patch.is_pinned = !!body.is_pinned;
  const [after] = await db('crm_party_note').where('note_id', noteId).update(patch).returning('*');
  audit.updated(actor, 'crm_party_note', noteId, before, after, PAGE);
  return after;
}

async function removeNote(partyId, noteId, actor) {
  const before = await db('crm_party_note').where({ note_id: noteId, party_id: partyId }).whereNull('deleted_at').first();
  if (!before) throw new HttpError(404, 'common.notFound');
  await db('crm_party_note').where('note_id', noteId).update({ deleted_at: db.fn.now() });
  audit.deleted(actor, 'crm_party_note', noteId, before, PAGE);
}

/* ------------------------------------------------------------ files */

function files(partyId) {
  return db('crm_party_file as party_file').leftJoin('managers as manager', 'manager.id', 'party_file.uploaded_by_manager_id')
    .where('party_file.party_id', partyId).whereNull('party_file.deleted_at').orderBy('party_file.created_at', 'desc')
    .select('party_file.file_id', 'party_file.file_name', 'party_file.content_type', 'party_file.byte_size', 'party_file.description', 'party_file.created_at', 'manager.name as uploaded_by_name');
}

/** A file held in memory by the upload middleware, written to the private folder. */
async function addFile(partyId, file, body, actor) {
  await requireParty(partyId);
  if (!file) throw new HttpError(400, 'crm.chooseAFile');
  if (FILE_TYPES.indexOf(file.mimetype) === -1) throw new HttpError(400, 'crm.thatKindOfFileIsNotAccepted');

  if (!fs.existsSync(FILE_DIR)) fs.mkdirSync(FILE_DIR, { recursive: true });
  const extension = (path.extname(file.originalname || '') || '').toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
  const storageKey = Date.now().toString(36) + '-' + crypto.randomBytes(8).toString('hex') + extension;
  fs.writeFileSync(path.join(FILE_DIR, storageKey), file.buffer);

  try {
    const [row] = await db('crm_party_file').insert({
      party_id: partyId,
      file_name: String(file.originalname || storageKey).slice(0, 255),
      storage_key: storageKey,
      content_type: file.mimetype,
      byte_size: file.size,
      description: body && body.description ? String(body.description).slice(0, 255) : null,
      uploaded_by_manager_id: actor.manager_id
    }).returning('*');
    audit.created(actor, 'crm_party_file', row.file_id, { file_name: row.file_name, byte_size: row.byte_size }, PAGE);
    return row;
  } catch (error) {
    fs.unlinkSync(path.join(FILE_DIR, storageKey));
    throw error;
  }
}

/** Where a file's bytes are, for a download - never a path the caller could steer. */
async function fileForDownload(partyId, fileId) {
  const row = await db('crm_party_file').where({ file_id: fileId, party_id: partyId }).whereNull('deleted_at').first();
  if (!row) throw new HttpError(404, 'common.notFound');
  const absolute = path.join(FILE_DIR, path.basename(row.storage_key));
  if (!fs.existsSync(absolute)) throw new HttpError(404, 'common.notFound');
  return { row: row, absolute: absolute };
}

async function removeFile(partyId, fileId, actor) {
  const row = await db('crm_party_file').where({ file_id: fileId, party_id: partyId }).whereNull('deleted_at').first();
  if (!row) throw new HttpError(404, 'common.notFound');
  await db('crm_party_file').where('file_id', fileId).update({ deleted_at: db.fn.now() });
  const absolute = path.join(FILE_DIR, path.basename(row.storage_key));
  if (fs.existsSync(absolute)) fs.unlinkSync(absolute);
  audit.deleted(actor, 'crm_party_file', fileId, { file_name: row.file_name }, PAGE);
}

/* ------------------------------------------------------------ interactions */

async function interactions(partyId, filters, paging) {
  const query = function () {
    const builder = db('crm_party_interaction as interaction').where('interaction.party_id', partyId);
    if (filters.channel_code) builder.where('interaction.channel_code', filters.channel_code);
    if (filters.direction) builder.where('interaction.direction', filters.direction);
    return builder;
  };
  const count = await query().count({ total: '*' }).first();
  const rows = await query()
    .leftJoin('managers as manager', 'manager.id', 'interaction.manager_id')
    .leftJoin('crm_service_case as service_case', 'service_case.case_id', 'interaction.case_id')
    .leftJoin('crm_project as project', 'project.project_id', 'interaction.project_id')
    .select('interaction.*', 'manager.name as agent_name', 'service_case.external_case_id', 'project.project_code')
    .orderBy('interaction.occurred_at', 'desc').limit(paging.limit).offset(paging.offset);
  return { rows: rows, total: Number(count.total) };
}

/** A call, email or chat that already happened, written down by the agent who had it. */
async function logInteraction(partyId, body, actor) {
  await requireParty(partyId);
  if (INTERACTION_CHANNELS.indexOf(body.channel_code) === -1) throw new HttpError(400, 'crm.chooseAChannel');
  if (INTERACTION_TYPES.indexOf(body.interaction_type) === -1) throw new HttpError(400, 'crm.chooseWhatItWasAbout');
  if (OUTCOMES.indexOf(body.outcome_code) === -1) throw new HttpError(400, 'crm.chooseHowItEnded');
  const subject = String(body.subject || '').trim();
  if (!subject) throw new HttpError(400, 'crm.giveASummary');
  if (body.case_id) {
    const serviceCase = await db('crm_service_case').where({ case_id: body.case_id, party_id: partyId }).first('case_id');
    if (!serviceCase) throw new HttpError(409, 'crm.thatCaseIsAnotherCustomers');
  }

  const [row] = await db('crm_party_interaction').insert({
    party_id: partyId,
    project_id: body.project_id || null,
    direction: body.direction === 'OUTBOUND' ? 'OUTBOUND' : 'INBOUND',
    channel_code: body.channel_code,
    interaction_type: body.interaction_type,
    subject: subject.slice(0, 250),
    body: body.body || null,
    case_id: body.case_id || null,
    manager_id: actor.manager_id,
    outcome_code: body.outcome_code,
    occurred_at: body.occurred_at || db.fn.now(),
    duration_seconds: body.duration_minutes ? Math.round(Number(body.duration_minutes) * 60) : null
  }).returning('*');
  audit.created(actor, 'crm_party_interaction', row.interaction_id, row, PAGE);
  return row;
}

/**
 * SEND A MESSAGE: checked like a campaign recipient, then queued.
 * Refused with the same reasons a campaign would skip the customer for.
 */
async function sendMessage(partyId, body, actor) {
  const party = await requireParty(partyId);
  if (party.party_status !== 'ACTIVE') throw new HttpError(409, 'crm.chooseAnActiveCustomer');

  const channel = await db('crm_communication_channel').where({ channel_id: body.channel_id || null, is_active: true }).first();
  if (!channel || !MESSAGE_CHANNELS[channel.channel_code]) throw new HttpError(400, 'crm.chooseAChannelThatCarriesMessages');
  const purpose = await db('crm_communication_purpose').where('purpose_id', body.purpose_id || null).first();
  if (!purpose) throw new HttpError(400, 'crm.chooseWhatTheMessageIsFor');
  const subject = String(body.subject || '').trim();
  const text = String(body.body || '').trim();
  if (!subject || !text) throw new HttpError(400, 'crm.writeTheMessage');

  const option = await db('crm_project_communication_option')
    .where({ project_id: body.project_id || null, purpose_id: purpose.purpose_id, channel_id: channel.channel_id }).first();
  if (!option || !option.is_enabled) throw new HttpError(409, 'crm.thatProjectDoesNotSendThat');

  const consent = await db('crm_party_communication_consent')
    .where({ party_id: partyId, project_communication_option_id: option.project_communication_option_id }).first();
  const now = new Date();
  const inForce = consent && consent.consent_status === 'GRANTED'
    && (!consent.effective_from || new Date(consent.effective_from) <= now) && (!consent.effective_to || new Date(consent.effective_to) > now);
  if (consent && (consent.consent_status === 'WITHDRAWN' || consent.consent_status === 'DENIED')) {
    throw new HttpError(409, 'crm.theCustomerSaidNoToThat');
  }
  if ((option.consent_required || purpose.requires_opt_in) && !inForce) throw new HttpError(409, 'crm.thereIsNoConsentForThat');

  let contact = null;
  if (channel.required_contact_type) {
    const candidates = await db('crm_contact_point').where({ party_id: partyId, contact_type: channel.required_contact_type, status: 'ACTIVE' })
      .orderBy([{ column: 'is_primary', order: 'desc' }, { column: 'is_verified', order: 'desc' }, { column: 'contact_point_id' }]);
    contact = (consent && consent.contact_point_id
      ? candidates.filter(function (candidate) { return candidate.contact_point_id === consent.contact_point_id; })[0] : null) || candidates[0] || null;
    if (!contact) throw new HttpError(409, 'crm.theCustomerHasNoContactForThatChannel');
  }

  const [row] = await db('crm_party_interaction').insert({
    party_id: partyId,
    project_id: option.project_id,
    direction: 'OUTBOUND',
    channel_code: MESSAGE_CHANNELS[channel.channel_code],
    interaction_type: purpose.purpose_code === 'MARKETING' ? 'MARKETING' : (purpose.purpose_code === 'SERVICE_NOTICE' ? 'SERVICE_NOTICE' : 'FOLLOW_UP'),
    purpose_id: purpose.purpose_id,
    subject: subject.slice(0, 250),
    body: text,
    contact_point_id: contact ? contact.contact_point_id : null,
    destination_snapshot: contact ? contact.contact_value : null,
    manager_id: actor.manager_id,
    outcome_code: 'QUEUED'
  }).returning('*');
  audit.created(actor, 'crm_party_interaction', row.interaction_id, { channel: channel.channel_code, purpose: purpose.purpose_code }, PAGE);
  return row;
}

module.exports = {
  FILE_DIR: FILE_DIR,
  INTERACTION_CHANNELS: INTERACTION_CHANNELS,
  INTERACTION_TYPES: INTERACTION_TYPES,
  OUTCOMES: OUTCOMES,
  notes: notes,
  addNote: addNote,
  updateNote: updateNote,
  removeNote: removeNote,
  files: files,
  addFile: addFile,
  fileForDownload: fileForDownload,
  removeFile: removeFile,
  interactions: interactions,
  logInteraction: logInteraction,
  sendMessage: sendMessage
};
