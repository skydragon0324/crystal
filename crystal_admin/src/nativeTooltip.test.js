/*
 * NO NATIVE `title` TOOLTIPS.
 *
 * `title="Back to top"` on a button produces the OPERATING SYSTEM's tooltip:
 * its font, its colours, its timing, its position. None of that can be
 * styled, so on a site set in AppFont one grey box in the system font appears
 * over it - and it is the only text on the page the design does not reach.
 *
 * It is also the worst tooltip available: it waits about a second, it never
 * appears on touch at all, and a screen reader may read it INSTEAD of the
 * accessible name, so the same words get announced twice or the wrong ones
 * once.
 *
 * Chakra's <Tooltip> is the replacement, and `aria-label` STAYS - the two do
 * different jobs. A tooltip is a visual affordance; aria-label is the
 * accessible name.
 *
 * THE TRAP THIS TEST HAS TO AVOID: `title` is also an ordinary prop name on
 * this project's own components - <Card title=...>, <SectionHero title=...>,
 * <FormModal title=...> - and those are headings, not tooltips. Banning the
 * word outright would flag eighty innocent lines and be deleted within a day.
 * So only elements that render a real DOM node are inspected.
 */
const fs = require('fs');
const path = require('path');

const SRC = __dirname;

/**
 * Components whose props reach the DOM, where `title` becomes the attribute.
 *
 * Chakra factory components spread unknown props onto the element they
 * render, so `title` on any of these is a native tooltip. A project component
 * with a capitalised name of its own - Card, SectionHero - is not here,
 * because for those `title` is a heading it renders itself.
 */
const DOM_ELEMENTS = [
  'IconButton', 'Button', 'Box', 'Flex', 'Text', 'Link', 'Image', 'Icon',
  'Input', 'Textarea', 'Badge', 'Tag', 'Heading', 'Avatar',
  'a', 'button', 'div', 'span', 'img', 'input'
];

function sources(dir, found) {
  const out = found || [];

  fs.readdirSync(dir).forEach((name) => {
    const full = path.join(dir, name);

    if (fs.statSync(full).isDirectory()) {
      if (name === 'node_modules') return;
      sources(full, out);
      return;
    }

    if (!/\.jsx?$/.test(name)) return;
    if (/\.test\.jsx?$/.test(name)) return;

    out.push(full);
  });

  return out;
}

test('nothing sets a native title tooltip on a DOM element', () => {
  const offences = [];

  sources(SRC).forEach((file) => {
    const text = fs.readFileSync(file, 'utf8');

    DOM_ELEMENTS.forEach((element) => {
      /*
       * An opening tag for this element, up to its closing bracket, with a
       * `title=` prop inside it. The `[^>]*?` cannot cross into the next tag,
       * so a <Card title=...> further down the file is not attributed to a
       * <Box> above it.
       */
      const re = new RegExp('<' + element + '(\\s[^>]*?)?\\stitle=', 'g');
      let match = re.exec(text);

      while (match) {
        const line = text.slice(0, match.index).split('\n').length;
        offences.push(path.relative(SRC, file) + ':' + line + '  <' + element + ' title=');
        match = re.exec(text);
      }
    });
  });

  expect(offences).toEqual([]);
});
