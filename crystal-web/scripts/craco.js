'use strict';

/**
 * Runs craco with the legacy OpenSSL provider WHEN THE NODE RUNNING IT NEEDS
 * ONE, and without it otherwise.
 *
 * Create React App 4 bundles webpack 4, which hashes with md4. OpenSSL 3 -
 * which ships with Node 17 and later - removed md4 from its default provider,
 * so every build on a modern Node dies with:
 *
 *     error:0308010C:digital envelope routines::unsupported
 *
 * `--openssl-legacy-provider` puts md4 back. The catch is that the flag does
 * not EXIST before Node 17, so hard-coding it into the npm script trades a
 * broken build on new Node for a broken build on old Node - and this project
 * has been built on both.
 *
 * So the version is checked and the flag is added only where it is understood.
 * Upgrading past CRA 4 is the real fix; until then this is the difference
 * between `npm run build` working and not.
 */

const { spawn } = require('child_process');
const path = require('path');

const NEEDS_LEGACY_OPENSSL = Number(process.versions.node.split('.')[0]) >= 17;

const options = (process.env.NODE_OPTIONS || '').split(' ').filter(Boolean);
if (NEEDS_LEGACY_OPENSSL && options.indexOf('--openssl-legacy-provider') === -1) {
  options.push('--openssl-legacy-provider');
}

const craco = path.join(__dirname, '..', 'node_modules', '@craco', 'craco', 'bin', 'craco.js');

const child = spawn(
  process.execPath,
  [craco].concat(process.argv.slice(2)),
  {
    stdio: 'inherit',
    env: Object.assign({}, process.env, { NODE_OPTIONS: options.join(' ') })
  }
);

child.on('exit', function (code, signal) {
  // Pass the real outcome up, so CI still fails when the build fails.
  if (signal) process.kill(process.pid, signal);
  else process.exit(code === null ? 1 : code);
});
