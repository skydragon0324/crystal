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

    uploaded.forEach(function (publicPath) { store.remove(publicPath); });

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
      return 'a category outside crystal_system was accepted';
    } catch (err) {
      if (!err.response) return 'no reply at all';
      if (err.response.status !== 400) {
        return 'answered ' + err.response.status + ', not 400';
      }
      // The database names the type and the value; that is the useful half.
      const message = String(err.response.data.message || '');
      return message.indexOf('crystal_system') !== -1
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

    walk(path.join(__dirname, '..', 'src')).forEach(function (file) {
      if (/[\\/]i18n[\\/]/.test(file)) return;

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
          if (byText[text]) offenders.push(path.basename(file) + ':' + (i + 1) + ' ' + byText[text]);
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

  await check('the FAQ is filed by system, and the chips are in reading order', async function () {
    const chips = data(await web.get('/support/faqs/categories'));
    if (!chips.length) return 'no categories';

    const allowed = ['SMARTPHONE', 'EPRODUCT', 'ESHOP', 'APPSTORE', 'CRYSTAL_APP'];
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

  await check('the About page answers with its pictures, not its words', async function () {
    const body = data(await web.get('/about'));

    /*
     * THE CONTRACT INVERTED, and this check inverted with it.
     *
     * /about used to answer with eleven chapters of copy out of three tables,
     * and this asserted every one of them was present. The copy is in
     * crystal-web/src/pages/about/content.js now - a company's account of
     * itself is not content that turns over - and the endpoint answers with
     * the one thing that is still data: the photographs, keyed by the slot the
     * page asks for them by. See sql/deltas/019.
     *
     * So what is worth asserting is that every slot the page asks for has a
     * picture behind it. A missing slot is a visible hole in a long scroll.
     */
    if (!body.images) return 'the reply carries no image map';

    const wanted = ['hero', 'overview', 'businesses', 'growth', 'institute',
      'factory', 'manufacturing', 'shop', 'service', 'presence', 'certificate'];

    const missing = wanted.filter(function (slot) {
      return !body.images[slot] || !body.images[slot].length;
    });
    if (missing.length) return 'no picture for ' + missing.join(', ');

    /* The gallery slot is the one that genuinely holds many. */
    if (body.images.certificate.length < 10) {
      return 'only ' + body.images.certificate.length + ' certificates';
    }

    /*
     * Every picture carries a path and alt text. A slot with a row but no file
     * renders a broken image, which is worse than an empty band.
     */
    const slots = Object.keys(body.images);
    for (let i = 0; i < slots.length; i += 1) {
      const rows = body.images[slots[i]];
      for (let j = 0; j < rows.length; j += 1) {
        if (!rows[j].src) return slots[i] + ' has a row with no file';
      }
    }

    /*
     * AND THE WORDS ARE NOT HERE. If a chapter of copy ever comes back from
     * this endpoint again, two sources for the same sentence exist and they
     * will drift.
     */
    const leaked = ['overview', 'vision', 'businesses', 'history']
      .filter(function (key) { return body[key] !== undefined; });

    return leaked.length === 0
      || 'the endpoint is answering with copy again: ' + leaked.join(', ');
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

  const memberSession = data(await web.post('/auth/login', {
    user_id: demoLogin, password: 'crystal1234'
  }));
  const member = client(memberSession.token, api + '/account');

  await check('the member dashboard assembles', async function () {
    const body = data(await member.get('/dashboard'));
    return (!!body.wallet && Array.isArray(body.devices)) || 'the dashboard came back incomplete';
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
    const board = data(await theirs.get('/dashboard'));

    if (!board.repairs.length) return withOwner.customer_email + ' has nothing in for repair';
    const unlabelled = board.repairs.filter(function (row) { return !row.status_label; });
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
    const all = data(await member.get('/points?limit=20'));
    if (!all.rows.length) return 'the ledger is empty';

    /* Newest first, whichever of the six tables each row came out of. */
    for (let i = 1; i < all.rows.length; i += 1) {
      if (new Date(all.rows[i - 1].at) < new Date(all.rows[i].at)) {
        return 'the merged ledger is out of order';
      }
    }

    const seen = {};
    all.rows.forEach(function (row) { seen[row.source] = true; });
    if (Object.keys(seen).length < 2) return 'only one system appears in the unfiltered ledger';

    const one = data(await member.get('/points?limit=10&source=KARAOKE'));
    const wrong = one.rows.filter(function (row) { return row.source !== 'KARAOKE'; });
    return wrong.length === 0 || wrong.length + ' rows ignored the source filter';
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
      seen[views[i]] = body.rows[0].kind;
      /* eslint-enable no-await-in-loop */
    }

    /*
     * The three are the same call with a different type, so the kind on the
     * rows has to differ - identical kinds would mean the view parameter is
     * being ignored and all three menu entries show the same list.
     */
    const kinds = Object.keys(seen).map(function (k) { return seen[k]; });
    const distinct = kinds.filter(function (k, i) { return kinds.indexOf(k) === i; });

    return distinct.length === 3 || 'the three views returned the same kind: ' + kinds.join(', ');
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
    const known = ['PAY', 'CHARGE', 'REFUND', 'TRANSFER', 'AWARD', 'USE', 'EXPIRE'];
    const inbound = ['CHARGE', 'REFUND', 'AWARD'];

    const body = data(await member.get('/eshop/log?limit=25&view=TRANSACTIONS'));
    if (!body.rows.length) return 'the transaction log came back empty';

    const unnamed = body.rows.filter(function (row) { return known.indexOf(row.fill) === -1; });
    if (unnamed.length) return unnamed.length + ' rows carry a fill type outside the set';

    const backwards = body.rows.filter(function (row) {
      return (inbound.indexOf(row.fill) > -1) !== (row.amount > 0);
    });

    return backwards.length === 0 || backwards.length + ' rows move the wrong way for their type';
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
     * This service disagrees with itself about what `code` means: 0 is
     * SUCCESS on the registration log, and on the three keygen logs 0 is the
     * only value that is NOT a failure. Reading either the wrong way round
     * does not error - it turns every good response into an empty list, so
     * "all four lists came back with rows" is the assertion that catches it.
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
    return body.total <= 6
      || body.total + ' rows came back where at most 6 can pass the filters';
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
    return unexplained.length === 0 || unexplained.length + ' prizes say nothing about what for';
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

  await check('the dashboard gathers every system in one call', async function () {
    const board = data(await member.get('/dashboard'));

    /* Six point systems, two Eshop values and the Appstore coins. */
    if (!board.standing || board.standing.length < 7) {
      return 'only ' + ((board.standing || []).length) + ' balances came back';
    }

    const units = {};
    board.standing.forEach(function (row) { units[row.unit] = true; });
    if (Object.keys(units).length < 2) return 'every balance claims the same unit';

    /* And the stream has to be one timeline, not three lists concatenated. */
    if (!board.stream || board.stream.length < 3) return 'the stream is empty';

    for (let i = 1; i < board.stream.length; i += 1) {
      if (new Date(board.stream[i - 1].at) < new Date(board.stream[i].at)) {
        return 'the dashboard stream is out of order';
      }
    }

    const kinds = {};
    board.stream.forEach(function (row) { kinds[row.kind] = true; });
    return Object.keys(kinds).length > 1 || 'the stream only has one kind of event in it';
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
      if (message.indexOf('crystal_system') === -1) return 'no vocabulary: ' + message;
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
