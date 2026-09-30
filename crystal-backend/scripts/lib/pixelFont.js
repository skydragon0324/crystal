'use strict';

/**
 * A 5x7 BITMAP FONT, because mock artwork has to say what it is.
 *
 * The SVG placeholders can set `font-family` and let the browser find a
 * typeface. A GIF cannot: it is a grid of pixels, and something has to decide
 * which of them are ink. That is all this file does.
 *
 * It exists for the mock generator and for nothing else. Five pixels by seven
 * is the smallest grid that holds a legible capital alphabet, and the labels
 * it draws - "HERO 07", "SALE", "VIDEO" - are there so that a developer
 * looking at twenty-two seeded adverts can tell which one is on screen.
 *
 * Each glyph is seven bytes, one per row, five bits wide, written as hex:
 *
 *   'C' -> 0E 11 10 10 10 11 0E      .###.
 *                                    #...#
 *                                    #....
 *                                    #....
 *                                    #....
 *                                    #...#
 *                                    .###.
 */

const WIDTH = 5;
const HEIGHT = 7;

const GLYPHS = {
  A: '0E11111F111111',
  B: '1E11111E11111E',
  C: '0E11101010110E',
  D: '1E11111111111E',
  E: '1F10101E10101F',
  F: '1F10101E101010',
  G: '0E10101711110F',
  H: '1111111F111111',
  I: '0E04040404040E',
  J: '0702020202120C',
  K: '11121418141211',
  L: '1010101010101F',
  M: '111B1515111111',
  N: '11191513111111',
  O: '0E11111111110E',
  P: '1E11111E101010',
  Q: '0E11111115120D',
  R: '1E11111E141211',
  S: '0F10100E01011E',
  T: '1F040404040404',
  U: '1111111111110E',
  V: '11111111110A04',
  W: '11111115151B11',
  X: '11110A040A1111',
  Y: '11110A04040404',
  Z: '1F01020408101F',
  0: '0E11131519110E',
  1: '040C040404040E',
  2: '0E11010204081F',
  3: '1F02040201110E',
  4: '02060A121F0202',
  5: '1F101E0101110E',
  6: '0608101E11110E',
  7: '1F010204080808',
  8: '0E11110E11110E',
  9: '0E11110F01020C',
  '-': '0000001F000000',
  '.': '00000000000404',
  ' ': '00000000000000'
};

/** The seven row bitmaps of one character, or the blank. */
function rowsOf(character) {
  const hex = GLYPHS[String(character).toUpperCase()] || GLYPHS[' '];
  const rows = [];
  for (let i = 0; i < HEIGHT; i += 1) {
    rows.push(parseInt(hex.substr(i * 2, 2), 16));
  }
  return rows;
}

/** How wide a string is once drawn, in source pixels (one column between letters). */
function measure(text) {
  const length = String(text).length;
  return length ? (length * WIDTH) + (length - 1) : 0;
}

/**
 * Draws text into a caller's buffer, one call per lit pixel.
 *
 * `plot(x, y)` is handed device pixels, already scaled, so the caller decides
 * what a pixel IS - an index into a GIF palette, four bytes of RGBA - and
 * this file never learns about either.
 */
function draw(text, options, plot) {
  const scale = (options && options.scale) || 1;
  const left = (options && options.x) || 0;
  const top = (options && options.y) || 0;
  const letters = String(text).split('');

  letters.forEach(function (character, index) {
    const rows = rowsOf(character);
    const originX = left + (index * (WIDTH + 1) * scale);

    rows.forEach(function (bits, row) {
      for (let column = 0; column < WIDTH; column += 1) {
        /* The leftmost column is the high bit of the five. */
        if (!(bits & (1 << (WIDTH - 1 - column)))) continue;

        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) {
            plot(originX + (column * scale) + dx, top + (row * scale) + dy);
          }
        }
      }
    });
  });
}

module.exports = {
  WIDTH: WIDTH,
  HEIGHT: HEIGHT,
  measure: measure,
  draw: draw
};
