/**
 * THE PRESETS: a scene's shape without its pictures (spec section 5).
 *
 * A preset is the part of a scene that is a DESIGN DECISION - which layer
 * moves how, in what order, over how long - separated from the part that is
 * content, which is the artwork itself. The console offers these when a new
 * scene is started, so an operator picks "a product showcase" and then
 * uploads four pictures, rather than filling in twenty-eight fields and
 * discovering what a stagger looks like by trying it.
 *
 * They are files rather than rows deliberately. A preset is not data an
 * operator owns; it is this site's house style for how an advert moves, and
 * it belongs with the component that draws it - the same argument that keeps
 * the animation library itself out of the database.
 *
 * WHAT A PRESET IS NOT: it is not a scene. Its layers have no `src`, so it
 * cannot be stored on an advert as it stands. `applyPreset` fills one in with
 * pictures, and what comes out is an ordinary scene that the console will
 * then validate like any other.
 */

/** The hero shape the spec's landing example describes. */
const heroProduct = {
  name: 'hero-product',
  label: 'Product hero',
  hint: 'A background that settles, a product that grows into frame, copy after it',
  width: 1920,
  height: 760,
  duration: 6000,
  background: { animation: { name: 'zoom-out', duration: 6000 } },
  layers: [
    {
      id: 'product',
      x: 1180, y: 90, width: 520, height: 620, z: 3,
      animation: { name: 'zoom-in', delay: 700, duration: 1200 }
    },
    {
      id: 'text',
      x: 170, y: 300, width: 900, height: 240, z: 4,
      animation: { name: 'slide-left', delay: 1300, duration: 1000 }
    }
  ]
};

/** A banner: one object arriving over a ground, and nothing else. */
const heroBanner = {
  name: 'hero-banner',
  label: 'Banner',
  hint: 'One object arriving over a background - the simplest scene worth making',
  width: 1920,
  height: 760,
  duration: 4500,
  background: { animation: { name: 'zoom-out', duration: 4500 } },
  layers: [
    {
      id: 'subject',
      x: 1060, y: 80, width: 700, height: 600, z: 2,
      animation: { name: 'slide-right', delay: 400, duration: 1200 }
    },
    {
      id: 'copy',
      x: 160, y: 330, width: 820, height: 200, z: 3,
      animation: { name: 'fade-in', delay: 1100, duration: 900 }
    }
  ]
};

/** The phone shape: body, screen, camera, then the marks one after another. */
const phoneShowcase = {
  name: 'phone-showcase',
  label: 'Phone showcase',
  hint: 'The handset rises, its screen and camera arrive, the feature marks follow',
  width: 1920,
  height: 760,
  duration: 6500,
  background: { animation: { name: 'zoom-out', duration: 6500 } },
  layers: [
    {
      id: 'phone',
      x: 760, y: 40, width: 360, height: 720, z: 2,
      animation: { name: 'slide-bottom', delay: 300, duration: 1400 }
    },
    {
      id: 'screen',
      x: 790, y: 76, width: 300, height: 640, z: 3,
      animation: { name: 'zoom-in', delay: 1200, duration: 1000 }
    },
    {
      id: 'camera',
      x: 1080, y: 120, width: 220, height: 220, z: 4,
      animation: { name: 'fade-in', delay: 1800, duration: 900 }
    },
    {
      id: 'text',
      x: 150, y: 250, width: 1000, height: 240, z: 1,
      animation: { name: 'slide-left', delay: 2200, duration: 1000 }
    },
    {
      id: 'icon-1',
      x: 180, y: 540, width: 120, height: 120, z: 5,
      animation: { name: 'bounce-in', delay: 2800, duration: 700 }
    },
    {
      id: 'icon-2',
      x: 330, y: 540, width: 120, height: 120, z: 5,
      animation: { name: 'bounce-in', delay: 3100, duration: 700 }
    },
    {
      id: 'icon-3',
      x: 480, y: 540, width: 120, height: 120, z: 5,
      animation: { name: 'bounce-in', delay: 3400, duration: 700 }
    }
  ]
};

/**
 * A product's own artwork, square, for the detail page. The handset FLOATS -
 * a continuous animation that never settles - which is the one preset whose
 * scene is still moving when the clock has run out.
 */
const productShowcase = {
  name: 'product-showcase',
  label: 'Product, floating',
  hint: 'The product keeps moving after everything else has arrived',
  width: 1200,
  height: 1200,
  duration: 5000,
  background: { animation: { name: 'zoom-out', duration: 5000 } },
  layers: [
    {
      id: 'product',
      x: 390, y: 180, width: 420, height: 840, z: 2,
      animation: { name: 'floating', duration: 2600, easing: 'ease-in-out' }
    },
    {
      id: 'detail',
      x: 760, y: 250, width: 200, height: 200, z: 3,
      animation: { name: 'rotate-in', delay: 700, duration: 900 }
    }
  ]
};

/** A short, light one for a marketing banner (spec section 2D). */
const galleryAdvert = {
  name: 'gallery-advert',
  label: 'Gallery advert',
  hint: 'Short and light - a reveal and a line of copy, under three seconds',
  width: 1600,
  height: 900,
  duration: 3000,
  background: { animation: { name: 'zoom-out', duration: 3000 } },
  layers: [
    {
      id: 'subject',
      x: 820, y: 120, width: 640, height: 660, z: 2,
      animation: { name: 'slide-bottom', delay: 200, duration: 900 }
    },
    {
      id: 'copy',
      x: 140, y: 380, width: 620, height: 180, z: 3,
      animation: { name: 'fade-in', delay: 800, duration: 700 }
    }
  ]
};

export const PRESETS = [
  heroProduct,
  heroBanner,
  phoneShowcase,
  productShowcase,
  galleryAdvert
];

export function presetNamed(name) {
  return PRESETS.filter((preset) => preset.name === name)[0] || null;
}

/**
 * A preset plus artwork is a scene.
 *
 * `pictures` is a background path and one per layer, in the preset's own
 * order; a layer with nothing for it keeps its place and its motion and is
 * simply left without a picture, so a half-filled scene can be saved and
 * finished later rather than having to be built in one sitting.
 */
export function applyPreset(preset, pictures) {
  if (!preset) return null;

  const held = pictures || {};
  const layers = preset.layers.map((layer) => Object.assign({}, layer, {
    type: 'image',
    src: held[layer.id] || ''
  }));

  return {
    sceneId: preset.name + '-' + Date.now().toString(36),
    width: preset.width,
    height: preset.height,
    duration: preset.duration,
    background: Object.assign({}, preset.background, { src: held.background || '' }),
    layers: layers
  };
}
