import { easingOf, resolve, definitionOf } from './animationRegistry';

/**
 * WHAT A SCENE IS, and what it means when it does not say.
 *
 * A scene arrives as JSON - from the console, through the API - and JSON
 * written by a person is JSON with fields missing. Everything that reads a
 * scene reads it through here, so a layer with no size, no delay and a
 * misspelt animation still draws something sensible instead of throwing.
 *
 * THE COORDINATES ARE THE SCENE'S OWN, not pixels on anybody's screen. A
 * scene declares the frame it was drawn in - 1920x760 by default, the shape
 * of a hero advert - and every layer is placed in that frame. The renderer
 * scales the whole thing to whatever width it has been given, so one scene
 * is correct on a 1920px desktop, a 768px tablet and a 390px phone without
 * anybody writing three sets of numbers (spec section 7).
 *
 * A layer with no position fills the frame, which is what a background and a
 * full-bleed plate both want, and is the least surprising default for a
 * console field left empty.
 */

/** The frame a scene is authored in when it does not say. */
export const SCENE_WIDTH = 1920;
export const SCENE_HEIGHT = 760;

/** How long a layer moves for, and how long a scene lasts, when unstated. */
export const DEFAULT_LAYER_MS = 1000;
export const DEFAULT_SCENE_MS = 5000;

/** Sanity bounds. A scene is artwork, not an application. */
export const MAX_LAYERS = 12;
export const MAX_SCENE_MS = 60000;

function number(value, fallback) {
  const held = Number(value);
  return Number.isFinite(held) ? held : fallback;
}

/**
 * One layer, with every field resolved.
 *
 * `index` is its position in the list, which is what a scene-level `stagger`
 * multiplies to space the layers out - so a five layer scene can be written
 * without five hand-counted delays, and inserting a layer does not mean
 * renumbering the rest.
 */
export function normaliseLayer(layer, index, scene) {
  const raw = layer || {};
  const animation = raw.animation || {};
  const name = resolve(animation.name);
  const definition = definitionOf(name);

  const stagger = number(scene && scene.stagger, 0);
  const delay = animation.delay === undefined || animation.delay === null
    ? Math.max(0, stagger * index)
    : Math.max(0, number(animation.delay, 0));

  return {
    id: raw.id || ('layer-' + (index + 1)),
    type: raw.type === 'text' ? 'text' : 'image',
    src: raw.src || '',
    text: raw.text || '',
    alt: raw.alt || '',

    /* Placed in the scene's own frame; absent means "fill it". */
    x: number(raw.x, 0),
    y: number(raw.y, 0),
    width: number(raw.width, null),
    height: number(raw.height, null),
    z: number(raw.z, index + 1),

    /* Text layers carry their own look, since there is no artwork to carry it. */
    fontSize: number(raw.fontSize, 64),
    colour: raw.colour || '#FFFFFF',
    align: raw.align === 'center' || raw.align === 'right' ? raw.align : 'left',
    weight: number(raw.weight, 700),

    /*
     * THE ADVANCED EFFECTS, per layer (spec phase 5).
     *
     * `parallax` is a depth: 0 is fixed to the frame, 1 follows the pointer
     * exactly, and a scene reads as having depth when the background is given
     * a little and the foreground more. `sheen` is the light sweep.
     *
     * Both default to off, because a scene that does neither is the normal
     * case and an effect nobody asked for is an effect nobody can turn off.
     */
    parallax: Math.min(1, Math.max(0, number(raw.parallax, 0))),
    sheen: !!raw.sheen,

    animation: {
      name: name,
      delay: delay,
      duration: Math.max(0, number(animation.duration, DEFAULT_LAYER_MS)),
      easing: easingOf(animation.easing),
      /* A continuous animation repeats whatever the layer says. */
      repeat: definition.continuous ? 'infinite' : (animation.repeat === 'infinite' ? 'infinite' : 1),
      direction: definition.direction || animation.direction || 'normal',
      continuous: !!definition.continuous
    }
  };
}

/** A whole scene, with its layers resolved and capped. */
export function normaliseScene(scene) {
  const raw = scene || {};
  const layers = Array.isArray(raw.layers) ? raw.layers.slice(0, MAX_LAYERS) : [];

  const normalised = {
    id: raw.sceneId || raw.id || 'scene',
    width: Math.max(1, number(raw.width, SCENE_WIDTH)),
    height: Math.max(1, number(raw.height, SCENE_HEIGHT)),
    stagger: Math.max(0, number(raw.stagger, 0)),
    background: raw.background || null,
    layers: []
  };

  normalised.layers = layers.map(function (layer, index) {
    return normaliseLayer(layer, index, normalised);
  });

  /*
   * THE SCENE'S LENGTH IS THE LAST LAYER TO SETTLE, unless it was told
   * otherwise. An author who has written the delays should not also have to
   * add them up, and a scene whose stated duration is shorter than its own
   * animation would be cut off mid-motion by the carousel.
   */
  const settles = normalised.layers.reduce(function (latest, layer) {
    if (layer.animation.continuous) return latest;
    return Math.max(latest, layer.animation.delay + layer.animation.duration);
  }, 0);

  normalised.duration = Math.min(
    MAX_SCENE_MS,
    Math.max(number(raw.duration, DEFAULT_SCENE_MS), settles)
  );

  return normalised;
}

/** Whether a value is a scene at all, which is what a renderer checks first. */
export function isScene(scene) {
  return !!scene
    && typeof scene === 'object'
    && Array.isArray(scene.layers)
    && scene.layers.length > 0;
}

/** Every uploaded picture a scene needs, background included, in order. */
export function sourcesOf(scene) {
  const normalised = isScene(scene) ? normaliseScene(scene) : null;
  if (!normalised) return [];

  const sources = normalised.background && normalised.background.src
    ? [normalised.background.src]
    : [];

  normalised.layers.forEach(function (layer) {
    if (layer.type === 'image' && layer.src) sources.push(layer.src);
  });

  return sources;
}
