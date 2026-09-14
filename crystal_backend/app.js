require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');

const config = require('./src/config');
const routes = require('./src/routes');
const { notFound, errorHandler } = require('./src/middleware/error');
const { language } = require('./src/i18n');
const deviceMiddleware = require('./src/middleware/device');
const { ACCESS_EXPIRES, REFRESH_EXPIRES } = require('./src/middleware/auth');
const sweeps = require('./src/services/sweeps.service');

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

/**
 * CORS_ORIGINS holds a comma separated list of allowed origins, e.g.
 *   CORS_ORIGINS=http://localhost:3000,http://localhost:3001
 * A single `*` allows every origin - avoid that in production, credentials
 * are on.
 */
function stripTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

const allowedOrigins = config.corsOrigins.map(stripTrailingSlash);
const allowAnyOrigin = allowedOrigins.indexOf('*') >= 0;

// helmet 4 defaults crossOriginResourcePolicy to same-origin, which would
// stop either frontend loading an image off this server.
app.use(helmet({ crossOriginResourcePolicy: false }));

app.use(cors({
  origin: function (origin, callback) {
    // Same origin requests, curl and server to server calls send no Origin.
    if (!origin || allowAnyOrigin) return callback(null, true);
    return callback(null, allowedOrigins.indexOf(stripTrailingSlash(origin)) >= 0);
  },
  credentials: true,
  exposedHeaders: ['X-Crystal-Device-Detected']
}));

app.use(compression());
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '5mb' }));
app.use(cookieParser());

// Which device class is asking (spec 5), resolved once.
app.use(deviceMiddleware);

// The reader's language, resolved once - so every reply below, including the
// ones the error handler writes, can be worded in it.
app.use(language);

/**
 * Uploaded files are served straight off disk (spec 2: local storage only).
 *
 * helmet's default CORP header blocks a frontend on another origin from
 * loading them, so it is relaxed for this path only - and nothing here is
 * ever executed as a script.
 */
app.use(config.storage.publicPath, express.static(config.storage.uploadDir, {
  maxAge: config.isProduction ? '30d' : 0,
  fallthrough: true,
  setHeaders: function (res) {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
}));

app.use(config.apiPrefix, routes);

app.use(notFound);
app.use(errorHandler);

if (require.main === module) {
  app.listen(config.port, function () {
    console.log('API listening on http://localhost:' + config.port + config.apiPrefix);
    console.log('CORS origins: ' + (allowAnyOrigin ? '*' : allowedOrigins.join(', ')));
    console.log('access token: ' + ACCESS_EXPIRES + '  refresh token: ' + REFRESH_EXPIRES);

    /*
     * Housekeeping, started only when this file is the process rather than
     * when it is imported - a test that requires the app should not quietly
     * begin expiring warranties and raising purchase orders.
     */
    sweeps.schedule();
  });
}

module.exports = app;
