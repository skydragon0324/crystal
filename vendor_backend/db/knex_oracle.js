const knex = require('knex');

// Helper function to convert keys to camelCase
const toCamelCase = (str) => {
  return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
};

// Helper function to convert keys to uppercase for Oracle compatibility
const toUpperCase = (str) => str.toUpperCase();
const toLowerCase = (str) => str.toLowerCase();

const db = knex({
  client: 'oracledb',
  connection: {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_STRING
  },
  pool: {
    min: 2, // default 2
    max: 600, // default 10
    acquireTimeoutMillis: 2 * 60 * 1000, // default 60000
    propagateCreateError: false,
  },
  // Customize wrapIdentifier to ensure column names are treated as case-insensitive
  wrapIdentifier: (value, origImpl) => {
    return origImpl(toUpperCase(value));  // Forces all identifiers to uppercase for Oracle compatibility
  },

  // Convert column names from UPPERCASE to lowercase after fetching the data
  postProcessResponse: (result) => {
    if (Array.isArray(result)) {
      return result.map((row) => {
        const newRow = {};
        for (const key in row) {
          if (row.hasOwnProperty(key)) {
            newRow[toLowerCase(key)] = row[key];
          }
        }
        return newRow;
      });
    }

    if (result && typeof result === 'object') {
      const newResult = {};
      for (const key in result) {
        if (result.hasOwnProperty(key)) {
          newResult[toLowerCase(key)] = result[key];
        }
      }
      return newResult;
    }

    return result;
  },
});

module.exports = db;
