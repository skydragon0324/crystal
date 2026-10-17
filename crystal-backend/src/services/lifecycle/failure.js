'use strict';

/**
 * WHAT A FAILED JOB SAYS ABOUT ITSELF.
 *
 * `lifecycle_job_run.error` is one column, and the Job health tab is the only
 * place anybody reads it - the stderr of a deployed API usually belongs to
 * nobody. So that single sentence has to carry everything an operator can act
 * on: the stage the failure came out of, what kind of failure it was, and the
 * file and line. And nothing more, because a whole stack in a table cell is
 * unreadable.
 *
 * NOTHING IS REQUIRED HERE. This is the module that explains a failure, so it
 * must not be able to cause one; it is pure functions over an error object,
 * and scripts/check-lifecycle.js covers it without a database.
 *
 * THE PRODUCTION ROW THAT WROTE THIS FILE.
 *
 * A poll recorded, run after run, the whole sentence "rows is not defined" -
 * no kind, no stage, no address. Nothing can be done with that. A free `rows`
 * identifier exists nowhere in this codebase: every file under src/ and
 * scripts/, every committed revision of the lifecycle code on every branch,
 * the minified bundle, and knex's, oracledb's and pg's own lib/ were each
 * checked for an undeclared one, mechanically, and all came back clean. What
 * is left is a dependency's own code or an artifact older than the source -
 * and the line as it was recorded could not tell those two apart, which is
 * the whole problem. Each of the three parts below exists because its absence
 * is what made that row useless.
 */

/** `at fn (C:\x\node_modules\knex\lib\a.js:88:20)` -> the path and the line. */
const FRAME = /([^\s(]+\.js):(\d+)/;

/**
 * A path an operator can read, with the part that identifies it kept.
 *
 * `node_modules/knex/lib/dialects/oracledb/index.js` says a driver raised it.
 * `src/services/lifecycle/sync.service.js` says this codebase did.
 * `dist/app.js:1` says the machine is running the minified bundle, which is
 * worth knowing on its own: that answer means the next question is which
 * build, not which line.
 */
function shorten(file) {
  const path = String(file).replace(/\\/g, '/');

  const vendor = path.lastIndexOf('/node_modules/');
  if (vendor !== -1) return path.slice(vendor + 1);

  const mine = path.lastIndexOf('/src/');
  if (mine !== -1) return path.slice(mine + 1);

  /* Anything else - scripts/, app.js, dist/ - by its last two segments. */
  return path.split('/').slice(-2).join('/');
}

/**
 * The first frame worth printing.
 *
 * This project's own code when the stack contains any, because that is where
 * a bug of ours is and a driver's internal frames say nothing an operator can
 * act on.
 *
 * OTHERWISE THE FIRST FRAME AT ALL, node_modules included. This is the case
 * the earlier version got wrong: it kept a frame only when the frame was
 * inside src/, so an error raised entirely within a driver - which is exactly
 * the failure nothing in src/ can explain - was recorded with no location
 * whatsoever. A frame pointing into knex is not actionable in the sense of
 * naming a line to fix, but it is the difference between "a dependency did
 * this" and "we did this", and that is the first thing anybody needs to know.
 */
function location(stack) {
  const frames = String(stack || '')
    .split('\n')
    .slice(1)
    .filter(function (line) { return FRAME.test(line); });

  if (!frames.length) return null;

  const ours = frames.filter(function (line) {
    return line.indexOf('node_modules') === -1 && /[\\/]src[\\/]/.test(line);
  })[0];

  const found = FRAME.exec(ours || frames[0]);
  return found ? shorten(found[1]) + ':' + found[2] : null;
}

/**
 * One line: the stage, the kind, the message, the place.
 *
 * THE KIND OF FAILURE MATTERS AS MUCH AS THE MESSAGE. "rows is not defined"
 * and "relation does not exist" are different problems - the first is a bug
 * in some JavaScript, the second a database that is not shaped the way the
 * configuration says - and the message alone does not say which. The name
 * does: ReferenceError against error. An Error with no more specific name
 * adds nothing, so it is left off.
 */
function describe(err) {
  const object = err !== null && typeof err === 'object';

  const stage = object && err.lifecycleStage ? err.lifecycleStage + ': ' : '';
  const name = object && err.name && err.name !== 'Error' ? err.name + ': ' : '';
  const message = (object && err.message) || String(err);
  const at = location(object && err.stack);

  return stage + name + message + (at ? ' [' + at + ']' : '');
}

/**
 * Names the stage a failure came out of, and changes nothing else.
 *
 * A job's stages are all recorded under the one job name, so a failed
 * `lifecycle_poll` may be the source read, the journal write, the profile
 * heal, the rebuild or the snapshot repair - five quite different problems,
 * reported identically. One word fixes that, and it is a word that survives
 * the thing the frame does not: a stack can be unhelpful, but the stage is
 * known by whoever called the work.
 *
 * The property is set by the INNERMOST stage to see the error, so wrapping a
 * stage inside another does not rename it on the way out.
 *
 * A thrown non-object carries nothing, and assigning a property to a frozen
 * error (or to a primitive, in strict mode) throws - from inside a catch
 * block, which would replace the real failure with this file's own. So the
 * assignment is guarded both ways and the error goes on unchanged if it
 * cannot take the name.
 */
async function stage(name, work) {
  try {
    return await work();
  } catch (err) {
    if (err !== null && typeof err === 'object' && !err.lifecycleStage) {
      try {
        err.lifecycleStage = name;
      } catch (frozen) {
        /* An error that will not be written on is still the error to throw. */
      }
    }

    throw err;
  }
}

module.exports = {
  describe: describe,
  stage: stage,

  /* Exported for the checks; nothing else reads them. */
  location: location,
  shorten: shorten
};
