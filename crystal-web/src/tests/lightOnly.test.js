/*
 * THE STOREFRONT RUNS IN LIGHT MODE, AND A STORED PREFERENCE CANNOT OVERRULE IT.
 *
 * The site is not designed in two schemes: it HAS a night mode, inherited
 * from the component library, and its dark surfaces were never reviewed
 * against the photography or the certificate scans. So it is switched off.
 *
 * WHAT MAKES THIS WORTH TESTING is the half that is easy to get wrong.
 * `initialColorMode: 'light'` only decides what a visitor with NO stored
 * choice gets - and Chakra writes the choice to localStorage, so anybody who
 * ever pressed the dark button stays dark on every visit, for as long as that
 * key survives. Changing a default does not reach them. These tests hold the
 * manager that does.
 *
 * AND THE FLAG IS THE WHOLE SWITCH. Turning ALLOW_NIGHT_MODE to true has to
 * be all it takes, which means nothing may hardcode light beside it.
 */
import { localStorageManager } from '@chakra-ui/react';

import {
  ALLOW_NIGHT_MODE, DEFAULT_COLOUR_MODE, colourModeManager
} from '../app/colourMode';
import theme from '../theme';

const STORAGE_KEY = 'chakra-ui-color-mode';

afterEach(() => {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    /* A browser with storage blocked is a browser this still has to work in. */
  }
});

test('light is the default, and night mode is off', () => {
  expect(DEFAULT_COLOUR_MODE).toBe('light');
  expect(ALLOW_NIGHT_MODE).toBe(false);
});

test('the theme takes its scheme from that one place, not a literal', () => {
  /*
   * If this were written out as 'light' in the theme as well, flipping the
   * flag would leave the two disagreeing - and the symptom would be a site
   * that looks light but reports dark to every `useColorModeValue`.
   */
  expect(theme.config.initialColorMode).toBe(DEFAULT_COLOUR_MODE);

  /* A reader whose laptop is set to dark has not asked this site for
     anything, so the system preference is never followed either. */
  expect(theme.config.useSystemColorMode).toBe(false);
});

test('a visitor who once chose dark still gets light', () => {
  /*
   * THE CASE THAT A DEFAULT DOES NOT COVER. This key is what the dark button
   * wrote, possibly months ago, and it is why forcing the mode in an effect
   * would show them a frame of the wrong scheme on every single load.
   */
  window.localStorage.setItem(STORAGE_KEY, 'dark');

  expect(colourModeManager.get()).toBe('light');
  expect(colourModeManager.get('dark')).toBe('light');
});

test('nothing can write a dark preference while night mode is off', () => {
  colourModeManager.set('dark');

  /* The write is thrown away rather than stored, so a cached bundle that
     still has the old control cannot leave the site dark either. */
  expect(colourModeManager.get()).toBe('light');
});

test('the stored choice is not deleted, so it comes back when the flag flips', () => {
  /*
   * Deliberate: it costs nothing to leave, and it means a reader who had
   * chosen dark gets their choice back the day night mode is designed,
   * rather than being quietly reset.
   */
  window.localStorage.setItem(STORAGE_KEY, 'dark');
  colourModeManager.get();
  colourModeManager.set('light');

  expect(window.localStorage.getItem(STORAGE_KEY)).toBe('dark');
});

test('the manager still claims localStorage, which is what Chakra reads it for', () => {
  /*
   * Chakra uses `type` to decide whether it may touch storage during server
   * rendering. Lying about it to express "there is no storage here" would be
   * a different bug in a different place.
   */
  expect(colourModeManager.type).toBe('localStorage');

  /* And the real manager is what returns the day the flag flips. */
  expect(colourModeManager).not.toBe(localStorageManager);
});
