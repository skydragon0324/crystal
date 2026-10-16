'use strict';

const Router = require('express-promise-router');
const controller = require('../controllers/lifecycle.controller');
const { requirePermission, LEVEL } = require('../middleware/permission');

/**
 * CUSTOMER LIFECYCLE KPIs, mounted at /api/admin/customer-lifecycle.
 *
 * ONE PAGE GUARDS THE READS and the same page at WRITE level guards the two
 * things that are not reads. That is how permission works in this console -
 * a grant is per admin page URL, and `/admin/crm/lifecycle` is this feature's
 * page (registered by sql/deltas/055).
 *
 * WHY RECONCILIATION NEEDS WRITE: it is not a report. It streams the whole
 * source key space, imports what it finds, rebuilds the affected customers
 * and rewrites snapshots - work an operator should be trusted with
 * deliberately rather than by having been given a dashboard. It is audited
 * through lifecycle_job_run, which records who asked.
 *
 * THE BIRTHDAY IS IN THE TRANSITION LIST and that is a deliberate, narrow
 * exposure: requirement 11 asks for it in the detail columns, requirement 3
 * asks for access control around it. The page grant IS that control, which is
 * why these routes are not readable by anybody holding only some other CRM
 * page. Nothing here serves a password, a citizen id, a CID or a handset
 * identifier - none of them is copied into the analytics store at all.
 */
const router = Router();

const PAGE = '/admin/crm/lifecycle';

/* ---------------------------------------------------------------- reads */

/** Current or historical stock, totals, shares and freshness. */
router.get('/overview', requirePermission(PAGE, LEVEL.READ), controller.overview);

/** Stock at the end of each bucket - daily, calendar weekly, or custom N-day. */
router.get('/trend', requirePermission(PAGE, LEVEL.READ), controller.trend);

/** The transition matrix for a window, and flows per bucket. */
router.get('/transitions/summary', requirePermission(PAGE, LEVEL.READ), controller.transitionSummary);

/*
 * The paginated transition records. Declared AFTER /transitions/summary -
 * Express matches in order, and a bare `/transitions` registered first would
 * not shadow it, but keeping the more specific path first is the habit that
 * stops the next person adding `/transitions/:id` above it by accident.
 */
router.get('/transitions', requirePermission(PAGE, LEVEL.READ), controller.transitions);

/** Who was in a status at the end of a given day. */
router.get('/customers', requirePermission(PAGE, LEVEL.READ), controller.customers);

/** One customer's periods, recent logins and current state. */
router.get('/customers/:userPk/timeline', requirePermission(PAGE, LEVEL.READ), controller.timeline);

/** The rules themselves, so the UI's explanation cannot drift from them. */
router.get('/definitions', requirePermission(PAGE, LEVEL.READ), controller.definitions);

/** Checkpoints, freshness, exceptions and recent job runs. */
router.get('/health', requirePermission(PAGE, LEVEL.READ), controller.health);

/** The open data-quality exceptions themselves, newest first. */
router.get('/exceptions', requirePermission(PAGE, LEVEL.READ), controller.exceptions);

/* ---- the business events, and the comparison around one ---- */

/** The events to pick from. */
router.get('/events', requirePermission(PAGE, LEVEL.READ), controller.eventList);

/**
 * STOCK, FLOWS AND THE FIXED COHORT AROUND ONE INSTANT.
 *
 * `:eventId` may be the literal `ad-hoc`, with `?eventAt=`, so a comparison
 * can be drawn around a date nobody has stored yet - requirement 12.D. It is
 * a READ either way: it creates nothing.
 *
 * DECLARED BEFORE `/events/:eventId` for the same habit as /transitions
 * above. Express would match these two correctly whichever way round they
 * were, but keeping the longer path first is what stops the next person
 * adding one that does collide.
 */
router.get('/events/:eventId/impact', requirePermission(PAGE, LEVEL.READ), controller.eventImpact);

router.get('/events/:eventId', requirePermission(PAGE, LEVEL.READ), controller.eventDetail);

/* ---- the exports ---- */

/*
 * AT READ LEVEL, WHICH IS THE HOUSE CONVENTION - routes/crud.routes.js puts
 * every /export at READ and every /import at WRITE, because an export reads
 * exactly what the screen is already showing to the same person.
 *
 * Requirement 11 asks for large exports to be permissioned and bounded, and
 * both are true: the page grant is the permission, and the sheets page
 * through the API's own query up to excel.EXPORT_LIMIT - see
 * services/lifecycle/export.service.js. Every one of them is written to the
 * audit trail with its filter, its row count and whether it was truncated,
 * which is requirement 13's "audit sensitive exports".
 */
router.get('/trend/export', requirePermission(PAGE, LEVEL.READ), controller.exportTrend);
router.get('/transitions/export', requirePermission(PAGE, LEVEL.READ), controller.exportTransitions);
router.get('/customers/export', requirePermission(PAGE, LEVEL.READ), controller.exportCustomers);

/* --------------------------------------------------------------- writes */

/** A reconciliation pass, requested by hand. Audited, and never run twice. */
router.post('/jobs/reconcile', requirePermission(PAGE, LEVEL.WRITE), controller.reconcile);

/*
 * THE EVENT MANAGER, at WRITE - requirement 11 says a write needs the
 * elevated role. An event is a report parameter rather than a business
 * record, but it is a SHARED one: it names what everybody else's comparison
 * is centred on, and somebody moving the launch date by a day silently
 * changes every chart drawn around it. Every one of these three is written to
 * the audit trail.
 */
router.post('/events', requirePermission(PAGE, LEVEL.WRITE), controller.eventCreate);
router.put('/events/:eventId', requirePermission(PAGE, LEVEL.WRITE), controller.eventUpdate);
router.delete('/events/:eventId', requirePermission(PAGE, LEVEL.WRITE), controller.eventRemove);

module.exports = router;
