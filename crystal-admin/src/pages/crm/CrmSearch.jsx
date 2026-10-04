import React, { useEffect, useRef, useState } from 'react';
import { useHistory } from 'react-router-dom';
import {
  Box, Flex, Icon, Input, InputGroup, InputLeftElement, InputRightElement, Kbd, Popover, PopoverBody, PopoverContent,
  PopoverTrigger, Stack, Text
} from '@chakra-ui/react';
import * as Md from 'react-icons/md';

import { crm } from '../../api';
import { useT } from '../../i18n';
import { useSurface } from '../../theme/tokens';
import { date } from '../../utils/format';
import { partyIdLabel } from './shared';

/**
 * ONE SEARCH FOR THE WHOLE CRM: customers, orders, products, cases and
 * campaigns, a few of each, as the user types. Ctrl+K (Cmd+K) puts the
 * cursor in it from anywhere on the page. A hit opens the customer it
 * belongs to, or the record itself when it belongs to nobody.
 */
export default function CrmSearch() {
  const translate = useT();
  const history = useHistory();
  const surface = useSurface();
  const field = useRef(null);
  const [text, setText] = useState('');
  const [found, setFound] = useState(null);
  const [isOpen, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 'k') {
        event.preventDefault();
        if (field.current) field.current.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (text.trim().length < 2) { setFound(null); return undefined; }
    const timer = setTimeout(() => {
      crm.customer360.search(text.trim()).then(({ data }) => { setFound(data || {}); setOpen(true); }).catch(() => setFound(null));
    }, 250);
    return () => clearTimeout(timer);
  }, [text]);

  const go = (path) => { setOpen(false); setText(''); history.push(path); };
  const customerOr = (partyId, fallback) => (partyId ? '/admin/crm/customers/' + partyId : fallback);

  const groups = found ? [
    { key: 'customers', groupName: translate('crm.c360.searchCustomers'), icon: Md.MdPersonOutline,
      rows: (found.customers || []).map((row) => ({ id: 'p' + row.party_id, title: row.display_name || partyIdLabel(row.party_id), detail: partyIdLabel(row.party_id), path: customerOr(row.party_id) })) },
    { key: 'orders', groupName: translate('crm.c360.searchOrders'), icon: Md.MdReceipt,
      rows: (found.orders || []).map((row) => ({ id: 'o' + row.transaction_id, title: row.external_transaction_id,
        detail: [row.project_code, date(row.transaction_at), row.party_name].filter(Boolean).join('  ·  '),
        path: '/admin/crm/transactions?txn=' + row.transaction_id })) },
    { key: 'products', groupName: translate('crm.c360.searchProducts'), icon: Md.MdDevicesOther,
      rows: (found.products || []).map((row) => ({ id: 'i' + row.product_instance_id, title: row.serial_number || row.imei || row.external_product_instance_id,
        detail: [row.product_name, row.party_name].filter(Boolean).join('  ·  '), path: '/admin/crm/products?instance=' + row.product_instance_id })) },
    { key: 'cases', groupName: translate('crm.c360.searchCases'), icon: Md.MdBuild,
      rows: (found.cases || []).map((row) => ({ id: 'c' + row.case_id, title: row.external_case_id || '#' + row.case_id,
        detail: [row.title, row.party_name].filter(Boolean).join('  ·  '), path: '/admin/crm/service-cases?case=' + row.case_id })) },
    { key: 'campaigns', groupName: translate('crm.c360.searchCampaigns'), icon: Md.MdRecordVoiceOver,
      rows: (found.campaigns || []).map((row) => ({ id: 'g' + row.campaign_id, title: row.campaign_name, detail: row.campaign_code, path: '/admin/crm/campaigns/' + row.campaign_id })) }
  ].filter((group) => group.rows.length) : [];

  return (
    <Popover isOpen={isOpen && !!found} onClose={() => setOpen(false)} placement="bottom-start" autoFocus={false}>
      <PopoverTrigger>
        <Box w={{ base: '100%', md: '26rem' }}>
          <InputGroup size="sm">
            <InputLeftElement pointerEvents="none"><Icon as={Md.MdSearch} color={surface.muted} /></InputLeftElement>
            <Input ref={field} borderRadius="lg" bg={surface.card} value={text} placeholder={translate('crm.c360.searchPlaceholder')}
              onChange={(event) => setText(event.target.value)} onFocus={() => { if (found) setOpen(true); }} />
            <InputRightElement width="3.2rem" pointerEvents="none"><Kbd fontSize="0.65rem">{translate('crm.c360.searchShortcut')}</Kbd></InputRightElement>
          </InputGroup>
        </Box>
      </PopoverTrigger>
      <PopoverContent w={{ base: '100%', md: '26rem' }} _focus={{ outline: 'none' }}>
        <PopoverBody p={2} maxH="24rem" overflowY="auto">
          {groups.length ? groups.map((group) => (
            <Box key={group.key} mb={2}>
              <Text fontSize="0.68rem" color={surface.muted} textTransform="uppercase" letterSpacing="0.05em" px={2} mb={1}>{group.groupName}</Text>
              <Stack spacing={0}>
                {group.rows.map((row) => (
                  <Flex key={row.id} align="center" px={2} py={1.5} borderRadius="md" cursor="pointer" _hover={{ bg: surface.hover }} onClick={() => go(row.path)}>
                    <Icon as={group.icon} color="brand.500" mr={2} flexShrink={0} />
                    <Box minW={0}>
                      <Text fontSize="sm" fontWeight="600" noOfLines={1}>{row.title}</Text>
                      {row.detail ? <Text fontSize="xs" color={surface.muted} noOfLines={1}>{row.detail}</Text> : null}
                    </Box>
                  </Flex>
                ))}
              </Stack>
            </Box>
          )) : <Text fontSize="sm" color={surface.muted} p={2}>{translate('crm.c360.nothingFound')}</Text>}
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
}
