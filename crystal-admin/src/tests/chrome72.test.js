/*
 * Chrome 72 is the floor this console supports, and it does not have
 * flexbox `gap` - that landed in Chrome 84.  A property a browser does not
 * know is dropped silently, so an untagged <Flex gap="..."> is not a
 * warning or a fallback: it is a toolbar whose contents run together, and it
 * looks completely fine on the machine of whoever wrote it.
 *
 * That is exactly the kind of breakage no build catches and no reviewer
 * notices, so it is asserted here instead: every flex gap in the source has
 * to carry the data-gap the stylesheet keys its margin fallback on.
 */
const fs = require('fs');
const path = require('path');

/** Grid gap has worked since Chrome 66, so these are legitimately untagged. */
const GRID_TAGS = ['SimpleGrid', 'Grid'];

const SRC = path.join(__dirname, '..');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(js|jsx)$/.test(entry.name) && !/\.test\.jsx?$/.test(entry.name) ? [full] : [];
  });
}

/** Every JSX opening tag in a file, as text. */
function openingTags(source) {
  const tags = [];
  const re = /<([A-Z][A-Za-z0-9]*)\b/g;
  let m;

  while ((m = re.exec(source)) !== null) {
    let depth = 0;
    let end = re.lastIndex;
    for (; end < source.length; end += 1) {
      const ch = source[end];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      else if (ch === '>' && depth === 0) break;
    }
    tags.push({ name: m[1], text: source.slice(m.index, end) });
  }

  return tags;
}

test('every flex gap carries the data-gap its Chrome 72 fallback needs', () => {
  const offenders = [];

  walk(SRC).forEach((file) => {
    const source = fs.readFileSync(file, 'utf8');

    openingTags(source).forEach((tag) => {
      if (GRID_TAGS.indexOf(tag.name) !== -1) return;
      if (!/(^|\s)gap=/.test(tag.text)) return;
      if (/data-gap=/.test(tag.text)) return;

      offenders.push(path.relative(SRC, file) + ' <' + tag.name + '>');
    });
  });

  expect(offenders).toEqual([]);
});

test('the stylesheet has a margin fallback for every pixel value in use', () => {
  const css = fs.readFileSync(path.join(SRC, 'styles', 'app.css'), 'utf8');

  const wanted = {};
  walk(SRC).forEach((file) => {
    const source = fs.readFileSync(file, 'utf8');
    const re = /data-gap=(?:"(\d+)"|\{[^}]*'(\d+)'[^}]*\})/g;
    let m;
    while ((m = re.exec(source)) !== null) wanted[m[1] || m[2]] = true;
  });

  const missing = Object.keys(wanted).filter(
    (px) => css.indexOf("[data-gap='" + px + "']") === -1
  );

  expect(missing).toEqual([]);
});

test('the select and the date picker lift their own panel above a dialog', () => {
  /*
   * The stylesheet rule below is the belt; this is the braces, and it is the
   * half that cannot lose.
   *
   * Chakra's own `.chakra-popover__popper` style is `z-index: inherit`, and
   * emotion injects it at RENDER time - so whether the stylesheet's rule or
   * Chakra's lands last in <head> depends on build mode and load order.  A
   * style prop is not in that race: it always beats the component's `__css`.
   *
   * Asserted against the source for the same reason as the rule below - jest
   * stubs CSS out, so there is no computed z-index in jsdom to measure.
   */
  ['SelectField.jsx', 'DatePicker.jsx'].forEach((file) => {
    const source = fs.readFileSync(path.join(SRC, 'components', file), 'utf8');
    const rule = /rootProps=\{\{\s*zIndex:\s*(\d+)\s*\}\}/.exec(source);

    expect(rule).not.toBeNull();
    expect(Number(rule[1])).toBeGreaterThan(1400);
  });
});

test('a popover is lifted above a dialog by the stylesheet', () => {
  /*
   * This one has to be asserted against the FILE rather than against a
   * render: jest stubs CSS imports out, so the rule is not in the jsdom
   * stylesheet to be measured.  What it guards is real all the same - the
   * rule is the entire fix, and deleting it puts every select and date
   * picker back underneath the form dialog it was opened from.
   */
  const css = fs.readFileSync(path.join(SRC, 'styles', 'app.css'), 'utf8');
  const rule = /\.chakra-popover__popper\s*\{[^}]*z-index:\s*(\d+)/.exec(css);

  expect(rule).not.toBeNull();
  // Chakra's own scale: a modal container is 1400.
  expect(Number(rule[1])).toBeGreaterThan(1400);
});

test('a gapped container that is not a plain row declares its axis', () => {
  /*
   * THE FALLBACK CANNOT READ flex-direction.
   *
   * `gap` is one property whichever way the container runs; a margin is not.
   * So a column, a wrapping row and a container that changes direction at a
   * breakpoint each need an attribute saying so, and a container that grows
   * a `direction` or `wrap` prop later needs one it did not need before.
   * Getting this wrong is silent: the spacing lands on the wrong axis and
   * only on the one browser nobody develops on.
   */
  const missing = [];

  walk(SRC).forEach((file) => {
    openingTags(fs.readFileSync(file, 'utf8')).forEach((tag) => {
      if (!/data-gap=/.test(tag.text)) return;

      const flat = tag.text.replace(/\s+/g, ' ');
      const responsive = /direction=\{\{/.test(flat);
      const column = /direction=["']column["']/.test(flat);
      const wrap = /wrap=["']wrap["']/.test(flat);

      const declared =
        (/data-gap-row-from=/.test(flat) && 'row-from') ||
        (/data-gap-column\b/.test(flat) && 'column') ||
        (/data-gap-wrap\b/.test(flat) && 'wrap') ||
        'row';

      const wanted = responsive ? 'row-from' : wrap ? 'wrap' : column ? 'column' : 'row';

      if (declared !== wanted) {
        missing.push(
          path.relative(SRC, file) + ': is a ' + wanted + ', declares ' + declared +
          ' - ' + flat.slice(0, 70)
        );
      }
    });
  });

  expect(missing).toEqual([]);
});

test('the stylesheet answers every axis a container declares', () => {
  /*
   * A tagged container whose size has no rule for THAT AXIS falls back to
   * the plain row rule, which spaces a column sideways. The size test above
   * only checks that the size exists at all.
   */
  const css = fs.readFileSync(path.join(SRC, 'styles', 'app.css'), 'utf8');
  const wanted = [];

  walk(SRC).forEach((file) => {
    openingTags(fs.readFileSync(file, 'utf8')).forEach((tag) => {
      const px = (tag.text.match(/data-gap="(\d+)"/) || [])[1];
      if (!px) return;

      if (/data-gap-column\b/.test(tag.text)) wanted.push("[data-gap='" + px + "'][data-gap-column]");
      if (/data-gap-wrap\b/.test(tag.text)) wanted.push("[data-gap='" + px + "'][data-gap-wrap]");

      const bp = (tag.text.match(/data-gap-row-from="(\w+)"/) || [])[1];
      if (bp) {
        wanted.push("[data-gap='" + px + "'][data-gap-row-from]");
        wanted.push("[data-gap='" + px + "'][data-gap-row-from='" + bp + "']");
      }
    });
  });

  expect([...new Set(wanted)].filter((sel) => css.indexOf(sel) === -1)).toEqual([]);
});

test('the fallback never puts a margin on the container itself', () => {
  /*
   * THE BUG THIS FILE EXISTS TO KEEP FIXED.
   *
   * The margin belongs to the children. A rule that targets the container
   * moves the container: the header bar grew 16px taller than the 60px
   * strip it sits in and lost its space-between justification against the
   * page gutter, and a bordered card bled outside its section.
   *
   * Anything matching `[data-gap...] {` with no combinator is that mistake.
   */
  const css = fs.readFileSync(path.join(SRC, 'styles', 'app.css'), 'utf8');

  const offenders = (css.match(/^[^\n{}]*\[data-gap[^\n{}]*\{/gm) || [])
    .map((rule) => rule.trim())
    .filter((rule) => rule.indexOf('>') === -1);

  expect(offenders).toEqual([]);
});

test('a gap that changes size at a breakpoint carries both sizes', () => {
  /*
   * `gap={{ base: 2, lg: 8 }}` is 8px on a phone and 32px on a desktop.
   * data-gap holds ONE number, so tagging it alone silently pins the whole
   * site to the phone value: the header navigation sat 8px apart on every
   * desktop running Chrome 72, which reads as a header that is no longer
   * justified rather than as a missing gap.
   *
   * Chakra's space scale is 4px per step, which is what converts the prop
   * to the pixel value the stylesheet keys on.
   */
  const css = fs.readFileSync(path.join(SRC, 'styles', 'app.css'), 'utf8');
  const wrong = [];

  walk(SRC).forEach((file) => {
    openingTags(fs.readFileSync(file, 'utf8')).forEach((tag) => {
      const responsive = tag.text.match(/gap=\{\{([^}]*)\}\}/);
      if (!responsive || !/data-gap=/.test(tag.text)) return;

      const where = path.relative(SRC, file);
      const base = responsive[1].match(/base:\s*(\d+)/);
      const tagged = (tag.text.match(/data-gap="(\d+)"/) || [])[1];

      if (base && String(Number(base[1]) * 4) !== tagged) {
        wrong.push(where + ': base ' + base[1] + ' is ' + Number(base[1]) * 4 + 'px, tagged ' + tagged);
      }

      /* Every OTHER entry in the object is a breakpoint that changes it. */
      const steps = responsive[1].match(/(\w+):\s*(\d+)/g) || [];

      steps.forEach((step) => {
        const parts = step.split(':');
        const bp = parts[0].trim();
        const px = Number(parts[1].trim()) * 4;
        if (bp === 'base') return;

        const attr = 'data-gap-' + bp + '="' + px + '"';
        if (tag.text.indexOf(attr) === -1) {
          wrong.push(where + ': ' + bp + ' gap is ' + px + 'px, needs ' + attr);
        } else if (css.indexOf("[data-gap-" + bp + "='" + px + "']") === -1) {
          wrong.push(where + ': ' + attr + ' has no rule in app.css');
        }
      });
    });
  });

  expect(wrong).toEqual([]);
});
