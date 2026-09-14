const repo = require('../repositories/claims.repository');
const agencies = require('../repositories/agencies.repository');
const { transaction } = require('../repositories/shared/transaction');
const { HttpError } = require('../utils/response');
const { money } = require('../utils/query');
const audit = require('./audit.service');

const PAGE = '/admin/service/claims';
const TABLE = repo.TABLE;

const SORTABLE = ['id', 'claim_no', 'period_month', 'status', 'total_amount', 'ticket_count'];
const DEFAULT_SORT = 'period_month';

/**
 * Settlement.
 *
 * An in-warranty repair is free to the customer and not free to anybody else:
 * the centre did the work and consumed the part, and Crystal owes it that
 * money.  A claim is one month of those, batched, because paying them one
 * ticket at a time is a full time job for two people.
 *
 * The workflow is draft -> submitted -> approved | rejected -> paid, and the
 * only interesting rule in it is that a claim is BUILT from the tickets
 * rather than typed: a total somebody entered by hand is a total nobody can
 * check, and the tickets are right there.
 */

/** 0 draft, 1 submitted, 2 approved, 3 rejected, 4 paid, 9 cancelled. */
const STATUS = { DRAFT: 0, SUBMITTED: 1, APPROVED: 2, REJECTED: 3, PAID: 4, CANCELLED: 9 };

function search(filters, paging) {
  return repo.search(filters, paging);
}

async function detail(id, deleted) {
  const claim = await repo.findById(id, deleted);
  if (!claim) throw new HttpError(404, 'common.notFound');

  const tickets = await repo.ticketsOf(id);
  return { claim: claim, tickets: tickets };
}

/** What a claim for this month would contain, before anybody commits to it. */
function preview(agencyId, month) {
  return repo.claimableOf(agencyId, firstOfMonth(month));
}

/** Any day in a month means that month; the column stores the first of it. */
function firstOfMonth(value) {
  const text = String(value || '').slice(0, 10);
  if (/^\d{4}-\d{2}$/.test(text)) return text + '-01';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text.slice(0, 8) + '01';
  const now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-01';
}

/**
 * Builds the month's claim from the tickets it is made of.
 *
 * Everything - the count, the three sums, the tickets that belong to it - is
 * derived here and stamped onto both sides inside one transaction.  A claim
 * whose header says eleven tickets while twelve point at it is a claim
 * somebody has to reconcile by hand, and the way to never have one is to
 * never write the two separately.
 */
async function build(agencyId, month, actor) {
  const period = firstOfMonth(month);

  const agency = await agencies.findRow(agencyId);
  if (!agency) throw new HttpError(404, 'common.notFound');

  return transaction(async function (trx) {
    const existing = await repo.findForMonth(agencyId, period, trx);
    if (existing && !existing.is_deleted) {
      throw new HttpError(409, 'claims.aClaimForAlready', null, {
        month: period.slice(0, 7)
      });
    }

    const tickets = await repo.claimableOf(agencyId, period, trx);
    if (!tickets.length) {
      throw new HttpError(400, 'claims.thereAreNoCovered', null, {
        month: period.slice(0, 7)
      });
    }

    const totals = tickets.reduce(function (acc, ticket) {
      acc.parts += Number(ticket.parts_amount) || 0;
      acc.labour += Number(ticket.labour_amount) || 0;
      acc.total += Number(ticket.covered_amount) || 0;
      return acc;
    }, { parts: 0, labour: 0, total: 0 });

    const rows = await repo.insert({
      claim_no: await repo.nextNumber('C' + period.slice(0, 4) + period.slice(5, 7), trx),
      agency_id: agencyId,
      period_month: period,
      status: STATUS.DRAFT,
      ticket_count: tickets.length,
      parts_amount: money(totals.parts),
      labour_amount: money(totals.labour),
      total_amount: money(totals.total)
    }, trx);

    const claim = rows[0];
    await repo.attachTickets(claim.id, tickets.map(function (t) { return t.id; }), trx);

    audit.created(actor, TABLE, claim.id, claim, PAGE);
    return claim;
  });
}

/**
 * Which statuses may follow which.
 *
 * Short enough to read, and written down for the same reason the ticket
 * workflow is: "approved" going back to "draft" would let an approved amount
 * be edited after somebody signed it off.
 */
const FLOW = {
  0: [1, 9],
  1: [2, 3, 9],
  2: [4, 9],
  3: [1, 9],   // rejected claims are corrected and resubmitted
  4: [],
  9: []
};

async function transition(id, to, input, actor) {
  const next = Number(to);

  return transaction(async function (trx) {
    const claim = await repo.lockRow(id, trx);
    if (!claim || claim.is_deleted) throw new HttpError(404, 'common.notFound');
    if (claim.status === next) return claim;

    const allowed = FLOW[claim.status] || [];
    if (allowed.indexOf(next) === -1) {
      if (claim.status === STATUS.PAID) throw new HttpError(409, 'claims.thisClaimHasAlready');
      throw new HttpError(409, 'common.valueFailedAValidation');
    }

    const patch = { status: next };

    if (next === STATUS.SUBMITTED) {
      patch.submitted_at = new Date();
      patch.reject_reason = null;
    }

    if (next === STATUS.APPROVED) {
      patch.reviewed_at = new Date();
      patch.reviewed_by = actor ? actor.manager_id : null;
      /*
       * Head office may agree to less than was asked for, and the difference
       * between the two is the conversation.  Left unstated it means "all of
       * it", which is the common case and should not need typing.
       */
      patch.approved_amount = input && input.approved_amount !== undefined
        ? money(input.approved_amount)
        : claim.total_amount;
    }

    if (next === STATUS.REJECTED) {
      if (!input || !input.reject_reason) throw new HttpError(400, 'claims.aRejectedClaimNeeds');
      patch.reviewed_at = new Date();
      patch.reviewed_by = actor ? actor.manager_id : null;
      patch.reject_reason = String(input.reject_reason);
      patch.approved_amount = 0;
    }

    if (next === STATUS.PAID) patch.paid_at = new Date();

    /*
     * Cancelling hands the repairs back.  Without this they would carry a
     * claim_id for ever and never appear on another month's claim - the
     * centre would simply never be paid for them, and nothing would say why.
     */
    if (next === STATUS.CANCELLED) await repo.detachTickets(id, trx);

    const rows = await repo.update(id, patch, trx);
    audit.updated(actor, TABLE, id, claim, rows[0], PAGE);
    return rows[0];
  });
}

async function update(id, data, actor) {
  if (!Object.keys(data).length) throw new HttpError(400, 'common.nothingToUpdate');

  const previous = await repo.findRow(id);
  if (!previous) throw new HttpError(404, 'common.notFound');
  if (previous.status >= STATUS.APPROVED && previous.status !== STATUS.REJECTED) {
    throw new HttpError(409, 'common.valueFailedAValidation');
  }

  const rows = await repo.update(id, data);
  audit.updated(actor, TABLE, id, previous, rows[0], PAGE);
  return rows[0];
}

async function remove(id, actor) {
  const previous = await repo.findRow(id);
  if (!previous) throw new HttpError(404, 'common.notFound');
  if (previous.status === STATUS.PAID) throw new HttpError(409, 'claims.thisClaimHasAlready');

  await transaction(async function (trx) {
    await repo.detachTickets(id, trx);
    await repo.softDelete(id, trx);
  });

  audit.deleted(actor, TABLE, id, previous, PAGE);
}

module.exports = {
  PAGE: PAGE,
  STATUS: STATUS,
  SORTABLE: SORTABLE,
  DEFAULT_SORT: DEFAULT_SORT,
  COLUMNS: ['remark'],

  firstOfMonth: firstOfMonth,
  search: search,
  detail: detail,
  preview: preview,
  build: build,
  transition: transition,
  update: update,
  remove: remove
};
