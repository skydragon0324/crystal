'use strict';

/**
 * CRACO gives `@` as an alias for src/, so a deep view imports
 * '@/components/common' rather than '../../../components/common'.
 *
 * Nothing else is overridden: package.json's browserslist is already
 * `chrome >= 72` (spec 2) and CRA 4 reads it for both babel and postcss.
 * Adding a second @babel/preset-env here only re-enables the plugins CRA
 * already configured, with different `loose` settings, and the build fills
 * with mismatch warnings.
 */

const path = require('path');

module.exports = {
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  }
};
