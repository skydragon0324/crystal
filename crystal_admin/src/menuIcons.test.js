/*
 * EVERY MENU ICON HAS TO EXIST, and nothing else checks that.
 *
 * The sidebar is built from `manager_pages`, and each row names a react-icons
 * Material icon as a STRING - so the name is chosen in the backend's seed and
 * resolved in the console, and the two halves never meet at build time.
 *
 * `Md[page.icon] || Md.MdChevronRight` is what resolves it, which means a name
 * that does not exist is not an error: it is a chevron. Ten menu entries
 * quietly drew the same arrow after a batch of icons were named from a newer
 * react-icons than the one this project pins, and nothing failed.
 *
 * So the names are checked here, against the version actually installed.
 */
const fs = require('fs');
const path = require('path');
const Md = require('react-icons/md');

/** Where the icon names are written: the seed, and every delta that adds a page. */
const BACKEND = path.join(__dirname, '..', '..', 'crystal-backend');

function sources() {
  const files = [path.join(BACKEND, 'src', 'db', 'seeds', '01_management.js')];

  const deltas = path.join(BACKEND, 'sql', 'deltas');
  fs.readdirSync(deltas).forEach(function (name) {
    if (/\.sql$/.test(name)) files.push(path.join(deltas, name));
  });

  return files.filter(function (file) { return fs.existsSync(file); });
}

/**
 * Every `MdSomething` written as a quoted string.
 *
 * Quoted, so a stray word in a comment cannot be mistaken for an icon - the
 * names only ever appear in this project inside a page row.
 */
function iconNames() {
  const found = new Set();
  const quoted = /'(Md[A-Za-z0-9]+)'/g;

  sources().forEach(function (file) {
    const text = fs.readFileSync(file, 'utf8');
    let match = quoted.exec(text);
    while (match) {
      found.add(match[1]);
      match = quoted.exec(text);
    }
  });

  return [...found];
}

test('the seed names icons that exist in the installed react-icons', () => {
  const names = iconNames();

  // A guard that found nothing is a guard that is not running.
  expect(names.length).toBeGreaterThan(20);

  const missing = names.filter((name) => !Md[name]);
  expect(missing).toEqual([]);
});

test('the fallback the sidebar uses is itself a real icon', () => {
  /*
   * If this ever stops existing, every unresolved icon becomes `undefined` as
   * a component - which is a render crash rather than a quiet chevron, and a
   * much worse failure than the one above.
   */
  expect(Md.MdChevronRight).toBeTruthy();
});
