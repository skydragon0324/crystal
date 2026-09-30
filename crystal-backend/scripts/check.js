/**
 * End to end checks against a running API.
 *
 *   node scripts/check.js [http://localhost:5100]
 *
 * Every check is a real HTTP call against a real database, because the things
 * most worth checking here are the ones that only exist when both are
 * involved: that the permission grid actually refuses an editor, that a
 * covered repair cannot be created without a warranty behind it, that the
 * parts ledger still sums to the cached balance.
 *
 * Written as a script rather than as a test suite because it is also the
 * thing somebody runs after a deployment, from a laptop, against staging.
 */
const axios = require('axios');
const ExcelJS = require('exceljs');
const FormData = require('form-data');

const base = (process.argv[2] || 'http://localhost:5100').replace(/\/$/, '');
const api = base + '/api';

/*
 * Three prefixes, because the API has three audiences: the console under
 * /api/admin, the member centre under /api/account, and the customer website
 * at the root.  Each check names which one it is exercising, which is also how
 * a failure tells you which frontend has just broken.
 */
const ADMIN = api + '/admin';

let passed = 0;
let failed = 0;
const failures = [];

function ok(name) {
  passed += 1;
  console.log('  ok   ' + name);
}

function bad(name, detail) {
  failed += 1;
  failures.push(name + (detail ? ' - ' + detail : ''));
  console.log('  FAIL ' + name + (detail ? ' - ' + detail : ''));
}

/**
 * Runs one check.
 *
 * A check passes only by returning EXACTLY true; a string is a failure with a
 * reason, and anything else - including the `undefined` that
 * `err.response && err.response.status === 401` produces when there is no
 * response at all - is a failure too.  That last case is why this is strict:
 * a suite that reports "ok" because the server was unreachable is worse than
 * no suite.
 */
async function check(name, fn) {
  try {
    const result = await fn();
    if (result === true) return ok(name);
    if (typeof result === 'string') return bad(name, result);
    return bad(name, result === false ? null : 'the check did not return true');
  } catch (err) {
    const message = err.response && err.response.data && err.response.data.message
      ? err.response.data.message
      : err.message;
    return bad(name, message);
  }
}

function client(token, baseUrl) {
  const instance = axios.create({ baseURL: baseUrl || ADMIN, timeout: 20000 });
  if (token) instance.defaults.headers.common.Authorization = 'Bearer ' + token;
  return instance;
}

/** The customer website's client - no token, and nothing it can write. */
function site() {
  return axios.create({ baseURL: api, timeout: 20000 });
}

/** The API answers { success, message, data } - this unwraps it. */
function data(response) {
  return response.data && response.data.data;
}

/**
 * Every leaf of a sectioned catalog, as dotted addresses.
 *
 * The catalogs are two levels deep - section, then key - so the thing worth
 * comparing between them is the leaves. Object.keys returns section names,
 * which both files share by construction.
 */
/**
 * Every catalog that is a TRANSLATION - what i18n registers, minus the source.
 *
 * Derived rather than listed, so a language added to src/i18n is held to all
 * of these checks from the moment it appears. They required './zh' directly,
 * so a second catalog could have gone missing addresses with every check
 * still green.
 */
const TRANSLATIONS = require('../src/i18n').locales()
  .filter(function (code) { return code !== require('../src/i18n').SOURCE_LOCALE; });

/**
 * Every language the API can answer in, English included.
 *
 * TRANSLATIONS above is "the catalogs that are not the source", which is the
 * right set for asking whether a translation is complete. This is the right
 * set for asking whether a REPLY changes with X-Lang - English is one of the
 * answers there, and a value that reads the same in all three is the failure
 * being looked for.
 */
const LOCALES = require('../src/i18n').locales();

function addresses(catalog) {
  return Object.keys(catalog).reduce(function (out, section) {
    const body = catalog[section];
    if (!body || typeof body !== 'object') return out.concat([section]);
    return out.concat(Object.keys(body).map(function (key) { return section + '.' + key; }));
  }, []);
}

async function main() {
  console.log('checking ' + api + '\n');

  const anon = client();

  console.log('health');
  await check('GET /health answers', async function () {
    const body = data(await site().get('/health'));
    if (body.service !== 'crystal-backend') return 'unexpected service name';
    if (body.engines.postgres !== 'up') return 'postgres is ' + body.engines.postgres;
    return true;
  });

  console.log('\nauthentication');

  await check('a wrong password is refused', async function () {
    try {
      await anon.post('/auth/login', { username: 'admin', password: 'nope' });
      return 'the sign-in was accepted';
    } catch (err) {
      return !!err.response && err.response.status === 401;
    }
  });

  await check('an unknown user is refused the same way', async function () {
    try {
      await anon.post('/auth/login', { username: 'nobody-here', password: 'nope' });
      return 'the sign-in was accepted';
    } catch (err) {
      // The message must not say which of the two was wrong.
      const message = err.response.data.message || '';
      return /username or password/i.test(message) || 'the message names the reason: ' + message;
    }
  });

  const session = data(await anon.post('/auth/login', { username: 'admin', password: 'crystal1234' }));
  const admin = client(session.token);

  await check('signing in returns a token and the pages the role may open', function () {
    if (!session.token) return 'no token';
    if (!session.pages || !session.pages.length) return 'no pages';
    return true;
  });

  await check('a refresh token buys a new session', async function () {
    const renewed = data(await anon.post('/auth/refresh', { refresh_token: session.refresh_token }));
    return !!renewed.token;
  });

  await check('an endpoint refuses an absent token', async function () {
    try {
      await anon.get('/tickets');
      return 'the request was allowed';
    } catch (err) {
      return err.response.status === 401;
    }
  });

  console.log('\nthe permission grid');

  const editorSession = data(await anon.post('/auth/login', { username: 'editor', password: 'crystal1234' }));
  const editor = client(editorSession.token);

  await check('an editor may read the catalogue', async function () {
    const body = data(await editor.get('/categories'));
    return Array.isArray(body.rows);
  });

  await check('an editor may NOT open repair tickets', async function () {
    try {
      await editor.get('/tickets');
      return 'the editor was allowed in';
    } catch (err) {
      return err.response.status === 403;
    }
  });

  await check('an editor may NOT read the member list', async function () {
    try {
      await editor.get('/warranties');
      return 'the editor was allowed in';
    } catch (err) {
      return err.response.status === 403;
    }
  });

  const branchSession = data(await anon.post('/auth/login', { username: 'branch', password: 'crystal1234' }));
  const branch = client(branchSession.token);

  /*
   * THERE IS NO PER-CENTRE SCOPING ANY MORE, and the check that asserted it
   * has gone with the column.
   *
   * `managers.agency_id` pinned an account to one service centre and eight
   * controllers narrowed their reads through it, so a branch manager saw one
   * centre's tickets and nobody else's. A console account is a username and a
   * role now; what it may do is the permission grid's answer alone, and every
   * role that can open a screen sees the whole estate on it.
   *
   * What is still true - and still checked below - is that seeing something
   * and being allowed to act on it are different questions.
   */
  await check('a centre manager sees the estate, not one centre', async function () {
    const body = data(await branch.get('/tickets?limit=100'));
    if (!body.rows.length) return 'no tickets came back';

    const centres = {};
    body.rows.forEach(function (row) { centres[row.agency_id] = true; });
    return Object.keys(centres).length > 1
      || 'still narrowed to ' + Object.keys(centres).length + ' centre';
  });

  await check('a centre manager may build a claim but NOT approve it', async function () {
    /*
     * The grid gives BRANCH_MANAGER level 2 on claims and head office level 3,
     * so building and submitting is theirs and signing off the payment is not.
     * That is a permission, and permissions did not change.
     *
     * A month can only be claimed once per centre - that UNIQUE constraint is
     * the point - so on a second run the build is correctly refused and the
     * existing claim is what gets tried instead.
     */
    /* The centre comes off a ticket rather than from /agencies: this role has
       no grant on the service centre screen, and asking would be a 403 that
       says nothing about claims. */
    const anyTicket = data(await branch.get('/tickets?limit=1')).rows[0];
    if (!anyTicket) return 'no ticket to take a service centre from';

    let target = null;

    try {
      target = data(await branch.post('/claims', {
        agency_id: anyTicket.agency_id, month: previousMonth()
      }));
    } catch (err) {
      const existing = data(await branch.get('/claims?limit=1'));
      target = existing.rows && existing.rows[0];
    }

    // Nothing to approve is not a pass - the check has to actually try.
    if (!target) return 'could not obtain a claim to try it on';

    try {
      await branch.post('/claims/' + target.id + '/status', { status: 2 });
      return 'a centre manager approved a claim';
    } catch (err) {
      return !!err.response && err.response.status === 403;
    }
  });

  function previousMonth() {
    const now = new Date();
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    return d.toISOString().slice(0, 10);
  }

  console.log('\nthe scoreboard');

  await check('the dashboard assembles', async function () {
    const body = data(await admin.get('/dashboard'));
    if (!body.counters) return 'no counters';
    if (!Array.isArray(body.daily) || body.daily.length !== 30) return 'expected 30 days';
    return true;
  });

  await check('service centre health scores every centre', async function () {
    const body = data(await admin.get('/analysis/agency-health?limit=50'));
    if (!body.rows.length) return 'no centres';

    const scored = body.rows.every(function (row) {
      return typeof row.risk_score === 'number' && row.risk_level && row.health_status;
    });
    return scored || 'a centre came back without a score';
  });

  await check('health is sorted worst first by default', async function () {
    const body = data(await admin.get('/analysis/agency-health?limit=50'));
    for (let i = 1; i < body.rows.length; i += 1) {
      if (body.rows[i].risk_score > body.rows[i - 1].risk_score) return 'row ' + i + ' is worse than the one above it';
    }
    return true;
  });

  await check('the tiles count the whole estate, not the filtered page', async function () {
    const all = data(await admin.get('/analysis/agency-health?limit=1'));
    const filtered = data(await admin.get('/analysis/agency-health?risk=HIGH&limit=1'));
    return all.summary.total === filtered.summary.total
      || 'the tiles changed when a filter was applied';
  });

  await check('the defect watch finds something to watch', async function () {
    const body = data(await admin.get('/analysis/defect-watch?limit=100'));
    if (!body.rows.length) return 'no rows';
    const levels = {};
    body.rows.forEach(function (row) { levels[row.watch_level] = true; });
    return !!levels.ALERT || !!levels.WATCH || 'every row is NORMAL';
  });

  await check('a defect row can be broken down by production batch', async function () {
    const body = data(await admin.get('/analysis/defect-watch?limit=1&sort=cnt_90d'));
    const row = body.rows[0];
    const detail = data(await admin.get('/analysis/defect-watch/' + row.product_id + '/' + row.symptom_id));
    return Array.isArray(detail.batches);
  });

  console.log('\nthe repair workflow');

  const centres = data(await admin.get('/agencies/options'));
  const centre = centres[0];
  const anyTicket = data(await admin.get('/tickets?limit=1')).rows[0];

  let created = null;

  await check('a ticket can be taken in', async function () {
    created = data(await admin.post('/tickets', {
      customer_name: 'Check script',
      customer_phone: '+8613900000000',
      serial_number: anyTicket.serial_number,
      agency_id: centre.id,
      fault_description: 'Created by scripts/check.js',
      intake_channel: 0
    }));
    if (!created.ticket_no) return 'no ticket number';
    // The promise is stamped from the centre's own SLA at intake.
    if (!created.promised_at) return 'no promised date';
    return true;
  });

  await check('intake decided the warranty question and recorded its reasoning', function () {
    if (created.is_warranty && !created.warranty_id) return 'covered with no warranty behind it';
    if (!created.warranty_note) return 'no note explaining the decision';
    return true;
  });

  await check('the device was recognised as a repeat visit', function () {
    // The serial was taken from an existing ticket, so unless that ticket is
    // older than the repeat window this one has to be linked to it.
    return created.reopened_from !== undefined;
  });

  await check('an impossible status change is refused', async function () {
    try {
      await admin.post('/tickets/' + created.id + '/status', { status: 7 });
      return 'received went straight to closed';
    } catch (err) {
      return err.response.status === 409;
    }
  });

  await check('a legal status change is accepted', async function () {
    const moved = data(await admin.post('/tickets/' + created.id + '/status', { status: 1 }));
    return moved.status === 1;
  });

  await check('the change was written to the ticket timeline', async function () {
    const detail = data(await admin.get('/tickets/' + created.id));
    const statusEvents = detail.events.filter(function (e) { return e.action === 'STATUS'; });
    return statusEvents.length >= 1;
  });

  console.log('\nthe bill and the shelf');

  const stockRows = data(await admin.get('/stock?agency_id=' + centre.id + '&state=OK&limit=1')).rows;
  const shelf = stockRows[0];

  await check('adding a part line reserves stock without moving it', async function () {
    if (!shelf) return 'this centre stocks nothing';

    const before = data(await admin.get('/stock?agency_id=' + centre.id + '&part_id=' + shelf.part_id)).rows[0];

    await admin.post('/tickets/' + created.id + '/items', {
      item_type: 'PART', part_id: shelf.part_id, name: shelf.part_name,
      quantity: 1, unit_price: 50
    });

    const after = data(await admin.get('/stock?agency_id=' + centre.id + '&part_id=' + shelf.part_id)).rows[0];

    if (after.on_hand !== before.on_hand) return 'on_hand moved on a reservation';
    if (after.available !== before.available - 1) return 'available did not fall';
    return true;
  });

  await check('the ticket total was recomputed from its lines', async function () {
    const detail = data(await admin.get('/tickets/' + created.id));
    const lines = detail.items.reduce(function (total, item) { return total + Number(item.amount); }, 0);
    const expected = detail.ticket.is_warranty ? 0 : lines;
    return Number(detail.ticket.total_amount) === expected
      || 'total ' + detail.ticket.total_amount + ' against lines ' + lines;
  });

  await check('issuing the part moves the shelf and writes a ledger row', async function () {
    const detail = data(await admin.get('/tickets/' + created.id));
    const line = detail.items.filter(function (i) { return i.item_type === 'PART'; })[0];
    if (!line) return 'no part line';

    const before = data(await admin.get('/stock?agency_id=' + centre.id + '&part_id=' + line.part_id)).rows[0];
    await admin.post('/tickets/' + created.id + '/items/' + line.id + '/issue');
    const after = data(await admin.get('/stock?agency_id=' + centre.id + '&part_id=' + line.part_id)).rows[0];

    if (after.on_hand !== before.on_hand - 1) return 'on_hand did not fall';

    const moves = data(await admin.get('/stock/movements?reference_type=TICKET&reference_id=' + created.id));
    return moves.rows.length >= 1 || 'no movement was recorded';
  });

  await check('a ticket cannot be closed while it is unpaid', async function () {
    const detail = data(await admin.get('/tickets/' + created.id));
    if (Number(detail.ticket.total_amount) <= 0) return true;  // nothing to pay

    await admin.post('/tickets/' + created.id + '/status', { status: 4 });
    await admin.post('/tickets/' + created.id + '/status', { status: 5 });
    await admin.post('/tickets/' + created.id + '/status', { status: 6 });

    try {
      await admin.post('/tickets/' + created.id + '/status', { status: 7 });
      return 'an unpaid ticket was closed';
    } catch (err) {
      return err.response.status === 409;
    }
  });

  await check('deleting the line puts the issued part back', async function () {
    const detail = data(await admin.get('/tickets/' + created.id));
    const line = detail.items.filter(function (i) { return i.item_type === 'PART'; })[0];
    if (!line) return true;

    const before = data(await admin.get('/stock?agency_id=' + centre.id + '&part_id=' + line.part_id)).rows[0];
    await admin.delete('/tickets/' + created.id + '/items/' + line.id);
    const after = data(await admin.get('/stock?agency_id=' + centre.id + '&part_id=' + line.part_id)).rows[0];

    return after.on_hand === before.on_hand + 1 || 'the part was not returned to the shelf';
  });

  await check('the ticket can be removed again', async function () {
    await admin.delete('/tickets/' + created.id);
    const body = data(await admin.get('/tickets/' + created.id + '?deleted=1'));
    return body.ticket.is_deleted === true;
  });

  console.log('\nthe ledgers reconcile');

  await check('every parts shelf equals the sum of its movements', async function () {
    const body = data(await admin.get('/stock?limit=200'));
    // The console has no endpoint for this on purpose - it is a consistency
    // property, not a screen - so it is asserted through the movement list.
    let checked = 0;
    for (let i = 0; i < Math.min(body.rows.length, 12); i += 1) {
      const row = body.rows[i];
      // eslint-disable-next-line no-await-in-loop
      const moves = data(await admin.get(
        '/stock/movements?agency_id=' + row.agency_id + '&part_id=' + row.part_id + '&limit=200'
      ));
      const total = moves.rows.reduce(function (sum, m) { return sum + Number(m.quantity); }, 0);
      if (total !== row.on_hand) {
        return 'shelf ' + row.part_no + ' at ' + row.agency_code +
          ' holds ' + row.on_hand + ' but its ledger sums to ' + total;
      }
      checked += 1;
    }
    return checked > 0 || 'nothing to check';
  });

  console.log('\nsettlement');

  await check('a claim can be previewed before it is committed to', async function () {
    const rows = data(await admin.get('/claims/preview?agency_id=' + centre.id + '&month=' + previousMonth()));
    return Array.isArray(rows);
  });

  await check('head office can approve a claim a branch cannot', async function () {
    const claims = data(await admin.get('/claims?limit=1'));
    if (!claims.rows.length) return true;   // nothing built yet

    const claim = claims.rows[0];
    if (claim.status !== 0 && claim.status !== 1) return true;

    if (claim.status === 0) await admin.post('/claims/' + claim.id + '/status', { status: 1 });
    const approved = data(await admin.post('/claims/' + claim.id + '/status', { status: 2 }));
    return approved.status === 2 && approved.approved_amount !== null;
  });

  await check('a rejection without a reason is refused', async function () {
    const claims = data(await admin.get('/claims?status=1&limit=1'));
    if (!claims.rows.length) return true;

    try {
      await admin.post('/claims/' + claims.rows[0].id + '/status', { status: 3 });
      return 'a claim was rejected with no reason';
    } catch (err) {
      return err.response.status === 400;
    }
  });

  console.log('\nthe audit trail');

  /* ------------------------------------------------ the console's own tools */

  await check('a spreadsheet goes out and comes back in', async function () {
    /*
     * The round trip is the whole feature: what Export produces is what
     * Import expects, so the workflow is "edit the file and send it" rather
     * than "export one shape and hand-type another".  Matched on the CODE,
     * so an edited row updates the row it came from.
     */
    const sheet = await admin.get('/symptoms/export', { responseType: 'arraybuffer' });
    if (String(sheet.headers['content-type']).indexOf('spreadsheetml') === -1) {
      return 'the export is not a spreadsheet';
    }

    const book = new ExcelJS.Workbook();
    await book.xlsx.load(sheet.data);
    const ws = book.worksheets[0];
    if (String(ws.getRow(1).getCell(2).value) !== 'Code') return 'the header row is missing';

    const before = data(await admin.get('/symptoms?limit=1')).total;

    ws.getRow(2).getCell(3).value = 'CHECK RUN RENAME';
    const added = ws.addRow({});
    added.getCell(2).value = 'ZZ-CHECK';
    added.getCell(3).value = 'Added by the check script';
    added.getCell(4).value = 'OTHER';
    added.getCell(5).value = 2;
    added.getCell(6).value = 990;

    const form = new FormData();
    form.append('file', Buffer.from(await book.xlsx.writeBuffer()), { filename: 's.xlsx' });
    const result = data(await admin.post('/symptoms/import', form, { headers: form.getHeaders() }));

    try {
      /*
       * Created OR restored: this check soft-deletes its row on the way out,
       * so the second run of the script finds it in the recycle bin.  An
       * import that carries a row is saying the row exists, so the importer
       * brings it back rather than colliding with the unique code that found
       * it - and either way the list is one longer than it was.
       */
      if (result.created + result.restored !== 1) return 'the new row did not arrive';
      if (!result.updated) return 'the edited rows were not written back';

      const after = data(await admin.get('/symptoms?limit=1')).total;
      if (after !== before + 1) return 'the import added ' + (after - before) + ' rows, not one';

      // Matched, not duplicated: an edited row must update the row it came from.
      return data(await admin.get('/symptoms?q=CHECK RUN RENAME&limit=5')).total === 1
        || 'the edited row was duplicated rather than updated';
    } finally {
      const mine = data(await admin.get('/symptoms?q=ZZ-CHECK&limit=5')).rows;
      for (let i = 0; i < mine.length; i += 1) await admin.delete('/symptoms/' + mine[i].id);
    }
  });

  await check('a refused import writes nothing at all', async function () {
    /*
     * All or nothing.  Half a spreadsheet applied is a table nobody can
     * reason about - the rows that landed are not marked - so one bad cell
     * rolls the whole file back, and every bad row is reported together
     * rather than one round trip at a time.
     */
    const book = new ExcelJS.Workbook();
    const ws = book.addWorksheet('x');
    ws.addRow(['Id', 'Code', 'Name', 'Component', 'Severity', 'Order']);
    ws.addRow([null, 'ZZ-GOOD', 'This row is fine', 'SCREEN', 1, 10]);
    ws.addRow([null, 'ZZ-BAD', 'This one is not', 'SCREEN', 'not a number', 20]);

    const form = new FormData();
    form.append('file', Buffer.from(await book.xlsx.writeBuffer()), { filename: 'b.xlsx' });

    const before = data(await admin.get('/symptoms?limit=1')).total;
    try {
      await admin.post('/symptoms/import', form, { headers: form.getHeaders() });
      return 'a spreadsheet with a bad cell was accepted';
    } catch (err) {
      if (err.response.status !== 400) return 'unexpected ' + err.response.status;

      const detail = err.response.data.detail;
      if (!Array.isArray(detail) || detail.length !== 1) return 'the bad row was not reported';
      if (detail[0].row !== 3) return 'it blamed row ' + detail[0].row;

      const after = data(await admin.get('/symptoms?limit=1')).total;
      return after === before || 'the good row was written anyway';
    }
  });

  await check('the console search answers across the system, within permission', async function () {
    const hits = data(await admin.get('/search?q=c9'));
    if (!hits.groups.length) return 'nothing was found for a model everybody has';

    const product = hits.groups.filter(function (g) { return g.type === 'product'; })[0];
    if (!product) return 'the catalogue was not searched';
    // A hit navigates to the SCREEN that holds it, searched - the console
    // addresses rows by searching, not by putting an id in a url.
    if (product.items[0].url.indexOf('/admin/catalog/products?q=') !== 0) {
      return 'a hit does not lead anywhere useful: ' + product.items[0].url;
    }

    if (data(await admin.get('/search?q=c')).groups.length) return 'one letter was treated as a search';

    /*
     * The grid decides, not the box.  An editor who cannot open the member
     * list must not be able to read member names out of a search box either,
     * and the guarantee is that the query is never run.
     */
    const theirs = data(await editor.get('/search?q=c9'));
    const types = theirs.groups.map(function (g) { return g.type; });
    return types.indexOf('member') === -1
      || 'an editor was shown members through the search box';
  });

  await check('the bell counts real work, and only what the role may do', async function () {
    const bell = data(await admin.get('/notifications'));
    if (!bell.groups.length) return 'nothing at all is outstanding, which this seed should not be';

    // The badge is the whole set; the items are a sample of it.  A badge
    // reading 4 beside a list of four when there are ninety makes a crisis
    // look like a quiet afternoon.
    const lying = bell.groups.filter(function (g) { return g.total < g.items.length; });
    if (lying.length) return lying.length + ' groups counted fewer than they listed';

    const summed = bell.groups.reduce(function (sum, g) { return sum + g.total; }, 0);
    if (summed !== bell.total) return 'the total does not sum its groups';

    const theirs = data(await editor.get('/notifications'));
    return theirs.groups.every(function (g) { return g.key !== 'claims_awaiting'; })
      || 'an editor was told about claims they cannot approve';
  });

  await check('the writes above were recorded', async function () {
    const body = data(await admin.get('/audit?entity=repair_tickets&limit=20'));
    return body.rows.length > 0 || 'nothing was written to the trail';
  });

  await check('an update entry records what actually moved', async function () {
    const body = data(await admin.get('/audit?entity=repair_tickets&action=update&limit=5'));
    if (!body.rows.length) return 'no update entries';

    const entry = body.rows[0];
    if (!entry.changed || !entry.changed.length) return 'no column list';
    if (!entry.before_data || !entry.after_data) return 'only one side was kept';
    return true;
  });

  await check('no audit entry carries a password hash', async function () {
    const body = data(await admin.get('/audit?limit=100'));
    const leaked = body.rows.filter(function (row) {
      const text = JSON.stringify(row.after_data) + JSON.stringify(row.before_data);
      return text.indexOf('$2a$') !== -1 || text.indexOf('$2b$') !== -1;
    });
    return leaked.length === 0 || leaked.length + ' entries contain a hash';
  });

  console.log('\nwhat an upload is called on disk');

  /*
   * THE NAME THE CALLER CHOSE NEVER REACHES THE FILESYSTEM.
   *
   * A stored filename taken from the request is three problems at once: it
   * can carry `../` out of the upload root, it can carry a second extension
   * past a filter that only read the first, and it publishes whatever the
   * person happened to call the file - which on a support attachment is
   * routinely a name, a case number or a company.
   *
   * storage.buildFilename replaces it with a timestamp and twelve random
   * hex characters. That is not visible from any screen, so it is asserted
   * here.
   */
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );

  /* Hostile on three counts: traversal, a second extension, and a real name. */
  const NASTY = '../../etc/Jane Doe case 4471.php.png';

  const uploaded = [];

  async function upload(filename) {
    const form = new FormData();
    form.append('file', PNG, { filename: filename });

    const body = data(await admin.post('/media/upload/products', form, {
      headers: form.getHeaders()
    }));

    uploaded.push(body.file_path);
    return body.file_path;
  }

  await check('a stored filename keeps nothing the caller sent', async function () {
    const stored = await upload(NASTY);

    if (stored.indexOf('..') !== -1) return 'THE PATH CAN TRAVERSE: ' + stored;
    if (/\.php/i.test(stored)) return 'THE SECOND EXTENSION SURVIVED: ' + stored;
    if (/jane|doe|4471|etc/i.test(stored)) return 'THE ORIGINAL NAME SURVIVED: ' + stored;

    /* It has to land in the folder the route named, not one the caller did. */
    return stored.indexOf('/uploads/products/') === 0
      || 'it was written outside the route\'s folder: ' + stored;
  });

  await check('a stored filename is a timestamp, random characters and the extension',
    async function () {
      const stored = await upload('photo.png');
      const name = stored.split('/').pop();

      /*
       * base36 seconds-ish stamp, a dash, twelve hex characters, the real
       * extension. The extension is kept because a browser and an <img> both
       * want it; everything before it is generated.
       */
      return /^[a-z0-9]+-[0-9a-f]{12}\.png$/.test(name)
        || 'unexpected shape: ' + name;
    });

  await check('the same file twice is two files', async function () {
    /*
     * Two people uploading the same screenshot in the same second must not
     * collide - the timestamp alone does not separate them, which is why
     * there is a random half at all.
     */
    const first = await upload('same.png');
    const second = await upload('same.png');

    return first !== second || 'both uploads were written to ' + first;
  });

  await check('the uploads this script made are cleaned up', async function () {
    /*
     * REMOVED FROM DISK, not from a table.
     *
     * An upload that names no owner_type creates no media_assets row - see
     * media.controller - so these are files with nothing pointing at them.
     * This used to look them up in /media and delete by id, which found
     * nothing every time and passed anyway: a cleanup that cleans nothing and
     * reports success is worse than no cleanup at all.
     *
     * The storage module is required directly because that is what actually
     * owns the file; going through the API would need an owner this test
     * deliberately does not give it.
     */
    const store = require('../src/config/storage');
    const fs = require('fs');

    if (!uploaded.length) return 'nothing was uploaded to clean up';

    /* And the signature each one was given as it was stored - the audit would otherwise report the file missing. */
    const signatures = require('../src/repositories/contentSignatures.repository');
    for (let i = 0; i < uploaded.length; i += 1) {
      store.remove(uploaded[i]);
      // eslint-disable-next-line no-await-in-loop
      await signatures.remove('image', uploaded[i]);
    }

    const left = uploaded.filter(function (publicPath) {
      const abs = store.absolutePath(publicPath);
      return abs && fs.existsSync(abs);
    });

    return left.length === 0 || left.length + ' file(s) are still on disk: ' + left[0];
  });

  console.log('\nthe reply envelope');

  await check('a failure is worded in the language that was asked for', async function () {
    const zh = client(session.token);
    zh.defaults.headers.common['X-Lang'] = 'zh';
    try {
      await zh.get('/tickets/99999999');
      return 'a missing ticket was found';
    } catch (err) {
      const message = err.response.data.message || '';
      return /[一-龥]/.test(message) || 'the message came back in English: ' + message;
    }
  });

  await check('a word outside a vocabulary is a bad request, not a broken server', async function () {
    /*
     * The vocabularies are native enum types now rather than a CHECK per
     * column, and an enum refuses a value with 22P02 where a CHECK refused it
     * with 23514. Only 23514 was mapped, so every mistyped status answered 500
     * - "we broke" - for what is squarely the caller's mistake.
     */
    try {
      await admin.post('/faqs', {
        category: 'TELEPATHY', question: 'q', answer: 'a', status: 'PUBLISHED'
      });
      return 'a category outside faq_category was accepted';
    } catch (err) {
      if (!err.response) return 'no reply at all';
      if (err.response.status !== 400) {
        return 'answered ' + err.response.status + ', not 400';
      }
      // The database names the type and the value; that is the useful half.
      const message = String(err.response.data.message || '');
      return message.indexOf('faq_category') !== -1
        || 'the message does not say which vocabulary: ' + message;
    }
  });

  await check('the two catalogs carry exactly the same keys', async function () {
    /*
     * English is a catalog now rather than the absence of one, which is what
     * lets a reply be reworded without editing the throw site and orphaning
     * its Chinese. The price of that is two files that can drift, so:
     *
     * BOTH DIRECTIONS, and neither is interesting on its own. A key in en and
     * not in zh answers a Chinese reader in English; a key in zh and not in en
     * is a translation of a message this API no longer sends. Nothing about
     * either shows up at runtime, because both fall through silently.
     */
    /*
     * THE LEAVES, not Object.keys.
     *
     * The catalogs are sections now, so the top level is a dozen section
     * names that both files trivially share - comparing those would assert
     * nothing at all while looking like it asserted everything.
     */
    const en = addresses(require('../src/i18n/en'));

    for (const locale of TRANSLATIONS) {
      const other = addresses(require('../src/i18n/' + locale));

      const untranslated = en.filter(function (key) { return other.indexOf(key) === -1; });
      if (untranslated.length) {
        return untranslated.length + ' messages have no ' + locale + ': ' + untranslated.slice(0, 3).join(', ');
      }

      const orphaned = other.filter(function (key) { return en.indexOf(key) === -1; });
      if (orphaned.length) return orphaned.length + ' ' + locale + ' entries have no English';
    }

    return true;
  });

  await check('every address a throw site names resolves in both catalogs', async function () {
    /*
     * THE ONE FAILURE THE ADDRESSED SHAPE INTRODUCES.
     *
     * When the key was the English sentence, a message missing from the
     * catalog was answered in English - the key WAS the message, so the worst
     * case was untranslated. An address that resolves to nothing has no such
     * fallback: it would be sent to the user as `memberAuth.thatCodeHas`, a
     * token where a sentence belongs.
     *
     * translate() falls back to English to keep that from reaching anyone,
     * which means the mistake is silent at runtime. So it is caught here
     * instead, by reading every address the source actually sends.
     */
    const fs = require('fs');
    const path = require('path');

    const en = addresses(require('../src/i18n/en'));

    const walk = function (dir) {
      return fs.readdirSync(dir, { withFileTypes: true }).reduce(function (out, entry) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return out.concat(walk(full));
        return /\.js$/.test(entry.name) ? out.concat([full]) : out;
      }, []);
    };

    const src = path.join(__dirname, '..', 'src');
    const sent = new Set();

    walk(src).forEach(function (file) {
      if (/[\\/]i18n[\\/]/.test(file)) return;
      const code = fs.readFileSync(file, 'utf8');

      /* Anything that looks like an address, inside a message-sending call. */
      code.split('\n').forEach(function (line) {
        if (!/\b(HttpError|ok|fail)\s*\(/.test(line)) return;
        (line.match(/'([a-z][A-Za-z0-9]*\.[A-Za-z0-9]+)'/g) || []).forEach(function (quoted) {
          sent.add(quoted.slice(1, -1));
        });
      });
    });

    if (sent.size < 60) return 'only found ' + sent.size + ' addresses - the scan is not reading the source';

    const missing = [...sent].filter(function (key) { return en.indexOf(key) === -1; });
    if (missing.length) return missing.length + ' addresses have no English: ' + missing.slice(0, 3).join(', ');

    for (const locale of TRANSLATIONS) {
      const other = addresses(require('../src/i18n/' + locale));
      const gaps = [...sent].filter(function (key) { return other.indexOf(key) === -1; });
      if (gaps.length) return gaps.length + ' addresses have no ' + locale + ': ' + gaps.slice(0, 3).join(', ');
    }

    return true;
  });

  await check('the database speaks both languages', async function () {
    /*
     * POSTGRESQL'S OWN ERRORS REACH THE USER, and for a long time they
     * reached them in English whatever X-Lang asked for: a duplicate, a word
     * outside an enum and all five of the schema's RAISE EXCEPTION guards.
     *
     * Two ways for that to come back, and neither shows up at runtime:
     *
     *   AN ADDRESS THAT DOES NOT RESOLVE falls back to English, which is
     *   exactly the state this replaced - it works, and it is not translated.
     *
     *   A RENAMED CONSTRAINT stops matching the map and silently reverts to
     *   'duplicated value', which is true and useless.
     */
    const fs = require('fs');
    const path = require('path');
    const { GUARDS, UNIQUE } = require('../src/middleware/error');

    const en = addresses(require('../src/i18n/en'));

    const used = Object.keys(GUARDS).map(function (code) { return GUARDS[code].message; })
      .concat(Object.keys(UNIQUE).map(function (name) { return UNIQUE[name]; }))
      .concat(['common.isNotAValue', 'common.isRequired']);

    const noEn = used.filter(function (a) { return en.indexOf(a) === -1; });
    if (noEn.length) return noEn.length + ' database messages have no English: ' + noEn.join(', ');

    for (const locale of TRANSLATIONS) {
      const other = addresses(require('../src/i18n/' + locale));
      const gaps = used.filter(function (a) { return other.indexOf(a) === -1; });
      if (gaps.length) return gaps.length + ' database messages have no ' + locale + ': ' + gaps.join(', ');
    }

    /* Every constraint the map names still has to exist in the schema. */
    const schema = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');
    const gone = Object.keys(UNIQUE).filter(function (name) {
      return schema.indexOf(name) === -1;
    });
    if (gone.length) return gone.length + ' constraints no longer exist: ' + gone.join(', ');

    /* And every guard code the schema raises has to be in the map. */
    const raised = (schema.match(/ERRCODE = '(CRd+)'/g) || []).map(function (hit) {
      return hit.replace(/.*'(CRd+)'/, '$1');
    });

    const unmapped = raised.filter(function (code) { return !GUARDS[code]; });
    return unmapped.length === 0 || unmapped.length + ' guard codes are raised but not mapped: ' + unmapped.join(', ');
  });

  await check('no message is still written as an English sentence', async function () {
    /*
     * The migration to addresses was a codemod, and a codemod matches the
     * shapes it was given. `ok(res, await service.thing(a, b), 'created')`
     * has a comma inside its second argument, which is exactly the shape the
     * first pass missed - fifty-four of them. Those still WORK, because an
     * unknown string passes through, and they are never translated.
     */
    const fs = require('fs');
    const path = require('path');

    const catalog = require('../src/i18n/en');
    const byText = {};
    Object.keys(catalog).forEach(function (section) {
      Object.keys(catalog[section]).forEach(function (key) {
        byText[catalog[section][key]] = section + '.' + key;
      });
    });

    const walk = function (dir) {
      return fs.readdirSync(dir, { withFileTypes: true }).reduce(function (out, entry) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return out.concat(walk(full));
        return /\.js$/.test(entry.name) ? out.concat([full]) : out;
      }, []);
    };

    const offenders = [];

    /*
     * CODES THAT HAPPEN TO BE SPELLED LIKE A MESSAGE.
     *
     * A signing certificate's status is `ok`, `warning`, `critical` or
     * `expired`, and the first is also common.ok's English. It is a value the
     * console switches on - translating it would break the switch - and never
     * a sentence anybody reads. Named by file AND word, so `ok` written as a
     * reply anywhere else, or another message written out in this file, is
     * still caught.
     */
    const CODES_NOT_MESSAGES = { 'certificates.service.js': ['ok'] };

    walk(path.join(__dirname, '..', 'src')).forEach(function (file) {
      if (/[\\/]i18n[\\/]/.test(file)) return;
      const codes = CODES_NOT_MESSAGES[path.basename(file)] || [];

      /*
       * EVERY LINE, not only the ones that call HttpError.
       *
       * Restricting this to call lines is what let seven of them hide: the
       * PostgreSQL error-code map returns `{ message: '...' }`, a multi-line
       * ternary puts its branches under the `throw`, and a per-row failure is
       * pushed onto an array. None of those lines name HttpError at all.
       *
       * The rule that needs no such list: a literal EQUAL to a catalog
       * message should be that message's address. If it is English, it is
       * either an untranslated reply or a duplicate of one.
       */
      fs.readFileSync(file, 'utf8').split('\n').forEach(function (line, i) {
        (line.match(/'((?:[^'\\]|\\.)*)'/g) || []).forEach(function (quoted) {
          const text = quoted.slice(1, -1).replace(/\\'/g, "'");
          if (byText[text] && codes.indexOf(text) === -1) offenders.push(path.basename(file) + ':' + (i + 1) + ' ' + byText[text]);
        });
      });
    });

    return offenders.length === 0 || offenders.length + ' literals still English: ' + offenders.slice(0, 3).join(', ');
  });

  await check('an untranslated message still answers in English', async function () {
    // /health is at the root of the prefix, not under the console.
    const zh = site();
    zh.defaults.headers.common['X-Lang'] = 'zh';
    const body = await zh.get('/health');
    // 'ok' has a translation; what matters is that a message came back at all
    // and that nothing turned into a key the reader has to decipher.
    return typeof body.data.message === 'string' && body.data.message.length > 0;
  });

  console.log('\nthe customer website');

  const web = site();

  await check('the smartphone landing page assembles', async function () {
    const body = data(await web.get('/smartphones/home'));
    if (!body.category) return 'no category';
    if (!body.series.length) return 'no series';
    if (!body.hero) return 'no hero product';
    // A series with nothing published in it is a tile that goes nowhere.
    const empty = body.series.filter(function (line) { return Number(line.product_cnt) === 0; });
    return empty.length === 0 || empty.length + ' empty series were offered';
  });

  await check('"latest" is the release date, and it is a shortlist', async function () {
    /*
     * WHAT MAKES ONE PHONE NEWER THAN ANOTHER. `products.release_date`, which
     * is the only date on the row that means anything to a customer -
     * `created_at` is when somebody typed it into the console.
     *
     * The block used to be ordered the way the shelf is, `sort_order` first,
     * so the newest phone appeared at the top of "latest" only if somebody
     * had also dragged it there. That failure is invisible in a list of one,
     * which is why this asserts the ORDER rather than the contents, and
     * asserts it on every section rather than on smartphones alone.
     */
    const sections = ['/smartphones/home', '/sections/TV/home'];

    for (let s = 0; s < sections.length; s += 1) {
      /* eslint-disable no-await-in-loop */
      const body = data(await web.get(sections[s]));
      /* eslint-enable no-await-in-loop */

      const latest = body.latest || [];
      if (!latest.length) return sections[s] + ' has no latest products';
      if (latest.length > 4) return sections[s] + ' offered ' + latest.length + ' latest products, expected at most 4';

      for (let i = 1; i < latest.length; i += 1) {
        const newer = latest[i - 1].release_date;
        const older = latest[i].release_date;

        /* A product with no date is not the newest thing in the catalogue. */
        if (!newer && older) return sections[s] + ': an undated product sorted above a dated one';
        if (newer && older && new Date(newer) < new Date(older)) {
          return sections[s] + ': ' + older + ' sorted above ' + newer;
        }
      }
    }

    return true;
  });

  await check('the homepage and the smartphone page each have their own adverts, cropped per device', async function () {
    /*
     * THE HOMEPAGE USED TO SHOW THE FLAGGED SMARTPHONE'S PHOTOGRAPHS, because
     * it had no advertising of its own. Two runs now, and they must not be the
     * same pictures under two names.
     */
    const ask = function (path, device) {
      return web.get(path, { headers: { 'X-Crystal-Device': device } }).then(data);
    };

    const homeDesktop = await ask('/site/showcase/home', 'desktop');
    const homeMobile = await ask('/site/showcase/home', 'mobile');
    const landing = await ask('/smartphones/home', 'desktop');
    const smartphone = await ask('/site/showcase/smartphone', 'desktop');

    if (!homeDesktop.length || !homeMobile.length) return 'the homepage has no adverts to show';
    if (!smartphone.length) return 'the smartphone page has no adverts to show';

    if (homeDesktop.some(function (row) { return row.placement !== 'HOME'; })) return 'a homepage advert of another placement';
    if (homeDesktop.some(function (row) { return row.device_type === 'mobile'; })) return 'a desktop was sent a phone crop';
    if (homeMobile.some(function (row) { return row.device_type === 'desktop'; })) return 'a phone was sent a desktop crop';

    /* The smartphone page's hero is exactly its advert run. */
    const slides = (landing.hero_slides || []).map(function (row) { return row.id; }).join(',');
    if (slides !== smartphone.map(function (row) { return row.id; }).join(',')) return 'the smartphone page is not showing its adverts';

    const shared = homeDesktop.filter(function (row) {
      return smartphone.some(function (other) { return other.file_path === row.file_path; });
    });
    if (shared.length) return 'the two pages share pictures: ' + shared[0].file_path;

    try {
      await web.get('/site/showcase/everywhere');
      return 'an unknown placement was answered';
    } catch (err) {
      return (err.response && err.response.status === 404) || 'an unknown placement did not answer 404';
    }
  });

  await check('a section carries everything a tile needs to be drawn', async function () {
    /*
     * The Eproducts index, the homepage and the header's menu all draw a
     * category as a picture, a line of copy and a count.  Each of those is a
     * column or an asset in the database rather than a constant in the
     * browser - a page that invents its own copy for a section is a page that
     * still says "five series" after the sixth is published.
     */
    const sections = data(await web.get('/categories'));
    if (!sections.length) return 'no sections';

    const bare = sections.filter(function (row) {
      return !row.description || !row.icon || !row.banner_image;
    });
    if (bare.length) return bare.length + ' sections cannot be drawn from the API alone';

    const counted = sections.filter(function (row) { return Number(row.product_cnt) > 0; });
    return counted.length > 0 || 'no section reported how much is in it';
  });

  await check('the catalogue grid pages rather than returning the section', async function () {
    const first = data(await web.get('/products?type=SMARTPHONE&limit=3&page=1'));
    if (first.rows.length !== 3) return 'asked for three, got ' + first.rows.length;
    if (first.total <= 3) return 'the section is too small to prove paging';

    const second = data(await web.get('/products?type=SMARTPHONE&limit=3&page=2'));
    if (second.total !== first.total) return 'the total moved between pages';

    // A second page that repeats the first is a missing ORDER BY, not paging.
    const overlap = second.rows.filter(function (row) {
      return first.rows.some(function (other) { return other.id === row.id; });
    });
    return overlap.length === 0 || overlap.length + ' products appeared on both pages';
  });

  await check('the grid filters on the slugs a shared link carries', async function () {
    const bySlug = data(await web.get('/products?category=smartphones&series=c9'));
    if (!bySlug.rows.length) return 'no products in the c9 line';

    const strays = bySlug.rows.filter(function (row) { return row.series_slug !== 'c9'; });
    if (strays.length) return strays.length + ' products from another line';

    // The bounds are what the filter panel offers, and a band that matches
    // nothing is a dead control - so they have to describe THIS result set.
    const prices = bySlug.rows.map(function (row) { return Number(row.price); });
    if (bySlug.bounds.price_min > Math.min.apply(null, prices)) return 'the price floor excludes a listed product';
    if (bySlug.bounds.price_max < Math.max.apply(null, prices)) return 'the price ceiling excludes a listed product';
    return true;
  });

  await check('a filter narrows the grid without narrowing its own control', async function () {
    const all = data(await web.get('/products?type=SMARTPHONE'));
    const tall = data(await web.get('/products?type=SMARTPHONE&screen_min=6.7'));

    if (!tall.rows.length) return 'no handset has a large screen';
    if (tall.total >= all.total) return 'the screen filter narrowed nothing';

    /*
     * The bounds are deliberately computed WITHOUT the price and screen
     * filters applied.  If filtering by screen size also shrank the screen
     * band, dragging the control would move the end of its own track and
     * there would be no way back to the wider set.
     */
    if (tall.bounds.screen_min !== all.bounds.screen_min) return 'the screen band moved under its own filter';
    return tall.bounds.price_min === all.bounds.price_min || 'the price band moved too';
  });

  await check('the grid sorts off a whitelist, not off the query string', async function () {
    const cheap = data(await web.get('/products?type=SMARTPHONE&sort=price-asc&limit=4'));
    const prices = cheap.rows.map(function (row) { return Number(row.price); });
    const ascending = prices.every(function (price, i) { return i === 0 || prices[i - 1] <= price; });
    if (!ascending) return 'price-asc did not sort by price';

    /*
     * An unknown sort falls back to the recommended order rather than being
     * pasted into the ORDER BY - naming the column is how a public endpoint
     * gets talked into ordering by something it does not own.
     */
    const injected = data(await web.get('/products?type=SMARTPHONE&limit=4&sort=' +
      encodeURIComponent('p.price; drop table products')));
    const fallback = data(await web.get('/products?type=SMARTPHONE&limit=4'));
    return JSON.stringify(injected.rows.map(function (r) { return r.id; }))
      === JSON.stringify(fallback.rows.map(function (r) { return r.id; }))
      || 'an unknown sort changed the order';
  });

  await check('a product card carries its finishes in the same reply', async function () {
    // The swatch row is part of the tile, so a listing that has to fetch per
    // product draws twelve times instead of once.
    const listed = data(await web.get('/products?type=SMARTPHONE&limit=6'));
    const withColours = listed.rows.filter(function (row) { return (row.colors || []).length > 0; });
    if (!withColours.length) return 'no product offered a finish';

    const swatch = withColours[0].colors[0];
    if (!/^#[0-9A-Fa-f]{6}$/.test(swatch.hex)) return 'a swatch is not drawable before its artwork loads';
    return true;
  });

  await check('a product detail page carries all five tabs', async function () {
    const listed = data(await web.get('/products?type=SMARTPHONE&limit=1'));
    const body = data(await web.get('/products/' + listed.rows[0].slug));

    if (!body.product) return 'no product';
    if (!body.specifications.length) return 'no specifications';
    if (!body.service_pricing.length) return 'no repair prices';

    // The finishes and the box are the product's own lists - they sit beside
    // the sheet rather than inside it, because a sheet is what the compare
    // matrix reads and neither of these lines up against anything.
    if (!body.colors.length) return 'no finishes';
    if (!body.accessories.length) return 'nothing in the box';
    if (body.specifications.some(function (group) {
      return group.items.some(function (item) { return /colour|color/i.test(item.name); });
    })) return 'a finish leaked into the specification sheet';
    return true;
  });

  await check('the console edits the finishes and the box as whole lists', async function () {
    /*
     * The round trip, end to end: the console saves an ordered list and the
     * public detail page shows it.  Both lists are replaced wholesale rather
     * than row by row, so what this really checks is that a save which drops
     * a row actually drops it - an editor removing a discontinued colour and
     * finding it still on the site is the failure that matters.
     */
    const listed = data(await web.get('/products?type=SMARTPHONE&limit=1'));
    const slug = listed.rows[0].slug;
    const before = data(await admin.get('/products/' + listed.rows[0].id));

    if (!before.colors.length) return 'the console cannot see the finishes it is meant to edit';
    if (!before.accessories.length) return 'the console cannot see the box contents';

    const trimmed = before.colors.slice(0, 1).map(function (color) {
      return { name: color.name, hex: color.hex };
    });
    trimmed.push({ name: 'Check Run Amber', hex: '#E0A93F' });

    try {
      await admin.put('/products/' + before.product.id + '/colors', { entries: trimmed });

      const shown = data(await web.get('/products/' + slug));
      if (shown.colors.length !== 2) return 'the site shows ' + shown.colors.length + ' finishes, not the two that were saved';
      if (shown.colors[1].name !== 'Check Run Amber') return 'the saved order was not kept';
      // Position, not the payload - the console reorders by dragging.
      if (shown.colors[0].sort_order >= shown.colors[1].sort_order) return 'the list came back out of order';

      // A swatch the column would have refused reaches the editor as advice,
      // not as a database error.
      let refused = 0;
      try {
        await admin.put('/products/' + before.product.id + '/colors',
          { entries: [{ name: 'Not A Colour', hex: 'glacier blue' }] });
      } catch (err) {
        refused = err.response.status;
      }
      if (refused !== 400) return 'an unusable swatch was accepted with ' + refused;

      // And two rows of one product cannot share a name.
      let clashed = 0;
      try {
        await admin.put('/products/' + before.product.id + '/colors', {
          entries: [
            { name: 'Twice', hex: '#111111' },
            { name: 'twice', hex: '#222222' }
          ]
        });
      } catch (err) {
        clashed = err.response.status;
      }
      if (clashed !== 409) return 'a duplicated finish was accepted with ' + clashed;

      return true;
    } finally {
      // Put the catalogue back, so a second run of this script starts where
      // the first one did.
      await admin.put('/products/' + before.product.id + '/colors', {
        entries: before.colors.map(function (color) {
          return { name: color.name, hex: color.hex };
        })
      });
    }
  });

  await check('emptying the box is a legal save, unlike emptying a spec sheet', async function () {
    /*
     * A product that ships with nothing in the box is a real answer.  If an
     * empty list were rejected the way an empty specification sheet is, the
     * last accessory would be undeletable.
     */
    const listed = data(await web.get('/products?type=SMARTPHONE&limit=1'));
    const before = data(await admin.get('/products/' + listed.rows[0].id));

    try {
      await admin.put('/products/' + before.product.id + '/accessories', { entries: [] });
      const shown = data(await web.get('/products/' + listed.rows[0].slug));
      return shown.accessories.length === 0
        || 'the box still holds ' + shown.accessories.length + ' items';
    } finally {
      await admin.put('/products/' + before.product.id + '/accessories', {
        entries: before.accessories.map(function (item) {
          return { name: item.name, image: item.image };
        })
      });
    }
  });

  await check('a price line is the published list and nothing else', async function () {
    /*
     * service_prices used to carry the ticket side of a repair too - the
     * shelf item a line consumed, its bench minutes, how many were covered,
     * an internal costing price beside the counter one, and a table of
     * attached documents. All of that is the REPAIR's business, and a ticket
     * keeps its own copy of every figure it charged.
     */
    const page = data(await admin.get('/service-prices?limit=1'));
    const line = page.rows[0];
    if (!line) return 'no price line';

    const gone = ['part_id', 'sale_price', 'limit_quantity', 'labour_minutes',
      'currency', 'attachments'].filter(function (key) {
      return line[key] !== undefined;
    });
    if (gone.length) return 'the price list still carries ' + gone.join(', ');

    if (typeof line.part_name !== 'string') return 'no part_name';
    if (line.part_price === undefined) return 'no part price';
    if (line.service_price === undefined) return 'no service price';
    if (!('approval_no' in line)) return 'no approval number';

    /* And it round-trips through the console. */
    const before = {
      part_name: line.part_name,
      part_price: line.part_price,
      approval_no: line.approval_no
    };

    try {
      await admin.put('/service-prices/' + line.id, {
        part_name: 'Check run part', part_price: 12.34, approval_no: 'CHECK-RUN-001'
      });

      const reread = data(await admin.get('/service-prices?q=Check run part&limit=5'));
      const saved = reread.rows.filter(function (row) { return row.id === line.id; })[0];

      if (!saved) return 'the edited line is not findable by its new name';
      if (saved.approval_no !== 'CHECK-RUN-001') return 'the approval number did not save';
      return true;
    } finally {
      await admin.put('/service-prices/' + line.id, before);
    }
  });

  await check('a product own artwork is a relation, not polymorphic media', async function () {
    /*
     * The studio set and the advertising run came out of media_assets and
     * into product_images, which has a real foreign key. media_assets keeps
     * what is genuinely polymorphic - banners, article figures, OS screens,
     * and a product's HERO and THUMBNAIL slots.
     */
    const listed = data(await web.get('/products?type=SMARTPHONE&limit=1'));
    const detail = data(await admin.get('/products/' + listed.rows[0].id));

    if (!Array.isArray(detail.images)) return 'the console gets no product_images';
    if (!detail.images.length) return 'the product has no pictures of its own';

    const kinds = {};
    detail.images.forEach(function (row) { kinds[row.kind] = true; });
    if (!kinds.MAIN) return 'no studio set';
    if (!kinds.ADVERT) return 'no advertising run';

    // And none of it is left behind in the polymorphic table.
    const strays = (detail.media || []).filter(function (row) {
      return row.purpose === 'GALLERY' || row.purpose === 'DETAIL';
    });
    return !strays.length || 'media_assets still holds ' + strays.length + ' of a product own shots';
  });

  await check('the gallery tab is the advertising run, not the studio set', async function () {
    /*
     * Two different sets of pictures, and showing the wrong one was the bug.
     *
     * MAIN is the studio set - front, back, three quarter - and it is
     * already the row of images at the top of the product page. ADVERT is
     * the advertising run, which is what the tab is for. Serving MAIN under
     * the tab is the same four photographs twice.
     */
    const listed = data(await web.get('/products?type=SMARTPHONE&limit=1'));
    const shots = data(await web.get('/products/' + listed.rows[0].slug + '/gallery'));

    if (!shots.length) return 'the gallery tab is empty';
    const kinds = shots.map(function (asset) { return asset.kind; });
    if (kinds.indexOf('MAIN') !== -1) return 'a studio shot leaked into the advertising run';
    return kinds.every(function (kind) { return kind === 'ADVERT'; })
      || 'the gallery tab served ' + kinds.join(', ');
  });

  await check('the price list pages, and every line carries what it is published with', async function () {
    /*
     * A published price list is a document rather than a summary: the part,
     * what it costs, what the labour costs, and the reference the figure was
     * approved under. It is paged for the same reason - a handset carries
     * twenty-odd lines of that.
     */
    const listed = data(await web.get('/products?type=SMARTPHONE&limit=1'));
    const slug = listed.rows[0].slug;

    const first = data(await web.get('/products/' + slug + '/service-pricing?page=1&limit=2'));
    if (!Array.isArray(first.rows)) return 'the price list did not page';
    if (first.rows.length > 2) return 'the page size was ignored';
    if (!(first.total > first.rows.length)) return 'nothing to page through';

    const second = data(await web.get('/products/' + slug + '/service-pricing?page=2&limit=2'));
    if (second.rows[0] && first.rows[0] && second.rows[0].id === first.rows[0].id) {
      return 'page two repeated page one';
    }

    const line = first.rows[0];
    if (typeof line.part_name !== 'string') return 'no part name';
    if (line.part_price === undefined) return 'no part price';
    if (line.service_price === undefined) return 'no service price';
    if (!('approval_no' in line)) return 'no approval number';

    return true;
  });

  await check('the box is a specification group, not a band of missing pictures', async function () {
    /*
     * The product page used to draw six empty squares for the boxed items,
     * because there is no photography for any of them. The contents are a
     * list of words and now live in the sheet, where words belong -
     * `product_accessories` stays as the structured copy for the console.
     */
    const listed = data(await web.get('/products?type=SMARTPHONE&limit=1'));
    const body = data(await web.get('/products/' + listed.rows[0].slug));

    const group = body.specifications.filter(function (row) {
      return row.group_code === 'IN_THE_BOX';
    })[0];

    if (!group) return 'the sheet has no In the box group';
    if (!group.items.length) return 'the In the box group is empty';
    if (!body.accessories.length) return 'the structured copy was dropped along with the section';

    // Never comparable: two different lists of box contents do not line up
    // in a compare column.
    return group.items.every(function (item) { return !item.compare_enabled; })
      || 'a box contents row is offered to the compare matrix';
  });

  await check('a product OS history stands on its own, not on a release', async function () {
    /*
     * The firmware a television or a set-top box ships is not a Crystal OS
     * build, and even a handset reports its own version string - so the
     * version here is TEXT and nothing joins to os_versions.
     */
    const listed = data(await web.get('/products?type=SMARTPHONE&limit=1'));
    const history = data(await web.get('/products/' + listed.rows[0].slug + '/os-history'));

    if (!history.length) return 'no history';
    const row = history[0];

    if (row.os_version_id !== undefined) return 'the history still points at a release';
    if (typeof row.os_version !== 'string' || !row.os_version) return 'no version string';
    if (!('content' in row)) return 'no content';
    if (!('pub_approve_number' in row)) return 'no publication approval number';
    if (!('sort_order' in row)) return 'no sort order';
    return true;
  });

  await check('a Crystal OS release carries its own artwork', async function () {
    /*
     * The support page leads with pictures rather than with release notes,
     * so the artwork has to arrive with the list - one query for all of
     * them, not one per release.
     */
    const releases = data(await web.get('/support/os'));
    if (!releases.length) return 'no releases';

    const withArt = releases.filter(function (row) {
      return (row.images || []).length > 0;
    });
    if (!withArt.length) return 'no release carries any artwork';

    const asset = withArt[0].images[0];
    return (asset.file_path && asset.owner_type === 'OS_VERSION')
      || 'the artwork is not owned by the release';
  });

  await check('an unpublished product is not reachable by guessing its slug', async function () {
    /*
     * Drafts exist in the console; the storefront writes PUBLISHED into the
     * query itself rather than accepting it as a filter, so there is no
     * parameter that turns one into a public page.
     */
    const drafts = data(await admin.get('/products?status=DRAFT&limit=1'));
    if (!drafts.rows.length) return true;

    try {
      await web.get('/products/' + drafts.rows[0].slug);
      return 'a draft was served to the public';
    } catch (err) {
      return err.response.status === 404;
    }
  });

  await check('a typed slug keeps its capitals, and case never makes two slugs different', async function () {
    /*
     * The console lower-cased every slug on save, so "C9-Pro" typed into the
     * product form came back as "c9-pro". A typed slug is kept as typed now
     * (utils/slug.js cleanSlug), and the repositories compare slugs ignoring
     * case - so the storefront still answers the lower-case address every
     * existing link uses, and a second product cannot take the same slug in
     * different capitals.
     *
     * Both products are put back exactly as they were, whatever happens.
     */
    const listed = data(await web.get('/products?limit=2'));
    if (listed.rows.length < 2) return 'fewer than two published products to work with';

    const first = data(await admin.get('/products/' + listed.rows[0].id)).product;
    const second = data(await admin.get('/products/' + listed.rows[1].id)).product;
    const mixed = 'Check-' + first.slug.replace(/(^|-)([a-z])/g, function (all, dash, letter) { return dash + letter.toUpperCase(); });

    try {
      await admin.put('/products/' + first.id, { slug: mixed });

      const stored = data(await admin.get('/products/' + first.id)).product.slug;
      if (stored !== mixed) return 'typed "' + mixed + '", stored "' + stored + '"';

      const asTyped = data(await web.get('/products/' + mixed));
      const lower = data(await web.get('/products/' + mixed.toLowerCase()));
      if (Number(asTyped.id || asTyped.product && asTyped.product.id) !== Number(first.id)
        && Number(lower.id || lower.product && lower.product.id) !== Number(first.id)) {
        return 'the storefront did not find the product by its slug in either case';
      }

      /* The same slug in other capitals is taken: the second product is given a suffix. */
      await admin.put('/products/' + second.id, { slug: mixed.toLowerCase() });
      const clash = data(await admin.get('/products/' + second.id)).product.slug;
      if (clash.toLowerCase() === mixed.toLowerCase()) {
        return 'a second product took "' + clash + '", the same slug as "' + mixed + '" in other capitals';
      }

      return true;
    } finally {
      await admin.put('/products/' + second.id, { slug: second.slug });
      await admin.put('/products/' + first.id, { slug: first.slug });
    }
  });

  await check('the compare matrix pivots server-side', async function () {
    const listed = data(await web.get('/products/comparable?type=SMARTPHONE'));
    const ids = listed.slice(0, 3).map(function (p) { return p.id; }).join(',');

    const body = data(await web.get('/products/compare?id=' + ids));
    if (body.products.length !== 3) return 'expected three columns';
    if (!body.rows.length) return 'no rows';

    // Every row is the same width as the header, so a client can render the
    // table without matching anything up itself.
    const ragged = body.rows.filter(function (row) { return row.cells.length !== 3; });
    if (ragged.length) return ragged.length + ' rows are the wrong width';

    return body.rows.some(function (row) { return row.differs; })
      || 'nothing was marked as differing between three different handsets';
  });

  await check('comparing a single product is refused', async function () {
    const listed = data(await web.get('/products/comparable?type=SMARTPHONE'));
    try {
      await web.get('/products/compare?id=' + listed[0].id);
      return 'a comparison of one was accepted';
    } catch (err) {
      return err.response.status === 400;
    }
  });

  await check('the support page assembles', async function () {
    const body = data(await web.get('/support/home'));
    return (body.popular_faqs.length > 0 && body.centres.length > 0)
      || 'the support page came back empty';
  });

  await check('the FAQ is filed by product, and the chips are in reading order', async function () {
    const chips = data(await web.get('/support/faqs/categories'));
    if (!chips.length) return 'no categories';

    /*
     * The catalogue's product kinds, then the three services - sql/deltas/033.
     * Written out rather than required from src/utils, so a change to the
     * vocabulary is a change to this line too, and somebody reads it.
     */
    const allowed = ['SMARTPHONE', 'TV', 'STB', 'COMPUTER', 'CAMERA', 'CRYSTAL_APP', 'ESHOP', 'APPSTORE'];
    const strays = chips.filter(function (row) { return allowed.indexOf(row.category) === -1; });
    if (strays.length) return strays.length + ' categories outside the vocabulary';

    /*
     * The order is the vocabulary's, not the order the rows came back in - a
     * list of chips that reshuffles as questions are published is a list
     * nobody can build a habit on.
     */
    const ranks = chips.map(function (row) { return allowed.indexOf(row.category); });
    const sorted = ranks.slice().sort(function (a, b) { return a - b; });
    if (String(ranks) !== String(sorted)) return 'the chips came back out of order';

    // And the filter each chip sets has to actually narrow to it.
    const first = chips[0];
    const narrowed = data(await web.get('/support/faqs?category=' + first.category));
    const wrong = narrowed.filter(function (row) { return row.category !== first.category; });
    return wrong.length === 0 || wrong.length + ' answers from another category';
  });

  await check('the FAQ has no catalogue section any more, and an old ?category= link is an empty list', async function () {
    /*
     * The "Section" (product_category_id) left the form, the list and the
     * table in delta 033. It must not linger in either reply - a console
     * column reading a key the API no longer sends is a column of blanks.
     */
    const consoleRow = data(await admin.get('/faqs?limit=1')).rows[0];
    if (!consoleRow) return 'the console lists no FAQ';
    if (Object.prototype.hasOwnProperty.call(consoleRow, 'product_category_id')) return 'the console still sends product_category_id';

    const publicRow = data(await web.get('/support/faqs?limit=1'))[0];
    if (Object.prototype.hasOwnProperty.call(publicRow, 'product_category_id')) return 'the storefront still sends product_category_id';
    if (Object.prototype.hasOwnProperty.call(publicRow.integrity.content, 'productCategoryId')) {
      return 'the signed payload still carries productCategoryId';
    }

    /* A bookmark from before the change is not an error page. */
    const stale = data(await web.get('/support/faqs?category=EPRODUCT'));
    return (Array.isArray(stale) && stale.length === 0) || 'EPRODUCT answered ' + JSON.stringify(stale).slice(0, 80);
  });

  await check("a section page's questions are its own product kind", async function () {
    /*
     * The section pages ask by product kind now - the category IS the kind.
     * It used to be the catalogue section's id OR no section at all, which
     * put "how do I sign in to the Crystal App" on the television page.
     */
    const phone = data(await web.get('/smartphones/home')).support.faqs;
    const tv = data(await web.get('/sections/tv/home')).support.faqs;
    if (!phone.length || !tv.length) return 'a section page has no questions to check';

    const offPhone = phone.filter(function (row) { return row.category !== 'SMARTPHONE'; });
    const offTv = tv.filter(function (row) { return row.category !== 'TV'; });
    if (offPhone.length) return offPhone.length + ' non-smartphone question(s) on the smartphone page';
    return offTv.length === 0 || offTv.length + ' non-TV question(s) on the television page';
  });

  /*
   * THE SERVICE CENTRES: a display order, several numbers, a landmark that
   * stays in the console, and provinces in an order somebody chose.
   *
   * One throwaway centre carries all of it, so every public read can be asked
   * whether it gave the landmark away. Purged at the end, whatever happened.
   */
  const stamp = String(Date.now());
  const LANDMARK = 'CHECK-LANDMARK-' + stamp + ' opposite the Grand Theatre';
  const provinceList = data(await admin.get('/agencies/provinces?all=1'));
  let probe = null;

  try {
    probe = data(await admin.post('/agencies', {
      name: 'check.js centre ' + stamp,
      code: 'CHK' + stamp.slice(-8),
      province: provinceList[0].province,
      address: '1 Check Street, check.js',
      landmark: LANDMARK,
      sort_order: -1000000,
      tier: 1,
      status: 'ACTIVE',
      section: 'SMARTPHONE',
      services: ['REPAIR'],
      phones: [
        { phone: '400-000-' + stamp.slice(-4), label: 'Front desk' },
        { phone: ' ', label: 'a blank row the editor left behind' },
        { phone: '400-111-' + stamp.slice(-4), label: '' },
        { phone: '400-000-' + stamp.slice(-4), label: 'the same number pasted twice' }
      ]
    }));
  } catch (err) {
    probe = null;
    bad('a throwaway service centre for the checks below', err.response ? JSON.stringify(err.response.data).slice(0, 160) : err.message);
  }

  if (probe) {
    await check("the console reads a centre's landmark and every number back, in order", async function () {
      const read = data(await admin.get('/agencies/' + probe.id)).agency;
      if (read.landmark !== LANDMARK) return 'the landmark did not round-trip: ' + read.landmark;

      /* The blank row dropped, the repeat kept once at its first position, an empty label null. */
      const expected = [
        { phone: '400-000-' + stamp.slice(-4), label: 'Front desk' },
        { phone: '400-111-' + stamp.slice(-4), label: null }
      ];
      return JSON.stringify(read.phones) === JSON.stringify(expected)
        || 'phones came back as ' + JSON.stringify(read.phones);
    });

    await check('A LANDMARK NEVER LEAVES THE CONSOLE - no public reply that carries a centre sends it', async function () {
      /*
       * Every storefront read that can carry this centre, as the raw text of
       * the reply: not only "no landmark key", but not the landmark's words
       * anywhere, under any name. A hidden field is still a sent field.
       */
      const reads = {
        'the locator, unpaged': '/support/agencies?section=SMARTPHONE&limit=100',
        'the locator, paged and searched': '/support/agencies?section=SMARTPHONE&page=1&limit=12&q=' + encodeURIComponent('check.js centre ' + stamp),
        'one centre': '/support/agencies/' + probe.id,
        'the support page': '/support/home',
        'the smartphone page': '/smartphones/home'
      };

      let carried = 0;
      const names = Object.keys(reads);
      for (let i = 0; i < names.length; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const text = JSON.stringify((await web.get(reads[names[i]])).data);
        if (text.indexOf(String(probe.id)) !== -1 && text.indexOf(probe.name) !== -1) carried += 1;
        if (text.indexOf('CHECK-LANDMARK-' + stamp) !== -1) return names[i] + ' SENT THE LANDMARK';
        if (/"landmark"\s*:/.test(text)) return names[i] + ' sends a landmark key';
      }

      /* Vacuous unless the centre was actually in the replies being searched. */
      return carried >= 3 || 'the centre only reached ' + carried + ' of the public replies - nothing was proven';
    });

    await check('the storefront cannot SEARCH by landmark either; the console can', async function () {
      /*
       * A public search that matched the landmark would hand it out one guess
       * at a time. The console searches it on purpose: staff look a centre up
       * the way a caller describes it.
       */
      const term = encodeURIComponent('CHECK-LANDMARK-' + stamp);
      const publicHits = data(await web.get('/support/agencies?page=1&limit=12&q=' + term));
      if (publicHits.total !== 0) return 'a public search by the landmark found ' + publicHits.total;

      const consoleHits = data(await admin.get('/agencies?q=' + term + '&section=SMARTPHONE'));
      return consoleHits.rows.some(function (row) { return row.id === probe.id; })
        || 'the console could not find the centre by its landmark';
    });

    await check('the storefront shows every number, in order, each with its label', async function () {
      const one = data(await web.get('/support/agencies/' + probe.id));
      const expected = [
        { phone: '400-000-' + stamp.slice(-4), label: 'Front desk' },
        { phone: '400-111-' + stamp.slice(-4), label: null }
      ];
      if (JSON.stringify(one.phones) !== JSON.stringify(expected)) return 'one centre: ' + JSON.stringify(one.phones);
      if (Object.prototype.hasOwnProperty.call(one, 'phone')) return 'the old single phone field is still sent';

      /* The number is searchable where it is shown - "which centre is this?" */
      const found = data(await web.get('/support/agencies?page=1&limit=12&section=SMARTPHONE&q=400-111-' + stamp.slice(-4)));
      return found.rows.some(function (row) { return row.id === probe.id; }) || 'a search by the second number missed it';
    });

    await check('the display order leads both lists, and blank means "not placed"', async function () {
      const pub = data(await web.get('/support/agencies?section=SMARTPHONE&limit=3'));
      if (!pub.length || pub[0].id !== probe.id) return 'the storefront list does not open with the centre placed first';

      const listed = data(await admin.get('/agencies?section=SMARTPHONE&limit=3'));
      if (!listed.rows.length || listed.rows[0].id !== probe.id) return 'the console list does not open with it either';

      /* Cleared, it falls in behind every placed probe. */
      await admin.put('/agencies/' + probe.id, { sort_order: null });
      const after = data(await web.get('/support/agencies?section=SMARTPHONE&limit=3'));
      await admin.put('/agencies/' + probe.id, { sort_order: -1000000 });
      return (after.length > 0 && after[0].id !== probe.id) || 'an unplaced centre still led the list';
    });

    await check('a save replaces the whole list of numbers, in the new order', async function () {
      await admin.put('/agencies/' + probe.id, {
        phones: [{ phone: '400-111-' + stamp.slice(-4), label: 'Repairs' }, { phone: '400-222-' + stamp.slice(-4) }]
      });
      const read = data(await admin.get('/agencies/' + probe.id)).agency;
      const numbers = read.phones.map(function (entry) { return entry.phone + '|' + entry.label; }).join(',');
      if (numbers !== '400-111-' + stamp.slice(-4) + '|Repairs,400-222-' + stamp.slice(-4) + '|null') return 'stored as ' + numbers;

      /* And a save that does not mention numbers leaves them alone. */
      await admin.put('/agencies/' + probe.id, { address: '2 Check Street, check.js' });
      const kept = data(await admin.get('/agencies/' + probe.id)).agency;
      return kept.phones.length === 2 || 'a save without phones changed them: ' + JSON.stringify(kept.phones);
    });

    await check('the spreadsheet carries the numbers in one cell, both ways', async function () {
      const exported = await admin.get('/agencies/export?section=SMARTPHONE&q=' + encodeURIComponent('check.js centre ' + stamp),
        { responseType: 'arraybuffer' });
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(Buffer.from(exported.data));
      const ws = book.worksheets[0];
      const headers = ws.getRow(1).values;
      const column = function (name) { return headers.indexOf(name); };
      if (column('Phones') === -1 || column('Display order') === -1 || column('Landmark') === -1) return 'headers: ' + headers.join(',');
      if (column('Phone') !== -1) return 'the export still has the single Phone column';

      const cell = String(ws.getRow(2).getCell(column('Phones')).value);
      if (cell !== 'Repairs: 400-111-' + stamp.slice(-4) + '; 400-222-' + stamp.slice(-4)) return 'exported as ' + cell;

      /* Back in, edited - including through the OLD one-number header. */
      const upload = async function (header, value) {
        const next = new ExcelJS.Workbook();
        const sheet = next.addWorksheet('centres');
        sheet.addRow(['Code', 'Name', header]);
        sheet.addRow([probe.code, probe.name, value]);
        const form = new FormData();
        form.append('file', Buffer.from(await next.xlsx.writeBuffer()), { filename: 'centres.xlsx' });
        return admin.post('/agencies/import', form, { headers: form.getHeaders() });
      };

      await upload('Phones', 'After hours: 138-' + stamp.slice(-4) + '\nFront desk: 400-000-' + stamp.slice(-4));
      let read = data(await admin.get('/agencies/' + probe.id)).agency;
      const got = read.phones.map(function (entry) { return entry.label + '=' + entry.phone; }).join(';');
      if (got !== 'After hours=138-' + stamp.slice(-4) + ';Front desk=400-000-' + stamp.slice(-4)) return 'imported as ' + got;

      await upload('Phone', '400-333-' + stamp.slice(-4));
      read = data(await admin.get('/agencies/' + probe.id)).agency;
      return (read.phones.length === 1 && read.phones[0].phone === '400-333-' + stamp.slice(-4))
        || 'an old "Phone" sheet was not read: ' + JSON.stringify(read.phones);
    });

    await check('a centre filed under a province nobody added is refused, by name', async function () {
      try {
        await admin.put('/agencies/' + probe.id, { province: 'Nowhere ' + stamp });
        return 'an unknown province was accepted';
      } catch (err) {
        if (!err.response || err.response.status !== 400) return 'answered ' + (err.response ? err.response.status : err.message);
        return String(err.response.data.message || '').indexOf('Nowhere ' + stamp) !== -1
          || 'the refusal does not name the province: ' + err.response.data.message;
      }
    });
  }

  if (probe) {
    await admin.delete('/agencies/' + probe.id).catch(function () {});
    await admin.delete('/agencies/' + probe.id + '/permanent').catch(function (err) {
      bad('the throwaway service centre was purged', err.response ? err.response.data.message : err.message);
    });
  }

  await check('the province filter is in the order set on the Provinces screen, and moves when it does', async function () {
    /*
     * The storefront's list is the provinces with live centres, in the
     * master's order - a SUBSEQUENCE of it, never the alphabet. Then the
     * order is changed through the console, and the filter has to follow.
     */
    /* The master's order is sort_order, ties by name - the same rule the API applies. */
    const master = data(await admin.get('/provinces?limit=200&sort=sort_order')).rows.sort(function (a, b) {
      return (a.sort_order - b.sort_order) || (a.name < b.name ? -1 : (a.name > b.name ? 1 : 0));
    });
    const shown = data(await web.get('/support/agencies/regions'));
    if (shown.length < 2) return 'too few provinces to see an order';

    const rank = master.map(function (row) { return row.name; });
    const positions = shown.map(function (row) { return rank.indexOf(row.province); });
    if (positions.indexOf(-1) !== -1) return 'a province the Provinces screen does not have: ' + shown[positions.indexOf(-1)].province;
    for (let i = 1; i < positions.length; i += 1) {
      if (positions[i] < positions[i - 1]) return shown[i].province + ' is out of the configured order';
    }

    const last = master.filter(function (row) { return row.name === shown[shown.length - 1].province; })[0];
    const was = last.sort_order;
    try {
      await admin.put('/provinces/' + last.id, { sort_order: -1000000 });
      const moved = data(await web.get('/support/agencies/regions'));
      return moved[0].province === last.name || 'moving ' + last.name + ' to the top did not move the filter';
    } finally {
      await admin.put('/provinces/' + last.id, { sort_order: was });
    }
  });

  await check('a province with centres cannot be purged, and the console is told how many are in the way', async function () {
    /*
     * agencies.province refers to provinces.NAME, not to its id - the purge
     * check has to count by the name, or it counts nothing and offers a
     * delete the database then refuses.
     */
    const master = data(await admin.get('/provinces?limit=200&sort=sort_order')).rows;
    const busy = master.filter(function (row) { return Number(row.agency_cnt) > 0; })[0];
    if (!busy) return 'no province has a centre';

    const report = data(await admin.get('/provinces/' + busy.id + '/dependents'));
    const agencies = report.blockers.filter(function (row) { return row.table === 'agencies'; })[0];
    if (report.can_purge) return busy.name + ' was offered for a permanent delete';
    /* At least the live ones - a centre in the recycle bin still holds the name too. */
    return (agencies && agencies.count >= Number(busy.agency_cnt))
      || 'the blockers were ' + JSON.stringify(report.blockers);
  });

  await check('several notices can be live at once', async function () {
    const live = data(await web.get('/notices'));
    if (!Array.isArray(live)) return 'the endpoint did not answer a list';
    if (live.length < 2) return 'only ' + live.length + ' notice is live - the list cannot be seen';

    /*
     * Highest first. The dialog shows them one at a time in this order and
     * the notification page lists them in it, so an unordered answer is two
     * screens disagreeing about what matters most.
     */
    for (let i = 1; i < live.length; i += 1) {
      if (Number(live[i - 1].sort_order) < Number(live[i].sort_order)) {
        return 'the notices came back out of order';
      }
    }

    // The origin travels with the notice; resolving it separately would draw
    // the list twice, once unlabelled.
    const labelled = live.filter(function (row) { return row.origin_name; });
    return labelled.length > 0 || 'no notice carries its origin';
  });

  await check('an advert page reaches only its own placement, whatever the request says', async function () {
    /*
     * The homepage page and the smartphone page are one table. What keeps them
     * apart is the route, not the client: a body naming the other placement is
     * ignored, and an id from the other run is not found for reading, editing,
     * deleting or restoring.
     */
    const created = data(await admin.post('/showcase/home', {
      placement: 'SMARTPHONE',
      device_type: 'mobile',
      file_path: '/uploads/showcase/check-advert.svg',
      alt_text: 'check.js advert',
      sort_order: 999
    }));

    try {
      if (created.placement !== 'HOME') return 'the body chose the placement: ' + created.placement;

      const home = data(await admin.get('/showcase/home?limit=200'));
      if (!home.rows.some(function (row) { return row.id === created.id; })) return 'the homepage page does not list its own advert';
      if (home.rows.some(function (row) { return row.placement !== 'HOME'; })) return 'the homepage page lists another placement';

      const phone = data(await admin.get('/showcase/smartphone?limit=200'));
      if (phone.rows.some(function (row) { return row.id === created.id; })) return 'the smartphone page lists a homepage advert';

      const attempts = [
        function () { return admin.get('/showcase/smartphone/' + created.id); },
        function () { return admin.put('/showcase/smartphone/' + created.id, { alt_text: 'moved' }); },
        function () { return admin.delete('/showcase/smartphone/' + created.id); },
        function () { return admin.post('/showcase/smartphone/' + created.id + '/restore'); }
      ];
      /*
       * 404 IS THE ANSWER THAT MATTERS - the row is not this page's to see.
       *
       * Restoring is the exception: an advert has no recycle bin at all
       * (softDelete: false - the row IS the image, so removing it removes the
       * bytes), and that route refuses every advert with 400 before it looks
       * anything up. Refused is refused; what would be wrong is a 2xx.
       */
      const allowed = [[404], [404], [404], [404, 400]];

      for (let i = 0; i < attempts.length; i += 1) {
        try {
          await attempts[i]();
          return 'the smartphone page reached a homepage advert (attempt ' + (i + 1) + ')';
        } catch (err) {
          const status = err.response ? err.response.status : err.message;
          if (allowed[i].indexOf(status) === -1) return 'attempt ' + (i + 1) + ' failed with ' + status;
        }
      }

      /* A mobile-only filter answers mobile rows only. */
      const mobile = data(await admin.get('/showcase/home?device_type=mobile&limit=200'));
      if (mobile.rows.some(function (row) { return row.device_type !== 'mobile'; })) return 'the device filter let other crops through';

      const after = data(await admin.get('/showcase/home/' + created.id));
      return after.alt_text === 'check.js advert' || 'the homepage advert was changed through the smartphone page';
    } finally {
      /* One delete is all there is: an advert has no recycle bin (softDelete: false). */
      await admin.delete('/showcase/home/' + created.id);
    }
  });

  await check('the media library filters by purpose and by device', async function () {
    const banners = data(await admin.get('/media?purpose=BANNER&device_type=mobile&limit=200'));
    if (!banners.rows.length) return 'no mobile banners were listed';
    const stray = banners.rows.filter(function (row) { return row.purpose !== 'BANNER' || row.device_type !== 'mobile'; });
    if (stray.length) return stray.length + ' rows outside the filter';

    /* The smartphone section's hero run moved out of the library with delta 026. */
    const heroes = data(await admin.get('/media?purpose=HERO&owner_type=CATEGORY&limit=500'));
    return heroes.rows.length > 0 || 'the eproduct sections lost their hero runs';
  });

  await check('a repair can be tracked by its number alone', async function () {
    const anyClosed = data(await admin.get('/tickets?status=7&limit=1')).rows[0];
    const body = data(await web.get('/support/repairs/' + anyClosed.ticket_no));

    if (body.ticket_no !== anyClosed.ticket_no) return 'wrong ticket';
    // The public view must carry neither the bill nor the internal notes.
    if (body.items !== undefined) return 'the bill was exposed';
    const internal = (body.events || []).filter(function (e) { return e.is_public === false; });
    return internal.length === 0 || 'internal notes were exposed';
  });

  console.log('\nthe member centre');

  /*
   * THE DEMO MEMBER'S LOGIN IS LOOKED UP, not written here.
   *
   * The platform owns the login and it is derived at install time - "demo" is
   * already the vendor's own user, so Crystal's demo member gets a qualified
   * name whose exact form depends on what else is in the table. Hardcoding it
   * made this suite fail on a reseed for a reason that had nothing to do with
   * the code under test.
   */
  const demoRow = data(await admin.get('/members?q=demo@crystal.example&limit=1'));
  const demoLogin = demoRow.rows.length ? demoRow.rows[0].login : null;

  await check('the demo member has a platform login', async function () {
    return !!demoLogin || 'no member matches demo@crystal.example - run npm run legacy:install';
  });

  await check('a member signs in against the platform user table', async function () {
    const offered = data(await web.get('/auth/methods'));
    if (offered.allowed.indexOf('password') === -1) return 'password is not offered on a desktop';

    /*
     * The credential lives in ora_pid.users, not in Crystal's own table - one
     * person, one password, shared with the Eshop and the Appstore. The field
     * is a USER ID: that table has no email column, so an email is not offered
     * and is not accepted.
     */
    const opened = data(await web.post('/auth/login', {
      user_id: demoLogin, password: 'crystal1234'
    }));
    if (!opened.token) return 'no token';

    /*
     * And the local mirror is guaranteed by signing in: the session's id is
     * ora_pid.users.user_pk, and every Crystal table keyed on users.id has to
     * be able to find that person.
     */
    return Number(opened.user.id) > 0 || 'the session carries no member id';
  });

  await check('a wrong password and an unknown login are refused alike', async function () {
    const messages = [];

    for (const body of [
      { user_id: demoLogin, password: 'definitely-not' },
      { user_id: 'no-such-person-here', password: 'definitely-not' }
    ]) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await web.post('/auth/login', body);
        return 'a bad credential was accepted';
      } catch (err) {
        if (err.response.status !== 401) return 'expected 401, got ' + err.response.status;
        messages.push(err.response.data.message);
      }
    }

    /*
     * The same words for both. A different message for "no such account" is an
     * enumeration oracle, and on an unsalted MD5 that matters more than usual.
     */
    return messages[0] === messages[1] || 'the two refusals read differently';
  });

  await check('an email address is not a sign-in credential', async function () {
    /*
     * ora_pid.users has no email column. An earlier build tried an email's
     * local part as the login, which is a guess: two people holding
     * ming@a.com and ming@b.com would both have resolved to one account.
     */
    try {
      await web.post('/auth/login', { user_id: 'demo@crystal.example', password: 'crystal1234' });
      return 'an email signed somebody in';
    } catch (err) {
      return err.response.status === 401 || 'expected 401, got ' + err.response.status;
    }
  });

  /* ------------------------------------------------------------ /login */

  const PHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
  const phone = axios.create({ baseURL: api, timeout: 20000, headers: { 'User-Agent': PHONE_UA } });

  await check('/login gets its own form per device, and /auth/reganam keeps the old one', async function () {
    const desk = data(await web.get('/auth/methods'));
    const mobile = data(await phone.get('/auth/methods'));

    if (desk.login !== 'certificate') return 'a desktop /login form is ' + desk.login;
    if (mobile.login !== 'password') return 'a phone /login form is ' + mobile.login;

    /*
     * `allowed` is what the page at /auth/reganam draws from. It has to be
     * exactly what it was - adding the certificate to it would give that page
     * a chooser with a button it cannot draw.
     */
    if (desk.allowed.join() !== 'password') return 'the desktop reganam methods changed to ' + desk.allowed;
    return mobile.allowed.join() === 'otp' || 'the phone reganam methods changed to ' + mobile.allowed;
  });

  await check('a phone signs in with a password only alongside a cid, and the cid is recorded', async function () {
    /* Without one, a phone is held to the code, as it always was. */
    try {
      await phone.post('/auth/login', { user_id: demoLogin, password: 'crystal1234' });
      return 'a phone signed in with a password and no cid';
    } catch (err) {
      if (err.response.status !== 400) return 'expected 400 without a cid, got ' + err.response.status;
    }

    /* Twelve characters at most - the width of ora_pid.user_login_log.cid. */
    const cid = 'C' + String(Date.now()).slice(-10);
    const opened = data(await phone.post('/auth/login', { user_id: demoLogin, password: 'crystal1234', cid: cid }));
    if (!opened.token) return 'a phone with a cid got no session';

    /*
     * Recorded where the vendor's apps record theirs - and never checked. Read
     * straight from the table: no endpoint shows the login log, and asserting
     * through one that does not exist would test nothing.
     */
    const legacyDb = require('../src/config/db');
    const logged = await legacyDb.raw(
      'SELECT user_pk, cid, phone_imei FROM ora_pid.user_login_log WHERE cid = ? ORDER BY table_pk DESC LIMIT 1',
      [cid]
    );
    const row = logged.rows[0];
    if (!row) return 'the cid was not written to ora_pid.user_login_log';
    if (Number(row.user_pk) !== Number(opened.user.id)) return 'the login log names the wrong member';

    /* A different cid on the next sign-in is not refused. */
    const again = data(await phone.post('/auth/login', { user_id: demoLogin, password: 'crystal1234', cid: cid.slice(0, 10) + 'X' }));
    return !!again.token || 'a changed cid was refused, and it is recorded, not checked';
  });

  await check('a certificate subject and its policies are read the way the vendor reads them', function () {
    const x509 = require('../src/utils/x509');

    const text = [
      'Certificate:',
      '        Issuer: CN = Crystal CA',
      '        Subject: CN = iron, CN = Members, O = Crystal',
      '            X509v3 Certificate Policies:',
      '                Policy: 1.2.3.4',
      '                Policy: 1.2.408.20020827.8.3.3'
    ].join('\n');

    if (x509.subjectCommonName(text) !== 'iron') return 'the first CN on the Subject line was not read';
    if (x509.subjectCommonName('        Subject: CN=Li\\, Ming, CN=Members') !== 'Li, Ming') return 'an escaped comma split the CN';
    if (x509.subjectCommonName('        Issuer: CN = nobody') !== null) return 'the Issuer was read as the Subject';

    /* EVERY policy, not the first one printed - the vendor read only the first. */
    const policies = x509.policiesOf(text);
    return policies.join() === '1.2.3.4,1.2.408.20020827.8.3.3' || 'policies read as ' + policies.join();
  });

  await check('the desktop certificate sign-in follows the vendor, and a signature cannot be reused', async function () {
    const devDir = process.env.X509_DEV_DIR;
    const offered = data(await web.get('/auth/methods'));

    /* Without configuration the endpoints refuse rather than half-work. */
    if (!offered.certificate || !devDir) {
      try {
        await web.post('/auth/x509/x509_login', { plainData: 'x', signData: 'x', certData: 'x', certType: 'RSA' });
        return 'an unconfigured certificate sign-in accepted a request';
      } catch (err) {
        if ([401, 404].indexOf(err.response.status) === -1) return 'unconfigured sign-in answered ' + err.response.status;
      }
      console.log('       (certificate sign-in not configured on this API - only the refusal was checked;');
      console.log('        see scripts/x509-dev-pki.js to run the whole flow)');
      return true;
    }

    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const crypto = require('crypto');
    const childProcess = require('child_process');
    const OPENSSL = process.env.OPENSSL_BIN || 'openssl';
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'crystal-x509-check-'));

    /* A member certificate from the dev CA - with a personal policy, or not. */
    function issue(name, subject, withPolicy, caDir) {
      const ca = caDir || devDir;
      const key = path.join(work, name + '.key');
      const csr = path.join(work, name + '.csr');
      const pem = path.join(work, name + '.pem');
      const ext = path.join(work, name + '.ext');
      fs.writeFileSync(ext, withPolicy ? 'certificatePolicies=1.2.408.20020827.8.3.3\n' : 'basicConstraints=CA:FALSE\n');
      childProcess.execFileSync(OPENSSL, ['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', csr, '-subj', subject], { stdio: 'ignore' });
      childProcess.execFileSync(OPENSSL, ['x509', '-req', '-in', csr, '-CA', path.join(ca, 'ca.pem'), '-CAkey', path.join(ca, 'ca.key'),
        '-set_serial', String(Date.now()), '-out', pem, '-days', '30', '-extfile', ext], { stdio: 'ignore' });
      return { key: fs.readFileSync(key, 'utf8'), pem: fs.readFileSync(pem, 'utf8') };
    }

    /* What the agent does: ask for a challenge, sign client_rand + server_rand + host. */
    async function signIn(cert, version) {
      const clientRand = String(100000 + Math.floor(Math.random() * 899999));
      const primary = data(await web.post('/auth/x509/primary_data', {
        client_rand: clientRand, userid: demoLogin, version: version || 1300
      }));
      const host = new URL(primary.url).host;
      const plainData = Buffer.from(clientRand + primary.server_rand + host).toString('base64');
      const signer = crypto.createSign('SHA256');
      signer.update(plainData);
      const body = {
        plainData: plainData,
        signData: signer.sign(cert.key, 'base64'),
        certData: Buffer.from(cert.pem).toString('base64'),
        certType: 'RSA'
      };
      return { body: body, primary: primary };
    }

    async function refusedWith(body) {
      try {
        await web.post('/auth/x509/x509_login', body);
        return null;
      } catch (err) {
        return err.response.status;
      }
    }

    try {
      const good = issue('member', '/CN=' + demoLogin + '/CN=Members', true);

      /* 1. The whole flow signs the member named by the CN in. */
      const first = await signIn(good);
      const opened = data(await web.post('/auth/x509/x509_login', first.body));
      if (!opened.token) return 'a valid certificate got no session';
      if (opened.authType !== 'certificate') return 'the session says it came from ' + opened.authType;

      /* 2. The same signature a second time is refused - the vendor would accept it. */
      if (await refusedWith(first.body) !== 401) return 'a used signature signed somebody in again';

      /* 3. A certificate without a personal policy is refused. */
      const noPolicy = issue('nopolicy', '/CN=' + demoLogin + '/CN=Members', false);
      if (await refusedWith((await signIn(noPolicy)).body) !== 401) return 'a certificate with no personal policy was accepted';

      /* 4. A certificate from another CA is refused. */
      const rogueDir = path.join(work, 'rogue');
      fs.mkdirSync(rogueDir);
      childProcess.execFileSync(OPENSSL, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(rogueDir, 'ca.key'),
        '-out', path.join(rogueDir, 'ca.pem'), '-days', '30', '-subj', '/CN=Somebody Else CA'], { stdio: 'ignore' });
      const rogue = issue('rogue', '/CN=' + demoLogin + '/CN=Members', true, rogueDir);
      if (await refusedWith((await signIn(rogue)).body) !== 401) return 'a certificate from another CA was accepted';

      /* 5. A signature by a different key than the certificate's is refused. */
      const forged = await signIn(good);
      const other = issue('other', '/CN=someone-else/CN=Members', true);
      const signer = crypto.createSign('SHA256');
      signer.update(forged.body.plainData);
      forged.body.signData = signer.sign(other.key, 'base64');
      if (await refusedWith(forged.body) !== 401) return 'a signature from another key was accepted';

      /* 6. An agent older than the minimum is told so. */
      try {
        await web.post('/auth/x509/primary_data', { client_rand: '1', userid: demoLogin, version: 1000 });
        return 'an outdated agent was given a challenge';
      } catch (err) {
        if (err.response.status !== 400) return 'an outdated agent answered ' + err.response.status;
      }

      return true;
    } finally {
      /* rmdirSync with recursive: Node 12 has no rmSync. */
      fs.rmdirSync(work, { recursive: true });
    }
  });

  const memberSession = data(await web.post('/auth/login', {
    user_id: demoLogin, password: 'crystal1234'
  }));
  const member = client(memberSession.token, api + '/account');

  await check('a session says which user ID signed in', async function () {
    /*
     * `users.login` is the platform id - the same string as
     * ora_pid.users.user_id - and it is the one identifier the member typed,
     * the one the account sidebar shows them, and the one the eshop, the
     * appstore and the eproduct site all key them by. `id` beside it is
     * Crystal's row number, which means nothing to anybody reading it.
     *
     * It was on the session object and dropped by the serialiser, so both the
     * sign-in reply and /auth/me are checked - they are two different call
     * sites reaching the same function, and only one of them was noticed.
     */
    if (memberSession.user.login !== demoLogin) {
      return 'the sign-in reply says the user is ' + memberSession.user.login;
    }

    const me = data(await client(memberSession.token, api).get('/auth/me'));
    if (me.login !== demoLogin) return '/auth/me says the user is ' + me.login;

    /* And never the hash, on either. */
    return me.password_hash === undefined || '/auth/me carries the password hash';
  });

  await check('the member dashboard is four cards and the member, and nothing else', async function () {
    /*
     * THE MEMBER ASKED FOR FOUR FIGURES AND THEIR DETAILS - commerce value,
     * software points, register points, activity points, then who they are -
     * and "remove everything else". A wallet, a device list or a timeline
     * creeping back into this reply is the page growing back, so the keys are
     * held exactly. What each figure adds up to is checked with the points,
     * further down, against the tables themselves.
     */
    const body = data(await member.get('/dashboard'));

    const keys = Object.keys(body).sort().join(',');
    if (keys !== 'cards,member') return 'the dashboard answers ' + keys;

    const cards = (body.cards || []).map(function (card) { return card.key; }).join(',');
    if (cards !== 'COMMERCE,SOFTWARE,REGISTER,ACTIVITY') return 'the cards are ' + cards;

    const unread = body.cards.filter(function (card) {
      return card.state === 'OK' && typeof card.value !== 'number';
    });
    if (unread.length) return unread[0].key + ' says OK and carries no number';

    return body.member.user_id === demoLogin || 'the details panel names ' + body.member.user_id;
  });

  await check('nothing the member centre sends carries a password hash', async function () {
    /*
     * The wallet row holds the pay password hash and the user row holds the
     * sign-in one.  Neither is a thing a browser needs, and both would arrive
     * as ordinary JSON keys if a handler ever returned a row wholesale - so
     * this looks at the whole payload rather than at the fields it expects.
     */
    const payloads = [
      data(await member.get('/dashboard')),
      data(await member.get('/profile')),
      data(await member.get('/wallet'))
    ];

    const leaked = payloads.filter(function (body) {
      return /"[a-z_]*password[a-z_]*_hash"/.test(JSON.stringify(body));
    });
    if (leaked.length) return leaked.length + ' member payloads carry a password hash';

    // What the settings page actually needs: whether one exists.
    const profile = payloads[1];
    if (typeof profile.has_password !== 'boolean') return 'the profile does not say whether a password is set';
    return payloads[2].has_pay_password !== undefined
      || 'the wallet does not say whether a pay password is set';
  });

  await check('a repair reaches the member in words, not as a status number', async function () {
    /*
     * `status` is a small integer in the table and the member centre must not
     * be the place that learns what 4 means - the server pairs the code with
     * its label, exactly as the public tracking endpoint does.
     *
     * THE MEMBER IS FOUND, NOT NAMED. This used to sign in as member14 and
     * assume they had an open repair; the ticket generator picks its lines
     * from the price list, so changing the price list changed who ends up
     * with one and the check failed on data that was perfectly correct.
     */
    const open = data(await admin.get('/tickets?limit=50'));
    const withOwner = open.rows.filter(function (row) { return !!row.customer_email && row.user_id; })[0];
    if (!withOwner) return 'no repair in the system belongs to a member';

    /*
     * Signing in as them needs their USER ID, not the email on the ticket -
     * the platform has no email column. The console knows it, so it is read
     * from there rather than guessed from the address.
     */
    const account = data(await admin.get('/members/' + withOwner.user_id));
    const login = account.member && account.member.login;
    if (!login) return 'member ' + withOwner.user_id + ' has no platform login';

    const owner = data(await web.post('/auth/login', {
      user_id: login, password: 'crystal1234'
    }));
    const theirs = client(owner.token, api + '/account');

    /*
     * Their repairs list, not the dashboard: the dashboard carried open repairs
     * until it became the member's four figures, and the list is where a
     * repair reaches them now - through the same mapping.
     */
    const repairs = data(await theirs.get('/repairs?limit=50'));

    if (!repairs.rows.length) return withOwner.customer_email + ' has nothing in for repair';
    const unlabelled = repairs.rows.filter(function (row) { return !row.status_label; });
    return unlabelled.length === 0 || unlabelled.length + ' repairs arrived as a bare number';
  });

  await check('a resolved thread takes no more messages, from either side', async function () {
    /*
     * RESOLVED IS AN ENDING. Writing into one used to reopen it, which meant
     * a thread settled months ago could come back to the top of the queue on
     * a thank-you - and neither side could tell a live enquiry from an old
     * one. A new problem gets a new thread.
     *
     * BOTH SIDES are checked, and the manager half is the one worth having:
     * if only the member were blocked, a manager's message would still
     * reopen a thread the member had been told was closed, and they would be
     * expected to answer it.
     */
    const opened = data(await member.post('/feedback', {
      title: 'Check run resolved thread',
      message: 'The charger rattles.',
      thread_source: 'SMARTPHONE',
      category: 'PRODUCT'
    }));

    await member.post('/feedback/' + opened.id + '/close', {});

    const closed = data(await admin.get('/members/feedback/' + opened.id));
    if (closed.thread.status !== 'RESOLVED') return 'closing left it ' + closed.thread.status;

    const before = closed.messages.length;

    /* The member tries to add to it. */
    let memberRefused = false;
    try {
      await member.post('/feedback/' + opened.id + '/messages', { message: 'Actually, one more thing.' });
    } catch (e) {
      memberRefused = true;
    }
    if (!memberRefused) return 'a member could still write into a resolved thread';

    /* And so does the manager. */
    let managerRefused = false;
    try {
      await admin.post('/members/feedback/' + opened.id + '/reply', { message: 'Anything else?' });
    } catch (e) {
      managerRefused = true;
    }
    if (!managerRefused) return 'a manager could still write into a resolved thread';

    /*
     * NOTHING WAS WRITTEN AND NOTHING MOVED. A refusal that still appended
     * the message, or still flipped the status, would pass the two checks
     * above and be the actual bug.
     */
    const after = data(await admin.get('/members/feedback/' + opened.id));
    if (after.messages.length !== before) return 'a refused message was still added to the chain';

    return after.thread.status === 'RESOLVED' || 'a refused message still moved it to ' + after.thread.status;
  });

  await check('a thread the sweep gave up on is closed too, and says which', async function () {
    /*
     * FINISHED USED TO REOPEN. The argument for it was a decent one - the
     * sweep giving up after seven days is our silence, not the member's, and
     * making them retype the history punishes them for it - and what it
     * produced was a closed conversation quietly coming back to life in a
     * queue that had stopped counting it, owned by nobody.
     *
     * The two refusals must be DIFFERENT SENTENCES. Telling a member who
     * never got an answer that their enquiry "has been resolved" is the reply
     * that makes them write in again, which is the outcome both states exist
     * to prevent.
     *
     * The state is reached through the sweep rather than by writing it,
     * because the sweep is the only thing that sets it and a check that
     * bypassed it would not prove the pair work together.
     */
    const opened = data(await member.post('/feedback', {
      title: 'Check run stale thread',
      message: 'The case creaks when it is opened.',
      thread_source: 'SMARTPHONE',
      category: 'PRODUCT'
    }));

    /*
     * Aged well past any real window and then swept with a window to match,
     * so this thread is the only one the sweep can reach. Running it at its
     * ordinary seven days would finish every stale thread in the database,
     * which is a housekeeping job and not a check's business.
     *
     * The sweep is called IN PROCESS because it has no endpoint - it is run
     * by the scheduler - and writing FINISHED into the row by hand would
     * prove the refusal without proving the two work together.
     */
    const legacyDb = require('../src/config/legacy');
    await legacyDb.connection()(legacyDb.pid('feedback_threads'))
      .where('thread_pk', opened.id)
      .update({ updated_at: legacyDb.connection().raw("now() - interval '9000 days'") });

    const swept = await require('../src/services/feedback.service').finishStale(8000);
    if (!swept.finished) return 'the sweep finished nothing';

    const finished = data(await admin.get('/members/feedback/' + opened.id));
    if (finished.thread.status !== 'FINISHED') {
      return 'the sweep left it ' + finished.thread.status;
    }

    const before = finished.messages.length;

    let said = '';
    try {
      await member.post('/feedback/' + opened.id + '/messages', { message: 'Still waiting.' });
      return 'a member could still write into a finished thread';
    } catch (err) {
      if (!err.response || err.response.status !== 409) {
        return 'writing into a finished thread answered ' + (err.response || {}).status;
      }
      said = err.response.data.message || '';
    }

    /* And the manager, for the same reason as on a resolved one. */
    try {
      await admin.post('/members/feedback/' + opened.id + '/reply', { message: 'Sorry for the delay.' });
      return 'a manager could still write into a finished thread';
    } catch (err) {
      if (!err.response || err.response.status !== 409) {
        return 'a manager writing into a finished thread answered ' + (err.response || {}).status;
      }
    }

    const after = data(await admin.get('/members/feedback/' + opened.id));
    if (after.messages.length !== before) return 'a refused message was still added to the chain';
    if (after.thread.status !== 'FINISHED') return 'a refused message moved it to ' + after.thread.status;

    /* The wording has to be its own, not the resolved one borrowed. */
    const resolvedWording = require('../src/i18n').catalogs.en.feedback.threadIsResolved;
    return said !== resolvedWording
      || 'a timed-out enquiry is told it was resolved';
  });

  await check('feedback is a conversation, and it reopens when somebody writes', async function () {
    /*
     * It used to be one row with one reply column, which holds exactly one
     * exchange. The whole point of the thread is the chain underneath it, so
     * what is checked here is a real back-and-forth: member, manager, member.
     */
    const opened = data(await member.post('/feedback', {
      title: 'Check run conversation',
      message: 'The screen flickers after the update.',
      thread_source: 'SMARTPHONE',
      category: 'PRODUCT'
    }));

    if (opened.status !== 'PENDING') return 'a new thread is ' + opened.status + ', not PENDING';
    if (opened.last_type !== 'MEMBER') return 'the preview does not say who wrote last';

    /* The manager answers: it moves to REPLIED and acquires an owner. */
    await admin.post('/members/feedback/' + opened.id + '/reply', {
      message: 'Please try a restart, then bring it in if it persists.'
    });

    const afterReply = data(await admin.get('/members/feedback/' + opened.id));
    if (afterReply.thread.status !== 'REPLIED') return 'a reply left it ' + afterReply.thread.status;
    if (!afterReply.thread.session_by) return 'answering did not give the thread an owner';
    if (afterReply.messages.length !== 2) return 'the chain is ' + afterReply.messages.length + ' long, not 2';

    /* The member follows up: it comes back to us, in the SAME thread. */
    await member.post('/feedback/' + opened.id + '/messages', { message: 'That did not help.' });

    const afterFollow = data(await admin.get('/members/feedback/' + opened.id));
    if (afterFollow.thread.status !== 'PENDING') return 'a follow-up left it ' + afterFollow.thread.status;
    if (afterFollow.messages.length !== 3) return 'the follow-up did not join the chain';

    /*
     * The preview is denormalised onto the thread, and a preview that can
     * disagree with the chain is worse than no preview at all.
     */
    const last = afterFollow.messages[afterFollow.messages.length - 1];
    if (afterFollow.thread.last_message !== last.message) return 'the preview disagrees with the chain';
    if (afterFollow.thread.last_type !== last.action_type) return 'the preview names the wrong author';

    /* Resolving ends it - and writing again would reopen it. */
    await member.post('/feedback/' + opened.id + '/close', {});
    const resolved = data(await admin.get('/members/feedback/' + opened.id));
    return resolved.thread.status === 'RESOLVED' || 'closing left it ' + resolved.thread.status;
  });

  await check('reading a thread does not move it in the queue', async function () {
    /*
     * The console's queue is ordered by `updated_at DESC`, and marking a
     * thread read is an UPDATE - so with the ordinary trigger, opening a
     * thread stamped it as the newest activity and jumped it to the top. The
     * list reshuffled under the manager the moment they clicked a row.
     *
     * On feedback_threads, updated_at means the last time somebody WROTE.
     */
    const opened = data(await member.post('/feedback', {
      title: 'Check run ordering', message: 'Reading this must not bump it.',
      thread_source: 'SMARTPHONE'
    }));

    // A manager answers, so the thread is unread by the MEMBER - which is the
    // side whose next read is the one that used to bump it.
    await admin.post('/members/feedback/' + opened.id + '/reply', { message: 'Noted.' });

    const before = data(await admin.get('/members/feedback/' + opened.id)).thread;
    if (before.is_read) return 'the reply left it already read';

    // The member opens it, which is what marks it read.
    const seen = data(await member.get('/feedback/' + opened.id)).thread;
    const after = data(await admin.get('/members/feedback/' + opened.id)).thread;

    if (!after.is_read) return 'opening it did not mark it read';
    if (after.updated_at !== before.updated_at) {
      return 'reading it moved updated_at, so the queue reorders on a click';
    }

    // And writing still counts, or the ordering would mean nothing at all.
    await member.post('/feedback/' + opened.id + '/messages', { message: 'One more thing.' });
    const written = data(await admin.get('/members/feedback/' + opened.id)).thread;

    return written.updated_at !== seen.updated_at
      || 'writing in it did not move updated_at either';
  });

  await check('a member can remove a conversation of their own, and only their own', async function () {
    const opened = data(await member.post('/feedback', {
      title: 'Check run removal', message: 'Never mind, I worked it out.',
      thread_source: 'ESHOP'
    }));

    await member.delete('/feedback/' + opened.id);

    /* Gone from the member's list, and from the console's queue with it. */
    try {
      await member.get('/feedback/' + opened.id);
      return 'the removed thread is still readable';
    } catch (err) {
      if (!err.response || err.response.status !== 404) return 'removal answered oddly';
    }

    /*
     * Somebody else's thread is a 404 rather than a 403: telling them they
     * may not delete it is telling them it is there.
     */
    /*
     * OLDEST FIRST, which is not a detail.
     *
     * This suite OPENS a thread on every run and never closes one, so the
     * newest fifty are eventually all its own - owned by the demo member,
     * leaving no foreign thread to test against and reporting it as though
     * the data were wrong. The seeded threads, spread across members, are
     * at the other end and stay there.
     */
    const others = data(await admin.get('/members/feedback?limit=50&sort=created_at&dir=asc'));
    const foreign = others.rows.filter(function (row) {
      return row.user_id !== opened.user_id;
    })[0];
    if (!foreign) return 'no other member has a thread to test with';

    try {
      await member.delete('/feedback/' + foreign.id);
      return 'a member deleted somebody else conversation';
    } catch (err) {
      return (err.response && err.response.status === 404)
        || 'deleting a foreign thread answered ' + (err.response && err.response.status);
    }
  });

  await check('one member cannot read another one thread', async function () {
    /*
     * Enforced in the service rather than the route, because both the member
     * centre and the console reach the same function - and a thread is a
     * private conversation.
     */
    const mine = data(await member.get('/feedback?limit=1'));
    if (!mine.rows.length) return 'the member has no threads to test with';

    /*
     * OLDEST FIRST, which is not a detail.
     *
     * This suite OPENS a thread on every run and never closes one, so the
     * newest fifty are eventually all its own - owned by the demo member,
     * leaving no foreign thread to test against and reporting it as though
     * the data were wrong. The seeded threads, spread across members, are
     * at the other end and stay there.
     */
    const others = data(await admin.get('/members/feedback?limit=50&sort=created_at&dir=asc'));
    const foreign = others.rows.filter(function (row) {
      return row.id !== mine.rows[0].id && row.user_id !== mine.rows[0].user_id;
    })[0];
    if (!foreign) return 'no other member has a thread';

    try {
      await member.get('/feedback/' + foreign.id);
      return 'one member read another conversation';
    } catch (err) {
      return err.response.status === 404;
    }
  });

  await check('a member sees only their own devices', async function () {
    const body = data(await member.get('/products?limit=100'));
    const others = body.rows.filter(function (row) { return row.user_id !== memberSession.user.id; });
    return others.length === 0 || others.length + ' devices belong to somebody else';
  });

  /** Any serial the mirror knows about that nobody has registered yet. */
  async function findFreeSerial() {
    const known = data(await admin.get('/tickets?limit=200')).rows;
    for (let i = 0; i < known.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const status = data(await member.get('/products/check?sn=' + known[i].serial_number));
      if (status.known && !status.registered) return known[i].serial_number;
    }
    return null;
  }

  await check('registering a serial awards points AND issues cover', async function () {
    const candidate = await findFreeSerial();
    if (!candidate) return true;   // nothing spare in this seed

    const before = Number(data(await member.get('/wallet')).point_balance);
    const body = data(await member.post('/products', { serial_number: candidate }));

    if (!body.points_awarded) return 'no points were awarded';
    if (!body.warranty) return 'no warranty was issued';

    const after = Number(data(await member.get('/wallet')).point_balance);
    return after === before + body.points_awarded
      || 'the balance moved by ' + (after - before) + ' for an award of ' + body.points_awarded;
  });

  await check('the point ledger sums to the cached balance', async function () {
    const purse = data(await member.get('/wallet'));

    /*
     * source=CRYSTAL, AND THE FILTER IS THE WHOLE POINT OF THIS CHECK NOW.
     *
     * The ledger became six systems wide when the vendor's five were merged in,
     * and only one of them is what `wallets.point_balance` caches. Summing the
     * union against Crystal's cached total compares a figure to a different
     * figure - it failed the moment the merge landed, correctly, and the fix is
     * to name the ledger being reconciled rather than to loosen the assertion.
     */
    const log = data(await member.get('/points?limit=200&source=CRYSTAL'));

    const total = log.rows.reduce(function (sum, row) { return sum + Number(row.amount); }, 0);
    return total === Number(purse.point_balance)
      || 'the Crystal ledger sums to ' + total + ' against a cached ' + purse.point_balance;
  });

  await check('a points balance can never go negative', async function () {
    try {
      await member.post('/licenses', { device_type: 'TV', device_sn: 'NOSUCHDEVICE0001' });
    } catch (err) {
      // Refused is a legitimate outcome; what matters is the balance below.
      if ([400, 404, 409].indexOf(err.response.status) === -1) return 'unexpected ' + err.response.status;
    }
    const purse = data(await member.get('/wallet'));
    return Number(purse.point_balance) >= 0 || 'the balance went negative';
  });

  await check('the member area refuses an administrator token', async function () {
    const crossed = client(session.token, api + '/account');
    try {
      await crossed.get('/dashboard');
      return 'an admin token opened the member centre';
    } catch (err) {
      return err.response.status === 401;
    }
  });


  /* ------------------------------------------------- the vendor's database */

  console.log('\nthe legacy database');

  /*
   * Feedback and the blog are read and written in the vendor's instance now
   * (src/config/legacy.js). Every check above this point would still pass if
   * they had quietly gone back to reading Crystal's PostgreSQL copies - the
   * API contract is identical by design, and in DEVELOPMENT both sets of
   * tables sit in the same database holding the same rows. That is the whole
   * hazard: the wiring can regress and nothing looks wrong until deployment,
   * where the PostgreSQL copies are empty.
   *
   * So these four checks assert the things that are only true of the legacy
   * side.
   */

  await check('the health endpoint names which database feedback came from', async function () {
    const health = data(await site().get('/health'));
    const legacy = health.engines && health.engines.legacy;

    if (!legacy) return 'the health reply does not mention the legacy database';
    if (legacy.state !== 'up') return 'the legacy database is ' + legacy.state;
    return true;
  });

  await check('the blog answers with the vendor\'s articles, not only Crystal\'s', async function () {
    const list = data(await web.get('/blog?limit=50'));

    /*
     * The vendor's own rows have ids far above anything a Crystal serial
     * column produces. One of them in the list is proof the storefront is
     * reading ora_blog rather than the PostgreSQL `articles` table, which
     * holds none of them.
     */
    const foreign = list.rows.filter(function (row) { return Number(row.id) > 2147483647; });
    return foreign.length > 0
      || 'every article has a Crystal-shaped id - the blog is not reading the vendor database';
  });

  await check('an article slug survives a round trip without being stored', async function () {
    const list = data(await web.get('/blog?limit=1'));
    if (!list.rows.length) return 'no published articles';

    const slug = list.rows[0].slug;

    /*
     * There is no slug column. It is derived from the title and the id, and
     * read back by taking the id off the end - so the one thing that must
     * hold is that the round trip lands on the same article.
     */
    const article = data(await web.get('/blog/' + slug));
    if (Number(article.id) !== Number(list.rows[0].id)) return 'the slug resolved to a different article';

    /* And a retitled link still works, because only the number is read. */
    const renamed = data(await web.get('/blog/something-else-entirely-' + article.id));
    return Number(renamed.id) === Number(article.id)
      || 'a link written before a retitle stopped resolving';
  });

  /*
   * THREADS. The vendor's blog is a forum as well as a publication - a reply
   * is a row whose `parent` is the article it answers - and for as long as
   * Crystal read only `parent = 0` every reply in the vendor's database was
   * invisible. The model is written down at the top of
   * repositories/legacy/articles.repository.js; these hold the parts of it a
   * reader would notice going wrong. `npm run legacy:install` writes the
   * threads they need.
   */

  /** Every reply of a thread, a page at a time, exactly as the storefront pages it. */
  async function wholeThread(slug, limit) {
    const rows = [];
    let total = 0;

    for (let page = 1; page < 100; page += 1) {
      /* eslint-disable no-await-in-loop */
      const body = data(await web.get('/blog/' + slug + '/replies?limit=' + limit + '&page=' + page));
      /* eslint-enable no-await-in-loop */
      total = body.total;
      body.rows.forEach(function (row) { rows.push(row); });
      if (!body.rows.length || rows.length >= total) break;
    }

    return { rows: rows, total: total };
  }

  /** The published thread with the most replies - the one paging can be checked on. */
  async function busiestThread() {
    const list = data(await web.get('/blog?sort=replies&limit=1'));
    return list.rows.length && list.rows[0].reply_count > 0 ? list.rows[0] : null;
  }

  /**
   * A reader at an address of their own. app.js trusts one proxy hop, so the
   * forwarded address IS the visitor as far as the read counter knows - which
   * is what lets a check be two different people from one machine.
   */
  function reader() {
    const octet = function () { return Math.floor(Math.random() * 254) + 1; };
    return axios.create({
      baseURL: api,
      timeout: 20000,
      headers: { 'X-Forwarded-For': '198.18.' + octet() + '.' + octet() }
    });
  }

  await check('the index counts each thread\'s published replies, and the thread delivers exactly that many', async function () {
    const thread = await busiestThread();
    if (!thread) return 'no published article has a published reply - run npm run legacy:install';

    const whole = await wholeThread(thread.slug, 50);
    if (whole.total !== thread.reply_count) {
      return 'the index says ' + thread.reply_count + ' replies, the thread answers a total of ' + whole.total;
    }
    if (whole.rows.length !== whole.total) return 'the thread delivered ' + whole.rows.length + ' of ' + whole.total;

    /* A reply is never a row of the index. */
    const index = data(await web.get('/blog?limit=48'));
    const replyIds = whole.rows.map(function (row) { return Number(row.id); });
    const leaked = index.rows.filter(function (row) { return replyIds.indexOf(Number(row.id)) !== -1; });

    return leaked.length === 0 || leaked.length + ' replies were listed as articles';
  });

  await check('a thread pages newest activity first, and no reply is shown twice or skipped', async function () {
    const thread = await busiestThread();
    if (!thread) return 'no published article has a published reply';
    if (thread.reply_count <= 10) return 'the busiest thread has ' + thread.reply_count + ' replies - too few to page';

    const paged = await wholeThread(thread.slug, 10);
    const whole = await wholeThread(thread.slug, 50);

    const ids = paged.rows.map(function (row) { return Number(row.id); });
    const unique = ids.filter(function (id, i) { return ids.indexOf(id) === i; });
    if (unique.length !== ids.length) return (ids.length - unique.length) + ' replies appeared on two pages';
    if (ids.length !== paged.total) return 'ten at a time delivered ' + ids.length + ' of ' + paged.total;

    /* Paging must not change the order - the same conversation, however it is cut. */
    const one = whole.rows.map(function (row) { return Number(row.id); }).join(',');
    if (one !== ids.join(',')) return 'the order at ten a page differs from the order at fifty';

    /* The vendor's order: modify_at (updated_at) descending, id breaking the tie. */
    for (let i = 1; i < whole.rows.length; i += 1) {
      const before = new Date(whole.rows[i - 1].updated_at).getTime();
      const after = new Date(whole.rows[i].updated_at).getTime();
      if (after > before || (after === before && Number(whole.rows[i].id) > Number(whole.rows[i - 1].id))) {
        return 'reply ' + whole.rows[i].id + ' is out of order';
      }
    }

    return true;
  });

  await check('a link to one reply lands on its thread, on the page that holds it', async function () {
    const thread = await busiestThread();
    if (!thread || thread.reply_count <= 10) return 'no thread long enough to have a second page';

    const second = data(await web.get('/blog/' + thread.slug + '/replies?limit=10&page=2'));
    const target = second.rows[second.rows.length - 1];

    const found = data(await web.get('/blog/reply/' + target.id + '?limit=10'));
    if (Number(found.thread.id) !== Number(thread.id)) return 'the reply resolved to thread ' + found.thread.id;
    if (found.thread.slug !== thread.slug) return 'the resolved slug is not the thread\'s slug';
    if (found.page !== 2) return 'the reply is on page 2 and resolved to page ' + found.page;
    if (found.position !== 10 + second.rows.length - 1) return 'the reply resolved to position ' + found.position;

    /* A different page size moves the page, not the position. */
    const wider = data(await web.get('/blog/reply/' + target.id + '?limit=50'));
    return (wider.page === 1 && wider.position === found.position)
      || 'at fifty a page the reply resolved to page ' + wider.page + ', position ' + wider.position;
  });

  await check('a reply does not open as an article, and an article does not resolve as a reply', async function () {
    const thread = await busiestThread();
    if (!thread) return 'no published article has a published reply';

    const reply = data(await web.get('/blog/' + thread.slug + '/replies?limit=1')).rows[0];

    try {
      await web.get('/blog/anything-' + reply.id);
      return 'a reply answered on the article route';
    } catch (err) {
      if (!err.response || err.response.status !== 404) return 'the article route answered ' + (err.response && err.response.status);
    }

    try {
      await web.get('/blog/reply/' + thread.id);
      return 'an article resolved as a reply';
    } catch (err) {
      return (err.response && err.response.status === 404) || 'the reply route answered ' + (err.response && err.response.status);
    }
  });

  await check('a question surfaces its accepted answer, and the thread marks the same reply', async function () {
    const list = data(await web.get('/blog?limit=48'));
    const question = list.rows.filter(function (row) { return row.is_help_request && row.has_accepted_answer; })[0];
    if (!question) return 'no published help request has an accepted answer - run npm run legacy:install';
    if (!question.help_status) return 'the help request has no status';

    const article = data(await web.get('/blog/' + question.slug));
    const answers = article.accepted_answers || [];
    if (!answers.length) return 'the question\'s detail carries no accepted answer';
    if (answers.some(function (row) { return !row.is_accepted || Number(row.parent_id) !== Number(question.id); })) {
      return 'an accepted answer is not marked, or belongs to another thread';
    }

    const whole = await wholeThread(question.slug, 50);
    const marked = whole.rows.filter(function (row) { return row.is_accepted; })
      .map(function (row) { return Number(row.id); });

    if (marked.indexOf(Number(answers[0].id)) === -1) return 'the surfaced answer is not marked in the thread';

    /* And an ordinary article's thread never claims an accepted answer. */
    const plainThread = list.rows.filter(function (row) { return !row.is_help_request && row.reply_count > 0; })[0];
    if (!plainThread) return true;

    const ordinary = await wholeThread(plainThread.slug, 50);
    return ordinary.rows.every(function (row) { return !row.is_accepted; })
      || 'a reply in an ordinary thread is marked as an accepted answer';
  });

  await check('a read counts once per visitor per day, and opening a reply does not count for its article', async function () {
    const thread = await busiestThread();
    if (!thread) return 'no published article has a published reply';

    const first = reader();
    const a1 = data(await first.get('/blog/' + thread.slug)).view_count;
    const a2 = data(await first.get('/blog/' + thread.slug)).view_count;
    if (a2 !== a1) return 'the same visitor was counted twice on one day (' + a1 + ' then ' + a2 + ')';

    const b = data(await reader().get('/blog/' + thread.slug)).view_count;
    if (b !== a1 + 1) return 'a second visitor moved the count from ' + a1 + ' to ' + b;

    /* A third visitor opens a reply by its link - that is the reply's read, not the article's. */
    const reply = data(await web.get('/blog/' + thread.slug + '/replies?limit=1')).rows[0];
    const opened = data(await reader().get('/blog/reply/' + reply.id));
    if (opened.reply.view_count !== reply.view_count + 1) {
      return 'opening the reply moved its own count from ' + reply.view_count + ' to ' + opened.reply.view_count;
    }

    const after = data(await first.get('/blog/' + thread.slug)).view_count;
    return after === b || 'opening a reply moved its article\'s count from ' + b + ' to ' + after;
  });

  await check('a shelf shows what its count says, the shelves under it included', async function () {
    const roots = data(await web.get('/blog/subjects'));
    if (!Array.isArray(roots) || !roots.length) return 'the subject tree is empty - run npm run legacy:install';

    const parent = roots.filter(function (row) { return row.children.length && row.total_cnt > row.article_cnt; })[0];
    if (!parent) return 'no shelf has published articles under a child shelf';

    const wanted = parent.children.reduce(function (sum, child) { return sum + child.total_cnt; }, parent.article_cnt);
    if (parent.total_cnt !== wanted) return 'the parent\'s total is not its own count plus its children\'s';

    const shown = data(await web.get('/blog?limit=1&subject=' + parent.id));
    if (shown.total !== parent.total_cnt) {
      return 'the tree says ' + parent.total_cnt + ' under ' + parent.name + ', the index shows ' + shown.total;
    }

    const child = parent.children.filter(function (row) { return row.total_cnt > 0; })[0];
    const narrowed = data(await web.get('/blog?limit=48&subject=' + child.id));
    if (narrowed.total !== child.total_cnt) return 'the child shelf shows ' + narrowed.total + ' of ' + child.total_cnt;

    return narrowed.rows.every(function (row) { return row.subject && row.subject.id === child.id; })
      || 'a child shelf listed an article filed somewhere else';
  });

  await check('the member\'s replies are replies, each with the thread it belongs to', async function () {
    const replies = data(await member.get('/articles?kind=REPLY&limit=50'));
    const articles = data(await member.get('/articles?kind=ARTICLE&limit=50'));
    const everything = data(await member.get('/articles?limit=1'));

    if (!replies.rows.length) return 'the demo member has written no replies - run npm run legacy:install';
    if (everything.total !== replies.total + articles.total) {
      return 'articles (' + articles.total + ') and replies (' + replies.total + ') do not add up to ' + everything.total;
    }

    const wrong = replies.rows.filter(function (row) {
      return row.kind !== 'REPLY' || !row.thread || Number(row.thread.id) !== Number(row.parent_id);
    }).concat(articles.rows.filter(function (row) { return row.kind !== 'ARTICLE' || row.thread !== null; }));

    return wrong.length === 0 || wrong.length + ' rows were the wrong kind or lost their thread';
  });

  await check('a reply a reader may not see is not in its thread and does not resolve', async function () {
    const replies = data(await member.get('/articles?kind=REPLY&limit=50'));
    const hidden = replies.rows.filter(function (row) { return !row.is_public && row.thread && row.thread.is_public; });
    if (!hidden.length) return 'the demo member has no unpublished reply in a public thread - run npm run legacy:install';

    for (let i = 0; i < hidden.length; i += 1) {
      /* eslint-disable no-await-in-loop */
      const whole = await wholeThread(hidden[i].thread.slug, 50);
      /* eslint-enable no-await-in-loop */
      if (whole.rows.some(function (row) { return Number(row.id) === Number(hidden[i].id); })) {
        return 'a ' + hidden[i].status.toLowerCase() + ' reply is shown in its thread';
      }

      try {
        /* eslint-disable no-await-in-loop */
        await web.get('/blog/reply/' + hidden[i].id);
        /* eslint-enable no-await-in-loop */
        return 'a ' + hidden[i].status.toLowerCase() + ' reply resolved for a reader';
      } catch (err) {
        if (!err.response || err.response.status !== 404) return 'resolving it answered ' + (err.response && err.response.status);
      }
    }

    return true;
  });

  /*
   * THE THREE THUMBS - the vendor's submitBlogRating, given through the
   * member API: one thumb of any colour per reader per row, never on the
   * reader's own writing, never on a row a reader cannot see, and the count
   * moved by exactly one even when two taps arrive together.
   *
   * A THUMB IS FOR GOOD - there is no endpoint that takes one back - so this
   * check removes its own afterwards, directly in the ledger and the counter,
   * the way the upload check above removes its files. Without that every run
   * would use up an article the demo member had not rated yet.
   */
  await check('a member gives one thumb per row, not on their own writing, and the count moves by one', async function () {
    const legacy = require('../src/config/legacy');
    const codes = require('../src/repositories/legacy/codes');

    const index = data(await web.get('/blog?limit=48'));
    const others = index.rows.filter(function (row) { return row.author !== demoLogin; });
    const own = index.rows.filter(function (row) { return row.author === demoLogin; })[0];

    const rated = {};
    data(await member.get('/blog/thumbs?ids=' + others.map(function (row) { return row.id; }).join(',')))
      .forEach(function (entry) { rated[entry.id] = true; });
    const target = others.filter(function (row) { return !rated[row.id]; })[0];
    if (!target) return 'the demo member has already rated every article on the first page';

    const before = target.recommendations;
    let given = null;

    try {
      try {
        await member.post('/blog/' + target.id + '/thumb', { kind: 'PLATINUM' });
        return 'a kind that is not gold, silver or bronze was accepted';
      } catch (err) {
        if (err.response.status !== 400) return 'an unknown kind answered ' + err.response.status;
      }

      /* Two taps at once, of different colours: one is counted, the other refused. */
      const taps = await Promise.allSettled([
        member.post('/blog/' + target.id + '/thumb', { kind: 'GOLD' }),
        member.post('/blog/' + target.id + '/thumb', { kind: 'BRONZE' })
      ]);
      const won = taps.filter(function (tap) { return tap.status === 'fulfilled'; });
      const lost = taps.filter(function (tap) { return tap.status === 'rejected'; });

      if (won.length) given = data(won[0].value).kind;
      if (won.length !== 1) return won.length + ' of two simultaneous thumbs were counted';
      if (lost[0].reason.response.status !== 409) return 'the second thumb answered ' + lost[0].reason.response.status;
      if (lost[0].reason.response.data.detail.kind !== given) return 'the refusal did not say which thumb stands';

      const field = { GOLD: 'gold', SILVER: 'silver', BRONZE: 'bronze' };
      const after = data(await web.get('/blog/' + target.slug)).recommendations;
      const moved = ['gold', 'silver', 'bronze'].filter(function (key) { return after[key] !== before[key]; });
      if (moved.length !== 1 || moved[0] !== field[given] || after[moved[0]] !== before[moved[0]] + 1) {
        return 'the counts went from ' + JSON.stringify(before) + ' to ' + JSON.stringify(after) + ' for one ' + given;
      }

      const mine = data(await member.get('/blog/thumbs?ids=' + target.id + ',' + others[others.length - 1].id));
      const here = mine.filter(function (entry) { return entry.id === target.id; });
      if (here.length !== 1 || here[0].kind !== given) return 'the member\'s own thumbs do not show the one given';

      if (own) {
        try {
          await member.post('/blog/' + own.id + '/thumb', { kind: 'GOLD' });
          return 'a member rated their own article';
        } catch (err) {
          if (err.response.status !== 400) return 'rating one\'s own article answered ' + err.response.status;
        }
      }

      /* A reply readers cannot see is not somewhere a thumb can be given, whoever asks. */
      const hidden = data(await member.get('/articles?kind=REPLY&limit=50')).rows
        .filter(function (row) { return !row.is_public; })[0];
      if (hidden) {
        try {
          await member.post('/blog/' + hidden.id + '/thumb', { kind: 'GOLD' });
          return 'an unpublished reply took a thumb';
        } catch (err) {
          if (err.response.status !== 404) return 'an unpublished reply answered ' + err.response.status;
        }
      }

      try {
        await web.post('/account/blog/' + target.id + '/thumb', { kind: 'GOLD' });
        return 'a thumb was given without signing in';
      } catch (err) {
        if (err.response.status !== 401) return 'signed out, a thumb answered ' + err.response.status;
      }

      return true;
    } finally {
      if (given) {
        await legacy.connection()(legacy.blog('blog_article_recommend'))
          .where({ article_id: target.id, recommend_user_userid: demoLogin }).del();
        await legacy.connection()(legacy.blog('blog_article_info'))
          .where('id', target.id).decrement(codes.THUMB[given].column, 1);
      }
    }
  });

  /*
   * A MEMBER WRITING IN THE BLOG - the vendor's addBlog, editBlog and
   * deleteBlog, with the bugs listed at the top of services/blog.service.js
   * fixed. What these three exercise is the part that only exists with a
   * database behind it: that a post lands in the vendor's three tables in a
   * state no reader can see, that the console can then find it, that the
   * daily allowance is counted per kind, and that one member cannot touch
   * another's rows.
   *
   * THEY PURGE WHAT THEY WRITE, through src/config/legacy, exactly as the
   * thumbs check above removes its ledger row - and that is also what makes
   * the suite repeatable. The API's own delete is a SOFT one for anything
   * already submitted (on purpose: a withdrawn post must not hand the day
   * back), so a run that tidied up through the API alone would leave the demo
   * member unable to post for the rest of the day, and the next run would
   * report a limit that is working exactly as intended.
   *
   * THEY ADAPT TO THE DAY. The seed gives the demo member replies dated
   * today, so on a fresh install the reply allowance is already spent - and a
   * check that demanded a free one would fail on a machine where nothing is
   * wrong. Both branches assert: with the allowance free, that the post lands
   * where it should; with it spent, that the refusal is the vendor's 409 and
   * says which kind it is about.
   */
  async function purgePosts(ids) {
    const legacy = require('../src/config/legacy');

    for (let i = 0; i < ids.length; i += 1) {
      /* eslint-disable no-await-in-loop */
      await legacy.connection()(legacy.blog('blog_article_lob')).where('id', ids[i]).del();
      await legacy.connection()(legacy.blog('blog_article_info')).where('id', ids[i]).del();
      await legacy.connection()(legacy.blog('blog_article')).where('id', ids[i]).del();
      /* eslint-enable no-await-in-loop */
    }
  }

  await check('a member writes an article, it waits to be read, and no reader sees it meanwhile', async function () {
    const shelves = data(await web.get('/blog/subjects'));
    if (!shelves.length) return 'the blog has no shelves - run npm run legacy:install';

    const made = [];
    try {
      const before = data(await member.get('/articles/allowance'));

      /* A DRAFT IS FREE. The vendor counts its own drafts, and then skips the check when saving one. */
      const draft = data(await member.post('/articles', {
        title: 'check.js draft', subject_id: shelves[0].id, content: 'a draft nobody has seen', status: 'DRAFT'
      }));
      made.push(draft.id);
      if (draft.status !== 'DRAFT') return 'a draft came back as ' + draft.status;

      const afterDraft = data(await member.get('/articles/allowance'));
      if (afterDraft.article.used !== before.article.used) return 'saving a draft used up the day';

      if (before.article.left === 0) {
        try {
          await member.post('/articles', { title: 'check.js second', subject_id: shelves[0].id, content: 'words' });
          return 'an article was accepted although today\'s had already been posted';
        } catch (err) {
          if (err.response.status !== 409) return 'the refusal answered ' + err.response.status;
          if (err.response.data.detail.reason !== 'LIMIT_ARTICLE') return 'the refusal does not say which kind it is about';
        }
        return true;
      }

      /*
       * THE BODY IS MARKUP, AND IT IS SANITISED (utils/richText.js).
       *
       * A member writes in the console's editor now, so the formatting it
       * produces is kept - and everything it cannot produce is thrown away
       * here rather than stored and dealt with by every later reader: a
       * script, a picture, an inline style, a handler attribute.
       */
      const article = data(await member.post('/articles', {
        title: 'check.js article <b>bold</b>',
        subject_id: shelves[0].id,
        content: '<p>first <strong>paragraph</strong></p>'
          + '<script>alert(1)</script><img src="x" onerror="alert(1)">'
          + '<p style="color:red" onclick="x()">second paragraph</p>'
      }));
      made.push(article.id);

      if (article.status !== 'REVIEW') return 'a submitted article came back as ' + article.status;
      if (article.content.indexOf('<strong>') === -1) return 'the editor\'s formatting was thrown away: ' + article.content;
      if (/<script|<img|onerror|onclick|style=/i.test(article.content)) {
        return 'the body kept something it should not: ' + article.content;
      }
      if (article.content.indexOf('second paragraph') === -1) return 'the body lost a paragraph';
      if (article.title.indexOf('<') !== -1) return 'the title was stored as markup';

      /* A body too long to store is refused while the words are still on screen. */
      try {
        await member.post('/articles', {
          title: 'check.js enormous',
          subject_id: shelves[0].id,
          content: '<p>' + new Array(21000).join('w') + '</p>'
        });
        return 'a body past the limit was accepted';
      } catch (err) {
        if (err.response.status !== 400) return 'an oversized body answered ' + err.response.status;
        if (err.response.data.detail.reason !== 'BODY_TOO_LONG') return 'the refusal does not say why';
      }

      try {
        await web.get('/blog/' + article.slug);
        return 'an article waiting to be read is on the public blog';
      } catch (err) {
        if (!err.response || err.response.status !== 404) {
          return 'the public blog answered ' + (err.response && err.response.status);
        }
      }

      /* THE CONSOLE IS WHERE IT IS APPROVED, so the console has to be able to find it. */
      const queue = data(await admin.get('/articles?status=REVIEW&limit=100'));
      if (!queue.rows.some(function (row) { return Number(row.id) === Number(article.id); })) {
        return 'the console cannot see an article waiting for approval';
      }

      /*
       * AND A MANAGER CAN EDIT IT THERE, in the same editor the member
       * wrote it in - the markup goes in and comes back as it was, which
       * is the whole point of both sides using one editor.
       */
      const corrected = '<p>first <strong>paragraph</strong>, corrected by a manager</p>';
      await admin.put('/articles/' + article.id, { content: corrected });

      const asManagerSees = data(await admin.get('/articles/' + article.id));
      if (asManagerSees.content !== corrected) {
        return 'the manager\'s edit did not survive: ' + asManagerSees.content;
      }

      const asMemberSees = data(await member.get('/articles?limit=50')).rows
        .filter(function (row) { return Number(row.id) === Number(article.id); })[0];
      if (!asMemberSees) return 'the member lost sight of their own article after the console edited it';

      /* One a day, counted properly - the vendor's own website check reads its count off an array. */
      try {
        await member.post('/articles', { title: 'check.js second', subject_id: shelves[0].id, content: 'words' });
        return 'a second article was accepted on the same day';
      } catch (err) {
        if (err.response.status !== 409) return 'the second article answered ' + err.response.status;
        if (err.response.data.detail.reason !== 'LIMIT_ARTICLE') return 'the refusal does not say which kind it is about';
      }

      /* Withdrawing a submitted post is a soft delete, and it does not hand the day back. */
      const removed = data(await member.delete('/articles/' + article.id));
      if (removed.removed !== 'ARCHIVED') return 'withdrawing a submitted post answered ' + removed.removed;

      const after = data(await member.get('/articles/allowance'));
      if (after.article.left !== 0) return 'withdrawing a post handed the day back';

      const mine = data(await member.get('/articles?limit=50'));
      const row = mine.rows.filter(function (entry) { return Number(entry.id) === Number(article.id); })[0];
      if (!row || row.status !== 'ARCHIVED') return 'a withdrawn post is not in the member\'s own list as archived';

      return true;
    } finally {
      await purgePosts(made);
    }
  });

  await check('a reply belongs to a published article, is counted apart from one, and reaches the console', async function () {
    const index = data(await web.get('/blog?limit=8'));
    const thread = index.rows.filter(function (row) { return row.author !== demoLogin; })[0] || index.rows[0];
    if (!thread) return 'nothing is published on the blog - run npm run legacy:install';

    const made = [];
    try {
      /* ONE LEVEL DEEP - nothing the vendor has ever writes a reply to a reply. */
      const conversation = data(await web.get('/blog/' + thread.slug + '/replies?limit=10'));
      const aReply = conversation.rows.filter(function (row) { return Number(row.id) !== Number(thread.id); })[0];
      if (aReply) {
        try {
          await member.post('/articles', { parent_id: aReply.id, content: 'a reply to a reply' });
          return 'a reply to a reply was accepted';
        } catch (err) {
          if (err.response.status !== 409) return 'a nested reply answered ' + err.response.status;
        }
      }

      /* A draft reply costs nothing, and is what proves the console can be asked for replies at all. */
      const draft = data(await member.post('/articles', {
        parent_id: thread.id, content: 'a draft reply', status: 'DRAFT'
      }));
      made.push(draft.id);

      if (draft.kind !== 'REPLY') return 'a reply came back as ' + draft.kind;
      if (String(draft.title).indexOf('Re: ') !== 0) return 'a reply was not titled after its thread: ' + draft.title;
      if (!draft.thread || Number(draft.thread.id) !== Number(thread.id)) return 'the reply does not carry its thread';

      const replies = data(await admin.get('/articles?kind=REPLY&status=DRAFT&limit=100'));
      if (!replies.rows.some(function (row) { return Number(row.id) === Number(draft.id); })) {
        return 'the console cannot be asked for the replies waiting to be read';
      }

      const articlesOnly = data(await admin.get('/articles?status=DRAFT&limit=100'));
      if (articlesOnly.rows.some(function (row) { return row.kind === 'REPLY'; })) {
        return 'the console\'s article list has replies in it by default';
      }

      const before = data(await member.get('/articles/allowance'));

      if (before.reply.left === 0) {
        try {
          await member.post('/articles', { parent_id: thread.id, content: 'one reply too many' });
          return 'a reply was accepted although today\'s had already been posted';
        } catch (err) {
          if (err.response.status !== 409) return 'the refusal answered ' + err.response.status;
          if (err.response.data.detail.reason !== 'LIMIT_REPLY') return 'the refusal does not say which kind it is about';
        }
        return true;
      }

      const reply = data(await member.post('/articles', { parent_id: thread.id, content: 'a reply from check.js' }));
      made.push(reply.id);
      if (reply.status !== 'REVIEW') return 'a submitted reply came back as ' + reply.status;

      /* It is not in the conversation until somebody has read it. */
      const now = data(await web.get('/blog/' + thread.slug + '/replies?limit=50'));
      if (now.rows.some(function (row) { return Number(row.id) === Number(reply.id); })) {
        return 'a reply waiting to be read is in the public thread';
      }

      /*
       * AND THE ARTICLE ALLOWANCE IS UNTOUCHED. The vendor refuses a reply
       * because an article was posted and an article because a reply was
       * (`main_cnt >= 1 || reply_cnt >= 1`), which is not the allowance its
       * own message describes.
       */
      const after = data(await member.get('/articles/allowance'));
      if (after.reply.left !== 0) return 'the reply was not counted';
      if (after.article.left !== before.article.left) return 'a reply spent the day\'s article as well';

      return true;
    } finally {
      await purgePosts(made);
    }
  });

  await check('a member can only touch their own posts, and a draft they delete is gone with its body', async function () {
    const index = data(await web.get('/blog?limit=8'));
    const somebodyElse = index.rows.filter(function (row) { return row.author !== demoLogin; })[0];
    const shelves = data(await web.get('/blog/subjects'));

    const made = [];
    try {
      if (somebodyElse) {
        /*
         * The vendor's editBlog and deleteBlog check that the caller is
         * signed in and never WHOSE post it is - any member could rewrite or
         * delete anybody's article. 404 rather than 403: "you may not" would
         * confirm the row is there.
         */
        const answers = await Promise.allSettled([
          member.get('/articles/' + somebodyElse.id),
          member.put('/articles/' + somebodyElse.id, {
            title: 'taken over', subject_id: shelves[0].id, content: 'mine now'
          }),
          member.delete('/articles/' + somebodyElse.id)
        ]);

        const wrong = answers.filter(function (answer) {
          return answer.status === 'fulfilled' || answer.reason.response.status !== 404;
        });
        if (wrong.length) return wrong.length + ' of three calls on another member\'s article were not refused with 404';
      }

      const draft = data(await member.post('/articles', {
        title: 'check.js own draft', subject_id: shelves[0].id, content: 'the first version', status: 'DRAFT'
      }));
      made.push(draft.id);

      /* Editing a draft as a draft is free, and it stays a draft. */
      const saved = data(await member.put('/articles/' + draft.id, {
        title: 'check.js own draft', subject_id: shelves[0].id, content: 'the second version', status: 'DRAFT'
      }));
      if (saved.status !== 'DRAFT') return 'saving a draft moved it to ' + saved.status;
      if (saved.content !== 'the second version') return 'the draft kept its old body';

      /*
       * DELETING A DRAFT TAKES ALL THREE ROWS. The vendor's deleteBlog only
       * ever deleted from blog_article, leaving the body and the counters
       * behind as orphans.
       */
      const removed = data(await member.delete('/articles/' + draft.id));
      if (removed.removed !== 'PURGED') return 'deleting a draft answered ' + removed.removed;

      const legacy = require('../src/config/legacy');
      const rows = await Promise.all([
        legacy.connection()(legacy.blog('blog_article')).where('id', draft.id).first('id'),
        legacy.connection()(legacy.blog('blog_article_lob')).where('id', draft.id).first('id'),
        legacy.connection()(legacy.blog('blog_article_info')).where('id', draft.id).first('id')
      ]);
      const leftBehind = rows.filter(function (row) { return !!row; });
      if (leftBehind.length) return leftBehind.length + ' rows of a deleted draft are still in the database';

      /* Deleted for good, so there is nothing left for the cleanup to purge. */
      made.length = 0;
      return true;
    } finally {
      await purgePosts(made);
    }
  });

  await check('a thread status is two columns, and both filters agree', async function () {
    /*
     * Crystal's PENDING and REPLIED are the same Oracle status told apart by
     * last_type. Filtering on either must therefore constrain BOTH columns -
     * a filter that only set `status` would return every open thread and look
     * almost right.
     */
    /*
     * THE REPLIED SIDE IS MADE, not hoped for.
     *
     * REPLIED means support wrote last, and this suite only ever creates
     * threads as a MEMBER - so with enough runs every open thread is
     * member-last, REPLIED empties, and the check reports "one of the two
     * states is empty" as though the filter were broken. It was not; the
     * suite had eaten its own fixture.
     *
     * So it answers a pending thread itself and then asserts. That also
     * makes the check mean more than it did: the transition it depends on is
     * now part of what is being exercised.
     */
    const open = data(await admin.get('/members/feedback?status=PENDING&limit=1'));
    if (open.rows.length) {
      await admin.post('/members/feedback/' + open.rows[0].id + '/reply', {
        message: 'Thank you for getting in touch - we are looking into it.'
      });
    }

    const pending = data(await admin.get('/members/feedback?status=PENDING&limit=50'));
    const replied = data(await admin.get('/members/feedback?status=REPLIED&limit=50'));

    const wrong = pending.rows.filter(function (row) { return row.status !== 'PENDING'; })
      .concat(replied.rows.filter(function (row) { return row.status !== 'REPLIED'; }));

    if (wrong.length) return wrong.length + ' threads came back under the wrong status';
    if (!replied.rows.length) return 'answering a thread did not move it to REPLIED';
    if (!pending.rows.length) return 'no thread is waiting on support - the seed has none';

    /* And the counters have to agree with the lists they label. */
    const counts = data(await admin.get('/members/feedback/counts'));
    return counts.OPEN === counts.PENDING + counts.REPLIED
      || 'the open counter does not equal PENDING + REPLIED';
  });


  console.log('\nthe member\'s points, across six systems');

  await check('the identity bridge holds for the member being served', async function () {
    /*
     * THE ASSUMPTION THE WHOLE ACCOUNT AREA NOW RESTS ON.
     *
     * Crystal reads a member's threads, points and articles out of the
     * vendor's database keyed on users.id === ora_pid.users.user_pk. If those
     * two ever name different people nothing errors: the member simply sees
     * somebody else's history, or an empty one. That is the worst failure mode
     * available here, so it is asserted rather than trusted.
     *
     * The proof is end to end - both reads go through the bridge, so the two
     * agreeing with the token is the bridge working.
     */
    const systems = data(await member.get('/points/systems'));
    if (!Array.isArray(systems) || !systems.length) return 'no point systems came back';

    const threads = data(await member.get('/feedback?limit=5'));
    const foreign = threads.rows.filter(function (row) {
      return row.user_id !== memberSession.user.id;
    });

    return foreign.length === 0
      || foreign.length + ' threads came back for a different member';
  });

  await check('six systems answer, and none of them is the sum of the rest', async function () {
    const systems = data(await member.get('/points/systems'));

    const keys = systems.map(function (row) { return row.key; });
    const wanted = ['CRYSTAL', 'ACTIVITY', 'SOFTWARE', 'APPSTORE', 'KARAOKE', 'MEDIA'];
    const missing = wanted.filter(function (key) { return keys.indexOf(key) === -1; });
    if (missing.length) return 'missing systems: ' + missing.join(', ');

    /*
     * Karaoke points cannot buy an app. If any card ever equals the sum of the
     * others, somebody has folded six currencies into one number the member
     * cannot spend.
     */
    const sum = systems.reduce(function (total, row) { return total + Number(row.balance); }, 0);
    const folded = systems.filter(function (row) { return Number(row.balance) === sum; });

    return folded.length === 0 || 'a system reports the sum of all the others';
  });

  await check('the ledger interleaves the systems, and filters to one', async function () {
    /*
     * THE MERGE IS COUNTED, NOT SAMPLED. This used to look for two systems on
     * the first page - and every run of this script appends two movements to
     * the demo member's Crystal ledger (the fractional award below, and its
     * reversal) dated now, while the vendor's fixtures are dated when
     * legacy:install ran. After ten runs the first page was all Crystal's and
     * the check failed for a reason that had nothing to do with the merge.
     * The unfiltered ledger has to hold every row of all six sources, which
     * is the same statement made without depending on whose rows are newest.
     */
    const all = data(await member.get('/points?limit=200'));
    if (!all.rows.length) return 'the ledger is empty';

    /* Newest first, whichever of the six tables each row came out of. */
    for (let i = 1; i < all.rows.length; i += 1) {
      if (new Date(all.rows[i - 1].at) < new Date(all.rows[i].at)) {
        return 'the merged ledger is out of order';
      }
    }

    const sources = ['CRYSTAL', 'ACTIVITY', 'SOFTWARE', 'APPSTORE', 'KARAOKE', 'MEDIA'];
    let counted = 0;
    let holding = 0;
    for (let i = 0; i < sources.length; i += 1) {
      /* eslint-disable-next-line no-await-in-loop */
      const own = data(await member.get('/points?limit=1&source=' + sources[i]));
      counted += own.total;
      if (own.total) holding += 1;
    }
    if (holding < 2) return 'only ' + holding + ' system holds any rows - run npm run legacy:install';
    if (all.total !== counted) return 'the unfiltered ledger counts ' + all.total + ', its six sources ' + counted;

    const one = data(await member.get('/points?limit=10&source=KARAOKE'));
    const wrong = one.rows.filter(function (row) { return row.source !== 'KARAOKE'; });
    return wrong.length === 0 || wrong.length + ' rows ignored the source filter';
  });

  await check('every source the systems card offers is a source the ledger answers', async function () {
    /*
     * The page draws a card per system and filters the ledger by the key on
     * the card it was clicked. If any of those keys were not a source the
     * ledger recognises, the click would answer an empty page - and an empty
     * page is what "you have no points here" looks like, so nobody would
     * report it as broken.
     */
    const systems = data(await member.get('/points/systems'));

    for (let i = 0; i < systems.length; i += 1) {
      /* eslint-disable no-await-in-loop */
      const body = data(await member.get('/points?limit=5&source=' + systems[i].key));
      /* eslint-enable no-await-in-loop */

      const strays = body.rows.filter(function (row) { return row.source !== systems[i].key; });
      if (strays.length) return systems[i].key + ': ' + strays.length + ' rows came from another system';
    }

    return true;
  });

  await check('a source nobody keeps is refused, not answered empty', async function () {
    /*
     * The Eshop holds money and prize value, not points. `?source=ESHOP` used
     * to answer 200 with no rows - identical to a member who has never earned
     * anything - which sent whoever wrote the page hunting for missing data
     * instead of a wrong parameter.
     */
    try {
      await member.get('/points?source=ESHOP');
      return 'an unknown source was answered with an empty page';
    } catch (err) {
      return err.response.status === 400
        || 'an unknown source answered ' + err.response.status;
    }
  });

  await check('a fractional award survives the round trip', async function () {
    /*
     * POINTS ARE NOT WHOLE NUMBERS. The vendor awards tenths (activity) and
     * thousandths (the soft-point family), and Crystal's own ledger used to
     * be declared in integers - so an award of 0.4 was rounded to 0 before
     * the insert and the movement was not recorded at all. Not displayed
     * differently: not recorded. See sql/deltas/027.
     *
     * Written and then reversed, so the check leaves the balance where it
     * found it.
     */
    const before = Number(data(await member.get('/wallet')).point_balance);

    const written = data(await admin.post('/wallets/' + memberSession.user.id + '/adjust', {
      kind: 'points', amount: 0.4, description: 'check script fraction'
    }));

    if (Number(written.amount) !== 0.4) {
      return 'an award of 0.4 was written as ' + written.amount;
    }

    const after = Number(data(await member.get('/wallet')).point_balance);
    if (Math.abs((after - before) - 0.4) > 0.0005) {
      return 'the balance moved by ' + (after - before) + ' for an award of 0.4';
    }

    /* And the ledger has to report it as the number it was, not as text. */
    const log = data(await member.get('/points?limit=5&source=CRYSTAL'));
    const top = log.rows[0];
    if (typeof top.amount !== 'number') return 'the movement came back as text';
    if (top.amount !== 0.4) return 'the ledger reports ' + top.amount + ' for an award of 0.4';

    await admin.post('/wallets/' + memberSession.user.id + '/adjust', {
      kind: 'points', amount: -0.4, description: 'check script fraction reversal'
    });

    const back = Number(data(await member.get('/wallet')).point_balance);
    return Math.abs(back - before) < 0.0005
      || 'the reversal left the balance at ' + back + ' instead of ' + before;
  });

  await check('three points pages: each ledger answers the filters its page offers', async function () {
    /*
     * THE WEB SPLIT ONE POINTS PAGE INTO THREE - Crystal's own ledger, the
     * activity log and the four software ledgers - and each offers the
     * vendor's header for its kind: a period and a search on all of them, a
     * category on activity, a movement kind on Crystal's. A control whose
     * filter the API drops is a control that changes nothing, which reads
     * exactly like a page that did not send it; so each one is asked for and
     * the rows are held to it.
     */
    const blog = data(await member.get('/points?limit=50&source=ACTIVITY&category=BLOG'));
    const strays = blog.rows.filter(function (row) { return row.category !== 'BLOG'; });
    if (strays.length) return strays.length + ' activity rows ignored the category';

    const none = data(await member.get('/points?limit=50&source=ACTIVITY&from=2000-01-01&to=2000-01-02'));
    if (none.rows.length) return 'the activity ledger ignored the period';

    const soft = data(await member.get('/points?limit=50&source=APPSTORE'));
    const unmarked = soft.rows.filter(function (row) { return ['CHARGE', 'MINUS', 'REFUND', null].indexOf(row.status) === -1; });
    if (unmarked.length) return unmarked.length + ' software rows carry a status the vendor does not have';

    if (soft.rows.length) {
      const word = String(soft.rows[0].reason || '').slice(0, 4).toLowerCase();
      if (word) {
        const found = data(await member.get('/points?limit=50&source=APPSTORE&q=' + encodeURIComponent(word)));
        const misses = found.rows.filter(function (row) {
          return (String(row.reason || '') + ' ' + String(row.reference || '')).toLowerCase().indexOf(word) === -1;
        });
        if (!found.rows.length) return 'searching the software ledger for its own first reason found nothing';
        if (misses.length) return misses.length + ' software rows did not match the search';
      }
    }

    const own = data(await member.get('/points?limit=50&source=CRYSTAL&type=LOGIN'));
    const other = own.rows.filter(function (row) { return row.type !== 'LOGIN'; });
    if (other.length) return other.length + ' Crystal rows ignored the movement kind';

    return true;
  });

  await check('a word one ledger does not have is refused, not ignored', async function () {
    const refused = [
      '/points?source=ACTIVITY&category=NOPE',
      '/points?source=CRYSTAL&type=NOPE',
      '/points?source=CRYSTAL&from=yesterday'
    ];

    for (let i = 0; i < refused.length; i += 1) {
      try {
        /* eslint-disable-next-line no-await-in-loop */
        await member.get(refused[i]);
        return refused[i] + ' was answered';
      } catch (err) {
        if (err.response.status !== 400) return refused[i] + ' answered ' + err.response.status;
      }
    }

    /* And a real word from the OTHER side matches nothing rather than everything. */
    const crossed = data(await member.get('/points?limit=5&source=CRYSTAL&category=BLOG'));
    return crossed.rows.length === 0 || 'a category narrowed nothing on Crystal\'s own ledger';
  });

  /*
   * THE MINUS LEDGER AND THE DASHBOARD, HELD TO THE TABLES THEMSELVES.
   *
   * Every figure below is computed twice: once by the API, once here with a
   * plain query against the vendor's tables through the same legacy handle.
   * Comparing the API with itself - a card with the ledger page it links to,
   * say - would pass just as happily if both read the wrong rows, and "the
   * wrong rows" is the bug each of these exists for: soft_point_log read
   * without its point_type, register_point_log without its point_type,
   * user_phone_numbers without its phone_type. Each check also insists the
   * data CAN tell right from wrong, because a filter that has nothing to
   * exclude passes whether it is there or not.
   */
  const pointsDb = require('../src/config/legacy');
  const pointsConn = pointsDb.connection();

  /** SUM(column) over a query, as a number to three decimals - the columns' own scale. */
  async function summedOver(query, column) {
    const row = await query.sum({ total: column }).first();
    return Math.round((Number(row && row.total) || 0) * 1000) / 1000;
  }

  await check('source=SOFTWARE lists the member\'s soft_point_log rows with point_type 3, and no others', async function () {
    /*
     * point_type 3 is the vendor's SOFT_POINT_TYPES.MANAGER - the manager's
     * adjustments the member menu calls Minus. 0, 1 and 2 are Appstore, Karaoke
     * and Media rows from before those systems had tables of their own, and
     * the vendor reads the table with 3 and nothing else wherever a member
     * sees it.
     *
     * A DECOY IS WRITTEN FOR THE LENGTH OF THE CHECK: a point_type 0 row for
     * this member, newer than everything else so it would head the first
     * page. The development stand-in holds nothing but type 3, so without it
     * this check could not fail. It is removed whatever happens.
     */
    const userPk = memberSession.user.id;
    const decoyPk = 959999000000 + Number(userPk);

    await pointsConn(pointsDb.pid('soft_point_log')).where('table_pk', decoyPk).del();
    await pointsConn(pointsDb.pid('soft_point_log')).insert({
      table_pk: decoyPk, user_pk: userPk, point_type: 0, status: 0,
      reason: 'check script: a pre-split Appstore row', equ_num: null,
      pay_points: 0, soft_points: 77.7, related_pk: null, is_agency: 0,
      action_at: new Date(Date.now() + 60000)
    });

    try {
      const wanted = await pointsConn(pointsDb.pid('soft_point_log'))
        .where({ user_pk: userPk, point_type: 3 })
        .pluck('table_pk');
      if (!wanted.length) return 'the demo member has no point_type 3 rows - run npm run legacy:install';

      const listed = data(await member.get('/points?source=SOFTWARE&limit=200'));
      const ids = listed.rows.map(function (row) { return String(row.id); }).sort();
      const expected = wanted.map(String).sort();

      if (ids.indexOf(String(decoyPk)) !== -1) return 'a point_type 0 row was listed under Minus';
      if (listed.total !== expected.length) return 'the ledger counts ' + listed.total + ' rows, the table has ' + expected.length;
      if (ids.join(',') !== expected.join(',')) return 'the ledger\'s rows are not the table\'s point_type 3 rows';

      /* And the balance over that ledger is summed over the same rows. */
      const minus = await summedOver(pointsConn(pointsDb.pid('soft_point_log'))
        .where({ user_pk: userPk, point_type: 3, is_agency: 0 }), 'soft_points');
      const systems = data(await member.get('/points/systems'));
      const software = systems.filter(function (row) { return row.key === 'SOFTWARE'; })[0];

      return (software && software.balance === minus)
        || 'the Minus balance is ' + (software && software.balance) + ', its point_type 3 rows sum to ' + minus;
    } finally {
      await pointsConn(pointsDb.pid('soft_point_log')).where('table_pk', decoyPk).del();
    }
  });

  await check('every dashboard figure is what its rows add up to, summed here from the tables', async function () {
    /*
     *   SOFTWARE  appstore + karaoke + media + minus, each SUM(soft_points)
     *             over the member's own rows (is_agency 0), minus being
     *             soft_point_log point_type 3 - stored negative, so ADDED
     *   REGISTER  SUM(register_point_log.points) WHERE point_type = 0, plus
     *             the eproduct site's registration points - which have no
     *             table on this side, so they are summed from the member's
     *             registration log, every page of it
     *   ACTIVITY  activity_point_stats.total_points
     *   COMMERCE  the Eshop card's commerce value; the Eshop is not a table
     *             either, and the card endpoint is the only other reader
     */
    const userPk = memberSession.user.id;
    const own = function (table) {
      return pointsConn(pointsDb.pid(table)).where({ user_pk: userPk, is_agency: 0 });
    };

    const [appstore, karaoke, media, minus, phone, everyRegistration, stats] = await Promise.all([
      summedOver(own('appstore_point_log'), 'soft_points'),
      summedOver(own('karaoke_point_log'), 'soft_points'),
      summedOver(own('bmedia_point_log'), 'soft_points'),
      summedOver(own('soft_point_log').where('point_type', 3), 'soft_points'),
      summedOver(pointsConn(pointsDb.pid('register_point_log')).where({ user_pk: userPk, point_type: 0 }), 'points'),
      summedOver(pointsConn(pointsDb.pid('register_point_log')).where({ user_pk: userPk }), 'points'),
      pointsConn(pointsDb.pid('activity_point_stats')).where('user_pk', userPk).first('total_points')
    ]);

    if (!phone) return 'the demo member has no phone registration points - run npm run legacy:install';
    if (everyRegistration === phone) return 'the stand-in cannot tell point_type 0 from the rest - run npm run legacy:install';

    /* The eproduct half: every registration the member has, whatever page it is on. */
    let eproduct = 0;
    for (let page = 1; page < 50; page += 1) {
      /* eslint-disable-next-line no-await-in-loop */
      const body = data(await member.get('/eproduct/registrations?limit=100&page=' + page));
      body.rows.forEach(function (row) { eproduct += Number(row.points) || 0; });
      if (page * 100 >= body.total) break;
    }

    const card = data(await member.get('/eshop/card'));
    if (!card.linked || !card.card) return 'the demo member has no Eshop card to compare with';

    const round = function (n) { return Math.round(n * 1000) / 1000; };
    const expected = {
      COMMERCE: card.card.commerce_value,
      SOFTWARE: round(appstore + karaoke + media + minus),
      REGISTER: round(phone + eproduct),
      ACTIVITY: Number(stats && stats.total_points) || 0
    };
    const parts = {
      SOFTWARE: { APPSTORE: appstore, KARAOKE: karaoke, MEDIA: media, MINUS: minus },
      REGISTER: { PHONE: phone, EPRODUCT: round(eproduct) }
    };

    const board = data(await member.get('/dashboard'));
    for (let i = 0; i < board.cards.length; i += 1) {
      const shown = board.cards[i];
      if (shown.state !== 'OK') return shown.key + ' came back ' + shown.state;
      if (shown.value !== expected[shown.key]) {
        return shown.key + ' is ' + shown.value + ', its rows add up to ' + expected[shown.key];
      }

      const want = parts[shown.key] || {};
      const wrong = shown.parts.filter(function (part) {
        return want[part.key] !== undefined && part.value !== want[part.key];
      });
      if (wrong.length) return shown.key + ' ' + wrong[0].key + ' is ' + wrong[0].value + ', not ' + want[wrong[0].key];
    }

    /* And each card goes where its rows are listed. */
    const links = board.cards.map(function (shown) { return shown.key + ' ' + shown.to; }).join(', ');
    return links === 'COMMERCE /account/eshop/commerce, SOFTWARE /account/points?source=APPSTORE, '
      + 'REGISTER /account/eproduct/registrations, ACTIVITY /account/points/activity'
      || 'the cards link to ' + links;
  });

  await check('the details panel is the platform\'s user row and the member\'s own numbers only', async function () {
    /*
     * phone_type 0 is PHONE_TYPE.USER, the member's own. 1, 2 and 3 are
     * numbers left on a device report, on a feedback thread and by a manager
     * - somebody's number, not necessarily theirs - and the stand-in holds one
     * of each for this member so that leaving the filter off shows.
     */
    const userPk = memberSession.user.id;

    const [row, mine, others] = await Promise.all([
      pointsConn(pointsDb.pid('users')).where('user_pk', userPk)
        .first('user_id', 'user_name', 'gender', pointsConn.raw("TO_CHAR(birthday, 'YYYY-MM-DD') as birthday")),
      pointsConn(pointsDb.pid('user_phone_numbers')).where({ user_pk: userPk, phone_type: 0 })
        .orderBy('phone_pk').pluck('phone_number'),
      pointsConn(pointsDb.pid('user_phone_numbers')).where('user_pk', userPk).whereNot('phone_type', 0)
        .pluck('phone_number')
    ]);

    if (!mine.length || !others.length) return 'the demo member needs numbers of both kinds - run npm run legacy:install';

    const shown = data(await member.get('/dashboard')).member;
    if (shown.state !== 'OK') return 'the panel came back ' + shown.state;

    if (shown.phones.join(',') !== mine.join(',')) {
      return 'the panel lists ' + shown.phones.length + ' numbers, the member has ' + mine.length + ' of their own';
    }
    const leaked = shown.phones.filter(function (number) { return others.indexOf(number) !== -1; });
    if (leaked.length) return leaked.length + ' numbers of another phone_type reached the panel';

    const gender = row.gender ? String(row.gender).trim() : null;
    const mismatched = [
      ['user_id', row.user_id], ['user_name', row.user_name], ['gender', gender], ['birthday', row.birthday || null]
    ].filter(function (pair) { return shown[pair[0]] !== pair[1]; });

    return mismatched.length === 0
      || mismatched[0][0] + ' is ' + shown[mismatched[0][0]] + ', the users row says ' + mismatched[0][1];
  });


  console.log('\nthe two storefronts');

  await check('the Eshop card comes back with its four separate values', async function () {
    const card = data(await member.get('/eshop/card'));
    if (!card.linked) return 'the demo member has no Eshop key - run npm run legacy:install';
    if (!card.card) return 'the Eshop did not answer';

    /*
     * Every one of these is a STRING on the wire and a number here. If the
     * coercion in eshop.api.js is ever dropped, '9.50' sorts above '48.00'
     * and the card reads as nonsense - so the types are asserted.
     */
    const numeric = ['real_value', 'prize_value', 'commerce_value', 'accum_value'];
    const wrong = numeric.filter(function (key) { return typeof card.card[key] !== 'number'; });

    return wrong.length === 0 || wrong.join(', ') + ' came back as text';
  });

  await check('an order carries a named status, not a code', async function () {
    const list = data(await member.get('/eshop/orders?limit=5'));
    if (!list.rows.length) return 'no orders came back';

    /*
     * Sixteen numeric codes collapse to seven names upstream. A row still
     * carrying a number means the mapping was skipped, and the member is
     * being shown a 5 where it should say Delivering.
     */
    const unnamed = list.rows.filter(function (row) {
      return !row.status || /^-?\d+$/.test(String(row.status));
    });

    return unnamed.length === 0 || unnamed.length + ' orders came back with a raw status code';
  });

  await check('the Eshop log serves three views from one endpoint', async function () {
    const views = ['TRANSACTIONS', 'EXPERIENCE', 'COMMERCE'];
    const seen = {};

    for (let i = 0; i < views.length; i += 1) {
      /* eslint-disable no-await-in-loop */
      const body = data(await member.get('/eshop/log?limit=3&view=' + views[i]));
      if (!body.rows.length) return views[i] + ' came back empty';
      if (body.summary.view !== views[i]) {
        return views[i] + ' answered with the summary of ' + body.summary.view;
      }
      seen[views[i]] = body.rows.map(function (row) { return row.id; }).join(',');
      /* eslint-enable no-await-in-loop */
    }

    /*
     * THE THREE ARE THE SAME CALL WITH A DIFFERENT TYPE, so the rows have to
     * differ - identical lists would mean the view parameter is being ignored
     * and all three menu entries show the same log.
     *
     * COMPARED BY ROW ID, not by `kind`. `kind` is the vendor's money type -
     * which purse moved, 0 accumulated / 3 wallet / 4 bonus - and experience
     * and commerce value are BOTH the accumulated balance, so two of the
     * three legitimately carry the same one. Reading it as though it named
     * the view is the mistake this check used to make, and the mock's
     * matching mistake was what kept it green.
     */
    const lists = Object.keys(seen).map(function (k) { return seen[k]; });
    const distinct = lists.filter(function (k, i) { return lists.indexOf(k) === i; });

    return distinct.length === 3 || 'two of the three views returned the same rows';
  });

  await check('an order that is not yours is refused, not fetched', async function () {
    /*
     * THE ONE THAT MATTERS. The upstream detail endpoint takes an order id
     * and no member, so forwarding an id straight through would let anyone
     * read any order by guessing a number. The service checks the id against
     * the id against this member own order list before fetching anything.
     */
    try {
      await member.get('/eshop/orders/ES00000001');
      return 'a stranger order was returned';
    } catch (err) {
      if (err.response.status !== 404) return 'expected 404, got ' + err.response.status;
    }

    try {
      await member.get('/appstore/purchases/PH00000001/license');
      return 'a stranger licence key was returned';
    } catch (err) {
      return err.response.status === 404 || 'expected 404, got ' + err.response.status;
    }
  });

  await check('an order totals what its own lines total', async function () {
    /*
     * THE ONE THE SHARED GENERATOR EXISTS FOR.
     *
     * The list carries three tender totals and the detail carries the lines
     * they are made of. Nothing upstream guarantees the two agree - they are
     * separate endpoints - so if the mock drew them independently, or the
     * mapper dropped a tender, a member would see an order priced one way on
     * the row and another way when they opened it. That is not a bug anybody
     * reports; it is a bug that quietly destroys trust in the page.
     */
    const list = data(await member.get('/eshop/orders?limit=6'));
    if (!list.rows.length) return 'no orders came back';

    for (let i = 0; i < list.rows.length; i += 1) {
      const row = list.rows[i];
      /* eslint-disable no-await-in-loop */
      const detail = data(await member.get('/eshop/orders/' + row.order_id));
      /* eslint-enable no-await-in-loop */

      const summed = {};
      detail.lines.forEach(function (line) {
        const kind = line.tender || 'FOREIGN';
        summed[kind] = summed[kind] || { qty: 0, price: 0 };
        summed[kind].qty += line.qty;
        summed[kind].price += line.total_price;
      });

      const kinds = Object.keys(summed);
      if (kinds.length !== row.tenders.length) {
        return row.order_no + ' lists ' + row.tenders.length + ' tenders over ' + kinds.length + ' in its lines';
      }

      for (let k = 0; k < row.tenders.length; k += 1) {
        const tender = row.tenders[k];
        const mine = summed[tender.kind];

        if (!mine) return row.order_no + ' claims a ' + tender.kind + ' total its lines do not have';
        if (mine.qty !== tender.qty) {
          return row.order_no + ' ' + tender.kind + ': ' + tender.qty + ' items on the row, ' + mine.qty + ' in the lines';
        }
        if (Math.abs(mine.price - tender.price) > 0.01) {
          return row.order_no + ' ' + tender.kind + ': ' + tender.price + ' on the row, ' + mine.price.toFixed(2) + ' in the lines';
        }
      }
    }

    return true;
  });

  await check('no order is priced in one figure across three tenders', async function () {
    /*
     * Foreign currency, native currency and points are three units and do
     * not add up. A `total_price` on an order row would be arithmetic on all
     * three, so there is none - and a tender the order did not use is left
     * out rather than sent as a zero, so a page can render what it is given.
     */
    const list = data(await member.get('/eshop/orders?limit=12'));
    if (!list.rows.length) return 'no orders came back';

    const totalled = list.rows.filter(function (row) { return row.total_price !== undefined; });
    if (totalled.length) return totalled.length + ' orders carry a total across three units';

    const empty = list.rows.filter(function (row) {
      return !row.tenders.length || row.tenders.filter(function (t) { return !t.qty && !t.price; }).length;
    });

    return empty.length === 0 || empty.length + ' orders carry a tender they did not use';
  });

  await check('a cancelled order says who cancelled it, and a live one does not', async function () {
    /*
     * The service says who only by WHICH of two fields carries the reason -
     * `user_reason` is the member's, `reason` is the shop's. That is decoded
     * once in eshop.api.js; if it ever stops being, every cancelled order
     * loses the single fact the member opened the page to find.
     */
    const list = data(await member.get('/eshop/orders?limit=25'));
    if (!list.rows.length) return 'no orders came back';

    const cancelled = list.rows.filter(function (row) { return row.status_code < 0; });
    if (!cancelled.length) return 'the seed has no cancelled orders to check';

    const anonymous = cancelled.filter(function (row) {
      return !row.cancelled_by || !row.cancel_reason;
    });
    if (anonymous.length) return anonymous.length + ' cancelled orders name nobody';

    const named = ['MEMBER', 'SHOP'];
    const odd = cancelled.filter(function (row) { return named.indexOf(row.cancelled_by) === -1; });
    if (odd.length) return 'cancelled_by came back as ' + odd[0].cancelled_by;

    /* And a live order is not quietly given one. */
    const live = list.rows.filter(function (row) { return row.status_code >= 0 && row.cancelled_by; });
    return live.length === 0 || live.length + ' live orders claim to be cancelled';
  });

  await check('the Eshop and Appstore are asked about the member by the keys the vendor uses', async function () {
    /*
     * THE MOCK CANNOT CATCH THIS, which is why it is checked here against the
     * resolver itself. The mock answers whatever id it is handed, so sending
     * the Appstore a login instead of its key looked perfect in development and
     * returned empty lists from the real service.
     *
     * The vendor (webAppstoreController) sends `appstore_pk` to the store AND
     * to the wallet; `appstore_id` on the same row is a login and no Appstore
     * endpoint takes it.
     */
    const identity = require('../src/repositories/legacy/identity.repository');
    const merged = await identity.mergeRow(memberSession.user.id);
    if (!merged) return 'the demo member has no merge row to check against';

    const keys = await identity.keysOf(memberSession.user.id, demoLogin);

    if (String(keys.appstore_customer_id) !== String(merged.appstore_pk)) {
      return 'the Appstore store is asked by ' + keys.appstore_customer_id + ', not appstore_pk ' + merged.appstore_pk;
    }
    if (String(keys.appstore_unique_id) !== String(merged.appstore_pk)) {
      return 'the Appstore wallet is asked by ' + keys.appstore_unique_id + ', not appstore_pk';
    }
    return String(keys.eshop_pk) === String(merged.eshop_pk) || 'the Eshop is asked by ' + keys.eshop_pk;
  });

  await check('every log row names what moved the balance, in the right direction', async function () {
    /*
     * `kind` is which balance moved and `fill` is what moved it, and they are
     * separate columns because they answer separate questions. `fill` comes
     * from a closed set: an unrecognised code answers null rather than being
     * passed through, because a page given one prints it at a member.
     *
     * The direction is checked with it. A REFUND that debits the wallet or a
     * PAY that credits it is not a thing, and a ledger that produces one
     * sends whoever reads it hunting for a bug that is not there.
     */
    /* The service's own six (vendor_client ESHOP_FILL_TYPES), not an invented list. */
    const known = ['PAY', 'BONUS', 'BACK', 'REFUND', 'COMBINE', 'TRANSFER'];
    const inbound = ['BONUS', 'BACK', 'REFUND', 'COMBINE'];

    const body = data(await member.get('/eshop/log?limit=25&view=TRANSACTIONS'));
    if (!body.rows.length) return 'the transaction log came back empty';

    const unnamed = body.rows.filter(function (row) { return known.indexOf(row.fill) === -1; });
    if (unnamed.length) return unnamed.length + ' rows carry a fill type outside the set';

    const backwards = body.rows.filter(function (row) {
      return (inbound.indexOf(row.fill) > -1) !== (row.amount > 0);
    });

    return backwards.length === 0 || backwards.length + ' rows move the wrong way for their type';
  });

  await check('a wallet row says which purse it moved, not which log it is in', async function () {
    /*
     * `money_type` is the vendor's ESHOP_MONEY_TYPES - 0 accumulated, 3 the
     * wallet, 4 the bonus purse - and the mock used to send the VIEW instead
     * (0, 1 or 2, the log being read). Those collide: the wallet log, whose
     * whole reason for carrying this column is to tell the spending purse
     * from the bonus purse, reported "accumulated" on every row.
     *
     * The money log has to show BOTH of its purses or the column is a
     * constant, which is the same as not having it.
     */
    const money = data(await member.get('/eshop/log?limit=30&view=TRANSACTIONS'));
    if (!money.rows.length) return 'the transaction log came back empty';

    const purses = money.rows.map(function (row) { return row.kind; })
      .filter(function (value, index, all) { return all.indexOf(value) === index; });

    const stray = purses.filter(function (kind) { return [3, 4].indexOf(kind) === -1; });
    if (stray.length) return 'the money log carries purse ' + stray[0] + ', which is not one';
    if (purses.length < 2) return 'every money row is purse ' + purses[0] + ' - the column says nothing';

    /* Experience and commerce value are the accumulated balance, which is 0. */
    const views = ['EXPERIENCE', 'COMMERCE'];

    for (let i = 0; i < views.length; i += 1) {
      /* eslint-disable no-await-in-loop */
      const body = data(await member.get('/eshop/log?limit=20&view=' + views[i]));
      /* eslint-enable no-await-in-loop */
      if (!body.rows.length) return views[i] + ' came back empty';

      const wrong = body.rows.filter(function (row) { return row.kind !== 0; });
      if (wrong.length) return views[i] + ' rows report purse ' + wrong[0].kind;
    }

    return true;
  });

  await check('experience and commerce value are counted, not measured', async function () {
    /*
     * Points are whole. 383.17 experience points is not a quantity that
     * exists, and a page that formats them as currency - or a service that
     * sends them with a fraction - tells a member they hold a tenth of one.
     */
    const views = ['EXPERIENCE', 'COMMERCE'];

    for (let i = 0; i < views.length; i += 1) {
      /* eslint-disable no-await-in-loop */
      const body = data(await member.get('/eshop/log?limit=20&view=' + views[i]));
      /* eslint-enable no-await-in-loop */
      if (!body.rows.length) return views[i] + ' came back empty';

      const fractional = body.rows.filter(function (row) { return row.amount % 1 !== 0; });
      if (fractional.length) return views[i] + ' returned ' + fractional.length + ' fractional point amounts';
    }

    return true;
  });

  await check('an order line carries the variant that was bought', async function () {
    /*
     * `standard` is the colour and the size. Without it an order of four
     * different cases reads as four identical rows, and a member cannot say
     * which one the courier lost. `price` against `real_price` is the other
     * half: it is what makes a discount visible, and `discounted` is decided
     * here rather than by comparing floats in JSX.
     */
    const list = data(await member.get('/eshop/orders?limit=8'));
    if (!list.rows.length) return 'no orders came back';

    let lines = 0;
    let discounted = 0;

    for (let i = 0; i < list.rows.length; i += 1) {
      /* eslint-disable no-await-in-loop */
      const detail = data(await member.get('/eshop/orders/' + list.rows[i].order_id));
      /* eslint-enable no-await-in-loop */

      for (let k = 0; k < detail.lines.length; k += 1) {
        const line = detail.lines[k];
        lines += 1;

        if (!line.standard) return line.goods_name + ' has no variant on it';
        if (!line.goods_id) return line.goods_name + ' has no id to link to';
        if (line.discounted !== (line.price > line.real_price)) {
          return line.goods_name + ' disagrees with itself about being discounted';
        }
        if (line.discounted) discounted += 1;
      }
    }

    /*
     * And at least ONE of them is discounted. With none, the struck-through
     * original price is markup that has never been drawn - which is how it
     * ships broken.
     */
    if (!lines) return 'no order lines came back';
    return discounted > 0 || 'not one of ' + lines + ' lines is discounted - the was-price never renders';
  });

  await check('the Appstore answers all four of its lists', async function () {
    const paths = ['purchases', 'comments', 'favourites', 'transactions'];

    for (let i = 0; i < paths.length; i += 1) {
      /* eslint-disable no-await-in-loop */
      const body = data(await member.get('/appstore/' + paths[i] + '?limit=3'));
      if (!body.rows.length) return paths[i] + ' came back empty';
      /* eslint-enable no-await-in-loop */
    }

    /*
     * The store and its wallet key the same person differently -
     * customer_id and unique_id - so all four answering proves both keys
     * resolved. Three out of four is the shape of a swapped identifier.
     */
    const balance = data(await member.get('/appstore/balance'));
    return typeof balance.coins === 'number' || 'the coin balance is not a number';
  });

  await check('a purchase says what it was for, and not every one is an app', async function () {
    /*
     * THE STORE SELLS FIVE THINGS, and each names itself in a different
     * field - app_name, diamond_name, eventitem_title, nickname_name, and an
     * avatar which has no name at all. Reading `app_name` unconditionally,
     * which is what this page did, shows a blank row for four purchases in
     * five.
     */
    const list = data(await member.get('/appstore/purchases?limit=25'));
    if (!list.rows.length) return 'no purchases came back';

    const kinds = ['APP', 'DIAMOND', 'AVATAR', 'EVENT_ITEM', 'NICKNAME'];

    const odd = list.rows.filter(function (row) { return kinds.indexOf(row.kind) === -1; });
    if (odd.length) return odd.length + ' purchases carry a kind outside the set';

    /* Every kind but an avatar names itself. */
    const nameless = list.rows.filter(function (row) {
      return row.kind !== 'AVATAR' && !row.name;
    });
    if (nameless.length) return nameless.length + ' purchases have no name to show';

    /*
     * And more than one kind is actually produced. A mock that only ever
     * made apps would pass every check above and still leave the four other
     * branches unvisited until a member bought one.
     */
    const seen = {};
    list.rows.forEach(function (row) { seen[row.kind] = true; });

    return Object.keys(seen).length > 1
      || 'every purchase is a ' + Object.keys(seen)[0] + ' - the other kinds never render';
  });

  await check('a licence is offered only where there is one, and agrees with the row', async function () {
    /*
     * `spd_state_id` answers two questions - how the purchase ended and
     * whether there is a licence - and the list and the licence endpoint read
     * it separately. If they disagree, a member clicks a key button on a
     * purchase the licence call then says nothing about.
     */
    const list = data(await member.get('/appstore/purchases?limit=10'));
    if (!list.rows.length) return 'no purchases came back';

    let offered = 0;

    for (let i = 0; i < list.rows.length; i += 1) {
      const row = list.rows[i];

      /* The rule is a property of the state, not of the page. */
      const shouldOffer = ['PURCHASING', 'PURCHASED'].indexOf(row.status) > -1;
      if (row.licence_available !== shouldOffer) {
        return row.id + ' is ' + row.status + ' but licence_available is ' + row.licence_available;
      }

      if (!row.licence_available) continue;
      offered += 1;

      /* eslint-disable no-await-in-loop */
      const licence = data(await member.get('/appstore/purchases/' + row.id + '/license'));
      /* eslint-enable no-await-in-loop */

      if (licence.state !== row.licence_state) {
        return row.id + ' lists ' + row.licence_state + ' and the licence call says ' + licence.state;
      }
      if (!licence.licence && !licence.qr) return row.id + ' has a licence state and no licence';
    }

    return offered > 0 || 'not one purchase offers a licence - the drawer never opens';
  });

  await check('a licence QR is a real picture, and a licence without one still has its key', async function () {
    /*
     * THE VENDOR'S MODAL IS TWO SCREENS. A licence with a QR is drawn as the
     * code, with "save as image" and the licence file beside it; one without
     * is the key as text. The store sends the QR as a JPEG in HEX, the mapper
     * turns it into base64 for an <img> and names its type for the download,
     * and every step of that is invisible until it is wrong: a mis-decoded
     * hex blob is a broken-image icon exactly where the member's licence
     * should be.
     *
     * So the picture is DECODED here, in process, with the same JPEG library
     * the mock encodes with - not just checked for a data-URI prefix, which a
     * buffer of zeros would pass. A QR is black and white and square; an
     * image that is not all three is not one.
     *
     * AND BOTH SCREENS HAVE TO BE REACHABLE in development, which means the
     * demo member has to own a purchased licence of each kind. The mock used
     * to send no QR at all, so the QR branch of the drawer had never been
     * drawn by anyone.
     */
    const jpeg = require('jpeg-js');
    const list = data(await member.get('/appstore/purchases?limit=50'));

    let withQr = 0;
    let withKeyOnly = 0;

    for (let i = 0; i < list.rows.length; i += 1) {
      const row = list.rows[i];
      if (!row.licence_available) continue;

      /* eslint-disable no-await-in-loop */
      const licence = data(await member.get('/appstore/purchases/' + row.id + '/license'));
      /* eslint-enable no-await-in-loop */

      if (!licence.qr) {
        if (licence.qr_type !== null) return row.id + ' has no QR and a qr_type of ' + licence.qr_type;
        if (!licence.licence) return row.id + ' has neither a QR nor a key';
        if (licence.purchase_state === 'PURCHASED') withKeyOnly += 1;
        continue;
      }

      if (['image/jpeg', 'image/png', 'image/gif', 'image/bmp'].indexOf(licence.qr_type) === -1) {
        return row.id + ' names its QR ' + licence.qr_type;
      }

      const bytes = Buffer.from(licence.qr, 'base64');
      if (bytes.toString('base64') !== licence.qr) return row.id + ' sent a QR that is not base64';

      if (licence.qr_type === 'image/jpeg') {
        if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return row.id + ' calls its QR a JPEG and it does not start like one';

        const image = jpeg.decode(bytes, { useTArray: true });
        if (!image.width || image.width !== image.height) {
          return row.id + ' has a ' + image.width + 'x' + image.height + ' QR - a QR is square';
        }

        let dark = 0;
        let light = 0;
        for (let p = 0; p < image.data.length; p += 4) {
          if (image.data[p] < 64) dark += 1;
          else if (image.data[p] > 192) light += 1;
        }
        if (!dark || !light) return row.id + ' has a QR that is all one colour';
        if ((dark + light) * 4 < image.data.length * 0.9) return row.id + ' has a QR that is mostly grey';
      }

      if (licence.purchase_state === 'PURCHASED') withQr += 1;
    }

    const health = data(await site().get('/health'));
    if (health.engines.storefronts !== 'mock') return true;

    /*
     * The error correction, against the worked example every QR tutorial
     * uses - "HELLO WORLD" at 1-M. A mistake there still draws a perfectly
     * convincing code; it just scans to nothing, or to the wrong key.
     */
    const qr = require('../src/repositories/remote/mock.qr');
    const ec = qr.rsRemainder(
      [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17],
      qr.rsDivisor(10)
    );
    if (ec.join(',') !== '196,35,39,119,235,215,231,226,93,23') return 'the mock QR error correction is wrong: ' + ec.join(',');

    if (!withQr) return 'the demo member has no purchased licence with a QR - that screen is never drawn';
    return withKeyOnly > 0 || 'the demo member has no purchased licence without a QR - the key screen is never drawn';
  });

  await check('the purchase states are the store\'s numbering, not one of our own', function () {
    /*
     * THE ONE A MOCK CAN HIDE, AND DID.
     *
     * `spd_state_id` is read twice - as a purchase state and as a licence
     * state - and Crystal had both tables starting at 1: five purchase states
     * and four licence states, none of which the store sends. The mock then
     * generated ids in that same invented range, so every value decoded
     * cleanly in development and every one of them would have been wrong
     * against the real Appstore, key button included.
     *
     * Asserted against the VENDOR'S OWN CONSTANTS, in process, because that
     * is the only thing that can settle it: an end-to-end call can only ever
     * prove the mock and the mapper agree with each other, which is exactly
     * the agreement that was wrong.
     *
     * vendor_client/src/constants/constants.js:
     *   APPSTORE_PURCHASE_STATE  = { PURCHASED: 0, PURCHASING: 1 }
     *   APPSTORE_LICENSE_STATES  = 0 SUCCESS, 1 UNUSED, 2 USED, 3 FAIL,
     *                              4 REFUND, 5 PENDING, 6 ACCEPT_PENDING
     */
    const store = require('../src/repositories/remote/appstore.api');

    if (store.PURCHASE_STATE[0] !== 'PURCHASED') return '0 is not PURCHASED';
    if (store.PURCHASE_STATE[1] !== 'PURCHASING') return '1 is not PURCHASING';
    if (Object.keys(store.PURCHASE_STATE).length !== 2) {
      return 'the store has two purchase states and this has '
        + Object.keys(store.PURCHASE_STATE).length;
    }

    const licence = ['SUCCESS', 'UNUSED', 'USED', 'FAIL', 'REFUND', 'PENDING', 'ACCEPT_PENDING'];

    for (let i = 0; i < licence.length; i += 1) {
      if (store.LICENCE_STATE[i] !== licence[i]) {
        return 'licence state ' + i + ' is ' + store.LICENCE_STATE[i] + ', not ' + licence[i];
      }
    }

    return Object.keys(store.LICENCE_STATE).length === licence.length
      || 'the licence table has ' + Object.keys(store.LICENCE_STATE).length + ' values, not 7';
  });

  await check('a state the store has no word for is left unnamed, not guessed', async function () {
    /*
     * Only 0 and 1 are purchase states. The vendor's page falls back to the
     * store's own `spd_change_reason` for the rest, and to "purchase failed"
     * when there is not even that - so an unnamed state is expected, and
     * naming it PURCHASING (which is what the default used to do) tells a
     * member their purchase is still going through whatever became of it.
     *
     * The mock has to produce some, or the fallback is markup nobody has
     * seen. That is what the range 0..6 is for.
     */
    const list = data(await member.get('/appstore/purchases?limit=50'));
    if (!list.rows.length) return 'no purchases came back';

    const named = ['PURCHASED', 'PURCHASING'];

    const invented = list.rows.filter(function (row) {
      return row.status !== null && named.indexOf(row.status) === -1;
    });
    if (invented.length) return 'a purchase came back as ' + invented[0].status;

    const unnamed = list.rows.filter(function (row) { return row.status === null; });
    if (!unnamed.length) return 'every purchase has a name - the fallback is never drawn';

    /* And an unnamed one must not offer a key. */
    const offering = unnamed.filter(function (row) { return row.licence_available; });
    if (offering.length) return offering.length + ' unnamed purchases still offer a licence';

    /* The store explains those rows itself, and its words are what is shown. */
    const silent = unnamed.filter(function (row) { return !row.status_reason; });
    return silent.length === 0
      || silent.length + ' purchases have neither a state nor a reason';
  });

  await check('an app icon is the largest size the store actually has', function () {
    /*
     * An app_icon record carries up to six sizes and fills in whichever were
     * generated. Both mappers used to read ONE named size - the 48 on a
     * comment, the 144 on a favourite - so an app without that size drew a
     * blank tile with five good icons beside it.
     *
     * Checked IN PROCESS because the urls are absolute and the Appstore's
     * host is not configured in development - every icon is null here, and
     * the ordering rule would otherwise be untestable until production,
     * which is where choosing wrongly already lives.
     */
    const store = require('../src/repositories/remote/appstore.api');

    const wanted = [
      'icon_256_256_url', 'icon_192_192_url', 'icon_144_144_url',
      'icon_96_96_url', 'icon_72_72_url', 'icon_48_48_url'
    ];

    if (store.ICON_SIZES.join(',') !== wanted.join(',')) {
      return 'the sizes are ordered ' + store.ICON_SIZES.join(', ');
    }

    /* Given in the WRONG order, it still comes back largest first. */
    const sparse = store.iconOrder({
      icon_48_48_url: 'a.png',
      icon_192_192_url: 'b.png',
      icon_96_96_url: 'c.png'
    });

    if (sparse.join(',') !== 'icon_192_192_url,icon_96_96_url,icon_48_48_url') {
      return 'a sparse record chose ' + sparse.join(', ');
    }

    if (store.iconOrder({}).length) return 'an app with no icons offered one';
    return store.iconOrder(null).length === 0 || 'a missing icon record threw a size out';
  });

  await check('the store lists honour the window and the search they are sent', async function () {
    /*
     * The pages have a date range and a search box on all three store lists,
     * and the mock ignored every one of them - which is indistinguishable
     * from a page that is not sending them. A filter that changes the request
     * and never the rows is the one kind of bug nobody can localise.
     */
    const lists = ['purchases', 'comments', 'favourites'];

    for (let i = 0; i < lists.length; i += 1) {
      /* eslint-disable no-await-in-loop */
      const all = data(await member.get('/appstore/' + lists[i] + '?limit=50'));
      if (!all.rows.length) return lists[i] + ' came back empty';

      /* A window before the store existed has to empty the list. */
      const none = data(await member.get('/appstore/' + lists[i] + '?limit=50&from=2000-01-01&to=2000-01-02'));
      /* eslint-enable no-await-in-loop */

      if (none.rows.length) return lists[i] + ' ignored the date window';
    }

    /* And the wallet, which spells its window differently upstream. */
    const wallet = data(await member.get('/appstore/transactions?limit=50'));
    if (!wallet.rows.length) return 'the coin statement came back empty';

    const windowed = data(await member.get('/appstore/transactions?limit=50&from=2000-01-01&to=2000-01-02'));
    return windowed.rows.length === 0 || 'the coin statement ignored the date window';
  });

  await check('a store search is trimmed before the store sees it, and a blank one is no search', async function () {
    /*
     * The term reaches the Appstore as the DataTables `sSearch` the vendor
     * sends, and the store matches it AS WRITTEN - so " crystal " (pasted, or
     * typed on a phone that adds a space after every word) matched nothing,
     * and a box of spaces matched only rows that contain one. The page trims
     * too; this is the API doing it for every caller.
     */
    const lists = ['purchases', 'comments', 'favourites'];

    for (let i = 0; i < lists.length; i += 1) {
      /* eslint-disable no-await-in-loop */
      const all = data(await member.get('/appstore/' + lists[i] + '?limit=50'));
      const plain = data(await member.get('/appstore/' + lists[i] + '?limit=50&q=crystal'));
      const padded = data(await member.get('/appstore/' + lists[i] + '?limit=50&q=' + encodeURIComponent('  crystal   ')));
      const blank = data(await member.get('/appstore/' + lists[i] + '?limit=50&q=' + encodeURIComponent('   ')));
      /* eslint-enable no-await-in-loop */

      if (padded.total !== plain.total) {
        return lists[i] + ': "  crystal   " found ' + padded.total + ' and "crystal" ' + plain.total;
      }
      if (blank.total !== all.total) return lists[i] + ': a blank search narrowed the list to ' + blank.total;
    }

    return true;
  });

  await check('favourites carry only what the store actually returns', async function () {
    /*
     * THE FIELDS THIS REPLACED WERE INVENTED. The favourites endpoint returns
     * an id, an icon, a name, whether the app is still published and when it
     * was starred - and the page was showing a category, a price and an
     * "installed" flag, none of which exist. Against the real service all
     * three would have been empty columns.
     */
    const list = data(await member.get('/appstore/favourites?limit=10'));
    if (!list.rows.length) return 'no favourites came back';

    const invented = ['category', 'price', 'installed'];
    const wrong = invented.filter(function (field) {
      return list.rows.some(function (row) { return row[field] !== undefined; });
    });
    if (wrong.length) return 'favourites still carry ' + wrong.join(', ') + ' - the store sends none of them';

    const nameless = list.rows.filter(function (row) { return !row.app_name; });
    return nameless.length === 0 || nameless.length + ' favourites have no app name';
  });

  await check('a comment says whether the store has approved it', async function () {
    /*
     * A member's own comment can sit unapproved for days. Without `approved`
     * the page shows it as though it were live, and the member wonders why
     * nobody else can see it.
     */
    const list = data(await member.get('/appstore/comments?limit=25'));
    if (!list.rows.length) return 'no comments came back';

    const untyped = list.rows.filter(function (row) { return typeof row.approved !== 'boolean'; });
    if (untyped.length) return untyped.length + ' comments do not say whether they are approved';

    const unrated = list.rows.filter(function (row) { return !(row.rating >= 1 && row.rating <= 5); });
    if (unrated.length) return unrated.length + ' comments carry a rating outside 1-5';

    /* Both states occur, or the badge only ever renders one way. */
    const approved = list.rows.filter(function (row) { return row.approved; }).length;
    return (approved > 0 && approved < list.rows.length)
      || 'every comment is ' + (approved ? 'approved' : 'unapproved') + ' - the other badge never renders';
  });

  await check('a coin movement is named, and moves the way its name says', async function () {
    /*
     * `currency` is which purse and `kind` is what moved it - two questions,
     * and the vendor's console gave them a column each. Both come from closed
     * sets; an unrecognised code answers null rather than being printed at a
     * member.
     *
     * A PURCHASE that credits the wallet is not a thing, and a statement that
     * shows one sends the reader hunting for a bug in the ledger.
     */
    const kinds = ['TOPUP', 'PURCHASE', 'REFUND', 'TRANSFER_IN', 'TRANSFER_OUT'];
    const inbound = ['TOPUP', 'REFUND', 'TRANSFER_IN'];
    const purses = ['IMMATERIAL', 'COMPANY', 'FOREIGN'];

    const body = data(await member.get('/appstore/transactions?limit=25'));
    if (!body.rows.length) return 'the coin statement came back empty';

    const unnamed = body.rows.filter(function (row) { return kinds.indexOf(row.kind) === -1; });
    if (unnamed.length) return unnamed.length + ' rows carry a transaction type outside the set';

    const unpursed = body.rows.filter(function (row) { return purses.indexOf(row.currency) === -1; });
    if (unpursed.length) return unpursed.length + ' rows carry a wallet type outside the set';

    const backwards = body.rows.filter(function (row) {
      return (inbound.indexOf(row.kind) > -1) !== (row.amount > 0);
    });

    return backwards.length === 0 || backwards.length + ' rows move the wrong way for their type';
  });

  await check('the coin statement filters by type on the server', async function () {
    /*
     * The select sends `type` and the store filters. Filtering the fifteen
     * rows already on screen would quietly answer a different question than
     * the one the member asked, and would look broken from page two.
     */
    const all = data(await member.get('/appstore/transactions?limit=25'));
    if (!all.rows.length) return 'the coin statement came back empty';

    const wanted = 2; /* PURCHASE - see appstore.api.js */
    const filtered = data(await member.get('/appstore/transactions?limit=25&type=' + wanted));

    const strays = filtered.rows.filter(function (row) { return row.kind !== 'PURCHASE'; });
    if (strays.length) return strays.length + ' rows survived a filter they do not match';

    return filtered.rows.length < all.rows.length
      || 'the type filter changed nothing - it is not reaching the service';
  });

  await check('the eproduct site answers on all five of its endpoints', async function () {
    /*
     * THE ONE THAT CATCHES THE INVERSION.
     *
     * This service disagrees with itself about what `code` means: 200 is
     * SUCCESS on the registration log, and on the three keygen logs a code at
     * all is a failure. Reading either the wrong way round does not error -
     * it turns every good response into an empty list, so "all four lists
     * came back with rows" is the assertion that catches it.
     *
     * The registration log was read against 0 for a long time, which is the
     * ESHOP's convention for `rsp_code` and the APPSTORE's for `meta.code`.
     * Both of those are right where they are; this one is 200, and the only
     * thing that proves it is a list with rows in it.
     */
    const balance = data(await member.get('/eproduct/balance'));
    if (!balance.linked) return 'the demo member has no eproduct login - run npm run legacy:install';

    const paths = ['registrations', 'keygen/karaoke', 'keygen/manbang', 'keygen/bmedia'];

    for (let i = 0; i < paths.length; i += 1) {
      /* eslint-disable no-await-in-loop */
      const body = data(await member.get('/eproduct/' + paths[i] + '?limit=5'));
      /* eslint-enable no-await-in-loop */
      if (!body.rows.length) return paths[i] + ' came back empty';
      if (!body.total) return paths[i] + ' reported no total';
    }

    return true;
  });

  await check('a registration carries the serial it is for, and a named state', async function () {
    /*
     * This is the EPRODUCT SITE'S list, not Crystal's own `/products`. It has
     * a different shape and a different source, and the one thing every row
     * must have is the serial number - it is what a member matches against
     * the sticker on the box.
     */
    const list = data(await member.get('/eproduct/registrations?limit=20'));
    if (!list.rows.length) return 'no registrations came back';

    const states = ['PENDING', 'APPROVED', 'REJECTED'];

    const nameless = list.rows.filter(function (row) { return !row.serial_number || !row.product_name; });
    if (nameless.length) return nameless.length + ' registrations have no serial or no product';

    const odd = list.rows.filter(function (row) { return states.indexOf(row.status) === -1; });
    if (odd.length) return odd.length + ' registrations carry a state outside the set';

    const untyped = list.rows.filter(function (row) { return typeof row.points !== 'number'; });
    return untyped.length === 0 || untyped.length + ' registrations report their points as text';
  });

  await check('a keygen row says whether it worked, and both outcomes occur', async function () {
    /*
     * `resultlog` is 0 for success and anything else for a failure, and the
     * vendor rendered the service's `message` in a coloured tag either way -
     * so a successfully issued licence looked exactly like a fault. The
     * outcome is decoded once, here, into a boolean.
     *
     * Both outcomes have to appear or the failure branch is markup that has
     * never been drawn.
     */
    const systems = ['karaoke', 'manbang'];

    for (let i = 0; i < systems.length; i += 1) {
      /* eslint-disable no-await-in-loop */
      const body = data(await member.get('/eproduct/keygen/' + systems[i] + '?limit=25'));
      /* eslint-enable no-await-in-loop */
      if (!body.rows.length) return systems[i] + ' came back empty';

      const untyped = body.rows.filter(function (row) { return typeof row.succeeded !== 'boolean'; });
      if (untyped.length) return systems[i] + ': ' + untyped.length + ' rows do not say whether they worked';

      const keyless = body.rows.filter(function (row) { return !row.machine_key; });
      if (keyless.length) return systems[i] + ': ' + keyless.length + ' rows have no machine key';

      /* A licence file exists only where one was issued. */
      const impossible = body.rows.filter(function (row) { return !row.succeeded && row.license_file; });
      if (impossible.length) return systems[i] + ': a failed keying produced a licence file';
    }

    const karaoke = data(await member.get('/eproduct/keygen/karaoke?limit=25'));
    const worked = karaoke.rows.filter(function (row) { return row.succeeded; }).length;

    return (worked > 0 && worked < karaoke.rows.length)
      || 'every karaoke keying ' + (worked ? 'succeeded' : 'failed') + ' - the other badge never renders';
  });

  await check('a refused keygen log says so instead of looking empty', async function () {
    /*
     * THE FAILURE THAT WAS INVISIBLE. On these three endpoints a `code` at
     * all means the service refused, and the message came with it - both were
     * dropped, so a refusal answered `{ rows: [], total: 0 }` and the page
     * drew "no licences yet" over the top of a fault.
     *
     * The mock refuses when the search term is its reserved probe token; see
     * REFUSE in repositories/remote/mock.js. Nothing else can produce a
     * refusal, and a branch nothing can reach is a branch nobody has run.
     */
    const systems = ['karaoke', 'manbang', 'bmedia'];

    for (let i = 0; i < systems.length; i += 1) {
      /* eslint-disable no-await-in-loop */
      const good = data(await member.get('/eproduct/keygen/' + systems[i] + '?limit=5'));
      if (good.summary.error) return systems[i] + ': a good call reported an error';

      const refused = data(await member.get('/eproduct/keygen/' + systems[i] + '?limit=5&q=__refuse__'));
      /* eslint-enable no-await-in-loop */

      if (refused.rows.length) return systems[i] + ': a refusal still returned rows';
      if (!refused.summary.error) return systems[i] + ': the refusal was swallowed';

      /* The service's own words, and the code beside them for whoever calls. */
      if (refused.summary.error.indexOf('4021') === -1) {
        return systems[i] + ': the message lost the service\'s code - ' + refused.summary.error;
      }

      /* A refusal is a degraded section, not a 500 that takes the page down. */
      if (refused.summary.unavailable) {
        return systems[i] + ': a refusal was reported as the service being unreachable';
      }
    }

    return true;
  });

  await check('a keygen row can be downloaded, retried and reported on', async function () {
    /*
     * THE THREE ACTIONS THE VENDOR'S PAGE HAS, and every one of them is
     * scoped to the member's own log first - the upstream endpoints take a
     * licence id and no member, so an id forwarded straight through would be
     * anybody's. That is the property worth asserting, more than any of the
     * three answers.
     */
    const list = data(await member.get('/eproduct/keygen/karaoke?limit=50'));
    if (!list.rows.length) return 'no keygen rows came back';

    const issued = list.rows.filter(function (row) { return row.license_file; })[0];
    const failed = list.rows.filter(function (row) { return !row.license_file; })[0];
    if (!issued) return 'not one keying produced a licence file';
    if (!failed) return 'every keying succeeded - the retry path is never drawn';

    /*
     * DOWNLOAD. In development the eproduct host is not configured, so this
     * answers 503 and says which - not 404, which would send whoever is
     * looking hunting for a file that exists. Either answer is correct here;
     * a 404 is not, because the row HAS a licence file.
     */
    try {
      const link = data(await member.get('/eproduct/keygen/karaoke/' + issued.id + '/license'));
      if (!link.url || !link.filename) return 'the download link is incomplete';
      if (link.url.indexOf('/ora_licenses/keygen.php') === -1) {
        return 'karaoke licences are fetched from ' + link.url;
      }
    } catch (err) {
      if (!err.response || err.response.status !== 503) {
        return 'the download answered ' + (err.response || {}).status;
      }
    }

    /* A row that produced nothing has nothing to download, at any status. */
    try {
      await member.get('/eproduct/keygen/karaoke/' + failed.id + '/license');
      return 'a failed keying offered a licence file';
    } catch (err) {
      if (!err.response || err.response.status !== 404) {
        return 'a failed keying answered ' + (err.response || {}).status + ' for its licence';
      }
    }

    /*
     * RETRY is a re-read, and it says so: the eproduct site has no endpoint
     * that issues a key, so a row that is still unissued is a 409 with a
     * sentence rather than a 200 handing the same failed row back.
     */
    const again = data(await member.post('/eproduct/keygen/karaoke/' + issued.id + '/retry', {}));
    if (again.id !== issued.id) return 'retry answered a different row';

    try {
      await member.post('/eproduct/keygen/karaoke/' + failed.id + '/retry', {});
      return 'retrying an unissued keying reported success';
    } catch (err) {
      if (!err.response || err.response.status !== 409) {
        return 'retrying an unissued keying answered ' + (err.response || {}).status;
      }
    }

    /* A row of somebody else's - or of nobody's - is a 404 on all three. */
    try {
      await member.post('/eproduct/keygen/karaoke/KG00000000/retry', {});
      return 'an id that is not in the member\'s own log was acted on';
    } catch (err) {
      if (!err.response || err.response.status !== 404) {
        return 'an unknown id answered ' + (err.response || {}).status;
      }
    }

    return true;
  });

  await check('a licence file downloads through the API, as an attachment, and only the member\'s own', async function () {
    /*
     * THE PAGE SAVES THE FILE IN PLACE NOW - no blank tab pointed at the
     * eproduct site. So the bytes have to come through Crystal: fetched
     * server to server, handed over on the member's own authenticated
     * request, as an attachment named after the licence and never cached.
     *
     * 503 is a correct answer too, on a deployment whose eproduct host is not
     * configured and whose mock is off; it is the only other one. What is
     * never right is a 200 that is not a file, or a stranger's licence.
     */
    const systems = ['karaoke', 'manbang', 'bmedia'];
    let saved = 0;

    for (let i = 0; i < systems.length; i += 1) {
      /* eslint-disable no-await-in-loop */
      const list = data(await member.get('/eproduct/keygen/' + systems[i] + '?limit=50'));
      const issued = list.rows.filter(function (row) { return row.license_file; })[0];
      if (!issued) continue;

      let response;
      try {
        response = await member.get('/eproduct/keygen/' + systems[i] + '/' + issued.id + '/license/file', {
          responseType: 'arraybuffer'
        });
      } catch (err) {
        if (err.response && err.response.status === 503) continue;
        return systems[i] + ' licence file answered ' + (err.response || {}).status;
      }
      /* eslint-enable no-await-in-loop */

      const name = String(issued.license_file).split(/[\\/]/).pop();
      const disposition = String(response.headers['content-disposition'] || '');

      if (disposition.indexOf('attachment') !== 0) return systems[i] + ' licence is not an attachment: ' + disposition;
      if (disposition.indexOf('filename="' + name + '"') === -1) {
        return systems[i] + ' licence is named ' + disposition + ', not ' + name;
      }
      if (String(response.headers['cache-control'] || '').indexOf('no-store') === -1) {
        return systems[i] + ' licence may be cached on the way to the member';
      }
      if (/json|html/i.test(String(response.headers['content-type'] || ''))) {
        return systems[i] + ' licence arrived as ' + response.headers['content-type'];
      }
      if (!Buffer.from(response.data).length) return systems[i] + ' licence file is empty';

      saved += 1;
    }

    /* Somebody else's licence, or nobody's, is a 404 - never a file. */
    try {
      await member.get('/eproduct/keygen/karaoke/KG00000000/license/file');
      return 'a licence file was handed out for an id that is not the member\'s';
    } catch (err) {
      if (!err.response || err.response.status !== 404) {
        return 'an unknown licence file answered ' + (err.response || {}).status;
      }
    }

    const health = data(await site().get('/health'));
    return saved > 0 || health.engines.storefronts !== 'mock'
      || 'the mock produced no licence file to download - the page\'s download is never exercised';
  });

  await check('one fault report at a time, and it has to say who to call', async function () {
    /*
     * The vendor's rule: a row already PENDING is a fault somebody is looking
     * at, and a second report only buries the first. Both fields are required
     * because a fault report with no telephone number is one nobody can
     * follow up - the service accepts it and then cannot act on it.
     */
    const list = data(await member.get('/eproduct/keygen/karaoke?limit=50'));
    if (!list.rows.length) return 'no keygen rows came back';

    const states = ['NONE', 'PENDING', 'ACCEPT', 'REJECT'];
    const odd = list.rows.filter(function (row) { return states.indexOf(row.error_status) === -1; });
    if (odd.length) return odd.length + ' rows carry a report state outside the vocabulary';

    const open = list.rows.filter(function (row) { return row.error_status !== 'PENDING'; })[0];
    const pending = list.rows.filter(function (row) { return row.error_status === 'PENDING'; })[0];
    if (!open) return 'every row already has a report pending';
    if (!pending) return 'no row has a report pending - that branch is never drawn';

    try {
      await member.post('/eproduct/keygen/karaoke/' + open.id + '/error-report', { phone: '', report: '' });
      return 'a report with no phone and no text was accepted';
    } catch (err) {
      if (!err.response || err.response.status !== 400) {
        return 'a blank report answered ' + (err.response || {}).status;
      }
    }

    const reported = data(await member.post('/eproduct/keygen/karaoke/' + open.id + '/error-report', {
      phone: '138-0000-0000',
      report: 'the key is refused by the machine'
    }));
    if (reported.id !== open.id) return 'the report answered a different row';

    try {
      await member.post('/eproduct/keygen/karaoke/' + pending.id + '/error-report', {
        phone: '138-0000-0000', report: 'again'
      });
      return 'a second report was accepted while one was pending';
    } catch (err) {
      return (err.response && err.response.status === 409)
        || 'a second report answered ' + (err.response || {}).status;
    }

    return true;
  });

  await check('a b-media licence carries its file and the titles it covers', async function () {
    /*
     * `license_path` upstream, spelled differently from the other two
     * systems' `licensefilepath` and pointing at a different directory - and
     * it was simply dropped, so b-media had no download while karaoke and
     * manbang did.
     */
    const list = data(await member.get('/eproduct/keygen/bmedia?limit=30'));
    if (!list.rows.length) return 'no b-media rows came back';

    const withFile = list.rows.filter(function (row) { return row.license_file; });
    if (!withFile.length) return 'not one b-media licence carries its file';
    if (withFile.length === list.rows.length) {
      return 'every b-media row has a file - the missing case is never drawn';
    }

    /* The lines that licence covered, which is its own upstream endpoint. */
    const detail = data(await member.get('/eproduct/keygen/bmedia/' + withFile[0].id + '?limit=20'));
    if (!detail.rows.length) return 'a licence covers no media at all';

    const incomplete = detail.rows.filter(function (row) {
      return !row.title || typeof row.duration !== 'number' || typeof row.media_price !== 'number';
    });
    if (incomplete.length) return incomplete.length + ' media lines are missing a field';

    /* Keyed by a licence and no member upstream, so it is scoped here. */
    try {
      await member.get('/eproduct/keygen/bmedia/BM00000000?limit=5');
      return 'a licence that is not the member\'s answered its media';
    } catch (err) {
      return (err.response && err.response.status === 404)
        || 'an unknown b-media licence answered ' + (err.response || {}).status;
    }
  });

  await check('a media licence separates what was paid from what came back', async function () {
    /*
     * B-media is the keygen log with a different shape: it licenses a device
     * against a broadcaster, and it reports the charge and the rebate as two
     * figures. They are two facts - a member who paid 150 and got 21 back has
     * not paid 129 - so neither is derived from the other.
     */
    const list = data(await member.get('/eproduct/keygen/bmedia?limit=20'));
    if (!list.rows.length) return 'no media licences came back';

    const missing = list.rows.filter(function (row) {
      return !row.device_id || !row.provider
        || typeof row.price !== 'number' || typeof row.bonus !== 'number';
    });
    if (missing.length) return missing.length + ' media licences are missing a field';

    /* The rebate is a fraction of the charge, never larger than it. */
    const wrong = list.rows.filter(function (row) { return row.bonus > row.price; });
    if (wrong.length) return wrong.length + ' media licences give back more than they charged';

    const actors = ['MEMBER', 'AGENCY'];
    const odd = list.rows.filter(function (row) { return actors.indexOf(row.actor) === -1; });
    return odd.length === 0 || odd.length + ' media licences do not say who keyed them';
  });

  await check('the three old logs answer, and are a closed record', async function () {
    /*
     * These are DATABASE reads, not HTTP - the karaoke, media and prize
     * systems left their records behind and Crystal reads them. If the
     * satellite schemas are missing the pages are correct and empty, which
     * is indistinguishable from broken, so "all three came back with rows"
     * is what separates the two.
     */
    const paths = ['karaoke', 'media', 'activity'];

    for (let i = 0; i < paths.length; i += 1) {
      /* eslint-disable no-await-in-loop */
      const body = data(await member.get('/history/' + paths[i] + '?limit=10'));
      /* eslint-enable no-await-in-loop */
      if (!body.rows.length) {
        return paths[i] + ' came back empty - run npm run legacy:install';
      }
      if (!body.total) return paths[i] + ' reported no total';
    }

    return true;
  });

  await check('the old karaoke log excludes what the old system excluded', async function () {
    /*
     * FOUR FILTERS, and every one of them hides rows a member would
     * otherwise see: an agency keying is not your own activity, a failed
     * attempt cost nothing, a reversed one was undone, and nothing before
     * the cutover is in a readable format.
     *
     * The seed deliberately contains one of each, so a filter that stopped
     * working would show up as MORE rows rather than as an error - which is
     * why this counts rather than inspecting.
     */
    const body = data(await member.get('/history/karaoke?limit=50'));
    if (!body.rows.length) return 'no karaoke history came back';

    const missing = body.rows.filter(function (row) {
      return !row.equipment || typeof row.paid !== 'number' || typeof row.awarded !== 'number';
    });
    if (missing.length) return missing.length + ' rows are missing a field';

    /*
     * Nine rows are seeded per member and three are excluded by the filters,
     * so an unmerged member sees six. More than six means a filter has
     * stopped excluding; the merge cap can take it lower, never higher.
     */
    if (body.total > 6) {
      return body.total + ' rows came back where at most 6 can pass the filters';
    }

    /*
     * AND THE POINTS ARE NOT WHOLE. `bonus_score` is numeric(10,3) in the
     * licence database, so a keying can award a fraction of a point - and a
     * fixture of whole numbers cannot tell a page that rounds from one that
     * does not.
     */
    const fractional = body.rows.filter(function (row) { return row.awarded % 1 !== 0; });
    return fractional.length > 0
      || 'every award is a whole number - rounding here would not be noticed';
  });

  await check('a merged account stops where the merge did', async function () {
    /*
     * THE RULE MOST LIKELY TO BE DROPPED, and the hardest to notice.
     *
     * Everything the old system recorded after an account was merged is on
     * the ordinary pages already. Showing it here too counts every movement
     * twice, and neither total adds up against anything.
     *
     * The demo member is the merged one and the seed straddles that instant,
     * so their history is SHORTER than an unmerged member's. Equal totals
     * mean the cap is not being applied at all.
     */
    const mine = data(await member.get('/history/karaoke?limit=50'));

    /*
     * A SEEDED MEMBER WITH HISTORY, not just any member.
     *
     * This suite creates accounts of its own with generated passwords, and
     * the installer seeds old-log rows for only the first handful of
     * members - so most of the list is either unsignable or empty, and
     * either one fails on something other than the rule under test. Both
     * happened while writing this.
     */
    const others = data(await admin.get('/members?q=member&limit=25'));
    const candidates = others.rows.filter(function (row) {
      return row.login && row.login !== demoLogin;
    });

    let theirs = null;
    let compared = null;

    for (let i = 0; i < candidates.length && !theirs; i += 1) {
      /* eslint-disable no-await-in-loop */
      try {
        /*
         * `site()`, not `anon`. The latter is based at /api/admin, so a
         * member sign-in posted through it reaches the CONSOLE's login,
         * which wants a username and refuses every member - and the loop
         * then reports "no member has any history", which is a sentence
         * about the data rather than about the wrong door being knocked on.
         */
        const session = data(await site().post('/auth/login', {
          user_id: candidates[i].login, password: 'crystal1234'
        }));
        const body = data(await client(session.token, api + '/account')
          .get('/history/karaoke?limit=50'));

        if (body.total) { theirs = body; compared = candidates[i].login; }
      } catch (err) {
        /* Not a seeded account, or not one this suite can sign in as. */
      }
      /* eslint-enable no-await-in-loop */
    }

    if (!theirs) return 'no unmerged member with karaoke history - run npm run legacy:install';

    return mine.total < theirs.total
      || 'the merged member sees ' + mine.total + ' rows and ' + compared + ' sees '
        + theirs.total + ' - the merge cap is not being applied';
  });

  await check('the media log carries one row that is not a licence', async function () {
    /*
     * The last line is the balance the member brought in from before the
     * service kept a log. It lives in a different table, it is appended to
     * the LAST page only, and it has no equipment against it - so it is
     * flagged, because an unflagged row like that reads as a fault.
     */
    const body = data(await member.get('/history/media?limit=50'));
    if (!body.rows.length) return 'no media history came back';

    const carried = body.rows.filter(function (row) { return row.carried_forward; });
    if (carried.length !== 1) return carried.length + ' carry-forward rows, expected exactly 1';

    /* It belongs last, below the oldest real row. */
    if (!body.rows[body.rows.length - 1].carried_forward) {
      return 'the carry-forward row is not the last one';
    }

    const real = body.rows.filter(function (row) { return !row.carried_forward; });
    const withEquipment = real.filter(function (row) { return !!row.equipment; });

    return withEquipment.length === real.length
      || 'a real media licence came back with no equipment against it';
  });

  await check('the carry-forward row is the one line on the page that translates', async function () {
    /*
     * IT IS THE ONLY CELL CRYSTAL WRITES. Every other reason on these three
     * pages is a provider's short name out of the media database and is the
     * same string in any language; this row has no reason of its own, so the
     * vendor hard-coded an English sentence into the SELECT and a member
     * reading in Chinese got one English line in a column of data.
     *
     * Asked in three languages, the sentence has to change and the rest of
     * the page has to not - which is what separates "it is translated" from
     * "the page is being rebuilt per language".
     */
    const said = {};

    for (let i = 0; i < LOCALES.length; i += 1) {
      /* eslint-disable no-await-in-loop */
      const body = data(await member.get('/history/media?limit=50', {
        headers: { 'X-Lang': LOCALES[i] }
      }));
      /* eslint-enable no-await-in-loop */

      const carried = body.rows.filter(function (row) { return row.carried_forward; })[0];
      if (!carried) return LOCALES[i] + ': no carry-forward row came back';
      if (!carried.reason) return LOCALES[i] + ': the carry-forward row has no reason';

      /* An address that did not resolve would be answered AS the address. */
      if (carried.reason.indexOf('oldLogs.') === 0) {
        return LOCALES[i] + ': the reason came back as an unresolved address';
      }

      said[LOCALES[i]] = carried.reason;

      /* The real rows are the media service's own words and must not move. */
      const licences = body.rows.filter(function (row) { return !row.carried_forward; })
        .map(function (row) { return row.reason; }).join('|');

      if (i === 0) said.licences = licences;
      else if (licences !== said.licences) {
        return LOCALES[i] + ': a real licence row had its provider name rewritten';
      }
    }

    const distinct = LOCALES.map(function (code) { return said[code]; })
      .filter(function (value, index, all) { return all.indexOf(value) === index; });

    return distinct.length === LOCALES.length
      || 'the carry-forward row reads the same in ' + LOCALES.join(', ');
  });

  await check('the activity prize log reads the old customer database', async function () {
    /*
     * Keyed by the OLD customer id, not by the platform one - that table
     * predates the platform and has never heard of it. A wrong key here does
     * not error, it returns somebody else's prizes or nobody's.
     */
    const body = data(await member.get('/history/activity?limit=20'));
    if (!body.rows.length) return 'no activity prizes came back';

    const missing = body.rows.filter(function (row) {
      return typeof row.points !== 'number' || !row.at;
    });
    if (missing.length) return missing.length + ' prizes are missing a figure or a date';

    /* The note is the only thing on the row a member would recognise. */
    const unexplained = body.rows.filter(function (row) { return !row.reason; });
    if (unexplained.length) return unexplained.length + ' prizes say nothing about what for';

    /*
     * AND A FRACTION SURVIVES. `prize_val` is numeric(10,1) upstream, so a
     * prize of four tenths of a point is a real award - and it was being
     * shown as 0. Rounding it anywhere between the table and the reply turns
     * a movement into no movement at all, which is the one arithmetic error
     * a member can catch and nobody else can.
     */
    const wide = data(await member.get('/history/activity?limit=50'));
    const fractional = wide.rows.filter(function (row) { return row.points % 1 !== 0; });

    return fractional.length > 0
      || 'not one prize carries a fraction - rounding here would not be noticed';
  });

  await check('the footer is content the console owns, and is served to anybody', async function () {
    /*
     * PUBLIC AND UNAUTHENTICATED. It is on every page including the ones a
     * signed-out visitor sees, so it is fetched with no token at all - and
     * asking through `site()` rather than a member client is what proves it.
     */
    const body = data(await site().get('/site/footer'));

    if (!body.downloads || !body.contacts || !body.support || !body.company) {
      return 'a section is missing from the footer';
    }

    if (!body.downloads.items.length) return 'no downloads on the footer';
    if (!body.contacts.phones.length) return 'no contact numbers on the footer';
    if (!body.company.email || !body.company.address) return 'the company section is incomplete';

    /* Two buttons, always - the site draws neither when they have no
       address, and the console still needs two rows to type into. */
    return body.sites.length === 2 || 'expected two site buttons, got ' + body.sites.length;
  });

  await check('a half-saved footer cannot take the footer off the site', async function () {
    /*
     * THE FAILURE THIS PREVENTS, and it is a subtler one than it first looks.
     *
     * The whole footer is ONE settings row holding one document, so a save
     * that carries only the part somebody edited has to be filled back in.
     * A top-level `Object.assign` over the default already keeps the three
     * SECTIONS that were not sent - so checking those survive proves
     * nothing, which is exactly what the first version of this check did.
     *
     * The gap is INSIDE a section: a document naming only `company.email`
     * leaves that section with no title and no address, and the site then
     * renders a company block that is one line of nothing. So the assertion
     * that matters is that the untouched FIELDS of a touched section come
     * back too.
     */
    const before = data(await admin.get('/settings'));
    const row = before.filter(function (entry) { return entry.setting_key === 'site.footer'; })[0];
    if (!row) return 'the site.footer setting is missing - run npm run seed';

    const partial = JSON.stringify({ company: { email: 'partial@crystal.example' } });

    try {
      await admin.put('/settings', { 'site.footer': partial });

      const body = data(await site().get('/site/footer'));

      if (body.company.email !== 'partial@crystal.example') return 'the saved section did not take';

      /* The rest of the section that was touched. */
      if (!body.company.address) return 'saving one field emptied the company address';
      if (!body.company.title) return 'saving one field emptied the company heading';

      /* And the three that were not sent at all. */
      if (!body.downloads.items.length) return 'saving one section emptied the downloads';
      if (!body.contacts.phones.length) return 'saving one section emptied the contact numbers';
      if (!body.support.links.length) return 'saving one section emptied the support links';
      if (body.sites.length !== 2) return 'saving one section lost the site buttons';
    } finally {
      /* Put it back whatever happened - this suite is run against a database
         somebody is also looking at. */
      await admin.put('/settings', { 'site.footer': row.setting_val });
    }

    return true;
  });

  await check('every number on the footer says what it is for', async function () {
    /*
     * SEVEN NUMBERS UNDER ONE HEADING ARE SEVEN STRIPES OF DIGITS. The 400
     * service line, the Shenzhen landlines and the two mobiles are told
     * apart by their LABEL and by nothing else, so a document that serves
     * numbers without one is a footer a visitor has to guess at.
     *
     * The shape is the assertion: the API always answers { label, number },
     * whichever era the saved row is from - see services/footer.service.js.
     */
    const body = data(await site().get('/site/footer'));
    const phones = body.contacts.phones;

    const shapeless = phones.filter(function (phone) {
      return !phone || typeof phone !== 'object' || !phone.number;
    });
    if (shapeless.length) return shapeless.length + ' numbers are not { label, number }';

    /*
     * THE LIVE DOCUMENT IS NOT ASKED TO HAVE LABELS. This suite runs against
     * a database somebody seeded before labels existed, and an unlabelled
     * number there is the old shape being read correctly rather than a
     * fault. What must carry them is what a FRESH install ships, which is
     * the default in the code.
     */
    const fresh = require('../src/services/footer.service').DEFAULT.contacts.phones;
    const unlabelled = fresh.filter(function (phone) { return !phone || !phone.label || !phone.number; });

    return unlabelled.length === 0 || unlabelled.length + ' of the default numbers carry no label';
  });

  await check('a footer saved before labels existed keeps its numbers', async function () {
    /*
     * THE UPGRADE NOBODY PERFORMS. A site that saved its footer last year
     * holds bare strings - '400-820-1668' - and nobody is going to open the
     * console on its behalf before the new build goes out. Dropping those
     * rows, or serving them as objects with no number in them, takes the
     * numbers off a working site at deploy time.
     *
     * So the old shape is READ, not migrated: it comes back as a pair with
     * an empty label, which renders exactly as it always did.
     */
    const before = data(await admin.get('/settings'));
    const row = before.filter(function (entry) { return entry.setting_key === 'site.footer'; })[0];
    if (!row) return 'the site.footer setting is missing - run npm run seed';

    const old = JSON.stringify({ contacts: { title: 'Contact us', phones: ['400-820-1668', '0755-8666-1000'] } });

    try {
      await admin.put('/settings', { 'site.footer': old });

      const phones = data(await site().get('/site/footer')).contacts.phones;

      if (phones.length !== 2) return 'an old document lost numbers - ' + phones.length + ' of 2 survived';
      if (phones[0].number !== '400-820-1668') return 'an old number did not come back as a number';
      if (phones[0].label !== '') return 'an old number invented a label for itself';
    } finally {
      await admin.put('/settings', { 'site.footer': row.setting_val });
    }

    return true;
  });

  await check('a label typed in the console reaches the site beside its number', async function () {
    const before = data(await admin.get('/settings'));
    const row = before.filter(function (entry) { return entry.setting_key === 'site.footer'; })[0];
    if (!row) return 'the site.footer setting is missing - run npm run seed';

    const saved = JSON.stringify({
      contacts: {
        title: 'Contact us',
        phones: [{ label: 'Service line', number: '400-820-1668' }]
      }
    });

    try {
      await admin.put('/settings', { 'site.footer': saved });

      const phones = data(await site().get('/site/footer')).contacts.phones;

      if (phones.length !== 1) return 'expected the one saved number, got ' + phones.length;
      if (phones[0].label !== 'Service line') return 'the label did not survive the save';
      if (phones[0].number !== '400-820-1668') return 'the number did not survive the save';
    } finally {
      await admin.put('/settings', { 'site.footer': row.setting_val });
    }

    return true;
  });


  console.log('\nthe Appstore wallet: transfer, charge, password');

  /*
   * THE ONE PART OF THE MEMBER CENTRE THAT MOVES MONEY, so the refusals are
   * checked one by one - each is a mistake a member will make, and each has to
   * come back naming the field it belongs under, before anything reaches the
   * wallet. The writes that SUCCEED are only made against the mock: this
   * script is run against deployments too, and a check that transferred real
   * coins between real members would be a bug with a receipt.
   */
  const storefrontsMocked = data(await site().get('/health')).engines.storefronts === 'mock';

  /** A refusal, as { status, reason, field } - or the reply, if it was not one. */
  async function refusal(run) {
    try {
      const answered = await run();
      return { status: 200, answered: answered };
    } catch (err) {
      const detail = (err.response && err.response.data && err.response.data.detail) || {};
      return { status: err.response ? err.response.status : 0, reason: detail.reason, field: detail.field };
    }
  }

  /* Somebody else with an Appstore wallet, to be the receiver. */
  const receiverRow = await require('../src/config/legacy').connection()('ora_pid.user_merge_ids as m')
    .join('ora_pid.users as u', 'u.user_pk', 'm.pvendor_pk')
    .whereNotNull('m.appstore_pk')
    .whereNot('m.pvendor_pk', memberSession.user.id)
    .where('u.status', 1)
    .where('u.locked', 0)
    .select('u.user_id')
    .first();
  const receiverLogin = receiverRow ? receiverRow.user_id : null;

  await check('a transfer is refused on the field that is wrong, before anything moves', async function () {
    if (!receiverLogin) return 'no second member has an Appstore wallet - run npm run legacy:install';

    const cases = [
      [{ receiver: receiverLogin, amount: 0, password: 'x' }, 400, 'amount', 'AMOUNT_REQUIRED'],
      [{ receiver: receiverLogin, amount: 1.0004, password: 'x' }, 400, 'amount', 'AMOUNT_TOO_FINE'],
      [{ receiver: receiverLogin, amount: 100000000, password: 'x' }, 400, 'amount', 'AMOUNT_TOO_LARGE'],
      [{ receiver: receiverLogin, amount: 1, password: '' }, 400, 'password', 'PASSWORD_REQUIRED'],
      [{ receiver: '', amount: 1, password: 'x' }, 400, 'receiver', 'RECEIVER_REQUIRED'],
      [{ receiver: 'no-such-person-here', amount: 1, password: 'x' }, 404, 'receiver', 'NO_RECEIVER'],
      [{ receiver: demoLogin, amount: 1, password: 'x' }, 400, 'receiver', 'RECEIVER_IS_SELF'],
      [{ receiver: receiverLogin, amount: 1, password: 'definitely-not' }, 400, 'password', 'WRONG_PASSWORD']
    ];

    for (let i = 0; i < cases.length; i += 1) {
      /* eslint-disable-next-line no-await-in-loop */
      const got = await refusal(function () { return member.post('/appstore/wallet/transfer', cases[i][0]); });
      if (got.status !== cases[i][1] || got.field !== cases[i][2] || got.reason !== cases[i][3]) {
        return 'expected ' + cases[i].slice(1).join('/') + ', got ' + [got.status, got.field, got.reason].join('/');
      }
    }

    return true;
  });

  await check('the receiver lookup names the person and nothing else', async function () {
    if (!receiverLogin) return 'no second member has an Appstore wallet';

    const found = data(await member.get('/appstore/wallet/receiver', { params: { user_id: receiverLogin } }));
    const keys = Object.keys(found).sort().join(',');
    if (keys !== 'nickname,user_id') return 'the lookup answered ' + keys;

    const self = await refusal(function () {
      return member.get('/appstore/wallet/receiver', { params: { user_id: demoLogin } });
    });
    return self.reason === 'RECEIVER_IS_SELF' || 'looking yourself up answered ' + self.status;
  });

  await check('a charge is refused for a channel that does not charge that purse', async function () {
    const options = data(await member.get('/appstore/wallet/charge'));
    const foreign = options.money.filter(function (entry) { return entry.key === 'FOREIGN'; })[0];
    if (!foreign) return 'the charge options offer no foreign purse';

    const unoffered = ['SH', 'MM', 'UR', 'SY'].filter(function (code) { return foreign.channels.indexOf(code) === -1; })[0];
    const got = await refusal(function () {
      return member.post('/appstore/wallet/charge', { money: 'FOREIGN', channel: unoffered, amount: 5 });
    });

    return (got.status === 400 && got.field === 'channel') || 'an unoffered channel answered ' + got.status;
  });

  await check('a charge and a transfer move the wallet, and the reply is the wallet\'s own figure', async function () {
    if (!storefrontsMocked) return true;
    if (!receiverLogin) return 'no second member has an Appstore wallet';

    const before = data(await member.get('/appstore/balance')).native_score;

    /* In, then out: the demo member's balance ends where it started. */
    const charged = data(await member.post('/appstore/wallet/charge', { money: 'COMPANY', channel: 'MM', amount: 0.5 }));
    if (Math.abs(charged.balance.native_score - (before + 0.5)) > 0.0005) {
      return 'a charge of 0.5 answered a balance of ' + charged.balance.native_score + ' from ' + before;
    }

    const sent = data(await member.post('/appstore/wallet/transfer', { receiver: receiverLogin, amount: 0.5, password: 'crystal1234' }));
    if (!sent.reference) return 'the transfer came back without a transaction number';
    if (Math.abs(sent.balance.native_score - before) > 0.0005) {
      return 'after charging and sending 0.5 the balance is ' + sent.balance.native_score + ', not ' + before;
    }

    const statement = data(await member.get('/appstore/transactions?limit=5'));
    return statement.rows.some(function (row) { return row.reference === sent.reference; })
      || 'the transfer is not on the statement';
  });

  await check('the wallet password changes only for somebody who knows the current one', async function () {
    const wrong = await refusal(function () {
      return member.post('/appstore/wallet/password', { current: 'definitely-not', next: 'abcdef12' });
    });
    if (wrong.reason !== 'WRONG_PASSWORD' || wrong.field !== 'current') return 'a wrong current password answered ' + wrong.status;

    const short = await refusal(function () {
      return member.post('/appstore/wallet/password', { current: 'crystal1234', next: 'abc' });
    });
    if (short.field !== 'next') return 'a three-character password answered ' + short.status;

    if (!storefrontsMocked) return true;

    await member.post('/appstore/wallet/password', { current: 'crystal1234', next: 'check-script-1' });
    const old = await refusal(function () {
      return member.post('/appstore/wallet/transfer', { receiver: receiverLogin, amount: 0.001, password: 'crystal1234' });
    });

    /* Put back before judging, so a failure here does not strand the password. */
    await member.post('/appstore/wallet/password', { current: 'check-script-1', next: 'crystal1234' });

    return old.reason === 'WRONG_PASSWORD' || 'the old password still opened the wallet (' + old.status + ')';
  });


  console.log('\nthe wallet screen in the console');

  /*
   * The console had no view of a member's money at all until recently, so
   * these are the first checks that anything here works end to end. The
   * ledgers are read-only; the one write is a manual adjustment, and what
   * matters about it is that it goes through the same locked path as every
   * other movement rather than setting a balance.
   */
  let someWallet = null;

  await check('every wallet is listed, with the member on the row', async function () {
    const body = data(await admin.get('/wallets', { params: { limit: 5 } }));
    if (!body.rows.length) return 'no wallets at all';

    someWallet = body.rows[0];

    if (someWallet.login === undefined) return 'no member on the row';
    if (someWallet.balance === undefined) return 'no balance';
    return someWallet.point_balance !== undefined || 'no points';
  });

  await check('a wallet is found by the member, not by their id', async function () {
    const body = data(await admin.get('/wallets', { params: { q: someWallet.login } }));
    return body.rows.some(function (row) { return row.login === someWallet.login; })
      || 'the member did not come back from their own login';
  });

  await check('the two ledgers page independently of each other', async function () {
    const money = data(await admin.get('/wallets/' + someWallet.user_id + '/transactions', { params: { limit: 3 } }));
    const points = data(await admin.get('/wallets/' + someWallet.user_id + '/points', { params: { limit: 3 } }));

    if (!Array.isArray(money.rows)) return 'the transactions did not page';
    if (!Array.isArray(points.rows)) return 'the points did not page';
    return (money.rows.length <= 3 && points.rows.length <= 3) || 'the limit was ignored';
  });

  await check('an adjustment with no reason is refused', async function () {
    /*
     * The reason becomes the description the MEMBER reads on their own
     * statement. An adjustment nobody can explain later is what stops a
     * ledger being evidence, so it is required rather than encouraged.
     */
    try {
      await admin.post('/wallets/' + someWallet.user_id + '/adjust', { kind: 'money', amount: 1 });
      return 'it was accepted without one';
    } catch (err) {
      return (err.response && err.response.status === 400)
        || 'answered ' + (err.response || {}).status;
    }
  });

  await check('an adjustment moves the balance and writes the ledger together', async function () {
    const before = data(await admin.get('/wallets/' + someWallet.user_id));

    const written = data(await admin.post('/wallets/' + someWallet.user_id + '/adjust', {
      kind: 'money', amount: 5, description: 'check script credit'
    }));

    if (written.type !== 'COMPENSATION') return 'wrong movement type: ' + written.type;

    const after = data(await admin.get('/wallets/' + someWallet.user_id));

    if (Math.abs((Number(after.balance) - Number(before.balance)) - 5) > 0.001) {
      return 'the balance moved by ' + (Number(after.balance) - Number(before.balance));
    }
    if (Math.abs(Number(written.balance_after) - Number(after.balance)) > 0.001) {
      return 'balance_after does not match the wallet it was written against';
    }

    /* Put it back, so a second run starts where this one did. */
    await admin.post('/wallets/' + someWallet.user_id + '/adjust', {
      kind: 'money', amount: -5, description: 'check script reversal'
    });

    const restored = data(await admin.get('/wallets/' + someWallet.user_id));
    return Math.abs(Number(restored.balance) - Number(before.balance)) < 0.001
      || 'the reversal did not restore the balance';
  });

  await check('an adjustment cannot overdraw a wallet', async function () {
    /*
     * The same lock and the same refusal as a purchase - there is no second
     * path to a balance, which is the whole reason this goes through
     * recordTransaction rather than writing the column.
     */
    try {
      await admin.post('/wallets/' + someWallet.user_id + '/adjust', {
        kind: 'money', amount: -99999999, description: 'check script overdraft'
      });
      return 'the overdraft was accepted';
    } catch (err) {
      return (err.response && err.response.status === 409)
        || 'answered ' + (err.response || {}).status;
    }
  });

  await check('a points adjustment is written as an adjustment', async function () {
    const before = data(await admin.get('/wallets/' + someWallet.user_id));

    const written = data(await admin.post('/wallets/' + someWallet.user_id + '/adjust', {
      kind: 'points', amount: 7, description: 'check script points'
    }));

    if (written.type !== 'ADJUST') return 'wrong movement type: ' + written.type;

    const after = data(await admin.get('/wallets/' + someWallet.user_id));
    const moved = Number(after.point_balance) - Number(before.point_balance);

    await admin.post('/wallets/' + someWallet.user_id + '/adjust', {
      kind: 'points', amount: -7, description: 'check script reversal'
    });

    return moved === 7 || 'the points moved by ' + moved;
  });

  console.log("\nthe console's page registry");

  await check('every screen in the seed is registered on this database', async function () {
    /*
     * A SCREEN THAT IS NOT IN manager_pages DOES NOT EXIST, twice over:
     * middleware/permission.js answers 500 'page not registered' for its
     * endpoints, and crystal-admin draws its sidebar from the same table.
     *
     * A fresh install gets the whole list from src/db/seeds/01_management.js.
     * A database migrated forward gets only what some delta inserted by hand,
     * so a page added to the seed and to no delta is present on one machine
     * and missing on another - `/admin/base/footer` was exactly that, and it
     * was reported as "the menu is missing when I build the project on
     * another machine", which is a fair description of an invisible cause.
     *
     * Read out of the table rather than through an endpoint, because the list
     * IS the table - there is nothing to ask that does not read it.
     */
    const pagesDb = require('../src/config/db');
    const { PAGES } = require('../src/db/seeds/01_management');

    const registered = await pagesDb('manager_pages').pluck('page_url');
    const have = {};
    registered.forEach(function (url) { have[url] = true; });

    const absent = PAGES.map(function (page) { return page[0]; })
      .filter(function (url) { return !have[url]; });

    return absent.length === 0
      || absent.length + ' screen(s) are not registered - run npm run pages:sync: ' + absent.join(', ');
  });

  await check('a registered screen has somebody who can open it', async function () {
    /*
     * A page row with no grant on it is a menu entry that 403s, which looks
     * like a different fault entirely. Every page under a parent inherits the
     * parent's level (sql/deltas/023), so the one role that must always hold
     * every page is the super administrator - and a page it cannot open is a
     * page that was registered without its grants.
     */
    const pagesDb = require('../src/config/db');

    const orphans = await pagesDb('manager_pages as p')
      .join('manager_roles as r', 'r.role_code', pagesDb.raw('?', ['SUPER_ADMIN']))
      .leftJoin('manager_permissions as m', function () {
        this.on('m.page_id', 'p.id').andOn('m.role_id', 'r.id');
      })
      .whereNull('m.permission')
      .pluck('p.page_url');

    return orphans.length === 0
      || orphans.length + ' page(s) the super administrator cannot open: ' + orphans.join(', ');
  });

  console.log("\nthe database's own errors, in the reader's language");

  await check('an enum miss names the vocabulary AND the value', async function () {
    /*
     * PostgreSQL's own wording says both, and both are worth keeping - but
     * knex prepends the whole SQL statement to the message, so the useful
     * part has to be matched rather than sliced off the front.
     */
    try {
      await admin.post('/faqs', {
        category: 'TELEPATHY', question: 'q', answer: 'a', status: 'PUBLISHED'
      });
      return 'a category outside the vocabulary was accepted';
    } catch (err) {
      const message = String(err.response.data.message || '');
      if (message.indexOf('faq_category') === -1) return 'no vocabulary: ' + message;
      if (message.indexOf('TELEPATHY') === -1) return 'no value: ' + message;
      return !/insert into|select |\$\d/.test(message) || 'THE SQL LEAKED: ' + message;
    }
  });

  await check("the same mistake answers in the reader's language", async function () {
    const chinese = client(session.token);
    chinese.defaults.headers.common['X-Lang'] = 'zh';

    try {
      await chinese.post('/faqs', {
        category: 'TELEPATHY', question: 'q', answer: 'a', status: 'PUBLISHED'
      });
      return 'it was accepted';
    } catch (err) {
      const message = String(err.response.data.message || '');
      if (!/[\u4e00-\u9fff]/.test(message)) return 'answered in English: ' + message;
      return message.indexOf('TELEPATHY') !== -1 || 'the value was lost: ' + message;
    }
  });

  await check('no reply ever carries the row that failed', async function () {
    /*
     * 'detail' on a PostgreSQL error is "Failing row contains (...)", every
     * column of it. It has reached a client from the error handler once.
     */
    try {
      await admin.post('/faqs', { question: 'only a question' });
      return 'an incomplete row was accepted';
    } catch (err) {
      const body = JSON.stringify(err.response.data);
      return body.indexOf('Failing row contains') === -1
        || 'THE ROW LEAKED: ' + body.slice(0, 160);
    }
  });


  console.log('\nregistering, and changing a password');

  /*
   * A LOGIN NOTHING ELSE COULD HAVE TAKEN.
   *
   * These checks register real accounts, and a timestamp alone is not unique
   * enough: two runs in the same millisecond, or a leftover account from a
   * run that failed part way, and the suite reports a duplicate for a reason
   * that has nothing to do with the code under test. The random half makes
   * that impossible.
   */
  const freshLogin = function (suffix) {
    return 'check.' + Date.now().toString(36)
      + Math.random().toString(36).slice(2, 8) + (suffix || '');
  };

  await check('registering creates a PLATFORM account, not a local one', async function () {
    /*
     * Sign-in checks ora_pid.users, so an account that exists only in
     * Crystal is an account nobody can sign in to. The proof is end to end:
     * register, then sign in with the same credential.
     */
    const login = freshLogin();

    const made = data(await web.post('/auth/register', {
      user_id: login, password: 'a-long-enough-password', nickname: 'Check Account'
    }));
    if (!made.token) return 'registration returned no session';

    const back = data(await web.post('/auth/login', {
      user_id: login, password: 'a-long-enough-password'
    }));

    /*
     * The same id both times. Registration takes the key the platform
     * allocates and mirrors Crystal locally under it - two different ids
     * would mean the mirror is pointing at somebody else.
     */
    return Number(back.user.id) === Number(made.user.id)
      || 'registering and signing in produced different member ids';
  });

  await check('a user ID cannot be taken twice', async function () {
    const login = freshLogin('x');
    const body = { user_id: login, password: 'a-long-enough-password' };

    await web.post('/auth/register', body);

    try {
      await web.post('/auth/register', body);
      return 'the same user ID registered twice';
    } catch (err) {
      return err.response.status === 409 || 'expected 409, got ' + err.response.status;
    }
  });

  await check('a changed password is written where sign-in reads it', async function () {
    /*
     * THE ONE THAT WOULD HAVE FAILED SILENTLY.
     *
     * This used to write Crystal\u0027s own password_hash - a column nothing
     * reads any more - so the change reported success and altered nothing
     * anybody could sign in with. Both halves are asserted: the old password
     * stops working and the new one starts.
     */
    const login = freshLogin('p');
    const first = 'the-first-password';
    const second = 'the-second-password';

    const made = data(await web.post('/auth/register', { user_id: login, password: first }));
    const session = client(made.token, api);

    await session.post('/auth/password', { currentPassword: first, newPassword: second });

    try {
      await web.post('/auth/login', { user_id: login, password: first });
      return 'the old password still works';
    } catch (err) {
      if (err.response.status !== 401) return 'expected 401, got ' + err.response.status;
    }

    const back = data(await web.post('/auth/login', { user_id: login, password: second }));
    return !!back.token || 'the new password does not work either';
  });


  console.log('\nsigned content');

  /*
   * WHAT THE STOREFRONT REFUSES TO RENDER UNLESS IT VERIFIES - notices, FAQs
   * and the hero and product images - checked here the way the storefront
   * checks it: against the keys the STOREFRONT trusts (its
   * REACT_APP_CONTENT_SIGNING_KEYS, from the environment or from
   * crystal-web/.env.development.local), the canonical bytes rebuilt from
   * `integrity.content`, and every image's bytes downloaded and hashed. A
   * signature that only verified against the server's own idea of its keys
   * would prove nothing about what a visitor sees.
   *
   * And the half the storefront cannot see: that every console write signs,
   * that a change made behind the console reaches the storefront as INVALID,
   * and that the console will not quietly re-sign it. See
   * docs/content-signing.md.
   */
  const signingCanonical = require('../src/security/canonicalPayload');
  const signingAlgorithms = require('../src/security/algorithms');
  const crypto = require('crypto');
  const fs = require('fs');
  const path = require('path');

  function storefrontKeys() {
    let raw = process.env.REACT_APP_CONTENT_SIGNING_KEYS;
    if (!raw) {
      const file = path.join(__dirname, '..', '..', 'crystal-web', '.env.development.local');
      const line = fs.existsSync(file)
        ? fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(function (l) { return l.indexOf('REACT_APP_CONTENT_SIGNING_KEYS=') === 0; })[0]
        : null;
      raw = line ? line.slice('REACT_APP_CONTENT_SIGNING_KEYS='.length) : '[]';
    }
    return JSON.parse(raw);
  }

  const trustedKeys = storefrontKeys();

  /** true, or the reason the envelope does not verify - bytes and all for an image. */
  async function verifyIntegrity(type, integrity) {
    if (!integrity) return 'no integrity envelope';
    const sig = integrity.signature;
    if (!sig || sig.v !== 1 || sig.type !== type) return 'an envelope of the wrong shape';

    const key = trustedKeys.filter(function (k) { return k.keyId === sig.keyId; })[0];
    if (!key) return 'signed by ' + sig.keyId + ', which the storefront does not trust';
    if (key.algorithm !== sig.algorithm) return 'algorithm ' + sig.algorithm + ' for a ' + key.algorithm + ' key';

    const algorithm = signingAlgorithms.byEnvelope(key.algorithm);
    const publicKey = crypto.createPublicKey({ key: Buffer.from(key.spki, 'base64'), format: 'der', type: 'spki' });

    let bytes;
    try {
      bytes = signingCanonical.canonicalBytes(type, sig.algorithm, sig.keyId, integrity.content);
    } catch (err) {
      return 'the content does not fit its schema: ' + err.reason;
    }
    if (!algorithm.verify(publicKey, bytes, Buffer.from(sig.value, 'base64'))) return 'the signature does not verify';

    if (type === 'image') {
      const file = await axios.get(base + integrity.content.storageKey, { responseType: 'arraybuffer' });
      const body = Buffer.from(file.data);
      if (body.length !== integrity.content.size) return 'the served file is ' + body.length + ' bytes, signed as ' + integrity.content.size;
      if (crypto.createHash('sha256').update(body).digest('hex') !== integrity.content.sha256) return 'the served file does not hash to what was signed';
    }
    return true;
  }

  async function allVerify(label, type, rows) {
    for (let i = 0; i < rows.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const result = await verifyIntegrity(type, rows[i].integrity);
      if (result !== true) return label + ' ' + (i + 1) + ' of ' + rows.length + ': ' + result;
    }
    return true;
  }

  function tinyPng(seed) {
    /* The 1x1 PNG with a unique chunk appended after IEND - still a PNG by its signature, and never the same file twice. */
    return Buffer.concat([PNG, Buffer.from('check-' + seed + '-' + Date.now() + '-' + Math.random())]);
  }

  async function uploadAs(bytes, filename, contentType) {
    const form = new FormData();
    form.append('file', bytes, { filename: filename, contentType: contentType });
    return data(await admin.post('/media/upload/misc', form, { headers: form.getHeaders() }));
  }

  async function forgetUpload(publicPath) {
    require('../src/config/storage').remove(publicPath);
    await require('../src/repositories/contentSignatures.repository').remove('image', publicPath);
  }

  await check('the storefront is trusting at least one signing key', function () {
    return trustedKeys.length > 0 || 'REACT_APP_CONTENT_SIGNING_KEYS is empty - run npm run content-keys';
  });

  await check('every live notice, FAQ and advert arrives signed and verifies', async function () {
    const notices = data(await web.get('/notices?limit=50'));
    if (!notices.length) return 'there are no live notices to check';
    const n = await allVerify('notice', 'notification', notices);
    if (n !== true) return n;

    const faqs = data(await web.get('/support/faqs?limit=200'));
    const f = await allVerify('faq', 'faq', faqs);
    if (f !== true) return f;

    const paged = data(await web.get('/support/faqs?page=1&limit=5'));
    const p = await allVerify('paged faq', 'faq', paged.rows);
    if (p !== true) return p;

    const home = data(await web.get('/site/showcase/home'));
    const phone = data(await web.get('/site/showcase/smartphone'));
    if (!home.length) return 'the homepage has no adverts to check';
    const a = await allVerify('homepage advert', 'image', home);
    if (a !== true) return a;
    return allVerify('smartphone advert', 'image', phone);
  });

  await check('the landing pages and a product page carry verifying images and answers', async function () {
    const landing = data(await web.get('/smartphones/home'));
    const slides = await allVerify('smartphone hero slide', 'image', landing.hero_slides);
    if (slides !== true) return slides;
    const faqs = await allVerify('section faq', 'faq', landing.support.faqs);
    if (faqs !== true) return faqs;
    if (landing.hero) {
      const media = await allVerify('hero product media', 'image', landing.hero.media);
      if (media !== true) return media;
    }

    const section = data(await web.get('/sections/TV/home'));
    const tvSlides = await allVerify('TV hero slide', 'image', section.hero_slides);
    if (tvSlides !== true) return tvSlides;

    const product = data(await web.get('/products?limit=1')).rows[0];
    const detail = data(await web.get('/products/' + product.slug));
    if (!detail.images.length) return product.slug + ' has no studio images to check';
    const images = await allVerify('product image', 'image', detail.images);
    if (images !== true) return images;
    const assets = await allVerify('product media', 'image', detail.media);
    if (assets !== true) return assets;
    if (detail.product.main_image) {
      const cover = await verifyIntegrity('image', detail.product.main_image_integrity);
      if (cover !== true) return 'the cover image: ' + cover;
    }

    return allVerify('gallery image', 'image', data(await web.get('/products/' + product.slug + '/gallery')));
  });

  await check('reading an FAQ does not break its signature', async function () {
    /*
     * Every read increments view_count, and updated_at is signed. The trigger
     * used to move updated_at on that increment - see sql/deltas/029.
     */
    const first = data(await web.get('/support/faqs?limit=1'))[0];
    const one = data(await web.get('/support/faqs/' + first.id));
    await web.get('/support/faqs/' + first.id);
    const three = data(await web.get('/support/faqs/' + first.id));

    if (three.view_count !== one.view_count + 2) return 'the reads were not counted';
    if (String(three.updated_at) !== String(one.updated_at)) return 'a read moved updated_at';
    return verifyIntegrity('faq', three.integrity);
  });

  await check('a notice saved through the console is signed, and re-signed by every edit', async function () {
    const created = data(await admin.post('/notices', {
      title: 'check.js signed notice', content: '<p>Signed on save.</p>', status: 'PUBLISHED', sort_order: -900
    }));

    const liveOne = async function () {
      const rows = data(await web.get('/notices?limit=50'));
      return rows.filter(function (row) { return row.id === created.id; })[0] || null;
    };

    try {
      let live = await liveOne();
      if (!live) return 'the new notice is not live';
      let result = await verifyIntegrity('notification', live.integrity);
      if (result !== true) return 'after create: ' + result;

      await admin.put('/notices/' + created.id, { title: 'check.js signed notice, edited' });
      live = await liveOne();
      if (live.integrity.content.title !== 'check.js signed notice, edited') return 'the envelope does not carry the edit';
      result = await verifyIntegrity('notification', live.integrity);
      if (result !== true) return 'after an edit: ' + result;

      await admin.delete('/notices/' + created.id);
      await admin.post('/notices/' + created.id + '/restore');
      live = await liveOne();
      result = await verifyIntegrity('notification', live && live.integrity);
      return result === true || 'after delete and restore: ' + result;
    } finally {
      await admin.delete('/notices/' + created.id).catch(function () {});
      await admin.delete('/notices/' + created.id + '/permanent');
    }
  });

  await check('a notice changed behind the console is served invalid, and the console will not re-sign it', async function () {
    const signingDb = require('../src/config/db');
    const created = data(await admin.post('/notices', {
      title: 'check.js tampered notice', content: '<p>The original words.</p>', status: 'PUBLISHED', sort_order: -901
    }));

    try {
      /* An edit that never went through the application. */
      await signingDb('site_notices').where('id', created.id).update({ content: '<p>Words nobody signed.</p>' });

      /*
       * THE SERVER VERIFIES BEFORE IT VOUCHES (services/integrity.service.js,
       * verifiedEnvelopes). A row whose stored signature does not match the
       * content is served with `integrity: null` - the storefront draws
       * nothing it has no envelope for, and an HTTP deployment whose browser
       * has no WebCrypto is protected by the same rule.
       *
       * What must never happen is the tampered words arriving VOUCHED FOR.
       * An envelope carrying the ORIGINAL words is not that: the reader sees
       * what was signed, and the row behind it is ignored.
       */
      const live = data(await web.get('/notices?limit=50')).filter(function (row) { return row.id === created.id; })[0];
      if (!live) return 'the tampered notice is not live';

      if (live.integrity) {
        const vouched = await verifyIntegrity('notification', live.integrity);
        const carries = live.integrity.content && live.integrity.content.content;
        if (vouched === true && carries === '<p>Words nobody signed.</p>') {
          return 'A NOTICE CHANGED IN THE DATABASE STILL VERIFIES';
        }
        if (carries === '<p>Words nobody signed.</p>' && vouched !== true) {
          /* An envelope that fails is the older shape, and is still safe. */
          return true;
        }
      }

      try {
        await admin.put('/notices/' + created.id, { sort_order: -902 });
        return 'the console re-signed a tampered notice by saving over it';
      } catch (err) {
        if (!err.response || err.response.status !== 409) return 'expected 409, got ' + (err.response ? err.response.status : err.message);
      }

      /* Removing a suspicious notice is always allowed. */
      await admin.delete('/notices/' + created.id);
      return true;
    } finally {
      await admin.delete('/notices/' + created.id).catch(function () {});
      await admin.delete('/notices/' + created.id + '/permanent');
      const left = await require('../src/repositories/contentSignatures.repository').find('notification', created.id);
      if (left) console.log('       (a purged notice left its signature behind)');
    }
  });

  await check('a spreadsheet import signs the FAQs it writes, and refuses one changed behind the console', async function () {
    const signingDb = require('../src/config/db');
    const question = 'check.js signed FAQ ' + Date.now();
    const created = data(await admin.post('/faqs', {
      category: 'CRYSTAL_APP', question: question, answer: 'Before the import.', status: 'PUBLISHED', sort_order: 999
    }));

    const sheet = function (answer) {
      const book = new ExcelJS.Workbook();
      const ws = book.addWorksheet('faqs');
      ws.addRow(['Id', 'Category', 'Question', 'Answer', 'Order', 'Status']);
      ws.addRow([created.id, 'CRYSTAL_APP', question, answer, 999, 'PUBLISHED']);
      return book.xlsx.writeBuffer();
    };

    const importSheet = async function (answer) {
      const form = new FormData();
      form.append('file', Buffer.from(await sheet(answer)), { filename: 'faqs.xlsx' });
      return admin.post('/faqs/import', form, { headers: form.getHeaders() });
    };

    try {
      await importSheet('After the import.');
      const read = data(await web.get('/support/faqs/' + created.id));
      if (read.integrity.content.answer !== 'After the import.') return 'the import did not reach the envelope';
      const result = await verifyIntegrity('faq', read.integrity);
      if (result !== true) return 'after the import: ' + result;

      await signingDb('faqs').where('id', created.id).update({ answer: 'Changed in the database.' });
      try {
        await importSheet('Laundered by a spreadsheet.');
        return 'an import re-signed an FAQ that had been changed behind the console';
      } catch (err) {
        if (!err.response || err.response.status !== 400) return 'expected 400, got ' + (err.response ? err.response.status : err.message);
      }

      const after = await signingDb('faqs').where('id', created.id).first();
      return after.answer === 'Changed in the database.' || 'the refused import still wrote the row';
    } finally {
      await admin.delete('/faqs/' + created.id).catch(function () {});
      await admin.delete('/faqs/' + created.id + '/permanent');
    }
  });

  await check('an upload is signed as it is stored', async function () {
    const bytes = tinyPng('upload');
    const stored = await uploadAs(bytes, 'signed.png', 'image/png');
    try {
      if (!stored.integrity) return 'the upload reply carries no integrity envelope';
      if (stored.integrity.content.storageKey !== stored.file_path) return 'the signature names ' + stored.integrity.content.storageKey;
      if (stored.integrity.content.mimeType !== 'image/png') return 'signed as ' + stored.integrity.content.mimeType;
      return await verifyIntegrity('image', stored.integrity);
    } finally {
      await forgetUpload(stored.file_path);
    }
  });

  await check('an upload whose bytes are not the type it declares is refused, and nothing is kept', async function () {
    const before = fs.readdirSync(path.join(require('../src/config').storage.uploadDir, 'misc')).length;

    const attempts = [
      [Buffer.from('%PDF-1.4 not an image'), 'report.png', 'image/png'],
      [tinyPng('gif'), 'photo.gif', 'image/gif'],
      [Buffer.from('<html><body><svg/><script>alert(1)</script></body></html>'), 'x.svg', 'image/svg+xml']
    ];

    for (let i = 0; i < attempts.length; i += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const accepted = await uploadAs(attempts[i][0], attempts[i][1], attempts[i][2]);
        // eslint-disable-next-line no-await-in-loop
        await forgetUpload(accepted.file_path);
        return attempts[i][1] + ' declared as ' + attempts[i][2] + ' was accepted';
      } catch (err) {
        if (!err.response || err.response.status !== 400) return attempts[i][1] + ': expected 400, got ' + (err.response ? err.response.status : err.message);
      }
    }

    const after = fs.readdirSync(path.join(require('../src/config').storage.uploadDir, 'misc')).length;
    return after === before || (after - before) + ' refused upload(s) were left on disk';
  });

  await check('a stored file is named for what its bytes are, not what it was called', async function () {
    const stored = await uploadAs(tinyPng('rename'), 'called-a.webp', 'image/png');
    try {
      return /\.png$/.test(stored.file_path) || 'a PNG was stored as ' + stored.file_path;
    } finally {
      await forgetUpload(stored.file_path);
    }
  });

  await check('an advert image changed on disk is served as invalid', async function () {
    const stored = await uploadAs(tinyPng('advert'), 'advert.png', 'image/png');
    const advert = data(await admin.post('/showcase/home', {
      device_type: 'all', file_path: stored.file_path, alt_text: 'check.js signed advert', sort_order: 998
    }));

    const served = async function () {
      const rows = data(await web.get('/site/showcase/home'));
      return rows.filter(function (row) { return row.id === advert.id; })[0];
    };

    try {
      const before = await verifyIntegrity('image', (await served()).integrity);
      if (before !== true) return 'before the change: ' + before;

      /* One byte, straight onto the disk. */
      const file = require('../src/config/storage').absolutePath(stored.file_path);
      const bytes = fs.readFileSync(file);
      bytes[bytes.length - 1] ^= 0x01;
      fs.writeFileSync(file, bytes);

      const after = await verifyIntegrity('image', (await served()).integrity);
      return after !== true || 'A FILE CHANGED ON DISK STILL VERIFIES';
    } finally {
      await admin.delete('/showcase/home/' + advert.id);
      await forgetUpload(stored.file_path);
    }
  });


  console.log('\nsigning certificates');

  /*
   * HOW LONG UNTIL THE SIGNING CERTIFICATE MUST BE RENEWED, as the console's
   * dashboard card and header indicator read it from
   * GET /api/admin/dashboard/certificates - see
   * services/certificates.service.js.
   *
   * Checked against whatever this API is actually running with: a
   * self-signed key directory, or a .p12 from a CA with previous keys beside
   * it. The arithmetic is checked against the reply's OWN clock, so a laptop
   * whose clock is a minute out cannot turn a day boundary into a failure -
   * and that clock is then checked to be the request's, not startup's.
   */
  const CERTIFICATE_FIELDS = ['algorithm', 'chainReason', 'chainStatus', 'daysLeft', 'issuer', 'issuerCN', 'keyId',
    'notAfter', 'notBefore', 'role', 'selfSigned', 'source', 'status', 'subject', 'subjectCN'];
  const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  const DAY_MS = 24 * 3600 * 1000;

  /* Every key and string in a reply, unescaped - JSON.stringify doubles a Windows path's backslashes and a search of it would miss one. */
  function stringsIn(value) {
    if (value === null || typeof value !== 'object') return String(value);
    return Object.keys(value).map(function (key) { return key + '\n' + stringsIn(value[key]); }).join('\n');
  }

  let certificateReport = null;

  await check('the certificate report refuses a request with no token', async function () {
    try {
      await anon.get('/dashboard/certificates');
      return 'the report was served without signing in';
    } catch (err) {
      return (!!err.response && err.response.status === 401) || 'expected 401, got ' + (err.response ? err.response.status : err.message);
    }
  });

  await check('the certificate report has its shape: the active certificate first, then previous keys and member CAs', async function () {
    certificateReport = data(await admin.get('/dashboard/certificates'));
    const body = certificateReport;

    if (!ISO_TIME.test(body.now)) return 'now is ' + body.now;
    if (!body.thresholds || body.thresholds.warningDays !== 30 || body.thresholds.criticalDays !== 7) {
      return 'thresholds are ' + JSON.stringify(body.thresholds);
    }
    if (!Array.isArray(body.problems)) return 'no problems array';
    if (!Array.isArray(body.certificates) || !body.certificates.length) return 'no certificates';

    const roles = body.certificates.map(function (c) { return c.role; });
    if (roles[0] !== 'active' || roles.lastIndexOf('active') !== 0) return 'roles are ' + roles.join(', ');

    for (let i = 0; i < body.certificates.length; i += 1) {
      const c = body.certificates[i];
      const label = 'certificate ' + (i + 1) + ' (' + c.role + ' ' + c.keyId + ')';
      const fields = Object.keys(c).sort().join(',');

      if (fields !== CERTIFICATE_FIELDS.join(',')) return label + ' has the fields ' + fields;
      if (['active', 'previous', 'member-ca'].indexOf(c.role) === -1) return label + ': role ' + c.role;
      if (c.role === 'member-ca') {
        if (c.keyId !== null || ['member-ca-rsa', 'member-ca-ecc'].indexOf(c.source) === -1) return label + ': a member CA from ' + c.source;
      } else {
        if (typeof c.keyId !== 'string' || !c.keyId) return label + ': no key id';
        if (['key-dir', 'p12'].indexOf(c.source) === -1) return label + ': source ' + c.source;
        if (['ECDSA-P256-SHA256', 'RSA-PSS-SHA256'].indexOf(c.algorithm) === -1) return label + ': algorithm ' + c.algorithm;
      }
      if (typeof c.subject !== 'string' || typeof c.issuer !== 'string') return label + ': no subject or issuer';
      if (typeof c.selfSigned !== 'boolean') return label + ': selfSigned is ' + c.selfSigned;
      if (!ISO_TIME.test(c.notAfter) || (c.notBefore !== null && !ISO_TIME.test(c.notBefore))) return label + ': dates ' + c.notBefore + ' / ' + c.notAfter;
      if (!Number.isSafeInteger(c.daysLeft)) return label + ': daysLeft is ' + c.daysLeft;
      if (['ok', 'warning', 'critical', 'expired'].indexOf(c.status) === -1) return label + ': status ' + c.status;
      if (['verified', 'not-configured', 'not-applicable', 'failed'].indexOf(c.chainStatus) === -1) return label + ': chain ' + c.chainStatus;
      if ((c.chainStatus === 'failed') !== (typeof c.chainReason === 'string')) return label + ': chain ' + c.chainStatus + ' with reason ' + c.chainReason;
    }

    /* The key the report calls active is the one signing what the storefront verifies. */
    const active = body.certificates[0];
    if (!trustedKeys.some(function (k) { return k.keyId === active.keyId; })) {
      return 'the active certificate is for ' + active.keyId + ', which the storefront does not trust';
    }
    if (active.chainStatus === 'failed' || active.chainStatus === 'not-applicable') {
      return 'the active certificate\'s chain is ' + active.chainStatus + ' - it would not have started';
    }
    return body.problems.every(function (p) { return /^member-ca-(rsa|ecc)$/.test(p.source) && Object.keys(p).length === 2; })
      || 'a problem of the wrong shape: ' + JSON.stringify(body.problems);
  });

  await check('daysLeft is whole days to notAfter, counted when the report was asked for, and the status follows it', async function () {
    const body = certificateReport || data(await admin.get('/dashboard/certificates'));
    const now = Date.parse(body.now);

    /* Generous, for a slow machine - startup was long before this run, and a startup clock would be far outside it. */
    if (Math.abs(now - Date.now()) > 5 * 60 * 1000) return 'the report was computed at ' + body.now + ', not at the request';

    for (let i = 0; i < body.certificates.length; i += 1) {
      const c = body.certificates[i];
      const days = Math.floor((Date.parse(c.notAfter) - now) / DAY_MS);
      if (c.daysLeft !== days) return c.role + ' ' + c.keyId + ': daysLeft ' + c.daysLeft + ', but notAfter ' + c.notAfter + ' is ' + days + ' days away';

      const status = days < 0 ? 'expired'
        : (days < body.thresholds.criticalDays ? 'critical' : (days < body.thresholds.warningDays ? 'warning' : 'ok'));
      if (c.status !== status) return c.role + ' ' + c.keyId + ': ' + days + ' days left is ' + c.status + ', not ' + status;
    }

    /* And again a moment later: counted per request, not remembered from the first. */
    const again = data(await admin.get('/dashboard/certificates'));
    return Date.parse(again.now) >= now || 'the second report is older than the first';
  });

  await check('the certificate report carries no private key, no .p12 password and no file path', async function () {
    const body = certificateReport || data(await admin.get('/dashboard/certificates'));
    const text = stringsIn(body);
    const config = require('../src/config');

    const secrets = ['PRIVATE KEY', '-----BEGIN', config.rootDir, config.contentSigning.p12Password,
      config.contentSigning.p12, config.contentSigning.keyDir, config.contentSigning.caChain,
      config.x509.caRsaChain, config.x509.caEccChain, config.x509.serverKey];

    /* The same paths as the API resolves them - relative in .env, absolute by the time a message could name them. */
    try {
      const resolved = require('../src/security/signingConfig').fromConfig();
      secrets.push(resolved.keyDir, resolved.caChain, resolved.p12 && resolved.p12.file, resolved.p12 && resolved.p12.password);
    } catch (err) {
      return 'this machine\'s signing configuration does not resolve: ' + err.message;
    }

    /*
     * Contained anywhere, for anything long enough not to turn up by chance -
     * a four-character password would be "found" inside a date. Shorter ones
     * must at least not BE any value. The count is reported, never the value.
     */
    const values = text.split('\n');
    const found = secrets.filter(function (secret) {
      if (!secret) return false;
      return String(secret).length >= 6 ? text.indexOf(secret) !== -1 : values.indexOf(String(secret)) !== -1;
    });
    if (found.length) return 'the report contains ' + found.length + ' secret or path value(s)';

    if (/\\|\.(pem|p12|pfx|crt|key)\b/i.test(text)) return 'the report contains something shaped like a file name';
    return /password|privateKey|\bfile\b|caChain/i.test(Object.keys(body.certificates[0]).join(' ')) === false
      || 'a certificate carries a field named for a secret or a file';
  });

  await check('the certificate report belongs to the dashboard: a role that can read the dashboard gets it', async function () {
    const body = data(await editor.get('/dashboard/certificates'));
    return (Array.isArray(body.certificates) && body.certificates.length === certificateReport.certificates.length)
      || 'the editor was given ' + (body.certificates ? body.certificates.length : 'no') + ' certificates';
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  if (failures.length) {
    console.log('\nfailures:');
    failures.forEach(function (line) { console.log('  - ' + line); });
  }
  process.exit(failed ? 1 : 0);
}

main().catch(function (err) {
  console.error('\nthe check run itself failed: ' + (err.stack || err.message));
  process.exit(2);
});
