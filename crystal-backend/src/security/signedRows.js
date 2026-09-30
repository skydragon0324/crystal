'use strict';

const { HttpError } = require('../utils/response');
const { service: signing, STATUS } = require('./signingService');

/**
 * SIGNING A TABLE'S ROWS AS THEY ARE WRITTEN - the part the generic CRUD
 * stack and the spreadsheet import share.
 *
 *   crudFactory({ table: 'faqs', ..., signed: { type: 'faq', content: contentOf.faq } })
 *
 * One declaration on the route, and every path that writes those rows through
 * the factory - create, update, delete, restore, permanent delete and the
 * spreadsheet import - signs them inside the same transaction as the write.
 * That is the rule the specification states as "no route modifies signed
 * content without re-signing it", and putting it here rather than in each
 * route is what makes it true for the next route too.
 *
 * AN EDIT DOES NOT LAUNDER A TAMPERED ROW. Before a row is changed its current
 * state is checked against its stored signature, and a row that no longer
 * matches - somebody edited it in the database - is REFUSED with a 409 rather
 * than re-signed. Otherwise the fix for an unauthorised change would be for an
 * editor to touch the sort order, and the change would come out of the save
 * carrying a perfectly good signature. The refusal names the audit; see
 * docs/content-signing.md for how a reviewed row is re-signed.
 *
 * What is NOT refused:
 *
 *   an UNSIGNED row - content from before signing existed, or one the
 *     backfill has not reached. Saving it through the console is the
 *     authorised act that signs it.
 *   a row signed by a REVOKED or UNTRUSTED key - its signature proves nothing
 *     either way, so it cannot be "tampered" in any sense the check can
 *     establish. It is logged, and the save re-signs it with the active key:
 *     that is the review step after a key is withdrawn.
 *
 * DELETE IS NEVER REFUSED - removing a suspicious notice is exactly what
 * somebody should be able to do. A soft delete still moves updated_at (the
 * trigger), so a VALID row is re-signed as it goes into the recycle bin and a
 * tampered one keeps its broken signature, for the audit to go on reporting.
 */
function createSignedRows(spec) {
  const type = spec.type;
  const pk = spec.pk || 'id';
  const contentFor = spec.content;

  function contentOrNull(row) {
    try {
      return contentFor(row);
    } catch (err) {
      return null;
    }
  }

  /** How the row stands against its signature, as signingService.check answers. */
  async function statusOf(row, trx) {
    const content = contentOrNull(row);
    const stored = await signing().stored(type, row[pk], trx);
    if (!content) return { status: stored ? STATUS.INVALID : STATUS.UNSIGNED, reason: 'the row does not fit the ' + type + ' schema' };
    return signing().check(type, row[pk], content, trx, stored || null);
  }

  /** Throws the 409 for a row that no longer matches its signature; answers the status otherwise. */
  async function assertUntampered(row, trx) {
    const checked = await statusOf(row, trx);

    if (checked.status === STATUS.INVALID) {
      console.error('content signing: refused to write ' + type + ' ' + row[pk] +
        ' - it no longer matches its stored signature (' + checked.reason + ')');
      throw new HttpError(409, 'signing.itemNoLongerMatches');
    }

    if (checked.status === STATUS.REVOKED || checked.status === STATUS.UNTRUSTED) {
      console.warn('content signing: ' + type + ' ' + row[pk] + ' was signed by a ' + checked.status +
        ' (' + (checked.row && checked.row.key_id) + ') and is being re-signed by an edit');
    }

    return checked.status;
  }

  function sign(row, trx) {
    return signing().sign(type, row[pk], contentFor(row), trx);
  }

  function forget(id, trx) {
    return signing().forget(type, id, trx);
  }

  return {
    type: type,
    statusOf: statusOf,
    assertUntampered: assertUntampered,
    sign: sign,
    forget: forget
  };
}

module.exports = {
  createSignedRows: createSignedRows
};
