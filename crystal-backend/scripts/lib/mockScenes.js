'use strict';

/**
 * THE MOCK SCENES, drawn as transparent layers.
 *
 * The specification's own two examples, made real:
 *
 *   a landing scene   a mountain sky, a cloud that drifts in, an aeroplane
 *                     that crosses, a product that grows, a line of copy
 *   a phone scene     a studio ground, a phone body that rises, a camera
 *                     module that fades in, a screen that zooms, three
 *                     feature marks that arrive one after another
 *
 * Each layer is a separate PNG with real alpha, because that is the whole
 * point of a scene: if the layers were opaque rectangles, a cloud sliding
 * over a mountain would be a rectangle sliding over a mountain, and none of
 * the stacking or the timing would be tested by looking at it.
 *
 * They are drawn, not designed. A mock that looked like real artwork is a
 * mock somebody eventually ships - see scripts/mock/README.md for the same
 * argument about the films.
 *
 * THE COORDINATES HERE ARE THE SCENE'S, so the JSON this file produces can be
 * seeded as-is: a layer's x, y, width and height are in the scene's own frame
 * (1920x760 for a hero), and the storefront scales the frame to whatever
 * width it has. See crystal-web components/ImageAnimator.
 */

const png = require('./png');
const font = require('./pixelFont');

/** Draws a label into a canvas, in the 5x7 font, with a soft shadow. */
function label(canvas, text, options) {
  const scale = options.scale || 4;
  const colour = options.colour || [255, 255, 255];
  const x = options.x || 0;
  const y = options.y || 0;

  font.draw(text.toUpperCase(), { x: x + scale, y: y + scale, scale: scale }, function (px, py) {
    canvas.blend(px, py, [8, 12, 20], 0.45);
  });
  font.draw(text.toUpperCase(), { x: x, y: y, scale: scale }, function (px, py) {
    canvas.blend(px, py, colour, 1);
  });
}

/* ------------------------------------------------------------------ */
/*  the layers                                                         */
/* ------------------------------------------------------------------ */

/** A sky with a ridge of mountains along the bottom - the landing ground. */
function mountainSky(width, height) {
  const canvas = png.canvas(width, height);
  canvas.gradient([26, 58, 120], [132, 186, 226]);

  /* A low sun, and then the ridges, each paler than the one behind it. */
  canvas.disc(width * 0.78, height * 0.30, Math.min(width, height) * 0.13, [255, 236, 190], 0.85);

  const ridges = [
    { base: 0.72, peak: 0.34, colour: [38, 54, 78] },
    { base: 0.82, peak: 0.48, colour: [52, 72, 98] },
    { base: 0.92, peak: 0.62, colour: [70, 94, 120] }
  ];

  ridges.forEach(function (ridge, index) {
    const baseline = height * ridge.base;
    const peak = height * ridge.peak;
    const period = width / (2 + index);
    const offset = index * width * 0.17;

    for (let x = 0; x < width; x += 1) {
      /* Two sines make a ridge that does not read as one repeated hill. */
      const t = (x + offset) / period;
      const ridgeline = baseline
        - ((Math.sin(t * Math.PI * 2) * 0.5) + (Math.sin(t * Math.PI * 5.3) * 0.18) + 0.68)
        * (baseline - peak);

      for (let y = Math.max(0, Math.round(ridgeline)); y < height; y += 1) {
        canvas.blend(x, y, ridge.colour, 1);
      }
    }
  });

  return canvas.toBuffer();
}

/** A cloud: overlapping soft discs on transparency, and nothing else. */
function cloud(width, height) {
  const canvas = png.canvas(width, height);
  const puffs = [
    { x: 0.30, y: 0.62, r: 0.26 },
    { x: 0.46, y: 0.45, r: 0.33 },
    { x: 0.63, y: 0.58, r: 0.27 },
    { x: 0.78, y: 0.66, r: 0.20 },
    { x: 0.18, y: 0.72, r: 0.18 }
  ];

  puffs.forEach(function (puff) {
    canvas.disc(width * puff.x, height * puff.y, Math.min(width, height) * puff.r, [255, 255, 255], 0.92);
  });

  return canvas.toBuffer();
}

/** An aeroplane, from three rectangles and a nose. */
function aeroplane(width, height) {
  const canvas = png.canvas(width, height);
  const body = [236, 242, 250];

  canvas.rect(Math.round(width * 0.12), Math.round(height * 0.42), Math.round(width * 0.66), Math.round(height * 0.16), body, 1, Math.round(height * 0.07));
  canvas.disc(width * 0.80, height * 0.50, height * 0.08, body, 1);
  /* Wing and tail, swept back the way a wing is. */
  canvas.rect(Math.round(width * 0.34), Math.round(height * 0.52), Math.round(width * 0.24), Math.round(height * 0.30), [204, 216, 232], 1, 6);
  canvas.rect(Math.round(width * 0.14), Math.round(height * 0.18), Math.round(width * 0.12), Math.round(height * 0.26), [204, 216, 232], 1, 6);
  canvas.rect(Math.round(width * 0.30), Math.round(height * 0.46), Math.round(width * 0.30), Math.round(height * 0.04), [120, 170, 220], 1, 2);

  return canvas.toBuffer();
}

/** A handset: a rounded body, a screen, and a camera plate. */
function phoneBody(width, height, options) {
  const canvas = png.canvas(width, height);
  const shell = (options && options.shell) || [26, 32, 46];

  const radius = Math.round(width * 0.14);
  canvas.rect(0, 0, width, height, shell, 1, radius);
  /* A lit edge down one side, which is what makes a flat shape read as glass. */
  canvas.rect(Math.round(width * 0.04), Math.round(height * 0.03), Math.round(width * 0.04), Math.round(height * 0.94), [120, 170, 220], 0.35, 6);
  canvas.rect(
    Math.round(width * 0.08), Math.round(height * 0.05),
    Math.round(width * 0.84), Math.round(height * 0.90),
    [12, 16, 26], 1, Math.round(radius * 0.7)
  );

  return canvas.toBuffer();
}

/** What is on the screen: a gradient plate with a couple of rows on it. */
function screenContent(width, height) {
  const canvas = png.canvas(width, height);
  canvas.gradient([14, 118, 190], [96, 54, 168]);

  canvas.rect(Math.round(width * 0.12), Math.round(height * 0.16), Math.round(width * 0.52), Math.round(height * 0.05), [255, 255, 255], 0.85, 4);
  canvas.rect(Math.round(width * 0.12), Math.round(height * 0.26), Math.round(width * 0.34), Math.round(height * 0.04), [255, 255, 255], 0.55, 4);

  for (let i = 0; i < 3; i += 1) {
    canvas.rect(
      Math.round(width * 0.12), Math.round(height * (0.42 + (i * 0.14))),
      Math.round(width * 0.76), Math.round(height * 0.09),
      [255, 255, 255], 0.16, 8
    );
  }

  return canvas.toBuffer();
}

/** The camera island: a plate with two lenses and a flash. */
function cameraModule(width, height) {
  const canvas = png.canvas(width, height);

  canvas.rect(0, 0, width, height, [38, 44, 60], 1, Math.round(width * 0.22));
  canvas.disc(width * 0.34, height * 0.32, Math.min(width, height) * 0.19, [12, 14, 20], 1);
  canvas.disc(width * 0.34, height * 0.32, Math.min(width, height) * 0.11, [58, 132, 200], 0.9);
  canvas.disc(width * 0.68, height * 0.68, Math.min(width, height) * 0.17, [12, 14, 20], 1);
  canvas.disc(width * 0.68, height * 0.68, Math.min(width, height) * 0.10, [58, 132, 200], 0.9);
  canvas.disc(width * 0.72, height * 0.26, Math.min(width, height) * 0.06, [255, 232, 170], 0.95);

  return canvas.toBuffer();
}

/** One feature mark: a rounded tile with a letter on it. */
function featureIcon(width, height, letter, hue) {
  const canvas = png.canvas(width, height);
  canvas.rect(0, 0, width, height, hue || [14, 165, 233], 0.92, Math.round(width * 0.28));

  const scale = Math.max(2, Math.round(height / 12));
  const textWidth = font.measure(letter) * scale;
  label(canvas, letter, {
    scale: scale,
    x: Math.round((width - textWidth) / 2),
    y: Math.round((height - (font.HEIGHT * scale)) / 2)
  });

  return canvas.toBuffer();
}

/** A line of copy, drawn into its own transparent layer. */
function textPlate(width, height, text, sub) {
  const canvas = png.canvas(width, height);

  const scale = Math.max(3, Math.round(height / 22));
  label(canvas, text, { scale: scale, x: 0, y: 0 });

  if (sub) {
    const small = Math.max(2, Math.round(scale / 2));
    label(canvas, sub, {
      scale: small,
      x: 0,
      y: (font.HEIGHT * scale) + (scale * 3),
      colour: [186, 214, 240]
    });
  }

  return canvas.toBuffer();
}

/** A studio ground for the phone scene: a dark room with a pool of light. */
function studioGround(width, height) {
  const canvas = png.canvas(width, height);
  canvas.gradient([12, 16, 26], [28, 34, 52]);
  canvas.disc(width * 0.5, height * 0.62, Math.min(width, height) * 0.62, [60, 110, 180], 0.20);
  canvas.disc(width * 0.5, height * 0.58, Math.min(width, height) * 0.34, [90, 150, 220], 0.16);
  return canvas.toBuffer();
}

/* ------------------------------------------------------------------ */
/*  the scenes                                                         */
/* ------------------------------------------------------------------ */

/*
 * Each entry names the files it needs and the scene JSON that points at them.
 * The generator writes the files; the seed stores the JSON.
 */
const FOLDER = '/uploads/showcase/';

function landingScene() {
  const files = {
    'scene-landing-sky.png': function () { return mountainSky(1920, 760); },
    'scene-landing-cloud.png': function () { return cloud(760, 320); },
    'scene-landing-plane.png': function () { return aeroplane(420, 180); },
    'scene-landing-product.png': function () { return phoneBody(300, 600, { shell: [22, 28, 42] }); },
    'scene-landing-text.png': function () { return textPlate(900, 240, 'crystal c9', 'mock scene - landing'); }
  };

  const scene = {
    sceneId: 'landing-001',
    width: 1920,
    height: 760,
    duration: 6000,
    background: {
      src: FOLDER + 'scene-landing-sky.png',
      alt: 'mountains at dawn',
      animation: { name: 'zoom-out', duration: 6000, easing: 'ease-out' }
    },
    layers: [
      {
        id: 'cloud',
        src: FOLDER + 'scene-landing-cloud.png',
        x: 120, y: 90, width: 760, height: 320, z: 1,
        animation: { name: 'slide-left', delay: 200, duration: 1800, easing: 'ease-out' }
      },
      {
        id: 'plane',
        src: FOLDER + 'scene-landing-plane.png',
        x: 1180, y: 180, width: 420, height: 180, z: 2,
        animation: { name: 'slide-right', delay: 600, duration: 1600, easing: 'ease-out' }
      },
      {
        id: 'product',
        src: FOLDER + 'scene-landing-product.png',
        x: 1340, y: 150, width: 300, height: 600, z: 3,
        animation: { name: 'zoom-in', delay: 1000, duration: 1200, easing: 'ease-out' }
      },
      {
        id: 'text',
        src: FOLDER + 'scene-landing-text.png',
        x: 170, y: 420, width: 900, height: 240, z: 4,
        animation: { name: 'fade-in', delay: 1600, duration: 1200, easing: 'ease-out' }
      }
    ]
  };

  return { files: files, scene: scene };
}

function phoneScene() {
  const files = {
    'scene-phone-ground.png': function () { return studioGround(1920, 760); },
    'scene-phone-body.png': function () { return phoneBody(360, 720); },
    'scene-phone-screen.png': function () { return screenContent(300, 640); },
    'scene-phone-camera.png': function () { return cameraModule(220, 220); },
    'scene-phone-text.png': function () { return textPlate(1000, 240, 'c9 pro', 'mock scene - smartphone'); },
    'scene-phone-icon-1.png': function () { return featureIcon(120, 120, 'a', [14, 165, 233]); },
    'scene-phone-icon-2.png': function () { return featureIcon(120, 120, 'b', [168, 85, 247]); },
    'scene-phone-icon-3.png': function () { return featureIcon(120, 120, 'c', [34, 197, 94]); }
  };

  const scene = {
    sceneId: 'phone-001',
    width: 1920,
    height: 760,
    duration: 6500,
    /* The marks arrive one after another without four hand-counted delays. */
    stagger: 0,
    background: {
      src: FOLDER + 'scene-phone-ground.png',
      alt: 'a studio',
      animation: { name: 'zoom-out', duration: 6500, easing: 'ease-out' }
    },
    layers: [
      {
        id: 'phone',
        src: FOLDER + 'scene-phone-body.png',
        x: 760, y: 40, width: 360, height: 720, z: 2,
        animation: { name: 'slide-bottom', delay: 300, duration: 1400, easing: 'ease-out' }
      },
      {
        id: 'screen',
        src: FOLDER + 'scene-phone-screen.png',
        x: 790, y: 76, width: 300, height: 640, z: 3,
        animation: { name: 'zoom-in', delay: 1200, duration: 1000, easing: 'ease-out' }
      },
      {
        id: 'camera',
        src: FOLDER + 'scene-phone-camera.png',
        x: 1080, y: 120, width: 220, height: 220, z: 4,
        animation: { name: 'fade-in', delay: 1800, duration: 900, easing: 'ease-out' }
      },
      {
        id: 'text',
        src: FOLDER + 'scene-phone-text.png',
        x: 150, y: 250, width: 1000, height: 240, z: 1,
        animation: { name: 'slide-left', delay: 2200, duration: 1000, easing: 'ease-out' }
      },
      {
        id: 'icon-1',
        src: FOLDER + 'scene-phone-icon-1.png',
        x: 180, y: 540, width: 120, height: 120, z: 5,
        animation: { name: 'bounce-in', delay: 2800, duration: 700, easing: 'ease-out' }
      },
      {
        id: 'icon-2',
        src: FOLDER + 'scene-phone-icon-2.png',
        x: 330, y: 540, width: 120, height: 120, z: 5,
        animation: { name: 'bounce-in', delay: 3100, duration: 700, easing: 'ease-out' }
      },
      {
        id: 'icon-3',
        src: FOLDER + 'scene-phone-icon-3.png',
        x: 480, y: 540, width: 120, height: 120, z: 5,
        animation: { name: 'bounce-in', delay: 3400, duration: 700, easing: 'ease-out' }
      }
    ]
  };

  return { files: files, scene: scene };
}

/**
 * A product's own scene, for the detail page: the handset, floating, with its
 * camera and a mark. Squarer than a hero, because a product shot is.
 */
function productScene() {
  const files = {
    'scene-product-ground.png': function () { return studioGround(1200, 1200); },
    'scene-product-body.png': function () { return phoneBody(420, 840); },
    'scene-product-screen.png': function () { return screenContent(350, 750); },
    'scene-product-camera.png': function () { return cameraModule(200, 200); }
  };

  const scene = {
    sceneId: 'product-001',
    width: 1200,
    height: 1200,
    duration: 5000,
    background: {
      src: FOLDER + 'scene-product-ground.png',
      alt: 'a studio',
      animation: { name: 'zoom-out', duration: 5000 }
    },
    layers: [
      {
        id: 'phone',
        src: FOLDER + 'scene-product-body.png',
        x: 390, y: 180, width: 420, height: 840, z: 2,
        /* Continuous: it keeps moving after the scene has settled. */
        animation: { name: 'floating', duration: 2600, easing: 'ease-in-out' }
      },
      {
        id: 'screen',
        src: FOLDER + 'scene-product-screen.png',
        x: 425, y: 222, width: 350, height: 750, z: 3,
        animation: { name: 'fade-in', delay: 400, duration: 900 }
      },
      {
        id: 'camera',
        src: FOLDER + 'scene-product-camera.png',
        x: 760, y: 250, width: 200, height: 200, z: 4,
        animation: { name: 'rotate-in', delay: 900, duration: 900 }
      }
    ]
  };

  return { files: files, scene: scene };
}

module.exports = {
  landingScene: landingScene,
  phoneScene: phoneScene,
  productScene: productScene
};
