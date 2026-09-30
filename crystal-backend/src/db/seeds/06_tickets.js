/**
 * Repair tickets: six months of them, across twelve service centres.
 *
 * This seed exists to make section 9 of the schema mean something.  A health
 * board fed uniform data produces twelve identical rows and proves only that
 * the query parses, so the estate here is deliberately uneven in the ways a
 * real one is:
 *
 *   - the two centres seed 04 left short of parts genuinely cannot issue
 *     them, so their tickets stall at "waiting for parts" on their own.  The
 *     PARTS_BOUND status on the health board is not simulated, it is caused;
 *   - QUALITY (how well the work is done) and SPEED (how fast it is done) are
 *     separate per centre, because in practice they are: a fast centre that
 *     rushes produces repeat repairs, and a careful slow one produces
 *     breached promises and satisfied customers;
 *   - a proportion of devices come back within the repeat window, which is
 *     what gives reopened_from - and the repeat rate - anything to count.
 *
 * Everything is derived from one seeded generator, so the same checkout
 * always produces the same database and a screenshot of the board can be
 * compared with one taken last week.
 */

const TICKET_COUNT = 480;
const DAYS_BACK = 180;
const REPEAT_SHARE = 0.09;
const RATING_SHARE = 0.62;

/**
 * Per centre: how good the work is, and how fast.
 *
 *   quality  0..1, higher means fewer repeat repairs
 *   speed    multiplier on the promised turnaround; above 1 means late
 */
const CENTRE_PROFILE = {
  SH01: { quality: 0.95, speed: 0.65 },
  SH02: { quality: 0.88, speed: 0.90 },
  BJ01: { quality: 0.93, speed: 0.70 },
  BJ02: { quality: 0.86, speed: 1.05 },   // routinely a little late
  GD01: { quality: 0.90, speed: 0.85 },
  GD02: { quality: 0.97, speed: 0.55 },   // the factory centre
  SC01: { quality: 0.82, speed: 1.35 },   // short of parts, and slow with it
  ZJ01: { quality: 0.91, speed: 0.80 },
  HB01: { quality: 0.84, speed: 1.15 },
  SN01: { quality: 0.87, speed: 1.00 },
  LN01: { quality: 0.79, speed: 1.45 },   // a collection point, one person
  YN01: { quality: 0.76, speed: 1.60 }
};

/** Where tickets actually arrive - roughly proportional to daily capacity. */
const CENTRE_WEIGHT = {
  SH01: 14, SH02: 8, BJ01: 13, BJ02: 7, GD01: 9, GD02: 16,
  SC01: 7, ZJ01: 8, HB01: 6, SN01: 5, LN01: 4, YN01: 3
};

/**
 * How likely each symptom is.
 *
 * Not uniform, and not accidentally so: SCR_CRACK and BAT_DRAIN are what
 * actually walks through the door, and a defect watch fed a flat distribution
 * finds nothing interesting because everything is equally common.
 */
const SYMPTOM_WEIGHT = {
  SCR_CRACK: 18, BAT_DRAIN: 15, SCR_FLICK: 6, SCR_TOUCH: 5,
  BAT_NOCHG: 7, PWR_DEAD: 6, CAM_BLUR: 5, AUD_SPK: 4,
  SW_BOOT: 5, SW_SLOW: 4, NET_SIG: 4, NET_WIFI: 3,
  CASE_DAMAGE: 4, CASE_WATER: 4, BAT_SWELL: 2, PWR_OVERHEAT: 2,
  CAM_FAIL: 2, AUD_MIC: 2, SW_UPDATE: 1, OTHER: 1
};

/** Which price line a symptom leads to. */
const SYMPTOM_TO_PRICE = {
  SCR_CRACK: 'Screen replacement',
  SCR_FLICK: 'Screen replacement',
  SCR_TOUCH: 'Screen replacement',
  BAT_DRAIN: 'Battery replacement',
  BAT_SWELL: 'Battery replacement',
  BAT_NOCHG: 'Charging port repair',
  PWR_DEAD: 'Motherboard repair',
  PWR_OVERHEAT: 'Motherboard repair',
  CAM_BLUR: 'Rear camera module',
  CAM_FAIL: 'Rear camera module',
  AUD_SPK: 'Speaker replacement',
  AUD_MIC: 'Speaker replacement',
  NET_SIG: 'Motherboard repair',
  NET_WIFI: 'Software recovery',
  SW_BOOT: 'Software recovery',
  SW_SLOW: 'Software recovery',
  SW_UPDATE: 'Software recovery',
  CASE_DAMAGE: 'Rear glass replacement',
  CASE_WATER: 'Water damage treatment',
  OTHER: 'Software recovery'
};

function rng(seed) {
  let state = seed;
  return function next() {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/** Picks a key from a { key: weight } map. */
function weighted(random, weights) {
  const keys = Object.keys(weights);
  let total = 0;
  keys.forEach(function (key) { total += weights[key]; });

  let roll = random() * total;
  for (let i = 0; i < keys.length; i += 1) {
    roll -= weights[keys[i]];
    if (roll <= 0) return keys[i];
  }
  return keys[keys.length - 1];
}

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * What each published price line means as WORK.
 *
 * `component` says which shelf item the job consumes and `minutes` how long
 * it takes on the bench. Both used to be columns on service_prices; they are
 * here because they describe the repair rather than the price, and a ticket
 * is the thing that records a repair.
 *
 * A line missing from this map is labour-only work with no part - software
 * recovery, water damage treatment - which is exactly what the price list
 * says about them too.
 */
const LINE_WORK = {
  'Screen replacement': { component: 'SCREEN', minutes: 90 },
  'Battery replacement': { component: 'BATTERY', minutes: 45 },
  'Charging port repair': { component: 'PORT', minutes: 40 },
  'Rear camera module': { component: 'CAMERA', minutes: 60 },
  'Speaker replacement': { component: 'SPEAKER', minutes: 30 },
  'Rear glass replacement': { component: 'BACKGLASS', minutes: 45 },
  'Motherboard repair': { component: 'BOARD', minutes: 180 },
  'Software recovery': { component: null, minutes: 45 },
  'Water damage treatment': { component: null, minutes: 120 }
};

exports.seed = async function seed(knex) {
  const random = rng(978413);

  const agencies = await knex('agencies').select('id', 'code', 'name', 'sla_hours');
  const technicians = await knex('technicians').select('id', 'agency_id', 'name', 'grade');
  const symptoms = await knex('symptom_catalog').select('id', 'code', 'name', 'component');
  const devices = await knex('registered_products as r')
    .join('users as u', 'u.id', 'r.user_id')
    .join('products as p', 'p.id', 'r.product_id')
    .select('r.id as registration_id', 'r.serial_number', 'r.user_id', 'r.product_id',
      'r.purchase_date', 'u.nickname', 'u.phone', 'u.email', 'p.name as product_name');

  const warranties = await knex('warranties')
    .where('is_deleted', false)
    .whereNot('status', 'VOID')
    .select('id', 'serial_number', 'start_date', 'end_date', 'kind', 'covers_parts', 'covers_labour');

  /*
   * The published price list, plus the two things a TICKET needs that the
   * price list no longer carries.
   *
   * `service_prices` is what a customer reads: which part, what it costs,
   * what the labour costs. Which shelf the part comes off and how long the
   * job takes on the bench are the REPAIR's business, so they are worked
   * out here rather than being columns on the price list.
   */
  const priceRows = await knex('service_prices')
    .where('is_deleted', false)
    // ORDERED, and it matters: the generator picks lines by index, so without
    // this the tickets it invents depend on whatever order Postgres happens to
    // hand the rows back in - which changes when the column list changes.
    .orderBy('id')
    .select('id', 'product_id', 'part_name', 'part_price', 'service_price');

  // Which shelf item a published line corresponds to, per product.
  const compatibility = await knex('part_compatibility as pc')
    .join('parts as pt', 'pt.id', 'pc.part_id')
    .select('pc.product_id', 'pc.part_id', 'pt.component');

  const shelfOf = {};
  compatibility.forEach(function (row) {
    shelfOf[row.product_id + ':' + row.component] = row.part_id;
  });

  const prices = priceRows.map(function (row) {
    const work = LINE_WORK[row.part_name] || {};
    return Object.assign({}, row, {
      name: row.part_name,
      part_id: work.component ? (shelfOf[row.product_id + ':' + work.component] || null) : null,
      labour_minutes: work.minutes || 30
    });
  });

  /* ---- lookups, so the generator is not doing linear scans 480 times ---- */
  const agencyByCode = {};
  const agencyById = {};
  agencies.forEach(function (a) { agencyByCode[a.code] = a; agencyById[a.id] = a; });

  const techsByAgency = {};
  technicians.forEach(function (t) {
    (techsByAgency[t.agency_id] = techsByAgency[t.agency_id] || []).push(t);
  });

  const symptomByCode = {};
  symptoms.forEach(function (s) { symptomByCode[s.code] = s; });

  const pricesByProduct = {};
  prices.forEach(function (p) {
    (pricesByProduct[p.product_id] = pricesByProduct[p.product_id] || {})[p.name] = p;
  });

  const coverBySerial = {};
  warranties.forEach(function (w) {
    (coverBySerial[w.serial_number] = coverBySerial[w.serial_number] || []).push(w);
  });

  /*
   * The shelves, held in memory and written back at the end.
   *
   * A seeded issue has to move the ledger as well as the cache, or the
   * consistency check would fail on a database nobody had touched - so the
   * generator carries the real balance and refuses an issue it cannot cover,
   * exactly as the service would.
   */
  const stock = {};
  const topUps = [];
  const stockRows = await knex('part_stock').select('id', 'agency_id', 'part_id', 'on_hand');
  stockRows.forEach(function (row) {
    stock[row.agency_id + ':' + row.part_id] = { id: row.id, opening: row.on_hand, on_hand: row.on_hand };
  });

  /** Centres that are meant to run out, and are therefore never topped up. */
  const SHORT = { SC01: true, YN01: true };

  /**
   * Six months of repairs against one delivery would empty every shelf in the
   * country, and every ticket after that would stall waiting for a part.  Real
   * centres reorder, so the generator does too - except at the two centres seed
   * 04 deliberately starved, which is what keeps their shortage a signal rather
   * than a background condition everybody shares.
   */
  function replenish(centre, partId, when) {
    if (SHORT[centre.code]) return;

    const key = centre.id + ':' + partId;
    let shelf = stock[key];

    /*
     * A centre that has never held this part gets a shelf the first time it
     * needs one - which is exactly what stock.service does through ensure()
     * when a receipt arrives for something new.  Without it every repair on a
     * product seed 04 did not pre-stock would stall waiting for a part that
     * nobody had ever ordered, and half the estate would read as PARTS_BOUND.
     */
    if (!shelf) {
      shelf = { id: null, opening: 0, on_hand: 0, agency_id: centre.id, part_id: partId, isNew: true };
      stock[key] = shelf;
    }

    if (shelf.on_hand > 0) return;

    const quantity = 8 + Math.floor(random() * 8);
    shelf.on_hand += quantity;
    topUps.push({
      agency_id: centre.id, part_id: partId,
      movement: 'RECEIPT', quantity: quantity, balance_after: 0,
      unit_cost: 0, reference_type: 'REPLENISHMENT', reference_id: null,
      note: 'stock delivery', manager_name: 'system',
      created_at: new Date(when.getTime() - 86400000)
    });
  }

  /**
   * A date as plain text, whatever the driver handed back.
   *
   * The knexfile installs a parser that keeps `date` columns as
   * 'YYYY-MM-DD', but a seed that silently returns the wrong answer when that
   * parser is not in place is a seed that produced a database with no covered
   * repairs in it and said nothing - which is exactly what happened here once.
   */
  function iso(value) {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
  }

  /** Cover in force for a device on a day; the widest plan wins. */
  function coverOn(serial, isoDate) {
    const list = coverBySerial[serial] || [];
    const applicable = list.filter(function (w) {
      return iso(w.start_date) <= isoDate && iso(w.end_date) >= isoDate;
    });
    if (!applicable.length) return null;

    applicable.sort(function (a, b) {
      const rank = { CARE_PLUS: 0, EXTENDED: 1, STANDARD: 2 };
      if (rank[a.kind] !== rank[b.kind]) return rank[a.kind] - rank[b.kind];
      return iso(a.end_date) < iso(b.end_date) ? 1 : -1;
    });
    return applicable[0];
  }

  /* ---- generate ---- */
  const tickets = [];
  const lastVisitBySerial = {};   // serial -> index in `tickets`, for repeats

  for (let n = 0; n < TICKET_COUNT; n += 1) {
    const device = devices[Math.floor(random() * devices.length)];
    if (!device) continue;

    const centre = agencyByCode[weighted(random, CENTRE_WEIGHT)];
    const profile = CENTRE_PROFILE[centre.code];
    const symptom = symptomByCode[weighted(random, SYMPTOM_WEIGHT)];

    const receivedDaysAgo = Math.floor(random() * DAYS_BACK);
    const received = new Date(Date.now() - receivedDaysAgo * 86400000
      - Math.floor(random() * 8) * 3600000);
    const receivedIso = received.toISOString().slice(0, 10);

    // A device bought after this date cannot have been repaired on it.
    if (device.purchase_date && iso(device.purchase_date) > receivedIso) continue;

    const cover = coverOn(device.serial_number, receivedIso);
    const promised = new Date(received.getTime() + centre.sla_hours * 3600000);

    const priceLine = pricesByProduct[device.product_id]
      && pricesByProduct[device.product_id][SYMPTOM_TO_PRICE[symptom.code]];

    /*
     * Can this centre actually do the job?
     *
     * If the repair needs a part and the shelf is empty, the ticket stops at
     * "waiting for parts" - which is how the two under-stocked centres end up
     * flagged PARTS_BOUND without anything in this file saying so directly.
     */
    const key = priceLine && priceLine.part_id ? centre.id + ':' + priceLine.part_id : null;
    if (key) replenish(centre, priceLine.part_id, received);

    const shelf = key ? stock[key] : null;
    const partAvailable = !priceLine || !priceLine.part_id || (shelf && shelf.on_hand > 0);

    // How long it took, from the centre's own speed against its own promise.
    const turnaroundHours = centre.sla_hours * profile.speed * (0.55 + random() * 0.9);
    const finished = new Date(received.getTime() + turnaroundHours * 3600000);
    const isFinished = finished.getTime() < Date.now();

    let status;
    if (!partAvailable) status = 2;
    else if (isFinished) status = 7;
    else status = [0, 1, 3, 4, 5, 6][Math.floor(random() * 6)];

    // A small number are simply cancelled - the customer changed their mind.
    if (status !== 2 && random() < 0.04) status = 9;

    const techs = techsByAgency[centre.id] || [];
    const technician = techs.length ? techs[Math.floor(random() * techs.length)] : null;

    const ticket = {
      __index: tickets.length,
      user_id: device.user_id,
      customer_name: device.nickname,
      customer_phone: device.phone,
      customer_email: device.email,
      product_id: device.product_id,
      registered_product_id: device.registration_id,
      serial_number: device.serial_number,
      warranty_id: cover ? cover.id : null,
      is_warranty: !!cover,
      warranty_note: cover
        ? cover.kind + ' cover to ' + iso(cover.end_date)
        : 'no cover in force on ' + receivedIso,
      agency_id: centre.id,
      technician_id: status === 0 ? null : (technician ? technician.id : null),
      intake_channel: random() < 0.75 ? 0 : (random() < 0.6 ? 1 : 3),
      symptom_id: symptom.id,
      fault_description: symptom.name + ' - reported by the customer at intake.',
      diagnosis: status >= 1 ? 'Confirmed ' + symptom.name.toLowerCase() + '.' : null,
      resolution: status === 7 ? (priceLine ? priceLine.name + ' completed.' : 'Repaired and tested.') : null,
      accessories: random() < 0.4 ? 'Charger, case' : null,
      status: status,
      priority: random() < 0.08 ? 2 : (random() < 0.2 ? 0 : 1),
      received_at: received,
      promised_at: promised,
      diagnosed_at: status >= 1 ? new Date(received.getTime() + 4 * 3600000) : null,
      repaired_at: status >= 5 ? new Date(finished.getTime() - 3600000) : null,
      closed_at: (status === 7 || status === 9) ? finished : null,
      currency: 'USD',
      __priceLine: priceLine,
      __centre: centre,
      __profile: profile,
      __partAvailable: partAvailable
    };

    tickets.push(ticket);

    // Consume the shelf now, so the next ticket at this centre sees it gone.
    // status 9 is a repair that never happened, so nothing left the shelf -
    // decrementing here would take stock out of the cache with no ledger row
    // behind it, which is precisely the drift the check script looks for.
    if (partAvailable && shelf && status >= 4 && status !== 9) {
      shelf.on_hand -= 1;
      ticket.__issued = true;
    }

    lastVisitBySerial[device.serial_number] = ticket;
  }

  /*
   * Devices that came back.
   *
   * A follow-up visit per closed ticket, at a probability that is one minus
   * the centre's quality - so the careful centres produce a handful and the
   * two worst produce a quarter.  That is the signal the repeat rate in
   * v_agency_health is there to detect, and generating it this way means the
   * board is reading a real consequence rather than a number somebody typed.
   */
  const followUps = [];

  tickets.forEach(function (ticket) {
    if (ticket.status !== 7) return;
    if (random() <= ticket.__profile.quality) return;

    const gapDays = 3 + Math.floor(random() * 18);
    const received = new Date(ticket.closed_at.getTime() + gapDays * 86400000);
    if (received.getTime() > Date.now()) return;

    const centre = ticket.__centre;
    const turnaroundHours = centre.sla_hours * ticket.__profile.speed * (0.6 + random() * 0.8);
    const finished = new Date(received.getTime() + turnaroundHours * 3600000);
    const isFinished = finished.getTime() < Date.now();
    const receivedIso = received.toISOString().slice(0, 10);
    const cover = coverOn(ticket.serial_number, receivedIso);

    followUps.push(Object.assign({}, ticket, {
      __index: tickets.length + followUps.length,
      __repeatOf: ticket.__index,
      warranty_id: cover ? cover.id : null,
      is_warranty: !!cover,
      warranty_note: cover
        ? cover.kind + ' cover to ' + iso(cover.end_date)
        : 'no cover in force on ' + receivedIso,
      fault_description: 'Same fault has returned - previously repaired at this centre.',
      diagnosis: 'Original repair did not hold.',
      resolution: isFinished ? 'Reworked and retested.' : null,
      status: isFinished ? 7 : 4,
      priority: 2,
      received_at: received,
      promised_at: new Date(received.getTime() + centre.sla_hours * 3600000),
      diagnosed_at: new Date(received.getTime() + 3 * 3600000),
      repaired_at: isFinished ? new Date(finished.getTime() - 3600000) : null,
      closed_at: isFinished ? finished : null,
      rating: null,
      __issued: false
    }));
  });

  const all = tickets.concat(followUps)
    .sort(function (a, b) { return a.received_at - b.received_at; });

  /* ---- numbers, in the order the tickets actually arrived ---- */
  const counters = {};
  all.forEach(function (ticket) {
    const d = ticket.received_at;
    const prefix = 'R' + String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0');
    counters[prefix] = (counters[prefix] || 0) + 1;
    ticket.ticket_no = prefix + String(counters[prefix]).padStart(4, '0');
  });

  /* ---- the bill ---- */
  all.forEach(function (ticket) {
    const line = ticket.__priceLine;
    ticket.__items = [];

    if (ticket.status === 9) {
      ticket.parts_amount = 0; ticket.labour_amount = 0;
      ticket.covered_amount = 0; ticket.total_amount = 0; ticket.pay_state = 3;
      return;
    }

    if (line) {
      const covered = ticket.is_warranty;

      if (line.part_id && Number(line.part_price) > 0) {
        ticket.__items.push({
          item_type: 'PART', part_id: line.part_id, service_price_id: line.id,
          name: line.name + ' - part', quantity: 1,
          unit_price: money(line.part_price), amount: money(line.part_price),
          is_covered: covered, labour_minutes: 0,
          issued: !!ticket.__issued
        });
      }

      ticket.__items.push({
        item_type: 'LABOUR', service_price_id: line.id,
        name: line.name + ' - labour', quantity: 1,
        unit_price: money(line.service_price), amount: money(line.service_price),
        is_covered: covered, labour_minutes: line.labour_minutes,
        issued: true
      });
    }

    const sum = function (predicate) {
      return money(ticket.__items.filter(predicate).reduce(function (t, i) { return t + i.amount; }, 0));
    };

    ticket.parts_amount = sum(function (i) { return i.item_type === 'PART' && !i.is_covered; });
    ticket.labour_amount = sum(function (i) { return i.item_type !== 'PART' && !i.is_covered; });
    ticket.covered_amount = sum(function (i) { return i.is_covered; });
    ticket.total_amount = money(ticket.parts_amount + ticket.labour_amount);
    ticket.pay_state = ticket.total_amount <= 0 ? 3 : (ticket.status === 7 ? 2 : 0);
    ticket.pay_method = ticket.pay_state === 2 ? (random() < 0.5 ? 0 : 2) : null;
  });

  /*
   * Ratings.
   *
   * Skewed by how late the repair was rather than by the centre's name: a
   * customer rates the experience they had, and the experience is mostly
   * "was it ready when you said it would be".  That is what makes CSAT worth
   * having in the health score - it is downstream of the same behaviour the
   * other four signals measure, arrived at independently.
   */
  all.forEach(function (ticket) {
    if (ticket.status !== 7 || random() > RATING_SHARE) return;

    const late = ticket.closed_at > ticket.promised_at;
    const repeat = ticket.__repeatOf !== undefined;

    let score = 5;
    if (late) score -= 1 + Math.floor(random() * 2);
    if (repeat) score -= 1;
    if (random() < 0.1) score -= 1;

    ticket.rating = Math.max(1, Math.min(5, score));
    ticket.rating_comment = ticket.rating >= 4
      ? 'Quick and well explained.'
      : (late ? 'Took longer than I was told.' : 'The fault came back.');
    ticket.rated_at = new Date(ticket.closed_at.getTime() + 86400000);
  });

  /* ---- insert, in chunks, keeping the generated ids ---- */
  const columns = ['ticket_no', 'user_id', 'customer_name', 'customer_phone', 'customer_email',
    'product_id', 'registered_product_id', 'serial_number', 'warranty_id', 'agency_id',
    'technician_id', 'intake_channel', 'symptom_id', 'fault_description', 'diagnosis',
    'resolution', 'accessories', 'status', 'priority', 'is_warranty', 'warranty_note',
    'received_at', 'promised_at', 'diagnosed_at', 'repaired_at', 'closed_at',
    'parts_amount', 'labour_amount', 'covered_amount', 'total_amount', 'currency',
    'pay_state', 'pay_method', 'rating', 'rating_comment', 'rated_at'];

  const idByIndex = {};

  for (let start = 0; start < all.length; start += 100) {
    const chunk = all.slice(start, start + 100);

    const payload = chunk.map(function (ticket) {
      const row = {};
      columns.forEach(function (c) { row[c] = ticket[c] === undefined ? null : ticket[c]; });
      return row;
    });

    // eslint-disable-next-line no-await-in-loop
    const inserted = await knex('repair_tickets').insert(payload).returning('id');
    inserted.forEach(function (row, i) {
      idByIndex[chunk[i].__index] = typeof row === 'object' ? row.id : row;
    });
  }

  /*
   * The link back to the earlier visit, in a second pass.
   *
   * It cannot be set on insert - the row it points at does not have an id
   * until it has been inserted - which is the same reason the parent column
   * on admin_pages is filled in afterwards in seed 01.
   */
  for (let i = 0; i < all.length; i += 1) {
    const ticket = all[i];
    if (ticket.__repeatOf === undefined) continue;
    // eslint-disable-next-line no-await-in-loop
    await knex('repair_tickets')
      .where('id', idByIndex[ticket.__index])
      .update({ reopened_from: idByIndex[ticket.__repeatOf] });
  }

  /* ---- lines, timeline and the stock that actually moved ---- */
  const items = [];
  const events = [];
  const movements = [];

  const STATUS_EVENT = {
    1: 'Diagnosis started', 2: 'Waiting for a part', 3: 'Quote sent to the customer',
    4: 'Repair in progress', 5: 'Quality check', 6: 'Ready for collection',
    7: 'Collected and closed', 9: 'Cancelled at the customer request'
  };

  all.forEach(function (ticket) {
    const ticketId = idByIndex[ticket.__index];

    ticket.__items.forEach(function (item) {
      items.push(Object.assign({ ticket_id: ticketId }, item));

      if (item.item_type === 'PART' && item.issued && item.part_id) {
        movements.push({
          agency_id: ticket.agency_id, part_id: item.part_id,
          movement: 'ISSUE', quantity: -item.quantity,
          balance_after: 0,       // filled in below, in ledger order
          unit_cost: item.unit_price,
          reference_type: 'TICKET', reference_id: ticketId,
          note: ticket.ticket_no, manager_name: 'system',
          created_at: ticket.repaired_at || ticket.received_at
        });
      }
    });

    events.push({
      ticket_id: ticketId, from_status: null, to_status: 0, action: 'RECEIVED',
      note: ticket.__repeatOf !== undefined ? 'Device returned after an earlier repair' : null,
      manager_name: 'system', is_public: true, created_at: ticket.received_at
    });

    // One event per state the ticket actually passed through, so turnaround
    // is measured between two recorded moments rather than inferred.
    const path = ticket.status === 9 ? [9] : [1, 2, 3, 4, 5, 6, 7].filter(function (s) {
      return s <= ticket.status && (s !== 2 || ticket.status === 2) && (s !== 3 || ticket.status === 3);
    });

    path.forEach(function (status, i) {
      const span = (ticket.closed_at || new Date()) - ticket.received_at;
      events.push({
        ticket_id: ticketId,
        from_status: i === 0 ? 0 : path[i - 1],
        to_status: status,
        action: 'STATUS',
        note: STATUS_EVENT[status],
        technician_id: ticket.technician_id,
        manager_name: 'system',
        is_public: [2, 6, 7].indexOf(status) !== -1,
        created_at: new Date(ticket.received_at.getTime() + (span * (i + 1)) / (path.length + 1))
      });
    });
  });

  for (let start = 0; start < items.length; start += 200) {
    // eslint-disable-next-line no-await-in-loop
    await knex('repair_ticket_items').insert(items.slice(start, start + 200));
  }
  for (let start = 0; start < events.length; start += 200) {
    // eslint-disable-next-line no-await-in-loop
    await knex('repair_ticket_events').insert(events.slice(start, start + 200));
  }

  /*
   * The stock the repairs consumed.
   *
   * balance_after is recomputed here in ledger order rather than taken from
   * the generator, because the movements are being written after the fact and
   * a running total has to run in the order the rows will be read in.  Then
   * the cache is set from the same arithmetic - which is what lets
   * `npm run check` reconcile the two and mean something.
   */
  const ledger = topUps.concat(movements)
    .sort(function (a, b) { return a.created_at - b.created_at; });

  const running = {};
  Object.keys(stock).forEach(function (key) { running[key] = stock[key].opening; });

  ledger.forEach(function (movement) {
    const key = movement.agency_id + ':' + movement.part_id;
    running[key] = (running[key] || 0) + movement.quantity;
    movement.balance_after = running[key];
  });

  for (let start = 0; start < ledger.length; start += 200) {
    // eslint-disable-next-line no-await-in-loop
    await knex('part_movements').insert(ledger.slice(start, start + 200));
  }

  /* Shelves that did not exist until a delivery created one. */
  const created = Object.keys(stock)
    .filter(function (key) { return stock[key].isNew; })
    .map(function (key) {
      return {
        agency_id: stock[key].agency_id,
        part_id: stock[key].part_id,
        on_hand: stock[key].on_hand,
        reserved: 0,
        reorder_level: 2
      };
    });

  for (let start = 0; start < created.length; start += 200) {
    // eslint-disable-next-line no-await-in-loop
    await knex('part_stock').insert(created.slice(start, start + 200));
  }

  const changed = Object.keys(stock).filter(function (key) {
    return !stock[key].isNew && stock[key].on_hand !== stock[key].opening;
  });
  for (let i = 0; i < changed.length; i += 1) {
    const shelf = stock[changed[i]];
    // eslint-disable-next-line no-await-in-loop
    await knex('part_stock').where('id', shelf.id).update({ on_hand: shelf.on_hand });
  }
};
