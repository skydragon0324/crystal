'use strict';

/**
 * CRACO gives `@` as an alias for src/, so a page imports
 * '@/components/common' rather than '../../components/common'.
 *
 * Nothing else is overridden: package.json's browserslist is already
 * `chrome >= 72` (spec 2) and CRA 4 reads it for both babel and postcss.
 */

const path = require('path');

module.exports = {
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },

  /*
   * Jest resolves modules itself and knows nothing about the webpack alias,
   * so a test that imports anything reaching for @/… fails to even load. The
   * two have to be told separately.
   */
  jest: {
    configure: {
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1'
      }
    }
  }
};
