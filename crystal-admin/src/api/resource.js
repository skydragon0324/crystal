import client from './client';

/**
 * The seven calls every table behind the CRUD factory answers.
 *
 * The backend generates those endpoints from one options object; this is the
 * other half of that bargain, so adding a master table to the console is a
 * line in routes/admin.routes.js and a line in api/index.js rather than a
 * file of near-identical axios calls.
 *
 * A resource with rules of its own gets a module of its own and spreads this
 * in for the parts it still shares - see `tickets` in api/index.js, which is
 * createResource plus the ten endpoints a repair ticket has that a lookup
 * table does not.
 */
export function createResource(base) {
  return {
    base: base,

    list: (params) => client.get(base, { params }),
    options: (params) => client.get(base + '/options', { params }),
    get: (id, params) => client.get(base + '/' + id, { params }),

    create: (payload) => client.post(base, payload),
    update: (id, payload) => client.put(base + '/' + id, payload),
    remove: (id) => client.delete(base + '/' + id),
    restore: (id) => client.post(base + '/' + id + '/restore'),

    /*
     * The two halves of a PERMANENT delete.
     *
     * "dependents" is asked first so the confirmation can name what is in the
     * way, or what else goes with it - letting the delete fail on a foreign
     * key gives somebody a constraint name and nothing to do about it.
     */
    dependents: (id) => client.get(base + '/' + id + '/dependents'),
    purge: (id) => client.delete(base + '/' + id + '/permanent')
  };
}

export default createResource;
