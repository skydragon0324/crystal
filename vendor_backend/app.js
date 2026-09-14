// app.js
const express = require('express');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');

const allowedOrigins = [
  "localhost:3000",
  "localhost:3001",
  "localhost:3002",
  "localhost",
  "127.0.0.1",
  "127.0.0.1:3000",  
  "192.192.192.2",
  "192.192.192.5",
];

// Load environment variables
dotenv.config();  // NOTE: it should be called before importing user-defined routes

const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const commonRoutes = require('./routes/commonRoutes');
const clientRoutes = require('./routes/clientRoutes');
const appstoreRoutes = require('./routes/appstoreRoutes');
const eshopRoutes = require('./routes/eshopRoutes');
const eprodRoutes = require('./routes/eprodRoutes');
const phoneRoutes = require('./routes/phoneRoutes');
const polestarRoutes = require('./routes/polestarRoutes');
const vendorRoutes = require('./routes/vendorRoutes');

const v2HomeRoutes = require('./routes/v2/homeRoutes');
const v2ProductRoutes = require('./routes/v2/productRoutes');
const v2MessageRoutes = require('./routes/v2/messageRoutes');
const v2AgencyRoutes = require('./routes/v2/agencyRoutes');
const v2BlogRoutes = require('./routes/v2/blogRoutes');
const v2PremiumRoutes = require('./routes/v2/premiumRoutes');
const v2WeatherRoutes = require('./routes/v2/weatherRoutes');
const v2PointRoutes = require('./routes/v2/pointRoutes');
const v2SurveyRoutes = require('./routes/v2/surveyRoutes');
const v2ReserveRoutes = require('./routes/v2/reserveRoutes');
const v2NewsRoutes = require('./routes/v2/newsRoutes');

// Initialize express app
const app = express();

// Middleware
app.use(helmet()); // security headers
app.use(bodyParser.json({ limit: '100mb' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/uploads', express.static('uploads'));
app.use(
  cors({
    origin: function (origin, callback) {
      // Check if the origin is in the allowed list or if it's undefined (for server-to-server requests)
      const addr = origin ? origin.split("://")[1] : "";
      if (!origin || allowedOrigins.indexOf(addr) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true, // Allow cookies
  })
);

// Routes
app.use('/pid/api/auth', authRoutes);
app.use('/pid/api/admin', adminRoutes);
app.use('/pid/api/user', clientRoutes);
app.use('/pid/api/common', commonRoutes);
app.use('/pid/api/appstore', appstoreRoutes);
app.use('/pid/api/eshop', eshopRoutes);
app.use('/pid/api/eprod', eprodRoutes);
app.use('/pid/api/phone', phoneRoutes);
app.use('/polestar/api', polestarRoutes);

// With USE_MOCK=true the vendor site is served from mock/fixtures.js
// instead of the database, so the front end can be run and tested with no
// Oracle or Postgres instance present. Auth still runs through the real
// controllers - only the data source is swapped. See mock/README.md.
if (process.env.USE_MOCK === 'true') {
  console.log('[mock] /vendor/api is serving fixture data (USE_MOCK=true)');
  app.use('/vendor/api', require('./mock/mockVendorRoutes'));
} else {
  app.use('/vendor/api', vendorRoutes);
}

app.use('/pid/api/v2/home', v2HomeRoutes);
app.use('/pid/api/v2/product', v2ProductRoutes);
app.use('/pid/api/v2/message', v2MessageRoutes);
app.use('/pid/api/v2/agency', v2AgencyRoutes);
app.use('/pid/api/v2/blog', v2BlogRoutes);
app.use('/pid/api/v2/premium', v2PremiumRoutes);
app.use('/pid/api/v2/weather', v2WeatherRoutes);
app.use('/pid/api/v2/point', v2PointRoutes);
app.use('/pid/api/v2/survey', v2SurveyRoutes);
app.use('/pid/api/v2/reserve', v2ReserveRoutes);
app.use('/pid/api/v2/news', v2NewsRoutes);

// test oracle connection
// const { testConnection } = require('./db/oracledb');
// testConnection();

// load commonly used integrated user classes
const { getIntegratedUserClasses } = require('./controllers/common/commonPremiumController');
// const { initPremiumLotterySubmitForRAM, initPuzzleRankForRAM } = require('./controllers/client/clientPremiumController');
// This warms a cache from the database on boot. Under USE_MOCK there is no
// database to read, and the unhandled rejection it throws takes the process
// down before the first request arrives.
if (process.env.USE_MOCK !== 'true') {
  getIntegratedUserClasses();
}
// initPremiumLotterySubmitForRAM();
// initPuzzleRankForRAM();

// Start the server
const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
