'use strict';

/**
 * Device detection from the User-Agent (spec 5).
 *
 * The result decides which authentication method a client may use: desktop
 * logs in with email + password, mobile with phone + OTP. Tablets are treated
 * as their own class but are allowed either method, because a tablet may or
 * may not have a SIM.
 *
 * Order matters - every Android tablet UA also contains "Android", and iPad
 * UAs on recent iPadOS look like desktop Safari unless the touch hint is
 * checked first.
 */

const TABLET_PATTERNS = [
  /\bipad\b/i,
  /\btablet\b/i,
  /\bplaybook\b/i,
  /\b(kindle|silk)\b/i,
  /android(?!.*\bmobile\b)/i
];

const MOBILE_PATTERNS = [
  /\bmobile\b/i,
  /\biphone\b/i,
  /\bipod\b/i,
  /\bandroid\b.*\bmobile\b/i,
  /\b(blackberry|bb10|windows phone|iemobile|opera mini|opera mobi)\b/i
];

const DESKTOP = 'desktop';
const MOBILE = 'mobile';
const TABLET = 'tablet';

function detect(userAgent) {
  const ua = String(userAgent || '');
  if (!ua) return DESKTOP;

  for (let i = 0; i < TABLET_PATTERNS.length; i++) {
    if (TABLET_PATTERNS[i].test(ua)) return TABLET;
  }
  for (let j = 0; j < MOBILE_PATTERNS.length; j++) {
    if (MOBILE_PATTERNS[j].test(ua)) return MOBILE;
  }
  return DESKTOP;
}

/** Which auth types a device class may use. */
function allowedAuthTypes(device) {
  switch (device) {
    case MOBILE: return ['otp'];
    case TABLET: return ['password', 'otp'];
    default: return ['password'];
  }
}

function supports(device, authType) {
  return allowedAuthTypes(device).indexOf(authType) !== -1;
}

/** Media assets are stored per device; tablets read the desktop artwork. */
function mediaDeviceFor(device) {
  return device === MOBILE ? 'mobile' : 'desktop';
}

module.exports = {
  DESKTOP: DESKTOP,
  MOBILE: MOBILE,
  TABLET: TABLET,
  detect: detect,
  allowedAuthTypes: allowedAuthTypes,
  supports: supports,
  mediaDeviceFor: mediaDeviceFor
};
