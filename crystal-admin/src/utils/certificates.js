/**
 * HOW LONG A CERTIFICATE HAS LEFT, as the console reads the API's report.
 *
 * GET /dashboard/certificates answers with every certificate's `notAfter`, the
 * server's own clock at the moment it answered (`now`) and the thresholds the
 * statuses are drawn from - see crystal-backend/src/services/
 * certificates.service.js, which is the one place those numbers are decided.
 *
 * THE COUNT IS REDONE HERE, AND NOT BECAUSE THE SERVER'S IS WRONG. The header
 * asks once a session, and a console left open over a weekend would otherwise
 * go on saying "3 days" on the Monday about a certificate that ran out on the
 * Sunday. So each render counts again from `notAfter`, with the rule the
 * server uses, on the SERVER's clock carried forward by however long the
 * report has been held - never the reader's own clock, which can be minutes
 * or a timezone setting out, and would move a certificate across a day
 * boundary the server does not agree it has crossed. At the moment a report
 * arrives the two counts are the same number.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** The dashboard card's id: the header's indicator links to /admin/dashboard#signing-certificates. */
export const CERTIFICATES_ANCHOR = 'signing-certificates';

/**
 * What the thresholds are when a report does not say - the API's own values.
 * Only a fallback: the report's are used whenever it carries them.
 */
export const DEFAULT_THRESHOLDS = { warningDays: 30, criticalDays: 7 };

export const STATUSES = ['ok', 'warning', 'critical', 'expired'];

/** Chakra colour schemes, by status. Critical and expired share red: both mean "now". */
export const STATUS_SCHEME = { ok: 'green', warning: 'orange', critical: 'red', expired: 'red' };

/** Whole days from `now` (ms) to `notAfter` (ISO), rounded down: 0 on the last day, negative once past it. */
export function daysLeft(notAfter, now) {
  const end = Date.parse(notAfter);
  if (isNaN(end) || typeof now !== 'number' || !isFinite(now)) return null;
  return Math.floor((end - now) / DAY_MS);
}

function thresholdsOf(value) {
  const ok = value
    && typeof value.warningDays === 'number' && isFinite(value.warningDays)
    && typeof value.criticalDays === 'number' && isFinite(value.criticalDays);
  return ok ? value : DEFAULT_THRESHOLDS;
}

/**
 * The status for a number of whole days left.
 *
 * "FEWER THAN", NOT "AT MOST" - 29 days is a warning and 30 is not, which is
 * the day the API's startup log begins warning too. See the backend service
 * for why the two must agree.
 */
export function statusOf(days, thresholds) {
  if (typeof days !== 'number' || !isFinite(days)) return null;
  const limits = thresholdsOf(thresholds);

  if (days < 0) return 'expired';
  if (days < limits.criticalDays) return 'critical';
  if (days < limits.warningDays) return 'warning';
  return 'ok';
}

/** Critical and expired are the ones that must not be missed. */
export function isUrgent(status) {
  return status === 'critical' || status === 'expired';
}

/**
 * The report's certificates as of `clientNow`, each with daysLeft and status
 * counted again (see the note at the top).
 *
 *   report      the API's answer, or anything else - which gives []
 *   receivedAt  the reader's clock (ms) when it arrived
 *   clientNow   the reader's clock now
 *
 * An entry the console could not draw - no notAfter it can read - is left out
 * rather than shown as a blank row that looks like a certificate with no
 * expiry at all.
 */
export function certificatesAsOf(report, receivedAt, clientNow) {
  if (!report || !Array.isArray(report.certificates)) return [];

  const serverThen = Date.parse(report.now);
  const held = typeof receivedAt === 'number' && typeof clientNow === 'number'
    /* A reader's clock set backwards is not time running backwards. */
    ? Math.max(0, clientNow - receivedAt)
    : 0;
  const at = isNaN(serverThen) ? clientNow : serverThen + held;
  const thresholds = thresholdsOf(report.thresholds);

  return report.certificates
    .filter((certificate) => certificate && daysLeft(certificate.notAfter, at) !== null)
    .map((certificate) => {
      const days = daysLeft(certificate.notAfter, at);
      return { ...certificate, daysLeft: days, status: statusOf(days, thresholds) };
    });
}

/** The certificate that signs, or null. */
export function activeCertificate(certificates) {
  return (certificates || []).filter((certificate) => certificate.role === 'active')[0] || null;
}

export function thresholdsIn(report) {
  return thresholdsOf(report && report.thresholds);
}
