/**
 * THE ANIMATION LIBRARY, THE CONSOLE'S COPY.
 *
 * The storefront has the same table in
 * crystal-web/src/components/ImageAnimator/animationRegistry.js, and the two
 * are deliberately separate files rather than a shared package: the console
 * and the website are built independently and neither can import the other's
 * source. The test imageAnimator.test.js holds the NAMES together across all
 * three copies - here, the storefront's, and the server's validator in
 * utils/scene.js - because a name that exists in one place only is a scene
 * that saves and then will not draw.
 *
 * What differs from the storefront's copy, and only this: there is no
 * verification here. The console draws an uploaded picture from its ordinary
 * address, because it IS the thing that uploaded it, and an editor that
 * refused to show artwork until it had hashed it would be an editor nobody
 * could use while the signature was still being written.
 */

const SLIDE = { vertical: 200, horizontal: 300 };

export const ANIMATIONS = {
  'fade-in': {
    label: 'Fade in',
    keyframes: 'from { opacity: 0; } to { opacity: 1; }',
    still: { opacity: 1 }
  },
  'slide-top': {
    label: 'Slide from the top',
    keyframes: 'from { opacity: 0; transform: translateY(-' + SLIDE.vertical + 'px); } '
      + 'to { opacity: 1; transform: translateY(0); }',
    still: { opacity: 1, transform: 'translateY(0)' }
  },
  'slide-bottom': {
    label: 'Slide up from below',
    keyframes: 'from { opacity: 0; transform: translateY(' + SLIDE.vertical + 'px); } '
      + 'to { opacity: 1; transform: translateY(0); }',
    still: { opacity: 1, transform: 'translateY(0)' }
  },
  'slide-left': {
    label: 'Slide in from the left',
    keyframes: 'from { opacity: 0; transform: translateX(-' + SLIDE.horizontal + 'px); } '
      + 'to { opacity: 1; transform: translateX(0); }',
    still: { opacity: 1, transform: 'translateX(0)' }
  },
  'slide-right': {
    label: 'Slide in from the right',
    keyframes: 'from { opacity: 0; transform: translateX(' + SLIDE.horizontal + 'px); } '
      + 'to { opacity: 1; transform: translateX(0); }',
    still: { opacity: 1, transform: 'translateX(0)' }
  },
  'zoom-in': {
    label: 'Zoom in',
    keyframes: 'from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: scale(1); }',
    still: { opacity: 1, transform: 'scale(1)' }
  },
  'zoom-out': {
    label: 'Zoom out (settle)',
    keyframes: 'from { transform: scale(1.15); } to { transform: scale(1); }',
    still: { transform: 'scale(1)' }
  },
  'rotate-in': {
    label: 'Rotate in',
    keyframes: 'from { opacity: 0; transform: rotate(90deg) scale(0.8); } '
      + 'to { opacity: 1; transform: rotate(0) scale(1); }',
    still: { opacity: 1, transform: 'rotate(0) scale(1)' }
  },
  'bounce-in': {
    label: 'Bounce in',
    keyframes: 'from { opacity: 0; transform: scale(0.3); } '
      + '60% { opacity: 1; transform: scale(1.08); } '
      + '80% { transform: scale(0.96); } '
      + 'to { opacity: 1; transform: scale(1); }',
    still: { opacity: 1, transform: 'scale(1)' }
  },
  floating: {
    label: 'Floating (never stops)',
    keyframes: 'from { transform: translateY(0); } to { transform: translateY(-20px); }',
    still: { transform: 'translateY(0)' },
    continuous: true,
    direction: 'alternate'
  },
  none: {
    label: 'Still',
    keyframes: 'from { opacity: 1; } to { opacity: 1; }',
    still: {}
  }
};

export const ANIMATION_NAMES = Object.keys(ANIMATIONS);

/** What the select offers, in the order the specification lists them. */
export const ANIMATION_OPTIONS = ANIMATION_NAMES.map((name) => ({
  value: name,
  label: ANIMATIONS[name].label
}));

export const EASINGS = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'];

export const EASING_OPTIONS = EASINGS.map((easing) => ({ value: easing, label: easing }));

export function keyframeNameOf(name) {
  return 'crystalScene-' + (ANIMATIONS[name] ? name : 'none');
}

export function keyframesStylesheet() {
  return ANIMATION_NAMES.map(function (name) {
    return '@keyframes ' + keyframeNameOf(name) + ' { ' + ANIMATIONS[name].keyframes + ' }';
  }).join('\n');
}

/** The scene an operator gets when they start a new one from nothing. */
export function emptyScene() {
  return {
    sceneId: 'scene-' + Date.now().toString(36),
    width: 1920,
    height: 760,
    duration: 5000,
    background: { src: '', alt: '', animation: { name: 'zoom-out', delay: 0, duration: 5000, easing: 'ease-out' } },
    layers: []
  };
}

/** One new layer, placed where it can be seen rather than at the origin. */
export function emptyLayer(index) {
  return {
    id: 'layer-' + (index + 1),
    type: 'image',
    src: '',
    alt: '',
    x: 160 + (index * 40),
    y: 120 + (index * 40),
    width: 400,
    height: 400,
    z: index + 1,
    animation: { name: 'fade-in', delay: index * 300, duration: 1000, easing: 'ease-out' }
  };
}
