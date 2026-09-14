const { CronJob } = require('cron');
const warranties = require('./warranties.service');
const replenishments = require('./replenishments.service');
const settings = require('./settings.service');
const { SYSTEM } = require('../utils/actor');
const feedback = require('./feedback.service');

/**
 * The work nobody asks for.
 *
 * Two jobs, both of which exist because the alternative is somebody noticing
 * by hand: cover whose last day has passed has to be marked expired, and a
 * service centre that is out of a part has to have an order raised for it.
 *
 * Every failure is caught and logged rather than thrown.  A scheduled job
 * that throws takes the process with it, and an API that dies at 03:00
 * because a sweep found a bad row is a worse outcome than a sweep that
 * skipped a night.
 *
 * Both take utils/actor's SYSTEM rather than a request, which is what lets
 * them write to the audit trail without inventing a fake administrator - the
 * trail then says, correctly, that nobody decided this.
 */

/** 03:10 every day - late enough to be quiet, early enough to be before work. */
const EXPIRY_CRON = '0 10 3 * * *';

/** 03:40, after the expiry sweep, so the two never contend for the same rows. */
const REORDER_CRON = '0 40 3 * * *';

/*
 * Feedback threads nobody resolved, closed off once a day.
 *
 * A thread neither side resolved and neither side has written in for a
 * week is finished rather than left in the queue forever - which is what
 * makes the queue a list of things somebody still has to do.
 */
const FEEDBACK_CRON = '0 20 3 * * *';

async function expireWarranties() {
  try {
    const affected = await warranties.expirePassed();
    if (affected) console.log('[sweep] ' + affected + ' warranties expired');
  } catch (err) {
    console.error('[sweep] warranty expiry failed: ' + err.message);
  }
}

async function reorderParts() {
  try {
    const enabled = await settings.value('stock.auto_reorder', true);
    if (!enabled) return;

    const raised = await replenishments.sweep(SYSTEM);
    if (raised.length) {
      console.log('[sweep] raised ' + raised.length + ' replenishment orders: ' + raised.join(', '));
    }
  } catch (err) {
    console.error('[sweep] reorder failed: ' + err.message);
  }
}

/**
 * Ages out feedback threads that went quiet.
 *
 * Only PENDING and REPLIED are touched: RESOLVED is already an ending,
 * and a thread reopens the moment somebody writes in it, so nothing is
 * lost by closing one that has gone silent.
 */
async function finishFeedback() {
  try {
    const result = await feedback.finishStale();
    if (result.finished) {
      console.log('housekeeping: finished ' + result.finished + ' feedback threads'
        + ' idle for ' + result.after_days + ' days');
    }
  } catch (err) {
    console.error('housekeeping: feedback sweep failed - ' + err.message);
  }
}

let jobs = [];

function schedule() {
  if (jobs.length) return jobs;

  jobs = [
    new CronJob(EXPIRY_CRON, expireWarranties, null, true),
    new CronJob(REORDER_CRON, reorderParts, null, true),
    new CronJob(FEEDBACK_CRON, finishFeedback, null, true)
  ];

  console.log('housekeeping scheduled: warranty expiry ' + EXPIRY_CRON
    + ', reorder ' + REORDER_CRON + ', feedback ' + FEEDBACK_CRON);
  return jobs;
}

function stop() {
  jobs.forEach(function (job) { job.stop(); });
  jobs = [];
}

module.exports = {
  EXPIRY_CRON: EXPIRY_CRON,
  REORDER_CRON: REORDER_CRON,
  expireWarranties: expireWarranties,
  reorderParts: reorderParts,
  finishFeedback: finishFeedback,
  schedule: schedule,
  stop: stop
};
