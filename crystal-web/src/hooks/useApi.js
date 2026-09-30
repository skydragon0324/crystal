import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Loads one thing.
 *
 * `deps` behaves like useEffect's: change the slug and it refetches. The
 * mounted ref guards against setting state after the component has gone,
 * which is the usual cause of the "can't perform a React state update on an
 * unmounted component" warning when someone navigates during a fetch.
 */
export function useApi(loader, deps) {
  const [data, setData] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loader();
      if (!mounted.current) return null;
      setData(result.data);
      setMeta(result.meta || null);
      return result.data;
    } catch (err) {
      if (mounted.current) setError(err.message);
      return null;
    } finally {
      if (mounted.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps || []);

  useEffect(() => {
    load();
  }, [load]);

  return { data, setData, meta, loading, error, reload: load };
}

/**
 * Loads a paged list and keeps the previous rows on screen while the next
 * page is in flight.
 *
 * The `requestId` guard drops a stale response: typing in a search box fires
 * several requests and they can come back out of order, and without the guard
 * the slowest one wins.
 *
 * Rows are NOT cleared while refetching - blanking a list on every keystroke
 * makes the page flicker and loses the reader's place.
 */
export function useList(fetcher, options) {
  const opts = options || {};
  const [params, setParams] = useState(opts.initialParams || { page: 1, limit: 12 });
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const requestId = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const active = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher(params);
      if (!mounted.current || active !== requestId.current) return;
      /*
       * A list reply is { rows, total, page, limit, summary } inside `data`.
       *
       * The paging travels WITH the rows rather than in a separate envelope
       * key, so it is lifted out here - once - instead of every screen
       * knowing the shape.  Endpoints that answer a plain array (the ones
       * with nothing to page) still work, which is why the Array check comes
       * first.
       */
      const payload = result.data;

      if (Array.isArray(payload)) {
        setRows(payload);
        setMeta(null);
      } else {
        setRows((payload && payload.rows) || []);
        setMeta(payload ? {
          total: payload.total,
          page: payload.page,
          limit: payload.limit,
          totalPages: payload.limit ? Math.max(1, Math.ceil(payload.total / payload.limit)) : 1,
          summary: payload.summary || null
        } : null);
      }
    } catch (err) {
      if (mounted.current && active === requestId.current) setError(err.message);
    } finally {
      if (mounted.current && active === requestId.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    load();
  }, [load]);

  /** A filter change returns to page 1 - staying on page 7 of a now
   *  two-page result set shows an empty list. */
  const setFilter = useCallback((patch) => {
    setParams((current) => ({ ...current, ...patch, page: 1 }));
  }, []);

  const setPage = useCallback((page) => {
    setParams((current) => ({ ...current, page }));
  }, []);

  /**
   * HOW MANY ROWS AT A TIME, and it goes back to page ONE.
   *
   * Not for the same reason a filter does. A filter can shorten the result
   * set until the current page no longer exists; changing the size does not
   * remove any rows, it RENUMBERS them - page 4 of 10-at-a-time holds rows
   * 31-40, and page 4 of 50-at-a-time holds rows 151-200, which the reader
   * has never seen and did not ask for. Staying on "page 4" through a resize
   * is the one behaviour that is certainly wrong, and it is also the one you
   * get for free by doing nothing.
   *
   * Going to the top is the honest answer: the first row of the new page one
   * is the first row of the list, which is where every reader can find
   * themselves again.
   */
  const setLimit = useCallback((limit) => {
    const size = Number(limit);
    setParams((current) => (
      size > 0 ? { ...current, limit: size, page: 1 } : current
    ));
  }, []);

  /**
   * Sorting is server-side, and the API spells it `?sort=&dir=` - the same
   * two parameters everywhere, read by one helper on the server.  A table
   * column names the API field it sorts on, so nothing here translates.
   */
  const setSort = useCallback((sort, dir) => {
    setParams((current) => ({ ...current, sort, dir, page: 1 }));
  }, []);

  /**
   * ONE ROW CHANGED, so ONE ROW IS REDRAWN - no request, no spinner.
   *
   * For the case where the screen ALREADY KNOWS what the server did. Opening a
   * feedback thread marks it read; the row's only stale field is `is_read`,
   * and `reload()` was being used to pick that up. That is a round trip to
   * re-fetch ten rows in order to change one boolean on one of them, and it
   * sets `loading` on the way, so the whole table dims and redraws while the
   * member is reading the drawer that opened on top of it. On a slow
   * connection the answer can arrive after they have closed the drawer, so
   * the list appears to flicker for no reason at all.
   *
   * Rows are matched by `id` and the others are returned BY REFERENCE, so
   * every untouched row is `===` what it was - which is what lets a memoised
   * row component skip re-rendering rather than merely re-rendering to the
   * same output.
   *
   * This is not a replacement for `reload`: use it when the change is known
   * and local. Anything that reorders the list, changes the total, or that
   * the server may have done differently than expected still needs the
   * server's answer.
   */
  const patchRow = useCallback((id, patch) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }, []);

  return {
    rows, meta, params, loading, error,
    setParams, setFilter, setPage, setLimit, setSort, patchRow, reload: load
  };
}

/** Debounces a value, so a search box does not fire per keystroke. */
export function useDebounced(value, delay) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay === undefined ? 300 : delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
