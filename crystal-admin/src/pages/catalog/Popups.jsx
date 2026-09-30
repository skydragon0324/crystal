import React from 'react';
import { Link, Text } from '@chakra-ui/react';

import CrudPage from '../../components/CrudPage';
import StatusBadge from '../../components/StatusBadge';
import MediaThumb from '../../components/MediaThumb';
import { popupAdverts } from '../../api';
import { date as formatDate } from '../../utils/format';
import { useT } from '../../i18n';

export const PAGE = '/admin/catalog/adverts/popup';

/**
 * THE ADVERTS THAT OPEN OVER THE HOMEPAGE, and the days they run.
 *
 * A hero advert is shown to somebody already reading the page. A popup
 * INTERRUPTS - which is what it is for, and why it is the one advert with a
 * diary: a sale that opens on Friday, a recall, a launch. Outside its period
 * the row is simply not sent to the storefront, so a campaign ends by itself
 * rather than by somebody remembering to switch it off.
 *
 * WHAT A VISITOR ACTUALLY SEES. Every popup running today is shown in ONE
 * dialog, in `Order`, and clicking the picture moves to the next one; the
 * close button is there from the start for anyone who wants out. It is shown
 * ONCE PER BROWSER SESSION, so a reader who visits four pages is interrupted
 * once and one who comes back tomorrow sees it again.
 *
 * THE PERIOD IS IN WHOLE DAYS, inclusive at both ends - the 1st to the 7th is
 * seven days for every reader, wherever they are. That is the vendor's rule
 * for home_popups, and the reason it is not an instant is that a campaign
 * ending at midnight in one timezone and teatime in another is a support call.
 */
export default function Popups() {
  const t = useT();

  return (
    <CrudPage
      page={PAGE}
      title={t('Popup adverts')}
      subtitle={t('catalog.popups.shownOverTheHomepage')}
      api={popupAdverts}
      /* The row IS the picture - deleting it frees the file, so there is no bin. */
      canRestore={false}
      defaultSort="sort_order"
      defaultDir="asc"
      columns={[
        {
          key: 'file_path', label: 'Picture', width: '7.5rem', sortable: false,
          render: (row) => <MediaThumb path={row.file_path} alt={row.alt_text} />
        },
        {
          key: 'start_date', label: 'Runs', width: '12rem',
          render: (row) => (
            <Text fontSize="xs" fontFamily="mono">
              {formatDate(row.start_date)} - {formatDate(row.end_date)}
            </Text>
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
          help: 'A picture, an animated GIF, or a short MP4 or WebM film. A film plays by itself; the sound starts as soon as the browser allows it.'
        },
        { name: 'start_date', label: 'First day', type: 'date', required: true },
        { name: 'end_date', label: 'Last day', type: 'date', required: true },
        { name: 'sort_order', label: 'Order', type: 'number' },
        {
          name: 'status', label: 'Status', type: 'select',
          options: [
            { value: 'ACTIVE', label: 'Active' },
            { value: 'INACTIVE', label: 'Inactive' }
          ]
        },
        {
          name: 'alt_text', label: 'Alt text', span: 2,
          help: 'Read out in place of the picture. The visible copy is in the artwork itself.'
        },
        {
          name: 'link_url', label: 'Goes to', span: 2,
          help: 'Where the button under the picture goes - a path such as /smartphones/products/c9-pro, or a full address. Leave it empty and no button is drawn.'
        }
      ]}
    />
  );
}
