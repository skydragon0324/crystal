# The mock films

Written for: whoever maintains the seed data.

Three short H.264 clips live here, and they are the only binary files the seed
data needs. `scripts/generate-mock-images.js` copies them into `/uploads` when
a seeded advert asks for one:

| file | used by | size |
|---|---|---|
| `hero-film.mp4` | the homepage run, desktop crop | 960×380 |
| `hero-film-mobile.mp4` | the homepage run, phone crop | 540×676 |
| `popup-film.mp4` | the popup campaign | 720×900 |

## Why they are committed rather than generated

Everything else the mock generator produces, it draws: the stills are SVG, and
the animated GIFs are encoded in `scripts/lib/gif.js` — a palette, some
frames and LZW, all of which fit in a file you can read.

Video is different. Producing H.264 means an encoder, and the project does not
have one: no ffmpeg, no native module, nothing in `node_modules`. The options
were to add a WebAssembly encoder as a dependency of the whole backend so that
two fixtures could be regenerated, or to encode them once and keep the result.
They are under 100 KB each. The result is kept.

## How to remake them

They were made outside this repository, from the same composition the GIFs
use (`scripts/lib/mockArt.js`), so a seeded film and a seeded GIF look like
relatives:

```bash
mkdir /tmp/mock-video && cd /tmp/mock-video
npm install --no-save h264-mp4-encoder
node make-mock-videos.js        # the script is reproduced below
```

```js
const fs = require('fs');
const path = require('path');
const HME = require('h264-mp4-encoder');

const REPO = '/path/to/crystal-backend';
const art = require(REPO + '/scripts/lib/mockArt');
const OUT = path.join(REPO, 'scripts', 'mock');

const FILMS = [
  { name: 'hero-film.mp4', width: 960, height: 380, hue: 205, title: 'CRYSTAL', subtitle: 'MOCK FILM - HERO' },
  { name: 'hero-film-mobile.mp4', width: 540, height: 676, hue: 205, title: 'CRYSTAL', subtitle: 'MOCK FILM' },
  { name: 'popup-film.mp4', width: 720, height: 900, hue: 28, title: 'SALE', subtitle: 'MOCK FILM - POPUP' }
];

const FPS = 12;
const SECONDS = 4;

function rgbaOf(indices, palette, width, height) {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < indices.length; i += 1) {
    const colour = palette[indices[i]] || [0, 0, 0];
    rgba[i * 4] = colour[0];
    rgba[i * 4 + 1] = colour[1];
    rgba[i * 4 + 2] = colour[2];
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

(async () => {
  for (const film of FILMS) {
    const built = art.build({ ...film, frames: SECONDS * FPS });
    const encoder = await HME.createH264MP4Encoder();
    encoder.width = film.width;
    encoder.height = film.height;
    encoder.frameRate = FPS;
    encoder.quantizationParameter = 30;
    encoder.initialize();
    built.frames.forEach((frame) => encoder.addFrameRgba(rgbaOf(frame.indices, built.palette, film.width, film.height)));
    encoder.finalize();
    fs.writeFileSync(path.join(OUT, film.name), Buffer.from(encoder.FS.readFile(encoder.outputFilename)));
    encoder.delete();
  }
})();
```

Frame sizes must have even sides — x264 refuses odd ones.

## What they are not

They are not signed, and that is not an oversight: the server does not sign
video at all (`src/middleware/upload.js` explains why), so the storefront
plays them from their ordinary address. A GIF, being an image, **is** signed
and verified like every other picture on the site.

They are also deliberately ugly — a gradient, a sweep and a label in a 5×7
bitmap font. Mock artwork that looks like a real advert is mock artwork that
eventually ships to somebody.
