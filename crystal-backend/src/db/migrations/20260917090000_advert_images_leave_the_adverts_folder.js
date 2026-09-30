'use strict';

/**
 * THE ADVERT IMAGES LEAVE /uploads/adverts/ - because ad blockers block it.
 *
 * Every mainstream filter list (EasyList, which AdBlock, Adblock Plus and uBlock
 * Origin all ship) blocks requests whose address contains `/adverts/`. The
 * homepage's advert run was served from /uploads/adverts/, so for anybody with
 * an ad blocker the homepage hero was simply not there - and neither was the
 * thumbnail on the console's Homepage adverts screen, which is how it was found:
 * a picture that uploaded, saved, signed and verified, and was still invisible
 * in the one browser that mattered. The files move to /uploads/showcase/, and
 * the API routes that carried the word move with them (site/showcase,
 * admin/showcase). The table, the console pages and the code keep their names;
 * only addresses a browser requests had to change.
 *
 * A SIGNATURE CANNOT SIMPLY BE RE-POINTED. An image's signed payload includes
 * its storage path, so the signature made for /uploads/adverts/x.png is, by
 * design, invalid for /uploads/showcase/x.png. So each image is CHECKED against
 * its existing signature first - the bytes on disk, under the old path - and
 * only if that verifies is it moved and signed again under the new path. An
 * image whose signature does not verify is still moved (its row has to follow
 * it) but is NOT re-signed: it stays invalid and the audit reports it, exactly
 * as it would have before the move. A move must never launder a tampered file.
 *
 * WHEN SIGNING IS NOT CONFIGURED where the migration runs (a throwaway build in
 * `npm run migrate:verify`, which has no advert rows anyway), the files and rows
 * still move and the signatures are left as they are, so `npm run sign:audit`
 * shows them invalid rather than silently trusted. Run the migration where the
 * API's signing configuration is available.
 */

const fs = require('fs');
const path = require('path');

const config = require('../../config');
const imageFile = require('../../security/imageFile');

const OLD_PREFIX = '/uploads/adverts/';
const NEW_PREFIX = '/uploads/showcase/';

function signing() {
  try {
    const signingService = require('../../security/signingService');
    signingService.assertReady();
    return signingService.service();
  } catch (err) {
    return null;
  }
}

async function move(knex, fromPrefix, toPrefix) {
  const rows = await knex('site_adverts')
    .where('file_path', 'like', fromPrefix + '%')
    .distinct('file_path');

  const signed = await knex('content_signatures')
    .where('content_type', 'image')
    .andWhere('content_ref', 'like', fromPrefix + '%')
    .select('content_ref');

  /* Every path the move concerns: those a row points at, and signed orphans. */
  const paths = Array.from(new Set(
    rows.map(function (r) { return r.file_path; })
      .concat(signed.map(function (s) { return s.content_ref; }))
  ));

  if (!paths.length) return;

  const service = signing();
  const uploadDir = config.storage.uploadDir;
  const report = { moved: 0, resigned: 0, notResigned: [] };

  for (let i = 0; i < paths.length; i += 1) {
    const from = paths[i];
    const to = toPrefix + from.slice(fromPrefix.length);

    /* 1. Verify under the OLD path, before anything changes. */
    let verified = false;
    if (service) {
      try {
        const content = await imageFile.describe(from, uploadDir);
        /* Through the migration's own transaction, so the check and the move agree. */
        const result = await service.check('image', from, content, knex);
        verified = result.status === service.STATUS.VALID;
      } catch (err) {
        verified = false;
      }
    }

    /* 2. Move the file, if it is there. */
    const oldFile = imageFile.absolutePath(from, uploadDir);
    const newFile = imageFile.absolutePath(to, uploadDir);
    if (oldFile && newFile && fs.existsSync(oldFile)) {
      fs.mkdirSync(path.dirname(newFile), { recursive: true });
      fs.renameSync(oldFile, newFile);
      report.moved += 1;
    }

    /* 3. The rows follow the file - soft-deleted ones too, so a restore still finds it. */
    await knex('site_adverts').where('file_path', from).update({ file_path: to });

    /* 4. Re-sign only what verified; otherwise carry the old signature, which will not verify. */
    if (verified) {
      const content = await imageFile.describe(to, uploadDir);
      await service.sign('image', to, content, knex);
      await service.forget('image', from, knex);
      report.resigned += 1;
    } else {
      await knex('content_signatures')
        .where({ content_type: 'image', content_ref: from })
        .update({ content_ref: to });
      report.notResigned.push(to);
    }
  }

  console.log('advert images: ' + paths.length + ' path(s), ' + report.moved + ' file(s) moved, '
    + report.resigned + ' re-signed' + (service ? '' : ' (signing not configured here)')
    + (report.notResigned.length ? '; NOT re-signed (did not verify, or no signing): ' + report.notResigned.join(', ') : ''));
}

exports.up = function up(knex) {
  return move(knex, OLD_PREFIX, NEW_PREFIX);
};

exports.down = function down(knex) {
  return move(knex, NEW_PREFIX, OLD_PREFIX);
};
