'use strict';

/**
 * Deliberately tiny. The locked dependency list has no logging library, and a
 * timestamped console line is all this API needs.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[process.env.LOG_LEVEL] || LEVELS.info;

function stamp() {
  return new Date().toISOString();
}

function emit(level, args) {
  if (LEVELS[level] < threshold) return;
  const prefix = '[' + stamp() + '] ' + level.toUpperCase().padEnd(5) + ' ';
  const target = level === 'error' || level === 'warn' ? console.error : console.log;
  target.apply(console, [prefix].concat(Array.prototype.slice.call(args)));
}

module.exports = {
  debug: function () { emit('debug', arguments); },
  info: function () { emit('info', arguments); },
  warn: function () { emit('warn', arguments); },
  error: function () { emit('error', arguments); }
};
