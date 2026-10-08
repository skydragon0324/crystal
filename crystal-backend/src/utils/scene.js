'use strict';

const imageFile = require('../security/imageFile');
const { HttpError } = require('./response');

/**
 * WHAT MAY BE STORED IN AN ANIMATED SCENE, and what is refused.
 *
 * A scene is JSON written by the console and drawn by the storefront
 * (crystal-web components/ImageAnimator). Two rules make that safe:
 *
 *   NOTHING IS STORED THAT WAS NOT ASKED FOR. The row is rebuilt field by
 *   field from the list below rather than saved as it arrived, so a caller
 *   cannot park arbitrary JSON - or a megabyte of it - in a column the
 *   storefront reads and hands to a renderer.
 *
 *   EVERY PICTURE IS AN UPLOAD. A layer's `src` must be a plain /uploads/...
 *   path, checked the same way every other stored file reference is. Without
 *   that, a scene could name any address on the internet and the storefront
 *   would fetch it - defeating the verification that the rest of the artwork
 *   goes through, and leaking every visitor's address to whoever was named.
 *
 * THE ANIMATION NAMES ARE WRITTEN OUT HERE, not imported, and that is the
 * same decision as the signing schemas: the storefront has its own copy in
 * animationRegistry.js, and a name that exists on one side only should be a
 * visible change to both files rather than something that drifts. The test
 * sceneShape.test.js holds the two lists together.
 */

/* The ten animations, their continuous one, and the still layer. */
const ANIMATION_NAMES = [
  'fade-in',
  'slide-top', 'slide-bottom', 'slide-left', 'slide-right',
  'zoom-in', 'zoom-out',
  'rotate-in', 'bounce-in',
  'floating',
  'none'
];

/* What the storefront's registry also answers to. Kept in step with ALIASES. */
const ALIASES = {
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

const EASINGS = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'];

const MAX_LAYERS = 12;
const MAX_MS = 60000;
const MAX_TEXT = 200;
const MAX_DIMENSION = 10000;

function clamp(value, low, high, fallback) {
  const held = Number(value);
  if (!Number.isFinite(held)) return fallback;
  return Math.min(high, Math.max(low, held));
}

function animationName(name) {
  const asked = String(name || 'none').trim().toLowerCase();
  const canonical = ALIASES[asked] || asked;
  if (ANIMATION_NAMES.indexOf(canonical) === -1) {
    throw new HttpError(400, 'scene.unknownAnimation', null, { name: String(name) });
  }
  return canonical;
}

function pictureOf(src, what) {
  const path = String(src || '').trim();
  if (!path) throw new HttpError(400, 'scene.aLayerNeedsAPicture', null, { layer: what });

  /* The same gate every other stored file reference passes. */
  if (imageFile.storageKeyProblem(path)) {
    throw new HttpError(400, 'scene.aPictureMustBeAnUpload', null, { layer: what });
  }

  return path;
}

function animationOf(animation) {
  const raw = animation || {};
  const easing = String(raw.easing || '').trim().toLowerCase();

  return {
    name: animationName(raw.name),
    delay: clamp(raw.delay, 0, MAX_MS, 0),
    duration: clamp(raw.duration, 0, MAX_MS, 1000),
    easing: EASINGS.indexOf(easing) === -1 ? 'ease-out' : easing
  };
}

function layerOf(layer, index) {
  const raw = layer || {};
  const what = raw.id || ('layer ' + (index + 1));
  const type = raw.type === 'text' ? 'text' : 'image';

  const clean = {
    id: String(raw.id || ('layer-' + (index + 1))).slice(0, 40),
    type: type,
    x: clamp(raw.x, -MAX_DIMENSION, MAX_DIMENSION, 0),
    y: clamp(raw.y, -MAX_DIMENSION, MAX_DIMENSION, 0),
    z: clamp(raw.z, 0, 100, index + 1),
    animation: animationOf(raw.animation)
  };

  /* Absent width or height means "fill the frame", and stays absent. */
  if (raw.width !== undefined && raw.width !== null && raw.width !== '') {
    clean.width = clamp(raw.width, 1, MAX_DIMENSION, 100);
  }
  if (raw.height !== undefined && raw.height !== null && raw.height !== '') {
    clean.height = clamp(raw.height, 1, MAX_DIMENSION, 100);
  }

  /*
   * THE EFFECTS THE ENGINE READS, kept rather than quietly dropped.
   *
   * The console's form does not offer these yet - a scene built by hand or
   * by a future preset does - and a field this sanitiser does not name is a
   * field the save silently deletes. So they are named: a depth between 0
   * and 1, and the light sweep on or off.
   */
  const parallax = Math.min(1, Math.max(0, Number(raw.parallax) || 0));
  /* Written only when it is on: a stored scene should say what it does, not
     carry a default for every effect it declined. */
  if (parallax) clean.parallax = parallax;
  if (raw.sheen) clean.sheen = true;

  if (type === 'text') {
    clean.text = String(raw.text || '').slice(0, MAX_TEXT);
    clean.fontSize = clamp(raw.fontSize, 8, 400, 64);
    clean.weight = clamp(raw.weight, 100, 900, 700);
    clean.align = ['left', 'center', 'right'].indexOf(raw.align) === -1 ? 'left' : raw.align;
    /* A colour is three or six hex digits and nothing else. */
    clean.colour = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(String(raw.colour || ''))
      ? String(raw.colour)
      : '#FFFFFF';
  } else {
    clean.src = pictureOf(raw.src, what);
    clean.alt = String(raw.alt || '').slice(0, MAX_TEXT);
    /* A layer that fills the frame is covered, not letterboxed inside it. */
    if (raw.fit === 'cover') clean.fit = 'cover';
  }

  return clean;
}

/**
 * A scene as it will be stored, or null for "this advert is not a scene".
 *
 * An empty object, an empty string and a scene with no layers all mean the
 * same thing - the console clearing the field - and all become null, so the
 * advert goes back to being the flat picture in `file_path`.
 */
function sanitise(scene) {
  if (scene === null || scene === undefined || scene === '') return null;

  let raw = scene;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch (error) {
      throw new HttpError(400, 'scene.thatIsNotAScene');
    }
  }

  if (typeof raw !== 'object' || Array.isArray(raw)) throw new HttpError(400, 'scene.thatIsNotAScene');

  const layers = Array.isArray(raw.layers) ? raw.layers : [];
  if (!layers.length) return null;
  if (layers.length > MAX_LAYERS) {
    throw new HttpError(400, 'scene.tooManyLayers', null, { limit: MAX_LAYERS });
  }

  const clean = {
    sceneId: String(raw.sceneId || raw.id || 'scene').slice(0, 40),
    width: clamp(raw.width, 1, MAX_DIMENSION, 1920),
    height: clamp(raw.height, 1, MAX_DIMENSION, 760),
    duration: clamp(raw.duration, 0, MAX_MS, 5000),
    stagger: clamp(raw.stagger, 0, MAX_MS, 0),
    layers: layers.map(layerOf)
  };

  if (raw.background && raw.background.src) {
    clean.background = {
      src: pictureOf(raw.background.src, 'background'),
      alt: String(raw.background.alt || '').slice(0, MAX_TEXT),
      animation: animationOf(raw.background.animation)
    };
  }

  return clean;
}

/** Every uploaded picture a scene points at - what signing and cleanup need. */
function sourcesOf(scene) {
  if (!scene || typeof scene !== 'object') return [];

  const sources = scene.background && scene.background.src ? [scene.background.src] : [];
  (Array.isArray(scene.layers) ? scene.layers : []).forEach(function (layer) {
    if (layer && layer.type !== 'text' && layer.src) sources.push(layer.src);
  });

  return sources;
}

/**
 * The write path's hook: cleans `scene` wherever a row carries one, and
 * leaves every other column exactly as it came.
 */
function sanitiseRow(data) {
  if (!data || !Object.prototype.hasOwnProperty.call(data, 'scene')) return data;
  return Object.assign({}, data, { scene: sanitise(data.scene) });
}

module.exports = {
  ANIMATION_NAMES: ANIMATION_NAMES,
  ALIASES: ALIASES,
  EASINGS: EASINGS,
  MAX_LAYERS: MAX_LAYERS,
  sanitise: sanitise,
  sanitiseRow: sanitiseRow,
  sourcesOf: sourcesOf
};
