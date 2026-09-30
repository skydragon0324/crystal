import { useEffect, useRef, useState } from 'react';

/**
 * The unpaged lookup a <Select> needs.
 *
 * Loaded once per mount and kept, because these are the tables that change
 * about once a quarter - service centres, parts, categories - and refetching
 * them on every render of a form would be a round trip per keystroke in the
 * field next to it.
 */
export default function useOptions(loader, deps) {
  const [options, setOptions] = useState([]);
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
        // An options endpoint answers a plain array; a paged one answers rows.
        setOptions(Array.isArray(data) ? data : (data && data.rows) || []);
      })
      .catch(() => { if (!cancelled && mounted.current) setOptions([]); })
      .finally(() => { if (!cancelled && mounted.current) setLoading(false); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps || []);

  return { options, loading };
}
