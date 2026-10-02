const db = require('../../config/db');

/**
 * ONE BOX FOR THE WHOLE CRM: customers, orders, products, service cases and
 * campaigns that match what was typed, a few of each.
 *
 * A customer is found by name, number, phone or email; an order by its
 * project's order number; a product by serial, IMEI or key; a case by its
 * number or title; a campaign by name or code. Each hit carries the party it
 * belongs to where there is one, so the console can open the customer.
 */

const EACH = 5;

async function search(term) {
  const text = String(term || '').trim();
  if (text.length < 2) return { customers: [], orders: [], products: [], cases: [], campaigns: [] };
  const like = '%' + text.replace(/[%_\\]/g, '\\$&') + '%';
  const digits = text.replace(/\D/g, '');

  const [customers, orders, products, cases, campaigns] = await Promise.all([
    db('crm_party as p').whereNot('p.party_status', 'DELETED')
      .where(function () {
        this.where('p.display_name', 'ilike', like).orWhere('p.party_no', 'ilike', like)
          .orWhereExists(db('crm_contact_point as c').whereRaw('c.party_id = p.party_id')
            .where(function () {
              this.where('c.contact_value', 'ilike', like);
              if (digits.length >= 4) this.orWhere('c.normalized_value', 'like', '%' + digits + '%');
            }));
      })
      .orderByRaw("p.party_status = 'ACTIVE' DESC, p.display_name").limit(EACH)
      .select('p.party_id', 'p.party_no', 'p.display_name', 'p.party_type', 'p.party_status'),
    db('crm_transaction as x').join('crm_project as j', 'j.project_id', 'x.project_id')
      .leftJoin('crm_transaction_party as tp', function () { this.on('tp.transaction_id', 'x.transaction_id').andOn('tp.party_role_code', db.raw("'BUYER'")); })
      .leftJoin('crm_party as p', 'p.party_id', 'tp.party_id')
      .where('x.external_transaction_id', 'ilike', like).orderBy('x.transaction_at', 'desc').limit(EACH)
      .select('x.transaction_id', 'x.external_transaction_id', 'x.transaction_at', 'x.net_amount', 'x.currency_code',
        'j.project_code', 'p.party_id', 'p.display_name as party_name'),
    db('crm_product_instance as i').join('crm_product_catalog as c', 'c.product_id', 'i.product_id')
      .leftJoin('crm_product_registration as r', function () { this.on('r.product_instance_id', 'i.product_instance_id').andOnNull('r.valid_to'); })
      .leftJoin('crm_party as p', 'p.party_id', 'r.party_id')
      .where(function () {
        this.where('i.serial_number', 'ilike', like).orWhere('i.imei', 'ilike', like).orWhere('i.external_product_instance_id', 'ilike', like);
      })
      .limit(EACH)
      .select('i.product_instance_id', 'i.serial_number', 'i.imei', 'i.external_product_instance_id', 'c.product_name',
        'p.party_id', 'p.display_name as party_name'),
    db('crm_service_case as s').join('crm_party as p', 'p.party_id', 's.party_id')
      .where(function () { this.where('s.external_case_id', 'ilike', like).orWhere('s.title', 'ilike', like); })
      .orderBy('s.received_at', 'desc').limit(EACH)
      .select('s.case_id', 's.external_case_id', 's.title', 's.received_at', 'p.party_id', 'p.display_name as party_name'),
    db('crm_campaign').where(function () { this.where('campaign_name', 'ilike', like).orWhere('campaign_code', 'ilike', like); })
      .orderBy('campaign_id', 'desc').limit(EACH)
      .select('campaign_id', 'campaign_code', 'campaign_name', 'campaign_status')
  ]);

  return { customers: customers, orders: orders, products: products, cases: cases, campaigns: campaigns };
}

module.exports = { search: search };
