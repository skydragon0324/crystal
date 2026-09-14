import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Flex, Image, Text, useToast } from '@chakra-ui/react';

import { DataTable, ErrorState } from '@/components/common';
import api from '@/api';
import { useList } from '@/hooks/useApi';
import { fileUrl } from '@/api/client';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';
import { date as formatDate } from '@/utils/format';

/**
 * The member's registered devices.
 *
 * Removing a registration frees the serial number to be registered again -
 * which is what someone selling a device on needs - so the confirmation says
 * that rather than a generic warning.
 */
export default function Products() {
  const t = useT();

  const surface = useSurface();
  const toast = useToast();
  const [removing, setRemoving] = useState(null);

  const list = useList((params) => api.account.registrations(params), {
    initialParams: { page: 1, limit: 10 }
  });

  const remove = async (row) => {
    setRemoving(row.id);
    try {
      await api.account.removeRegistration(row.id);
      toast({ title: 'Device removed', status: 'success', duration: 2500 });
      list.reload();
    } catch (err) {
      toast({ title: err.message, status: 'error', duration: 6000, isClosable: true });
    } finally {
      setRemoving(null);
    }
  };

  const columns = [
    {
      key: 'product',
      label: 'Device',
      render: (row) => (
        <Flex align="center" gap="3" data-gap="12" minW="0">
          {row.main_image && (
            <Image
              src={fileUrl(row.main_image)}
              alt={row.product_name}
              boxSize="40px"
              borderRadius="8px"
              objectFit="cover"
              bg={surface.raised}
              flexShrink={0}
            />
          )}
          <Box minW="0">
            <Text fontWeight="600" color={surface.text} isTruncated>
              {row.product_name || 'Unrecognised model'}
            </Text>
            <Text fontSize="xs" color={surface.muted} fontFamily="mono">
              {row.serial_number}
            </Text>
          </Box>
        </Flex>
      )
    },
    {
      key: 'warranty_until',
      label: 'Warranty until',
      render: (row) => row.warranty_until || '—'
    },
    {
      key: 'points',
      label: 'Points earned',
      align: 'right',
      sortKey: 'points',
      render: (row) => `+${row.points}`
    },
    {
      key: 'register_time',
      label: 'Registered',
      sortKey: 'register_time',
      render: (row) => formatDate(row.register_time)
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (row) => (
        <Flex gap="2" data-gap="8" justify="flex-end">
          {/* Only a smartphone has a URL this table can build - everything
              else lives under its category, which a registration does not
              carry - so the rest go to the picker that can find them. */}
          <Button
            as={RouterLink}
            to={
              row.category_type === 'SMARTPHONE' && row.product_slug
                ? `/smartphones/products/${row.product_slug}/service-pricing`
                : '/support/pricing'
            }
            size="xs"
            variant="quiet"
          >
            {t('common.repairPrices')}
          </Button>
          <Button
            size="xs"
            variant="ghost"
            colorScheme="red"
            isLoading={removing === row.id}
            onClick={() => remove(row)}
          >
            {t('common.remove')}
          </Button>
        </Flex>
      )
    }
  ];

  return (
    <Box>
      <Flex justify="space-between" align="center" gap="4" data-gap="16" data-gap-wrap mb="6" wrap="wrap">
        <Text color={surface.muted}>
          {t('account.products.registeringADeviceRecordsIts')}
        </Text>
        <Button as={RouterLink} to="/account/products/register" variant="brand" size="sm">
          {t('common.registerAProduct')}
        </Button>
      </Flex>

      {list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : (
        <DataTable
          columns={columns}
          rows={list.rows}
          loading={list.loading}
          meta={list.meta}
          sortKey={list.params.sort}
          sortDir={list.params.dir}
          onSort={list.setSort}
          onPage={list.setPage}
          emptyTitle={t('common.noDevicesRegisteredYet')}
          emptyHint={t('account.products.youNeedTheSerialNumber')}
          emptyActionLabel={t('common.registerAProduct')}
          emptyActionTo="/account/products/register"
        />
      )}
    </Box>
  );
}
