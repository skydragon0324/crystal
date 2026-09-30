const legacy = require('../../config/legacy');
const points = require('./points.repository');

/**
 * THE MEMBER DASHBOARD'S READS FROM THE PLATFORM - three figures and a person.
 *
 * The vendor has one screen that answers "where does this member stand", its
 * account overview (clientApiController.fetchAccountTotalInfo), and it is built
 * out of the same tables read here: the four soft-family ledgers, the
 * registration log, the activity stats and the user row. The fourth figure on
 * the dashboard - the Eshop's commerce value - is not in any table; it comes
 * from the Eshop over HTTP (services/storefronts.service.js).
 *
 * EVERY FIGURE IS A SUM IN SQL over one member's rows, never a sum of pages.
 * The ledgers are capped and paged for reading (points.repository CAP); a total
 * built from what a page fetched would quietly stop counting at the cap.
 *
 * Nothing here decides what a figure is CALLED or how the four are laid out.
 * That is services/member.service.js, which also decides what a failure in one
 * of them does to the other three.
 */

/**
 * `register_point_log.point_type` - vendor constants REG_POINT_TYPES: PHONE 0,
 * EPROD 1, MANAGER 2. A PHONE row is written when a member registers a handset
 * in the vendor's app (clientProductController, `point_type: PHONE`, the
 * handset's IMEI in equ_num); MANAGER rows are console adjustments, mostly the
 * deductions the vendor's overview reports separately as `sum_minus`.
 */
const REG_POINT_TYPES = { PHONE: 0, EPROD: 1, MANAGER: 2 };

/**
 * `user_phone_numbers.phone_type` - vendor constants PHONE_TYPE: USER 0,
 * REPORT 1, FEEDBACK 2, MANAGER 3. Only USER is the member's own: the others
 * are numbers left on a device report, on a feedback thread, or typed in by a
 * manager, and the vendor's own "the member's phone" read
 * (UserModel.findUserPhoneByUserPk) asks for USER and nothing else.
 */
const PHONE_TYPE = { USER: 0, REPORT: 1, FEEDBACK: 2, MANAGER: 3 };

function conn() {
  return legacy.connection();
}

/** A SUM() as a number - node-postgres hands numeric back as a string, oracledb as a number. */
function summed(row) {
  return row && row.total !== null && row.total !== undefined ? Number(row.total) || 0 : 0;
}

/**
 * THE FOUR PARTS OF "SOFTWARE POINTS", each summed from its own ledger.
 *
 * Appstore, Karaoke and Media are their tables' soft_points; Minus is
 * soft_point_log's, point_type 3 only - the same restriction the Minus ledger
 * lists under, applied by the same function (points.softSum). Minus rows are
 * stored NEGATIVE, so the caller ADDS all four and the deductions subtract
 * themselves.
 */
async function softwareParts(userId) {
  const [appstore, karaoke, media, minus] = await Promise.all([
    points.softSum('APPSTORE', userId),
    points.softSum('KARAOKE', userId),
    points.softSum('MEDIA', userId),
    points.softSum('SOFTWARE', userId)
  ]);

  return { appstore: appstore, karaoke: karaoke, media: media, minus: minus };
}

/**
 * THE POINTS A MEMBER EARNED REGISTERING PHONES: SUM(register_point_log.points)
 * WHERE point_type = 0.
 *
 * The vendor's overview gets this figure from a different table - it sums
 * register_phone_log.points (ProductModel.calcRegisterPhoneLogByUserPk). The two
 * are written together by the same registration and carry the same amount;
 * this reads the point log because that is the ledger of points, and the
 * phone log is a record of handsets that also keeps deleted ones.
 */
async function phoneRegisterPoints(userId) {
  const row = await conn()(legacy.pid('register_point_log'))
    .where('user_pk', userId)
    .where('point_type', REG_POINT_TYPES.PHONE)
    .sum({ total: 'points' })
    .first();

  return summed(row);
}

/**
 * The member's activity_point_stats row, as three numbers.
 *
 * `total_points` is the figure - the one the vendor's overview reports as
 * activity.total_points. `limit_points` is the cap it counts towards and
 * `minus_points` what has been taken back (the book-minus manager type). No row
 * is a member who has never earned an activity point, which is 0, not unknown.
 */
async function activityStats(userId) {
  const row = await conn()(legacy.pid('activity_point_stats'))
    .where('user_pk', userId)
    .first('total_points', 'limit_points', 'minus_points');

  const number = function (value) {
    return value === null || value === undefined ? null : Number(value);
  };

  return {
    total: row ? Number(row.total_points) || 0 : 0,
    limit: row ? number(row.limit_points) : null,
    minus: row ? number(row.minus_points) : null
  };
}

/**
 * WHO THE MEMBER IS, as the platform records it - ora_pid.users and the
 * member's own phone numbers.
 *
 * The BIRTHDAY IS TEXT, 'YYYY-MM-DD', formatted by the database: the column
 * is a timestamp without a zone, and a Date built from it in Node is midnight
 * in whatever zone the server runs in - which turns into the day before for
 * every reader west of it. TO_CHAR is what the vendor selects it with too
 * (UserModel), and it reads the same on Oracle.
 *
 * SEVERAL NUMBERS ARE ALLOWED. The vendor lets a member keep more than one -
 * up to PHONE_NUMBER_MAX_COUNT, 3 - so this is a list in the order they were
 * added, not the `.first()` the vendor's single-number read takes.
 */
async function member(userId) {
  const [row, phones] = await Promise.all([
    conn()(legacy.pid('users'))
      .where('user_pk', userId)
      .first('user_pk', 'user_id', 'user_name', 'gender',
        conn().raw("TO_CHAR(birthday, 'YYYY-MM-DD') as birthday")),
    conn()(legacy.pid('user_phone_numbers'))
      .where('user_pk', userId)
      .where('phone_type', PHONE_TYPE.USER)
      .orderBy('phone_pk', 'asc')
      .pluck('phone_number')
  ]);

  if (!row) return null;

  /* CHAR(1) comes back padded on some drivers; 'M ' is still a man. */
  const gender = String(row.gender || '').trim().toUpperCase();

  return {
    user_id: row.user_id || null,
    user_name: row.user_name || null,
    gender: gender === 'M' || gender === 'F' ? gender : null,
    birthday: row.birthday || null,
    phones: phones.filter(function (number) { return !!String(number || '').trim(); })
  };
}

module.exports = {
  REG_POINT_TYPES: REG_POINT_TYPES,
  PHONE_TYPE: PHONE_TYPE,
  softwareParts: softwareParts,
  phoneRegisterPoints: phoneRegisterPoints,
  activityStats: activityStats,
  member: member
};
