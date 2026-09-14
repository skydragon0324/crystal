const repo = require('../repositories/managers.repository');
const permissions = require('../repositories/permissions.repository');
const auth = require('./auth.service');
const { HttpError } = require('../utils/response');
const audit = require('./audit.service');

const PAGE = '/admin/management/admins';
const TABLE = repo.TABLE;

const COLUMNS = ['username', 'name', 'avatar', 'role_id', 'status'];
const SORTABLE = ['id', 'username', 'name', 'last_login_at', 'created_at'];
const DEFAULT_SORT = 'username';

function search(filters, paging) {
  return repo.search(filters, paging);
}

async function detail(id, deleted) {
  const row = await repo.findById(id, deleted);
  if (!row) throw new HttpError(404, 'common.notFound');
  return row;
}

async function assertUsernameFree(username, exceptId) {
  const clash = await repo.findByUsername(username, exceptId);
  if (clash) throw new HttpError(409, 'common.duplicatedValue');
}

/**
 * A new console account.
 *
 * The password arrives in the body and leaves as a hash before anything else
 * touches the object, so there is no window in which a plaintext password is
 * sitting in something that might get logged.
 */
async function create(body, actor) {
  const data = Object.assign({}, body);
  data.username = String(data.username || '').trim();

  if (!data.username || !data.name) throw new HttpError(400, 'common.valueFailedAValidation');
  if (!data.role_id) throw new HttpError(400, 'common.valueFailedAValidation');
  if (String(body.password || '').length < auth.MIN_PASSWORD) {
    throw new HttpError(400, 'common.theNewPasswordMust', null, { n: auth.MIN_PASSWORD });
  }

  const role = await permissions.findRole(data.role_id);
  if (!role) throw new HttpError(404, 'common.notFound');

  await assertUsernameFree(data.username, null);

  data.password_hash = await auth.hashPassword(body.password);
  delete data.password;

  const rows = await repo.insert(data);
  audit.created(actor, TABLE, rows[0].id, rows[0], PAGE);
  return await repo.findById(rows[0].id, false);
}

async function update(id, body, actor) {
  const data = Object.assign({}, body);

  if (data.username !== undefined) {
    data.username = String(data.username).trim();
    if (!data.username) throw new HttpError(400, 'common.valueFailedAValidation');
    await assertUsernameFree(data.username, id);
  }

  // A password is optional on an edit, and an empty one means "leave it".
  if (body.password) {
    if (String(body.password).length < auth.MIN_PASSWORD) {
      throw new HttpError(400, 'common.theNewPasswordMust', null, { n: auth.MIN_PASSWORD });
    }
    data.password_hash = await auth.hashPassword(body.password);
  }
  delete data.password;

  if (!Object.keys(data).length) throw new HttpError(400, 'common.nothingToUpdate');

  const previous = await repo.findRow(id);
  if (!previous) throw new HttpError(404, 'common.notFound');

  const rows = await repo.update(id, data);
  audit.updated(actor, TABLE, id, previous, rows[0], PAGE);
  return await repo.findById(id, false);
}

/**
 * Removing an account, except your own.
 *
 * Somebody deleting the account they are signed in as would be locked out
 * mid-request, and in a small installation could take the last account with
 * super rights with them - which is a support call and a database session to
 * undo.
 */
async function remove(id, actor) {
  if (actor && Number(actor.manager_id) === Number(id)) {
    throw new HttpError(400, 'common.valueFailedAValidation');
  }

  const previous = await repo.findRow(id);
  const affected = await repo.softDelete(id);
  if (!affected) throw new HttpError(404, 'common.notFound');

  audit.deleted(actor, TABLE, id, previous, PAGE);
}

async function restore(id, actor) {
  const rows = await repo.restore(id);
  if (!rows.length) throw new HttpError(404, 'common.notFound');
  audit.restored(actor, TABLE, id, rows[0], PAGE);
}

module.exports = {
  PAGE: PAGE,
  COLUMNS: COLUMNS,
  SORTABLE: SORTABLE,
  DEFAULT_SORT: DEFAULT_SORT,
  search: search,
  detail: detail,
  create: create,
  update: update,
  remove: remove,
  restore: restore
};
