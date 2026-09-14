'use strict';

/**
 * PERMANENT DELETE, for the routers that are not the CRUD factory.
 *
 * About a third of this API's tables have hand-written routes because they
 * have rules of their own - a product has five child lists, a ticket has a
 * workflow. None of that changes what "destroy this row for good" means, and
 * neither does the check in front of it, so the two endpoints are written once
 * here and mounted rather than copied into a dozen files.
 *
 *   GET    /:id/dependents   what refers to this row, and what it would do
 *   DELETE /:id/permanent    destroy it, if nothing blocks
 *
 * Both are identical to what crudFactory offers, including the two rails: the
 * row has to be in the recycle bin already, and anything with a RESTRICT
 * reference refuses the delete with a list of what and how many.
 */

const { requirePermission, LEVEL } = require('../middleware/permission');
const dependencies = require('../repositories/dependencies.repository');
const table = require('../repositories/table.repository');
const audit = require('../services/audit.service');
const { ok, HttpError } = require('../utils/response');

/**
 * @param router   the router to add the two endpoints to
 * @param options  { table, pk, page, softDelete }
 */
module.exports = function mountPurge(router, options) {
  const name = options.table;
  const pk = options.pk || 'id';
  const page = options.page;
  const soft = options.softDelete !== false;

  router.get('/:id/dependents', requirePermission(page, LEVEL.WRITE), async function (req, res) {
    const row = await table.findById(name, pk, req.params.id);
    if (!row) throw new HttpError(404, 'common.notFound');

    const found = await dependencies.dependentsOf(name, pk, req.params.id);
    const blockers = dependencies.blockersIn(found);

    return ok(res, {
      dependents: found,
      blockers: blockers,
      can_purge: blockers.length === 0
    });
  });

  router.delete('/:id/permanent', requirePermission(page, LEVEL.SUPER), async function (req, res) {
    const row = await table.findById(name, pk, req.params.id);
    if (!row) throw new HttpError(404, 'common.notFound');

    /*
     * The recycle bin first. Destroying live data in one click is too easy to
     * do by accident, and the two-step is the whole reason the bin exists.
     */
    if (soft && !row.is_deleted) {
      throw new HttpError(409, 'common.moveItToThe');
    }

    const found = await dependencies.dependentsOf(name, pk, req.params.id);
    const blockers = dependencies.blockersIn(found);

    if (blockers.length) {
      throw new HttpError(409, 'common.otherRecordsStillRefer', blockers.map(function (b) {
        return b.count + ' in ' + b.table;
      }));
    }

    await table.hardDelete(name, pk, req.params.id);

    // The last trace of the row that will exist anywhere.
    audit.deleted(req.actor, name, req.params.id, row, page);
    return ok(res, null, 'common.deleted');
  });
};
