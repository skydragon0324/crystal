/**
 * Scrolling, on a browser that may not do it itself.
 *
 * `scrollTo({ behavior: 'smooth' })` landed in Chrome 61, so it is there on
 * the 72 this site targets - but it is NOT there on every browser the site is
 * opened in, and a missing `behavior` is ignored silently rather than
 * throwing: the page jumps instead of gliding, which is a worse failure than
 * it sounds on a page whose whole navigation is anchors.
 *
 * So the capability is tested once and animated by hand when it is absent.
 * That is a dozen lines and no dependency, which is the trade the
 * specification asks for.
 */

/** Whether the browser understands the options form of scrollTo. */
function supportsSmooth() {
  let supported = false;
  try {
    const options = Object.defineProperty({}, 'behavior', {
      get: function () { supported = true; return 'smooth'; }
    });
    window.scrollTo(options);
  } catch (err) {
    supported = false;
  }
  return supported;
}

/** Ease in and out, so the travel starts and stops rather than snapping. */
function ease(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const DURATION = 420;

function animateTo(top) {
  const from = window.pageYOffset;
  const distance = top - from;
  const started = Date.now();

  const step = function () {
    const elapsed = Date.now() - started;
    const progress = Math.min(1, elapsed / DURATION);

    window.scrollTo(0, from + distance * ease(progress));
    if (progress < 1) window.requestAnimationFrame(step);
  };

  window.requestAnimationFrame(step);
}

/**
 * Puts a section under the sticky bars rather than under the top of the
 * window.
 *
 * `offset` is what the two fixed bars take up. Without it every anchor lands
 * with its heading hidden behind the navigator that was used to reach it.
 */
export function scrollToSection(id, offset) {
  const target = document.getElementById(id);
  if (!target) return;

  const top = Math.max(0, target.getBoundingClientRect().top + window.pageYOffset - (offset || 0));

  /*
   * Somebody who has asked their system not to animate things gets the jump,
   * and it is the right answer for them rather than a lesser one.
   */
  const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (still) {
    window.scrollTo(0, top);
    return;
  }

  if (!supportsSmooth()) {
    animateTo(top);
    return;
  }

  window.scrollTo({ top: top, behavior: 'smooth' });
}

/**
 * Writes the hash without moving the page.
 *
 * Assigning `location.hash` would scroll to the anchor itself - ignoring the
 * offset the scroll above just applied - so the address bar is updated
 * through the history API instead, and the two do not fight.
 *
 * replaceState rather than pushState: scrolling through ten chapters would
 * otherwise put ten entries in the history and turn the back button into a
 * tour of the page somebody has just read.
 */
export function writeHash(id) {
  if (!window.history || !window.history.replaceState) return;
  window.history.replaceState(null, '', window.location.pathname + '#' + id);
}
