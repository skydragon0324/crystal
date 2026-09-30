const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../config');
const repo = require('../repositories/members.repository');
const users = require('../repositories/users.repository');
const serials = require('../repositories/serials.repository');
const products = require('../repositories/products.repository');
const walletRepo = require('../repositories/wallet.repository');
const legacyPoints = require('../repositories/legacy/points.repository');
const overview = require('../repositories/legacy/overview.repository');
const storefronts = require('./storefronts.service');
const tickets = require('../repositories/repairTickets.repository');
const warrantyRepo = require('../repositories/warranties.repository');
const wallet = require('./wallet.service');
const warranties = require('./warranties.service');
const settings = require('./settings.service');
const { transaction } = require('../repositories/shared/transaction');
const codes = require('../utils/codes');
const { HttpError } = require('../utils/response');
const { points: exactPoints } = require('../utils/query');
const { SYSTEM } = require('../utils/actor');

/**
 * The member centre (spec 11).
 *
 * Everything here is scoped to one signed-in member, and the scoping is done
 * by passing the userId into the repository rather than by filtering
 * afterwards - a member centre that fetches then filters is one bug away from
 * showing somebody else's devices.
 */

const LICENSABLE = ['TV', 'STB', 'KARAOKE', 'MEDIA'];

/**
 * A repair, as a member reads it.
 *
 * The status is a number in the table and stays one, but it travels with the
 * word beside it - the same pairing the public tracking endpoint uses.  A
 * member centre that renders "status 4" is one that has made its reader learn
 * the workflow's internal numbering.
 */
function memberRepair(ticket) {
  return Object.assign({}, ticket, {
    status_label: codes.labelOf(codes.TICKET_STATUS, ticket.status)
  });
}

function profile(userId) {
  return users.findById(userId);
}

async function updateProfile(userId, payload) {
  const patch = {};
  if (payload.nickname !== undefined) patch.nickname = String(payload.nickname).trim();
  if (payload.avatar !== undefined) patch.avatar = payload.avatar;

  if (!Object.keys(patch).length) throw new HttpError(400, 'common.nothingToUpdate');
  if (patch.nickname === '') throw new HttpError(400, 'common.valueFailedAValidation');

  await users.update(userId, patch);
  return users.findById(userId);
}

/**
 * THE MEMBER CENTRE'S FRONT PAGE: FOUR FIGURES, AND WHO THE MEMBER IS.
 *
 * The member asked for exactly this and nothing else, so the page that used to
 * gather nine balances, a merged timeline, devices and repairs now answers:
 *
 *   COMMERCE   the Eshop card's commerce value - money, read over HTTP
 *   SOFTWARE   Appstore + Karaoke + Media + Minus, each summed from its ledger
 *   REGISTER   phone registration points + the eproduct site's registration
 *              points
 *   ACTIVITY   the activity_point_stats row
 *
 * and under them the platform's own record of the person: user ID, name,
 * gender, birthday and their own phone numbers.
 *
 * EACH FIGURE IS THE VENDOR'S, taken from its account overview
 * (clientApiController.fetchAccountTotalInfo) with the arithmetic the member
 * stated - see each builder below for where the two part company and why.
 *
 * EVERY CARD FAILS ON ITS OWN. Two of the four reach outside Crystal, and the
 * Eshop being slow is no reason for the member's activity points to vanish;
 * so each card, and the details panel, is built inside its own guard and
 * degrades to `state: 'UNAVAILABLE'` with the rest of the reply intact. The
 * page shows what it has and says which part it could not get, rather than
 * one error for a reply that was three quarters good.
 *
 * `state` is one of:
 *
 *   OK            the figure is right
 *   UNLINKED      the member has no account in the system the figure is from,
 *                 which is a fact about them and not a failure
 *   UNAVAILABLE   it could not be read just now; `value` is null, never a guess
 */
const DASHBOARD_LINKS = {
  COMMERCE: '/account/eshop/commerce',
  EPRODUCT: '/account/eproduct/registrations'
};

async function dashboard(userId) {
  const [commerce, software, register, activity, member] = await Promise.all([
    guarded('commerce', function () { return commerceCard(userId); }, failedCard('COMMERCE', 'money', DASHBOARD_LINKS.COMMERCE)),
    guarded('software', function () { return softwareCard(userId); }, failedCard('SOFTWARE', 'points', pointsPageFor('APPSTORE'))),
    guarded('register', function () { return registerCard(userId); }, failedCard('REGISTER', 'points', DASHBOARD_LINKS.EPRODUCT)),
    guarded('activity', function () { return activityCard(userId); }, failedCard('ACTIVITY', 'points', pointsPageFor('ACTIVITY'))),
    guarded('member', function () { return memberDetails(userId); }, { state: 'UNAVAILABLE' })
  ]);

  return { cards: [commerce, software, register, activity], member: member };
}

/** Run one part of the dashboard; a failure is logged and answered with `fallback`. */
async function guarded(what, run, fallback) {
  try {
    return await run();
  } catch (err) {
    console.warn('[dashboard] ' + what + ' failed - ' + err.message);
    return fallback;
  }
}

/** A card that could not be built at all - its link still works, its figure is unknown. */
function failedCard(key, unit, to) {
  return { key: key, unit: unit, value: null, state: 'UNAVAILABLE', to: to, parts: [] };
}

/**
 * COMMERCE: the Eshop card's `commerce_value`, exactly the field the vendor's
 * overview reports (EshopApi.fetchCardInfo -> data.commerce_value).
 *
 * A figure the Eshop keeps, not one Crystal can sum - there is no table
 * behind it on this side. In development it is the REMOTE_MOCK's
 * (repositories/remote/mock.js). The link is the Eshop's commerce value log,
 * the list of movements the figure is the balance of.
 */
async function commerceCard(userId) {
  const found = await storefronts.eshopCard(userId);
  const card = found && found.card;

  const state = !found.linked ? 'UNLINKED' : card ? 'OK' : 'UNAVAILABLE';

  return {
    key: 'COMMERCE',
    unit: 'money',
    value: state === 'OK' ? Number(card.commerce_value) || 0 : null,
    state: state,
    to: DASHBOARD_LINKS.COMMERCE,
    parts: []
  };
}

/**
 * SOFTWARE = Appstore + Karaoke + Media + Minus.
 *
 * The vendor's `purchase_point`, part for part - with two differences, both
 * about WHERE a part is read and neither about what it is:
 *
 *   - Appstore, Karaoke and Media are summed from their ledgers here, where
 *     the vendor reads the *_point_stats row. The stats row is the vendor's
 *     cache of that very sum (recalcAppstorePointStats and its two twins:
 *     SUM(soft_points) over the member's own rows), and the cache is the one
 *     that can drift - the development stand-in's are rounded to whole points.
 *     The member asked for sums, and a sum of the rows is what each part's
 *     link lists.
 *
 *   - Minus is soft_point_log with point_type 3, as the vendor computes it.
 *
 * MINUS IS ADDED. Its rows are stored negative, so adding the sum subtracts
 * the deductions; subtracting it would count them as credits.
 */
async function softwareCard(userId) {
  const parts = await overview.softwareParts(userId);

  return {
    key: 'SOFTWARE',
    unit: 'points',
    value: exactPoints(parts.appstore + parts.karaoke + parts.media + parts.minus),
    state: 'OK',
    to: pointsPageFor('APPSTORE'),
    parts: [
      { key: 'APPSTORE', value: parts.appstore, state: 'OK', to: pointsPageFor('APPSTORE') },
      { key: 'KARAOKE', value: parts.karaoke, state: 'OK', to: pointsPageFor('KARAOKE') },
      { key: 'MEDIA', value: parts.media, state: 'OK', to: pointsPageFor('MEDIA') },
      /* The member calls the SOFTWARE ledger "Minus" - see web accountNav.js. */
      { key: 'MINUS', value: parts.minus, state: 'OK', to: pointsPageFor('SOFTWARE') }
    ]
  };
}

/**
 * REGISTER = phone registration points + eproduct registration points.
 *
 *   phone     SUM(register_point_log.points) WHERE point_type = 0, from the
 *             platform's database (overview.repository explains the table)
 *   eproduct  the eproduct site's `sum_total` over HTTP - the REMOTE_MOCK in
 *             development, which computes it from the same rows its
 *             registration log lists
 *
 * THE VENDOR'S `now_total` ALSO ADDS `sum_minus` - register_point_log rows
 * with point_type 2 (MANAGER) and status 1 (MINUS), a manager's deductions.
 * The member's definition of this card does not include them, and neither
 * does this; it is the one place the figure knowingly differs from the
 * vendor's overview.
 *
 * THE TWO HALVES FAIL SEPARATELY. The eproduct site can be down while the
 * phone points are perfectly readable, and the part that loaded is still
 * shown; only the total becomes unknown, because a total missing half of what
 * it adds up is not a smaller correct number.
 *
 * A member with NO eproduct login has registered nothing there - that half is
 * 0 and marked UNLINKED, and the total stands.
 */
async function registerCard(userId) {
  const [phone, eprod] = await Promise.all([
    guarded('register: phone', function () {
      return overview.phoneRegisterPoints(userId).then(function (value) {
        return { state: 'OK', value: value };
      });
    }, { state: 'UNAVAILABLE', value: null }),

    guarded('register: eproduct', async function () {
      const balance = await storefronts.eprodBalance(userId);
      if (!balance.linked) return { state: 'UNLINKED', value: 0 };
      if (balance.unavailable) return { state: 'UNAVAILABLE', value: null };
      return { state: 'OK', value: Number(balance.points) || 0 };
    }, { state: 'UNAVAILABLE', value: null })
  ]);

  const known = phone.value !== null && eprod.value !== null;

  return {
    key: 'REGISTER',
    unit: 'points',
    value: known ? exactPoints(phone.value + eprod.value) : null,
    state: known ? 'OK' : 'UNAVAILABLE',
    to: DASHBOARD_LINKS.EPRODUCT,
    parts: [
      /* No page on the site lists register_point_log, so this part has no link. */
      { key: 'PHONE', value: phone.value, state: phone.state, to: null },
      { key: 'EPRODUCT', value: eprod.value, state: eprod.state, to: DASHBOARD_LINKS.EPRODUCT }
    ]
  };
}

/**
 * ACTIVITY: the member's activity_point_stats row - `total_points` as the
 * figure, the one the vendor's overview reports, with the cap it counts
 * towards and what has been taken back beside it. The same row the activity
 * ledger's own standing tiles read (points.repository balances), so the two
 * pages cannot show different numbers for it.
 */
async function activityCard(userId) {
  const stats = await overview.activityStats(userId);

  return {
    key: 'ACTIVITY',
    unit: 'points',
    value: stats.total,
    state: 'OK',
    to: pointsPageFor('ACTIVITY'),
    parts: [
      { key: 'LIMIT', value: stats.limit, state: 'OK', to: null },
      { key: 'MINUS', value: stats.minus, state: 'OK', to: null }
    ]
  };
}

/**
 * WHO THE MEMBER IS, from the platform's user table rather than Crystal's
 * mirror of it: the gender and birthday exist only there, and the phone
 * numbers are the member's own (phone_type 0) and nobody else's.
 */
async function memberDetails(userId) {
  const found = await overview.member(userId);

  return Object.assign({ state: 'OK' }, found || {
    user_id: null, user_name: null, gender: null, birthday: null, phones: []
  });
}

/* ------------------------------------------------------------------ */
/*  device registration                                                */
/* ------------------------------------------------------------------ */

/**
 * A serial, resolved through the warehouse and then the local mirror.
 *
 * Returns the product too when Crystal recognises the model code, because the
 * registration needs it and asking twice would mean two warehouse round trips
 * for one action.
 */
async function resolveSerial(serialNumber) {
  const serial = String(serialNumber || '').trim().toUpperCase();
  if (!serial) return null;

  const record = await serials.lookup(serial);
  if (!record) return null;

  let product = null;
  if (record.product_id) product = await products.findRow(record.product_id);
  if (!product && record.model_code) product = await products.findByModelCode(record.model_code);

  return {
    serial_number: record.serial_number || serial,
    model_code: record.model_code,
    warranty_until: record.warranty_until || null,
    source: record.source,
    product: product
  };
}

/** What the "check my serial number" box on the registration form answers. */
async function checkSerial(serialNumber) {
  const found = await resolveSerial(serialNumber);
  if (!found) return { known: false, registered: false, product: null };

  const existing = await repo.findRegistrationBySerial(found.serial_number);

  return {
    known: true,
    registered: !!existing,
    serial_number: found.serial_number,
    warranty_until: found.warranty_until,
    product: found.product
      ? { id: found.product.id, name: found.product.name, slug: found.product.slug }
      : null
  };
}

/**
 * Spec 11: input SN -> check the warehouse -> register -> award points.
 *
 * All of it in one transaction, plus one thing the spec does not mention and
 * the after-sales module needs: the registration ISSUES THE WARRANTY.  That
 * is what makes a repair bookable against cover later, and doing it here
 * rather than leaving it to a nightly job means a member who registers a
 * device and walks into a service centre an hour later is already covered.
 */
async function registerProduct(userId, payload) {
  const found = await resolveSerial(payload.serial_number || payload.serialNumber);
  if (!found) throw new HttpError(404, 'common.notFound');

  const existing = await repo.findRegistrationBySerial(found.serial_number);
  if (existing) {
    throw new HttpError(409, existing.user_id === userId
      ? 'member.youHaveAlreadyRegistered'
      : 'common.thisSerialNumberIs');
  }

  const award = await settings.number('points.product_register', config.points.productRegister);
  const purchaseDate = payload.purchase_date || payload.purchaseDate || null;

  return transaction(async function (trx) {
    const rows = await repo.insertRegistration({
      user_id: userId,
      product_id: found.product ? found.product.id : null,
      serial_number: found.serial_number,
      nickname: payload.nickname || null,
      purchase_date: purchaseDate,
      warranty_until: found.warranty_until,
      points: award
    }, trx);

    const registration = rows[0];

    if (award > 0) {
      await wallet.recordPoints({
        user_id: userId,
        type: 'PRODUCT_REGISTER',
        amount: award,
        description: 'Registered ' + (found.product ? found.product.name : found.serial_number),
        reference: found.serial_number
      }, trx);
    }

    await serials.markRegistered(found.serial_number, trx);

    const cover = await warranties.issueStandard({
      user_id: userId,
      registered_product_id: registration.id,
      product_id: found.product ? found.product.id : null,
      serial_number: found.serial_number,
      start_date: purchaseDate || undefined
    }, SYSTEM, trx);

    return {
      registration: await repo.findRegistrationDetail(registration.id),
      points_awarded: award,
      warranty: cover
    };
  });
}

function listRegistrations(userId, paging) {
  return repo.registrations(userId, paging);
}

async function removeRegistration(userId, id) {
  const registration = await repo.findRegistration(id);
  if (!registration || registration.user_id !== userId) throw new HttpError(404, 'common.notFound');

  await repo.removeRegistration(id);
  return { removed: true };
}

/* ------------------------------------------------------------------ */
/*  licences                                                           */
/* ------------------------------------------------------------------ */

/**
 * Licence keys are derived rather than random.
 *
 * The same inputs always produce the same key, so support can re-derive one
 * and verify it without a lookup, and the HMAC secret makes it unforgeable
 * outside this server.
 */
function buildLicenseKey(deviceSn, deviceNo, userId, issuedAt) {
  const material = [deviceSn, deviceNo || '', userId, issuedAt].join('|');
  return crypto
    .createHmac('sha256', config.auth.jwtSecret)
    .update(material)
    .digest('hex')
    .toUpperCase()
    .slice(0, 20)
    .replace(/(.{5})(?=.)/g, '$1-');
}

async function issueLicense(userId, payload) {
  const deviceType = String(payload.device_type || payload.deviceType || '').toUpperCase();
  if (LICENSABLE.indexOf(deviceType) === -1) throw new HttpError(400, 'common.valueFailedAValidation');

  const deviceSn = String(payload.device_sn || payload.deviceSn || '').trim().toUpperCase();
  if (deviceSn.length < 6) throw new HttpError(400, 'common.theDeviceSerialNumber');

  const active = await repo.findLicenseByDeviceSn(deviceSn);
  if (active) throw new HttpError(409, 'common.duplicatedValue');

  const cost = await settings.number('points.license_cost', config.points.licenseCost);

  return transaction(async function (trx) {
    /*
     * The spend goes first and is what enforces affordability: recordPoints
     * locks the wallet and refuses to take the balance below zero, so a
     * member who cannot pay never gets as far as having a licence row
     * written.  Checking the balance beforehand would be a check two requests
     * could both pass.
     */
    if (cost > 0) {
      await wallet.recordPoints({
        user_id: userId,
        type: 'LICENSE',
        amount: -cost,
        description: 'Licence for ' + deviceType + ' ' + deviceSn,
        reference: deviceSn
      }, trx);
    }

    const issuedAt = Date.now();
    const validUntil = new Date(issuedAt);
    validUntil.setUTCFullYear(validUntil.getUTCFullYear() + 1);

    const rows = await repo.insertLicense({
      user_id: userId,
      registered_product_id: payload.registered_product_id || payload.registeredProductId || null,
      device_type: deviceType,
      device_sn: deviceSn,
      device_no: payload.device_no || payload.deviceNo || null,
      license_key: buildLicenseKey(deviceSn, payload.device_no, userId, issuedAt),
      points_used: cost,
      valid_until: validUntil.toISOString().slice(0, 10)
    }, trx);

    return { license: rows[0], points_used: cost };
  });
}

function listLicenses(userId, paging) {
  return repo.licenses(userId, paging);
}

function licensableDevices(userId) {
  return repo.licensableDevices(userId);
}

/* ------------------------------------------------------------------ */
/*  wallet, points and cover                                           */
/* ------------------------------------------------------------------ */

async function walletOverview(userId) {
  const purse = await wallet.overview(userId);
  if (!purse) return { user_id: userId, balance: 0, frozen: 0, point_balance: 0, currency: 'USD' };
  // Whether a pay password has been set is worth knowing; the hash is not.
  return Object.assign({}, purse, {
    pay_password_hash: undefined,
    has_pay_password: !!purse.pay_password_hash
  });
}

function walletTransactions(userId, filters, paging) {
  return wallet.transactions(userId, filters, paging);
}

function charge(userId, amount, reference) {
  return wallet.recordTransaction({
    user_id: userId, type: 'CHARGE', amount: amount,
    reference: reference || null, description: 'Wallet top-up'
  });
}

async function transfer(userId, payload) {
  const target = payload.email
    ? await users.findByEmail(payload.email)
    : await users.findByPhone(payload.phone);

  if (!target) throw new HttpError(404, 'common.notFound');
  if (target.status !== 'ACTIVE') throw new HttpError(400, 'common.valueFailedAValidation');

  await assertPayPassword(userId, payload.pay_password || payload.payPassword);

  return wallet.transfer(userId, target.id, payload.amount, payload.description);
}

/**
 * The pay password, checked only when one has been set.
 *
 * A member who has never set one is not blocked by it - the security page is
 * where they opt in - but once it exists every movement out of the wallet has
 * to present it.
 */
async function assertPayPassword(userId, supplied) {
  const purse = await walletRepo.find(userId);
  if (!purse || !purse.pay_password_hash) return true;

  const matches = await bcrypt.compare(String(supplied || ''), purse.pay_password_hash);
  if (!matches) throw new HttpError(400, 'common.theOldPasswordIs');
  return true;
}

async function setPayPassword(userId, currentPassword, newPassword) {
  if (String(newPassword || '').length < 6) {
    throw new HttpError(400, 'common.theNewPasswordMust', null, { n: 6 });
  }

  const purse = await walletRepo.find(userId);
  if (purse && purse.pay_password_hash) {
    const matches = await bcrypt.compare(String(currentPassword || ''), purse.pay_password_hash);
    if (!matches) throw new HttpError(400, 'common.theOldPasswordIs');
  }

  return transaction(async function (trx) {
    await walletRepo.ensure(userId, trx);
    await walletRepo.lock(userId, trx);
    await walletRepo.setBalances(userId, {
      pay_password_hash: await bcrypt.hash(String(newPassword), config.auth.bcryptRounds)
    }, trx);
    return { updated: true };
  });
}

/**
 * THE POINT LEDGER, ACROSS EVERY SYSTEM THE MEMBER HAS ONE IN.
 *
 * Crystal keeps its own points - a registration award, a daily login, a licence
 * spend - in point_logs. The vendor keeps five more, one per system, and until
 * now no screen anywhere had put them together: the vendor's console reached
 * them through eight separate menu entries and Crystal's page did not know they
 * existed.
 *
 * They are NOT added up. Karaoke points cannot buy an app; they are six
 * currencies rather than six sources of one number, and a single total would be
 * a figure the member could not spend. So the balances come back as a list of
 * systems and the movements come back as one ledger the reader filters.
 *
 * CRYSTAL IS JUST ANOTHER SYSTEM HERE. Its ledger is not privileged and not
 * discarded - it is the sixth card, and asking for source=CRYSTAL reads
 * point_logs exactly as it always did.
 */
const CRYSTAL_SYSTEM = 'CRYSTAL';

/** point_logs.type - the `point_movement` enum in sql/schema.sql. */
const POINT_MOVEMENTS = ['LOGIN', 'PRODUCT_REGISTER', 'PURCHASE', 'LICENSE',
  'ACTIVITY', 'REPAIR', 'WARRANTY_EXTENSION', 'ADJUST'];

/** The six a `source` may name, Crystal's own first. */
function pointSources() {
  return [CRYSTAL_SYSTEM].concat(legacyPoints.SYSTEMS.map(function (s) { return s.key; }));
}

/**
 * WHERE ON THE STOREFRONT A SYSTEM'S POINTS ARE READ - three pages, not one.
 *
 * The web had a single points page taking any of the six as `?source=`, and
 * the dashboard linked every card and every timeline row into it. Crystal's
 * own ledger and the activity log are different things from the four
 * software ledgers - different columns, different filters, different summaries
 * - so each now has an address of its own and the four software systems share
 * the one that is left. The links are written here because this is where the
 * dashboard reply is built; the web redirects the old `?source=CRYSTAL` and
 * `?source=ACTIVITY` addresses, so a reply cached before this change still
 * lands somewhere true.
 */
function pointsPageFor(source) {
  if (source === CRYSTAL_SYSTEM) return '/account/points/crystal';
  if (source === 'ACTIVITY') return '/account/points/activity';
  return '/account/points?source=' + source;
}

async function listPoints(userId, filters, paging) {
  /*
   * A SOURCE NOBODY KEEPS IS A 400, not an empty page.
   *
   * `?source=ESHOP` used to answer `200 { rows: [], total: 0 }` - the legacy
   * ledger filters the requested key against its list and reads nothing when
   * it matches none - which is indistinguishable from "you have no points
   * there" and sent whoever wrote the page looking for missing data. The
   * Eshop keeps money and prize value, not points; it is not a source here
   * and saying so is the useful answer.
   *
   * The same rule and the same message as an unknown `view` on the eshop log
   * (services/storefronts.service.js), because it is the same mistake.
   */
  if (filters.source && pointSources().indexOf(filters.source) === -1) {
    throw new HttpError(400, 'common.valueFailedAValidation');
  }

  /* The same rule for the activity category - see points.repository. */
  if (filters.category && legacyPoints.ACTIVITY_CATEGORIES.indexOf(filters.category) === -1) {
    throw new HttpError(400, 'common.valueFailedAValidation');
  }

  /*
   * And for a movement kind, which is a PostgreSQL enum: an unknown one is
   * not an empty result there but an "invalid input value" error, answered as
   * a 500. The list is sql/schema.sql's point_movement, in its order.
   */
  if (filters.type && POINT_MOVEMENTS.indexOf(filters.type) === -1) {
    throw new HttpError(400, 'common.valueFailedAValidation');
  }

  /*
   * A WORD ONLY THE OTHER SIDE KNOWS MATCHES NOTHING. `type` is a Crystal
   * movement kind and `category` an activity one; asked of a ledger that has
   * no such column, the honest answer is no rows, not every row.
   */
  if (filters.source && filters.source !== CRYSTAL_SYSTEM) {
    if (filters.type) return { rows: [], total: 0 };
    return legacyPoints.ledger(userId, filters, paging);
  }

  if (filters.source === CRYSTAL_SYSTEM) {
    if (filters.category) return { rows: [], total: 0 };
    const own = await wallet.points(userId, filters, paging);
    return { rows: own.rows.map(asMovement), total: own.total };
  }

  /*
   * Everything, which means two paged reads that have to become one page.
   *
   * Both sides are read at their full extent and merged before the slice,
   * because a page of the union is not the union of two pages - taking rows
   * 0-19 from each and interleaving them gives forty rows of which the correct
   * twenty are some unknown subset. The vendor side is already capped
   * (repositories/legacy/points.repository.js) and Crystal's is one member's
   * own history, so the set being sorted is bounded and small.
   */
  const wide = { limit: legacyPoints.CAP, offset: 0 };

  /*
   * The filters go to BOTH sides. The vendor ledger used to be read with an
   * empty object here while Crystal's was read with the period, so a window
   * narrowed one half of the merged list and left the other half whole.
   * Crystal's ledger has no category and the vendor's has no movement type,
   * and each side answers nothing for a word only the other knows.
   */
  const [vendor, own] = await Promise.all([
    filters.type ? { rows: [] } : legacyPoints.ledger(userId, filters, wide),
    filters.category ? { rows: [] } : wallet.points(userId, filters, wide)
  ]);

  const merged = vendor.rows.concat(own.rows.map(asMovement));
  merged.sort(function (a, b) {
    const gap = new Date(b.at) - new Date(a.at);
    return gap !== 0 ? gap : String(b.source).localeCompare(String(a.source));
  });

  const offset = paging.offset || 0;
  return {
    rows: merged.slice(offset, offset + (paging.limit || 20)),
    total: merged.length
  };
}

/** A Crystal point_logs row in the shape the vendor's five answer in. */
function asMovement(row) {
  return {
    id: row.id,
    source: CRYSTAL_SYSTEM,
    source_label: 'Crystal',
    at: row.created_at,
    /*
     * WHAT KIND OF MOVEMENT, as the ledger's own code - LOGIN, LICENSE,
     * ADJUST. It was only ever the fallback for an empty description, so a
     * page that could filter by it (the endpoint takes `type`) had no way to
     * SHOW it: every row said what the description said and none said what
     * kind of thing it was. The code travels; the words for it are the web's.
     */
    type: row.type,
    amount: Number(row.amount) || 0,
    charged: null,
    reason: row.description || row.type,
    reference: row.reference || null,
    by_agency: false,

    /*
     * The one field only Crystal can fill. Its ledger stamps the balance after
     * every movement, which is what lets the check script prove the cached
     * total has not drifted; the vendor's five keep no such column, so the
     * field is present and null rather than absent on five sources out of six.
     */
    balance_after: row.balance_after === undefined || row.balance_after === null
      ? null
      /* numeric arrives from node-postgres as a string; `amount` beside it is
         already a number, and one column of each in the same row is worse
         than either convention on its own. */
      : Number(row.balance_after)
  };
}

/**
 * Every system's standing, Crystal's included.
 *
 * Crystal's balance is the sum of its own ledger rather than the cached wallet
 * total, so that this screen and the reconciliation check are reading the same
 * number from the same place.
 */
async function pointSystems(userId) {
  const [vendor, own] = await Promise.all([
    legacyPoints.balances(userId),
    wallet.points(userId, {}, { limit: legacyPoints.CAP, offset: 0 })
  ]);

  /*
   * Summed to three decimals, which is the ledger column's own scale.
   *
   * Points are fractional now (sql/deltas/027), and adding a few hundred
   * tenths in JavaScript ends at 43.699999999999996 rather than 43.7 - a
   * balance card showing sixteen digits for a number the member can count on
   * their fingers. The figure is not rounded, only the binary error is.
   */
  const balance = exactPoints(own.rows.reduce(function (sum, row) {
    return sum + (Number(row.amount) || 0);
  }, 0));

  return [{
    key: CRYSTAL_SYSTEM,
    label: 'Crystal',
    source: 'CRYSTAL',
    balance: balance,
    cap: null,
    spent: null,
    updated_at: own.rows.length ? own.rows[0].created_at : null,
    has_row: own.total > 0
  }].concat(vendor);
}

function pointSummary(userId) {
  return wallet.pointSummary(userId);
}

/** The cover on this member's devices, and what they could extend it to. */
function listWarranties(userId, paging) {
  return warrantyRepo.search({ user_id: userId }, paging);
}

/**
 * Buying an extension with points.
 *
 * The spend and the cover are one transaction for the same reason the
 * registration award is: points taken for cover that did not persist is a
 * complaint nobody can resolve from the data.
 */
async function extendWarranty(userId, payload) {
  const registration = await repo.findRegistration(payload.registered_product_id);
  if (!registration || registration.user_id !== userId) throw new HttpError(404, 'common.notFound');

  const policy = await warrantyRepo.findPolicy(payload.policy_id);
  if (!policy || policy.status !== 'ACTIVE') throw new HttpError(404, 'common.notFound');
  if (!policy.points_price) throw new HttpError(400, 'common.valueFailedAValidation');

  return transaction(async function (trx) {
    await wallet.recordPoints({
      user_id: userId,
      type: 'WARRANTY_EXTENSION',
      amount: -policy.points_price,
      description: policy.name,
      reference: registration.serial_number
    }, trx);

    const cover = await warranties.extend({
      user_id: userId,
      registered_product_id: registration.id,
      product_id: registration.product_id,
      serial_number: registration.serial_number,
      policy_id: policy.id,
      price_paid: 0,
      points_used: policy.points_price
    }, SYSTEM);

    return { warranty: cover, points_used: policy.points_price };
  });
}

/** What this member could buy for one of their devices. */
async function extensionOptions(userId, registrationId) {
  const registration = await repo.findRegistration(registrationId);
  if (!registration || registration.user_id !== userId) throw new HttpError(404, 'common.notFound');

  const product = registration.product_id ? await products.findRow(registration.product_id) : null;
  if (!product) return [];

  return warrantyRepo.purchasablePoliciesFor(product.category_id, product.series_id);
}

/* ------------------------------------------------------------------ */
/*  repairs and feedback                                               */
/* ------------------------------------------------------------------ */

/** This member's repair history, which is the same list the console reads. */
async function listRepairs(userId, paging) {
  const result = await tickets.search({ user_id: userId }, paging);
  return Object.assign({}, result, { rows: result.rows.map(memberRepair) });
}

async function repairDetail(userId, id) {
  const ticket = await tickets.findById(id, false);
  if (!ticket || ticket.user_id !== userId) throw new HttpError(404, 'common.ticketNotFound');

  const [items, events] = await Promise.all([
    tickets.itemsOf(id),
    // A member sees the updates the centre published, not its internal notes.
    tickets.eventsOf(id, true)
  ]);

  return { ticket: ticket, items: items, events: events };
}

/**
 * Rating a repair, from the member's own account.
 *
 * The same rule as the console's version: closed only, once only.  It is
 * enforced in both places rather than shared, because the console's route is
 * guarded by a permission and this one is guarded by owning the ticket -
 * different questions with the same answer.
 */
async function rateRepair(userId, id, payload) {
  const ticket = await tickets.findRow(id);
  if (!ticket || ticket.user_id !== userId) throw new HttpError(404, 'common.ticketNotFound');
  if (ticket.status !== 7) throw new HttpError(409, 'common.valueFailedAValidation');
  if (ticket.rating) throw new HttpError(409, 'common.duplicatedValue');

  const rating = Math.round(Number(payload.rating));
  if (!(rating >= 1 && rating <= 5)) throw new HttpError(400, 'common.valueFailedAValidation');

  const rows = await tickets.update(id, {
    rating: rating,
    rating_comment: payload.rating_comment || null,
    rated_at: new Date()
  });

  return rows[0];
}

/*
 * FEEDBACK MOVED OUT of this service.
 *
 * It used to be four functions here: submit, list, find, close - one row
 * with one reply column. It is a conversation now, with a state machine and
 * two sides posting into one chain, and that belongs in a service of its
 * own rather than in the member centre's catch-all.
 *
 * See services/feedback.service.js. The member endpoints call it directly.
 */

module.exports = {
  LICENSABLE: LICENSABLE,

  profile: profile,
  updateProfile: updateProfile,
  dashboard: dashboard,

  resolveSerial: resolveSerial,
  checkSerial: checkSerial,
  registerProduct: registerProduct,
  listRegistrations: listRegistrations,
  removeRegistration: removeRegistration,

  issueLicense: issueLicense,
  listLicenses: listLicenses,
  licensableDevices: licensableDevices,

  walletOverview: walletOverview,
  walletTransactions: walletTransactions,
  charge: charge,
  transfer: transfer,
  setPayPassword: setPayPassword,
  listPoints: listPoints,
  pointSystems: pointSystems,
  pointSummary: pointSummary,

  listWarranties: listWarranties,
  extendWarranty: extendWarranty,
  extensionOptions: extensionOptions,

  listRepairs: listRepairs,
  repairDetail: repairDetail,
  rateRepair: rateRepair,

};
