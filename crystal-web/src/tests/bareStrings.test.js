/*
 * NO ENGLISH REACHES THE SCREEN FROM AN EXPRESSION.
 *
 * i18nCoverage.test.js reads the places a sentence is WRITTEN as markup - text
 * between tags, `label="…"`, `title: '…'` - and asks the catalogue about each
 * one. What it cannot see is a sentence that is CHOSEN by an expression:
 *
 *   {inCompare ? 'In your comparison' : 'Add to comparison'}
 *   {title || 'Nothing here yet'}
 *   aria-label={`Remove ${item.name}`}
 *
 * Each of those rendered English on a Chinese page, and "Add to comparison"
 * and "Nothing to compare yet" were how it was noticed. They were found and
 * translated in one sweep; this is what stops the next one.
 *
 * THE RULE: a string literal that follows `?`, `:`, `||` or `&&`, or a
 * template literal, and reads as words, must be inside a t() call. The
 * translated form is `t('address')`, or `t('address', { count: n })` for a
 * sentence with a value in it - never English glued to a number, because
 * "3 more" and its Chinese do not put the number in the same place.
 *
 * What does NOT count as words, so the rule stays quiet about it: addresses,
 * paths and codes, CSS values (a shadow, a transition, a gradient), and the
 * pieces of a string being built with `+`.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).reduce((all, entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['i18n', 'tests', '__testing__'].indexOf(entry.name) !== -1) return all;
      return all.concat(walk(full));
    }
    if (!/\.(js|jsx)$/.test(entry.name) || /\.test\.jsx?$/.test(entry.name)) return all;
    return all.concat([full]);
  }, []);
}

/** Words a person reads, as opposed to a value a program reads. */
function readable(text) {
  if (!/[A-Za-z]{3}/.test(text)) return false;
  /* One word only counts when it is Capitalised - 'block', 'center' are values. */
  if (!/\s/.test(text) && !/^[A-Z][a-z]/.test(text)) return false;
  if (/^[a-z]+(\.[a-zA-Z0-9]+)+$/.test(text)) return false;
  if (/^\//.test(text) || /^[\w-]+\/[\w/-]*$/.test(text)) return false;
  if (/^(https?:|mailto:|tel:)/.test(text)) return false;
  if (/^[A-Z0-9_]+$/.test(text)) return false;
  if (/[{}<>=;]|=>/.test(text)) return false;
  /* CSS: a shadow, a transition, a colour function, a gradient. */
  if (/\bvar\(|rgba?\(|hsla?\(|cubic-bezier\(|gradient\(|\d+(px|ms|s|em|rem|%)\b/.test(text)) return false;
  /* The middle of a string being concatenated: `' + name + '`. */
  if (/^\s*\+|\+\s*$/.test(text)) return false;
  return true;
}

/*
 * Names, not prose - the same in every language (i18nCoverage.test.js keeps
 * the list of brands) - and the one header value built as a template.
 */
const NOT_PROSE = /\b(Crystal OS|Crystal|Eshop|Appstore|Eproduct|Bearer)\b/g;

function findBare() {
  const found = [];

  walk(SRC).forEach((file) => {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (/^(\*|\/\/|\/\*)/.test(trimmed)) return;
      if (/^import\b|\brequire\(/.test(trimmed)) return;
      if (/console\.(log|warn|error)|new Error\(/.test(line)) return;

      const where = path.relative(SRC, file).split(path.sep).join('/') + ':' + (index + 1);

      /* A literal chosen by ? : || && */
      const chosen = /(\?|:|\|\||&&)\s*(['"])((?:(?!\2)[^\\]|\\.){3,}?)\2/g;
      let match;
      while ((match = chosen.exec(line))) {
        const before = line.slice(0, match.index);
        if (/\bt\([^)]*$/.test(before)) continue;
        /* `key: 'value'` in an object literal - read by i18nCoverage instead. */
        if (match[1] === ':' && /^\s*[a-zA-Z_]+\s*$/.test(before.split(/[{,(]/).pop())) continue;
        if (readable(match[3])) found.push(where + '  ' + match[3]);
      }

      /* A template literal that starts like a sentence: `Remove ${name}` */
      const template = /`([A-Z][a-z]+[^`]*)`/g;
      while ((match = template.exec(line))) {
        const before = line.slice(0, match.index);
        if (/\bt\([^)]*$/.test(before)) continue;
        const text = match[1].replace(/\$\{[^}]*\}/g, 'X');
        /* Take the names out; a name and a value is not a sentence. */
        const words = text.replace(NOT_PROSE, '').replace(/\bX\b/g, '').trim();
        if (/\s/.test(text) && /[A-Za-z]{3}/.test(words) && readable(text)) {
          found.push(where + '  `' + match[1] + '`');
        }
      }
    });
  });

  return found;
}

test('no English is chosen by an expression without going through t()', () => {
  expect(findBare()).toEqual([]);
});
