/*
 * EVERY FOLDER THE CONSOLE UPLOADS INTO IS ONE THE API ACCEPTS.
 *
 * The API refuses an upload into any folder not on its list - a caller that
 * could name its own folder could write outside the upload root. The console
 * names the folder per field (`folder: 'about'`), and nothing joined the two.
 *
 * So the About images screen uploaded into 'about', the API refused it, and
 * every picture on the company introduction was impossible to set. From the
 * console a refused folder is indistinguishable from a broken upload, which
 * is how it was reported.
 *
 * The allow-list is read out of the backend's own source rather than copied
 * here, because a copy is exactly the second list that drifts.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..');
const STORAGE = path.join(__dirname, '..', '..', '..', 'crystal-backend', 'src', 'config', 'storage.js');

function allowedFolders() {
  const source = fs.readFileSync(STORAGE, 'utf8');
  const match = /const FOLDERS = \[([\s\S]*?)\];/.exec(source);
  if (!match) return [];

  return (match[1].match(/'([^']+)'/g) || []).map((quoted) => quoted.slice(1, -1));
}

function sources(dir, out) {
  const found = out || [];
  fs.readdirSync(dir).forEach((name) => {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) return sources(full, found);
    if (/\.jsx?$/.test(name) && !/\.test\.jsx?$/.test(name)) found.push(full);
    return undefined;
  });
  return found;
}

test('the backend list can still be read', () => {
  /* A restructured storage.js must fail this loudly, not pass on an empty list. */
  expect(allowedFolders()).toContain('products');
});

test('no field uploads into a folder the API refuses', () => {
  const allowed = allowedFolders();
  const refused = [];

  sources(SRC).forEach((file) => {
    const text = fs.readFileSync(file, 'utf8');
    const re = /folder:\s*'([^']+)'|folder \|\| '([^']+)'/g;
    let match = re.exec(text);

    while (match) {
      const folder = match[1] || match[2];
      if (allowed.indexOf(folder) === -1) {
        refused.push(path.relative(SRC, file) + '  ' + folder);
      }
      match = re.exec(text);
    }
  });

  expect(refused).toEqual([]);
});
