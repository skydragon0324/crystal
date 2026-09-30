/*
 * REACT 16 RECYCLES SYNTHETIC EVENTS, AND THIS APP IS ON REACT 16.
 *
 * When a handler returns, React nulls the event's fields and puts the object
 * back in a pool. A functional state updater - setX(current => ...) - does
 * not run inside the handler; React calls it later, during the update. So a
 * value read from inside one is read from an event that has already been
 * recycled:
 *
 *   onChange={(event) => setValues((current) => ({
 *     ...current, [id]: event.target.value        // <- target is null by now
 *   }))}
 *
 * which throws "Cannot read properties of null (reading 'value')" on the
 * first keystroke. It was seven fields across the two apps: the product
 * specification editor, two settings rows and the whole wallet transfer form.
 *
 * NOTHING CATCHES THIS EXCEPT USING THE FIELD. It builds, it renders, it
 * looks right, and it breaks when somebody types. React 17 removed pooling,
 * so every example written since is the form that fails here - which is
 * exactly why it needs a test rather than a convention.
 *
 * The fix is always the same: read the value into a local first, then let
 * the updater close over the local.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).reduce((out, entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return out.concat(walk(full));
    return /\.(jsx?)$/.test(entry.name) && !/\.test\.jsx?$/.test(entry.name)
      ? out.concat([full])
      : out;
  }, []);
}

/**
 * The body of every functional updater in a file.
 *
 * Scanned by matching braces rather than by regex alone: the body is an
 * arbitrary expression, and the interesting ones span several lines.
 */
function updaterBodies(code) {
  const bodies = [];
  const re = /\bset[A-Z]\w*\(\s*\(?\s*(\w+)\s*\)?\s*=>/g;
  let match = re.exec(code);

  while (match !== null) {
    let depth = 0;
    let end = re.lastIndex;

    for (; end < code.length; end += 1) {
      const ch = code[end];
      if (ch === '(' || ch === '{' || ch === '[') depth += 1;
      else if (ch === ')' || ch === '}' || ch === ']') {
        if (depth === 0) break;
        depth -= 1;
      }
    }

    bodies.push({ text: code.slice(re.lastIndex, end), line: code.slice(0, match.index).split('\n').length });
    match = re.exec(code);
  }

  return bodies;
}

test('no functional state updater reads a recycled synthetic event', () => {
  const offenders = [];

  walk(SRC).forEach((file) => {
    const code = fs.readFileSync(file, 'utf8');

    updaterBodies(code).forEach((body) => {
      /*
       * currentTarget and nativeEvent are nulled by the same pass, so all
       * three are worth catching rather than just the one that has bitten.
       */
      const uses = body.text.match(/\b(?:event|evt|e)\.(?:target|currentTarget|nativeEvent)\b/g);
      if (!uses) return;

      offenders.push(
        path.relative(SRC, file) + ':' + body.line + ' - ' +
        body.text.replace(/\s+/g, ' ').trim().slice(0, 70)
      );
    });
  });

  expect(offenders).toEqual([]);
});
