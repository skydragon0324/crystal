import React from 'react';
import { Text } from '@chakra-ui/react';
import { useI18n } from '../i18n';

/**
 * The product's own name.
 *
 * Two halves, because the second is drawn lighter than the first - and one
 * component, because the sign-in screen and the sidebar both show it. They
 * were two copies of the same markup, so renaming the app meant remembering
 * both, and translating it meant translating it twice.
 *
 * `short` is the collapsed sidebar's version: initials, where the full name
 * has no room.
 */
export default function AppName({ short }) {
  const { t } = useI18n();

  if (short) return <>{t('components.appname.cr')}</>;

  return (
    <>
      {t('components.appname.crystal')}
      <Text as="span" fontWeight="300">{t('components.appname.console')}</Text>
    </>
  );
}
