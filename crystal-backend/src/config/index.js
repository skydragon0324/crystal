'use strict';

/**
 * Single place where process.env is read. Every other module imports the
 * frozen object below, so a missing variable fails once, loudly, at boot
 * rather than at the first request that happens to need it.
 */

const path = require('path');
const dotenv = require('dotenv');

/**
 * THE INSTALL ROOT, and it moves when the application is bundled.
 *
 * Read from source, this file is at src/config/index.js and the root is two
 * directories up. Read out of `npm run build:min`, the whole application is
 * one file at the root of dist/ and the root is the directory that file is
 * sitting in - so the same `'../..'` would resolve two levels ABOVE the
 * install, look for .env in somebody's home directory and serve uploads out
 * of a folder it had just created there.
 *
 * `__BUNDLED__` is defined by webpack (see webpack.config.js) and does not
 * exist otherwise, which is what the typeof guard is for: `__BUNDLED__` on
 * its own would be a ReferenceError at boot from source. `node: { __dirname:
 * false }` in the same config keeps __dirname meaning a real directory
 * instead of webpack's default '/'.
 *
 * Everything that touches disk - .env, uploads, sql/, assets - hangs off this
 * one line, which is why it is here rather than repeated anywhere.
 */
const BUNDLED = typeof __BUNDLED__ !== 'undefined' && __BUNDLED__;
const rootDir = BUNDLED ? __dirname : path.resolve(__dirname, '../..');

dotenv.config({ path: path.join(rootDir, '.env') });

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
  /* True only inside `npm run build:min`'s single-file build - see above. */
  bundled: BUNDLED,

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
    /*
     * THE ESHOP WALLET CHECKS WHO IS CALLING by the Referer header, and answers
     * nothing useful without it. The vendor sends it on every wallet call
     * (vendor_backend/api/eshopApi.js, walletAPI); it is the value the wallet
     * was configured to trust, so it is configuration here, not a guess.
     */
    eshopWalletReferer: str('ESHOP_WALLET_REFERER', ''),
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

  /*
   * SIGNING IN WITH AN X.509 CERTIFICATE - the desktop Sign in button.
   *
   * THE VENDOR'S FLOW, not TLS client certificates. The member's PC runs a
   * certificate agent (a local program on 127.0.0.1:20206) holding the
   * member's certificate. Signing in is a challenge and a signature:
   *
   *   1. the browser asks the agent for a random number and the user ID
   *   2. POST /auth/x509/primary_data - the server adds its own random number
   *      and signs the challenge with ITS private key
   *   3. the agent checks the server's signature and signs the challenge with
   *      the MEMBER's key
   *   4. POST /auth/x509/x509_login - the certificate and the signature; the
   *      server checks the certificate against the CA chain and the personal
   *      policies, and signs in the user ID in its CN
   *
   * See vendor_backend/controllers/web/x509Controller.js and
   * vendor_client/src/utils/X509Utils.js.
   *
   * OFF UNLESS CONFIGURED, and there are no defaults for anything secret: the
   * server key and the CA chains are files the deployment provides. With any
   * of them missing the endpoints refuse, and the Sign in button sends a
   * desktop to the password page at /auth/reganam - which is what the vendor
   * does in development, where there is no agent.
   *
   *   serverKey        PEM private key the challenge is signed with
   *                    (the vendor's certs/prhn1020_noenc.key)
   *   serverCertUrl    where the agent downloads the matching certificate
   *                    (the vendor's http://20.60.0.218/certs/prhn1020.crt).
   *                    Its HOST is also the last part of the signed challenge.
   *   caRsaChain       CA chain for RSA certificates (GovCArsa-chain.pem)
   *   caEccChain       CA chain for ECC certificates (GovCAecc-chain.pem)
   *   policyIds        the personal-certificate policies accepted
   *   minClientVersion the oldest agent accepted, as the vendor's 1214
   */
  x509: {
    enabled: bool('X509_LOGIN', false),
    serverKey: str('X509_SERVER_KEY', ''),
    serverCertUrl: str('X509_SERVER_CERT_URL', ''),
    caRsaChain: str('X509_CA_RSA_CHAIN', ''),
    caEccChain: str('X509_CA_ECC_CHAIN', ''),
    policyIds: list('X509_POLICY_IDS', [
      '1.2.408.20020827.8.3.3',
      '1.2.408.20020827.8.3.2.1',
      '1.2.408.20020827.8.3.2.2',
      '1.2.408.20020827.8.3.2.3'
    ].join(',')),
    minClientVersion: int('X509_MIN_CLIENT_VERSION', 1214),
    /* How long a challenge may wait for its signature. */
    challengeSeconds: int('X509_CHALLENGE_SECONDS', 120),
    openssl: str('OPENSSL_BIN', 'openssl')
  },

  /*
   * THE SIM'S OWN CERTIFICATE, which is the phone's half of the same idea.
   *
   * The desktop has a certificate agent; a phone has the card already in it,
   * and the customised browser can ask it to sign. Both are X.509 and both
   * are verified by utils/x509.js - what is separate is the CA they chain to,
   * because a SIM's MIK certificate is issued by a different authority from
   * the personal certificates the desktop agent holds.
   *
   * OFF BY DEFAULT. A deployment with no MIK chain configured answers "not
   * enabled" and the phone sign-in form is exactly what it was.
   */
  mik: {
    enabled: bool('MIK_LOGIN', false),
    /* The CA chain a card's certificate must verify against. */
    caChain: str('MIK_CA_CHAIN', ''),
    /*
     * The certificate policies a card may carry. Empty means "do not check",
     * which is the honest default until the issuer's OIDs are known - the
     * chain and the signature are still required.
     */
    policyIds: list('MIK_POLICY_IDS', ''),
    /* How long a challenge may wait for its signature. */
    challengeSeconds: int('MIK_CHALLENGE_SECONDS', 120),
    /*
     * Whether the cid must appear in the certificate's subject.
     *
     * A card that signs for a cid it does not name is a card vouching for
     * somebody else's number, so this is on - but it is a switch, because a
     * MIK profile that carries the cid somewhere other than the subject would
     * otherwise refuse every valid card until this file knew where to look.
     */
    requireCidInSubject: bool('MIK_REQUIRE_CID_IN_SUBJECT', true)
  },

  /*
   * SIGNED CONTENT - notices, FAQs and uploaded images carry a signature the
   * storefront checks before it renders them. See docs/content-signing.md.
   *
   * Read here as plain strings and nothing more: security/signingConfig.js
   * decides what they mean, and refuses at startup what they cannot mean.
   * All of them empty outside production means the development key in
   * .content-keys/ (`npm run content-keys`); all empty IN production is a
   * startup error, not a default.
   *
   * p12Password is the one secret here. It is read like PG_PASSWORD is, and
   * goes no further than signingConfig, which keeps it
   * out of anything that prints the settings, and keyProvider, which hands it
   * to openssl through the child's environment - never its command line.
   */
  contentSigning: {
    algorithm: str('CONTENT_SIGNING_ALGORITHM', ''),
    keyId: str('CONTENT_SIGNING_KEY_ID', ''),
    keyDir: str('CONTENT_SIGNING_KEY_DIR', ''),
    verifyKeyIds: str('CONTENT_SIGNING_VERIFY_KEY_IDS', ''),
    revokedKeyIds: str('CONTENT_SIGNING_REVOKED_KEY_IDS', ''),
    p12: str('CONTENT_SIGNING_P12', ''),
    p12Password: str('CONTENT_SIGNING_P12_PASSWORD', ''),
    caChain: str('CONTENT_SIGNING_CA_CHAIN', ''),
    verificationCacheEntries: int('CONTENT_VERIFICATION_CACHE_ENTRIES', 5000)
  },

  storage: {
    uploadDir: path.isAbsolute(uploadDir) ? uploadDir : path.join(rootDir, uploadDir),
    publicPath: '/uploads',
    maxUploadBytes: int('MAX_UPLOAD_MB', 20) * 1024 * 1024,
    verifiedImageCacheBytes: int('VERIFIED_IMAGE_CACHE_MB', 64) * 1024 * 1024,
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
    /*
     * WHAT A HERO SLIDE MAY BE WHEN IT MOVES.
     *
     * Two containers, and both because the browser opens them. AVI and MOV
     * are refused at the door rather than stored and discovered to be
     * unplayable by a visitor. An animated GIF is not here - it is an image,
     * and it is signed and verified like every other image.
     *
     * A FILM IS NOT SIGNED. Every other upload is: the bytes are hashed at
     * rest and checked again before they are drawn. A signature is verified
     * by hashing the WHOLE file, which is the one thing video exists not to
     * do, and these are allowed to be an order of magnitude larger than the
     * artwork. So a video is sniffed - it must really be MP4 or WebM - and
     * then stored unsigned, and the storefront plays it from its ordinary
     * address rather than through the verified-image endpoint.
     */
    allowedVideoTypes: ['video/mp4', 'video/webm'],
    /* Films get their own ceiling; MAX_UPLOAD_MB stays the rule for artwork. */
    maxVideoUploadBytes: int('MAX_VIDEO_UPLOAD_MB', 60) * 1024 * 1024,
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
