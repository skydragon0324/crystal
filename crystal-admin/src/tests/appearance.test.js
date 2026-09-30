/*
 * THE THREE APPEARANCE SETTINGS, ASSERTED RATHER THAN EYEBALLED.
 *
 * Every one of them is the kind of thing that looks right in a screenshot and
 * is wrong in use: a scale that does not persist, a palette that changes the
 * swatch but not the buttons, a step button that walks past the end of the
 * list. None of that shows up in a build.
 *
 * The scale is the one worth the most care. It is applied as the ROOT FONT
 * SIZE, which is what lets `100vh` keep meaning the viewport and Popper keep
 * measuring what it sees - the alternatives (`transform: scale`, `zoom`) break
 * one or both. That only works if the console's own sizes are in rem, so the
 * last test here reads the source and checks they are.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import fs from 'fs';
import path from 'path';

import { AppearanceProvider, useAppearance, SCALES } from '../app/appearance';
import { buildTheme } from '../theme';
import PALETTES from '../theme/palettes';

const SRC = path.join(__dirname, '..');

/** Renders a probe inside the provider and hands back its value. */
function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);

  const seen = {};

  function Probe() {
    Object.assign(seen, useAppearance());
    return null;
  }

  act(() => {
    ReactDOM.render(<AppearanceProvider><Probe /></AppearanceProvider>, host);
  });

  return {
    seen,
    done() {
      act(() => { ReactDOM.unmountComponentAtNode(host); });
      document.body.removeChild(host);
    }
  };
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.style.fontSize = '';
});

test('the console starts at 100% and a readable width', () => {
  const ui = mount();

  expect(ui.seen.scale).toBe(100);
  expect(ui.seen.width).toBe('static');
  expect(document.documentElement.style.fontSize).toBe('16px');

  ui.done();
});

test('the scale is written to the root font size', () => {
  /*
   * 16px is what a browser calls 100%, so 80% has to be 12.8px. Reading the
   * element rather than the state is the point: the state changing without
   * the document changing would leave the whole console at its old size.
   */
  const ui = mount();

  act(() => { ui.seen.setScale(80); });
  expect(document.documentElement.style.fontSize).toBe('12.8px');

  act(() => { ui.seen.setScale(120); });
  expect(document.documentElement.style.fontSize).toBe('19.2px');

  ui.done();
});

test('the +/- buttons walk the steps and stop at both ends', () => {
  const ui = mount();

  act(() => { ui.seen.stepScale(-1); });
  expect(ui.seen.scale).toBe(90);

  act(() => { ui.seen.stepScale(-1); });
  expect(ui.seen.scale).toBe(80);

  /* Already at the smallest: another press must not land off the list. */
  act(() => { ui.seen.stepScale(-1); });
  expect(ui.seen.scale).toBe(80);
  expect(ui.seen.canShrink).toBe(false);

  act(() => { ui.seen.setScale(120); });
  act(() => { ui.seen.stepScale(1); });
  expect(ui.seen.scale).toBe(120);
  expect(ui.seen.canGrow).toBe(false);

  ui.done();
});

test('a choice survives a reload', () => {
  const first = mount();
  act(() => { first.seen.setScale(90); });
  act(() => { first.seen.setPalette('violet'); });
  act(() => { first.seen.setWidth('full'); });
  first.done();

  const second = mount();
  expect(second.seen.scale).toBe(90);
  expect(second.seen.palette).toBe('violet');
  expect(second.seen.width).toBe('full');
  second.done();
});

test('a stored value nobody should have written is ignored', () => {
  /*
   * localStorage is a string a person can edit. A scale of 4000 would render
   * one letter per screen, and the settings drawer needed to reach it would
   * be off the edge of it.
   */
  window.localStorage.setItem(
    'crystal.admin.appearance',
    JSON.stringify({ scale: 4000, palette: 'chartreuse', width: 'sideways' })
  );

  const ui = mount();

  expect(ui.seen.scale).toBe(100);
  expect(ui.seen.palette).toBe('sky');
  expect(ui.seen.width).toBe('static');

  ui.done();
});

test('every palette builds a theme that actually uses it', () => {
  /*
   * A swatch that does not match the buttons is the failure here: the drawer
   * shows the colour from PALETTES and the app paints `brand.500` from the
   * theme, so the two have to be the same value.
   */
  Object.keys(PALETTES).forEach((name) => {
    const theme = buildTheme(name);

    expect(theme.colors.brand[500]).toBe(PALETTES[name].scale[500]);
    expect(theme.colors.brand[50]).toBeTruthy();
    expect(theme.colors.brand[900]).toBeTruthy();

    /* The focus ring travels with the palette rather than staying sky blue. */
    expect(theme.shadows.focus).toContain(PALETTES[name].focus);
  });
});

test('an unknown palette falls back rather than rendering colourless', () => {
  const theme = buildTheme('chartreuse');
  expect(theme.colors.brand[500]).toBe(PALETTES.sky.scale[500]);
});

test('the console sizes itself in rem, so the scale reaches it', () => {
  /*
   * THE ASSERTION THE WHOLE APPROACH RESTS ON.
   *
   * Root font size only moves `rem`. A screen written in px would sit at its
   * original size while the menu and the type around it shrank, which reads
   * as a broken layout rather than as a smaller one.
   *
   * Hairlines are exempt: a 1px border scaled to 0.8px is rounded away on
   * some edges and not others, which looks like a table with gaps in its
   * grid. Anything under 4px is a rule, not a size.
   */
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((out, entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return out.concat(walk(full));
    return /\.jsx?$/.test(entry.name) && !/\.test\.jsx?$/.test(entry.name)
      ? out.concat([full])
      : out;
  }, []);

  const offenders = [];

  walk(SRC).forEach((file) => {
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\*|\/\/)/.test(line)) return;

      /* A whole prop value: "56px", not a px inside a shadow or a calc. */
      (line.match(/(["'])-?\d+(?:\.\d+)?px\1/g) || []).forEach((hit) => {
        const px = Math.abs(Number(hit.replace(/["'px-]/g, '')));
        if (px < 4) return;

        offenders.push(path.relative(SRC, file).split(path.sep).join('/') + ':' + (i + 1) + ' ' + hit);
      });
    });
  });

  expect(offenders).toEqual([]);
});
