import React from 'react';
import { Box, Text } from '@chakra-ui/react';

import SelectField from '../../components/SelectField';
import { useT } from '../../i18n';

/**
 * WHICH OF THE CUSTOMER'S ACCOUNTS IN A PROJECT A CARD SHOWS - All first, then
 * each Account ID (its PK beside it when `withPk`, the primary one marked).
 *
 * The same control the forms use (SelectField), so a card's picker looks and
 * behaves like every other select in the console. It cannot be cleared: All
 * is a choice of its own. One account needs no choice and is just named.
 */
export default function AccountPicker({ accounts, value, onChange, withPk }) {
  const translate = useT();
  const list = accounts || [];
  if (!list.length) return null;

  const labelOf = (row) => row.external_account_id
    + (withPk && row.external_account_pk ? '  (PK ' + row.external_account_pk + ')' : '')
    + (row.is_primary ? '  · ' + translate('crm.eshopOrders.primary') : '');
  if (list.length === 1) return <Text fontSize="xs" color="gray.500">{labelOf(list[0])}</Text>;

  const options = [{ value: 'ALL', label: translate('crm.eshopOrders.allAccounts', { n: list.length }) }]
    .concat(list.map((row) => ({ value: String(row.project_account_id), label: labelOf(row) })));
  return (
    <Box w="18rem" maxW="100%">
      <SelectField size="sm" options={options} value={String(value || 'ALL')} isClearable={false}
        onChange={(next) => onChange(next === null || next === undefined ? 'ALL' : String(next))} />
    </Box>
  );
}
