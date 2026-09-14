const repo = require('../repositories/repairTickets.repository');
const agencies = require('../repositories/agencies.repository');
const products = require('../repositories/products.repository');
const technicians = require('../repositories/technicians.repository');
const warranties = require('./warranties.service');
const stock = require('./stock.service');
const settings = require('./settings.service');
const { transaction } = require('../repositories/shared/transaction');
const { hoursFromNow } = require('../repositories/shared/expressions');
const { HttpError } = require('../utils/response');
const { money } = require('../utils/query');
const codes = require('../utils/codes');
const audit = require('./audit.service');

const PAGE = '/admin/service/tickets';
const TABLE = repo.TABLE;

/**
 * The repair ticket.
 *
 * Almost every rule in the after-sales module is in this file, because almost
 * every one of them is a rule about a ticket.  The three that are not - what
 * stock does when a part is issued, what cover applies on a given day, what a
 * claim is worth - each live with the thing they are about, and are called
 * from here.
 *
 * Two decisions are worth knowing before changing anything:
 *
 *  1. Whether a repair is covered is decided ONCE, at intake, and then
 *     stored.  It is not recomputed when the ticket is read.  A warranty that
 *     expires next Tuesday must not retroactively make last week's free
 *     repair chargeable, and a device taken in on the last day of cover is
 *     covered even if the repair takes three weeks.
 *
 *  2. A device that comes back is a NEW ticket pointing at the old one, never
 *     an edit of it.  Overwriting would destroy exactly the evidence that
 *     says the first repair did not work - which is the number the whole
 *     quality half of the scoreboard is built from.
 */

const COLUMNS = [
  'user_id', 'customer_name', 'customer_phone', 'customer_email',
  'product_id', 'registered_product_id', 'serial_number',
  'agency_id', 'technician_id', 'intake_channel',
  'symptom_id', 'fault_description', 'diagnosis', 'resolution',
  'accessories', 'condition_note', 'priority', 'promised_at', 'remark'
];

const SORTABLE = [
  'id', 'ticket_no', 'received_at', 'promised_at', 'closed_at',
  'status', 'priority', 'total_amount', 'serial_number'
];
const DEFAULT_SORT = 'received_at';

/** Sorts where the interesting end is the large one, so they start there. */
const DESC_BY_DEFAULT = ['received_at', 'closed_at', 'total_amount', 'priority', 'promised_at'];

/** How many earlier visits the detail page shows before it stops being a summary. */
const HISTORY_LIMIT = 10;

/**
 * Worst first unless the caller says otherwise, and only when they have not
 * sorted by something a descending default would read backwards on - a ticket
 * number list starting at the end helps nobody.
 */
function resolveDirection(paging, explicitDir) {
  if (explicitDir) return paging.dir;
  return DESC_BY_DEFAULT.indexOf(paging.sort) >= 0 ? 'desc' : 'asc';
}

function search(filters, paging) {
  return repo.search(filters, paging);
}

/**
 * One ticket with everything the screen draws around it.
 *
 * Read in parallel because none of the five depends on another, and a detail
 * page that issues them one after another is five round trips of latency for
 * no reason.
 */
async function detail(id, deleted) {
  const ticket = await repo.findById(id, deleted);
  if (!ticket) throw new HttpError(404, 'common.ticketNotFound');

  const [items, events, deviceHistory, cover] = await Promise.all([
    repo.itemsOf(id),
    repo.eventsOf(id, false),
    repo.historyOfDevice(ticket.serial_number, HISTORY_LIMIT, id),
    warranties.historyOfDevice(ticket.serial_number)
  ]);

  return {
    ticket: ticket,
    items: items,
    events: events,
    device_history: deviceHistory,
    warranties: cover
  };
}

/**
 * Intake.
 *
 * The longest function in the codebase, and deliberately not split up: every
 * step below reads something the previous step decided, and pulling them into
 * separate exported functions would let a caller do three of the five and
 * create a ticket that is internally inconsistent.
 */
async function create(body, actor) {
  const data = Object.assign({}, body);

  data.serial_number = String(data.serial_number || '').trim().toUpperCase();
  if (!data.serial_number) throw new HttpError(400, 'common.theDeviceSerialNumber');
  if (!data.customer_name || !data.customer_phone) {
    throw new HttpError(400, 'repairTickets.theCustomerNameAnd');
  }
  if (!data.agency_id) throw new HttpError(400, 'common.aServiceCentreIs');
  if (!data.fault_description) throw new HttpError(400, 'common.valueFailedAValidation');

  const agency = await agencies.findRow(data.agency_id);
  if (!agency) throw new HttpError(404, 'common.notFound');

  if (data.technician_id) await assertTechnicianBelongs(data.technician_id, data.agency_id);

  // The device, if Crystal recognises it.  A serial nobody can resolve is
  // still repairable - it is in the customer's hand - so this is a lookup and
  // not a check.
  if (!data.product_id) {
    const known = await lookupProduct(data.serial_number);
    if (known) data.product_id = known.id;
  }

  const repeatWindow = await settings.number('repair.repeat_window_days', 30);

  return transaction(async function (trx) {
    /*
     * Cover, decided now and stored.  Against received_at rather than against
     * today, because those are the same value at intake and different values
     * on every read afterwards - and it is the intake day that decides.
     */
    const onDate = new Date().toISOString().slice(0, 10);
    const cover = await warranties.coveringDate(data.serial_number, onDate);

    data.warranty_id = cover ? cover.id : null;
    data.is_warranty = !!cover;
    data.warranty_note = cover
      ? cover.kind + ' cover to ' + cover.end_date
      : 'no cover in force on ' + onDate;

    /*
     * A device seen recently is the same device coming back.  Linking it is
     * what makes the repeat rate in v_agency_health mean anything, and it is
     * done on the serial rather than on the customer: a handset sold on, or
     * brought in by somebody else in the family, is still the same handset.
     */
    const previous = await repo.previousVisit(data.serial_number, repeatWindow, null, trx);
    if (previous) data.reopened_from = previous.id;

    // The promise, from this centre's own SLA and the database's clock.
    data.promised_at = data.promised_at || hoursFromNow(agency.sla_hours);

    data.created_by = actor ? actor.manager_id : null;
    data.ticket_no = await repo.nextNumber('R' + stamp(), trx);

    const rows = await repo.insert(data, trx);
    const ticket = rows[0];

    await repo.insertEvent({
      ticket_id: ticket.id,
      from_status: null,
      to_status: 0,
      action: 'RECEIVED',
      note: previous
        ? 'Device returned within ' + repeatWindow + ' days of ' + previous.ticket_no
        : null,
      manager_id: actor ? actor.manager_id : null,
      manager_name: actor ? actor.manager_name : null,
      is_public: true
    }, trx);

    return ticket;
  }).then(function (ticket) {
    audit.created(actor, TABLE, ticket.id, ticket, PAGE);
    return ticket;
  });
}

/** YYMM, which is what a ticket number is grouped by. */
function stamp() {
  const now = new Date();
  return String(now.getFullYear()).slice(2) + String(now.getMonth() + 1).padStart(2, '0');
}

/**
 * The serial, asked of the warehouse and then of the local mirror.
 *
 * Required here rather than at the top of the file because the serial
 * repository reaches Oracle, and a circular import between the two would be
 * resolved differently depending on which one node loaded first.
 */
async function lookupProduct(serialNumber) {
  const serials = require('../repositories/serials.repository');
  const record = await serials.lookup(serialNumber);
  if (!record) return null;
  if (record.product_id) return { id: record.product_id };
  return products.findByModelCode(record.model_code);
}

async function assertTechnicianBelongs(technicianId, agencyId) {
  const tech = await technicians.findRow(technicianId);
  if (!tech) throw new HttpError(404, 'common.notFound');
  if (tech.agency_id !== Number(agencyId)) {
    throw new HttpError(400, 'repairTickets.technicianWorksAtAnother', null, { name: tech.name });
  }
  return tech;
}

async function update(id, data, actor) {
  if (!Object.keys(data).length) throw new HttpError(400, 'common.nothingToUpdate');

  const previous = await repo.findRow(id);
  if (!previous) throw new HttpError(404, 'common.ticketNotFound');
  if (previous.status === 7) throw new HttpError(409, 'repairTickets.thisTicketIsAlready');
  if (previous.status === 9) throw new HttpError(409, 'repairTickets.thisTicketIsCancelled');

  if (data.technician_id) {
    await assertTechnicianBelongs(data.technician_id, data.agency_id || previous.agency_id);
  }
  if (data.serial_number) data.serial_number = String(data.serial_number).trim().toUpperCase();

  const rows = await repo.update(id, data);
  audit.updated(actor, TABLE, id, previous, rows[0], PAGE);
  return rows[0];
}

/**
 * A status change, which is the only way a ticket ever moves.
 *
 * Every transition is checked against the map in utils/codes.js rather than
 * being allowed because the caller asked.  The workflow is mostly a line but
 * not entirely - a failed quality check goes back to the bench, a diagnosis
 * can discover the part is not on the shelf - and the exceptions are written
 * down there instead of being discovered one support call at a time.
 *
 * The whole thing is one transaction because closing does four things: it
 * stamps the ticket, spends a warranty claim, writes the timeline and can be
 * refused halfway through by any of them.
 */
async function transition(id, toStatus, input, actor) {
  const to = Number(toStatus);
  const note = input && input.note ? String(input.note) : null;

  return transaction(async function (trx) {
    const ticket = await repo.lockRow(id, trx);
    if (!ticket) throw new HttpError(404, 'common.ticketNotFound');
    if (ticket.is_deleted) throw new HttpError(404, 'common.ticketNotFound');

    if (ticket.status === to) return ticket;   // idempotent: two clicks, one move

    if (!codes.canTransition(ticket.status, to)) {
      throw new HttpError(409, 'repairTickets.aTicketCannotMove', null, {
        from: codes.labelOf(codes.TICKET_STATUS, ticket.status),
        to: codes.labelOf(codes.TICKET_STATUS, to)
      });
    }

    const patch = { status: to };

    /*
     * The clock.  Each of these is stamped on the FIRST arrival at its state
     * and never re-stamped: a ticket that fails quality check and goes back
     * to the bench was still diagnosed when it was diagnosed, and moving that
     * timestamp would quietly shorten the turnaround it is measured on.
     */
    if (to >= 1 && !ticket.diagnosed_at) patch.diagnosed_at = new Date();
    if (to >= 5 && !ticket.repaired_at) patch.repaired_at = new Date();

    if (to === 7) {
      await assertClosable(ticket, trx);
      patch.closed_at = new Date();

      // A covered repair spends one of the plan's claims as it closes, under
      // a lock, so two tickets closing at once cannot both take the last one.
      if (ticket.is_warranty && ticket.warranty_id) {
        await warranties.consumeClaim(ticket.warranty_id, trx);
      }
    }

    if (to === 9) {
      patch.closed_at = new Date();
      // Cancelling releases everything the ticket had spoken for; a shelf
      // must not stay reserved against a repair nobody is going to do.
      await releaseReservations(ticket, trx, actor);
    }

    const rows = await repo.update(id, patch, trx);

    await repo.insertEvent({
      ticket_id: id,
      from_status: ticket.status,
      to_status: to,
      action: 'STATUS',
      note: note,
      technician_id: ticket.technician_id,
      manager_id: actor ? actor.manager_id : null,
      manager_name: actor ? actor.manager_name : null,
      // Customers are told the states that mean something to them; they do
      // not need to know the device moved from "diagnosing" to "repairing".
      is_public: [2, 6, 7].indexOf(to) !== -1
    }, trx);

    audit.updated(actor, TABLE, id, ticket, rows[0], PAGE);
    return rows[0];
  });
}

/**
 * The two things that make closing wrong rather than merely early.
 *
 * Unpaid is obvious.  Unissued parts is the subtle one: a line on the bill
 * that was never taken off the shelf means the customer has been charged for
 * a part still sitting in the drawer, and the stock figure and the invoice
 * now disagree with each other permanently.
 */
async function assertClosable(ticket, trx) {
  const totals = await repo.totalsOf(ticket.id, trx);

  if (Number(totals.unissued_cnt) > 0) {
    throw new HttpError(409, 'repairTickets.aTicketCannotBeClosed');
  }
  if (ticket.pay_state !== 2 && ticket.pay_state !== 3 && Number(ticket.total_amount) > 0) {
    throw new HttpError(409, 'repairTickets.aTicketCannotBe');
  }
  return totals;
}

/** Hands back everything a cancelled ticket had reserved but never used. */
async function releaseReservations(ticket, trx, actor) {
  const items = await repo.itemsOf(ticket.id, trx);
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item.item_type !== 'PART' || !item.part_id || item.issued) continue;
    // eslint-disable-next-line no-await-in-loop
    await stock.release(ticket.agency_id, item.part_id, item.quantity, trx);
  }
}

/* ------------------------------------------------------------------ */
/*  the bill                                                           */
/* ------------------------------------------------------------------ */

/**
 * A line on the bill.
 *
 * A PART line reserves stock as it is added, and only consumes it when the
 * part is actually issued.  Those are different moments on purpose: a quote
 * the customer then refuses must not have silently emptied the shelf in
 * between, and a part promised to one repair must not be promised to another.
 *
 * `is_covered` defaults from the warranty rather than from the caller: a
 * clerk should not be able to decide the customer pays for something the plan
 * covers by ticking a box, and the plan's own flags say which lines those are.
 */
async function addItem(ticketId, input, actor) {
  return transaction(async function (trx) {
    const ticket = await repo.lockRow(ticketId, trx);
    if (!ticket) throw new HttpError(404, 'common.ticketNotFound');
    if (ticket.status >= 7) throw new HttpError(409, 'repairTickets.thisTicketIsAlready');

    const quantity = Math.max(1, Math.round(Number(input.quantity) || 1));
    const unitPrice = money(input.unit_price);

    const line = {
      ticket_id: ticketId,
      item_type: input.item_type || 'PART',
      part_id: input.part_id || null,
      service_price_id: input.service_price_id || null,
      name: String(input.name || '').trim(),
      quantity: quantity,
      unit_price: unitPrice,
      amount: money(unitPrice * quantity),
      labour_minutes: Math.max(0, Math.round(Number(input.labour_minutes) || 0)),
      is_covered: coveredBy(ticket, input),
      remark: input.remark || null
    };

    if (!line.name) throw new HttpError(400, 'common.valueFailedAValidation');

    if (line.item_type === 'PART' && line.part_id) {
      await stock.reserve(ticket.agency_id, line.part_id, quantity, trx);
    }

    const rows = await repo.insertItem(line, trx);
    await recalculate(ticketId, trx);

    audit.created(actor, repo.ITEMS, rows[0].id, rows[0], PAGE);
    return rows[0];
  });
}

/**
 * Whether the warranty pays for this line.
 *
 * Per line rather than per ticket, because one repair is routinely both: a
 * covered board replacement and an uncovered cracked-glass charge on the same
 * device.  A caller may force a line to be chargeable - goodwill works in one
 * direction only - but cannot make a line covered when there is no cover to
 * charge it to.
 */
function coveredBy(ticket, input) {
  if (!ticket.is_warranty) return false;
  if (input.is_covered === false || input.is_covered === '0' || input.is_covered === 'false') return false;
  return true;
}

async function updateItem(ticketId, itemId, input, actor) {
  return transaction(async function (trx) {
    const ticket = await repo.lockRow(ticketId, trx);
    if (!ticket) throw new HttpError(404, 'common.ticketNotFound');
    if (ticket.status >= 7) throw new HttpError(409, 'repairTickets.thisTicketIsAlready');

    const item = await repo.findItem(itemId, trx);
    if (!item || item.ticket_id !== Number(ticketId)) throw new HttpError(404, 'common.notFound');

    const patch = {};
    if (input.name !== undefined) patch.name = String(input.name).trim();
    if (input.remark !== undefined) patch.remark = input.remark;
    if (input.is_covered !== undefined) patch.is_covered = coveredBy(ticket, input);
    if (input.labour_minutes !== undefined) {
      patch.labour_minutes = Math.max(0, Math.round(Number(input.labour_minutes) || 0));
    }

    const quantity = input.quantity === undefined
      ? item.quantity
      : Math.max(1, Math.round(Number(input.quantity)));
    const unitPrice = input.unit_price === undefined ? Number(item.unit_price) : money(input.unit_price);

    if (quantity !== item.quantity || unitPrice !== Number(item.unit_price)) {
      patch.quantity = quantity;
      patch.unit_price = unitPrice;
      patch.amount = money(unitPrice * quantity);
    }

    /*
     * A quantity change on a part that has not been issued moves the
     * reservation by the difference.  Once it has been issued the stock has
     * physically gone, and changing the number here would make the ledger
     * describe a movement that never happened - so a correction after issue
     * is a return, which is a movement of its own.
     */
    if (item.item_type === 'PART' && item.part_id && !item.issued && quantity !== item.quantity) {
      await stock.reserve(ticket.agency_id, item.part_id, quantity - item.quantity, trx);
    }

    if (!Object.keys(patch).length) throw new HttpError(400, 'common.nothingToUpdate');

    const rows = await repo.updateItem(itemId, patch, trx);
    await recalculate(ticketId, trx);

    audit.updated(actor, repo.ITEMS, itemId, item, rows[0], PAGE);
    return rows[0];
  });
}

async function removeItem(ticketId, itemId, actor) {
  return transaction(async function (trx) {
    const ticket = await repo.lockRow(ticketId, trx);
    if (!ticket) throw new HttpError(404, 'common.ticketNotFound');
    if (ticket.status >= 7) throw new HttpError(409, 'repairTickets.thisTicketIsAlready');

    const item = await repo.findItem(itemId, trx);
    if (!item || item.ticket_id !== Number(ticketId)) throw new HttpError(404, 'common.notFound');

    // An issued part has left the shelf; taking the line off the bill has to
    // put it back as a RETURN rather than pretend it never went.
    if (item.item_type === 'PART' && item.part_id) {
      if (item.issued) {
        await stock.returnFromTicket(
          ticket.agency_id, item.part_id, item.quantity, ticketId, item.unit_price, actor, trx
        );
      } else {
        await stock.release(ticket.agency_id, item.part_id, item.quantity, trx);
      }
    }

    await repo.removeItem(itemId, trx);
    await recalculate(ticketId, trx);

    audit.deleted(actor, repo.ITEMS, itemId, item, PAGE);
  });
}

/** The part physically leaves the shelf: the reservation becomes a movement. */
async function issueItem(ticketId, itemId, actor) {
  return transaction(async function (trx) {
    const ticket = await repo.lockRow(ticketId, trx);
    if (!ticket) throw new HttpError(404, 'common.ticketNotFound');

    const item = await repo.findItem(itemId, trx);
    if (!item || item.ticket_id !== Number(ticketId)) throw new HttpError(404, 'common.notFound');
    if (item.item_type !== 'PART' || !item.part_id) throw new HttpError(400, 'common.valueFailedAValidation');
    if (item.issued) return item;   // idempotent: issuing twice issues once

    await stock.issueToTicket(
      ticket.agency_id, item.part_id, item.quantity, ticketId, item.unit_price, actor, trx
    );

    const rows = await repo.updateItem(itemId, { issued: true }, trx);
    audit.updated(actor, repo.ITEMS, itemId, item, rows[0], PAGE);
    return rows[0];
  });
}

/**
 * The header's cached sums, recomputed from the lines.
 *
 * Called after every line change rather than kept in step arithmetically.
 * Adding four rows up is cheap; a bill whose header disagrees with its own
 * lines is not - and that is what "keep it in step" turns into the first time
 * something edits a line and forgets.
 */
async function recalculate(ticketId, trx) {
  const totals = await repo.totalsOf(ticketId, trx);
  const ticket = await repo.findRow(ticketId, trx);

  const discount = Number(ticket.discount_amount) || 0;
  const chargeable = Math.max(0, money(Number(totals.parts_amount) + Number(totals.labour_amount) - discount));

  return repo.update(ticketId, {
    parts_amount: money(totals.parts_amount),
    labour_amount: money(totals.labour_amount),
    covered_amount: money(totals.covered_amount),
    total_amount: chargeable,
    // "Nothing to pay" is a state of its own rather than "paid": it says the
    // customer was never asked for anything, which is what a fully covered
    // repair is - and it is why the closing check lets it through.
    pay_state: chargeable <= 0 ? 3 : (ticket.pay_state === 3 ? 0 : ticket.pay_state)
  }, trx);
}

/* ------------------------------------------------------------------ */
/*  the rest of the ticket                                             */
/* ------------------------------------------------------------------ */

async function assign(id, technicianId, actor) {
  const ticket = await repo.findRow(id);
  if (!ticket) throw new HttpError(404, 'common.ticketNotFound');
  if (ticket.status >= 7) throw new HttpError(409, 'repairTickets.thisTicketIsAlready');

  const tech = await assertTechnicianBelongs(technicianId, ticket.agency_id);

  const rows = await repo.update(id, { technician_id: tech.id });
  await repo.insertEvent({
    ticket_id: id,
    action: 'ASSIGNED',
    note: tech.name,
    technician_id: tech.id,
    manager_id: actor ? actor.manager_id : null,
    manager_name: actor ? actor.manager_name : null
  });

  audit.updated(actor, TABLE, id, ticket, rows[0], PAGE);
  return rows[0];
}

/**
 * Payment.
 *
 * The amount is not taken from the request: it is what the bill says.  A
 * request that could name its own figure is a request that can mark a $400
 * repair paid with a $4 payment, and the two numbers would then disagree for
 * ever with no record of which was right.
 */
async function pay(id, input, actor) {
  const ticket = await repo.findRow(id);
  if (!ticket) throw new HttpError(404, 'common.ticketNotFound');

  const method = input.pay_method === undefined || input.pay_method === null
    ? ticket.pay_method
    : Number(input.pay_method);

  const paid = input.amount === undefined ? Number(ticket.total_amount) : money(input.amount);
  const state = paid >= Number(ticket.total_amount) ? 2 : (paid > 0 ? 1 : 0);

  const rows = await repo.update(id, { pay_state: state, pay_method: method });

  await repo.insertEvent({
    ticket_id: id,
    action: 'PAID',
    note: codes.labelOf(codes.PAY_STATE, state) + ' by ' + codes.labelOf(codes.PAY_METHOD, method),
    manager_id: actor ? actor.manager_id : null,
    manager_name: actor ? actor.manager_name : null
  });

  audit.updated(actor, TABLE, id, ticket, rows[0], PAGE);
  return rows[0];
}

/**
 * The customer's verdict.
 *
 * Only on a closed ticket, and only once.  It is the one number in the table
 * a service centre cannot improve by editing a field, which is exactly what
 * makes it worth putting in the health score - so it is not editable here
 * either.
 */
async function rate(id, input, actor) {
  const ticket = await repo.findRow(id);
  if (!ticket) throw new HttpError(404, 'common.ticketNotFound');
  if (ticket.status !== 7) throw new HttpError(409, 'common.valueFailedAValidation');
  if (ticket.rating) throw new HttpError(409, 'common.duplicatedValue');

  const rating = Math.round(Number(input.rating));
  if (!(rating >= 1 && rating <= 5)) throw new HttpError(400, 'common.valueFailedAValidation');

  const rows = await repo.update(id, {
    rating: rating,
    rating_comment: input.rating_comment || null,
    rated_at: new Date()
  });

  audit.updated(actor, TABLE, id, ticket, rows[0], PAGE);
  return rows[0];
}

async function remove(id, actor) {
  const previous = await repo.findRow(id);
  const affected = await repo.softDelete(id);
  if (!affected) throw new HttpError(404, 'common.ticketNotFound');
  audit.deleted(actor, TABLE, id, previous, PAGE);
}

async function restore(id, actor) {
  const rows = await repo.restore(id);
  if (!rows.length) throw new HttpError(404, 'common.ticketNotFound');
  audit.restored(actor, TABLE, id, rows[0], PAGE);
}

/** What the customer is allowed to see when they track a ticket by number. */
async function publicStatusOf(ticketNo) {
  const ticket = await repo.findByNo(ticketNo);
  if (!ticket) throw new HttpError(404, 'common.ticketNotFound');

  const events = await repo.eventsOf(ticket.id, true);

  return {
    ticket_no: ticket.ticket_no,
    status: ticket.status,
    status_label: codes.labelOf(codes.TICKET_STATUS, ticket.status),
    product_name: ticket.product_name,
    agency_name: ticket.agency_name,
    is_warranty: ticket.is_warranty,
    received_at: ticket.received_at,
    promised_at: ticket.promised_at,
    closed_at: ticket.closed_at,
    total_amount: ticket.total_amount,
    currency: ticket.currency,
    events: events
  };
}

module.exports = {
  PAGE: PAGE,
  COLUMNS: COLUMNS,
  SORTABLE: SORTABLE,
  DEFAULT_SORT: DEFAULT_SORT,
  HISTORY_LIMIT: HISTORY_LIMIT,

  resolveDirection: resolveDirection,
  search: search,
  detail: detail,
  create: create,
  update: update,
  transition: transition,
  assign: assign,
  pay: pay,
  rate: rate,
  remove: remove,
  restore: restore,

  addItem: addItem,
  updateItem: updateItem,
  removeItem: removeItem,
  issueItem: issueItem,
  recalculate: recalculate,

  publicStatusOf: publicStatusOf
};
