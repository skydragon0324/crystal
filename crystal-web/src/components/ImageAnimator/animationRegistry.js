/**
 * THE ANIMATION LIBRARY: every motion a scene layer may be given.
 *
 * ONE STYLESHEET, NOT ONE PER LAYER. Each entry here becomes a single
 * `@keyframes` rule, injected once by ImageAnimator; a layer then names the
 * one it wants. Defining keyframes per layer - the obvious way with Emotion -
 * mints a fresh rule for every layer of every scene on the page, which is a
 * stylesheet that grows with the content.
 *
 * TRANSFORM AND OPACITY ONLY (spec section 10). Both are composited on the
 * GPU: the browser can animate them without laying the page out again or
 * repainting a pixel. Animating `top`, `left`, `width` or `height` forces a
 * layout on every frame, which on a phone is the difference between a scene
 * that glides and one that stutters.
 *
 * `both` FILL MODE IS WHAT MAKES `delay` WORK. Without it a layer waits out
 * its delay in its FINAL position and then jumps back to the start to begin -
 * so a stagger reads as everything appearing at once and then re-animating.
 * With it, the from-state is held through the delay.
 *
 * THE NAMES ARE THE SPEC'S, and its own example's names are accepted too:
 * the list calls a rising phone "Slide From Bottom" and the JSON example
 * calls it "slide-up". Both work; see ALIASES.
 */

/** How far a sliding layer travels, in scene units. Scaled with everything else. */
const SLIDE = {
  vertical: 200,
  horizontal: 300
};

/**
 * Every animation: the keyframes it needs, and the state a layer sits in when
 * motion is refused (`still`) - which is the END of the motion, because
 * somebody who asked for no animation asked to be shown the result, not an
 * empty frame.
 */
export const ANIMATIONS = {
  /* 1. the text, the icons, the small things */
  'fade-in': {
    keyframes: 'from { opacity: 0; } to { opacity: 1; }',
    still: { opacity: 1 }
  },

  /* 2. clouds, banners, anything that belongs overhead */
  'slide-top': {
    keyframes: 'from { opacity: 0; transform: translateY(-' + SLIDE.vertical + 'px); } '
      + 'to { opacity: 1; transform: translateY(0); }',
    still: { opacity: 1, transform: 'translateY(0)' }
  },

  /* 3. products, phones, devices - the thing being sold rises into frame */
  'slide-bottom': {
    keyframes: 'from { opacity: 0; transform: translateY(' + SLIDE.vertical + 'px); } '
      + 'to { opacity: 1; transform: translateY(0); }',
    still: { opacity: 1, transform: 'translateY(0)' }
  },

  /* 4. copy and features, which are read left to right */
  'slide-left': {
    keyframes: 'from { opacity: 0; transform: translateX(-' + SLIDE.horizontal + 'px); } '
      + 'to { opacity: 1; transform: translateX(0); }',
    still: { opacity: 1, transform: 'translateX(0)' }
  },

  /* 5. the other side */
  'slide-right': {
    keyframes: 'from { opacity: 0; transform: translateX(' + SLIDE.horizontal + 'px); } '
      + 'to { opacity: 1; transform: translateX(0); }',
    still: { opacity: 1, transform: 'translateX(0)' }
  },

  /* 6. the hero object, arriving */
  'zoom-in': {
    keyframes: 'from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: scale(1); }',
    still: { opacity: 1, transform: 'scale(1)' }
  },

  /*
   * 7. the background, settling.
   *
   * It starts LARGER and eases down to its true size, which reads as the
   * camera pulling back. Going the other way would show the frame's edges.
   */
  'zoom-out': {
    keyframes: 'from { transform: scale(1.15); } to { transform: scale(1); }',
    still: { transform: 'scale(1)' }
  },

  /* 8. marks and logos */
  'rotate-in': {
    keyframes: 'from { opacity: 0; transform: rotate(90deg) scale(0.8); } '
      + 'to { opacity: 1; transform: rotate(0) scale(1); }',
    still: { opacity: 1, transform: 'rotate(0) scale(1)' }
  },

  /*
   * 9. buttons and feature marks.
   *
   * The overshoot is in the keyframes rather than in an easing curve, because
   * `cubic-bezier` overshoot on a scale that starts at 0.3 is a layer that
   * visibly inverts through zero on some engines.
   */
  'bounce-in': {
    keyframes: 'from { opacity: 0; transform: scale(0.3); } '
      + '60% { opacity: 1; transform: scale(1.08); } '
      + '80% { transform: scale(0.96); } '
      + 'to { opacity: 1; transform: scale(1); }',
    still: { opacity: 1, transform: 'scale(1)' }
  },

  /*
   * 10. floating - the one that never finishes.
   *
   * It is marked `continuous`, which is what tells ImageAnimator to run it
   * `infinite alternate` and to leave it out of the scene's own clock: a
   * layer that never settles must not be what the scene waits for.
   */
  floating: {
    keyframes: 'from { transform: translateY(0); } to { transform: translateY(-20px); }',
    still: { transform: 'translateY(0)' },
    continuous: true,
    direction: 'alternate'
  },

  /*
   * A layer that does not move, for the plate a scene is built on. Named
   * rather than implied, so a scene says what it means.
   */
  none: {
    keyframes: 'from { opacity: 1; } to { opacity: 1; }',
    still: {}
  }
};

/**
 * THE ADVANCED EFFECTS (spec phase 5), and the two that are not here.
 *
 * PARALLAX is a per-layer DEPTH rather than an animation: a layer with
 * `parallax: 0.4` moves four tenths as far as the pointer does, which is what
 * makes a background sit behind a foreground instead of beside it. It is
 * applied as a second transform on a wrapper, so it composes with whatever
 * motion the layer already has rather than replacing it.
 *
 * LIGHTING is a sweep - a soft band of white travelling across a layer, on a
 * loop - which is the one lighting effect that survives being a rectangle of
 * CSS rather than a shader. It is a pseudo-element on the layer, so it costs
 * no extra DOM node and no extra picture.
 *
 * PARTICLES AND 3D ROTATION ARE DELIBERATELY ABSENT, and the specification's
 * own section 10 is the reason: it asks for GPU transforms and says to avoid
 * canvas rendering initially. Particles without canvas means one DOM node per
 * particle - fifty nodes animating on a phone, which is the opposite of what
 * that section asks for - and a true 3D rotation needs a perspective camera
 * and z-sorting that this flat layer model does not have. Both are worth
 * doing with a canvas layer type when something actually needs them; neither
 * is worth faking.
 */
export const PARALLAX_LIMIT = 60;

/** The sweep, as a rule a layer opts into. */
export const SHEEN_KEYFRAMES = '@keyframes crystalSceneSheen { '
  + 'from { transform: translateX(-120%) skewX(-18deg); } '
  + 'to { transform: translateX(320%) skewX(-18deg); } }';

/**
 * The spec's two vocabularies, reconciled.
 *
 * Its numbered list names an animation by where the layer comes FROM
 * ("Slide From Bottom"); its JSON example names it by where the layer GOES
 * ("slide-up"). Console data has been written both ways since, so both are
 * understood and neither is rewritten on the way in.
 */
export const ALIASES = {
  'slide-up': 'slide-bottom',
  'slide-down': 'slide-top',
  'slide-in-left': 'slide-left',
  'slide-in-right': 'slide-right',
  'slide-from-top': 'slide-top',
  'slide-from-bottom': 'slide-bottom',
  'slide-from-left': 'slide-left',
  'slide-from-right': 'slide-right',
  fade: 'fade-in',
  zoom: 'zoom-in',
  rotate: 'rotate-in',
  bounce: 'bounce-in',
  float: 'floating'
};

/** Every name a scene may legitimately use, canonical first. */
export const ANIMATION_NAMES = Object.keys(ANIMATIONS);

/** The name this one really is, or `none` if it is not one at all. */
export function resolve(name) {
  const asked = String(name || 'none').trim().toLowerCase();
  const canonical = ALIASES[asked] || asked;
  return ANIMATIONS[canonical] ? canonical : 'none';
}

export function definitionOf(name) {
  return ANIMATIONS[resolve(name)];
}

/** The `animation-name` a layer gets, namespaced so nothing else collides. */
export function keyframeNameOf(name) {
  return 'crystalScene-' + resolve(name);
}

/**
 * The whole library as one stylesheet, built once and injected once.
 *
 * Emotion's `Global` takes a string, so this is a string - and because the
 * names are namespaced and the content never varies, a second scene on the
 * same page re-uses the same rules rather than adding its own.
 */
export function keyframesStylesheet() {
  return ANIMATION_NAMES.map(function (name) {
    return '@keyframes ' + keyframeNameOf(name) + ' { ' + ANIMATIONS[name].keyframes + ' }';
  }).concat([SHEEN_KEYFRAMES]).join('\n');
}

/** Easings a scene may ask for, and what an unknown one falls back to. */
export const EASINGS = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'];

export function easingOf(easing) {
  const asked = String(easing || '').trim().toLowerCase();
  /* A cubic-bezier written out is allowed through as itself. */
  if (/^cubic-bezier\(\s*[-\d.\s,]+\)$/.test(asked)) return asked;
  return EASINGS.indexOf(asked) === -1 ? 'ease-out' : asked;
}
