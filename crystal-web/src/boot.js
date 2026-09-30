/**
 * What styles/app.css needs to know about the browser it landed in.
 *
 * A feature test rather than version sniffing: this console supports Chrome
 * 72 and up, but "72" is not the question - "does this build of this browser
 * have the feature" is, and that answer stays right when the floor moves.
 */

/**
 * Does `gap` do anything on a flex container?
 *
 * It did not ship until Chrome 84, and a property a browser does not know is
 * dropped silently - so on Chrome 72 every toolbar and button group loses its
 * spacing and the contents run together.
 *
 * Two stacked one-pixel children in a column with a one-pixel row gap come to
 * three pixels where it works and two where it does not.  The probe is put
 * somewhere it cannot be seen or scrolled to, measured, and removed in the
 * same tick, so nothing flashes.
 */
function supportsFlexGap() {
  if (typeof document === 'undefined' || !document.body) return true;

  const probe = document.createElement('div');
  probe.style.cssText =
    'display:flex;flex-direction:column;row-gap:1px;position:absolute;' +
    'visibility:hidden;height:auto;width:0;top:-9999px;left:-9999px';

  probe.appendChild(document.createElement('div'));
  probe.appendChild(document.createElement('div'));
  probe.firstChild.style.height = '1px';
  probe.lastChild.style.height = '1px';

  document.body.appendChild(probe);
  const supported = probe.scrollHeight === 3;
  document.body.removeChild(probe);

  return supported;
}

export default function boot() {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  if (!supportsFlexGap()) root.classList.add('no-flex-gap');
}

export { supportsFlexGap };
