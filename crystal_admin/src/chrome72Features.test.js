/*
 * WHAT CHROME 72 DOES NOT HAVE, AND BABEL WILL NOT GIVE IT.
 *
 * browserslist says "chrome >= 72", so SYNTAX is handled: optional chaining,
 * nullish coalescing and logical assignment all come out of the build as
 * ES2018. Two categories are not, and neither fails at build time:
 *
 *   RUNTIME APIS. Babel rewrites syntax, not method tables. `Object.fromEntries`
 *   is simply absent on Chrome 72 and calling it is a TypeError at the moment
 *   that code path runs - which may be a page nobody opens while testing.
 *
 *   CSS FEATURES. Autoprefixer adds prefixes; it does not add features. A
 *   declaration the browser cannot parse is dropped SILENTLY. Worse, an
 *   unparseable SELECTOR invalidates the whole rule it is grouped into - so
 *   one `:focus-visible` in a selector list takes the fallback down with it.
 *
 * The companion test in chrome72.test.js covers flexbox `gap`, which is the
 * one that bites hardest. This covers everything else.
 */
import fs from 'fs';
import path from 'path';

const SRC = __dirname;

/** Method and global names that arrived after Chrome 72. */
const LATE_APIS = [
  [/\bObject\.fromEntries\s*\(/, 'Object.fromEntries', 73],
  [/\bObject\.hasOwn\s*\(/, 'Object.hasOwn', 93],
  [/(?<!formatter)\.matchAll\s*\(/, 'String.prototype.matchAll', 73],
  [/\bPromise\.allSettled\s*\(/, 'Promise.allSettled', 76],
  [/\bPromise\.any\s*\(/, 'Promise.any', 85],
  [/\.replaceAll\s*\(/, 'String.prototype.replaceAll', 85],
  [/\bstructuredClone\s*\(/, 'structuredClone', 98],
  [/\.findLast(?:Index)?\s*\(/, 'Array.prototype.findLast', 97],
  [/\.at\s*\(\s*-/, 'Array/String.prototype.at', 92],
  [/\bIntl\.Segmenter\b/, 'Intl.Segmenter', 87],
  [/\bAbortSignal\.timeout\b/, 'AbortSignal.timeout', 103]
];

/**
 * CSS features Chrome 72 drops on the floor.
 *
 * `:focus-visible` is allowed ONLY in a rule of its own - see the note above
 * about selector lists - so it is checked separately rather than banned.
 */
const LATE_CSS = [
  [/\bclamp\s*\(/, 'clamp()', 79],
  [/aspect-ratio\s*:/, 'aspect-ratio', 88],
  [/backdrop-filter\s*:\s*(?!none)/, 'backdrop-filter', 76],
  /*
   * THE ONE THAT GOT THROUGH.
   *
   * This used to require a colon, so it saw `inset: 0` in a stylesheet and
   * not `inset="0"` on a Chakra box - which is the only form this codebase
   * writes. Eleven of them were live, including the hero carousel track,
   * whose whole job is to fill its ratio box: Chrome 72 dropped the
   * declaration and the track collapsed to nothing.
   *
   * insetX and insetY are deliberately NOT matched. Chakra maps those to
   * left/right and top/bottom longhands, which have always worked, and
   * they are what the fix uses.
   */
  [/(?:^|[^-\w])inset\s*(?::\s*[^;]|=)/, "inset shorthand", 87],
  [/:is\s*\(/, ':is()', 88],
  [/:where\s*\(/, ':where()', 88],
  [/content-visibility\s*:/, 'content-visibility', 85],
  [/accent-color\s*:/, 'accent-color', 93],
  [/margin-inline\s*:/, 'margin-inline shorthand', 87]
];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(js|jsx|css)$/.test(entry.name) && !/\.test\.jsx?$/.test(entry.name)
      ? [full]
      : [];
  });
}

/** Source lines, with comments dropped so a mention is not a use. */
function codeLines(file) {
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .map((line, index) => ({ line, number: index + 1 }))
    .filter((entry) => !/^\s*(\*|\/\/|\/\*)/.test(entry.line));
}

function scan(rules) {
  const found = [];

  walk(SRC).forEach((file) => {
    codeLines(file).forEach((entry) => {
      rules.forEach(([pattern, name, since]) => {
        if (!pattern.test(entry.line)) return;
        found.push(
          `${name} (Chrome ${since}) - ${path.relative(SRC, file)}:${entry.number}`
        );
      });
    });
  });

  return found;
}

test('nothing calls a runtime API newer than Chrome 72', () => {
  /*
   * Babel does not polyfill these. If one is genuinely needed, add it with a
   * guarded fallback at the call site rather than removing it from this list.
   */
  expect(scan(LATE_APIS)).toEqual([]);
});

test('no stylesheet or style prop uses CSS newer than Chrome 72', () => {
  expect(scan(LATE_CSS)).toEqual([]);
});

test(':focus-visible never shares a selector list with :focus', () => {
  /*
   * THE ONE THAT IS WORSE THAN A DROPPED DECLARATION.
   *
   * A selector Chrome 72 cannot parse invalidates the ENTIRE rule, so
   * grouping `.a:focus-visible, .b:focus` means .b loses its focus ring too.
   * :focus-visible is fine on its own - the browser skips the rule and the
   * :focus fallback beside it still applies.
   */
  const offenders = [];

  walk(SRC).forEach((file) => {
    /*
     * Comments come out first. A block comment ABOVE a rule is part of the
     * run of characters before its brace, so a note explaining why
     * :focus-visible is kept separate would itself read as a mixed selector
     * list - the check would fail on its own documentation.
     */
    const code = fs.readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^\s*\/\/.*$/gm, ' ');

    if (code.indexOf(':focus-visible') === -1) return;

    /* Every selector list that reaches an opening brace. */
    const lists = code.match(/[^{};]*:focus-visible[^{};]*\{/g) || [];

    lists.forEach((list) => {
      const clauses = list.replace(/\{$/, '').split(',').map((c) => c.trim()).filter(Boolean);
      const mixed = clauses.some((c) => c.indexOf(':focus-visible') === -1);
      if (mixed) offenders.push(path.relative(SRC, file) + ': ' + list.replace(/\s+/g, ' ').slice(0, 80));
    });
  });

  expect(offenders).toEqual([]);
});
