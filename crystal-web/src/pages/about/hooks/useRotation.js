import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * SOMETHING THAT ADVANCES ON ITS OWN, AND KNOWS WHEN NOT TO.
 *
 * Two chapters of this page show a set that moves by itself - the
 * certificates, and the technologies - and both need the same half-dozen
 * rules about when it should stop. Written twice they drift: one of them
 * keeps running behind a dialog, or forgets the reader who asked their system
 * for less motion, and nobody notices because the page looks right.
 *
 * IT STOPS FOR ALL OF THESE:
 *
 *   REDUCED MOTION, in which case it never starts at all. Somebody who asked
 *   for less movement is not asking for slower movement.
 *
 *   A HELD POINTER OR KEYBOARD, which is a reader looking at one of them.
 *   Moving the thing somebody is reading is the oldest carousel mistake.
 *
 *   A BACKGROUND TAB. The timer still fires there - browsers throttle it, they
 *   do not stop it - so the check is made when it fires rather than trusted to
 *   the clock.
 *
 *   A COUNT IT CANNOT MOVE THROUGH. One item is not a rotation.
 *
 * `held` is the caller's own reason to stop: a dialog open over the row, a
 * pointer on it, a video playing. Several reasons OR together at the call.
 *
 * @param count     how many positions there are
 * @param interval  milliseconds between moves
 * @param held      true while the caller wants it still
 * @returns { index, setIndex, step, animated }
 */
export default function useRotation(count, interval, held) {
  const [index, setIndex] = useState(0);

  /*
   * Read once, into a ref: it is a browser setting rather than state, it
   * cannot change between renders in any way worth re-rendering for, and in
   * a render it would be read before the effects have run.
   */
  const reduced = useRef(false);
  useEffect(() => {
    reduced.current = !!(window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  /* A set that shrinks - a narrower screen, fewer items - leaves the index
     past its end, which would show an empty frame. */
  useEffect(() => {
    setIndex((current) => (current >= count ? 0 : current));
  }, [count]);

  const step = useCallback((by) => {
    setIndex((current) => {
      if (count < 1) return 0;
      const next = current + by;
      /* Round, in both directions: the last goes to the first. */
      if (next >= count) return 0;
      if (next < 0) return count - 1;
      return next;
    });
  }, [count]);

  const moving = count > 1 && !held && !reduced.current;

  useEffect(() => {
    if (!moving) return undefined;

    const timer = setInterval(function () {
      if (document.hidden) return;
      step(1);
    }, interval);

    return () => clearInterval(timer);
  }, [moving, interval, step]);

  return {
    index: index,
    setIndex: setIndex,
    step: step,
    /* Whether the caller should animate the change at all. */
    animated: !reduced.current
  };
}
