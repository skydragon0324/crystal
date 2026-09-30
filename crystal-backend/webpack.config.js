const path = require('path');
const webpack = require('webpack');
const nodeExternals = require('webpack-node-externals');

/**
 * Bundles the API into one minified file, for `npm run build:min`.
 *
 * WHAT THIS IS AND IS NOT
 *
 * It is obfuscation. The output is one unreadable line, which stops somebody
 * with a shell on the deploy server from browsing the source over lunch. It
 * is not protection: a beautifier turns it back into readable JavaScript in
 * seconds, the names of every npm package are still in the requires, and
 * anyone with that shell can read .env - which holds the database password,
 * the token secret and the certificate key path, and is worth far more than
 * the code.
 *
 * The real control is who has access to the machine. This raises the effort;
 * file permissions are what sets the limit.
 *
 * WHAT STAYS OUTSIDE THE BUNDLE, AND WHY
 *
 *   node_modules   externalised. Bundling dependencies would drag native
 *                  modules (pg, bcryptjs, oracledb) into a file that then
 *                  only runs on the architecture it was built on.
 *
 *   sql/           read at runtime with fs.readFileSync, by path. Every one
 *                  of the twenty-eight migrations opens its own delta file,
 *                  and install-legacy.js reads sql/legacy/ by a filename it
 *                  computes - which no bundler can follow.
 *
 *   migrations,    knex finds these by scanning a directory at run time. A
 *   seeds,         bundle cannot be scanned, so they ship as files - and at
 *   knexfile       their SOURCE depth, because each migration reaches back
 *                  '..','..','..' to find sql/.
 *
 *   uploads/       data, not code, and not in the artifact at all.
 *
 * __dirname is left alone (node: false below). Webpack's default is to
 * replace it with '/', which would send the .env lookup and the upload path
 * to the root of the filesystem; src/config/index.js depends on it meaning
 * the directory the bundle is running from, and decides everything else from
 * there.
 */

/**
 * The scripts that ship and are therefore bundled.
 *
 * `migrate` and `seed` run ensure-schema.js on the way, and an operator
 * installing a release runs both - so those have to work in the artifact.
 * The rest of scripts/ is development furniture: check.js needs a running
 * server, install-legacy.js fills a stand-in for databases that do not exist
 * in production, and the two verify scripts build throwaway schemas.
 */
const SHIPPED_SCRIPTS = ['ensure-schema', 'sync-pages', 'verify-schema', 'verify-migrations'];

const entry = { app: './app.js' };
SHIPPED_SCRIPTS.forEach(function (name) {
  entry['scripts/' + name] = './scripts/' + name + '.js';
});

module.exports = {
  mode: 'production',
  target: 'node',
  entry: entry,
  devtool: false,

  output: {
    path: path.join(__dirname, 'dist'),
    filename: '[name].js',
    libraryTarget: 'commonjs2'
  },

  // Every require of a package resolves to the real thing at run time, out of
  // the node_modules installed on the target.
  externals: [nodeExternals()],

  node: {
    __dirname: false,
    __filename: false
  },

  module: {
    rules: [
      {
        // A CLI script may open with #!/usr/bin/env node, which is not
        // JavaScript and stops webpack's parser on the first character.
        test: /\.js$/,
        include: path.join(__dirname, 'scripts'),
        use: path.join(__dirname, 'scripts', 'lib', 'strip-shebang-loader.js')
      }
    ]
  },

  plugins: [
    // Read by src/config/index.js to decide where the install root is.
    new webpack.DefinePlugin({ __BUNDLED__: JSON.stringify(true) }),

    /*
     * The migrations are required by knex at run time, not by this graph.
     *
     * Nothing pulls them in today - knexfile.js names the directory as a
     * string - but sync-pages.js requires the SEED module for its page list,
     * and a future script requiring a migration the same way would inline it
     * into the bundle while knex went on scanning the directory beside it.
     * Two copies, one of them stale. Fail loudly instead.
     */
    new webpack.IgnorePlugin(/^\.\/migrations$/)
  ],

  optimization: {
    minimize: true,
    // One file per entry. Splitting would produce chunk files that the
    // packaging step would have to know the names of.
    splitChunks: false
  },

  performance: { hints: false },
  stats: 'errors-warnings'
};
