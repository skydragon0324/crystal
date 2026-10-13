import React from 'react';
import { Box, Text } from '@chakra-ui/react';

import CrudPage from '../../components/CrudPage';
import SelectField from '../../components/SelectField';
import { terms } from '../../api';
import { useT } from '../../i18n';
import { dateTime } from '../../utils/format';

export const PAGE = '/admin/crm/terminology';

/** The languages a term is written in. A code is stored; the name is what is shown. */
const LANGUAGES = [
  { value: 'ko', label: 'Korean' },
  { value: 'en', label: 'English' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ru', label: 'Russian' }
];

/**
 * THE COMPANY'S TERMINOLOGY.
 *
 * One word for one thing in every workflow: each term, in its language, with
 * what it means and anything else worth saying - where it is used, what it is
 * not. The same term in another language is a row of its own, and a term
 * already defined in a language is refused a second time.
 */
export default function Terminology() {
  const t = useT();
  const languages = LANGUAGES.map((language) => ({ value: language.value, label: t(language.label) }));
  const languageName = (code) => (languages.filter((language) => language.value === code)[0] || { label: code }).label;

  return (
    <CrudPage
      page={PAGE}
      api={terms}
      defaultSort="term"
      formSize="2xl"
      formColumns={1}
      subtitle={t('crm.terminology.oneWordForOneThing')}
      searchPlaceholder={t('crm.terminology.searchTerms')}
      emptyRow={{ language: 'ko' }}
      filters={(list) => (
        <Box minW="9rem">
          <SelectField
            size="sm"
            value={list.params.language || null}
            onChange={(value) => list.setFilter({ language: value || undefined })}
            options={languages}
            placeholder={t('crm.terminology.allLanguages')}
            isSearchable={false}
          />
        </Box>
      )}
      columns={[
        { key: 'term', label: 'Term', sortable: true, render: (row) => <Text fontSize="xs" fontWeight="600">{row.term}</Text> },
        { key: 'language', label: 'Language', sortable: true, render: (row) => languageName(row.language) },
        { key: 'meaning', label: 'Meaning', render: (row) => <Text fontSize="xs" noOfLines={2} maxW="28rem">{row.meaning}</Text> },
        { key: 'description', label: 'Description', render: (row) => <Text fontSize="xs" noOfLines={2} maxW="28rem">{row.description || '-'}</Text> },
        { key: 'updated_at', label: 'Updated', sortable: true, render: (row) => dateTime(row.updated_at) }
      ]}
      fields={[
        { name: 'term', label: 'Term', required: true },
        { name: 'language', label: 'Language', type: 'select', required: true, options: languages },
        { name: 'meaning', label: 'Meaning', type: 'textarea', required: true },
        { name: 'description', label: 'Description', type: 'textarea', help: 'crm.terminology.descriptionHelp' }
      ]}
    />
  );
}
