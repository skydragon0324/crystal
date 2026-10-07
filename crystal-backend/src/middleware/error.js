const { HttpError } = require('../utils/response');
const { translate } = require('../i18n');

function notFound(req, res, next) {
  next(new HttpError(404, 'error.endpointNotFound', null, {
    method: req.method,
    url: req.originalUrl
  }));
}

/**
 * THE SCHEMA'S OWN GUARDS, each with its own SQLSTATE.
 *
 * Every RAISE EXCEPTION used to arrive as P0001, which says "a guard fired"
 * and not WHICH guard - so the only thing this could do with the sentence was
 * send it on, in the English it was written in. Delta 022 gave each one a
 * code in the 'CR' class, a class PostgreSQL does not use, and the values
 * that belong in the sentence travel as JSON in DETAIL.
 */
const GUARDS = {
  CR001: { status: 400, message: 'warranties.aCoveredRepairMust' },
  CR002: { status: 400, message: 'warranties.warrantyDoesNotExist' },
  CR003: { status: 400, message: 'warranties.warrantyCoversDeviceNot' },
  CR004: { status: 400, message: 'warranties.warrantyHasBeenVoided' },
  CR005: { status: 400, message: 'warranties.warrantyRanFromTo' }
};

/**
 * A duplicate, named by the constraint it broke.
 *
 * `duplicated value` is true and useless: the member reading it does not know
 * which value. PostgreSQL names the constraint, and a constraint name is
 * stable - so the ones a person can actually collide with get a sentence that
 * says what to change. Anything not listed keeps the generic answer.
 */
const UNIQUE = {
  uq_agency_service: 'conflict.thatServiceIsAlready',
  uq_claim_agency_month: 'conflict.aClaimForThatMonth',
  uq_part_product: 'conflict.thatPartIsAlready',
  uq_permission_role_page: 'conflict.thatRoleAlreadyHasA',
  uq_product_color: 'conflict.thatFinishIsAlready',
  uq_product_specification: 'conflict.thatSpecificationIsAlready',
  uq_replenishment_part: 'conflict.thatPartIsAlreadyOn',
  uq_stock_agency_part: 'conflict.thatPartAlreadyHasA',
  uq_technician_skill: 'conflict.thatTechnicianAlreadyHas',

  /*
   * The CRM's. The services check most of these first and say so with the
   * details; these are for the request that loses a race to one that did not.
   */
  uq_crm_reg_one_owner: 'crm.someoneElseHoldsThisProduct',
  uq_crm_reg_current: 'crm.thisCustomerAlreadyHoldsItThatWay',
  uq_crm_reservation_id_card: 'crm.thisIdCardHasAnEntry',
  uq_crm_transfer_open: 'crm.aRequestIsAlreadyOpen',
  uq_crm_contact: 'crm.thisContactIsAlready',
  uq_crm_target: 'crm.alreadyATarget',
  uq_crm_project_account: 'crm.thatAccountIsAlreadyLinked',
  uq_crm_instance_ext: 'crm.thatSerialIsAlreadyKnown',
  uq_crm_product_code: 'crm.thatCodeIsTaken',
  uq_crm_event_location: 'crm.thatSiteIsAlreadyInTheEvent',
  uq_crm_event_quota: 'crm.thatQuotaAlreadyExists',
  uq_crm_event_tier: 'crm.thatCodeIsTaken',
  uq_crm_capability: 'crm.theSiteAlreadyHasThat',
  uq_crm_loc_target: 'crm.thatTargetAlreadyExists',
  uq_crm_segment_code: 'crm.thatCodeIsTaken',
  uq_crm_campaign_code: 'crm.thatCodeIsTaken',
  uq_crm_comm_option: 'crm.thatOptionAlreadyExists',
  uq_crm_tier_code: 'crm.thatCodeIsTaken'
};

/**
 * The parameters a guard sent, or nothing.
 *
 * ONLY FOR OUR OWN CODES. `detail` on a stock PostgreSQL error is the row
 * that failed - "Failing row contains (...)", every column of it - and that
 * has leaked to a client from this file once already. It is read here only
 * when the SQLSTATE says this codebase wrote it.
 */
function guardParams(err) {
  if (!err.detail) return null;

  try {
    const parsed = JSON.parse(err.detail);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (parseError) {
    return null;
  }
}

/**
 * Turns PostgreSQL errors into readable messages instead of leaking SQL.
 */
function translatePg(err) {
  if (GUARDS[err.code]) {
    return Object.assign({ params: guardParams(err) }, GUARDS[err.code]);
  }

  switch (err.code) {
    case '23505': return {
      status: 409,
      message: UNIQUE[err.constraint] || 'common.duplicatedValue'
    };
    case '23503': return { status: 409, message: 'common.referencedRecordIsMissing' };
    case '23514': return { status: 400, message: 'common.valueFailedAValidation' };
    case '23502': return {
      status: 400,
      message: err.column ? 'common.isRequired' : 'common.aRequiredValueIs',
      params: err.column ? { column: err.column } : null
    };
    /*
     * A word that is not in the enum's list.
     *
     * This is the same mistake 23514 used to be - the vocabularies moved from
     * a CHECK per column to a type, and the type raises a different code. It
     * was answering 500, which reads as "we broke", for what is squarely a bad
     * request.
     *
     * The database's message names the type and the value, and it used to be
     * passed through for that reason - which meant a Chinese reader got a
     * sentence of English SQL. The value is the useful half and it is the
     * half this can extract, so it goes into a sentence of ours.
     */
    case '22P02': return Object.assign({ status: 400 }, invalidInput(err));

    /*
     * A guard that has not been given a code yet - a delta added after 022,
     * or a database that has not run it. Answered as a plain bad request
     * rather than as a 500, and in the reader's language rather than in the
     * sentence's, because a half-translated system is worse than a general
     * one.
     */
    case 'P0001': return { status: 400, message: 'common.valueFailedAValidation' };
    default: return null;
  }
}

/**
 * THE TYPE AND THE VALUE, out of PostgreSQL's own 22P02 wording.
 *
 * Matched against the exact phrasing rather than by grabbing the first quoted
 * token, because KNEX PREPENDS THE WHOLE SQL STATEMENT to `err.message`:
 *
 *   insert into "faqs" (...) values (...) - invalid input value for enum
 *   crystal_system: "TELEPATHY"
 *
 * The first quoted string there is the TABLE NAME. Reading it reported
 * `"faqs" is not a value this field accepts`, which is wrong twice - it names
 * the table instead of the value, and it drops the vocabulary that says what
 * the value should have been.
 *
 * Only the two captures are used, never the message. That matters: echoing it
 * would put the SQL statement, parameter placeholders and all, in a reply.
 */
function invalidInput(err) {
  const message = String(err.message || '');

  const enumMiss = message.match(/invalid input value for enum ([a-z_][a-z0-9_]*): "([^"]*)"/i);
  if (enumMiss) {
    return {
      message: 'common.isNotAValue',
      params: { value: enumMiss[2], type: enumMiss[1] }
    };
  }

  /* The other 22P02: a word where a number, a date or a uuid was wanted. */
  const badSyntax = message.match(/invalid input syntax for(?: type)? ([a-z ]+): "([^"]*)"/i);
  if (badSyntax) {
    return {
      message: 'common.isNotAValue',
      params: { value: badSyntax[2], type: badSyntax[1].trim() }
    };
  }

  return { message: 'common.valueFailedAValidation', params: null };
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const pg = translatePg(err);
  const status = err instanceof HttpError ? err.status : (pg ? pg.status : 500);
  const message = err instanceof HttpError ? err.message : (pg ? pg.message : 'common.internalServerError');

  if (status >= 500) console.error(err);

  /*
   * The message is an ADDRESS at the throw site and becomes the reader's
   * language here, where the request - and so the locale - is finally in
   * hand. That now includes the database's own errors: a constraint, an enum
   * and each of the schema's guards all resolve to an address above, so a
   * Chinese reader no longer gets a sentence of English SQL for a duplicate.
   *
   * The parameters come from whichever side raised it - HttpError carries its
   * own, a guard sends them as JSON in DETAIL - so the sentence is translated
   * whole and the values are filled in afterwards.
   */
  const params = err instanceof HttpError ? err.params : (pg ? pg.params : null);

  res.status(status).json({
    success: false,
    message: translate(req.locale, message, params),
    /*
     * ONLY A DETAIL WE WROTE, never one the database wrote.
     *
     * `err.detail` is the field HttpError carries a list of blockers in - what
     * still references a row somebody is trying to purge, which the console
     * shows. It is ALSO the field node-postgres puts its own DETAIL line in,
     * and that line is "Failing row contains (...)": every column of the row,
     * verbatim, sent to whoever made the request.
     *
     * On a product that is a price list. On a member it would be an email and
     * a phone number. The two uses shared one property name and the database's
     * won whenever a constraint fired, so the check is on the error's TYPE
     * rather than on the shape of what is in it.
     */
    detail: err instanceof HttpError ? (err.detail || null) : null
  });
}

module.exports = {
  notFound: notFound,
  errorHandler: errorHandler,
  /*
   * Exported for scripts/check.js, which asserts that every address in them
   * resolves and that every constraint named still exists in the schema. A
   * renamed constraint would otherwise fall back to the generic message and
   * nothing would say so.
   */
  GUARDS: GUARDS,
  UNIQUE: UNIQUE
};
