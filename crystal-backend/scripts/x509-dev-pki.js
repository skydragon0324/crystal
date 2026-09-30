'use strict';

/**
 * A THROWAWAY CERTIFICATE AUTHORITY, for exercising the X.509 sign-in without
 * the real CA and without the certificate agent.
 *
 *   node scripts/x509-dev-pki.js [directory]
 *
 * Writes into the directory (default ./.x509-dev, which is git-ignored):
 *
 *   ca.key, ca.pem     a CA that stands in for the real chain
 *   server.key         the key the challenge is signed with
 *
 * and prints the .env lines that point the API at them. scripts/check.js then
 * issues member certificates from this CA on the fly - one for the demo
 * member with a personal policy, one with no policy, one from a different CA
 * - and signs in with them the way the agent would.
 *
 * NOTHING HERE IS FOR PRODUCTION. The real CA chains and the real server key
 * come from whoever issues Crystal's certificates, and are never generated.
 *
 * openssl is run from node rather than from a shell script on purpose: Git
 * Bash rewrites arguments that look like paths, and a subject of "/CN=..."
 * arrives at openssl as "C:/Program Files/Git/CN=...".
 */

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const OPENSSL = process.env.OPENSSL_BIN || 'openssl';

function run(args, cwd) {
  childProcess.execFileSync(OPENSSL, args, { cwd: cwd, stdio: ['ignore', 'ignore', 'pipe'] });
}

function main() {
  /*
   * A flag is not a directory. `--help` used to be taken as one, and wrote
   * private keys into a folder of that name that nothing ignores.
   */
  if (process.argv[2] && process.argv[2].charAt(0) === '-') {
    console.log('usage: node scripts/x509-dev-pki.js [directory]   (default ./.x509-dev)');
    return;
  }

  const dir = path.resolve(process.argv[2] || path.join(__dirname, '..', '.x509-dev'));
  fs.mkdirSync(dir, { recursive: true });

  run(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.pem',
    '-days', '3650', '-subj', '/CN=Crystal Development CA'], dir);

  run(['genrsa', '-out', 'server.key', '2048'], dir);

  console.log('development CA written to ' + dir);
  console.log('');
  console.log('# add to crystal-backend/.env to try the certificate sign-in locally:');
  console.log('X509_LOGIN=true');
  console.log('X509_SERVER_KEY=' + path.join(dir, 'server.key'));
  console.log('X509_SERVER_CERT_URL=http://localhost:5400/certs/server.crt');
  console.log('X509_CA_RSA_CHAIN=' + path.join(dir, 'ca.pem'));
  console.log('X509_CA_ECC_CHAIN=' + path.join(dir, 'ca.pem'));
  console.log('');
  console.log('# and run the checks with the same directory:');
  console.log('X509_DEV_DIR=' + dir + ' node scripts/check.js http://localhost:5400');
}

main();
