const path = require('path');
const config = require('./index');

/**
 * Where things live on disk, resolved once.
 *
 * Every path here is absolute.  A relative one works until something is
 * started from a different directory - a cron entry, a service manager, the
 * knex CLI - and then quietly writes uploads somewhere nobody looks.
 */
const ROOT = config.rootDir;

module.exports = {
  ROOT: ROOT,
  SQL: path.join(ROOT, 'sql'),
  UPLOADS: config.storage.uploadDir,
  ASSETS: path.join(ROOT, 'assets'),
  BACKUPS: path.join(ROOT, 'backups')
};
