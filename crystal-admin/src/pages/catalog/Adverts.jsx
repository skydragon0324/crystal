import React from 'react';
import { Box, Link, Text } from '@chakra-ui/react';

import CrudPage from '../../components/CrudPage';
import SelectField from '../../components/SelectField';
import StatusBadge from '../../components/StatusBadge';
import MediaThumb from '../../components/MediaThumb';
import { homeAdverts, smartphoneAdverts } from '../../api';
import { useT } from '../../i18n';

export const HOME_PAGE = '/admin/catalog/adverts/home';
export const SMARTPHONE_PAGE = '/admin/catalog/adverts/smartphone';

const DEVICES = [
  { value: 'desktop', label: 'Desktop' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'all', label: 'Both' }
];

/**
 * THE ADVERTISING AT THE TOP OF A PAGE - the homepage's run, or the
 * smartphone page's.
 *
 * NOT THE MEDIA LIBRARY. Every picture there belongs to something - a product,
 * a series, a category - and an advert belongs to nothing: it is artwork with
 * its copy burnt in and somewhere to go. The homepage used to borrow the
 * flagged smartphone's photographs for want of this.
 *
 * TWO PAGES, ONE SCREEN. The runs are kept by different people, so each is a
 * page with its own grant, and the API pins each page to its placement - the
 * homepage screen cannot open a smartphone advert even by its id.
 *
 * A crop per device, because a banner drawn for a desktop is a strip on a
 * phone. The website sends each device its own crops plus the ones marked for
 * both, in `Order`.
 */
export default function Adverts({ placement }) {
  const t = useT();

  const isHome = placement !== 'SMARTPHONE';
  const deviceOptions = DEVICES.map((entry) => ({ value: entry.value, label: t(entry.label) }));

  return (
    <CrudPage
      page={isHome ? HOME_PAGE : SMARTPHONE_PAGE}
      title={t(isHome ? 'Homepage adverts' : 'Smartphone adverts')}
      subtitle={t(isHome ? 'catalog.adverts.theHomepageRun' : 'catalog.adverts.theSmartphoneRun')}
      api={isHome ? homeAdverts : smartphoneAdverts}
      canRestore={false}
      defaultSort="sort_order"
      defaultDir="asc"
      /* One crop at a time is how an editor checks a run reads in order. */
      filters={(list) => (
        <Box minW="11rem">
          <SelectField
            size="sm"
            value={list.params.device_type || null}
            onChange={(value) => list.setFilter({ device_type: value || undefined })}
            options={deviceOptions}
            placeholder={t('catalog.media.everyDevice')}
            isSearchable={false}
          />
        </Box>
      )}
      columns={[
        {
          key: 'file_path', label: 'Picture', width: '7.5rem', sortable: false,
          render: (row) => <MediaThumb path={row.file_path} alt={row.alt_text} />
        },
        {
          key: 'device_type', label: 'Crop',
          render: (row) => (
            <StatusBadge
              value={row.device_type === 'all' ? 'OK' : 'NORMAL'}
              label={t((DEVICES.filter((entry) => entry.value === row.device_type)[0] || DEVICES[2]).label)}
            />
          )
        },
        {
          key: 'alt_text', label: 'Alt text', maxW: '16rem',
          render: (row) => <Text fontSize="xs" noOfLines={1}>{row.alt_text || '-'}</Text>
        },
        {
          key: 'link_url', label: 'Goes to', maxW: '14rem', sortable: false,
          render: (row) => (row.link_url
            ? <Link fontSize="xs" fontFamily="mono" noOfLines={1} href={row.link_url} isExternal>{row.link_url}</Link>
            : <Text fontSize="xs" color="gray.500">-</Text>)
        },
        { key: 'sort_order', label: 'Order', isNumeric: true },
        { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> }
      ]}
      fields={[
        {
          name: 'file_path', label: 'Picture or video', type: 'media', folder: 'showcase',
          required: true, span: 2,
          help: 'A picture, an animated GIF, or a short MP4 or WebM film. A film plays by itself, silently, with a button to turn the sound on.'
        },
        { name: 'device_type', label: 'Crop', type: 'select', required: true, options: DEVICES },
        { name: 'sort_order', label: 'Order', type: 'number' },
        {
          name: 'alt_text', label: 'Alt text', span: 2,
          help: 'Read out in place of the picture. The visible copy is in the artwork itself.'
        },
        {
          name: 'link_url', label: 'Goes to', span: 2,
          help: 'A path on the website such as /smartphones/products/c9-pro, or a full address. Leave it empty for a slide that is not a link.'
        },
        {
          name: 'status', label: 'Status', type: 'select',
          options: [
            { value: 'ACTIVE', label: 'Active' },
            { value: 'INACTIVE', label: 'Inactive' }
          ]
        },
        /*
         * AND THE ADVERT CAN MOVE BY ITSELF.
         *
         * A scene is a background with layers arriving over it, each with its
         * own motion - built and previewed here, stored as JSON on this row,
         * drawn by the storefront's ImageAnimator. When there is one it is
         * what a visitor sees; the picture above stays as the still, which is
         * what somebody who has asked their system for less movement gets.
         */
        {
          name: 'scene', label: 'Animated scene', type: 'scene', folder: 'showcase', span: 2,
          help: 'Leave this alone for an ordinary advert. A scene replaces the picture with a background and layers that move.'
        }
      ]}
    />
  );
}

export function HomeAdverts() {
  return <Adverts placement="HOME" />;
}

export function SmartphoneAdverts() {
  return <Adverts placement="SMARTPHONE" />;
}
