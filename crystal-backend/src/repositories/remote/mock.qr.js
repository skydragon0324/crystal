'use strict';

const jpeg = require('jpeg-js');

/**
 * A REAL QR CODE, drawn the way the Appstore sends one: a JPEG, as hex.
 *
 * The store's licence endpoint (`/api/maininfo/getSpdMsg`) answers some
 * purchases with `device_license.qr` - a JPEG of a QR code, hex-encoded - and
 * the vendor's modal turns that hex back into bytes and draws it
 * (vendor_client ViewAppstoreLicenseQrModal: `hexToBase64(deviceLicense.qr)`
 * into `data:image/jpg`). The mock answered `qr: null` for every purchase, so
 * the branch of the page that draws a QR, saves it and offers the licence
 * file beside it had never rendered once in development.
 *
 * A PLACEHOLDER WOULD HAVE BEEN WORSE THAN NOTHING. A 1x1 pixel or a picture
 * of noise renders as a broken or meaningless code - a member (or a tester)
 * points a phone at it and nothing happens, which reads as a bug in Crystal.
 * So this encodes a genuine, scannable QR symbol: byte mode, error correction
 * level M, versions 1 to 10, with the mask chosen by the standard's penalty
 * rules. Nothing outside this file needs to know that - it returns the hex
 * string the store would have sent.
 *
 * WHY NOT A LIBRARY: there is no QR package among the API's dependencies, and
 * adding one to production for the sake of a development stand-in is the
 * wrong trade. jpeg-js IS a dependency already, so the image is a JPEG, which
 * is exactly what the store sends - the mapper and the page are exercised on
 * the real wire format rather than on something easier.
 *
 * Written from ISO/IEC 18004 and checked against an independent decoder; the
 * structure follows the well-known reference layout (function patterns, then
 * codewords in the zig-zag, then the mask) so it can be read against one.
 */

/* ------------------------------------------------------------------ */
/*  the tables - error correction level M only                         */
/* ------------------------------------------------------------------ */

/*
 * Per version: EC codewords per block, and the blocks as [count, data
 * codewords each]. Level M is the only level drawn: it survives the JPEG's
 * ringing and a phone camera at an angle, and a licence string is short
 * enough that the extra capacity of L buys nothing.
 */
const BLOCKS_M = {
  1: [10, [[1, 16]]],
  2: [16, [[1, 28]]],
  3: [26, [[1, 44]]],
  4: [18, [[2, 32]]],
  5: [24, [[2, 43]]],
  6: [16, [[4, 27]]],
  7: [18, [[4, 31]]],
  8: [22, [[2, 38], [2, 39]]],
  9: [22, [[3, 36], [2, 37]]],
  10: [26, [[4, 43], [1, 44]]]
};

/* Centres of the alignment patterns, per version (none on version 1). */
const ALIGNMENT = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50]
};

/* The two format bits that name level M. (L is 01, M 00, Q 11, H 10.) */
const LEVEL_M_BITS = 0;

/* ------------------------------------------------------------------ */
/*  Reed-Solomon over GF(256), polynomial 0x11D                        */
/* ------------------------------------------------------------------ */

function gfMultiply(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11D);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xFF;
}

/** The generator polynomial of the given degree, highest term dropped. */
function rsDivisor(degree) {
  const result = [];
  for (let i = 0; i < degree - 1; i += 1) result.push(0);
  result.push(1);

  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < result.length; j += 1) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }

  return result;
}

/** The error correction codewords for one block of data codewords. */
function rsRemainder(data, divisor) {
  const result = divisor.map(function () { return 0; });

  data.forEach(function (byte) {
    const factor = byte ^ result.shift();
    result.push(0);
    divisor.forEach(function (coefficient, i) {
      result[i] ^= gfMultiply(coefficient, factor);
    });
  });

  return result;
}

/* ------------------------------------------------------------------ */
/*  the codewords                                                      */
/* ------------------------------------------------------------------ */

function capacityOf(version) {
  const entry = BLOCKS_M[version];
  return entry[1].reduce(function (sum, group) { return sum + group[0] * group[1]; }, 0);
}

/** Byte mode: 4 bits of mode, the count, the bytes - then terminator and padding. */
function dataCodewords(bytes, version) {
  const bits = [];
  const push = function (value, length) {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
  };

  push(0x4, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  bytes.forEach(function (byte) { push(byte, 8); });

  const capacityBits = capacityOf(version) * 8;
  push(0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8) bits.push(0);

  const words = [];
  for (let i = 0; i < bits.length; i += 8) {
    let word = 0;
    for (let j = 0; j < 8; j += 1) word = (word << 1) | bits[i + j];
    words.push(word);
  }

  /* 0xEC, 0x11, 0xEC, ... until the symbol is full. */
  for (let pad = 0xEC; words.length < capacityOf(version); pad ^= 0xEC ^ 0x11) words.push(pad);

  return words;
}

/** Split into blocks, add each block's EC, and interleave both halves. */
function finalCodewords(words, version) {
  const entry = BLOCKS_M[version];
  const divisor = rsDivisor(entry[0]);

  const blocks = [];
  let at = 0;
  entry[1].forEach(function (group) {
    for (let n = 0; n < group[0]; n += 1) {
      const data = words.slice(at, at + group[1]);
      at += group[1];
      blocks.push({ data: data, ec: rsRemainder(data, divisor) });
    }
  });

  const out = [];
  const longest = Math.max.apply(null, blocks.map(function (b) { return b.data.length; }));
  for (let i = 0; i < longest; i += 1) {
    blocks.forEach(function (b) { if (i < b.data.length) out.push(b.data[i]); });
  }
  for (let i = 0; i < entry[0]; i += 1) {
    blocks.forEach(function (b) { out.push(b.ec[i]); });
  }

  return out;
}

/* ------------------------------------------------------------------ */
/*  the matrix                                                         */
/* ------------------------------------------------------------------ */

function grid(size, fill) {
  const rows = [];
  for (let y = 0; y < size; y += 1) {
    const row = [];
    for (let x = 0; x < size; x += 1) row.push(fill);
    rows.push(row);
  }
  return rows;
}

function QrSymbol(version) {
  this.version = version;
  this.size = version * 4 + 17;
  this.modules = grid(this.size, false);
  this.reserved = grid(this.size, false);
}

/* `x` is the column and `y` the row, throughout. */
QrSymbol.prototype.fixed = function (x, y, dark) {
  this.modules[y][x] = dark;
  this.reserved[y][x] = true;
};

QrSymbol.prototype.drawFunctionPatterns = function () {
  const size = this.size;

  for (let i = 0; i < size; i += 1) {
    this.fixed(6, i, i % 2 === 0);
    this.fixed(i, 6, i % 2 === 0);
  }

  this.drawFinder(3, 3);
  this.drawFinder(size - 4, 3);
  this.drawFinder(3, size - 4);

  const centres = ALIGNMENT[this.version];
  const last = centres.length - 1;
  for (let i = 0; i < centres.length; i += 1) {
    for (let j = 0; j < centres.length; j += 1) {
      /* The three corners the finders already occupy. */
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      this.drawAlignment(centres[i], centres[j]);
    }
  }

  /* Reserve the format areas now; the real bits go in once the mask is known. */
  this.drawFormat(0);
  this.drawVersion();
};

QrSymbol.prototype.drawFinder = function (cx, cy) {
  for (let dy = -4; dy <= 4; dy += 1) {
    for (let dx = -4; dx <= 4; dx += 1) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= this.size || y >= this.size) continue;
      const ring = Math.max(Math.abs(dx), Math.abs(dy));
      /* Dark core, light ring, dark ring, light separator. */
      this.fixed(x, y, ring !== 2 && ring !== 4);
    }
  }
};

QrSymbol.prototype.drawAlignment = function (cx, cy) {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      this.fixed(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
};

/** Fifteen bits: the level and the mask, BCH-protected, XORed with 0x5412. */
QrSymbol.prototype.drawFormat = function (mask) {
  const data = (LEVEL_M_BITS << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const bit = function (i) { return ((bits >>> i) & 1) === 1; };
  const size = this.size;

  /* Around the top-left finder. */
  for (let i = 0; i <= 5; i += 1) this.fixed(8, i, bit(i));
  this.fixed(8, 7, bit(6));
  this.fixed(8, 8, bit(7));
  this.fixed(7, 8, bit(8));
  for (let i = 9; i < 15; i += 1) this.fixed(14 - i, 8, bit(i));

  /* And again, split between the other two. */
  for (let i = 0; i < 8; i += 1) this.fixed(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i += 1) this.fixed(8, size - 15 + i, bit(i));

  /* The module that is always dark. */
  this.fixed(8, size - 8, true);
};

/** Versions 7 and up name themselves in two 6x3 blocks. */
QrSymbol.prototype.drawVersion = function () {
  if (this.version < 7) return;

  let rem = this.version;
  for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
  const bits = (this.version << 12) | rem;

  for (let i = 0; i < 18; i += 1) {
    const dark = ((bits >>> i) & 1) === 1;
    const a = this.size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    this.fixed(a, b, dark);
    this.fixed(b, a, dark);
  }
};

/** The codewords, two columns at a time, up and down, right to left. */
QrSymbol.prototype.drawCodewords = function (codewords) {
  const total = codewords.length * 8;
  let i = 0;

  for (let right = this.size - 1; right >= 1; right -= 2) {
    /* Column 6 is the vertical timing pattern and is skipped whole. */
    if (right === 6) right = 5;

    for (let vert = 0; vert < this.size; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? this.size - 1 - vert : vert;

        if (!this.reserved[y][x] && i < total) {
          this.modules[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
          i += 1;
        }
        /* Anything left over is a remainder bit, and stays light. */
      }
    }
  }
};

const MASKS = [
  function (x, y) { return (x + y) % 2 === 0; },
  function (x, y) { return y % 2 === 0; },
  function (x) { return x % 3 === 0; },
  function (x, y) { return (x + y) % 3 === 0; },
  function (x, y) { return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; },
  function (x, y) { return ((x * y) % 2) + ((x * y) % 3) === 0; },
  function (x, y) { return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; },
  function (x, y) { return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; }
];

/** XOR, so applying the same mask twice undoes it. */
QrSymbol.prototype.applyMask = function (mask) {
  const test = MASKS[mask];
  for (let y = 0; y < this.size; y += 1) {
    for (let x = 0; x < this.size; x += 1) {
      if (!this.reserved[y][x] && test(x, y)) this.modules[y][x] = !this.modules[y][x];
    }
  }
};

/**
 * The standard's four penalty rules. Any mask decodes; the lowest penalty is
 * simply the one a camera finds easiest - fewest long runs, fewest solid
 * blocks, nothing that looks like a fourth finder, and near half dark.
 */
QrSymbol.prototype.penalty = function () {
  const size = this.size;
  const m = this.modules;
  let score = 0;

  const lines = function (read) {
    for (let a = 0; a < size; a += 1) {
      let run = 1;
      for (let b = 1; b <= size; b += 1) {
        if (b < size && read(a, b) === read(a, b - 1)) {
          run += 1;
        } else {
          if (run >= 5) score += 3 + (run - 5);
          run = 1;
        }
      }

      /* 1:1:3:1:1 with four light either side - a finder lookalike. */
      for (let b = 0; b + 10 < size; b += 1) {
        let pattern = '';
        for (let k = 0; k < 11; k += 1) pattern += read(a, b + k) ? '1' : '0';
        if (pattern === '10111010000' || pattern === '00001011101') score += 40;
      }
    }
  };

  lines(function (row, col) { return m[row][col]; });
  lines(function (col, row) { return m[row][col]; });

  for (let y = 0; y + 1 < size; y += 1) {
    for (let x = 0; x + 1 < size; x += 1) {
      const c = m[y][x];
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3;
    }
  }

  let dark = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) if (m[y][x]) dark += 1;
  }
  score += Math.floor(Math.abs((dark * 20) - (size * size * 10)) / (size * size)) * 10;

  return score;
};

/**
 * The module matrix for `text`: an array of rows of booleans, dark = true.
 *
 * Throws past version 10 (213 bytes at level M) - a licence payload is a few
 * dozen characters, and a mock that silently truncated one would draw a code
 * that scans to the wrong key.
 */
function encode(text) {
  const bytes = Array.prototype.slice.call(Buffer.from(String(text), 'utf8'));

  let version = 1;
  const fits = function (v) {
    const header = 4 + (v < 10 ? 8 : 16);
    return header + bytes.length * 8 <= capacityOf(v) * 8;
  };
  while (version <= 10 && !fits(version)) version += 1;
  if (version > 10) throw new Error('mock QR payload is too long: ' + bytes.length + ' bytes');

  const symbol = new QrSymbol(version);
  symbol.drawFunctionPatterns();
  symbol.drawCodewords(finalCodewords(dataCodewords(bytes, version), version));

  let best = 0;
  let lowest = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    symbol.applyMask(mask);
    symbol.drawFormat(mask);
    const score = symbol.penalty();
    if (score < lowest) {
      lowest = score;
      best = mask;
    }
    symbol.applyMask(mask);
  }

  symbol.applyMask(best);
  symbol.drawFormat(best);

  return symbol.modules;
}

/* ------------------------------------------------------------------ */
/*  the picture                                                        */
/* ------------------------------------------------------------------ */

/** Pixels per module and the quiet zone the standard asks for, in modules. */
const SCALE = 8;
const QUIET = 4;

/**
 * The QR for `text` as the store sends it: JPEG bytes, as a hex string.
 *
 * Black on white with a four-module quiet zone, eight pixels a module - a
 * version 4 code comes out at 328px, just over the 300px the vendor's modal
 * draws it at, so it is scaled down rather than up. Quality 92 keeps the
 * edges crisp; a QR is the worst possible subject for a JPEG, and the block
 * artefacts at the default quality are visible even if a phone forgives them.
 */
function qrJpegHex(text) {
  const modules = encode(text);
  const count = modules.length + QUIET * 2;
  const side = count * SCALE;
  const data = Buffer.alloc(side * side * 4);

  for (let py = 0; py < side; py += 1) {
    const my = Math.floor(py / SCALE) - QUIET;
    for (let px = 0; px < side; px += 1) {
      const mx = Math.floor(px / SCALE) - QUIET;
      const dark = my >= 0 && mx >= 0 && my < modules.length && mx < modules.length && modules[my][mx];
      const at = (py * side + px) * 4;
      const tone = dark ? 0 : 255;
      data[at] = tone;
      data[at + 1] = tone;
      data[at + 2] = tone;
      data[at + 3] = 255;
    }
  }

  return jpeg.encode({ data: data, width: side, height: side }, 92).data.toString('hex');
}

module.exports = {
  encode: encode,
  qrJpegHex: qrJpegHex,
  /* For the check script's known-answer test of the error correction. */
  rsDivisor: rsDivisor,
  rsRemainder: rsRemainder
};
