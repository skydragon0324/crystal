'use strict';

/**
 * WHAT EACH SIGNED THING IS MADE OF, field by field and in order.
 *
 * This table decides which bytes a signature covers, and crystal-web's
 * src/security/schemas.js is the same table written a second time - on
 * purpose, because the storefront has to rebuild exactly these bytes from a
 * JSON reply without trusting anything the reply says about its own shape.
 * The two copies are held together by the test vectors
 * (test/fixtures/signing-vectors.json, `npm run content-keys -- --vectors`),
 * which the storefront's tests read verbatim. A field added on one side only
 * is a signature that can never verify, and the vectors say so before a
 * visitor does.
 *
 * AN ORDERED LIST, NOT AN OBJECT. The canonical payload walks the list, so
 * the key order in the signed bytes never depends on how a row was selected,
 * which join added a column, or what order a JSON parser handed keys back in.
 *
 * THE ENUMS ARE WRITTEN OUT HERE rather than imported from
 * utils/faqCategories.js or read out of the database, and that is deliberate.
 * Adding a value to `faq_category` is a change to what a signature can say,
 * so it has to be a visible change to this file and to the storefront's copy -
 * with SCHEMA_VERSION reconsidered - rather than something that happens to
 * both sides at different times because one of them was redeployed first. The
 * tests fail if this list and utils/faqCategories.js drift apart.
 *
 * SCHEMA_VERSION STAYED AT 1 THROUGH DELTA 033, which changed the faq entry -
 * new category words, and productCategoryId gone - and that was reconsidered
 * rather than forgotten. The version is the shape of the ENVELOPE, and it is
 * checked for every type; bumping it would have invalidated every notice and
 * every image to change one type's fields. The faq change needed no version to
 * be safe: a verifier refuses a field it does not know and a field that is
 * missing, so an old-shape FAQ is INVALID to the new code and a new-shape one
 * to the old - fail closed, both ways. The migration re-signed every FAQ whose
 * old signature held (20260922110000_the_faq_is_filed_by_product.js).
 *
 * WHAT IS NOT HERE MATTERS AS MUCH AS WHAT IS.
 *
 *   faqs.view_count        changes on every read. A signature over it would
 *                          be stale the moment anybody opened the answer.
 *   site_notices.is_deleted, faqs.is_deleted
 *                          whether a row is SERVED is the application's
 *                          decision, made by the query; a signature says
 *                          what the content is, not whether to show it.
 *   the origin's name and colour on a notice
 *                          a join, owned by another table. originId is
 *                          signed; the label drawn beside it is not.
 *   feedback               threads and their messages, staff replies
 *                          included. They live in the vendor's ora_pid
 *                          schema - the vendor's database, which Crystal
 *                          reads and writes but does not own - so they are
 *                          not a signed type at all, and render as they
 *                          always have.
 */

const SCHEMA_VERSION = 1;

/* publish_status, in its declaration order - sql/schema.sql section 0. */
const PUBLISH_STATUS = ['DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED'];

/* faq_category - the same eight as utils/faqCategories.js, in its order. */
const FAQ_CATEGORY = ['SMARTPHONE', 'TV', 'STB', 'COMPUTER', 'CAMERA', 'CRYSTAL_APP', 'ESHOP', 'APPSTORE'];

/*
 * The image types an upload may be, and therefore the types a signature may
 * claim. It is the same list as config.storage.allowedImageTypes; a type that
 * could be uploaded but not signed would be an image that is stored and then
 * shown as invalid forever.
 */
const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];

function enumOf(values) {
  return 'enum:' + values.join('|');
}

const SCHEMAS = {
  /* a row of site_notices */
  notification: [
    ['id', 'int'],
    ['title', 'string'],
    ['content', 'string'],
    ['originId', 'int?'],
    ['status', enumOf(PUBLISH_STATUS)],
    ['startsAt', 'time?'],
    ['endsAt', 'time?'],
    ['sortOrder', 'int'],
    ['createdAt', 'time'],
    ['updatedAt', 'time']
  ],

  /*
   * a row of faqs - NOT view_count. No productCategoryId either, since delta
   * 033: the category names the product kind itself, and the catalogue section
   * that used to say it is no longer a column.
   */
  faq: [
    ['id', 'int'],
    ['category', enumOf(FAQ_CATEGORY)],
    ['question', 'string'],
    ['answer', 'string'],
    ['sortOrder', 'int'],
    ['status', enumOf(PUBLISH_STATUS)],
    ['createdAt', 'time'],
    ['updatedAt', 'time']
  ],

  /*
   * A file under the upload directory, as it is stored.
   *
   * `storageKey` is the public path the database holds, and it is INSIDE the
   * signed bytes: a valid signature for one file cannot be presented for
   * another path. `mimeType` is what the BYTES are, sniffed on the server, not
   * what an upload claimed to be. `sha256` is of the exact stored bytes.
   */
  image: [
    ['storageKey', 'string'],
    ['mimeType', enumOf(IMAGE_MIME_TYPES)],
    ['size', 'int'],
    ['sha256', 'hex64']
  ]
};

const TYPES = Object.keys(SCHEMAS);

/** Own property only - `constructor` is not a content type. */
function schemaOf(type) {
  return typeof type === 'string' && Object.prototype.hasOwnProperty.call(SCHEMAS, type)
    ? SCHEMAS[type]
    : null;
}

module.exports = {
  SCHEMA_VERSION: SCHEMA_VERSION,
  SCHEMAS: SCHEMAS,
  TYPES: TYPES,
  PUBLISH_STATUS: PUBLISH_STATUS,
  FAQ_CATEGORY: FAQ_CATEGORY,
  IMAGE_MIME_TYPES: IMAGE_MIME_TYPES,
  schemaOf: schemaOf
};
