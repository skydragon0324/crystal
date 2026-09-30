import { STATES } from '@/security/verifySignature';
import { useVerifiedContent } from './hooks';

/**
 * A QUESTION AND ITS ANSWER, shown only as signed.
 *
 * The question, the answer, the category it is filed under, its order and
 * its status are all signed. `view_count` is NOT: it
 * changes on every read, so no signature could ever keep up with it. A page
 * that shows how often a question is read takes that number from the row, as
 * a separate, unsigned figure - and never shows it in place of anything the
 * signature covers.
 *
 * A RENDER PROP, because the two places a question appears lay it out
 * differently: the FAQ page as an accordion item (question in the button,
 * answer in the panel), the landing page as a card. Each is given
 * `{ state, reason, faq }` - `faq` null until it has verified - and draws the
 * neutral state in its own shape, so an accordion keeps one item per row and
 * `?open=` still points at the right one.
 */

/*
 * The row as the existing pages read it, with every field taken from the
 * signature. There is no view_count on it: a page that shows the counter
 * reads it from the row itself, where it is visibly the unsigned figure.
 */
export function faqFromSigned(content) {
  return {
    id: content.id,
    category: content.category,
    question: content.question,
    answer: content.answer,
    sort_order: content.sortOrder,
    status: content.status
  };
}

export function useVerifiedFaq(row) {
  const result = useVerifiedContent('faq', row ? row.integrity : null, row ? { id: row.id } : null);
  return {
    state: result.state,
    reason: result.reason,
    faq: result.state === STATES.VERIFIED ? faqFromSigned(result.content) : null
  };
}

export default function VerifiedFAQ({ faq, children }) {
  const verified = useVerifiedFaq(faq);
  return children(verified);
}
