import React from 'react';
import CrudPage from '../../components/CrudPage';
import StatusBadge from '../../components/StatusBadge';
import { faqs } from '../../api';
import { useT } from '../../i18n';
import { number } from '../../utils/format';

export const PAGE = '/admin/support/faqs';

/**
 * WHAT A QUESTION IS ABOUT: the product kind in the visitor's hands - the
 * five the catalogue sells - then the three Crystal services that are not
 * products. The same eight, in the same order, as the storefront's filter
 * chips and the `faq_category` type (sql/deltas/033).
 *
 * It was the TOPIC once (warranty, repair, account), and then the SYSTEM -
 * Smartphones, Eproducts, Eshop, Appstore, Crystal App - with a SECTION field
 * beside it to say which eproduct a question was really about. That was one
 * answer filed twice, and the section was the field nobody could fill in with
 * confidence; the category says it now, so the section is gone from the form,
 * the list and the API.
 */
export const CATEGORIES = [
  { value: 'SMARTPHONE', label: 'Smartphones' },
  { value: 'TV', label: 'TV' },
  { value: 'STB', label: 'STB' },
  { value: 'COMPUTER', label: 'Computer' },
  { value: 'CAMERA', label: 'Secure Camera' },
  { value: 'CRYSTAL_APP', label: 'Crystal App' },
  { value: 'ESHOP', label: 'Eshop' },
  { value: 'APPSTORE', label: 'Appstore' }
];

/** The code as it is written on screen, or the code itself if it is a stray. */
export function categoryLabel(code) {
  const found = CATEGORIES.filter((entry) => entry.value === code)[0];
  return found ? found.label : code;
}

/**
 * The FAQ.
 *
 * `view_count` is what the storefront's "Popular Problems" block is ordered
 * by, so it is shown here: the questions people actually read are the ones
 * worth keeping accurate.
 */
export default function Faqs() {
  const t = useT();

  return (
    <CrudPage
      page={PAGE}
      excel={true}
      api={faqs}
      defaultSort="sort_order"
      subtitle={t('support.faqs.filedByTheProductOr')}
      columns={[
        { key: 'category', label: 'Category', render: (row) => t(categoryLabel(row.category)) },
        { key: 'question', label: 'Question', maxW: '23.75rem', wrap: true },
        { key: 'view_count', label: 'Views', isNumeric: true, render: (row) => number(row.view_count) },
        { key: 'sort_order', label: 'Order', isNumeric: true },
        { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> }
      ]}
      formSize="2xl"
      fields={[
        {
          name: 'category', label: 'Category', type: 'select', required: true,
          options: CATEGORIES,
          help: 'support.faqs.theProductOrServiceThe'
        },
        { name: 'question', label: 'Question', required: true, span: 2 },
        { name: 'answer', label: 'Answer', type: 'textarea', rows: 8, required: true, span: 2 },
        { name: 'sort_order', label: 'Order', type: 'number' },
        {
          name: 'status', label: 'Status', type: 'select',
          options: [{ value: 'PUBLISHED', label: 'Published' }, { value: 'DRAFT', label: 'Draft' }]
        }
      ]}
    />
  );
}
