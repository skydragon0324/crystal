import React from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';

import CrudPage from '../../components/CrudPage';
import StatusBadge from '../../components/StatusBadge';
import { noticeOrigins } from '../../api';
import { useT } from '../../i18n';

export const PAGE = '/admin/base/notice-origins';

/** A hex, or nothing. The swatch is only painted when it is one. */
const HEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * WHO A SITE NOTICE IS FROM.
 *
 * A screen of its own rather than a free-text field on the notice, and the
 * reason is what happens without it: typed each time, the same team is
 * "Service network", "Service Network" and "service centres" within a month,
 * and the badge that was supposed to let a reader pick their own out of a
 * list of ten stops working.
 *
 * The COLOUR is the point of the table as much as the name is. The storefront
 * shows several notices at once now, and a reader looking for the service
 * desk finds the amber ones before they have read a single label.
 */
export default function NoticeOrigins() {
  const t = useT();

  return (
    <CrudPage
      page={PAGE}
      api={noticeOrigins}
      defaultSort="sort_order"
      subtitle={t('base.noticeorigins.theBadgeOnASite')}
      columns={[
        {
          key: 'name', label: 'Origin',
          render: (row) => (
            <Flex align="center" gap="0.5rem" data-gap="8">
              {/* Painted from the hex beside it, so a typo is visible here
                  rather than on the live site. */}
              <Box
                w="0.875rem" h="0.875rem" borderRadius="0.25rem" flexShrink={0}
                bg={HEX.test(row.colour || '') ? row.colour : 'transparent'}
                borderWidth="1px" borderColor="whiteAlpha.400"
              />
              <Text fontSize="xs" fontWeight="600">{row.name}</Text>
            </Flex>
          )
        },
        { key: 'code', label: 'Code' },
        { key: 'colour', label: 'Colour' },
        { key: 'sort_order', label: 'Order', isNumeric: true },
        { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> }
      ]}
      fields={[
        {
          name: 'code', label: 'Code', required: true,
          help: 'The name the seeds and any import address this origin by. Changing it later orphans them.'
        },
        { name: 'name', label: 'Name', required: true },
        {
          /*
           * Picked, not typed. It was a text box asking for a six digit hex,
           * which meant knowing that #F59E0B is amber and finding out you had
           * it wrong from the live site.
           */
          name: 'colour', label: 'Colour', type: 'color', span: 2,
          help: 'The badge colour on the website. Leave it empty for an origin that should not stand out.'
        },
        {
          name: 'sort_order', label: 'Order', type: 'number',
          help: 'Only orders this list. Which notice is read first is the notice\'s own order.'
        },
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
