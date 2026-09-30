import React from 'react';
import { Text } from '@chakra-ui/react';

import CrudPage from '../../components/CrudPage';
import { provinces } from '../../api';
import { useT } from '../../i18n';
import { number } from '../../utils/format';

export const PAGE = '/admin/support/provinces';

/**
 * THE PROVINCES, AND THE ORDER A VISITOR READS THEM IN.
 *
 * The storefront's "All provinces" dropdown, above both service centre
 * lists, lists the provinces in THIS order - lower first, ties by name. It
 * used to be the alphabet, which nobody chose: Anhui led a network whose
 * busiest counters are in Guangdong and Shanghai.
 *
 * It is also the list a centre's Province is PICKED from. The centre refers
 * to the province by name, so renaming one here renames it on every centre
 * filed under it, in the same save; and a province that still has centres
 * cannot be deleted for good - the dialog says how many are in the way.
 *
 * Only provinces with a live centre appear on the website, so adding one
 * ahead of the first centre that opens there is harmless.
 */
export default function Provinces() {
  const t = useT();

  return (
    <CrudPage
      page={PAGE}
      api={provinces}
      defaultSort="sort_order"
      subtitle={t('support.provinces.theStorefrontListsProvincesIn')}
      columns={[
        { key: 'name', label: 'Province', render: (row) => <Text fontSize="xs" fontWeight="600">{row.name}</Text> },
        { key: 'sort_order', label: 'Display order', isNumeric: true },
        {
          key: 'agency_cnt', label: 'Service centres', isNumeric: true, sortable: false,
          render: (row) => number(row.agency_cnt)
        }
      ]}
      fields={[
        {
          name: 'name', label: 'Province', required: true,
          help: 'support.provinces.renamingItHereRenamesIt'
        },
        {
          name: 'sort_order', label: 'Display order', type: 'number',
          help: 'support.provinces.lowerComesFirstInThe'
        }
      ]}
    />
  );
}
