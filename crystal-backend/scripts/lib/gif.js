'use strict';

/**
 * AN ANIMATED GIF, WRITTEN BY HAND.
 *
 * The mock generator needs a moving picture that a browser will play, and an
 * animated GIF is the only moving format that can be produced here without
 * an encoder: it is a palette, a handful of frames and one compression
 * scheme, all of which fit in this file. A video cannot be - see
 * scripts/mock/README.md for what is done about that instead.
 *
 * GIF89a, in the order the bytes go out:
 *
 *   'GIF89a'                     the header
 *   logical screen descriptor    size, and that a global palette follows
 *   global colour table          256 RGB triples
 *   NETSCAPE2.0 application ext  the loop count - without it, it plays once
 *   per frame:
 *     graphic control extension  the delay, in hundredths of a second
 *     image descriptor           where this frame sits
 *     LZW data                   the pixels
 *   0x3B                         trailer
 *
 * THE COMPRESSION IS THE ONLY HARD PART. GIF uses LZW with a code size that
 * GROWS: it starts one bit wider than the palette needs, and each time the
 * dictionary fills, every subsequent code is a bit wider - until 12 bits, at
 * which point the encoder must emit a CLEAR code and start again. Codes are
 * packed least-significant-bit first into a stream that is then cut into
 * blocks of at most 255 bytes, each preceded by its length.
 *
 * Getting any of that wrong produces a file that some decoders open and
 * others refuse, which is worse than one that fails everywhere, so it is
 * written out plainly below rather than cleverly.
 */

/** Little-endian 16 bit, which is what every length field in a GIF is. */
function short(value) {
  return [value & 0xff, (value >> 8) & 0xff];
}

/**
 * The LZW coder. `indices` is one palette index per pixel, row by row.
 */
function compress(indices, colourBits) {
  const minimum = Math.max(2, colourBits);
  const clearCode = 1 << minimum;
  const endCode = clearCode + 1;

  let codeSize = minimum + 1;
  let next = endCode + 1;
  let dictionary = new Map();

  const out = [];
  let bits = 0;
  let held = 0;

  function emit(code) {
    held |= code << bits;
    bits += codeSize;
    while (bits >= 8) {
      out.push(held & 0xff);
      held >>= 8;
      bits -= 8;
    }
  }

  function reset() {
    dictionary = new Map();
    codeSize = minimum + 1;
    next = endCode + 1;
  }

  emit(clearCode);
  reset();

  let prefix = indices[0];

  for (let i = 1; i < indices.length; i += 1) {
    const pixel = indices[i];
    const key = (prefix << 8) | pixel;

    if (dictionary.has(key)) {
      prefix = dictionary.get(key);
      continue;
    }

    emit(prefix);

    if (next < 4096) {
      dictionary.set(key, next);
      /* The code size grows the moment the dictionary outgrows it. */
      if (next === (1 << codeSize) && codeSize < 12) codeSize += 1;
      next += 1;
    } else {
      emit(clearCode);
      reset();
    }

    prefix = pixel;
  }

  emit(prefix);
  emit(endCode);

  /* Whatever is left in the accumulator is a final partial byte. */
  if (bits > 0) out.push(held & 0xff);

  /* The stream goes out in blocks of at most 255, each led by its length. */
  const blocked = [minimum];
  for (let at = 0; at < out.length; at += 255) {
    const chunk = out.slice(at, at + 255);
    blocked.push(chunk.length);
    Array.prototype.push.apply(blocked, chunk);
  }
  blocked.push(0);

  return blocked;
}

/**
 * Builds the file.
 *
 *   palette   up to 256 [r, g, b]
 *   frames    { indices: Uint8Array | number[], delay: hundredths }
 */
function encode(options) {
  const width = options.width;
  const height = options.height;
  const palette = options.palette;
  const frames = options.frames;

  /* A GIF's palette is always a power of two, padded with black. */
  let colourBits = 1;
  while ((1 << colourBits) < palette.length) colourBits += 1;
  const slots = 1 << colourBits;

  const bytes = [];
  Array.prototype.push.apply(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);   /* GIF89a */

  Array.prototype.push.apply(bytes, short(width));
  Array.prototype.push.apply(bytes, short(height));
  /* Global table present, 8 bits of colour resolution, its size. */
  bytes.push(0xf0 | (colourBits - 1));
  bytes.push(0);      /* background colour index */
  bytes.push(0);      /* pixel aspect ratio: none given */

  for (let i = 0; i < slots; i += 1) {
    const colour = palette[i] || [0, 0, 0];
    bytes.push(colour[0] & 0xff, colour[1] & 0xff, colour[2] & 0xff);
  }

  /* NETSCAPE2.0: the extension that makes it loop forever. */
  Array.prototype.push.apply(bytes, [0x21, 0xff, 0x0b]);
  Array.prototype.push.apply(bytes, Array.prototype.map.call('NETSCAPE2.0', function (c) {
    return c.charCodeAt(0);
  }));
  Array.prototype.push.apply(bytes, [0x03, 0x01, 0x00, 0x00, 0x00]);

  frames.forEach(function (frame) {
    /* Graphic control: no transparency, replace the last frame, this delay. */
    Array.prototype.push.apply(bytes, [0x21, 0xf9, 0x04, 0x04]);
    Array.prototype.push.apply(bytes, short(frame.delay || 8));
    Array.prototype.push.apply(bytes, [0x00, 0x00]);

    bytes.push(0x2c);                                   /* image descriptor */
    Array.prototype.push.apply(bytes, short(0));
    Array.prototype.push.apply(bytes, short(0));
    Array.prototype.push.apply(bytes, short(width));
    Array.prototype.push.apply(bytes, short(height));
    bytes.push(0x00);                                   /* no local table, not interlaced */

    Array.prototype.push.apply(bytes, compress(frame.indices, colourBits));
  });

  bytes.push(0x3b);                                     /* trailer */

  return Buffer.from(bytes);
}

module.exports = { encode: encode };
