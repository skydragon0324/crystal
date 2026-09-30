const axios = require('axios');
const config = require('../../config');
const webApi = require('./web.api');

/**
 * A LICENCE FILE, AS BYTES - fetched here so the browser never has to go to
 * the eproduct site itself.
 *
 * The member's page used to be handed the download script's URL and opened a
 * blank tab to point at it: a tab that flashes open and shut for what is a
 * file download, on a site the member has no session with and which is not
 * even configured in development. The file is now fetched server to server
 * and passed through Crystal's own authenticated endpoint, so the page can
 * save it in place - no new window, no cross-origin request, and the same
 * ownership check every other keygen action goes through.
 *
 * Its own module rather than a function in web.api.js because it is the one
 * call to that service that is not a JSON body: it wants raw bytes, which
 * config/remote.js deliberately does not return.
 */

/*
 * A licence is a few kilobytes. A reply much larger than this is not a
 * licence - most likely an error page or a runaway script - and relaying it
 * would tie up the API holding someone else's mistake in memory.
 */
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * { filename, type, bytes } for a keying's licence, or null where there is no
 * eproduct server to ask.
 *
 * THROWS when the server was asked and did not send a file - including when it
 * answered 200 with an HTML page, which is how a PHP script reports a missing
 * file far more often than with a status code. Saving an error page to disk
 * as `1244.lic` is the worst version of this: it looks like it worked.
 */
async function licenseFile(system, licensePath, row) {
  if (config.remote.mock) return mockFile(system, licensePath, row);

  const link = webApi.licenseUrl(system, licensePath);
  if (!link) return null;

  const response = await axios.get(link.url, {
    responseType: 'arraybuffer',
    timeout: config.remote.timeout,
    maxContentLength: MAX_BYTES
  });

  const type = String(response.headers['content-type'] || 'application/octet-stream');
  const bytes = Buffer.from(response.data);

  if (!bytes.length || /^text\/html/i.test(type)) {
    const err = new Error('the eproduct service answered ' + (type || 'nothing') + ' instead of a licence file');
    err.notAFile = true;
    throw err;
  }

  return { filename: link.filename, type: type, bytes: bytes };
}

/**
 * THE STAND-IN, with REMOTE_MOCK on - the download is part of the service
 * that is mocked, so it is answered in process like every other call to it.
 *
 * A short text file that says what it is. The real licence format is the
 * eproduct application's own and nothing on this side reads it; what matters
 * in development is that a file with the right NAME arrives through the same
 * route, headers and ownership check as the real one.
 */
function mockFile(system, licensePath, row) {
  const filename = String(licensePath || '').split(/[\\/]/).pop() || 'licence.lic';

  const text = [
    'CRYSTAL LICENCE - development stand-in, not a working licence',
    'system: ' + system,
    'licence: ' + (row && row.id ? row.id : filename.replace(/\.[^.]*$/, '')),
    'file: ' + filename,
    ''
  ].join('\n');

  return { filename: filename, type: 'application/octet-stream', bytes: Buffer.from(text, 'utf8') };
}

module.exports = { licenseFile: licenseFile };
