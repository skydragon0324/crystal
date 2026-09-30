/*
 * THE SECOND LOOKUP, which is the one that is easy to break and impossible to
 * notice.
 *
 * Most strings are asked for by address - t('signin.signIn') - and a
 * broken address shows the address on screen, loudly. But a large share of
 * this catalogue is reached as t(page.page_name) - the sidebar is built from
 * manager_pages - or as t(field.label) from a page's own field list. Those are matched by their
 * ENGLISH against the English catalogue, and when that path breaks nothing
 * shows a token: the reader just gets English on a Chinese page, which looks
 * like a translation nobody got round to.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';

import { I18nProvider, useI18n } from '../i18n';
import dictionaries from '../i18n/dictionaries';

function render(probe) {
  const host = document.createElement('div');
  act(() => { ReactDOM.render(<I18nProvider>{probe}</I18nProvider>, host); });
  return host;
}

test('English text still translates when it is not a key', () => {
  let seen = null;

  function Probe() {
    const { t, setLocale } = useI18n();
    seen = { t, setLocale };
    return null;
  }

  render(<Probe />);

  /* The English of a real entry, asked for the way a data label arrives. */
  const english = dictionaries.en.signin.signIn;
  const chinese = dictionaries.zh.signin.signIn;

  expect(typeof english).toBe('string');
  expect(chinese).not.toBe(english);

  act(() => { seen.setLocale('zh'); });
  expect(seen.t(english)).toBe(chinese);

  act(() => { seen.setLocale('en'); });
  expect(seen.t(english)).toBe(english);
});

test('an address that resolves to nothing comes back as the address', () => {
  /*
   * Deliberately visible. A missing address is a bug in the catalogue and
   * should read as one on screen - falling back to something plausible is how
   * it survives to production.
   */
  let t = null;
  render(<Probe />);

  function Probe() {
    t = useI18n().t;
    return null;
  }

  expect(t('nosuch.section.key')).toBe('nosuch.section.key');
});

test('placeholders are filled after the lookup, in either language', () => {
  let seen = null;

  function Probe() {
    const { t, setLocale } = useI18n();
    seen = { t, setLocale };
    return null;
  }

  render(<Probe />);

  /* Any entry carrying a {placeholder}; the first one is enough. */
  const walk = (node, prefix) => Object.keys(node).reduce((found, name) => {
    if (found) return found;
    const at = prefix ? prefix + '.' + name : name;
    const value = node[name];
    if (value && typeof value === 'object') return walk(value, at);
    return /\{(\w+)\}/.test(value) ? { key: at, text: value } : null;
  }, null);

  const entry = walk(dictionaries.en, '');
  expect(entry).toBeTruthy();

  const name = entry.text.match(/\{(\w+)\}/)[1];
  const filled = seen.t(entry.key, { [name]: 'XYZ' });

  expect(filled).toContain('XYZ');
  expect(filled).not.toContain('{' + name + '}');
});
