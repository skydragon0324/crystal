/**
 * THE OVERVIEW CHAPTER'S SCENE: a sky, clouds, a globe, and an aeroplane
 * arriving.
 *
 * WHY THIS IS CODE AND NOT DATA. Every other picture on this page is a row in
 * images.js, and the three-layer mock this replaced had its geometry there
 * too - a fixed x, y, width and height per layer. That works for one frame
 * shape and this chapter has two: 16:9 on a phone and 16:5 on a desktop, which
 * are not the same picture at two sizes. They are different pictures.
 *
 * TWO LAYOUTS, WRITTEN OUT, and that is the point of LAYOUT below.
 *
 * One set of fractions used to serve both, which looked principled and was
 * not: because the frames differ by nearly two to one in height, the same
 * numbers gave the aeroplane 36% of the width on a phone and 20% on a desktop,
 * and the globe three fifths of the height on one and four fifths on the
 * other. Those differences were real and nobody had chosen them.
 *
 * So each shape states its own sizes and positions. Every number is a
 * fraction, and SIZES ARE FRACTIONS OF THE WIDTH rather than the height -
 * the width is the same 1200 in both, so 0.20 and 0.42 can be compared at a
 * glance, which is the whole reason for tuning them separately.
 *
 * WHAT HAPPENS, IN ORDER:
 *
 *   the sky          the plate, still - and there are TWO of these, one cut
 *                    for each frame shape, because `cover` on a single plate
 *                    makes the background a different picture at the two
 *                    widths. See TALL_FRAME.
 *   three clouds     drifting sideways for as long as the chapter is on
 *                    screen, and THE ONLY THING THAT LEANS WITH THE POINTER -
 *                    more for the near one than the far one, which is what
 *                    reads as depth
 *   the globe        settling in on the left, and then holding still
 *   the trail        a streak that arrives with the aircraft and dissipates
 *   the aeroplane    in from off the RIGHT of the frame, decelerating to a
 *                    stop left of centre
 *   the strapline    fading in to its right, once it has stopped
 *   the name         rising in beneath it, last - the thing the whole
 *                    sequence was leading to
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
 * THE TIMINGS ARE SHARED, and deliberately: the sequence is the same story on
 * both, so only the geometry is per-shape.
 */

/** The pieces, by the `role` their row in images.js carries. */
export const ROLES = [
  'sky', 'sky-mobile',
  'cloud-far', 'cloud-mid', 'cloud-near', 'globe', 'trail', 'plane', 'tagline', 'name'
];

/**
 * WHEN THE FRAME IS THE PHONE'S - which picks both the sky plate cut for it
 * and the layout written for it.
 *
 * The two shapes are 0.56 and 0.31 of height to width, so this sits well
 * clear of either and there is no frame either side of it that this chapter
 * is ever drawn in.
 */
const TALL_FRAME = 0.42;

/* How long each stage of the arrival takes. The same on both shapes. */
const TIMING = {
  globeIn: 900,
  flight: 1700,
  /* The pause between the aircraft stopping and anything speaking. */
  settle: 180,
  lineIn: 900,
  nameIn: 760
};

/*
 * HOW LONG THE WHOLE THING HOLDS before it plays again.
 *
 * The scene loops - every chapter picture does - and its own length is
 * otherwise the last thing to settle, which here is about four seconds. An
 * aeroplane landing every four seconds is a distraction next to the sentence
 * this chapter is actually about, so it holds the finished picture for most
 * of a cycle.
 */
export const OVERVIEW_MS = 14000;

/** The shapes the two wordmarks are drawn at - 900x140 and 640x110. */
const WORDMARK = {
  name: 900 / 140,
  tagline: 640 / 110
};

/** A cloud is drawn at roughly seven by three. */
const CLOUD_SHAPE = 3 / 7;

/**
 * THE TWO LAYOUTS.
 *
 * `size` and `x` are fractions of the WIDTH; `top` is a fraction of the
 * height. A cloud's `depth` is its parallax - how far it leans with the
 * pointer - and those are the same on both, because depth is depth.
 *
 *   WIDE is the desktop band at 16:5. There is little height to work with, so
 *   everything is small relative to the width and the clouds sit low.
 *
 *   TALL is the phone at 16:9. The viewport is physically narrow, so the
 *   aeroplane and the name are given a much larger share of the width - at
 *   the desktop's 20% the aircraft would be a detail on a handset - and the
 *   globe is sunk further down, out of the way of the wordmark.
 */
const LAYOUT = {
  wide: {
    clouds: [
      { width: 0.15, x: 0.05, top: 0.10, depth: 0.06 },
      /* Lifted clear of the wordmark below it, which reaches y 195 of 375. */
      { width: 0.20, x: 0.38, top: 0.22, depth: 0.13 },
      { width: 0.26, x: 0.70, top: 0.50, depth: 0.22 }
    ],
    globe: { size: 0.24, x: 0.045, top: 0.37 },
    plane: { width: 0.20, centre: 0.44, top: 0.20 },
    /* `gap` is the space under the aeroplane, as a fraction of the height. */
    name: { width: 0.30, gap: 0.06 },
    /* `gap` here is to the aeroplane's right, as a fraction of the width. */
    tagline: { width: 0.26, gap: 0.02, top: 0.30 }
  },

  tall: {
    clouds: [
      { width: 0.26, x: 0.04, top: 0.08, depth: 0.06 },
      /* Lifted clear of the wordmark below it, which reaches y 320 of 675. */
      { width: 0.32, x: 0.40, top: 0.21, depth: 0.13 },
      { width: 0.40, x: 0.58, top: 0.44, depth: 0.22 }
    ],
    globe: { size: 0.30, x: 0.05, top: 0.67 },
    plane: { width: 0.42, centre: 0.46, top: 0.12 },
    name: { width: 0.56, gap: 0.05 },
    tagline: { width: 0.30, gap: 0.02, top: 0.30 }
  }
};

/** Which layout a frame of this shape gets. Exported for the tests. */
export function layoutFor(width, height) {
  return height / width > TALL_FRAME ? LAYOUT.tall : LAYOUT.wide;
}

/** The three clouds, in the order they are stacked - far to near. */
const CLOUDS = ['cloud-far', 'cloud-mid', 'cloud-near'];

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

  const tall = height / width > TALL_FRAME;
  const place = tall ? LAYOUT.tall : LAYOUT.wide;

  /*
   * ONE CLOCK. `startOf` hands back the instant a stage begins and advances
   * past it; `pause` advances without starting anything, which is how the
   * aeroplane gets to come to a rest before anything speaks.
   */
  let clock = 0;
  const startOf = (ms) => {
    const start = clock;
    clock += ms;
    return start;
  };
  const pause = (ms) => { clock += ms; };

  const push = (role, box, animation, id) => {
    const picture = of(role);
    /* A piece that has not been drawn yet is left out, not drawn empty. */
    if (!picture) return;

    layers.push(Object.assign({
      id: id || role,
      type: 'image',
      src: picture.src,
      alt: picture.alt || '',
      z: layers.length + 1
    }, box, { animation: animation }));
  };

  /* ------------------------------------------------------------- the sky */

  /*
   * THE PLATE CUT FOR THIS FRAME, and the desktop one as the fallback: a
   * deployment that has only replaced the wide file still has a sky on a
   * phone, cropped, rather than no sky at all. Either way the layer is
   * called `sky`, because which FILE it came from is not something the rest
   * of the scene - or a test - should have to know.
   */
  const plate = (tall && pictures['sky-mobile']) ? 'sky-mobile' : 'sky';

  push(plate, { x: 0, y: 0, fit: 'cover' }, { name: 'none', duration: 400 }, 'sky');

  /* ---------------------------------------------------------- the clouds */

  CLOUDS.forEach(function (role, index) {
    const cloud = place.clouds[index];
    const w = width * cloud.width;

    push(role, {
      x: width * cloud.x,
      y: height * cloud.top,
      width: w,
      height: w * CLOUD_SHAPE,
      parallax: cloud.depth
    }, {
      name: 'drifting',
      /* Different periods, or three clouds move as one object. */
      duration: 9000 + index * 2600,
      easing: 'ease-in-out'
    });
  });

  /* ----------------------------------------------------------- the globe */

  /*
   * ON THE LEFT, SITTING LOW, with some of it below the frame: a globe
   * resting on the bottom edge reads as placed on something, which is what
   * keeps it from floating in the sky beside the aeroplane.
   */
  const globe = width * place.globe.size;

  push('globe', {
    x: width * place.globe.x,
    y: height * place.globe.top,
    width: globe,
    height: globe
    /* No parallax: see the note above. The sky moves; the ground does not. */
  }, {
    name: 'zoom-in',
    delay: startOf(TIMING.globeIn),
    duration: TIMING.globeIn,
    easing: 'ease-out'
  });

  /* ------------------------------------------- the aeroplane, and its trail */

  const planeW = width * place.plane.width;
  /* The artwork is 640x260. */
  const planeH = planeW * (260 / 640);

  const planeX = width * place.plane.centre - planeW / 2;
  const planeY = height * place.plane.top;

  const flightAt = startOf(TIMING.flight);

  /*
   * THE STREAK IS ON THE AIRCRAFT'S RIGHT, which is where it has come from,
   * and overlaps its tail. It reaches off the edge of the frame and is
   * clipped there - and where it does not reach the edge, the artwork fades
   * to nothing at that end, so it has no visible tip either way.
   */
  push('trail', {
    x: planeX + planeW * 0.92,
    y: planeY + planeH * 0.42,
    width: planeW * 1.5,
    height: planeH * 0.46
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

  /* The aircraft comes to rest, and only then does anything speak. */
  pause(TIMING.settle);

  /* ------------------------------------------------------------ the words */

  /*
   * THE STRAPLINE FIRST, to the right of the aircraft and level with it. It
   * is the shorter of the two and it fades rather than moves, so it reads as
   * the sky settling; the company's name then arrives under the aeroplane as
   * the thing the whole sequence was leading to.
   */
  const lineW = width * place.tagline.width;

  push('tagline', {
    x: planeX + planeW + width * place.tagline.gap,
    y: planeY + planeH * place.tagline.top,
    width: lineW,
    height: lineW / WORDMARK.tagline
  }, {
    name: 'fade-in',
    delay: startOf(TIMING.lineIn),
    duration: TIMING.lineIn
  });

  /*
   * THEN THE NAME, beneath the aeroplane and centred on it. Its box is as
   * tall as its width divided by the artwork's own shape, which is what stops
   * a `contain` from leaving the wordmark small in a band of nothing.
   */
  const nameW = width * place.name.width;

  push('name', {
    x: planeX + planeW / 2 - nameW / 2,
    y: planeY + planeH + height * place.name.gap,
    width: nameW,
    height: nameW / WORDMARK.name
  }, {
    name: 'slide-bottom',
    delay: startOf(TIMING.nameIn),
    duration: TIMING.nameIn,
    easing: 'ease-out'
  });

  return layers;
}
