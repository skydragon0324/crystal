/*
 * EVERY WORD ON SCREEN RESOLVES TO SOMETHING IN THE CATALOGUE.
 *
 * The companion test in i18n.test.js checks that entries which EXIST are
 * translated. This checks the other half, which is the half that had holes:
 * text that reaches the page without ever being looked up.
 *
 * IT IS NOT "IS IT WRAPPED IN t()". That question overstates the problem
 * badly, because a string is looked up TWICE - as a dotted address, and
 * failing that against an index of the catalogue's English values. So a bare
 * `label="Approved"` handed to a component that calls `t(label)` is perfectly
 * translated, as long as some entry has "Approved" as its English text. When
 * this was first measured, forty-seven candidates came back and only
 * twenty-two of them were real.
 *
 * So the question asked here is the one that decides what a reader sees:
 * given this string, does the catalogue have an answer for it?
 */
import fs from 'fs';
import path from 'path';

import dictionaries from '../i18n/dictionaries';

const SRC = path.join(__dirname, '..');

/**
 * Strings that are deliberately the same in every language.
 *
 * A brand name is not untranslated - it is a name. The list is short and
 * every entry should be arguable out loud; "we have not got to it yet" is
 * not a reason to add one.
 */
const SAME_IN_EVERY_LANGUAGE = [
  'Crystal', 'Crystal OS', 'Eshop', 'Appstore', 'Eproduct',
  /* An app named after the brand, in both the casings it is written in. */
  'Crystal App', 'Crystal app'
];

/**
 * Files this test does not read, because something ELSE reads them properly.
 *
 * An exclusion here is only honest if it names the test that took the job on.
 */
const COVERED_ELSEWHERE = [
  /*
   * THE ABOUT PAGE'S PROSE. Fifteen hundred words that do not go through the
   * catalogue at all - content.js holds the English and content.zh.js /
   * content.ru.js mirror it field for field, which is the right shape for
   * paragraphs and the wrong shape for a key-value store.
   *
   * aboutContent.test.js checks it far more strictly than this test could: it
   * builds the page in every locale and compares string BY PATH, so a chapter
   * left in English fails even though the page has the same number of words.
   */
  path.join('pages', 'about', 'content.js'),
  path.join('pages', 'about', 'content.zh.js'),
  path.join('pages', 'about', 'content.ru.js'),
  /*
   * THE LANGUAGE PICKER, whose labels are each written in their own language
   * on purpose - 简体中文 is how a Chinese reader finds Chinese in a list.
   */
  path.join('i18n', 'index.js'),
  /*
   * THE SCENE PRESETS' NAMES AND HINTS. "Product hero", "the handset rises,
   * its screen and camera arrive" - these are written for the person BUILDING
   * an advert in the console, not for anybody reading the storefront, and the
   * storefront never draws one. They live here because a preset is the shape
   * of a scene and belongs beside the component that draws scenes; the console
   * has its own copy of the list, in its own catalogue, for the screen that
   * actually shows them.
   */
  path.join('components', 'ImageAnimator', 'presets.js'),
  /*
   * THE EDITOR'S FONT PICKER. 'Times New Roman' is a CSS family name that has
   * to survive into the markup verbatim - a translated one is a font nobody
   * has. The Chinese entries are written in Chinese for the same reason: that
   * is the typeface's name. The console excludes its copy for this too.
   */
  path.join('components', 'common', 'RichTextEditor.js')
];

/** Props whose value a person reads. */
const TEXT_PROPS = [
  'placeholder', 'label', 'title', 'aria-label', 'emptyTitle', 'emptyHint',
  'description', 'helperText', 'heading', 'subtitle', 'confirmLabel',
  'cancelLabel', 'submitLabel', 'primaryText', 'secondaryText'
];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);

    if (!/\.(js|jsx)$/.test(entry.name)) return [];
    if (/\.test\.jsx?$/.test(entry.name)) return [];
    if (COVERED_ELSEWHERE.some((tail) => full.endsWith(tail))) return [];

    return [full];
  });
}

/**
 * English text -> this locale's text, flattened the way the runtime flattens
 * it in i18n/index.js. Reading the catalogue rather than restating it is what
 * keeps this test true when somebody moves an entry between sections.
 */
function textIndex() {
  const index = {};

  const visit = (node) => {
    Object.keys(node).forEach((name) => {
      const value = node[name];
      if (value && typeof value === 'object') visit(value);
      else if (typeof value === 'string') index[value] = true;
    });
  };

  visit(dictionaries.en);
  return index;
}

/**
 * A run of words a reader would recognise as a sentence.
 *
 * The exclusions are all forms that LOOK like text to a regular expression
 * and are not: an identifier, a path, a CSS value, and - the one that caused
 * the most noise - a fragment of JavaScript caught between a `>` and a `<`,
 * as in `{(row.is_system ? ... )}`.
 */
function readable(text) {
  const value = String(text).trim();

  if (value.length < 2) return false;
  if (!/[A-Za-z]{3}/.test(value)) return false;

  /* A fragment of an expression, not a sentence. */
  if (/[(){}[\]]|=>|&&|\|\||===|\?\s*$/.test(value)) return false;

  if (/^[a-z][a-zA-Z0-9]*$/.test(value)) return false;
  if (/^[A-Z][A-Z0-9_]*$/.test(value)) return false;
  if (/^[./#]/.test(value)) return false;
  if (/^https?:/.test(value)) return false;
  if (/^\d/.test(value)) return false;

  /*
   * AN ADDRESS IS NOT PROSE.
   *
   * `label: 'account.storefront.eshop.no'` is a KEY passed as data - the
   * lookup walks it through the sections and hands back the translation. It
   * is already translated, by the FIRST of the two lookup paths, and
   * reporting it here sends somebody off to add a dictionary entry whose
   * English value is a dotted address.
   *
   * The rule is the runtime's own, from i18n/index.js: dotted AND no spaces.
   * The space clause is what stops an English sentence - which ends in a full
   * stop - being waved through as an address.
   */
  if (value.indexOf('.') !== -1 && value.indexOf(' ') === -1) return false;

  return true;
}

function candidates() {
  const found = [];

  walk(SRC).forEach((file) => {
    const relative = path.relative(SRC, file);

    fs.readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      /* Comments are not on screen. */
      if (/^\s*(\*|\/\/|\/\*)/.test(line)) return;

      const at = `${relative}:${index + 1}`;

      (line.match(/>([^<>{}\n]{2,})</g) || []).forEach((chunk) => {
        const text = chunk.slice(1, -1).trim();
        if (readable(text)) found.push({ at, text });
      });

      TEXT_PROPS.forEach((prop) => {
        const match = line.match(new RegExp(`\\b${prop}="([^"]{2,})"`));
        if (match && readable(match[1])) found.push({ at, text: match[1] });
      });

      /*
       * AND THE OBJECT LITERALS, which this was blind to.
       *
       *   { key: 'points', label: 'Points' }
       *   { value: 'ESHOP', label: 'Eshop' }
       *
       * Table columns, filter options and the account menu are all declared
       * as data and handed to something that calls `t(label)`. Scanning only
       * tag text and JSX attributes meant a whole column header could reach a
       * Chinese reader in English with this test passing.
       */
      TEXT_PROPS.forEach((prop) => {
        const re = new RegExp(`\\b${prop}:\\s*'((?:[^'\\\\]|\\\\.){2,}?)'`, 'g');
        let match = re.exec(line);

        while (match) {
          const text = match[1].replace(/\\'/g, "'").replace(/\\"/g, '"');
          if (readable(text)) found.push({ at, text });
          match = re.exec(line);
        }
      });
    });
  });

  return found;
}

test('every string on screen has an answer in the catalogue', () => {
  /*
   * WHAT A FAILURE MEANS, and how to fix it.
   *
   * The string reaches a reader in English whatever language they chose. Add
   * an entry whose ENGLISH VALUE is exactly that string, in the section for
   * the page it is on - the call site does not have to change, because the
   * lookup finds it by its text.
   *
   * If it is a brand name, put it in SAME_IN_EVERY_LANGUAGE above and be
   * ready to say why out loud.
   */
  const index = textIndex();

  const missing = candidates()
    .filter((found) => !index[found.text])
    .filter((found) => SAME_IN_EVERY_LANGUAGE.indexOf(found.text) === -1)
    .map((found) => `${found.at}  "${found.text}"`);

  expect(missing).toEqual([]);
});
