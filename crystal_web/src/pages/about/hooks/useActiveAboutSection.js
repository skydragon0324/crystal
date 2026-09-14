import { useEffect, useState } from 'react';
import { ABOUT_SECTIONS, OBSERVER_MARGIN } from '../constants';

/**
 * WHICH CHAPTER IS BEING READ.
 *
 * An IntersectionObserver rather than a scroll handler: the question is
 * "which of ten boxes is in this band of the viewport", the browser already
 * knows the answer, and a scroll listener recomputing it would read the
 * layout of ten elements on every frame of every scroll.
 *
 * THE OBSERVER REPORTS CHANGES, NOT STATE, which is the part that is easy to
 * get wrong: a callback fires with the entries that CROSSED the boundary, so
 * the section the reader is in the middle of - which crossed a long time ago
 * and has not moved since - is not in it. Deciding from the callback's own
 * entries alone leaves the highlight stuck on whichever chapter last happened
 * to cross.
 *
 * So every entry's state is kept, and the active chapter is the first one
 * currently intersecting IN PAGE ORDER. That also settles the overlap: the
 * band is deep enough that two chapters can be in it at once, and the earlier
 * one is the one being read.
 */
export default function useActiveAboutSection(ready) {
  const [active, setActive] = useState(ABOUT_SECTIONS[0].id);

  useEffect(() => {
    /*
     * Nothing to observe until the sections are on the page. `ready` is what
     * the page passes once its data has arrived - observing beforehand would
     * bind to elements that are about to be replaced.
     */
    if (!ready) return undefined;
    if (typeof window.IntersectionObserver !== 'function') return undefined;

    const visible = {};

    const observer = new window.IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        visible[entry.target.id] = entry.isIntersecting;
      });

      const current = ABOUT_SECTIONS.filter(function (section) {
        return visible[section.id];
      })[0];

      if (current) setActive(current.id);
    }, {
      root: null,
      rootMargin: OBSERVER_MARGIN,
      threshold: 0
    });

    const watched = [];
    ABOUT_SECTIONS.forEach(function (section) {
      const element = document.getElementById(section.id);
      if (element) {
        observer.observe(element);
        watched.push(element);
      }
    });

    return function () {
      watched.forEach(function (element) { observer.unobserve(element); });
      observer.disconnect();
    };
  }, [ready]);

  return [active, setActive];
}
