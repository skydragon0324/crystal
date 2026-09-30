import React from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import CrudPage from '../../components/CrudPage';
import SelectField from '../../components/SelectField';
import StatusBadge from '../../components/StatusBadge';
import ImagePreview from '../../components/ImagePreview';
import { media } from '../../api';
import { useT } from '../../i18n';
import { dateTime } from '../../utils/format';
import { fileUrl } from '../../api/client';

export const PAGE = '/admin/catalog/media';

/**
 * The media library.
 *
 * Owner type and id rather than a foreign key, because one column cannot
 * point at four tables - so an asset says what it belongs to in words, and
 * deleting an owner deletes its assets explicitly rather than by a cascade
 * that does not exist.
 */
const PURPOSES = ['HERO', 'GALLERY', 'THUMBNAIL', 'BANNER', 'DETAIL'];

const DEVICES = [
  { value: 'all', label: 'Both' },
  { value: 'desktop', label: 'Desktop' },
  { value: 'mobile', label: 'Mobile' }
];

export default function Media() {
  const t = useT();

  const purposeOptions = PURPOSES.map((code) => ({ value: code, label: code }));
  const deviceOptions = DEVICES.map((entry) => ({ value: entry.value, label: t(entry.label) }));

  return (
    <CrudPage
      page={PAGE}
      api={media}
      defaultSort="created_at"
      defaultDir="desc"
      canRestore={false}
      subtitle={t('catalog.media.removingAnAssetRemovesThe')}
      /*
       * BY PURPOSE AND BY DEVICE, which is how the library is searched: "the
       * phone banners", "every thumbnail". The API narrows the query, so the
       * count and the paging are for the filtered list, not a page of
       * everything with rows hidden. Device is exact - `Both` lists the rows
       * marked for both, not every row a phone would be sent.
       */
      filters={(list) => (
        <Flex wrap="wrap">
          <Box minW="10rem" me="0.5rem" mb="0.25rem">
            <SelectField
              size="sm"
              value={list.params.purpose || null}
              onChange={(value) => list.setFilter({ purpose: value || undefined })}
              options={purposeOptions}
              placeholder={t('catalog.media.everyPurpose')}
              isSearchable={false}
            />
          </Box>
          <Box minW="10rem" mb="0.25rem">
            <SelectField
              size="sm"
              value={list.params.device_type || null}
              onChange={(value) => list.setFilter({ device_type: value || undefined })}
              options={deviceOptions}
              placeholder={t('catalog.media.everyDevice')}
              isSearchable={false}
            />
          </Box>
        </Flex>
      )}
      columns={[
        {
          key: 'file_path', label: 'Asset', width: '5.625rem', sortable: false,
          render: (row) => (
            <ImagePreview path={row.file_path} alt={row.alt_text} title={row.alt_text}>
              <Box
                as="img"
                src={fileUrl(row.file_path)}
                alt={row.alt_text || ''}
                w="4rem" h="2.5rem" objectFit="cover" borderRadius="md" bg="gray.100"
              />
            </ImagePreview>
          )
        },
        { key: 'owner_type', label: 'Belongs to' },
        { key: 'owner_id', label: 'Owner', isNumeric: true },
        { key: 'purpose', label: 'Purpose' },
        {
          key: 'device_type', label: 'Device',
          render: (row) => <StatusBadge value={row.device_type === 'all' ? 'OK' : 'NORMAL'} label={row.device_type} />
        },
        {
          key: 'alt_text', label: 'Alt text', maxW: '13.75rem',
          render: (row) => <Text fontSize="xs" noOfLines={1}>{row.alt_text || '-'}</Text>
        },
        { key: 'sort_order', label: 'Order', isNumeric: true },
        { key: 'created_at', label: 'Added', render: (row) => dateTime(row.created_at) }
      ]}
      fields={[
        {
          name: 'owner_type', label: 'Belongs to', type: 'select', required: true,
          options: ['PRODUCT', 'SERIES', 'CATEGORY', 'ARTICLE', 'OS_VERSION']
            .map((code) => ({ value: code, label: code }))
        },
        { name: 'owner_id', label: 'Owner id', type: 'number', required: true },
        {
          name: 'purpose', label: 'Purpose', type: 'select', required: true,
          options: purposeOptions
        },
        {
          name: 'device_type', label: 'Device', type: 'select',
          options: DEVICES
        },
        { name: 'file_path', label: 'File path', required: true, span: 2 },
        { name: 'alt_text', label: 'Alt text', span: 2 },
        { name: 'sort_order', label: 'Order', type: 'number' }
      ]}
    />
  );
}
