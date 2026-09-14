const db = require('../config/db');
const { applySearch } = require('../utils/query');
const table = require('./table.repository');

/**
 * A repository for a plain master table.
 *
 * A dozen tables in this system are genuinely nothing but "list, read, write,
 * soft delete": specification groups, symptom catalogue, warranty policies,
 * FAQ categories.  Hand writing a repository for each would be a dozen copies
 * of the same fifteen lines, and the thirteenth would be the one with the
 * typo in it.
 *
 * So the shape is written once and bound to a table here.  A table that grows
 * a rule of its own graduates to a repository of its own - repair tickets and
 * part stock both started here and both left.  This is for the ones with no
 * rules at all.
 *
 *   table       : table name
 *   pk          : primary key column
 *   columns     : writable columns
 *   searchable  : columns covered by ?q=
 *   sortable    : columns accepted in ?sort=
 *   defaultSort : column ordered by when nothing is asked for
 *   softDelete  : DELETE sets is_deleted instead of removing the row
 *   decorate    : optional fn(queryBuilder) adding joins / extra selects
 */
module.exports = function createCrudRepository(opts) {
  const name = opts.table;
  const pk = opts.pk || 'id';
  const searchable = opts.searchable || [];
  const sortable = opts.sortable || [pk];
  const softDelete = opts.softDelete !== false;
  const defaultSort = opts.defaultSort || pk;
  const decorate = opts.decorate || null;

  /*
   * How this table narrows to a SECTION, for the ones that are managed by
   * two different people on two different pages.
   *
   * A section is a set of product category types, and most tables reach it
   * through a join rather than holding it - a price line has a product,
   * and the product has the category. So the table supplies the join
   * rather than the factory guessing at one.
   */
  const sectionFilter = opts.sectionFilter || null;

  /**
   * Rows visible to a request.  `deleted` flips the query over to the recycle
   * bin, so one endpoint serves both the active list and the restore list.
   */
  function scope(deleted, trx) {
    const qb = (trx || db)(name);
    if (!softDelete) return qb;
    return qb.where(name + '.is_deleted', !!deleted);
  }

  async function search(filters, paging) {
    /*
     * The section narrows BOTH queries.
     *
     * Applying it only to the rows and not to the count is how a table
     * shows ten of its own rows under a footer promising thirty.
     */
    const narrow = function (qb) {
      if (sectionFilter && filters.section_types && filters.section_types.length) {
        sectionFilter(qb, filters.section_types);
      }

      /*
       * Exact matches on the columns the route declared filterable. The
       * keys were checked against that allow-list before they got here, so
       * this can qualify and pass them straight through.
       */
      Object.keys(filters.match || {}).forEach(function (column) {
        qb.where(name + '.' + column, filters.match[column]);
      });

      return qb;
    };

    const countRow = await narrow(applySearch(scope(filters.deleted), searchable, filters.q))
      .count({ c: '*' }).first();

    const listQb = narrow(applySearch(scope(filters.deleted), searchable, filters.q));
    if (decorate) decorate(listQb);
    else listQb.select(name + '.*');

    const rows = await listQb
      .orderBy(
        sortable.indexOf(paging.sort) !== -1
          ? name + '.' + paging.sort
          : name + '.' + defaultSort,
        paging.dir
      )
      .limit(paging.limit)
      .offset(paging.offset);

    return { rows: rows, total: Number(countRow.c) };
  }

  /** The unpaged lookup a <Select> box needs. */
  function options(deleted) {
    return scope(deleted).select(name + '.*').orderBy(defaultSort, 'asc').limit(1000);
  }

  function findById(id, deleted) {
    return scope(deleted).where(name + '.' + pk, id).first();
  }

  return {
    table: name,
    pk: pk,
    softDelete: softDelete,

    search: search,
    options: options,
    findById: findById,

    // The write half has no per-table variation at all, so it is the generic
    // row repository with this table's name already filled in.
    findRow: function (id, trx) { return table.findById(name, pk, id, trx); },
    insert: function (data, trx) { return table.insert(name, data, trx); },
    update: function (id, data, trx) { return table.update(name, pk, id, data, trx); },
    remove: function (id, trx) {
      return softDelete
        ? table.softDelete(name, pk, id, trx)
        : table.hardDelete(name, pk, id, trx);
    },

    /*
     * GONE FOR GOOD, whatever this table normally does.
     *
     * "remove" respects the table's softDelete setting; this does not,
     * because it is the deliberate second step after a row is already in the
     * recycle bin. Only reached once the dependency check has passed.
     */
    purge: function (id, trx) { return table.hardDelete(name, pk, id, trx); },
    restore: function (id, trx) { return table.restore(name, pk, id, trx); }
  };
};
