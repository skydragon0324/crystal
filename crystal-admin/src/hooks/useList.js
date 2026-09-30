import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A paged, filtered, sorted list.
 *
 * The `requestId` guard drops a stale response: typing in a search box fires
 * several requests and they can come back out of order, and without the guard
 * the slowest one wins.
 *
 * Rows are NOT cleared while refetching - blanking a table on every keystroke
 * makes the page jump and loses the reader's place.
 */
export default function useList(fetcher, initialParams) {
  const [params, setParams] = useState(initialParams || { page: 1, limit: 20 });
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const requestId = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const load = useCallback(async () => {
    const active = ++requestId.current;
    setLoading(true);
    setError(null);

    try {
      const { data } = await fetcher(params);
      if (!mounted.current || active !== requestId.current) return;

      setRows((data && data.rows) || []);
      setTotal((data && data.total) || 0);
      setSummary((data && data.summary) || null);
    } catch (err) {
      if (mounted.current && active === requestId.current) setError(err.message);
    } finally {
      if (mounted.current && active === requestId.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => { load(); }, [load]);

  /** A filter change returns to page 1 - staying on page 7 of a now
   *  two-page result set shows an empty table. */
  const setFilter = useCallback((patch) => {
    setParams((current) => ({ ...current, ...patch, page: 1 }));
  }, []);

  const setPage = useCallback((page) => {
    setParams((current) => ({ ...current, page }));
  }, []);

  /** Clicking the same column again flips the direction. */
  const setSort = useCallback((sort) => {
    setParams((current) => ({
      ...current,
      sort,
      dir: current.sort === sort && current.dir === 'asc' ? 'desc' : 'asc',
      page: 1
    }));
  }, []);

  /**
   * ONE ROW CHANGED, WITHOUT REFETCHING THE PAGE.
   *
   * For the case where the screen already knows what changed and a round trip
   * would only be able to agree with it - opening a feedback thread marks it
   * read, and the only visible consequence is that row's unread dot.
   *
   * Reloading for that costs a request, a spinner, and - on any list ordered
   * by something the write touched - a list that reorders itself under the
   * reader the moment they click a row. Patching in place changes the one
   * thing that changed and leaves everything else exactly where it was.
   */
  const patchRow = useCallback((key, patch, keyField) => {
    const field = keyField || 'id';
    setRows((current) => current.map((row) => (
      String(row[field]) === String(key) ? Object.assign({}, row, patch) : row
    )));
  }, []);

  return {
    rows, total, summary, loading, error,
    params, setParams, setFilter, setPage, setSort,
    patchRow,
    reload: load
  };
}
