'use strict';

/**
 * THE MOVING MOCK ADVERT, drawn as frames of palette indices.
 *
 * One composition, used twice: the GIF encoder beside this file turns these
 * frames into an animated GIF, and the one-off video tool (scripts/mock/)
 * turns the same frames into RGBA and encodes an MP4 from them. Two mock
 * formats that look like each other is the point - a developer looking at a
 * seeded carousel should be able to tell a still from a GIF from a film by
 * what it SAYS, not by guessing from how it moves.
 *
 * What is drawn: a diagonal gradient in the slide's own hue, a light sweep
 * travelling across it, a slow pulse, and the label in the 5x7 font. It is
 * deliberately plain. Mock artwork that looks like a real advert is mock
 * artwork somebody eventually ships.
 */

const font = require('./pixelFont');

/** How many ramp steps the background gradient has. */
const RAMP = 40;

/* Fixed slots after the ramp. */
const INK = RAMP;
const SHADOW = RAMP + 1;
const ACCENT = RAMP + 2;

function hsl(h, s, l) {
  const c = (1 - Math.abs((2 * l) - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - (c / 2);

  let rgb = [0, 0, 0];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];

  return rgb.map(function (value) { return Math.round((value + m) * 255); });
}

function paletteFor(hue) {
  const palette = [];

  /* The ramp: the slide's hue, dark at one end and bright at the other. */
  for (let i = 0; i < RAMP; i += 1) {
    const t = i / (RAMP - 1);
    palette.push(hsl(hue, 0.55, 0.16 + (t * 0.46)));
  }

  palette[INK] = [255, 255, 255];
  palette[SHADOW] = [9, 12, 20];
  palette[ACCENT] = hsl((hue + 40) % 360, 0.85, 0.62);

  return palette;
}

function clampRamp(value) {
  if (value < 0) return 0;
  if (value > RAMP - 1) return RAMP - 1;
  return Math.round(value);
}

/**
 * One frame of the composition.
 *
 * `phase` runs 0..1 over the loop, and everything that moves is a function of
 * it - so the last frame leads back into the first and the loop has no seam.
 */
function frameIndices(options, phase) {
  const width = options.width;
  const height = options.height;
  const indices = new Uint8Array(width * height);

  const sweep = phase * (width + height) * 1.6;
  const pulse = 0.5 + (0.5 * Math.sin(phase * Math.PI * 2));

  const centreX = width * (0.72 + (0.03 * Math.sin(phase * Math.PI * 2)));
  const centreY = height * 0.32;
  const radius = Math.min(width, height) * (0.22 + (0.03 * pulse));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      /* The ground: a diagonal gradient, dark at the top left. */
      let value = ((x / width) * 0.45 + (y / height) * 0.55) * (RAMP - 1);

      /* A band of light crossing it, wrapped so the loop is seamless. */
      const along = (x * 0.6) + (y * 0.4);
      const distance = Math.abs(((along - sweep) % (width + height)) - 0);
      const band = Math.max(0, 1 - (distance / (width * 0.22)));
      value += band * 10;

      /* And the disc, a shade above the ground rather than a shape on it. */
      const dx = x - centreX;
      const dy = y - centreY;
      if ((dx * dx) + (dy * dy) < radius * radius) value += 6 * pulse;

      indices[(y * width) + x] = clampRamp(value);
    }
  }

  return indices;
}

/** Writes text with a one-pixel shadow, so it reads over any part of the ramp. */
function label(indices, options, text, scale, x, y) {
  const width = options.width;
  const height = options.height;

  const plot = (colour, offsetX, offsetY) => (px, py) => {
    const tx = px + offsetX;
    const ty = py + offsetY;
    if (tx < 0 || ty < 0 || tx >= width || ty >= height) return;
    indices[(ty * width) + tx] = colour;
  };

  font.draw(text, { x: x, y: y, scale: scale }, plot(SHADOW, scale, scale));
  font.draw(text, { x: x, y: y, scale: scale }, plot(INK, 0, 0));
}

/** An underline in the accent colour, the width of the text above it. */
function rule(indices, options, x, y, length, thickness) {
  for (let dy = 0; dy < thickness; dy += 1) {
    for (let dx = 0; dx < length; dx += 1) {
      const tx = x + dx;
      const ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= options.width || ty >= options.height) continue;
      indices[(ty * options.width) + tx] = ACCENT;
    }
  }
}

/**
 * The whole animation.
 *
 *   width, height   the frame size
 *   hue             0..359, the slide's own colour
 *   title, subtitle what it says, in capitals
 *   frames          how many, over one loop
 *   delay           hundredths of a second per frame
 */
function build(options) {
  const width = options.width;
  const height = options.height;
  const count = options.frames || 12;

  const titleScale = Math.max(2, Math.round(width / 150));
  const subScale = Math.max(1, Math.round(titleScale / 2));

  const title = String(options.title || '').toUpperCase();
  const subtitle = String(options.subtitle || '').toUpperCase();

  const titleWidth = font.measure(title) * titleScale;
  const subWidth = font.measure(subtitle) * subScale;

  const titleX = Math.round((width - titleWidth) / 2);
  const titleY = Math.round((height / 2) - (font.HEIGHT * titleScale));
  const ruleY = titleY + (font.HEIGHT * titleScale) + (titleScale * 2);
  const subY = ruleY + (titleScale * 3);

  const frames = [];
  for (let i = 0; i < count; i += 1) {
    const indices = frameIndices(options, i / count);

    label(indices, options, title, titleScale, titleX, titleY);
    rule(indices, options, titleX, ruleY, titleWidth, Math.max(2, titleScale));
    if (subtitle) {
      label(indices, options, subtitle, subScale, Math.round((width - subWidth) / 2), subY);
    }

    frames.push({ indices: indices, delay: options.delay || 8 });
  }

  return { palette: paletteFor(options.hue || 205), frames: frames };
}

module.exports = {
  RAMP: RAMP,
  build: build,
  paletteFor: paletteFor
};
