const createCrudRepository = require('../repositories/crud.repository');
const { HttpError } = require('../utils/response');
const audit = require('./audit.service');
const dependencies = require('../repositories/dependencies.repository');
const { transaction } = require('../repositories/shared/transaction');
const { createSignedRows } = require('../security/signedRows');
const storedFiles = require('./storedFiles.service');

/**
 * The rules a plain master table has, which is almost none - and that is the
 * point of having this layer here rather than letting the controller talk to
 * the repository directly.
 *
 * What little there is, is real: a row that was not found is a 404 and not an
 * empty response, an update with nothing in it is refused rather than issued
 * as an UPDATE with no SET, and every write is recorded against the person
 * who made it.  Those decisions are the same for every table, so they are
 * written once.
 *
 * A table that needs one more rule than this stops using the factory and gets
 * a service of its own; nothing here has to bend to accommodate it.
 */
module.exports = function createCrudService(opts) {
  const repo = createCrudRepository(opts);
  const page = opts.page;
  const table = repo.table;
  const pk = repo.pk;

  /*
   * The one escape hatch: what to do with the parts of the body that are not
   * columns of this table.
   *
   * It runs AFTER the row exists, because the thing it is for - a child list
   * edited inside the same form - needs the row's id to hang off.  A table
   * that declares no hook never calls one, so the factory stays a factory.
   */
  const afterSave = typeof opts.afterSave === 'function' ? opts.afterSave : null;

  /*
   * SIGNED TABLES - `signed: { type, content }` on the route.
   *
   * Every write below then happens inside a transaction with its signature,
   * and a row that no longer matches its stored signature is refused rather
   * than re-signed by the edit. See security/signedRows.js. A table that
   * declares nothing is written exactly as it always was, with no transaction
   * it did not ask for.
   */
  const signed = opts.signed ? createSignedRows(Object.assign({ pk: pk }, opts.signed)) : null;

  /*
   * A LAST LOOK AT THE COLUMNS BEFORE THEY ARE WRITTEN.
   *
   * The controller has already narrowed the body to this table's columns;
   * this is for a column whose VALUE has a shape - an advert's animated
   * scene, which is JSON the storefront hands to a renderer and must
   * therefore be rebuilt from known fields rather than stored as it
   * arrived. A table that declares nothing is written exactly as before.
   */
  const sanitise = opts.sanitise || function (data) { return data; };

  function search(filters, paging) {
    return repo.search(filters, paging);
  }

  function options(deleted) {
    return repo.options(deleted);
  }

  async function detail(id, deleted) {
    const row = await repo.findById(id, deleted);
    if (!row) throw new HttpError(404, 'common.notFound');
    return row;
  }

  async function create(rawData, actor, extras) {
    const data = sanitise(rawData);

    const row = signed
      ? await transaction(async function (trx) {
        const inserted = await repo.insert(data, trx);
        await signed.sign(inserted[0], trx);
        return inserted[0];
      })
      : (await repo.insert(data))[0];

    if (afterSave) await afterSave(row, extras || {});

    audit.created(actor, table, row[pk], row, page);
    return row;
  }

  async function update(id, rawData, actor, extras) {
    const data = sanitise(rawData);
    const hasExtras = !!(afterSave && extras && Object.keys(extras).length);

    // An edit that only changed the child list is still an edit; it is only
    // an empty UPDATE that is refused.
    if (!Object.keys(data).length && !hasExtras) throw new HttpError(400, 'common.nothingToUpdate');

    if (!Object.keys(data).length) {
      const row = await repo.findRow(id);
      if (!row) throw new HttpError(404, 'common.notFound');
      await afterSave(row, extras);
      return row;
    }

    // Read first: the trail is worth little without the value that was
    // replaced, and RETURNING only ever hands back the new one.
    const previous = await repo.findRow(id);

    const updated = signed
      ? await transaction(async function (trx) {
        const current = await repo.findRow(id, trx);
        if (!current) return [];
        await signed.assertUntampered(current, trx);

        const rows = await repo.update(id, data, trx);
        if (rows.length) await signed.sign(rows[0], trx);
        return rows;
      })
      : await repo.update(id, data);
    if (!updated.length) throw new HttpError(404, 'common.notFound');

    if (hasExtras) await afterSave(updated[0], extras);

    audit.updated(actor, table, id, previous, updated[0], page);
    if (opts.fileColumns) await storedFiles.replaced(previous, updated[0], opts.fileColumns);
    return updated[0];
  }

  async function remove(id, actor) {
    const previous = await repo.findRow(id);

    const affected = signed ? await removeSigned(id) : await repo.remove(id);
    if (!affected) throw new HttpError(404, 'common.notFound');

    audit.deleted(actor, table, id, previous, page);
    if (!repo.softDelete && opts.fileColumns) await storedFiles.replaced(previous, null, opts.fileColumns);
  }

  /**
   * WHAT WOULD HAPPEN if this row were destroyed.
   *
   * Asked by the console before it offers the button, so the confirmation
   * can name what is in the way - or what else goes with it - rather than
   * letting the delete fail on a constraint nobody can read.
   */
  async function dependents(id) {
    const row = await repo.findRow(id);
    if (!row) throw new HttpError(404, 'common.notFound');

    const found = await dependencies.dependentsOf(table, pk, id);
    return {
      dependents: found,
      blockers: dependencies.blockersIn(found),
      can_purge: dependencies.blockersIn(found).length === 0
    };
  }

  /**
   * PERMANENTLY, and only when nothing depends on it.
   *
   * Two rails, both deliberate:
   *
   *   the row must already be in the RECYCLE BIN on a soft-deleted table.
   *   Destroying live data in one click is too easy to do by accident, and
   *   the two-step is the whole reason the bin exists.
   *
   *   anything that BLOCKS is refused with a list of what and how many.
   *   Cascading children go with it, which the console shows first.
   */
  async function purge(id, actor) {
    const row = await repo.findRow(id);
    if (!row) throw new HttpError(404, 'common.notFound');

    if (repo.softDelete && !row.is_deleted) {
      throw new HttpError(409, 'common.moveItToThe');
    }

    const found = await dependencies.dependentsOf(table, pk, id);
    const blockers = dependencies.blockersIn(found);

    if (blockers.length) {
      throw new HttpError(409, 'common.otherRecordsStillRefer', blockers.map(function (b) {
        return b.count + ' in ' + b.table;
      }));
    }

    if (signed) {
      await transaction(async function (trx) {
        await repo.purge(id, trx);
        await signed.forget(id, trx);
      });
    } else {
      await repo.purge(id);
    }

    // Recorded as a deletion of the whole row, because that is what it is -
    // and it is the last trace of it that will exist.
    audit.deleted(actor, table, id, row, page);
    if (opts.fileColumns) await storedFiles.replaced(row, null, opts.fileColumns);
  }

  /**
   * A signed row's delete, which is never refused.
   *
   * A soft delete moves updated_at (the trigger), so a row whose signature
   * was VALID is re-signed as it goes; a row that no longer matched keeps its
   * broken signature for the audit to go on reporting. A hard delete takes its
   * signature with it.
   */
  function removeSigned(id) {
    return transaction(async function (trx) {
      const current = await repo.findRow(id, trx);
      if (!current) return 0;

      const before = await signed.statusOf(current, trx);
      const affected = await repo.remove(id, trx);

      if (!repo.softDelete) {
        await signed.forget(id, trx);
      } else if (affected && before.status === 'valid') {
        await signed.sign(await repo.findRow(id, trx), trx);
      }
      return affected;
    });
  }

  async function restore(id, actor) {
    if (!repo.softDelete) throw new HttpError(400, 'crud.thisResourceIsNot');

    const restored = signed
      ? await transaction(async function (trx) {
        const current = await repo.findRow(id, trx);
        if (!current) return [];
        await signed.assertUntampered(current, trx);

        const rows = await repo.restore(id, trx);
        if (rows.length) await signed.sign(rows[0], trx);
        return rows;
      })
      : await repo.restore(id);
    if (!restored.length) throw new HttpError(404, 'common.notFound');

    audit.restored(actor, table, id, restored[0], page);
  }

  return {
    search: search,
    options: options,
    detail: detail,
    create: create,
    update: update,
    remove: remove,
    restore: restore,
    dependents: dependents,
    purge: purge
  };
};
