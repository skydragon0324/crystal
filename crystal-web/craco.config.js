'use strict';

/**
 * CRACO gives `@` as an alias for src/, so a page imports
 * '@/components/common' rather than '../../components/common'.
 *
 * `@assets` is the SECOND alias, for src/assets/, where the site's own artwork
 * lives. The About page's photographs are files there rather than uploads (see
 * src/pages/about/images.js), imported so that webpack fingerprints them and a
 * missing one is a build error rather than a hole in the page.
 *
 * THE ARTWORK IS INSIDE src/, AND THAT IS WHAT KEEPS THIS FILE SHORT. It used
 * to live in crystal-web/assets/, beside src/, and Create React App refuses any
 * import that resolves outside src/ (its ModuleScopePlugin) - so this file had
 * to remove that plugin to let `@assets/...` build at all. With the folder
 * moved in, the plugin stays: it is the check that stops a `../` out of the
 * project from ending up in the bundle unbabelled, and nothing here needs to
 * get round it any more.
 *
 * Nothing else is overridden: package.json's browserslist is already
 * `chrome >= 72` (spec 2) and CRA 4 reads it for both babel and postcss.
 */

const path = require('path');

module.exports = {
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@assets': path.resolve(__dirname, 'src/assets')
    }
  },

  /*
   * Jest resolves modules itself and knows nothing about the webpack aliases,
   * so a test that imports anything reaching for @/… fails to even load. The
   * two have to be told separately.
   *
   * `@assets` needs a mapper here for the same reason, and CRA's own
   * fileTransform then turns each imported file into its basename - so a test
   * can assert which picture a slot holds without a bundler in the room.
   */
  jest: {
    configure: {
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^@assets/(.*)$': '<rootDir>/src/assets/$1'
      }
    }
  }
};
