'use strict';

/**
 * Runs before everything else so `req.device` is available to auth (which
 * method is allowed) and to the content services (which artwork to serve).
 *
 * A client may override the detected class with `X-Crystal-Device`. That is
 * how the responsive frontend asks for mobile artwork while running in a
 * desktop browser at a narrow width - it never affects which credentials are
 * accepted, only which media is returned, because the auth check reads
 * `req.device.detected` rather than the override.
 */

const deviceUtil = require('../utils/device');

module.exports = function deviceMiddleware(req, res, next) {
  const detected = deviceUtil.detect(req.headers['user-agent']);
  const requested = String(req.headers['x-crystal-device'] || '').toLowerCase();
  const valid = [deviceUtil.DESKTOP, deviceUtil.MOBILE, deviceUtil.TABLET];
  const effective = valid.indexOf(requested) !== -1 ? requested : detected;

  req.device = {
    detected: detected,
    effective: effective,
    isMobile: effective === deviceUtil.MOBILE,
    isTablet: effective === deviceUtil.TABLET,
    isDesktop: effective === deviceUtil.DESKTOP,
    mediaDevice: deviceUtil.mediaDeviceFor(effective)
  };

  res.set('X-Crystal-Device-Detected', detected);
  next();
};
