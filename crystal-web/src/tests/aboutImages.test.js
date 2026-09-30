/*
 * EVERY PICTURE THE CONSOLE CAN UPLOAD REACHES THE PAGE.
 *
 * "I can't set the About page images" was three separate faults, and none of
 * them showed an error anywhere:
 *
 *   THE UPLOAD WAS REFUSED - the API did not accept the 'about' folder. That
 *   one is guarded from the console side (crystal-admin uploadFolders.test).
 *
 *   ITEM IMAGES WERE NEVER LOOKED UP. buildAbout resolved a picture for each
 *   CHAPTER, and every item - a business, a history year, a certificate, a
 *   factory block, a shop floor - carried the slot's name in a field nothing
 *   read. An upload into those slots succeeded and changed nothing on screen.
 *
 *   THE FIELDS DID NOT MATCH. The shop read `floor_number` from rows that say
 *   `floor`, so every floor was labelled "undefinedF".
 *
 * These tests feed buildAbout a picture for a slot and check it comes out
 * where the component reads it.
 */
import { buildAbout, CERTIFICATES, ITEMS, SECTIONS } from '../pages/about/content';
import { toMarkup } from '../pages/about/components/Prose';
import { ABOUT_SECTIONS, CHAPTER_ALIASES, chapterNumber } from '../pages/about/constants';
import ABOUT_IMAGES from '../pages/about/images';

const picture = (src) => [{ id: 1, src: src, dark: null, alt: 'alt', caption: null }];

/** Every slot the content asks for, in order. */
function allSlots() {
  const found = [];
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return undefined;
    if (typeof node.slot === 'string') found.push(node.slot);
    return Object.keys(node).forEach((key) => visit(node[key]));
  };
  visit(SECTIONS);
  visit(ITEMS);
  visit(CERTIFICATES);
  return found;
}

test('no two places on the page share a slot', () => {
  /* A shared slot would put one upload in two places, and the console could
     not tell an editor which one they were changing. */
  const slots = allSlots();
  const repeated = slots.filter((slot, index) => slots.indexOf(slot) !== index);
  expect(repeated).toEqual([]);
});

test('an item picture reaches the item, not just a chapter picture', () => {
  const page = buildAbout({
    'institute.research.software': picture('/uploads/about/research.png'),
    'factory.flow.smt': picture('/uploads/about/smt.png'),
    'presence.headquarters': picture('/uploads/about/hq.png'),
    institute: picture('/uploads/about/institute.png')
  }, 'en');

  expect(page.institute.overview.image_desktop).toBe('/uploads/about/institute.png');
  expect(page.institute.researchAreas[0].image_desktop).toBe('/uploads/about/research.png');
  expect(page.factory.manufacturing.flow[1].image_desktop).toBe('/uploads/about/smt.png');
  expect(page.presence.locations[0].image_desktop).toBe('/uploads/about/hq.png');
});

test('a carousel slot delivers every picture in it, in order', () => {
  const three = [
    { id: 1, src: '/a.png' }, { id: 2, src: '/b.png' }, { id: 3, src: '/c.png' }
  ];

  const page = buildAbout({
    'shop.floor.2': three,
    'institute.technology': three
  }, 'en');

  const second = page.shop.floors.filter((floor) => floor.floor === 2)[0];
  expect(second.images.map((p) => p.src)).toEqual(['/a.png', '/b.png', '/c.png']);

  /*
   * ONE carousel for the whole technology block: there are fewer certificates
   * than technologies, so they belong to the block and the items are titles.
   */
  expect(page.institute.technology.overview.images).toHaveLength(3);
  expect(page.institute.technology.items.filter((item) => item.slot)).toEqual([]);
});

test('a certificate shows its own scan', () => {
  const page = buildAbout({
    'factory.certificate.rohs': picture('/uploads/about/rohs.png')
  }, 'en');

  const rohs = page.factory.certificates.filter((c) => c.slot === 'factory.certificate.rohs')[0];
  expect(rohs.image).toBe('/uploads/about/rohs.png');

  /* And the rest, with nothing uploaded, show their names rather than breaking. */
  expect(page.factory.certificates.filter((c) => c.image).length).toBe(1);
});

test('the shop floors are numbered and ordered by the field they actually have', () => {
  const floors = buildAbout(null, 'en').shop.floors;
  expect(floors.map((floor) => floor.floor)).toEqual([1, 2, 3]);
});

test('chapter numbers come from one list, and a folded chapter keeps its anchor', () => {
  expect(ABOUT_SECTIONS.map((s) => s.id)).not.toContain('manufacturing');
  expect(ABOUT_SECTIONS.map((s) => s.number)).toEqual(
    ABOUT_SECTIONS.map((s, index) => String(index + 1).padStart(2, '0'))
  );
  expect(chapterNumber('history')).toBe('05');
  expect(CHAPTER_ALIASES.manufacturing).toBe('factory');
});

test('a description keeps its bold and its line breaks, and nothing else', () => {
  expect(toMarkup('<strong>Four hundred</strong> engineers')).toBe('<strong>Four hundred</strong> engineers');

  /* Anything outside the four allowed tags is shown as text, never run. */
  expect(toMarkup('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  expect(toMarkup('<a href="x">link</a>')).toBe('&lt;a href=&quot;x&quot;&gt;link&lt;/a&gt;');
  expect(toMarkup('<strong onclick="x">no</strong>')).toContain('&lt;strong onclick');

  /* The line break is left in the text; `white-space: pre-line` shows it. */
  expect(toMarkup('first\nsecond')).toBe('first\nsecond');

  /* The name, bold and larger - and still no attributes on it. */
  expect(toMarkup('<big>Crystal</big> designs')).toBe('<big>Crystal</big> designs');
  expect(toMarkup('<big style="x">Crystal</big>')).toContain('&lt;big style');
});

/* ------------------------------------------------------------------ */
/*  the manifest, now that the pictures are files in this project      */
/* ------------------------------------------------------------------ */

/*
 * THE THREE LISTS THAT USED TO DRIFT ARE TWO, AND BOTH ARE IN THIS PROJECT.
 *
 * A picture was a row somebody uploaded into a named slot, so the page could
 * ask for a slot nobody had filled, or an editor could fill one the page
 * never asks for - "I can't set the About page images" was exactly that, and
 * a test in the console (aboutSlots.test.js) held the console's list, the
 * page's list and the seed's list together across three projects.
 *
 * The pictures are files here now (pages/about/images.js), so what is left to
 * check is the marriage itself: every slot the copy asks for has a picture,
 * every picture is for a slot that exists, and every file named in the
 * manifest is on disk - which the build also enforces, but a missing file
 * should fail as a test rather than as a broken deploy.
 */
const fsp = require('fs');
const pathp = require('path');

const ASSETS = pathp.join(__dirname, '..', 'assets', 'images', 'about');

test('every slot the page asks for has a picture, and every picture has a slot', () => {
  const asked = allSlots().filter((slot, index, all) => all.indexOf(slot) === index);
  const held = Object.keys(ABOUT_IMAGES);

  expect(asked.filter((slot) => held.indexOf(slot) === -1)).toEqual([]);
  expect(held.filter((slot) => asked.indexOf(slot) === -1)).toEqual([]);
});

test('every picture in the manifest is a file on disk', () => {
  /*
   * Jest gives an imported image its file NAME (CRA's file transform), which
   * is enough to look for it beside the others - and is the same name webpack
   * fingerprints in a real build.
   */
  const onDisk = fsp.readdirSync(ASSETS);

  const missing = [];
  Object.keys(ABOUT_IMAGES).forEach((slot) => {
    ABOUT_IMAGES[slot].forEach((picture) => {
      [picture.src, picture.dark].filter(Boolean).forEach((file) => {
        const name = pathp.basename(String(file));
        if (onDisk.indexOf(name) === -1) missing.push(slot + ' -> ' + name);
      });
    });
  });

  expect(missing).toEqual([]);
});

test('every picture carries alt text, because the page is read aloud too', () => {
  const silent = [];

  Object.keys(ABOUT_IMAGES).forEach((slot) => {
    ABOUT_IMAGES[slot].forEach((picture, index) => {
      if (!picture.alt || !String(picture.alt).trim()) silent.push(slot + '[' + index + ']');
    });
  });

  expect(silent).toEqual([]);
});
