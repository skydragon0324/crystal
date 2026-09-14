'use strict';

/**
 * GIVE A REAL ACCOUNT SOMETHING TO LOOK AT.
 *
 *   npm run demo:account              every member who has nothing
 *   npm run demo:account iron         one of them, by login, email or id
 *
 * `npm run seed` fills the member area for the accounts IT creates. An account
 * registered afterwards - by signing up on the site, which is what a person
 * actually does - has none of that: no devices, no licences, no repair, and
 * so the Eproduct pages, the warranty page and the repair page are all
 * correctly empty and indistinguishable from broken.
 *
 * IT NEVER TRUNCATES AND NEVER RESEEDS. `npm run seed` clears fifty-one tables
 * including `users`, so running it to fix one empty page deletes the very
 * account that was being looked at. This adds rows beside what is there and
 * touches nothing else.
 *
 * IT ONLY FILLS WHAT IS EMPTY. A member who already has devices is skipped
 * entirely rather than given more, so running it twice is the same as running
 * it once and it can never bury real data under demo data.
 *
 * The old logs - the three history pages that read the satellite schemas -
 * are filled by `npm run legacy:install`, which covers every member with a
 * platform identity. This is only for Crystal's own tables.
 */

const db = require('../src/config/db');

/** Devices per member. Enough to page, few enough to read. */
const DEVICES = 3;

function daysAgo(n) {
  return new Date(Date.now() - (n * 86400000));
}

function isoDaysAgo(n) {
  return daysAgo(n).toISOString().slice(0, 10);
}

function addMonths(iso, months) {
  const at = new Date(iso);
  at.setMonth(at.getMonth() + months);
  return at.toISOString().slice(0, 10);
}

/**
 * The members to fill.
 *
 * With no argument: everybody who has no registered device. With one: whoever
 * matches it, whether that is a login, an email or an id - because the person
 * running this knows the account by whichever of those they signed in with.
 */
async function membersFor(who) {
  if (!who) {
    const empty = await db('users as u')
      .leftJoin('registered_products as r', 'r.user_id', 'u.id')
      .whereNull('r.id')
      .select('u.id', 'u.email', 'u.nickname');

    return empty;
  }

  const term = String(who).trim().toLowerCase();

  return db('users')
    .where(function () {
      this.whereRaw('LOWER(email) = ?', [term])
        .orWhereRaw("LOWER(email) LIKE ?", [term + '@%'])
        .orWhereRaw('LOWER(nickname) = ?', [term]);
      if (/^\d+$/.test(term)) this.orWhere('id', Number(term));
    })
    .select('id', 'email', 'nickname');
}

/**
 * Serials nobody has registered yet.
 *
 * A registration is a claim on a SERIAL, and two members cannot hold the same
 * one - the table says so and it is the whole point of the number. So this
 * takes unclaimed ones rather than inventing any, and stops when they run
 * out rather than colliding.
 */
async function freeSerials(limit) {
  /*
   * `oracle_serials` IS the table, despite the name. The numbers come off the
   * factory system and the table is named for where they came from rather
   * than for what they are.
   */
  return db('oracle_serials as s')
    .join('products as p', 'p.id', 's.product_id')
    .leftJoin('registered_products as r', 'r.serial_number', 's.serial_number')
    .whereNull('r.id')
    .orderBy('s.id')
    .limit(limit)
    .select('s.serial_number', 's.product_id', 'p.name as product_name', 'p.warranty_months');
}

async function fill(member, serials) {
  const registrations = [];
  const warranties = [];

  const stamp = new Date().getFullYear();
  const existing = await db('warranties').count({ c: '*' }).first();
  let seq = Number(existing.c) || 0;

  serials.forEach(function (serial, i) {
    const purchased = isoDaysAgo(60 + (i * 45));
    const months = serial.warranty_months || 12;
    const ends = addMonths(purchased, months);

    registrations.push({
      user_id: member.id,
      product_id: serial.product_id,
      serial_number: serial.serial_number,
      nickname: member.nickname + "'s " + serial.product_name,
      purchase_date: purchased,
      warranty_until: ends,
      points: 500,
      register_time: daysAgo(58 + (i * 45))
    });

    seq += 1;
    warranties.push({
      warranty_no: 'W' + stamp + String(seq).padStart(5, '0'),
      user_id: member.id,
      product_id: serial.product_id,
      serial_number: serial.serial_number,
      policy_id: null,
      kind: 'STANDARD',
      source: 'REGISTRATION',
      start_date: purchased,
      end_date: ends,
      covers_parts: true,
      covers_labour: true,
      covers_accidental: false,
      claim_limit: 0,
      /*
       * ONE OF THEM IS OUT OF COVER, deliberately. A member whose every
       * device is in warranty never sees the expired treatment, and that is
       * the state the warranty page exists to make obvious.
       */
      status: Date.parse(ends) < Date.now() ? 'EXPIRED' : 'ACTIVE'
    });
  });

  await db('registered_products').insert(registrations);
  await db('warranties').insert(warranties);

  return registrations.length;
}

(async function main() {
  const who = process.argv[2];

  try {
    const members = await membersFor(who);

    if (!members.length) {
      console.log(who ? 'no member matches ' + who : 'every member already has a device');
      return;
    }

    let filled = 0;
    let skipped = 0;

    for (let i = 0; i < members.length; i += 1) {
      const member = members[i];

      /* eslint-disable no-await-in-loop */
      const has = await db('registered_products').where('user_id', member.id).count({ c: '*' }).first();
      if (Number(has.c) > 0) { skipped += 1; continue; }

      const serials = await freeSerials(DEVICES);
      if (!serials.length) {
        console.log('no unclaimed serials left - run `npm run seed` on a scratch database');
        break;
      }

      const added = await fill(member, serials);
      /* eslint-enable no-await-in-loop */

      filled += 1;
      console.log('  ' + member.email + ': +' + added + ' devices, +' + added + ' warranties');
    }

    console.log('filled ' + filled + ' member(s), skipped ' + skipped + ' that already had devices');

    if (filled) {
      console.log('\nthe three history pages come from the satellite schemas -');
      console.log('run `npm run legacy:install` if those are empty too.');
    }
  } catch (err) {
    console.error('demo:account failed: ' + err.message);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
})();
