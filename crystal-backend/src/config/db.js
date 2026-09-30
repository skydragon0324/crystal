const knex = require('knex');
const config = require('./index');
const knexConfig = require('../db/knexfile');

/**
 * The primary store, and the only place a PostgreSQL knex instance is built.
 *
 * Repositories import this; nothing above them does.  That is the whole of
 * the rule - `require('knex')` appears in this file and in config/oracle.js
 * and nowhere else in the codebase.
 *
 * The `date` type parser is installed in db/knexfile.js rather than here, so
 * that migrations and seeds run by the knex CLI get it too - see the note
 * there.  Requiring the knexfile below is what applies it.
 */

const env = config.isProduction ? 'production' : 'development';
const db = knex(knexConfig[env]);

module.exports = db;
