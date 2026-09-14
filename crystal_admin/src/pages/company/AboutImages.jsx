import React from 'react';

import CrudPage from '../../components/CrudPage';
import { aboutImages } from '../../api';
import { useT } from '../../i18n';

export const PAGE = '/admin/company/about-images';

/**
 * THE ABOUT PAGE'S PICTURES - the one thing left to edit on it.
 *
 * There were ten screens here, one per chapter, and between them they edited
 * every word on /about. The words are in crystal-web/src/pages/about/
 * content.js now, under review with the rest of the project, because a company
 * introduction is rewritten every few years by somebody who cares about the
 * wording rather than typed into a form. See sql/deltas/019.
 *
 * What could not move is the photographs, so this screen edits those.
 *
 * `slot` IS FREE TEXT, and that is deliberate. It is the address the page asks
 * for a picture by - 'hero', 'factory.floor', 'certificate' - and the PAGE
 * decides what it asks for. An unknown slot is a picture nothing renders,
 * which is visible here and harmless; a fixed list would mean a migration
 * every time the page gains a band.
 */
export default function AboutImages() {
  const t = useT();

  return (
    <CrudPage
      page={PAGE}
      title={t('company.aboutimages.aboutImages')}
      subtitle={t('company.aboutimages.theOnlyPartOfThe')}
      api={aboutImages}
      defaultSort="sort_order"
      excel={true}
      columns={[
        { key: 'slot', label: 'Slot', maxW: '10rem' },
        {
          key: 'file_path', label: 'Picture', type: 'image',
          render: (row) => row.file_path
        },
        { key: 'alt_text', label: 'Alt text', maxW: '16.25rem' },
        { key: 'caption', label: 'Caption', maxW: '12.5rem' },
        { key: 'sort_order', label: 'Order', isNumeric: true }
      ]}
      fields={[
        {
          name: 'slot', label: 'Slot', required: true, span: 2,
          placeholder: 'hero, factory.floor, certificate',
          help: 'Where on the page this picture goes. The page asks by this exact name.'
        },
        { name: 'file_path', label: 'Picture', type: 'image', folder: 'about', required: true, span: 2 },
        {
          name: 'file_path_dark', label: 'Picture (dark mode)', type: 'image', folder: 'about', span: 2,
          help: 'Optional. Leave empty for a photograph - only a diagram or a map has a dark rendering.'
        },
        {
          name: 'alt_text', label: 'Alt text', span: 2,
          help: 'Read out in place of the picture.'
        },
        {
          name: 'caption', label: 'Caption', span: 2,
          help: 'Shown under a gallery picture. Leave empty where the page writes its own.'
        },
        { name: 'sort_order', label: 'Order', type: 'number' },
        {
          name: 'status', label: 'Status', type: 'select',
          options: [
            { value: 'ACTIVE', label: 'Active' },
            { value: 'INACTIVE', label: 'Inactive' }
          ]
        }
      ]}
    />
  );
}
