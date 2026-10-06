import client, { localeStore } from '../api/client';
import { crm } from '../api';

const originalAdapter = client.defaults.adapter;
afterEach(() => { client.defaults.adapter = originalAdapter; window.localStorage.clear(); });

test.each(['ECONNABORTED', 'ETIMEDOUT'])('identifies %s as a timeout instead of an unreachable server', async code => {
  localeStore.set('en');
  client.defaults.adapter = config => Promise.reject(Object.assign(new Error('timeout'), { code, config }));
  await expect(client.get('/crm/parties')).rejects.toMatchObject({
    code, timedOut: true,
    message: 'The request timed out. Processing may still be running. Check the result before trying again.'
  });
});

test('recognizes a proxy gateway timeout', async () => {
  client.defaults.adapter = config => Promise.reject({ config, response: { status: 504, data: '<html>Gateway timeout</html>' } });
  await expect(client.get('/crm/parties')).rejects.toMatchObject({ status: 504, timedOut: true });
});

test('network failures retain the unreachable-server message', async () => {
  localeStore.set('en');
  client.defaults.adapter = config => Promise.reject({ config });
  await expect(client.get('/crm/parties')).rejects.toMatchObject({ timedOut: false, message: 'Cannot reach the server' });
});

test.each([true, false])('Excel request extends the timeout for dryRun=%s only', async dryRun => {
  let sent;
  client.defaults.adapter = config => {
    sent = config;
    return Promise.resolve({ config, status: 200, headers: { 'content-type': 'application/json' }, data: { success: true, data: {} } });
  };
  await crm.parties.importPeople(new Blob(['workbook']), dryRun);
  expect(sent.timeout).toBe(120000);
  expect(sent.url.includes('dry_run=1')).toBe(dryRun);
  expect(client.defaults.timeout).toBe(30000);
});
