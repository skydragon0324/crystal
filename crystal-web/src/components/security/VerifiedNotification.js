import { STATES } from '@/security/verifySignature';
import { useVerifiedContent, useVerifiedContentList } from './hooks';

/**
 * A SITE NOTICE, shown only as its signature says it was written.
 *
 * WHAT IS SIGNED AND WHAT IS NOT. The title, the HTML body, the window, the
 * status, the order and the origin's ID are all inside the signature. The
 * origin's NAME and COLOUR are not - they are a join into notice_origins, a
 * label owned by another table - so they are drawn from the row, and only
 * beside a notice whose signed originId is the one the row was joined on. A
 * row joined to a different origin than the one signed is refused outright:
 * a genuine announcement under somebody else's name is exactly the kind of
 * change a signature is for.
 *
 * VERIFIED IS NOT SAFE. The body is HTML, and it reaches the page through
 * NoticeBody, which sanitises it against an allow-list (security/sanitizeHtml)
 * - after verification, never instead of it.
 *
 * A NOTICE THAT DOES NOT VERIFY IS NOT LISTED ANYWHERE - see useListedNotices.
 */

/** Row fields that must agree with the signed content. */
export function noticeExpectations(row) {
  if (!row) return null;
  const expect = { id: row.id };
  if (Object.prototype.hasOwnProperty.call(row, 'origin_id')) expect.originId = row.origin_id;
  return expect;
}

/**
 * The shape NoticeContent's pieces draw, built from the SIGNED content. The
 * three origin_ fields are the unsigned label described above.
 */
export function noticeFromSigned(row, content) {
  return {
    id: content.id,
    title: content.title,
    content: content.content,
    status: content.status,
    starts_at: content.startsAt,
    ends_at: content.endsAt,
    sort_order: content.sortOrder,
    origin_id: content.originId,
    origin_code: row ? row.origin_code : null,
    origin_name: row ? row.origin_name : null,
    origin_colour: row ? row.origin_colour : null
  };
}

/** One notice: `{ state, reason, notice }`, where `notice` is null until it has verified. */
export function useVerifiedNotice(row) {
  const result = useVerifiedContent('notification', row ? row.integrity : null, noticeExpectations(row));
  return {
    state: result.state,
    reason: result.reason,
    notice: result.state === STATES.VERIFIED ? noticeFromSigned(row, result.content) : null
  };
}

/**
 * Every notice in a list, answered together.
 *
 * @returns {{ settled: boolean, entries: Array<{ row, state, reason, notice }> }}
 */
export function useVerifiedNotices(rows) {
  const list = rows || [];
  const verified = useVerifiedContentList(list, { type: 'notification', expect: noticeExpectations });

  return {
    settled: verified.settled,
    entries: list.map((row, index) => {
      const result = verified.results[index];
      return {
        row: row,
        state: result.state,
        reason: result.reason,
        notice: result.state === STATES.VERIFIED ? noticeFromSigned(row, result.content) : null
      };
    })
  };
}

/**
 * THE NOTICES OF A LIST THAT MAY BE SHOWN: the ones that verified, built from
 * their signatures, in the order the list arrived in.
 *
 * One rule for every place that lists notices - the arrival dialog, the
 * notification page, and the bell that counts what the page holds. A notice
 * that did not verify is simply not in `notices`. It is not drawn with "could
 * not be verified" where its words would be, because a visitor can do nothing
 * about a signature, and a card that says only that is noise on the one page
 * that exists to be read; the reason is in the console for whoever can act on
 * it. The bell does not count it, so the number on the bell is never one the
 * page cannot show.
 *
 * `notices` stays EMPTY until `settled`. A caller shows its loading state
 * until then, rather than cards that are about to disappear or a count that
 * is about to drop.
 *
 * @returns {{ settled: boolean, notices: Array }}
 */
export function useListedNotices(rows) {
  const verification = useVerifiedNotices(rows);

  return {
    settled: verification.settled,
    notices: verification.settled
      ? verification.entries.filter((entry) => entry.notice).map((entry) => entry.notice)
      : []
  };
}

/**
 * Render-prop form, for a caller that lays the title, the badge and the body
 * out in different places: `children({ state, reason, notice })`.
 */
export default function VerifiedNotification({ notice, children }) {
  const verified = useVerifiedNotice(notice);
  return children(verified);
}
