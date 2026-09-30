'use strict';

/**
 * Packages the API into dist/ - the thing you copy to a server.
 *
 *     npm run build        source, readable
 *     npm run build:min    the same tree with the app code minified into one
 *                          file, for a server whose users should not be
 *                          reading it over lunch
 *
 * There is no bundle.js in the plain build, and there should not be one. A
 * bundler exists to turn many modules into few files for a browser to
 * download; nothing here is downloaded, and Node loads a directory of modules
 * perfectly well. Worse, this API reads real files off disk at runtime -
 * twenty-eight migrations each open their own delta out of sql/, and
 * install-legacy.js reads sql/legacy/ by a filename it computes - so a bundle
 * that inlined the code would still need those beside it, and a bundler that
 * rewrote __dirname would break both in a way that shows up only on the
 * machine the bundle was copied to.
 *
 * What a deploy of this actually needs is the source, its SQL, and a
 * package.json to install production dependencies from. That is what dist/
 * is, and it is complete:
 *
 *     scp -r dist/ server:/opt/crystal-api
 *     cd /opt/crystal-api && npm ci --production
 *     cp .env.example .env    # and fill it in
 *     npm run migrate
 *     npm run serve
 *
 * What is deliberately left out: node_modules (installed on the target, so
 * native modules match its architecture), .env (secrets never travel in an
 * artifact), uploads/ (members' files, not code), .x509-dev/ (a development
 * certificate authority, which must never reach a server), and .git.
 *
 * WHY THERE IS NO PRE-FLIGHT TEST HERE. The reference project this is modelled
 * on gates its build on scripts/check.js, which is a static analyser needing
 * neither a database nor a network. Crystal's check.js is a different thing
 * entirely - a hundred and fifty end-to-end HTTP calls against a running
 * server and a live database - and a build that cannot run without a server
 * up is a build nobody can run on a build machine. So the gate here is what
 * can be proved from the files alone: that every migration's delta made it
 * into the artifact, checked after the copy. Run `npm run check` against a
 * running API before you package; nothing in here can do it for you.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const MINIFY = process.argv.indexOf('--min') !== -1;

/** What a running server needs, and nothing else. */
const INCLUDE = [
  'app.js',
  'src',
  'sql',
  'scripts',
  'package.json',
  'package-lock.json',
  '.env.example',
  'README.md'
];

/*
 * The minified build copies these instead of src/, app.js and scripts/: the
 * bundle is the application, and what is left is only what is opened as a
 * FILE at run time - the SQL every migration reads, and the migrations
 * themselves, which knex finds by scanning a directory.
 */
const INCLUDE_MIN = [
  'sql',
  'package.json',
  'package-lock.json',
  '.env.example',
  'README.md'
];

/*
 * Copied back into the minified build AT THEIR SOURCE DEPTH, and the depth is
 * the point: every migration reaches '..','..','..' out of
 * src/db/migrations/ to find sql/. Put them anywhere else and each one looks
 * for its delta in a directory that does not exist.
 */
const KNEX_FILES = [
  path.join('src', 'db', 'knexfile.js'),
  path.join('src', 'db', 'migrations'),
  path.join('src', 'db', 'seeds')
];

/**
 * Never shipped: they build the artifact or they fill a development database,
 * and neither is something a server does.
 *
 * check.js needs a running API. install-legacy.js and generate-mock-images.js
 * invent data. demo-account.js and x509-dev-pki.js create credentials that
 * must not exist in production - a development certificate authority on a
 * deploy server is a way in, not a convenience.
 */
const BUILD_ONLY_SCRIPTS = [
  'build.js',
  'check.js',
  'install-legacy.js',
  'generate-mock-images.js',
  'demo-account.js',
  'x509-dev-pki.js'
];

/** Never copied, wherever they turn up in the tree. */
const EXCLUDE_NAMES = [
  'node_modules', '.git', '.svn', 'dist', '.env', 'uploads', '.x509-dev'
];

/**
 * Scripts that make no sense on a server, or need devDependencies.
 *
 * `start` is nodemon, which is a devDependency. `seed`, `db:reset`,
 * `mock:images`, `legacy:install` and `demo:account` all write invented data.
 * `schema:export` names scripts/export-schema.js, which does not exist in
 * this project at all.
 */
const DEV_ONLY_SCRIPTS = [
  'start', 'test', 'db:reset', 'seed', 'mock:images',
  'legacy:install', 'demo:account', 'schema:export', 'check'
];

/*
 * fs.rmSync arrived in Node 14.14 and this project supports 12.22, so the
 * removal is done by hand. fs.rmdirSync's recursive option would do it on
 * 12.10+, but it is deprecated for files on newer runtimes and prints a
 * warning on every build - a build that nags is a build people stop reading.
 */
function rimraf(target) {
  if (!fs.existsSync(target)) return;

  const stat = fs.lstatSync(target);
  if (!stat.isDirectory()) return fs.unlinkSync(target);

  fs.readdirSync(target).forEach(function (name) {
    rimraf(path.join(target, name));
  });
  return fs.rmdirSync(target);
}

/**
 * Recursive copy, skipping the excluded names at every level.
 *
 * The parent is created for a file too: the minified build copies
 * src/db/knexfile.js into a dist/ that has no src/ in it at all, and
 * copyFileSync will not make the directory on the way.
 */
function copy(from, to) {
  const stat = fs.statSync(from);

  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    fs.readdirSync(from).forEach(function (name) {
      if (EXCLUDE_NAMES.indexOf(name) !== -1) return;
      copy(path.join(from, name), path.join(to, name));
    });
    return;
  }

  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function countFiles(dir) {
  let files = 0;
  let bytes = 0;

  const walk = function (current) {
    fs.readdirSync(current, { withFileTypes: true }).forEach(function (entry) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) return walk(full);
      files += 1;
      bytes += fs.statSync(full).size;
    });
  };

  walk(dir);
  return { files: files, bytes: bytes };
}

function size(bytes) {
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

/**
 * EVERY MIGRATION'S SQL HAS TO BE IN THE ARTIFACT.
 *
 * This is the one thing a packaging step can prove on its own, and it is the
 * failure it is most likely to cause: a migration is four lines that read a
 * numbered file out of sql/deltas/, so an INCLUDE list that forgot sql/ - or
 * a KNEX_FILES list that put the migrations at the wrong depth - produces an
 * artifact that installs cleanly and cannot migrate. The names are read out
 * of the migration sources rather than assumed, so a delta added tomorrow is
 * covered without anybody remembering this exists.
 */
function missingDeltas() {
  const dir = path.join(ROOT, 'src', 'db', 'migrations');
  const wanted = {};

  fs.readdirSync(dir).forEach(function (name) {
    const source = fs.readFileSync(path.join(dir, name), 'utf8');
    const found = source.match(/'(\d{3}_[A-Za-z0-9_]+\.sql|schema\.sql)'/g) || [];
    found.forEach(function (quoted) {
      const file = quoted.slice(1, -1);
      wanted[file === 'schema.sql' ? 'schema.sql' : path.join('deltas', file)] = name;
    });
  });

  return Object.keys(wanted).filter(function (relative) {
    return !fs.existsSync(path.join(DIST, 'sql', relative));
  });
}

/* ---- 1. copy ---- */
rimraf(DIST);
fs.mkdirSync(DIST, { recursive: true });

const missing = [];

(MINIFY ? INCLUDE_MIN : INCLUDE).forEach(function (name) {
  const from = path.join(ROOT, name);
  if (!fs.existsSync(from)) { missing.push(name); return; }
  copy(from, path.join(DIST, name));
});

if (MINIFY) {
  /* The bundle, and the handful of files knex has to read as files. */
  const webpackBin = path.join(ROOT, 'node_modules', '.bin', 'webpack' +
    (process.platform === 'win32' ? '.cmd' : ''));

  const result = spawnSync(webpackBin, ['--config', 'webpack.config.js'], {
    cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32'
  });

  if (result.status !== 0) {
    console.error('\nwebpack failed - nothing was packaged\n');
    process.exit(1);
  }

  KNEX_FILES.forEach(function (name) {
    const from = path.join(ROOT, name);
    if (!fs.existsSync(from)) { missing.push(name); return; }
    copy(from, path.join(DIST, name));
  });
} else {
  BUILD_ONLY_SCRIPTS.forEach(function (name) {
    const target = path.join(DIST, 'scripts', name);
    if (fs.existsSync(target)) fs.unlinkSync(target);
  });

  /* scripts/lib holds the webpack loader and nothing a server runs. */
  rimraf(path.join(DIST, 'scripts', 'lib'));
}

/* ---- 2. a package.json a server can install from ---- */
/*
 * devDependencies go, and so do the scripts that need them. A server that
 * runs `npm ci --production` and then `npm start` should get a straight answer
 * about nodemon being absent rather than a stack trace.
 */
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
delete pkg.devDependencies;
DEV_ONLY_SCRIPTS.forEach(function (name) { delete pkg.scripts[name]; });

/* Packaging is what produced this directory; it cannot produce itself again. */
delete pkg.scripts.build;
delete pkg.scripts['build:min'];

fs.writeFileSync(path.join(DIST, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

/* ---- 3. prove the artifact can still migrate ---- */
const orphans = missingDeltas();

if (orphans.length) {
  console.error('\n' + orphans.length + ' migration file(s) did not reach dist/sql:\n');
  orphans.forEach(function (file) { console.error('  sql/' + file); });
  console.error('\nnothing that was packaged can be migrated - fix the INCLUDE list\n');
  process.exit(1);
}

/* ---- 4. say what was made ---- */
const totals = countFiles(DIST);

console.log('packaged ' + totals.files + ' files (' + size(totals.bytes) + ') into dist/' +
  (MINIFY ? '  [minified]' : ''));

if (MINIFY) {
  const bundle = fs.statSync(path.join(DIST, 'app.js')).size;
  console.log('  app.js is one minified bundle, ' + (bundle / 1024).toFixed(0) + ' KB');
  console.log('  this is obfuscation, not protection - file permissions are the real control');
}

if (missing.length) {
  console.log('not present, so not copied: ' + missing.join(', '));
}

console.log('');
console.log('  install:      npm ci --production');
console.log('  configure:    cp .env.example .env   (it is NOT in the artifact)');
console.log('  database:     npm run migrate   then   npm run pages:sync');
console.log('  then:         npm run serve');
console.log('');
