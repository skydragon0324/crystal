/**
 * Who is asking, as plain data.
 *
 * The audit trail needs to record the person and the request behind every
 * write - but a service that took `req` in order to pass it to the log would
 * be a service that cannot be called from anything except an HTTP handler.
 * The nightly warranty sweep, an import, a test would each have to invent a
 * fake request object to write one row.
 *
 * So the request is reduced to this object at the edge, by the middleware
 * below, and everything underneath deals in it instead.  The shape is
 * deliberately the audit_log columns themselves: nothing downstream has to
 * know how a request is put together.
 */

/** The actor behind one request.  Safe to call before authenticate has run. */
function actorOf(req) {
  const admin = (req && req.admin) || null;
  const forwarded = req && req.headers ? req.headers['x-forwarded-for'] : null;

  return {
    manager_id: admin ? admin.id : null,
    manager_login: admin ? admin.username : null,
    manager_name: admin ? admin.name : null,
    method: req ? req.method : null,
    path: req ? String(req.originalUrl || '').slice(0, 300) : null,
    ip: String(
      (forwarded ? String(forwarded).split(',')[0] : null) ||
      (req && req.ip) || ''
    ).slice(0, 45) || null
  };
}

/**
 * A caller that is not a person: the warranty expiry sweep, the low-stock
 * reorder run, a migration, a script.  Written to the trail with nobody
 * against it, which is exactly what it is - nobody decided this, the system
 * did it on a timer.
 */
const SYSTEM = {
  manager_id: null,
  manager_login: null,
  manager_name: 'system',
  method: null,
  path: null,
  ip: null
};

/** Resolves the actor once per request, so nothing downstream re-reads headers. */
function attachActor(req, res, next) {
  req.actor = actorOf(req);
  next();
}

module.exports = {
  actorOf: actorOf,
  attachActor: attachActor,
  SYSTEM: SYSTEM
};
