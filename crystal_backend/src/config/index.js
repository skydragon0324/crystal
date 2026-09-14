'use strict';

/**
 * Single place where process.env is read. Every other module imports the
 * frozen object below, so a missing variable fails once, loudly, at boot
 * rather than at the first request that happens to need it.
 */

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function str(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    if (fallback === undefined) {
      throw new Error('Missing required environment variable: ' + name);
    }
    return fallback;
  }
  return value;
}

function int(name, fallback) {
  const value = str(name, fallback === undefined ? undefined : String(fallback));
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error('Environment variable ' + name + ' must be an integer, got: ' + value);
  }
  return parsed;
}

function bool(name, fallback) {
  const value = str(name, fallback === undefined ? undefined : String(fallback));
  return value === 'true' || value === '1' || value === 'yes';
}

function list(name, fallback) {
  return str(name, fallback)
    .split(',')
    .map(function (item) { return item.trim(); })
    .filter(Boolean);
}

const rootDir = path.resolve(__dirname, '../..');
const uploadDir = str('UPLOAD_DIR', 'uploads');

const config = {
  env: str('NODE_ENV', 'development'),
  isProduction: str('NODE_ENV', 'development') === 'production',
  port: int('PORT', 5100),
  apiPrefix: str('API_PREFIX', '/api'),
  publicUrl: str('PUBLIC_URL', 'http://localhost:5100').replace(/\/$/, ''),
  corsOrigins: list('CORS_ORIGINS', 'http://localhost:3000,http://localhost:3001'),

  /*
   * The language a request gets when it does not ask for one.
   *
   * A request from a browser almost always asks - the frontends send X-Lang
   * and browsers send Accept-Language - so this is what answers a webhook, a
   * health check, or curl. Setting it does NOT override a reader's choice;
   * it decides what a caller with no preference is answered in.
   */
  defaultLocale: str('DEFAULT_LOCALE', 'en'),
  rootDir: rootDir,

  db: {
    host: str('PG_HOST', '127.0.0.1'),
    port: int('PG_PORT', 5432),
    user: str('PG_USER'),
    password: str('PG_PASSWORD'),
    database: str('PG_DATABASE'),
    schema: str('PG_SCHEMA', 'public'),
    poolMin: int('PG_POOL_MIN', 2),
    poolMax: int('PG_POOL_MAX', 10)
  },

  oracle: {
    enabled: bool('ORACLE_ENABLED', false),
    user: str('ORACLE_USER', 'crystal'),
    password: str('ORACLE_PASSWORD', 'crystal'),
    connectString: str('ORACLE_CONNECT_STRING', '127.0.0.1:1521/XEPDB1'),
    poolMin: int('ORACLE_POOL_MIN', 0),
    poolMax: int('ORACLE_POOL_MAX', 4),
    libDir: str('ORACLE_LIB_DIR', '')
  },

  /*
   * THE LEGACY DATABASE - feedback and the blog, which Crystal reads and
   * writes but does not own. See config/legacy.js for why one handle serves
   * two drivers, and sql/legacy/ for the development stand-in.
   *
   * The driver defaults to postgres because that is what a developer has. A
   * deployment sets LEGACY_DRIVER=oracle and the three connection variables;
   * nothing else changes.
   */
  legacy: {
    driver: str('LEGACY_DRIVER', 'postgres') === 'oracle' ? 'oracle' : 'postgres',

    /*
     * The two schemas the tables live in, qualified on every query. They are
     * configurable because a deployment whose Oracle user OWNS these tables
     * addresses them unqualified - set both to an empty string for that.
     */
    pidSchema: str('LEGACY_PID_SCHEMA', 'ora_pid'),
    blogSchema: str('LEGACY_BLOG_SCHEMA', 'ora_blog'),

    /*
     * THE THREE SATELLITES, read by the 'old log' pages and nothing else.
     * They belong to the systems that ran before this platform - the karaoke
     * keygen service, the media service, and the customer database - and
     * Crystal reads history out of them and writes nothing at all.
     */
    licenseSchema: str('LEGACY_LICENSE_SCHEMA', 'ora_license'),
    mediaSchema: str('LEGACY_MEDIA_SCHEMA', 'ora_media'),
    oldSchema: str('LEGACY_OLD_SCHEMA', 'ora_old_db'),

    /* Used by the oracle driver only; the postgres one reuses config.db. */
    user: str('LEGACY_ORACLE_USER', str('ORACLE_USER', 'crystal')),
    password: str('LEGACY_ORACLE_PASSWORD', str('ORACLE_PASSWORD', 'crystal')),
    connectString: str('LEGACY_ORACLE_CONNECT_STRING', str('ORACLE_CONNECT_STRING', '127.0.0.1:1521/XEPDB1')),
    libDir: str('LEGACY_ORACLE_LIB_DIR', str('ORACLE_LIB_DIR', '')),
    poolMin: int('LEGACY_POOL_MIN', 1),
    poolMax: int('LEGACY_POOL_MAX', 8)
  },

  /*
   * THE FIVE REMOTE SERVICES the Eshop, Appstore and Eproduct pages read from.
   *
   * They are HTTP, not tables - see config/remote.js. The mock defaults ON,
   * because no development machine can reach them; a deployment sets
   * REMOTE_MOCK=false and the five URLs, and /health reports which it is.
   */
  remote: {
    mock: bool('REMOTE_MOCK', true),
    timeout: int('REMOTE_TIMEOUT_MS', 15000),
    eshopServerUrl: str('ESHOP_SERVER_URL', ''),
    eshopWalletUrl: str('ESHOP_WALLET_URL', ''),
    appstoreServerUrl: str('APPSTORE_SERVER_URL', ''),
    appstoreWalletUrl: str('APPSTORE_WALLET_URL', ''),
    /* The eproduct site: registrations, and the three keygen logs. */
    webServerUrl: str('WEB_SERVER_URL', '')
  },

  auth: {
    jwtSecret: str('JWT_SECRET', 'crystal-user-secret'),
    jwtExpiresIn: str('JWT_EXPIRES_IN', '2h'),
    refreshSecret: str('JWT_REFRESH_SECRET', 'crystal-refresh-secret'),
    refreshExpiresIn: str('JWT_REFRESH_EXPIRES_IN', '30d'),
    adminSecret: str('ADMIN_JWT_SECRET', 'crystal-admin-secret'),
    adminExpiresIn: str('ADMIN_JWT_EXPIRES_IN', '8h'),
    bcryptRounds: int('BCRYPT_ROUNDS', 10)
  },

  otp: {
    length: int('OTP_LENGTH', 6),
    ttlSeconds: int('OTP_TTL_SECONDS', 300),
    resendSeconds: int('OTP_RESEND_SECONDS', 60),
    maxAttempts: int('OTP_MAX_ATTEMPTS', 5),
    echoInResponse: bool('OTP_ECHO_IN_RESPONSE', true)
  },

  storage: {
    uploadDir: path.isAbsolute(uploadDir) ? uploadDir : path.join(rootDir, uploadDir),
    publicPath: '/uploads',
    maxUploadBytes: int('MAX_UPLOAD_MB', 20) * 1024 * 1024,
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
    /*
     * What may be attached to a record as a DOCUMENT rather than as artwork -
     * an approval certificate, a scanned price schedule.  Deliberately a
     * separate list from the image one: the endpoints that accept artwork
     * must keep refusing everything that is not artwork.
     */
    allowedDocumentTypes: [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'
    ]
  },

  points: {
    productRegister: int('POINTS_PRODUCT_REGISTER', 500),
    dailyLogin: int('POINTS_DAILY_LOGIN', 10),
    purchasePerUnit: int('POINTS_PURCHASE_PER_UNIT', 1),
    licenseCost: int('LICENSE_POINTS_COST', 1000)
  }
};

module.exports = Object.freeze(config);
