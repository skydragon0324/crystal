import { useEffect, useRef, useState } from 'react';

/**
 * A LOOKUP PAYLOAD THAT IS AN OBJECT, NOT A LIST.
 *
 * `useOptions` exists for a <Select>: it coerces whatever the endpoint
 * answered into an array - `Array.isArray(data) ? data : data.rows || []` -
 * because every one of its callers is about to `.map` over it.
 *
 * The `/meta` endpoints are not lists. They answer a DICTIONARY:
 *
 *   { status: { 0: 'Draft', 1: 'Submitted', ... }, flow: { 0: [1, 9], ... } }
 *
 * Four screens read one through `useOptions` anyway - repair tickets, the
 * ticket detail, replenishments and warranty claims - and that coercion threw
 * it away: not an array, no `rows`, so every one of them got `[]` and every
 * status word they were meant to show came out as the raw code. The claims
 * "Move to" menu offered "1", "2", "3", "9"; the status column showed a
 * number where a word belongs.
 *
 * So this returns the payload AS IT WAS SENT, with `{}` until it arrives and
 * `{}` if it fails - so a caller can read `meta.status[code]` on the first
 * render without a guard, and a failed lookup degrades to the code rather
 * than to a crash.
 *
 * Loaded once per mount, like useOptions: these dictionaries change when
 * somebody deploys, not while somebody is looking at a screen.
 */
export default function useMeta(loader, deps) {
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.resolve()
      .then(loader)
      .then(({ data }) => {
        if (cancelled || !mounted.current) return;
        /* An array is not a dictionary: a caller asking for one and getting a
           list has a different problem, and silently keeping it would hide it. */
        setMeta(data && !Array.isArray(data) && typeof data === 'object' ? data : {});
      })
      .catch(() => { if (!cancelled && mounted.current) setMeta({}); })
      .finally(() => { if (!cancelled && mounted.current) setLoading(false); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps || []);

  return { meta, loading };
}
