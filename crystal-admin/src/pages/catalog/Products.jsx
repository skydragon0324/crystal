import React from 'react';
import { useHistory } from 'react-router-dom';
import { Box, Text } from '@chakra-ui/react';

import CrudPage from '../../components/CrudPage';
import StatusBadge from '../../components/StatusBadge';
import useOptions from '../../hooks/useOptions';
import { categories, products, series } from '../../api';
import { useT } from '../../i18n';
import { date, money } from '../../utils/format';

export const PAGE = '/admin/catalog/products';
export const SMARTPHONE_PAGE = '/admin/catalog/products/smartphone';
export const EPRODUCT_PAGE = '/admin/catalog/products/eproduct';

/**
 * The catalogue, ONE SECTION AT A TIME.
 *
 * Smartphones and eproducts are run by different managers, so they are two
 * pages granted separately in the permission grid rather than one list with
 * a filter on top. The grid inherits down a url prefix, so a role granted
 * the parent `/admin/catalog/products` still gets both.
 *
 * The `section` rides on every request, and the SERVER decides what it
 * means: it checks the permission of the page for that section and then
 * pins the category-type filter from the page it authorised, so the filter
 * cannot be widened by a second query parameter. See middleware/section.js.
 *
 * A row opens the editor rather than a modal, because a product is six tabs
 * - specifications, images, finishes, repair pricing, software updates -
 * and none of those fit in a dialog.
 */
export default function Products({ section }) {
  const t = useT();
  const history = useHistory();

  const scope = section || 'SMARTPHONE';
  const isPhones = scope === 'SMARTPHONE';

  /*
   * The section dropdown only offers what this page owns. On the eproduct
   * page that is the four non-phone sections; on the smartphone page there
   * is nothing to choose, so the filter is left off entirely.
   */
  const { options: allSections } = useOptions(() => categories.options(), []);
  const { options: lines } = useOptions(() => series.list({ limit: 100 }), []);

  const sections = allSections.filter((row) => (
    isPhones ? row.type === 'SMARTPHONE' : row.type !== 'SMARTPHONE'
  ));

  /*
   * THE SERIES LIST IS SCOPED THE SAME WAY THE SECTIONS ARE.
   *
   * A series belongs to a section, and this page owns half the sections - so
   * it owns half the series. Offering all of them meant the smartphone page
   * listed television series, and choosing one filed a handset under a series
   * belonging to a section it was not in. The dropdown now offers only what
   * can legally be picked here.
   */
  const seriesForScope = lines.filter((row) => (
    isPhones ? row.category_type === 'SMARTPHONE' : row.category_type !== 'SMARTPHONE'
  ));

  const seriesOptions = seriesForScope.map((row) => ({
    value: row.id,
    /* The section qualifies the name: two sections can both have a "C series". */
    label: row.category_name ? row.name + ' · ' + row.category_name : row.name
  }));

  return (
    <CrudPage
      page={isPhones ? SMARTPHONE_PAGE : EPRODUCT_PAGE}
      params={{ section: scope }}
      title={t(isPhones ? 'Smartphones' : 'Eproducts')}
      excel={true}
      api={products}
      defaultSort="sort_order"
      subtitle={t('catalog.products.onlyOneProductCanBe')}
      /*
       * DOUBLE click opens the product, not single.
       *
       * A single click on a row of a list you are scanning is how somebody
       * ends up on a detail page they did not want, and the way back loses
       * the page and the search they were on. The tooltip says so, because a
       * single click that does nothing otherwise reads as a broken table.
       */
      onRowDoubleClick={(row) => history.push(PAGE + '/' + row.id)}
      rowHint={t('catalog.products.doubleClickToOpenThis')}
      columns={[
        {
          key: 'name', label: 'Product', maxW: '14.375rem',
          render: (row) => (
            <Box>
              <Text fontSize="xs" fontWeight="600" noOfLines={1}>{row.name}</Text>
              <Text fontSize="0.65rem" color="gray.500">{row.slug}</Text>
            </Box>
          )
        },
        { key: 'model_code', label: 'Model code' },
        { key: 'category_name', label: 'Section' },
        { key: 'series_name', label: 'Series' },
        { key: 'price', label: 'Price', isNumeric: true, render: (row) => money(row.price, row.currency) },
        { key: 'warranty_months', label: 'Warranty', isNumeric: true, render: (row) => row.warranty_months + 'm' },
        { key: 'spec_cnt', label: 'Specs', isNumeric: true },
        { key: 'media_cnt', label: 'Media', isNumeric: true },
        { key: 'price_cnt', label: 'Repair prices', isNumeric: true },
        { key: 'release_date', label: 'Released', render: (row) => date(row.release_date) },
        {
          key: 'status', label: 'Status',
          render: (row) => (
            <Box>
              <StatusBadge value={row.status} />
              {row.is_hero && <StatusBadge value="WATCH" label={t('common.hero')} ml={1} />}
            </Box>
          )
        }
      ]}
      fields={[
        { name: 'name', label: 'Name', required: true },
        { name: 'slug', label: 'Slug' },
        {
          name: 'category_id', label: 'Section', type: 'select', required: true,
          options: sections.map((row) => ({ value: row.id, label: row.name }))
        },
        {
          name: 'series_id', label: 'Series', type: 'select',
          options: seriesOptions
        },
        { name: 'model_code', label: 'Model code', placeholder: 'what the warehouse calls it' },
        { name: 'price', label: 'Price', type: 'number', step: '0.01' },
        { name: 'warranty_months', label: 'Standard warranty (months)', type: 'number' },
        { name: 'release_date', label: 'Released', type: 'date' },
        {
          name: 'status', label: 'Status', type: 'select',
          options: [
            { value: 'DRAFT', label: 'Draft' },
            { value: 'PUBLISHED', label: 'Published' },
            { value: 'ARCHIVED', label: 'Archived' }
          ]
        },
        { name: 'sort_order', label: 'Order', type: 'number' },
        { name: 'tagline', label: 'Tagline', span: 2 },
        { name: 'main_image', label: 'Main image (desktop)', type: 'image', folder: 'products', span: 2 },
        { name: 'main_image_mobile', label: 'Main image (mobile)', type: 'image', folder: 'products', span: 2 },
        { name: 'description', label: 'Description', type: 'textarea', span: 2 },
        { name: 'is_featured', label: 'Featured', type: 'checkbox' },
        {
          name: 'show_service_pricing', label: 'Publish the service price list', type: 'checkbox',
          help: 'Off hides the Service pricing tab on the website, even where prices exist.'
        },
        {
          name: 'is_hero', label: 'Hero of its section', type: 'checkbox',
          help: 'The fallback product promoted at the top of this category. A section advert takes priority when one is active.'
        }
      ]}
    />
  );
}

/** The two screens, so the router and the permission grid can name each. */
export function SmartphoneProducts() {
  return <Products section="SMARTPHONE" />;
}

export function EproductProducts() {
  return <Products section="EPRODUCT" />;
}
