import React from 'react';
import { Text } from '@chakra-ui/react';

import CrudPage from '../../../components/CrudPage';
import { terms } from '../../../api';
import { useT } from '../../../i18n';
import { dateTime } from '../../../utils/format';

export const PAGE = '/admin/crm/terminology';

/**
 * THE LANGUAGE A TERM IS STORED UNDER.
 *
 * The screen no longer asks for it: a company has one terminology, and
 * choosing a language for every word - then filtering by it, then reading a
 * column of it - was three places to answer a question nobody here is asking.
 *
 * The COLUMN is still NOT NULL, so every row still gets a value, and this is
 * the one place that says which. If a second language is ever wanted, the
 * field and the filter come back here; nothing in the database has to change
 * for it, which is why the column was left alone.
 */
const STORED_LANGUAGE = 'ko';

/**
 * THE COMPANY'S TERMINOLOGY.
 *
 * One word for one thing in every workflow: each term, with what it means and
 * anything else worth saying - where it is used, what it is not.
 */
export default function Terminology() {
  const t = useT();

  return (
    <CrudPage
      page={PAGE}
      api={terms}
      defaultSort="term"
      formSize="2xl"
      formColumns={1}
      subtitle={t('crm.terminology.oneWordForOneThing')}
      searchPlaceholder={t('crm.terminology.searchTerms')}
      /* Seeds the create form, so the NOT NULL column is filled without a
         field for it - see STORED_LANGUAGE. An edit sends only the fields
         below, so an existing row keeps whatever language it was stored in. */
      emptyRow={{ language: STORED_LANGUAGE }}
      columns={[
        { key: 'term', label: 'Term', sortable: true, render: (row) => <Text fontSize="xs" fontWeight="600">{row.term}</Text> },
        { key: 'meaning', label: 'Meaning', render: (row) => <Text fontSize="xs" noOfLines={2} maxW="28rem">{row.meaning}</Text> },
        { key: 'description', label: 'Description', render: (row) => <Text fontSize="xs" noOfLines={2} maxW="28rem">{row.description || '-'}</Text> },
        { key: 'updated_at', label: 'Updated', sortable: true, render: (row) => dateTime(row.updated_at) }
      ]}
      fields={[
        { name: 'term', label: 'Term', required: true },
        { name: 'meaning', label: 'Meaning', type: 'textarea', required: true },
        { name: 'description', label: 'Description', type: 'textarea', help: 'crm.terminology.descriptionHelp' }
      ]}
    />
  );
}
