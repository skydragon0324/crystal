const db = require('../../config/db');
const { HttpError } = require('../../utils/response');

/**
 * TRANSACTIONS - design section 3.5 / 7.
 *
 * A transaction here is a business fact, not an order workflow: what was
 * bought, by whom, for how much, when. Each project's adapter upserts its own
 * by (project, external transaction id), so a re-import changes the status of
 * a known order rather than adding it twice.
 *
 * REFUNDS ARE THEIR OWN ROWS. A refund, return or reversal is a new
 * transaction pointing at the original through original_transaction_id; the
 * sale is never edited into a refund. Amounts follow one sign convention
 * across every project: a sale is positive, a refund negative - so Dream-wide
 * spend is a plain sum of reporting_net_amount.
 *
 * COUNTED vs NOT COUNTED. Only transactions in a completed state count
 * towards spend and frequency; a cancelled or failed order is kept for the
 * record and left out of the figures. COUNTED_STATUSES is the one list both
 * the analysis and the screens read.
 */

const COUNTED_STATUSES = ['COMPLETED', 'PAID', 'DELIVERED', 'FINISHED', 'ACCEPTED', 'DELIVERING', 'REFUNDED', 'SUCCESS'];
const NEGATIVE_TYPES = ['REFUND', 'RETURN', 'REVERSAL'];

function round4(value) {
  return value === null || value === undefined ? null : Math.round(Number(value) * 10000) / 10000;
}

/**
 * Insert or refresh one transaction with its parties and lines.
 *
 *   txn.project_id, external_transaction_id, transaction_type_code, transaction_status,
 *   currency_code, net_amount (signed by the convention above), transaction_at   required
 *   txn.original_transaction_id     for a refund
 *   txn.reporting_net_amount         defaults to net_amount when the currency is the reporting one
 *   txn.parties [{ party_id, party_role_code }]
 *   txn.items   [{ product_id, product_instance_id, external_item_id, quantity, unit_price, net_amount }]
 */
async function upsert(trx, txn, reporting) {
  const net = round4(txn.net_amount);
  if (NEGATIVE_TYPES.indexOf(txn.transaction_type_code) !== -1 && net > 0) throw new Error('a refund must be negative');

  let reportingNet = txn.reporting_net_amount;
  if (reportingNet === undefined) reportingNet = txn.currency_code === reporting ? net : null;

  const values = {
    project_id: txn.project_id,
    external_transaction_id: String(txn.external_transaction_id),
    original_transaction_id: txn.original_transaction_id || null,
    transaction_type_code: txn.transaction_type_code,
    transaction_status: txn.transaction_status,
    currency_code: txn.currency_code,
    gross_amount: txn.gross_amount === undefined ? net : round4(txn.gross_amount),
    discount_amount: round4(txn.discount_amount) || 0,
    net_amount: net,
    reporting_currency_code: reportingNet === null ? null : reporting,
    reporting_net_amount: round4(reportingNet),
    points_used: txn.points_used ? round4(txn.points_used) : null,
    sales_channel_code: txn.sales_channel_code || null,
    service_location_id: txn.service_location_id || null,
    transaction_at: txn.transaction_at,
    source_created_at: txn.source_created_at || txn.transaction_at,
    source_updated_at: txn.source_updated_at || null,
    ingested_at: trx.fn.now()
  };

  const existing = await trx('crm_transaction')
    .where({ project_id: values.project_id, external_transaction_id: values.external_transaction_id }).first('transaction_id');

  let id;
  if (existing) {
    id = existing.transaction_id;
    await trx('crm_transaction').where('transaction_id', id).update(values);
  } else {
    const rows = await trx('crm_transaction').insert(values).returning('transaction_id');
    id = typeof rows[0] === 'object' ? rows[0].transaction_id : rows[0];
  }

  for (let index = 0; index < (txn.parties || []).length; index += 1) {
    const participant = txn.parties[index];
    // eslint-disable-next-line no-await-in-loop
    await trx.raw(`INSERT INTO crm_transaction_party (transaction_id, party_id, party_role_code) VALUES (?, ?, ?)
                   ON CONFLICT (transaction_id, party_id, party_role_code) DO NOTHING`, [id, participant.party_id, participant.party_role_code]);
  }

  if (txn.items) {
    await trx('crm_transaction_item').where('transaction_id', id).del();
    if (txn.items.length) {
      await trx('crm_transaction_item').insert(txn.items.map(function (item) {
        return {
          transaction_id: id,
          product_id: item.product_id || null,
          product_instance_id: item.product_instance_id || null,
          external_item_id: item.external_item_id ? String(item.external_item_id) : null,
          quantity: item.quantity === undefined ? 1 : item.quantity,
          unit_price: round4(item.unit_price),
          gross_amount: round4(item.gross_amount === undefined ? item.net_amount : item.gross_amount),
          discount_amount: round4(item.discount_amount),
          net_amount: round4(item.net_amount)
        };
      }));
    }
  }

  return { transaction_id: id, created: !existing };
}

/* ------------------------------------------------------------ reads */

function query(filters) {
  const qb = db('crm_transaction as x')
    .join('crm_project as j', 'j.project_id', 'x.project_id')
    .leftJoin('crm_transaction_party as tp', function () {
      this.on('tp.transaction_id', 'x.transaction_id').andOn('tp.party_role_code', db.raw("'BUYER'"));
    })
    .leftJoin('crm_party as p', 'p.party_id', 'tp.party_id')
    .leftJoin('crm_service_location as l', 'l.service_location_id', 'x.service_location_id');

  if (filters.project_id) qb.where('x.project_id', filters.project_id);
  if (filters.transaction_type_code) qb.where('x.transaction_type_code', filters.transaction_type_code);
  if (filters.party_id) qb.where('tp.party_id', filters.party_id);
  if (filters.from) qb.where('x.transaction_at', '>=', filters.from);
  if (filters.to) qb.where('x.transaction_at', '<', db.raw('?::date + 1', [filters.to]));
  if (filters.counted === '1') qb.whereIn('x.transaction_status', COUNTED_STATUSES);
  if (filters.q) {
    const like = '%' + String(filters.q).trim() + '%';
    qb.where(function () {
      this.where('x.external_transaction_id', 'ilike', like).orWhere('p.display_name', 'ilike', like)
        .orWhere('p.party_no', 'ilike', like);
    });
  }
  return qb;
}

async function search(filters, paging) {
  const count = await query(filters).countDistinct({ c: 'x.transaction_id' }).first();
  const totals = await query(filters).whereIn('x.transaction_status', COUNTED_STATUSES)
    .select(db.raw('COALESCE(SUM(x.reporting_net_amount), 0) AS reporting_net, COUNT(*)::int AS counted'))
    .first();
  const sort = { transaction_at: 'x.transaction_at', net_amount: 'x.net_amount', reporting_net_amount: 'x.reporting_net_amount' }[paging.sort]
    || 'x.transaction_at';
  const rows = await query(filters)
    .select('x.*', 'j.project_code', 'p.party_id', 'p.party_no', 'p.display_name as party_name', 'l.location_name',
      db.raw('(x.transaction_status IN (' + COUNTED_STATUSES.map(function () { return '?'; }).join(', ') + ')) AS is_counted', COUNTED_STATUSES),
      db.raw('(SELECT COUNT(*) FROM crm_transaction_item i WHERE i.transaction_id = x.transaction_id)::int AS item_cnt'),
      db.raw('(SELECT COUNT(*) FROM crm_transaction r WHERE r.original_transaction_id = x.transaction_id)::int AS refund_cnt'))
    .orderBy(sort, paging.dir).limit(paging.limit).offset(paging.offset);
  return { rows: rows, total: Number(count.c), summary: totals };
}

async function detail(id) {
  const txn = await query({}).where('x.transaction_id', id)
    .leftJoin('crm_transaction as o', 'o.transaction_id', 'x.original_transaction_id')
    .first('x.*', 'j.project_code', 'j.project_name', 'l.location_name', 'o.external_transaction_id as original_external_id');
  if (!txn) throw new HttpError(404, 'common.notFound');

  const [parties, items, refunds, cases, points] = await Promise.all([
    db('crm_transaction_party as tp').join('crm_party as p', 'p.party_id', 'tp.party_id')
      .where('tp.transaction_id', id).select('tp.*', 'p.party_no', 'p.display_name as party_name'),
    db('crm_transaction_item as i')
      .leftJoin('crm_product_catalog as c', 'c.product_id', 'i.product_id')
      .leftJoin('crm_product_instance as pi', 'pi.product_instance_id', 'i.product_instance_id')
      .where('i.transaction_id', id).orderBy('i.transaction_item_id')
      .select('i.*', 'c.product_name', 'c.product_code', 'pi.external_product_instance_id'),
    db('crm_transaction').where('original_transaction_id', id).orderBy('transaction_at')
      .select('transaction_id', 'external_transaction_id', 'transaction_type_code', 'transaction_status', 'net_amount',
        'currency_code', 'transaction_at'),
    db('crm_service_case').where('related_transaction_id', id).select('case_id', 'external_case_id', 'received_at'),
    db('crm_point_event as e').join('crm_point_event_type as t', 't.point_event_type_id', 'e.point_event_type_id')
      .where('e.related_transaction_id', id).select('e.point_event_id', 'e.points_delta', 'e.occurred_at', 't.event_code')
  ]);

  return { transaction: txn, parties: parties, items: items, refunds: refunds, cases: cases, points: points };
}

module.exports = {
  COUNTED_STATUSES: COUNTED_STATUSES,
  upsert: upsert,
  search: search,
  detail: detail
};
