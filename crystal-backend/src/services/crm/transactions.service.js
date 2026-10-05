const db = require('../../config/db');
const { HttpError } = require('../../utils/response');
const { searchId } = require('./partyId');

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
 *   txn.parties [{ party_pk, party_role_code }]
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
    service_center_id: txn.service_center_id || null,
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
    await trx.raw(`INSERT INTO crm_transaction_party (transaction_id, party_pk, party_role_code) VALUES (?, ?, ?)
                   ON CONFLICT (transaction_id, party_pk, party_role_code) DO NOTHING`, [id, participant.party_pk, participant.party_role_code]);
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
  const qb = db('crm_transaction as txn')
    .join('crm_project as project', 'project.project_id', 'txn.project_id')
    .leftJoin('crm_transaction_party as tp', function () {
      this.on('tp.transaction_id', 'txn.transaction_id').andOn('tp.party_role_code', db.raw("'BUYER'"));
    })
    .leftJoin('crm_party as party', 'party.party_pk', 'tp.party_pk')
    .leftJoin('crm_service_center as center', 'center.service_center_id', 'txn.service_center_id');

  if (filters.project_id) qb.where('txn.project_id', filters.project_id);
  if (filters.transaction_type_code) qb.where('txn.transaction_type_code', filters.transaction_type_code);
  if (filters.party_pk) qb.where('tp.party_pk', filters.party_pk);
  if (filters.from) qb.where('txn.transaction_at', '>=', filters.from);
  if (filters.to) qb.where('txn.transaction_at', '<', db.raw('?::date + 1', [filters.to]));
  if (filters.counted === '1') qb.whereIn('txn.transaction_status', COUNTED_STATUSES);
  if (filters.q) {
    const like = '%' + String(filters.q).trim() + '%';
    qb.where(function () {
      this.where('txn.external_transaction_id', 'ilike', like).orWhere('party.display_name', 'ilike', like)
        .orWhereRaw('??::text ILIKE ?', ['party.party_pk', searchId(like)]);
    });
  }
  return qb;
}

async function search(filters, paging) {
  const count = await query(filters).countDistinct({ total: 'txn.transaction_id' }).first();
  const totals = await query(filters).whereIn('txn.transaction_status', COUNTED_STATUSES)
    .select(db.raw('COALESCE(SUM(txn.reporting_net_amount), 0) AS reporting_net, COUNT(*)::int AS counted'))
    .first();
  const sort = {
    transaction_at: 'txn.transaction_at', net_amount: 'txn.net_amount', reporting_net_amount: 'txn.reporting_net_amount'
  }[paging.sort] || 'txn.transaction_at';
  const rows = await query(filters)
    .select('txn.*', 'project.project_code', 'party.party_pk', 'party.display_name as party_name',
      'center.service_center_name',
      db.raw('(txn.transaction_status IN (' + COUNTED_STATUSES.map(function () { return '?'; }).join(', ') + ')) AS is_counted', COUNTED_STATUSES),
      db.raw('(SELECT COUNT(*) FROM crm_transaction_item item WHERE item.transaction_id = txn.transaction_id)::int AS item_cnt'),
      db.raw('(SELECT COUNT(*) FROM crm_transaction refund WHERE refund.original_transaction_id = txn.transaction_id)::int AS refund_cnt'))
    .orderBy(sort, paging.dir).limit(paging.limit).offset(paging.offset);
  return { rows: rows, total: Number(count.total), summary: totals };
}

async function detail(id) {
  const txn = await query({}).where('txn.transaction_id', id)
    .leftJoin('crm_transaction as original_txn', 'original_txn.transaction_id', 'txn.original_transaction_id')
    .first('txn.*', 'project.project_code', 'project.project_name', 'center.service_center_name',
      'original_txn.external_transaction_id as original_external_id');
  if (!txn) throw new HttpError(404, 'common.notFound');

  const [parties, items, refunds, cases, points] = await Promise.all([
    db('crm_transaction_party as tp').join('crm_party as party', 'party.party_pk', 'tp.party_pk')
      .where('tp.transaction_id', id).select('tp.*', 'party.party_pk', 'party.display_name as party_name'),
    db('crm_transaction_item as item')
      .leftJoin('crm_product_catalog as product', 'product.product_id', 'item.product_id')
      .leftJoin('crm_product_instance as pi', 'pi.product_instance_id', 'item.product_instance_id')
      .where('item.transaction_id', id).orderBy('item.transaction_item_id')
      .select('item.*', 'product.product_name', 'product.product_code', 'pi.external_product_instance_id'),
    db('crm_transaction').where('original_transaction_id', id).orderBy('transaction_at')
      .select('transaction_id', 'external_transaction_id', 'transaction_type_code', 'transaction_status', 'net_amount',
        'currency_code', 'transaction_at'),
    db('crm_service_case').where('related_transaction_id', id).select('case_id', 'external_case_id', 'received_at'),
    db('crm_point_event as point_event')
      .join('crm_point_event_type as event_type', 'event_type.point_event_type_id', 'point_event.point_event_type_id')
      .where('point_event.related_transaction_id', id)
      .select('point_event.point_event_id', 'point_event.points_delta', 'point_event.occurred_at', 'event_type.event_code')
  ]);

  return { transaction: txn, parties: parties, items: items, refunds: refunds, cases: cases, points: points };
}

module.exports = {
  COUNTED_STATUSES: COUNTED_STATUSES,
  upsert: upsert,
  search: search,
  detail: detail
};
