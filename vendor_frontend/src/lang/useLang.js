import { useCallback, useEffect, useState } from 'react';
import {
  formatCurrency, formatDate, formatNumber, getEnumText, getLangPlural,
  getLangText, getLocale, getLocales, setLocale, subscribeLocale,
} from './lang';

/**
 * React binding for the i18n runtime.
 *
 * Components that only ever render one language can keep calling
 * getLangText directly - it is a plain function and always returns the
 * active language. This hook exists for the case that function cannot
 * cover: a component has to re-render when the language changes, and
 * React has no way to know that a module-level variable moved.
 *
 * Subscribing per component rather than putting the locale in a context
 * provider keeps the tree free of a wrapper, and the callback list is
 * short - only components that actually opt in are on it.
 *
 *   const { t, locale, locales, setLocale } = useLang();
 *   <Text>{t('MENU_ACCOUNT')}</Text>
 */
const useLang = () => {
  const [locale, setLocaleState] = useState(getLocale);

  useEffect(() => subscribeLocale(setLocaleState), []);

  // Rebuilt when `locale` changes so a memo that lists `t` in its
  // dependencies recomputes on a language switch. Without the dependency
  // a useMemo'd column list would keep the old language's headers.
  const t = useCallback(
    (key, replacements) => getLangText(key, replacements),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale]
  );

  return {
    t,
    locale,
    locales: getLocales(),
    setLocale,
    plural: getLangPlural,
    enumText: getEnumText,
    formatNumber,
    formatCurrency,
    formatDate,
  };
};

export default useLang;
