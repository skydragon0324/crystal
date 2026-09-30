/*
 * THE DICTIONARIES HAVE TO AGREE WITH EACH OTHER AND WITH THE CODE.
 *
 * Three failure modes, none of which shows up in a diff:
 *
 *   A KEY IN en AND NOT IN zh falls through to the English. On a Chinese
 *   screen that is one English sentence among Chinese ones - it looks like a
 *   styling accident rather than a missing translation, so it is reported as
 *   "the layout is odd here", if at all.
 *
 *   A KEY IN zh AND NOT IN en is unreachable. The lookup walks the English
 *   catalogue for the fallback and builds the English-value index from it, so
 *   a Chinese entry with no English counterpart can never be selected by
 *   anything.
 *
 *   A KEY NOTHING CALLS is dead weight in three languages at once. Four
 *   hundred entries is already more than one person can hold, and the ones
 *   that are no longer used are exactly the ones that make finding the right
 *   one hard - which is the complaint this file exists to answer.
 */
import dictionaries from '../i18n/dictionaries';

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..');

/** 'a.b.c' -> value, for every leaf in a catalogue. */
function flatten(node, prefix, out) {
  const found = out || {};

  Object.keys(node || {}).forEach((name) => {
    const value = node[name];
    const address = prefix ? prefix + '.' + name : name;

    if (value && typeof value === 'object') flatten(value, address, found);
    else found[address] = value;
  });

  return found;
}

const en = flatten(dictionaries.en);

/*
 * Every catalogue beside the English, read from the file rather than listed, so
 * a language added there is held to both tests below from its first entry.
 */
const TRANSLATIONS = Object.keys(dictionaries)
  .filter((code) => code !== 'en')
  .map((code) => ({ code: code, entries: flatten(dictionaries[code]) }));

test('every English key is translated into every other language', () => {
  const missing = [];

  Object.keys(en).forEach((key) => {
    TRANSLATIONS.forEach((other) => {
      if (other.entries[key] === undefined) missing.push(other.code + '  ' + key);
    });
  });

  expect(missing).toEqual([]);
});

test('no translation exists that English cannot reach', () => {
  const orphans = [];

  TRANSLATIONS.forEach((other) => {
    Object.keys(other.entries).forEach((key) => {
      if (en[key] === undefined) orphans.push(other.code + '  ' + key);
    });
  });

  expect(orphans).toEqual([]);
});

/* ------------------------------------------------------------------ usage */

/** Every .js/.js under src/, tests and the dictionaries themselves excluded. */
function sources(dir, found) {
  const out = found || [];

  fs.readdirSync(dir).forEach((name) => {
    const full = path.join(dir, name);

    if (fs.statSync(full).isDirectory()) {
      if (name === 'node_modules') return;
      sources(full, out);
      return;
    }

    if (!/\.js?$/.test(name)) return;
    if (/\.test\.js?$/.test(name)) return;
    if (full.indexOf(path.join(SRC, 'i18n')) === 0) return;

    out.push(full);
  });

  return out;
}

/*
 * THE CODE, WITH ITS STRING ESCAPES UNDONE.
 *
 * This matters and it nearly cost a live translation. A field writes
 *
 *   help: 'Only orders this list. Which notice is read first is the notice\'s own order.'
 *
 * and the dictionary holds the PARSED value, with a plain apostrophe. Searching
 * the raw source for the parsed string misses it on the backslash, so the entry
 * reported as dead was in use on a screen - and "delete the unused ones" would
 * have taken it out in three languages.
 *
 * Undoing \' and \" is enough for what dictionaries actually contain; this is a
 * text search, not a parser, and anything fancier belongs in a parser.
 */
const CODE = sources(SRC)
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n')
  .replace(/\\'/g, "'")
  .replace(/\\"/g, '"');

test('no dictionary entry is dead', () => {
  /*
   * A KEY IS USED IF THE CODE MENTIONS IT, EITHER WAY IT CAN BE ASKED FOR.
   *
   * The lookup takes two forms and both have to count here, or this test
   * deletes strings that are working:
   *
   *   t('members.feedback.send')   the ADDRESS, written at the call site
   *   t('Approved')                the ENGLISH, for a label that arrives as
   *                                data - a column's `label`, a status from
   *                                the API, a page name out of the database
   *
   * The second is why the English VALUE is searched for as well as the key.
   * A `{ label: 'Approved' }` in a fields array is a real use of the entry
   * whose English is "Approved", and nothing in the file names its address.
   *
   * A DOTTED PREFIX COUNTS TOO. Some call sites build the tail -
   * `t('vocabulary.' + code)` - so an entry under a section the code
   * addresses dynamically is in use even though its full address appears
   * nowhere. Those sections are listed below rather than guessed at, because
   * "something might build this" would excuse every key in the file.
   */
  const DYNAMIC_SECTIONS = [
    /* Built from a code at the call site rather than written out. */
    'vocabulary.'
  ];

  const dead = Object.keys(en).filter((key) => {
    if (DYNAMIC_SECTIONS.some((prefix) => key.indexOf(prefix) === 0)) return false;

    /* By address. */
    if (CODE.indexOf(key) !== -1) return false;

    /* By its English text, which is how a data-borne label resolves. */
    const english = en[key];
    if (typeof english === 'string' && english && CODE.indexOf(english) !== -1) return false;

    return true;
  });

  expect(dead).toEqual([]);
});

/*
 * NO KEY IS DEFINED TWICE IN THE SAME SECTION.
 *
 * A duplicate key in a JS object literal is NOT an error - the later one
 * silently wins. That is exactly how a careful fix gets quietly undone: a
 * sentence rewritten as one string with a {placeholder} was inserted at the
 * top of its section while the old fragment version still sat forty lines
 * below, so the fragment shadowed the fix and the number never appeared on
 * screen. Everything still "worked"; it just showed the old text.
 *
 * The build does warn (no-dupe-keys) - and a warning in a hundred-line build
 * log that ends "Compiled with warnings" is not a stop. This is.
 *
 * It reads the FILE, not the parsed object: by the time it is an object the
 * duplicate has already been collapsed and there is nothing left to find.
 */
test('no dictionary key is defined twice in the same section', () => {
  const text = fs.readFileSync(path.join(SRC, 'i18n', 'dictionaries.js'), 'utf8');

  /* One frame per nesting level, holding the keys seen at that level. */
  let stack = [{}];
  const clashes = [];

  text.split('\n').forEach((line, index) => {
    /*
     * THE FILE HOLDS SEVERAL CATALOGUES, not one - `const en = {...}`, then zh,
     * then ru. Each opens a fresh namespace, and without this reset every
     * section name in Chinese is reported as a duplicate of its English twin
     * and the test condemns the whole file.
     */
    if (/^const\s+[A-Za-z_][A-Za-z0-9_]*\s*=\s*\{/.test(line)) { stack = [{}]; return; }

    const entry = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.)/);

    if (entry) {
      const name = entry[1];
      const frame = stack[stack.length - 1];

      if (Object.prototype.hasOwnProperty.call(frame, name)) {
        clashes.push(
          'dictionaries.js:' + (index + 1) + "  '" + name +
          "' is already defined at line " + frame[name]
        );
      } else {
        frame[name] = index + 1;
      }

      /* A key whose value opens an object starts a new frame. */
      if (entry[2] === '{') stack.push({});
      return;
    }

    if (/^\s*\}/.test(line) && stack.length > 1) stack.pop();
  });

  expect(clashes).toEqual([]);
});
