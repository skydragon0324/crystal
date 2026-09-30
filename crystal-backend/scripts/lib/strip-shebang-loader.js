/**
 * A webpack loader that removes a leading #! line.
 *
 * An operational script may open with `#!/usr/bin/env node` so it can be run
 * directly on a Unix box. Webpack 4's parser is a JavaScript parser and that
 * line is not JavaScript, so it stops on the '#' before reading anything else.
 *
 * The usual answer is the shebang-loader package. This is four lines and one
 * fewer dependency to keep current, and the bundled copies are always started
 * as `node scripts/<name>.js` from package.json - so nothing is lost by
 * dropping the line on the way in. On a file with no shebang, which is all of
 * them here today, it is a no-op.
 */
module.exports = function stripShebang(source) {
  return String(source).replace(/^#![^\n]*\n/, '');
};
