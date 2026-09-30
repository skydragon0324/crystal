import { useEffect, useRef, useState } from 'react';

import { envelopeKey } from '@/security/verifyContent';
import { STATES } from '@/security/verifySignature';
import { useVerifier } from './SecurityProvider';

/**
 * THE FOUR STATES, AS HOOKS.
 *
 *   checking   the answer is not in yet - nothing of the content is shown
 *   verified   `content` is the SIGNED content, rebuilt field by field from
 *              the envelope; it is what a component renders, never the row
 *   invalid    not what was signed, or not signed by a trusted key
 *   error      could not be checked (no WebCrypto, a failed download)
 *
 * Invalid and error look the same to a visitor, and the reason goes to the
 * console - once per envelope, not once per render.
 *
 * KEYED BY THE ENVELOPE'S TEXT, not by object identity. A list re-fetched
 * with identical data is identical envelopes and nothing is re-checked; a
 * single changed character is a new key, and the component is back to
 * `checking` on that very render - the previous item's verified content is
 * never shown against the next item's envelope, not even for a frame.
 *
 * `expect` names row fields that must AGREE with the signed content - the
 * notice id a list is keyed by, the storage path a row points at. Rendering
 * happens from the signed content either way; a disagreement means an
 * envelope was attached to the wrong row, and that is refused rather than
 * drawn under the row's name.
 */

export const CHECKING = Object.freeze({ state: STATES.CHECKING, content: null, reason: null });

const NO_RESULTS = Object.freeze([]);

const reported = new Set();

/** One console line per failing envelope for the life of the page. */
export function reportUnverified(label, key, result) {
  if (!result || result.state === STATES.VERIFIED || result.state === STATES.CHECKING) return;
  if (reported.has(key)) return;
  reported.add(key);
  if (reported.size > 1000) reported.clear();

  const line = '[content-integrity] ' + label + ' was not shown (' + result.state + '): ' + result.reason;
  /* eslint-disable no-console */
  if (result.state === STATES.ERROR) console.error(line);
  else console.warn(line);
  /* eslint-enable no-console */
}

/** A row value and a signed value, compared the way ids travel: 12, "12" and 12n agree; null and undefined agree. */
function agrees(signed, row) {
  const a = signed === null || signed === undefined ? null : String(signed);
  const b = row === null || row === undefined ? null : String(row);
  return a === b;
}

export function applyExpectations(result, expect) {
  if (!result || result.state !== STATES.VERIFIED || !expect) return result;

  const fields = Object.keys(expect);
  for (let i = 0; i < fields.length; i += 1) {
    const field = fields[i];
    if (!agrees(result.content[field], expect[field])) {
      return {
        state: STATES.INVALID,
        content: null,
        reason: 'the row\'s ' + field + ' (' + JSON.stringify(expect[field]) + ') disagrees with the signed '
          + field + ' (' + JSON.stringify(result.content[field]) + ')'
      };
    }
  }
  return result;
}

function labelOf(type, integrity) {
  const content = integrity && integrity.content;
  if (!content) return type;
  if (content.id !== undefined) return type + ' ' + content.id;
  if (content.storageKey !== undefined) return type + ' ' + content.storageKey;
  return type;
}

/**
 * One signed text item.
 *
 * @returns {{ state, content, reason }}
 */
export function useVerifiedContent(type, integrity, expect) {
  const verifier = useVerifier();
  const key = envelopeKey(type, integrity) + '\n' + JSON.stringify(expect || null);

  const latest = useRef(null);
  latest.current = { type: type, integrity: integrity, expect: expect };

  /*
   * An answer already in the cache is used on the FIRST render, so the same
   * notice opening in the dialog after the page has checked it does not
   * flash a skeleton first.
   */
  const [result, setResult] = useState(() => {
    const known = verifier.peekText(type, integrity);
    return known ? Object.assign({ key: key }, applyExpectations(known, expect)) : null;
  });

  useEffect(() => {
    let live = true;
    const ask = latest.current;

    verifier.verifyText(ask.type, ask.integrity).then((answer) => {
      if (!live) return;
      const judged = applyExpectations(answer, ask.expect);
      reportUnverified(labelOf(ask.type, ask.integrity), key, judged);
      setResult(Object.assign({ key: key }, judged));
    });

    return () => { live = false; };
  }, [verifier, key]);

  if (result && result.key === key) return result;

  /* A different envelope from the last answer: a cached answer for THIS one, or checking. */
  const known = verifier.peekText(type, integrity);
  return known ? applyExpectations(known, expect) : CHECKING;
}

/**
 * A LIST of signed text items, for the places that have to decide about all
 * of them together - the day's notices, which the arrival dialog must not
 * open on, the notification page must not draw and the bell must not count
 * until it is known which of them may be shown (useListedNotices).
 *
 * @param items          the rows
 * @param options.type   the signed type
 * @param options.expect row -> { field: value } that must agree, optional
 * @returns {{ settled: boolean, results: Array<{state, content, reason}> }}
 */
export function useVerifiedContentList(items, options) {
  const verifier = useVerifier();
  const list = items || [];
  const type = options.type;
  const expectOf = options.expect || (() => null);

  const keys = list.map((row) => envelopeKey(type, row ? row.integrity : null) + '\n' + JSON.stringify(expectOf(row) || null));
  const key = keys.join('\u0000');

  const latest = useRef(null);
  latest.current = { list: list, expectOf: expectOf, keys: keys };

  const [state, setState] = useState({ key: null, results: [] });

  useEffect(() => {
    let live = true;
    const ask = latest.current;

    Promise.all(ask.list.map((row, index) =>
      verifier.verifyText(type, row ? row.integrity : null).then((answer) => {
        const judged = applyExpectations(answer, ask.expectOf(row));
        reportUnverified(labelOf(type, row ? row.integrity : null), ask.keys[index], judged);
        return judged;
      })
    )).then((results) => {
      if (live) setState({ key: key, results: results });
    });

    return () => { live = false; };
  }, [verifier, key, type]);

  if (state.key === key) return { settled: true, results: state.results };

  /*
   * Every item already answered - the notification page checked today's
   * notices before the dialog asked - is settled on THIS render, rather than
   * one effect and one promise later.
   */
  const known = list.map((row) => verifier.peekText(type, row ? row.integrity : null));
  if (known.every(Boolean)) {
    return { settled: true, results: known.map((answer, index) => applyExpectations(answer, expectOf(list[index]))) };
  }

  return { settled: false, results: list.map(() => CHECKING) };
}

/**
 * Makes an object URL from a verified Blob - the ONLY place one is made.
 *
 * Returns null when the browser cannot (jsdom has no createObjectURL), which
 * the callers treat as an error rather than falling back to the plain URL.
 */
function objectUrlFor(blob) {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
  return URL.createObjectURL(blob);
}

function revoke(url) {
  if (url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url);
  }
}

function imageKey(integrity, expectedPath) {
  return envelopeKey('image', integrity) + '\n' + JSON.stringify(expectedPath === undefined ? null : expectedPath);
}

function settleImage(answer, blobUrl) {
  if (answer.state !== STATES.VERIFIED) {
    return { state: answer.state, content: null, url: null, reason: answer.reason };
  }
  if (!blobUrl) {
    return { state: STATES.ERROR, content: null, url: null, reason: 'this browser cannot create object URLs' };
  }
  return { state: STATES.VERIFIED, content: answer.content, url: blobUrl, reason: null };
}

/**
 * One signed image.
 *
 * THE OBJECT URL BELONGS TO THIS HOOK. It is created only after every check
 * has passed, and revoked in the effect's cleanup - which React runs both
 * when the component unmounts and before the effect runs again for a
 * different source. Nothing else revokes it, so nothing else can pull a
 * picture out from under a component still showing it.
 *
 * @param integrity              the image envelope
 * @param options.expectedPath   the path the row names, when it names one
 * @returns {{ state, content, url, reason }}
 */
export function useVerifiedImage(integrity, options) {
  const verifier = useVerifier();
  const expectedPath = options ? options.expectedPath : undefined;
  const key = imageKey(integrity, expectedPath);

  const latest = useRef(null);
  latest.current = { integrity: integrity, expectedPath: expectedPath };

  const [result, setResult] = useState({ key: null });

  useEffect(() => {
    let live = true;
    let url = null;
    let ownedUrl = null;
    const ask = latest.current;

    verifier.verifyImage(ask.integrity, { expectedPath: ask.expectedPath }).then((answer) => {
      if (!live) return;
      if (answer.state === STATES.VERIFIED) {
        url = answer.directUrl || objectUrlFor(answer.blob);
        if (!answer.directUrl) ownedUrl = url;
      }

      const settled = settleImage(answer, url);
      reportUnverified(labelOf('image', ask.integrity), key, settled);
      setResult(Object.assign({ key: key }, settled));
    });

    return () => {
      live = false;
      revoke(ownedUrl);
    };
  }, [verifier, key]);

  return result.key === key ? result : Object.assign({ url: null }, CHECKING);
}

/**
 * SEVERAL signed images at once - a carousel's slides.
 *
 * One effect owns every object URL for the deck, and revokes all of them
 * together when the deck changes or goes away. Each slide is reported as it
 * settles, so a deck can start showing its first picture without waiting for
 * its last. The verifier's cache means the second of two identical decks
 * (the phone and the desktop layout of the same shots) downloads nothing.
 *
 * @param entries  [{ integrity, expectedPath }]
 * @returns Array<{ state, content, url, reason }>, aligned with entries
 */
export function useVerifiedImages(entries) {
  const verifier = useVerifier();
  const list = entries || [];
  const keys = list.map((entry) => imageKey(entry ? entry.integrity : null, entry ? entry.expectedPath : undefined));
  const key = keys.join('\u0000');

  const latest = useRef(null);
  latest.current = { list: list, keys: keys };

  const [state, setState] = useState({ key: null, results: [] });

  useEffect(() => {
    /* No pictures, nothing to own - and no state update for a carousel that verifies nothing. */
    if (!latest.current.list.length) return undefined;

    let live = true;
    const urls = [];
    const ask = latest.current;
    const results = ask.list.map(() => CHECKING);

    setState({ key: key, results: results.slice() });

    ask.list.forEach((entry, index) => {
      verifier.verifyImage(entry ? entry.integrity : null, { expectedPath: entry ? entry.expectedPath : undefined })
        .then((answer) => {
          if (!live) return;

          let url = null;
          if (answer.state === STATES.VERIFIED) {
            url = answer.directUrl || objectUrlFor(answer.blob);
            if (url && !answer.directUrl) urls.push(url);
          }

          results[index] = settleImage(answer, url);
          reportUnverified(labelOf('image', entry ? entry.integrity : null), ask.keys[index], results[index]);
          setState({ key: key, results: results.slice() });
        });
    });

    return () => {
      live = false;
      urls.forEach(revoke);
    };
  }, [verifier, key]);

  if (!list.length) return NO_RESULTS;
  return state.key === key ? state.results : list.map(() => Object.assign({ url: null }, CHECKING));
}
