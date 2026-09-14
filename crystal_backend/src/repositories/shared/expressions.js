const db = require('../../config/db');

/**
 * Values a service can ask for that only the database can produce.
 *
 * `now()` is the database's clock, not this process's.  A service that
 * stamped a ticket with `new Date()` would be recording the API server's idea
 * of the time, which is a different clock from the one every other timestamp
 * on that ticket came from - and the two only have to disagree by a second
 * for "was this closed before it was promised" to be answered wrongly.
 *
 * It lives with the repositories because knowing what a database timestamp is
 * made of is a storage concern.  A service imports the value and hands it
 * back as data; it never builds a query out of it.
 */

/** The database's own current timestamp, for a column being written now. */
function now() {
  return db.fn.now();
}

/** Today, as the database sees it - for date columns rather than timestamps. */
function today() {
  return db.raw('CURRENT_DATE');
}

/**
 * A timestamp a fixed number of hours from now, worked out by the database.
 *
 * This is what stamps a ticket's promised_at from its centre's SLA.  Doing it
 * in JavaScript would put a promise made by one clock next to a completion
 * recorded by another, and the difference between them is the number the
 * whole scoreboard in section 9 is built on.
 */
function hoursFromNow(hours) {
  return db.raw("now() + (? || ' hours')::interval", [Number(hours) || 0]);
}

module.exports = { now: now, today: today, hoursFromNow: hoursFromNow };
