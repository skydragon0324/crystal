import React from 'react';
import { Box, Text } from '@chakra-ui/react';
import CrudPage from '../../components/CrudPage';
import StatusBadge from '../../components/StatusBadge';
import useOptions from '../../hooks/useOptions';
import { admins, roles } from '../../api';
import { useT } from '../../i18n';
import { dateTime } from '../../utils/format';

export const PAGE = '/admin/management/admins';

/**
 * Console accounts: a username, a password and a role.
 *
 * A password is optional on an edit and blank means "leave it" - which is why
 * it is not a column and never comes back from the API.
 *
 * THERE IS NO SERVICE CENTRE AND NO EMAIL. An account used to be pinnable to
 * one centre and then saw only that centre's tickets and stock; what an
 * account may do is the permission grid's answer alone now. The address was
 * never a credential - sign-in has always matched the username - so it was a
 * unique nullable column no query read.
 */
export default function Admins() {
  const t = useT();
  const { options: roleList } = useOptions(() => roles.list({ limit: 100 }), []);

  return (
    <CrudPage
      page={PAGE}
      api={admins}
      defaultSort="username"
      subtitle={t('management.admins.whatAnAccountMayOpen')}
      columns={[
        {
          key: 'username', label: 'Account', maxW: '11.25rem',
          render: (row) => (
            <Box>
              <Text fontSize="xs" fontWeight="600">{row.username}</Text>
              <Text fontSize="0.65rem" color="gray.500">{row.name}</Text>
            </Box>
          )
        },
        { key: 'role_name', label: 'Role' },
        { key: 'last_login_at', label: 'Last signed in', render: (row) => dateTime(row.last_login_at) },
        { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> }
      ]}
      fields={[
        {
          name: 'username', label: 'Username', required: true,
          help: 'What they sign in with. It is the only identifier an account has.'
        },
        { name: 'name', label: 'Name', required: true },
        {
          name: 'role_id', label: 'Role', type: 'select', required: true,
          options: roleList.map((row) => ({ value: row.id, label: row.role_name }))
        },
        {
          name: 'status', label: 'Status', type: 'select',
          options: [{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }]
        },
        {
          name: 'password', label: 'Password', type: 'password', span: 2,
          placeholder: 'leave blank to keep the current one'
        }
      ]}
    />
  );
}
