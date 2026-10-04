const db = require('../../config/db');
const { searchId } = require('./partyId');

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
    db('crm_party as party').whereNot('party.party_status', 'DELETED')
      .where(function () {
        this.where('party.display_name', 'ilike', like).orWhere('party.party_id', 'ilike', searchId(like))
          .orWhereExists(db('crm_contact_point as contact').whereRaw('contact.party_id = party.party_id')
            .where(function () {
              this.where('contact.contact_value', 'ilike', like);
              if (digits.length >= 4) this.orWhere('contact.normalized_value', 'like', '%' + digits + '%');
            }));
      })
      .orderByRaw("party.party_status = 'ACTIVE' DESC, party.display_name").limit(EACH)
      .select('party.party_id', 'party.party_id', 'party.display_name', 'party.party_type', 'party.party_status'),
    db('crm_transaction as sale').join('crm_project as project', 'project.project_id', 'sale.project_id')
      .leftJoin('crm_transaction_party as tp', function () { this.on('tp.transaction_id', 'sale.transaction_id').andOn('tp.party_role_code', db.raw("'BUYER'")); })
      .leftJoin('crm_party as party', 'party.party_id', 'tp.party_id')
      .where('sale.external_transaction_id', 'ilike', like).orderBy('sale.transaction_at', 'desc').limit(EACH)
      .select('sale.transaction_id', 'sale.external_transaction_id', 'sale.transaction_at', 'sale.net_amount', 'sale.currency_code',
        'project.project_code', 'party.party_id', 'party.display_name as party_name'),
    db('crm_product_instance as instance').join('crm_product_catalog as catalog', 'catalog.product_id', 'instance.product_id')
      .leftJoin('crm_product_registration as registration', function () { this.on('registration.product_instance_id', 'instance.product_instance_id').andOnNull('registration.valid_to'); })
      .leftJoin('crm_party as party', 'party.party_id', 'registration.party_id')
      .where(function () {
        this.where('instance.serial_number', 'ilike', like).orWhere('instance.imei', 'ilike', like).orWhere('instance.external_product_instance_id', 'ilike', like);
      })
      .limit(EACH)
      .select('instance.product_instance_id', 'instance.serial_number', 'instance.imei', 'instance.external_product_instance_id', 'catalog.product_name',
        'party.party_id', 'party.display_name as party_name'),
    db('crm_service_case as service_case').join('crm_party as party', 'party.party_id', 'service_case.party_id')
      .where(function () { this.where('service_case.external_case_id', 'ilike', like).orWhere('service_case.title', 'ilike', like); })
      .orderBy('service_case.received_at', 'desc').limit(EACH)
      .select('service_case.case_id', 'service_case.external_case_id', 'service_case.title', 'service_case.received_at', 'party.party_id', 'party.display_name as party_name'),
    db('crm_campaign').where(function () { this.where('campaign_name', 'ilike', like).orWhere('campaign_code', 'ilike', like); })
      .orderBy('campaign_id', 'desc').limit(EACH)
      .select('campaign_id', 'campaign_code', 'campaign_name', 'campaign_status')
  ]);

  return { customers: customers, orders: orders, products: products, cases: cases, campaigns: campaigns };
}

module.exports = { search: search };
