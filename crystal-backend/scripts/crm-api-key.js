/**
 * Department API keys for /api/integration/crm.
 *
 *   npm run crm:api-key -- issue ESHOP "Eshop production"
 *   npm run crm:api-key -- list
 *   npm run crm:api-key -- revoke 3
 *
 * An issued key is printed once; only its hash is stored. Hand it to the
 * department through a secret store, never in a ticket or a chat.
 */
const db = require('../src/config/db');
const apiKeys = require('../src/services/crm/projectApiKeys.service');

async function main() {
  const [command, first, second] = process.argv.slice(2);
  if (command === 'issue' && first) {
    const issued = await apiKeys.issue(first, second);
    console.log('key ' + issued.api_key_id + ' for ' + issued.project_code + ' (shown once):');
    console.log(issued.key);
  } else if (command === 'list') {
    console.table(await apiKeys.list());
  } else if (command === 'revoke' && /^[1-9][0-9]*$/.test(String(first))) {
    console.log((await apiKeys.revoke(first)) ? 'revoked ' + first : 'no active key ' + first);
  } else {
    console.log('usage: crm-api-key issue <PROJECT_CODE> [label] | list | revoke <api_key_id>');
    process.exitCode = 1;
  }
}

main().catch(function (err) { console.error(err.message); process.exitCode = 1; }).finally(function () { return db.destroy(); });
