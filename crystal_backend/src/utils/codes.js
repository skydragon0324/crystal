/**
 * The small numeric code lists, in words.
 *
 * The console has its own copy of these because it needs colours and
 * translation keys too; this one exists for the places the server has to put
 * a code into text of its own - a printed job sheet cannot show "status 3",
 * and neither can an audit entry or an error message.
 *
 * The numbers are the ones the CHECK constraints in sql/schema.sql allow, and
 * the wording is English so it goes through the same message catalogue as
 * everything else.
 */

/** repair_tickets.status */
const TICKET_STATUS = {
  0: 'Received',
  1: 'Diagnosing',
  2: 'Waiting for parts',
  3: 'Waiting for approval',
  4: 'Repairing',
  5: 'Quality check',
  6: 'Ready for collection',
  7: 'Closed',
  9: 'Cancelled'
};

/**
 * Which status may follow which.
 *
 * The workflow is mostly a line, but not entirely: a quality check that fails
 * goes back to the bench, and a diagnosis can find that the part it needs is
 * not on the shelf.  Writing the exceptions out is what stops them being
 * discovered one support call at a time.
 *
 * Cancellation is allowed from anywhere that is not already finished, because
 * a customer can always change their mind - up until the point where the
 * device has been worked on and handed back.
 */
const TICKET_FLOW = {
  0: [1, 2, 3, 4, 9],
  1: [2, 3, 4, 9],
  2: [1, 3, 4, 9],
  3: [2, 4, 9],
  4: [2, 5, 9],
  5: [4, 6, 9],
  6: [4, 7],
  7: [],
  9: []
};

/** The statuses that still count as work in progress. */
const TICKET_OPEN_MAX = 6;

/** repair_tickets.intake_channel */
const INTAKE_CHANNEL = {
  0: 'Walk-in',
  1: 'Mail-in',
  2: 'On-site',
  3: 'Courier pickup'
};

/** repair_tickets.priority */
const PRIORITY = {
  0: 'Low',
  1: 'Normal',
  2: 'Urgent'
};

/** repair_tickets.pay_state */
const PAY_STATE = {
  0: 'Unpaid',
  1: 'Part paid',
  2: 'Paid',
  3: 'Nothing to pay'
};

/** repair_tickets.pay_method */
const PAY_METHOD = {
  0: 'Cash',
  1: 'Bank transfer',
  2: 'Card',
  3: 'Wallet',
  4: 'Cheque',
  5: 'Other'
};

/** part_replenishments.status */
const REPLENISHMENT_STATUS = {
  0: 'Draft',
  1: 'Submitted',
  2: 'Approved',
  3: 'Shipped',
  4: 'Received',
  9: 'Cancelled'
};

/** warranty_claims.status */
const CLAIM_STATUS = {
  0: 'Draft',
  1: 'Submitted',
  2: 'Approved',
  3: 'Rejected',
  4: 'Paid',
  9: 'Cancelled'
};

/** agencies.tier */
const AGENCY_TIER = {
  0: 'Collection point',
  1: 'Authorised',
  2: 'Flagship',
  3: 'Factory service'
};

/** technicians.grade, and technician_skills.level */
const TECHNICIAN_GRADE = {
  1: 'Trainee',
  2: 'Technician',
  3: 'Senior',
  4: 'Master'
};

/** symptom_catalog.severity */
const SEVERITY = {
  0: 'Cosmetic',
  1: 'Normal',
  2: 'Unusable',
  3: 'Safety'
};

/** The component vocabulary shared by symptoms, parts and technician skills. */
const COMPONENTS = [
  'DISPLAY', 'BATTERY', 'BOARD', 'CAMERA', 'AUDIO',
  'POWER', 'NETWORK', 'SOFTWARE', 'CASING', 'OTHER'
];

/** The word for a code, or a readable placeholder when there is not one. */
function labelOf(list, value) {
  if (value === null || value === undefined) return 'Not set';
  const label = list[Number(value)];
  return label === undefined ? String(value) : label;
}

/** Whether a ticket may move from one status to another. */
function canTransition(from, to) {
  const allowed = TICKET_FLOW[Number(from)];
  return !!allowed && allowed.indexOf(Number(to)) !== -1;
}

module.exports = {
  TICKET_STATUS: TICKET_STATUS,
  TICKET_FLOW: TICKET_FLOW,
  TICKET_OPEN_MAX: TICKET_OPEN_MAX,
  INTAKE_CHANNEL: INTAKE_CHANNEL,
  PRIORITY: PRIORITY,
  PAY_STATE: PAY_STATE,
  PAY_METHOD: PAY_METHOD,
  REPLENISHMENT_STATUS: REPLENISHMENT_STATUS,
  CLAIM_STATUS: CLAIM_STATUS,
  AGENCY_TIER: AGENCY_TIER,
  TECHNICIAN_GRADE: TECHNICIAN_GRADE,
  SEVERITY: SEVERITY,
  COMPONENTS: COMPONENTS,
  labelOf: labelOf,
  canTransition: canTransition
};
