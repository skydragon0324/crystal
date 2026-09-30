/**
 * WHAT EACH SIGNED THING IS MADE OF, field by field and in order.
 *
 * This is the storefront's copy of the table in crystal-backend's
 * src/security/schemas.js, and the two are the same table written twice on
 * purpose: the backend decides what bytes to sign, this decides what bytes to
 * check, and a field that exists on one side and not the other is a signature
 * that can never verify. The shared test vectors
 * (__fixtures__/signing-vectors.json, copied verbatim from the backend) are
 * what prove the two copies still agree - a change here without a change
 * there fails those tests before it fails a visitor.
 *
 * AN ORDERED LIST, NOT AN OBJECT. The canonical payload walks this list, so
 * the key order in the signed bytes never depends on how a response happened
 * to be assembled - a JSON reply is free to arrive in any order, and the
 * bytes rebuilt from it still come out the same.
 *
 * THE ENUMS ARE THE DATABASE'S OWN VALUES. publish_status really does have
 * REVIEW between DRAFT and PUBLISHED (sql/schema.sql), and faq_category is the
 * eight things a question can be about - the catalogue's five product kinds,
 * then the Crystal App, the Eshop and the Appstore. A value outside the list
 * is rejected before any cryptography runs, the same as on the backend.
 *
 * THE FAQ LOST A FIELD in the backend's delta 033: `productCategoryId`, the
 * catalogue section, which the category now says by itself. SCHEMA_VERSION
 * stayed at 1 - it versions the envelope, for every type - and nothing needed
 * it to move: a payload with a field this list does not have, or without one
 * it does, is refused, so an FAQ signed in the old shape can never verify here
 * as the new one.
 *
 * `view_count` IS NOT HERE, and must never be. It changes on every read, so a
 * signature over it would be stale the moment anybody opened the question.
 */

export const SCHEMA_VERSION = 1;

const PUBLISH_STATUS = 'enum:DRAFT|REVIEW|PUBLISHED|ARCHIVED';
const FAQ_CATEGORY = 'enum:SMARTPHONE|TV|STB|COMPUTER|CAMERA|CRYSTAL_APP|ESHOP|APPSTORE';

export const IMAGE_MIME_TYPES = [
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'
];

export const SCHEMAS = {
  notification: [
    ['id', 'int'],
    ['title', 'string'],
    ['content', 'string'],
    ['originId', 'int?'],
    ['status', PUBLISH_STATUS],
    ['startsAt', 'time?'],
    ['endsAt', 'time?'],
    ['sortOrder', 'int'],
    ['createdAt', 'time'],
    ['updatedAt', 'time']
  ],

  faq: [
    ['id', 'int'],
    ['category', FAQ_CATEGORY],
    ['question', 'string'],
    ['answer', 'string'],
    ['sortOrder', 'int'],
    ['status', PUBLISH_STATUS],
    ['createdAt', 'time'],
    ['updatedAt', 'time']
  ],

  image: [
    ['storageKey', 'string'],
    ['mimeType', 'enum:' + IMAGE_MIME_TYPES.join('|')],
    ['size', 'int'],
    ['sha256', 'hex64']
  ]
};

export const CONTENT_TYPES = Object.keys(SCHEMAS);

/*
 * EXACTLY WHAT Date.prototype.toISOString() WRITES, and nothing it does not.
 * A timestamp with no milliseconds, or with an offset instead of Z, names the
 * same instant in different bytes - and different bytes are a different
 * signature.
 */
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const HEX64 = /^[0-9a-f]{64}$/;

/**
 * Whether one value is what its kind says it is.
 *
 * Deliberately returns a boolean and not a coerced value: the serialiser never
 * repairs anything. A number sent as a string is not "close enough", it is a
 * payload the backend did not sign.
 */
export function valueFits(kind, value) {
  if (typeof kind !== 'string') return false;

  const nullable = kind.charAt(kind.length - 1) === '?';
  const base = nullable ? kind.slice(0, -1) : kind;

  if (value === null) return nullable;
  if (value === undefined) return false;

  if (base === 'string') return typeof value === 'string';
  if (base === 'int') return typeof value === 'number' && Number.isSafeInteger(value);

  if (base === 'time') {
    if (typeof value !== 'string' || !TIME.test(value)) return false;
    /* A real instant too - 2026-02-30 matches the pattern and is no day. */
    const parsed = new Date(value);
    return !isNaN(parsed.getTime()) && parsed.toISOString() === value;
  }

  if (base === 'hex64') return typeof value === 'string' && HEX64.test(value);

  if (base.indexOf('enum:') === 0) {
    return typeof value === 'string' && base.slice(5).split('|').indexOf(value) !== -1;
  }

  /* A kind this file does not know is a schema bug, and a bug fails closed. */
  return false;
}
