/**
 * THE PRESETS AN OPERATOR STARTS FROM (spec section 5).
 *
 * A preset is the shape of a scene without its pictures: which layer moves
 * how, in what order, over how long. Picking one and then uploading four
 * pictures is the difference between building an advert and filling in
 * twenty-eight numbers to find out what a stagger looks like.
 *
 * THE STOREFRONT HAS THE SAME LIST, in
 * crystal-web/src/components/ImageAnimator/presets.js, and the two are
 * separate files for the same reason every other pair in this project is:
 * the console and the website build independently and neither can import the
 * other's source. Only this copy carries the LABELS, because only this copy
 * is ever read by a person.
 */

export const PRESETS = [
  {
    name: 'hero-product',
    label: 'Product hero',
    hint: 'A background that settles, a product that grows into frame, copy after it',
    width: 1920,
    height: 760,
    duration: 6000,
    background: { src: '', alt: '', animation: { name: 'zoom-out', delay: 0, duration: 6000, easing: 'ease-out' } },
    layers: [
      {
        id: 'product', type: 'image', src: '', x: 1180, y: 90, width: 520, height: 620, z: 3,
        animation: { name: 'zoom-in', delay: 700, duration: 1200, easing: 'ease-out' }
      },
      {
        id: 'text', type: 'image', src: '', x: 170, y: 300, width: 900, height: 240, z: 4,
        animation: { name: 'slide-left', delay: 1300, duration: 1000, easing: 'ease-out' }
      }
    ]
  },
  {
    name: 'hero-banner',
    label: 'Banner',
    hint: 'One object arriving over a background - the simplest scene worth making',
    width: 1920,
    height: 760,
    duration: 4500,
    background: { src: '', alt: '', animation: { name: 'zoom-out', delay: 0, duration: 4500, easing: 'ease-out' } },
    layers: [
      {
        id: 'subject', type: 'image', src: '', x: 1060, y: 80, width: 700, height: 600, z: 2,
        animation: { name: 'slide-right', delay: 400, duration: 1200, easing: 'ease-out' }
      },
      {
        id: 'copy', type: 'image', src: '', x: 160, y: 330, width: 820, height: 200, z: 3,
        animation: { name: 'fade-in', delay: 1100, duration: 900, easing: 'ease-out' }
      }
    ]
  },
  {
    name: 'phone-showcase',
    label: 'Phone showcase',
    hint: 'The handset rises, its screen and camera arrive, the feature marks follow',
    width: 1920,
    height: 760,
    duration: 6500,
    background: { src: '', alt: '', animation: { name: 'zoom-out', delay: 0, duration: 6500, easing: 'ease-out' } },
    layers: [
      {
        id: 'phone', type: 'image', src: '', x: 760, y: 40, width: 360, height: 720, z: 2,
        animation: { name: 'slide-bottom', delay: 300, duration: 1400, easing: 'ease-out' }
      },
      {
        id: 'screen', type: 'image', src: '', x: 790, y: 76, width: 300, height: 640, z: 3,
        animation: { name: 'zoom-in', delay: 1200, duration: 1000, easing: 'ease-out' }
      },
      {
        id: 'camera', type: 'image', src: '', x: 1080, y: 120, width: 220, height: 220, z: 4,
        animation: { name: 'fade-in', delay: 1800, duration: 900, easing: 'ease-out' }
      },
      {
        id: 'text', type: 'image', src: '', x: 150, y: 250, width: 1000, height: 240, z: 1,
        animation: { name: 'slide-left', delay: 2200, duration: 1000, easing: 'ease-out' }
      },
      {
        id: 'icon-1', type: 'image', src: '', x: 180, y: 540, width: 120, height: 120, z: 5,
        animation: { name: 'bounce-in', delay: 2800, duration: 700, easing: 'ease-out' }
      },
      {
        id: 'icon-2', type: 'image', src: '', x: 330, y: 540, width: 120, height: 120, z: 5,
        animation: { name: 'bounce-in', delay: 3100, duration: 700, easing: 'ease-out' }
      },
      {
        id: 'icon-3', type: 'image', src: '', x: 480, y: 540, width: 120, height: 120, z: 5,
        animation: { name: 'bounce-in', delay: 3400, duration: 700, easing: 'ease-out' }
      }
    ]
  },
  {
    name: 'product-showcase',
    label: 'Product, floating',
    hint: 'The product keeps moving after everything else has arrived',
    width: 1200,
    height: 1200,
    duration: 5000,
    background: { src: '', alt: '', animation: { name: 'zoom-out', delay: 0, duration: 5000, easing: 'ease-out' } },
    layers: [
      {
        id: 'product', type: 'image', src: '', x: 390, y: 180, width: 420, height: 840, z: 2,
        animation: { name: 'floating', delay: 0, duration: 2600, easing: 'ease-in-out' }
      },
      {
        id: 'detail', type: 'image', src: '', x: 760, y: 250, width: 200, height: 200, z: 3,
        animation: { name: 'rotate-in', delay: 700, duration: 900, easing: 'ease-out' }
      }
    ]
  },
  {
    name: 'gallery-advert',
    label: 'Gallery advert',
    hint: 'Short and light - a reveal and a line of copy, under three seconds',
    width: 1600,
    height: 900,
    duration: 3000,
    background: { src: '', alt: '', animation: { name: 'zoom-out', delay: 0, duration: 3000, easing: 'ease-out' } },
    layers: [
      {
        id: 'subject', type: 'image', src: '', x: 820, y: 120, width: 640, height: 660, z: 2,
        animation: { name: 'slide-bottom', delay: 200, duration: 900, easing: 'ease-out' }
      },
      {
        id: 'copy', type: 'image', src: '', x: 140, y: 380, width: 620, height: 180, z: 3,
        animation: { name: 'fade-in', delay: 800, duration: 700, easing: 'ease-out' }
      }
    ]
  }
];

/** A fresh scene from a preset - a new id, and no pictures in it yet. */
export function sceneFromPreset(preset) {
  if (!preset) return null;

  return {
    sceneId: preset.name + '-' + Date.now().toString(36),
    width: preset.width,
    height: preset.height,
    duration: preset.duration,
    background: JSON.parse(JSON.stringify(preset.background)),
    layers: JSON.parse(JSON.stringify(preset.layers))
  };
}
