import React from 'react';
import CrudPage from '../../components/CrudPage';
import StatusBadge from '../../components/StatusBadge';
import useOptions from '../../hooks/useOptions';
import { categories, faqs } from '../../api';
import { useT } from '../../i18n';
import { number } from '../../utils/format';

export const PAGE = '/admin/support/faqs';

/**
 * WHICH CRYSTAL SYSTEM a question is about.
 *
 * The same five the feedback threads are routed by, so a question and an
 * enquiry about the same thing are not filed under two different words - and
 * the same five the storefront draws its filter chips from, in this order.
 *
 * It used to be the TOPIC: warranty, repair, account, OS, order. A real axis,
 * but not the one a visitor arrives on - somebody with a set-top box problem
 * looks for the product in their hands, not for a subject heading. The topic
 * survives in the wording of the question, which is where it was already
 * being read.
 */
export const SYSTEMS = [
  { value: 'SMARTPHONE', label: 'Smartphones' },
  { value: 'EPRODUCT', label: 'Eproducts' },
  { value: 'ESHOP', label: 'Eshop' },
  { value: 'APPSTORE', label: 'Appstore' },
  { value: 'CRYSTAL_APP', label: 'Crystal App' }
];

/** The code as it is written on screen, or the code itself if it is a stray. */
export function systemLabel(code) {
  const found = SYSTEMS.filter((entry) => entry.value === code)[0];
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
  const { options: sections } = useOptions(() => categories.options(), []);

  return (
    <CrudPage
      page={PAGE}
      excel={true}
      api={faqs}
      defaultSort="sort_order"
      subtitle={t('support.faqs.filedByWhichCrystalSystem')}
      columns={[
        { key: 'category', label: 'Category', render: (row) => t(systemLabel(row.category)) },
        { key: 'question', label: 'Question', maxW: '23.75rem', wrap: true },
        { key: 'product_category_name', label: 'Section' },
        { key: 'view_count', label: 'Views', isNumeric: true, render: (row) => number(row.view_count) },
        { key: 'sort_order', label: 'Order', isNumeric: true },
        { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> }
      ]}
      formSize="2xl"
      fields={[
        {
          name: 'category', label: 'Category', type: 'select', required: true,
          options: SYSTEMS,
          help: 'Which Crystal system the question is about - the filter a visitor picks on the FAQ page.'
        },
        {
          name: 'product_category_id', label: 'Section', type: 'select',
          placeholder: 'every section',
          options: sections.map((row) => ({ value: row.id, label: row.name })),
          help: 'One level finer, and only meaningful under Smartphones and Eproducts.'
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
