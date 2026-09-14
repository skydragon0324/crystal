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

import dictionaries from './i18n/dictionaries';

const SRC = __dirname;

/**
 * Strings that are deliberately the same in every language.
 *
 * A brand name is not untranslated - it is a name. The list is short and
 * every entry should be arguable out loud; "we have not got to it yet" is
 * not a reason to add one.
 */
const SAME_IN_EVERY_LANGUAGE = [
  'Crystal', 'Crystal OS', 'Eshop', 'Appstore', 'Eproduct',
  /* Products named after the brand; "Crystal 应用" is not a thing anybody
     types into a support form. */
  'Crystal app', 'Crystal App',
  /* The warranty product's name, as sold. */
  'Care+'
];

/**
 * Files whose quoted strings are NOT prose, however much they look like it.
 *
 * Each of these is a case where translating would BREAK something rather than
 * merely be unnecessary, which is why they are excluded by file rather than by
 * adding twenty names to the list above:
 *
 *   theme/palettes.js is NOT here - "Sky" and "Emerald" are shown to a reader
 *   in the appearance drawer, so they are translated like any other word.
 */
const NOT_PROSE = [
  /*
   * FONT STACKS. `label: 'Times New Roman'` in the editor's font picker is a
   * CSS family name that has to survive into the document's markup verbatim -
   * translating it would produce a font nobody has. The Chinese entries are
   * already written in Chinese for the same reason: they are the font's name.
   */
  path.join('components', 'RichTextEditor.jsx'),
  /*
   * THE LANGUAGE PICKER. Each locale's label is deliberately written in that
   * locale - 简体中文 is how a Chinese reader recognises Chinese in a list, and
   * "Chinese" translated into Chinese would defeat the entire control.
   */
  path.join('i18n', 'index.js')
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
    /* Tests, and the fixtures they are built from, are not on screen. */
    if (/\.test\.jsx?$/.test(entry.name)) return [];
    if (/\.fixtures\.jsx?$/.test(entry.name)) return [];
    if (NOT_PROSE.some((tail) => full.endsWith(tail))) return [];

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
       * AND THE OBJECT LITERALS, which is where most of this console's words
       * actually live and where this test was blind.
       *
       *   { key: 'part_price', label: 'Part price' }
       *   { name: 'content', label: 'Notice', help: 'Shown in the dialog...' }
       *
       * Every table column, every form field and every select option is
       * declared this way and handed to a component that calls `t(label)`.
       * Scanning only JSX attributes and tag text meant the product editor
       * could - and did - reach a Chinese reader with an English column
       * header on every one of its six tabs, while this test passed.
       *
       * `key:` and `name:` are deliberately not in TEXT_PROPS: they are
       * identifiers that happen to sit on the same line as the words.
       */
      TEXT_PROPS.forEach((prop) => {
        const re = new RegExp(`\\b${prop}:\\s*'((?:[^'\\\\]|\\\\.){2,}?)'`, 'g');
        let match = re.exec(line);

        while (match) {
          /* The source escapes what the catalogue holds plainly. */
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
