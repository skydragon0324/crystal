/**
 * THE OVERVIEW CHAPTER'S SCENE: a sky, clouds, a globe, and an aeroplane
 * arriving.
 *
 * WHY THIS IS CODE AND NOT DATA. Every other picture on this page is a row in
 * images.js, and the three-layer mock this replaced had its geometry there
 * too - a fixed x, y, width and height per layer. That works for one frame
 * shape and this chapter has two: 16:9 on a phone and 16:5 on a desktop. A
 * composition written for a 375-unit-tall frame is wrong in a 675-unit one -
 * the globe hangs in mid-air, the aeroplane stops above the clouds - so the
 * positions are DERIVED from the frame rather than written into it.
 *
 * Everything below is therefore a fraction of the width or the height, and
 * the two shapes are the same picture rather than two pictures.
 *
 * WHAT HAPPENS, IN ORDER:
 *
 *   the sky          the plate, still, drawn `cover` so the horizon survives
 *   three clouds     drifting sideways for as long as the chapter is on
 *                    screen, and THE ONLY THING THAT LEANS WITH THE POINTER -
 *                    more for the near one than the far one, which is what
 *                    reads as depth
 *   the globe        settling in on the left, and then holding still
 *   the trail        a streak that arrives with the aircraft and dissipates
 *   the aeroplane    in from off the RIGHT of the frame, decelerating to a
 *                    stop left of centre
 *   the name         rising in beneath it, once it has stopped
 *   the line         fading in to its right, a moment later
 *
 * ONLY THE CLOUDS ANSWER THE MOUSE. The globe and the aeroplane had a little
 * parallax each to begin with, and the result was that the whole picture
 * leaned as one - which is not depth, it is a tilt. With the sky alone
 * moving, the aircraft reads as fixed in a sky that shifts behind it.
 *
 * THE AEROPLANE FLIES RIGHT TO LEFT, which is a fact about the ARTWORK as
 * much as about the keyframes: overview-plane.svg is mirrored so the nose
 * faces the way it is going, and the trail is on the aircraft's right, which
 * is where it has come from.
 *
 * BOTH LINES ARE PICTURES, not text layers. They were set by the engine's
 * text layer, which is the right answer when the words are words - but a
 * wordmark and a strapline have their own faces and their own spacing, and
 * they arrive as files. Each is boxed at its ARTWORK'S shape so that
 * `contain` neither crops nor stretches it, and each carries what it says in
 * its alt text, which is the whole of the accessibility story for a picture
 * of words.
 *
 * THE TIMINGS ARE A SEQUENCE AND ARE WRITTEN AS ONE. `after` adds up the
 * stages so that moving the aeroplane's flight time moves the two lines of
 * text with it; the version of this with nine hand-counted delays was wrong
 * twice before it was right once.
 */

/** The pieces, by the `role` their row in images.js carries. */
export const ROLES = [
  'sky', 'cloud-far', 'cloud-mid', 'cloud-near', 'globe', 'trail', 'plane', 'name', 'tagline'
];

/* The shapes the two wordmarks are drawn at - 900x140 and 640x110. */
const WORDMARK = {
  name: 900 / 140,
  tagline: 640 / 110
};

/* How long each stage of the arrival takes. */
const TIMING = {
  globeIn: 900,
  flight: 1700,
  /* The pause between the aircraft stopping and the name appearing. */
  settle: 180,
  nameIn: 760,
  lineIn: 900
};

/*
 * HOW LONG THE WHOLE THING HOLDS before it plays again.
 *
 * The scene loops - every chapter picture does - and its own length is
 * otherwise the last thing to settle, which here is about three and a half
 * seconds. An aeroplane landing every three and a half seconds is a
 * distraction next to the sentence this chapter is actually about, so it
 * holds the finished picture for most of a cycle.
 */
export const OVERVIEW_MS = 14000;

/** The clouds, as [role, width of frame, height of frame, depth]. */
const CLOUDS = [
  /* Far: small, high, barely moves with the pointer. */
  ['cloud-far', 0.17, 0.30, 0.06],
  /* Middle. */
  ['cloud-mid', 0.22, 0.46, 0.13],
  /* Near: biggest, lowest, leans most. */
  ['cloud-near', 0.28, 0.60, 0.22]
];

/**
 * The scene's layers, for a frame of this size.
 *
 * @param width    the frame's width in scene units
 * @param height   its height, which is what the chapter's ratio decides
 * @param pictures { role: { src, alt } } from the slot - see images.js
 */
export default function overviewLayers(width, height, pictures) {
  const of = (role) => pictures[role] || null;
  const layers = [];

  /*
   * ONE CLOCK. `startOf` hands back the instant a stage begins and advances
   * past it; `pause` advances without starting anything, which is how the
   * aeroplane gets to come to a rest before the name appears under it.
   */
  let clock = 0;
  const startOf = (ms) => {
    const start = clock;
    clock += ms;
    return start;
  };
  const pause = (ms) => { clock += ms; };

  const push = (role, box, animation) => {
    const picture = of(role);
    /* A piece that has not been drawn yet is left out, not drawn empty. */
    if (!picture) return;

    layers.push(Object.assign({
      id: role,
      type: 'image',
      src: picture.src,
      alt: picture.alt || '',
      z: layers.length + 1
    }, box, { animation: animation }));
  };

  /* ------------------------------------------------------------- the sky */
  push('sky', { x: 0, y: 0, fit: 'cover' }, { name: 'none', duration: 400 });

  /* ---------------------------------------------------------- the clouds */

  /*
   * NEAR THE HORIZON, which on this plate sits around three fifths down -
   * see overview-sky.svg, where the haze thickens. Clouds above that line
   * read as weather; on it they read as distance.
   */
  CLOUDS.forEach(function (cloud, index) {
    const w = width * cloud[1];
    /* Drawn at 420x180, 320x150 and 240x120 - all near 7:3. */
    const h = w * (3 / 7);

    push(cloud[0], {
      /* Spread across the frame, none of them centred on the aircraft. */
      x: width * (0.06 + index * 0.32),
      y: height * cloud[2],
      width: w,
      height: h,
      parallax: cloud[3]
    }, {
      name: 'drifting',
      /* Different periods, or three clouds move as one object. */
      duration: 9000 + index * 2600,
      easing: 'ease-in-out'
    });
  });

  /* ----------------------------------------------------------- the globe */

  /*
   * ON THE LEFT, SITTING LOW, with a little of it below the frame: a globe
   * resting on the bottom edge reads as placed on something, which is what
   * keeps it from floating in the sky beside the aeroplane.
   */
  /* Bounded by the WIDTH as well: sized on height alone it takes nearly half
     of a 16:9 frame and crowds the aeroplane out of its own scene. */
  const globe = Math.min(height * 0.78, width * 0.3);

  push('globe', {
    x: width * 0.045,
    y: height - globe * 0.82,
    width: globe,
    height: globe
    /* No parallax: see the note above. The sky moves; the ground does not. */
  }, {
    name: 'zoom-in',
    delay: startOf(TIMING.globeIn),
    duration: TIMING.globeIn,
    easing: 'ease-out'
  });

  /* ------------------------------------------------ the aeroplane, and its trail */

  const planeH = height * 0.26;
  /* The artwork is 640x260. */
  const planeW = planeH * (640 / 260);

  /* Stopping a little left of centre, which leaves the right-hand side for
     the line of text that fades in there. */
  const planeX = width * 0.44 - planeW / 2;
  const planeY = height * 0.20;

  const flightAt = startOf(TIMING.flight);

  /* The aircraft comes to rest, and only then does anything speak. */
  pause(TIMING.settle);

  /*
   * THE STREAK IS ON THE AIRCRAFT'S RIGHT, which is where it has come from,
   * and overlaps its tail. It reaches off the edge of the frame and is
   * clipped there - a wake that stops neatly inside the picture is a wake
   * with an end, which is not what a wake has.
   */
  const trailH = planeH * 0.46;
  const trailW = planeW * 1.5;

  push('trail', {
    x: planeX + planeW * 0.92,
    y: planeY + planeH * 0.42,
    width: trailW,
    height: trailH
  }, {
    name: 'trailing-right',
    delay: flightAt,
    duration: TIMING.flight,
    easing: 'ease-out'
  });

  push('plane', {
    x: planeX,
    y: planeY,
    width: planeW,
    height: planeH
    /* No parallax: the aeroplane holds its place. Only the sky moves. */
  }, {
    name: 'fly-in-right',
    delay: flightAt,
    duration: TIMING.flight,
    /* What makes it DECELERATE to a stop rather than arrive at full speed. */
    easing: 'ease-out'
  });

  /* ------------------------------------------------------------ the words */

  /*
   * BENEATH THE AEROPLANE, CENTRED ON IT, once it has stopped. The box is as
   * wide as the aircraft and a half, and as tall as that width divided by the
   * artwork's own shape - which is what stops a `contain` from leaving the
   * wordmark small in a band of nothing.
   */
  const nameW = planeW * 1.5;

  push('name', {
    x: planeX + planeW / 2 - nameW / 2,
    y: planeY + planeH + height * 0.06,
    width: nameW,
    height: nameW / WORDMARK.name
  }, {
    name: 'slide-bottom',
    delay: startOf(TIMING.nameIn),
    duration: TIMING.nameIn,
    easing: 'ease-out'
  });

  /* To the right of the aircraft, level with it. */
  const lineW = width * 0.3;

  push('tagline', {
    x: planeX + planeW + width * 0.02,
    y: planeY + planeH * 0.3,
    width: lineW,
    height: lineW / WORDMARK.tagline
  }, {
    name: 'fade-in',
    delay: startOf(TIMING.lineIn),
    duration: TIMING.lineIn
  });

  return layers;
}
