/**
 * The paperwork the running business leaves behind.
 *
 * Seed 06 closes several hundred repairs and stops there, which leaves the
 * back half of the spec with nothing in it: no centre has ever claimed a
 * covered repair back from head office, no shelf has ever been restocked, no
 * member has ever paid for anything, and nobody has ever complained.  Those
 * are four screens that load, and show an empty state, on a database that is
 * otherwise busy.
 *
 * Everything here is DERIVED from what seeds 01-06 already wrote rather than
 * invented alongside it, because all four of these tables are ledgers with a
 * cached total somewhere else:
 *
 *   claims        aggregate real closed tickets, and stamp claim_id onto them
 *   replenishments that were received move real stock, so they write movements
 *   wallet rows   carry balance_after, and wallets.balance caches the last one
 *
 * Inventing the numbers instead would produce a database that renders and
 * does not reconcile - and `npm run check` asserts exactly those
 * reconciliations, so it would fail the project's own consistency tests.
 */

/** Deterministic, so the same seed always produces the same database. */
function rng(seed) {
  let state = seed;
  return function next(max) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state % max;
  };
}

function stampDaysAgo(days) {
  return new Date(Date.now() - days * 86400000);
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

/** Two decimal places, the way the claims service rounds money. */
function money(value) {
  return Math.round(Number(value) * 100) / 100;
}

/** The first of a month, `months` before this one - the claim period key. */
function monthStart(months) {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1));
  return d.toISOString().slice(0, 10);
}

const FEEDBACK = [
  ['PRODUCT', 'Battery life after 5.2', 'Since the update my C7 gets through noticeably less of the day. Nothing else changed - same apps, same routine. Is this expected while it settles, or is it worth booking in?'],
  ['REPAIR', 'Screen replacement was quicker than quoted', 'Booked for three days, got it back the next afternoon. The technician also cleaned the earpiece mesh without being asked. Nothing to fix here, I just wanted it recorded.'],
  ['WEBSITE', 'Compare page drops my fourth product', 'I add four handsets to compare and the last one falls off when the page reloads. Chrome on Windows.'],
  ['ACCOUNT', 'Cannot bind a second phone number', 'I have moved country and want to add a new number without losing the old one. The form only seems to accept a replacement.'],
  ['SUGGESTION', 'Publish parts prices as a downloadable table', 'The per-product pricing pages are good but I look after eleven devices across a family. One table I could keep would save me a lot of clicking.'],
  ['PRODUCT', 'Vision 55 loses HDMI 2 after standby', 'Set-top box on HDMI 2 is not detected after the television has been off overnight. Unplugging the cable and back in fixes it until the next morning.'],
  ['REPAIR', 'Charged for a part I was told was covered', 'The centre told me the charge port was under the extended cover and then the invoice had it as billable. It may well be my misunderstanding but I would like it checked.'],
  ['GENERAL', 'Thank you for keeping the C3 supported', 'Six years and it still gets security updates. I am aware this costs you money and gains you nothing. It is the reason I am buying a C9 next month.'],
  ['PRODUCT', 'Optic R1 firmware 2.1 and tethering', 'Tethered capture now works without the desktop app, which is excellent. It does still need the app for lens firmware though - is that going to change?'],
  ['WEBSITE', 'Repair tracking needs the ticket number to be case sensitive', 'Typing my ticket number in lower case returns nothing. It should probably just work.'],
  ['SUGGESTION', 'Let me see which centre fitted a part', 'Parts provenance in 5.2 shows the date but not always the centre. Would be useful when a repair needs revisiting.'],
  ['REPAIR', 'Collection point staff could not tell me the status', 'The drop-off was easy but nobody at the collection point could tell me where the device had got to. The tracking page knew. They did not.'],
  ['ACCOUNT', 'Points did not appear after registering a television', 'Registered a Vision 65 last week, the device shows in my account but the points have not arrived.'],
  ['PRODUCT', 'C5 Plus rear camera focus hunting', 'In low light the rear camera hunts and then settles a fraction soft. Started after 5.1, still there on 5.2.'],
  ['GENERAL', 'The repairability panel changed my mind', 'I was going to replace rather than repair. Seeing the part price on the device before I committed is what stopped me.'],
  ['WEBSITE', 'Service centre map does not show opening hours', 'The list has them, the map popup does not. I checked the map, drove over, and it was closed.'],
  ['SUGGESTION', 'Email when extended cover is about to lapse', 'I would renew if I knew. I found out mine had expired when I needed it.'],
  ['PRODUCT', 'Studio 16 fan noise under light load', 'The fan spins up for background tasks that should not warrant it. Not a fault as such, but noticeable in a quiet room.'],
  ['REPAIR', 'Loan device made the whole thing painless', 'Given a loan handset for the four days mine was in. Did not know that was offered - it should be advertised more clearly at booking.'],
  ['ACCOUNT', 'Two accounts with the same email', 'I appear to have registered twice, once with the phone flow and once with email. My devices are split across both.'],
  ['PRODUCT', 'Link Karaoke microphone latency', 'There is a perceptible delay between singing and hearing it back through the television. Fine through headphones.'],
  ['GENERAL', 'Warranty terms are actually readable', 'Whoever wrote the extended cover page in plain English - thank you. I understood what I was buying for once.'],
  ['WEBSITE', 'Blog images are slow on mobile data', 'The article covers take a long time to appear on a poor connection. The text arrives immediately, which makes the wait more obvious.'],
  ['SUGGESTION', 'Sell the screwdriver', 'The fasteners need a specific driver. Selling the right one alongside the parts would make the repairability position complete.'],
  ['REPAIR', 'Second visit for the same fault', 'Charge port replaced six weeks ago, same symptom is back. I am not annoyed yet but I would like it looked at properly this time.'],
  ['PRODUCT', 'C9 Pro overheats while charging and navigating', 'Wireless charging in a car mount with navigation running gets hot enough that the screen dims. Wired is fine.']
];

/** Replies, in the order the ANSWERED rows below consume them. */
const REPLIES = [
  'Thank you for reporting this. A new build re-indexes in the background for the first few days, which does cost battery - it should settle. If it has not after a week, please book a check and quote this thread.',
  'Passed on to the centre concerned. Thank you for taking the trouble to say so when nothing was wrong.',
  'Reproduced, and it is a bug on our side rather than anything you did. The compare list is capped at four and the fourth is being dropped on reload. Fix is in the next release.',
  'You can hold both - the second number has to be added from Profile rather than from the sign-in screen, which is not obvious. We are relabelling it.',
  'A downloadable parts price list is a fair request and is on the list. No date yet, but you are not the first to ask.',
  'This is a known handshake issue with some set-top boxes after standby. Setting the input to stay awake in Settings works around it; a firmware fix is in test.',
  'Checked, and you were right - the port was covered and it was billed in error. The charge has been reversed and the centre has been told what went wrong.',
  'We will pass this on. It genuinely does make the case internally when somebody says it.',
  'Lens firmware still goes through the desktop app for now. Moving it onto the body is planned but is not in 2.1.',
  'Fixed - ticket lookup is now case-insensitive. Apologies for the runaround.'
];

exports.seed = async function seed(knex) {
  const random = rng(20260827);

  const managers = await knex('managers').select('id', 'username', 'name', 'role_id');
  function managerBy(username) {
    return managers.find(function (row) { return row.username === username; }) || null;
  }
  const headOffice = managerBy('ops') || managers[0];
  const platform = managerBy('admin') || managers[0];
  const editor = managerBy('editor') || managers[0];

  /* ================================================================== */
  /*  1. member feedback                                                 */
  /* ================================================================== */

  const members = await knex('users')
    .where('status', 'ACTIVE')
    .orderBy('id')
    .select('id', 'email', 'phone', 'nickname');

  if (members.length) {
    /*
     * FEEDBACK IS A CONVERSATION, so the seed has to produce one.
     *
     * A thread carries the subject and the state; the messages underneath it
     * are the exchange. Four states, weighted the way a real queue sits: most
     * of it has been answered, a little is waiting, and a couple have aged
     * out. A table where every thread is PENDING cannot demonstrate the reply
     * flow, and one where every thread is RESOLVED cannot demonstrate the
     * queue.
     */
    const SOURCES = [
      'SMARTPHONE', 'EPRODUCT', 'ESHOP', 'APPSTORE',
      'SMARTPHONE_REGISTER', 'EPRODUCT_REGISTER', 'CRYSTAL_APP'
    ];

    /* A follow-up on some threads, so the chain is not always two long. */
    const FOLLOW_UPS = [
      'That worked, thank you - one more thing though: does the same apply to the second device on my account?',
      'I tried that and it did not help. The problem is still there this morning.',
      'Understood. I will bring it in to the centre this week.'
    ];

    for (let index = 0; index < FEEDBACK.length; index += 1) {
      const entry = FEEDBACK[index];
      const member = members[index % members.length];
      const daysAgo = 3 + index * 7 + random(4);

      let status = 'REPLIED';
      if (index < 3) status = 'PENDING';
      else if (index >= FEEDBACK.length - 2) status = 'RESOLVED';
      else if (index === 3 || index === 4) status = 'FINISHED';

      const answered = status !== 'PENDING';
      const manager = index % 2 === 0 ? headOffice : editor;
      const followsUp = answered && index % 5 === 2;

      /*
       * The chain, in order. The thread's preview and last_type are taken
       * from the final entry rather than guessed - they have to agree, and
       * that is exactly what the application guarantees at runtime.
       */
      const chain = [{
        message: entry[2],
        action_type: 'MEMBER',
        action_by: member.id,
        action_at: stampDaysAgo(daysAgo)
      }];

      if (answered) {
        chain.push({
          message: REPLIES[index % REPLIES.length],
          action_type: 'MANAGER',
          action_by: manager.id,
          action_at: stampDaysAgo(daysAgo - 2)
        });
      }

      if (followsUp) {
        chain.push({
          message: FOLLOW_UPS[index % FOLLOW_UPS.length],
          action_type: 'MEMBER',
          action_by: member.id,
          action_at: stampDaysAgo(daysAgo - 3)
        });
      }

      const last = chain[chain.length - 1];

      // eslint-disable-next-line no-await-in-loop
      const rows = await knex('feedback_threads').insert({
        user_id: member.id,
        title: entry[1],
        thread_source: SOURCES[index % SOURCES.length],
        status: followsUp ? 'PENDING' : status,
        last_message: last.message,
        last_type: last.action_type,
        // Seen unless the other side wrote last and nobody has looked.
        is_read: last.action_type === 'MANAGER',
        session_by: answered ? manager.id : null,
        created_at: stampDaysAgo(daysAgo),
        updated_at: last.action_at
      }).returning('id');

      const threadId = typeof rows[0] === 'object' ? rows[0].id : rows[0];

      // eslint-disable-next-line no-await-in-loop
      await knex('feedback_messages').insert(chain.map(function (m) {
        return Object.assign({ thread_id: threadId }, m);
      }));
    }
  }

  /* ================================================================== */
  /*  2. the money ledger                                                */
  /* ================================================================== */

  /*
   * Built as one list of events in time order rather than per member, because
   * a transfer is two rows in two different members' statements and both of
   * them need a `balance_after` that was true at that moment.  Walking one
   * chronological list with a running balance per member is the only way the
   * two sides agree; generating each member's statement independently makes
   * the sender's balance and the recipient's arrival disagree about when the
   * money left.
   */
  const walletOwners = await knex('wallets').orderBy('user_id').select('user_id');

  if (walletOwners.length) {
    const events = [];
    let pairSeq = 0;

    walletOwners.forEach(function (owner, index) {
      // Not everybody uses the wallet - about a quarter never have.
      if (index % 4 === 3) return;

      const count = 2 + random(7);
      let cursor = 30 + random(300);

      // The first movement is always money arriving: nothing can be spent
      // out of a wallet that has never been topped up.
      events.push({
        user_id: owner.user_id, type: 'CHARGE',
        amount: 50 + random(9) * 50, at: cursor, pair: null, counterparty: null
      });

      for (let i = 0; i < count; i += 1) {
        cursor -= 1 + random(24);
        if (cursor < 1) break;

        const roll = random(100);
        if (roll < 26) {
          events.push({ user_id: owner.user_id, type: 'CHARGE', amount: 50 + random(8) * 25, at: cursor });
        } else if (roll < 52) {
          events.push({ user_id: owner.user_id, type: 'PURCHASE', amount: 19 + random(40) * 10, at: cursor });
        } else if (roll < 68) {
          events.push({ user_id: owner.user_id, type: 'REPAIR', amount: 25 + random(24) * 10, at: cursor });
        } else if (roll < 76) {
          events.push({ user_id: owner.user_id, type: 'REFUND', amount: 19 + random(20) * 10, at: cursor });
        } else if (roll < 84) {
          events.push({ user_id: owner.user_id, type: 'WITHDRAW', amount: 20 + random(10) * 20, at: cursor });
        } else if (roll < 90) {
          events.push({ user_id: owner.user_id, type: 'COMPENSATION', amount: 15 + random(8) * 10, at: cursor });
        } else {
          /*
           * A transfer, as a linked pair.  The recipient is another member
           * rather than an account invented for the purpose, because
           * counterparty_id is a real foreign key and the member centre draws
           * the other party's name from it.
           */
          const other = walletOwners[(index + 3 + random(7)) % walletOwners.length];
          if (!other || other.user_id === owner.user_id) continue;

          pairSeq += 1;
          const amount = 20 + random(12) * 10;
          events.push({
            user_id: owner.user_id, type: 'TRANSFER_OUT', amount: amount, at: cursor,
            pair: pairSeq, counterparty: other.user_id
          });
          events.push({
            user_id: other.user_id, type: 'TRANSFER_IN', amount: amount, at: cursor,
            pair: pairSeq, counterparty: owner.user_id
          });
        }
      }
    });

    // Oldest first: `at` counts days BACK from today, so descending `at` is
    // ascending time.
    events.sort(function (a, b) { return b.at - a.at; });

    const CREDIT = { CHARGE: 1, REFUND: 1, COMPENSATION: 1, TRANSFER_IN: 1 };
    const balances = {};
    const transactions = [];
    const skippedPairs = {};

    events.forEach(function (event) {
      const current = balances[event.user_id] || 0;
      const credit = !!CREDIT[event.type];

      // The other half of a transfer the sender could not afford.
      if (event.pair && skippedPairs[event.pair]) return;

      /*
       * A wallet may not go overdrawn.  There is no CHECK on the column, but
       * the wallet service refuses it at runtime, and a seeded statement that
       * dips below zero is a demonstration of a state the application will
       * not produce.
       */
      if (!credit && current < event.amount) {
        if (event.pair) skippedPairs[event.pair] = true;
        return;
      }

      const after = money(credit ? current + event.amount : current - event.amount);
      balances[event.user_id] = after;

      transactions.push({
        user_id: event.user_id,
        type: event.type,
        // Signed the way the statement reads it: money out is negative.
        amount: money(credit ? event.amount : -event.amount),
        balance_after: after,
        currency: 'USD',
        reference: event.type.slice(0, 3) + String(100000 + transactions.length),
        description: describeTransaction(event.type),
        counterparty_id: event.counterparty || null,
        status: 'SUCCESS',
        created_at: stampDaysAgo(event.at)
      });
    });

    if (transactions.length) await knex('wallet_transactions').insert(transactions);

    /*
     * The cached balance, written from the ledger it is a cache of - the same
     * rule seed 05 follows for the point balance, and for the same reason.
     *
     * EVERY wallet is written, not only the ones that saw activity.  A member
     * who never used the wallet has a balance of zero, and skipping them here
     * would leave whatever was in the column to stand as money nothing in the
     * statement accounts for.
     */
    for (let i = 0; i < walletOwners.length; i += 1) {
      const owner = walletOwners[i];
      // eslint-disable-next-line no-await-in-loop
      await knex('wallets').where('user_id', owner.user_id)
        .update({ balance: balances[owner.user_id] || 0 });
    }
  }

  function describeTransaction(type) {
    switch (type) {
      case 'CHARGE': return 'Wallet top-up';
      case 'WITHDRAW': return 'Withdrawal to bank card';
      case 'PURCHASE': return 'Crystal store purchase';
      case 'REFUND': return 'Refund for a cancelled order';
      case 'REPAIR': return 'Repair charge paid at the service centre';
      case 'COMPENSATION': return 'Goodwill credit';
      case 'TRANSFER_IN': return 'Received from another member';
      case 'TRANSFER_OUT': return 'Sent to another member';
      default: return null;
    }
  }

  /* ================================================================== */
  /*  3. monthly settlement                                              */
  /* ================================================================== */

  /*
   * Claims are built out of the repairs seed 06 actually closed, exactly the
   * way the claims service builds them: covered, closed, not already on
   * another claim, grouped by the month they were FINISHED in.
   *
   * The two most recent months are deliberately left unclaimed.  A centre has
   * to have something to claim for the console's "build this month's claim"
   * button to do anything, and `npm run check` builds one for last month - on
   * a database where every month is already settled, both are dead ends.
   */
  const OLDEST_CLAIMED_MONTH = 6;
  const NEWEST_CLAIMED_MONTH = 2;

  const claimable = await knex('repair_tickets as t')
    .where('t.is_warranty', true)
    .where('t.status', 7)
    .where('t.is_deleted', false)
    .whereNull('t.claim_id')
    .whereNotNull('t.closed_at')
    .select(
      't.id', 't.agency_id', 't.parts_amount', 't.labour_amount', 't.covered_amount',
      knex.raw("date_trunc('month', t.closed_at)::date AS period_month")
    );

  const periods = [];
  for (let m = OLDEST_CLAIMED_MONTH; m >= NEWEST_CLAIMED_MONTH; m -= 1) periods.push(monthStart(m));

  /* Group the tickets by centre and month, keeping only the months claimed. */
  const groups = {};
  claimable.forEach(function (ticket) {
    const period = String(ticket.period_month).slice(0, 10);
    if (periods.indexOf(period) === -1) return;

    const key = period + '#' + ticket.agency_id;
    if (!groups[key]) {
      groups[key] = {
        period_month: period, agency_id: ticket.agency_id,
        tickets: [], parts: 0, labour: 0, total: 0
      };
    }
    const group = groups[key];
    group.tickets.push(ticket.id);
    group.parts += Number(ticket.parts_amount) || 0;
    group.labour += Number(ticket.labour_amount) || 0;
    group.total += Number(ticket.covered_amount) || 0;
  });

  /*
   * Where each month's claims have got to.
   *
   * Older months are settled and newer ones are still moving, which is what
   * puts a row under every filter on the settlement screen and gives the
   * approve and reject actions something legal to act on.  Status 9 -
   * cancelled - is deliberately absent: cancelling releases a claim's tickets
   * back to be claimed again, so a cancelled claim still holding its tickets
   * would be a state the application cannot reach.
   */
  const STATUS_BY_AGE = {};
  STATUS_BY_AGE[monthStart(6)] = 4;   // paid
  STATUS_BY_AGE[monthStart(5)] = 4;   // paid
  STATUS_BY_AGE[monthStart(4)] = 2;   // approved, awaiting payment
  STATUS_BY_AGE[monthStart(3)] = 1;   // submitted, awaiting head office
  STATUS_BY_AGE[monthStart(2)] = 0;   // still a draft at the centre

  const orderedKeys = Object.keys(groups).sort();
  const perMonthSeq = {};

  for (let i = 0; i < orderedKeys.length; i += 1) {
    const group = groups[orderedKeys[i]];
    const period = group.period_month;

    let status = STATUS_BY_AGE[period];
    if (status === undefined) status = 1;

    /*
     * One rejection, on a month that is otherwise submitted, so the reject
     * path has a worked example - and it carries a reason, because the table
     * has a CHECK that refuses a rejection without one.
     */
    const rejected = status === 1 && group.agency_id % 7 === 3;
    if (rejected) status = 3;

    perMonthSeq[period] = (perMonthSeq[period] || 0) + 1;

    // 'C' + YYYYMM + a four digit sequence, which is what the claims
    // repository's nextNumber() will carry on from.
    const claimNo = 'C' + period.slice(0, 4) + period.slice(5, 7) +
      String(perMonthSeq[period]).padStart(4, '0');

    /*
     * Dated from the period itself rather than from a loop counter, so a
     * claim for March is always reviewed in April however many months ago
     * that now is.  A centre closes its month and submits in the first week
     * of the next one; head office reviews within a working week; payment
     * follows about a week after that.
     */
    const periodStart = Date.parse(period + 'T00:00:00Z');
    const submittedAt = new Date(periodStart + (34 + (group.agency_id % 4)) * 86400000);
    const reviewedAt = new Date(submittedAt.getTime() + (4 + (group.agency_id % 3)) * 86400000);
    const paidAt = new Date(reviewedAt.getTime() + (7 + (group.agency_id % 5)) * 86400000);

    const total = money(group.total);

    /*
     * Head office does not always approve the whole amount.  A trimmed
     * approval is the normal outcome of a spot check, and it is the only
     * thing that makes approved_amount worth having as its own column.
     */
    let approved = null;
    if (status === 2 || status === 4) {
      approved = group.agency_id % 5 === 0 ? money(total * 0.92) : total;
    } else if (status === 3) {
      approved = 0;
    }

    const rows = await knex('warranty_claims').insert({   // eslint-disable-line no-await-in-loop
      claim_no: claimNo,
      agency_id: group.agency_id,
      period_month: period,
      status: status,
      ticket_count: group.tickets.length,
      parts_amount: money(group.parts),
      labour_amount: money(group.labour),
      total_amount: total,
      approved_amount: approved,
      currency: 'USD',
      submitted_at: status >= 1 && status !== 9 ? submittedAt : null,
      reviewed_at: status === 2 || status === 3 || status === 4 ? reviewedAt : null,
      reviewed_by: status === 2 || status === 3 || status === 4 ? headOffice.id : null,
      paid_at: status === 4 ? paidAt : null,
      reject_reason: status === 3
        ? 'Three tickets on this claim have no fault diagnosis recorded. Resubmit with the diagnosis completed.'
        : null,
      remark: approved !== null && approved !== total && status !== 3
        ? 'Spot check: two labour lines reduced to the published band.'
        : null,
      created_at: submittedAt,
      updated_at: status === 4 ? paidAt : (status >= 2 ? reviewedAt : submittedAt)
    }).returning(['id']);

    const claimId = rows[0] && (rows[0].id === undefined ? rows[0] : rows[0].id);

    /*
     * Stamp the tickets, which is what stops the same repair being invoiced
     * to head office twice - the claimable query filters on claim_id IS NULL.
     */
    // eslint-disable-next-line no-await-in-loop
    await knex('repair_tickets').whereIn('id', group.tickets).update({ claim_id: claimId });
  }

  /* ================================================================== */
  /*  4. restocking                                                      */
  /* ================================================================== */

  /*
   * Replenishment orders, aimed at the shelves that are actually short.
   *
   * A received order is not just a status: it MOVES stock, so each received
   * line writes a RECEIPT movement and raises the cached on_hand, in step, the
   * way stock.move() does at runtime.  `npm run check` asserts that every
   * shelf equals the sum of its movements, so an order that arrived without a
   * movement behind it would break the project's own reconciliation test.
   */
  const shelves = await knex('part_stock as s')
    .join('parts as p', 'p.id', 's.part_id')
    .where('p.is_deleted', false)
    .orderBy(['s.agency_id', 's.part_id'])
    .select('s.id', 's.agency_id', 's.part_id', 's.on_hand', 's.reorder_level',
      'p.unit_cost', 'p.lead_days', 'p.part_no');

  const byAgency = {};
  shelves.forEach(function (shelf) {
    if (!byAgency[shelf.agency_id]) byAgency[shelf.agency_id] = [];
    byAgency[shelf.agency_id].push(shelf);
  });

  /* Shortest of stock first: those are the lines a centre would reorder. */
  Object.keys(byAgency).forEach(function (agencyId) {
    byAgency[agencyId].sort(function (a, b) {
      return (a.on_hand - a.reorder_level) - (b.on_hand - b.reorder_level);
    });
  });

  const agencyIds = Object.keys(byAgency).sort(function (a, b) { return Number(a) - Number(b); });
  const receiptMovements = [];
  const shelfAdjustments = {};
  let orderSeq = 0;

  for (let a = 0; a < agencyIds.length; a += 1) {
    const agencyId = Number(agencyIds[a]);
    const candidates = byAgency[agencyIds[a]];
    if (!candidates.length) continue;

    /*
     * Three orders per centre, one per state worth showing: an old one that
     * arrived, one in transit, and a fresh one still being put together.
     * The fourth state - approved but not yet shipped - lands on every third
     * centre so the filter has rows without every centre looking identical.
     */
    const plans = [
      { status: 4, requestedDaysAgo: 52 + random(20), auto: false },
      { status: 3, requestedDaysAgo: 12 + random(8), auto: false },
      { status: agencyId % 3 === 0 ? 2 : (agencyId % 3 === 1 ? 1 : 0), requestedDaysAgo: 2 + random(5), auto: agencyId % 3 === 2 }
    ];

    for (let p = 0; p < plans.length; p += 1) {
      const plan = plans[p];
      const lineCount = 2 + random(4);
      const lines = [];
      const used = {};

      for (let l = 0; l < lineCount; l += 1) {
        // Walk the shortage list, offset per order so the three orders at one
        // centre are not three copies of the same basket.
        const shelf = candidates[(l + p * 3) % candidates.length];
        if (!shelf || used[shelf.part_id]) continue;
        used[shelf.part_id] = true;

        /*
         * Order up to the reorder level plus a buffer, rounded to something a
         * human would actually type, and never less than a handful.
         */
        const gap = Math.max(0, shelf.reorder_level - shelf.on_hand);
        const quantity = Math.max(5, Math.ceil((gap + 4 + random(12)) / 5) * 5);
        const unitCost = Number(shelf.unit_cost) || 0;

        lines.push({
          part_id: shelf.part_id,
          quantity: quantity,
          unit_cost: unitCost,
          amount: money(quantity * unitCost),
          shelf: shelf
        });
      }

      if (!lines.length) continue;

      orderSeq += 1;
      const requestedOn = plan.requestedDaysAgo;
      const leadDays = 7 + random(10);
      const receivedOn = plan.status === 4 ? Math.max(1, requestedOn - leadDays) : null;
      const totalCost = money(lines.reduce(function (sum, line) { return sum + line.amount; }, 0));
      const approvedStatuses = [2, 3, 4];

      const orderRows = await knex('part_replenishments').insert({   // eslint-disable-line no-await-in-loop
        order_no: 'R' + isoDaysAgo(requestedOn).replace(/-/g, '') + String(orderSeq).padStart(3, '0'),
        agency_id: agencyId,
        status: plan.status,
        requested_on: isoDaysAgo(requestedOn),
        expected_on: isoDaysAgo(requestedOn - leadDays),
        received_on: receivedOn === null ? null : isoDaysAgo(receivedOn),
        total_cost: totalCost,
        currency: 'USD',
        // An automatic order is one the nightly reorder sweep raised.
        is_auto: !!plan.auto,
        approved_by: approvedStatuses.indexOf(plan.status) !== -1 ? headOffice.id : null,
        approved_at: approvedStatuses.indexOf(plan.status) !== -1
          ? stampDaysAgo(Math.max(1, requestedOn - 1)) : null,
        remark: plan.auto ? 'Raised automatically by the nightly reorder sweep.' : null,
        created_at: stampDaysAgo(requestedOn),
        updated_at: stampDaysAgo(receivedOn === null ? Math.max(1, requestedOn - 1) : receivedOn)
      }).returning(['id']);

      const orderId = orderRows[0] && (orderRows[0].id === undefined ? orderRows[0] : orderRows[0].id);
      const orderNo = 'R' + isoDaysAgo(requestedOn).replace(/-/g, '') + String(orderSeq).padStart(3, '0');

      const itemRows = lines.map(function (line, index) {
        /*
         * A short delivery on one line of the oldest order, because a partial
         * receipt is normal and the receiving screen has to be able to show
         * one.  received_quantity has a CHECK that it cannot exceed quantity.
         */
        let received = 0;
        if (plan.status === 4) {
          received = (index === 0 && orderSeq % 4 === 0)
            ? Math.max(1, line.quantity - 2)
            : line.quantity;
        }

        if (received > 0) {
          const key = agencyId + '#' + line.part_id;
          const base = shelfAdjustments[key] === undefined ? line.shelf.on_hand : shelfAdjustments[key];
          const after = base + received;
          shelfAdjustments[key] = after;

          receiptMovements.push({
            agency_id: agencyId,
            part_id: line.part_id,
            movement: 'RECEIPT',
            quantity: received,
            balance_after: after,
            unit_cost: line.unit_cost,
            reference_type: 'REPLENISHMENT',
            reference_id: orderId,
            note: orderNo,
            manager_id: headOffice.id,
            manager_name: headOffice.name,
            created_at: stampDaysAgo(receivedOn)
          });
        }

        return {
          replenishment_id: orderId,
          part_id: line.part_id,
          quantity: line.quantity,
          received_quantity: received,
          unit_cost: line.unit_cost,
          amount: line.amount
        };
      });

      // eslint-disable-next-line no-await-in-loop
      await knex('part_replenishment_items').insert(itemRows);
    }
  }

  if (receiptMovements.length) {
    await knex('part_movements').insert(receiptMovements);

    /* The cached shelf total, moved by exactly what the movements above say. */
    const keys = Object.keys(shelfAdjustments);
    for (let i = 0; i < keys.length; i += 1) {
      const parts = keys[i].split('#');
      // eslint-disable-next-line no-await-in-loop
      await knex('part_stock')
        .where({ agency_id: Number(parts[0]), part_id: Number(parts[1]) })
        .update({ on_hand: shelfAdjustments[keys[i]] });
    }

    /*
     * Re-derive every shelf's running balance, now that stock has been
     * inserted into the MIDDLE of its history.
     *
     * A delivery that arrived in June is dated in June, which puts it before
     * repairs that were already booked against that shelf in July - and every
     * one of those movements recorded a balance_after that did not know the
     * delivery was coming.  At runtime that never happens, because stock.move()
     * only ever appends to the end of the ledger; a seed that backdates is the
     * one case where the tail has to be recomputed.
     *
     * The window is ordered the way the movements screen reads the ledger,
     * (created_at, id), so what the seed computes and what an operator sees
     * are the same sequence.
     */
    await knex.raw(`
      UPDATE ?? AS m
         SET balance_after = c.running
        FROM (
              SELECT id,
                     SUM(quantity) OVER (
                       PARTITION BY agency_id, part_id
                       ORDER BY created_at, id
                     ) AS running
                FROM ??
             ) AS c
       WHERE c.id = m.id
         AND m.balance_after <> c.running
    `, ['part_movements', 'part_movements']);
  }

  /* ================================================================== */
  /*  5. the audit trail                                                 */
  /* ================================================================== */

  /*
   * A back-history for the trail, so the audit screen has something to filter
   * and page through before anybody has used the console.
   *
   * These describe writes the seed itself just made - the articles it wrote,
   * the claims it settled, the orders it approved - rather than invented
   * activity against rows that do not exist, so every entry's entity_pk
   * resolves to something a reader can click through to.
   *
   * Nothing here carries a credential: `npm run check` asserts that no audit
   * entry contains a bcrypt hash, and the admin rows are referenced by name
   * and never copied wholesale.
   */
  const auditRows = [];

  function actorOf(admin) {
    return {
      manager_id: admin.id,
      manager_login: admin.username,
      manager_name: admin.name
    };
  }

  function record(admin, entity, pk, action, page, changed, before, after, daysAgo, method, path) {
    auditRows.push(Object.assign(actorOf(admin), {
      entity: entity,
      entity_pk: String(pk),
      action: action,
      page_url: page,
      changed: changed ? JSON.stringify(changed) : null,
      before_data: before ? JSON.stringify(before) : null,
      after_data: after ? JSON.stringify(after) : null,
      method: method,
      path: path,
      ip: '10.20.' + (30 + (admin.id % 6)) + '.' + (40 + (pk % 200)),
      created_at: stampDaysAgo(daysAgo)
    }));
  }

  const seededArticles = await knex('articles').orderBy('id').select('id', 'title', 'status', 'category');
  seededArticles.forEach(function (article, index) {
    record(editor, 'articles', article.id, 'create', '/admin/content/articles',
      ['title', 'category', 'status'],
      null,
      { title: article.title, category: article.category, status: 'DRAFT' },
      120 - index * 4, 'POST', '/api/admin/articles');

    if (article.status === 'PUBLISHED') {
      record(editor, 'articles', article.id, 'update', '/admin/content/articles',
        ['status'],
        { status: 'REVIEW' },
        { status: 'PUBLISHED' },
        118 - index * 4, 'POST', '/api/admin/articles/' + article.id + '/status');
    }
  });

  const settledClaims = await knex('warranty_claims')
    .whereIn('status', [2, 3, 4])
    .orderBy('id')
    .select('id', 'claim_no', 'status', 'total_amount', 'approved_amount');

  settledClaims.forEach(function (claim, index) {
    record(headOffice, 'warranty_claims', claim.id, 'update', '/admin/service/claims',
      ['status', 'approved_amount'],
      { status: 1, approved_amount: null },
      { status: claim.status, approved_amount: claim.approved_amount },
      60 - (index % 40), 'POST', '/api/admin/claims/' + claim.id + '/status');
  });

  const approvedOrders = await knex('part_replenishments')
    .whereIn('status', [2, 3, 4])
    .orderBy('id')
    .select('id', 'order_no', 'status', 'total_cost');

  approvedOrders.forEach(function (order, index) {
    record(headOffice, 'part_replenishments', order.id, 'update', '/admin/service/replenishments',
      ['status'],
      { status: 1 },
      { status: order.status },
      45 - (index % 35), 'POST', '/api/admin/replenishments/' + order.id + '/status');
  });

  const touchedProducts = await knex('products').orderBy('id').limit(8)
    .select('id', 'name', 'price', 'status');

  touchedProducts.forEach(function (product, index) {
    record(platform, 'products', product.id, 'update', '/admin/catalog/products',
      ['price'],
      { price: money(Number(product.price) + 50) },
      { price: Number(product.price) },
      30 - index * 2, 'PUT', '/api/admin/products/' + product.id);
  });

  const settings = await knex('system_settings').orderBy('id').limit(3).select('id');
  settings.forEach(function (row, index) {
    record(platform, 'system_settings', row.id, 'update', '/admin/management/settings',
      ['value'],
      { value: 'previous' },
      { value: 'current' },
      14 - index * 3, 'PUT', '/api/admin/settings/' + row.id);
  });

  if (auditRows.length) await knex('audit_log').insert(auditRows);
};
