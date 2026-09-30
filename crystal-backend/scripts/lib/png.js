'use strict';

/**
 * A PNG WRITER, for the mock scene layers.
 *
 * An animated scene is layers of TRANSPARENT artwork - a cloud over a sky, a
 * camera module over a phone body - and transparency is the one thing the
 * other two mock formats cannot do: SVG can, but it is a document the browser
 * lays out rather than a bitmap, and a GIF's alpha is a single index that is
 * either on or off, which makes every soft edge a staircase.
 *
 * So: PNG, 8-bit RGBA, written here. It needs no dependency because the only
 * hard part is DEFLATE and Node has that built in. The rest is four chunks:
 *
 *   signature    the eight bytes that say PNG
 *   IHDR         size, bit depth, colour type
 *   IDAT         zlib of the scanlines, each led by its filter byte
 *   IEND         the end
 *
 * Every chunk carries a CRC-32 of its type and data, which is written out
 * below rather than taken from zlib: Node only exposes `zlib.crc32` from
 * version 20, and this project runs on 12.
 *
 * FILTER 0 ON EVERY ROW. PNG's filters predict a pixel from its neighbours so
 * DEFLATE has less to do; the mock scenes are flat colour and gradients, which
 * compress well regardless, and a filter chosen per row is the part of an
 * encoder that goes subtly wrong.
 */

const zlib = require('zlib');

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/* The standard CRC-32 table, built once. */
const CRC_TABLE = (function build() {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  return table;
}());

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);

  return Buffer.concat([length, body, crc]);
}

/**
 * Encodes RGBA pixels - four bytes each, row by row, top to bottom.
 */
function encode(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;      /* bit depth */
  header[9] = 6;      /* colour type 6: truecolour with alpha */
  header[10] = 0;     /* deflate */
  header[11] = 0;     /* adaptive filtering */
  header[12] = 0;     /* no interlace */

  /* Each scanline is preceded by its filter byte. */
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer || rgba, y * stride, stride).copy(raw, (y * (stride + 1)) + 1);
  }

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/**
 * A blank RGBA canvas and the few operations the mock layers need.
 *
 * Deliberately tiny: a rectangle, a disc, a soft radial blob and text. A mock
 * layer is a shape that can be seen to move, not an illustration.
 */
function canvas(width, height) {
  const rgba = new Uint8Array(width * height * 4);

  function at(x, y) {
    return ((y * width) + x) * 4;
  }

  /** Alpha-over, so overlapping shapes blend rather than punch holes. */
  function blend(x, y, colour, alpha) {
    if (x < 0 || y < 0 || x >= width || y >= height || alpha <= 0) return;

    const i = at(x, y);
    const a = Math.min(1, alpha);
    const existing = rgba[i + 3] / 255;
    const out = a + (existing * (1 - a));
    if (out <= 0) return;

    for (let c = 0; c < 3; c += 1) {
      rgba[i + c] = Math.round(((colour[c] * a) + (rgba[i + c] * existing * (1 - a))) / out);
    }
    rgba[i + 3] = Math.round(out * 255);
  }

  return {
    width: width,
    height: height,
    rgba: rgba,
    blend: blend,

    /** A filled rectangle, optionally with rounded corners. */
    rect: function rect(x, y, w, h, colour, alpha, radius) {
      const r = radius || 0;
      for (let dy = 0; dy < h; dy += 1) {
        for (let dx = 0; dx < w; dx += 1) {
          if (r) {
            /* Only the corners need checking. */
            const cx = Math.min(Math.max(dx, r), w - 1 - r);
            const cy = Math.min(Math.max(dy, r), h - 1 - r);
            const ox = dx - cx;
            const oy = dy - cy;
            if ((ox * ox) + (oy * oy) > r * r) continue;
          }
          blend(x + dx, y + dy, colour, alpha === undefined ? 1 : alpha);
        }
      }
    },

    /** A disc with a soft edge, which is what stops a mock looking aliased. */
    disc: function disc(cx, cy, radius, colour, alpha) {
      const from = Math.max(0, Math.floor(cx - radius - 1));
      const to = Math.min(width - 1, Math.ceil(cx + radius + 1));
      const top = Math.max(0, Math.floor(cy - radius - 1));
      const bottom = Math.min(height - 1, Math.ceil(cy + radius + 1));

      for (let y = top; y <= bottom; y += 1) {
        for (let x = from; x <= to; x += 1) {
          const dx = x - cx;
          const dy = y - cy;
          const distance = Math.sqrt((dx * dx) + (dy * dy));
          const edge = radius - distance;
          if (edge <= -1) continue;
          blend(x, y, colour, (alpha === undefined ? 1 : alpha) * Math.min(1, edge + 1));
        }
      }
    },

    /** A vertical gradient across the whole canvas. */
    gradient: function gradient(top, bottom) {
      for (let y = 0; y < height; y += 1) {
        const t = height > 1 ? y / (height - 1) : 0;
        const colour = [
          Math.round(top[0] + ((bottom[0] - top[0]) * t)),
          Math.round(top[1] + ((bottom[1] - top[1]) * t)),
          Math.round(top[2] + ((bottom[2] - top[2]) * t))
        ];
        for (let x = 0; x < width; x += 1) blend(x, y, colour, 1);
      }
    },

    toBuffer: function toBuffer() {
      return encode(width, height, rgba);
    }
  };
}

module.exports = {
  encode: encode,
  canvas: canvas
};
