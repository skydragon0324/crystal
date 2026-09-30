import React from 'react';
import { useHistory } from 'react-router-dom';
import { Button } from '@chakra-ui/react';

import CrudPage from '../../components/CrudPage';
import StatusBadge from '../../components/StatusBadge';
import useOptions from '../../hooks/useOptions';
import { pages, roles } from '../../api';
import { useT } from '../../i18n';

export const PAGE = '/admin/management/roles';

/**
 * Roles.
 *
 * They are not ranks: an editor runs the blog and must not see a member's
 * wallet, while a branch manager runs one service centre and must not approve
 * the claim that pays it.  That is why what a role may do is a grid rather
 * than a number, and the grid is edited on the permissions screen.
 */
export default function Roles() {
  const t = useT();
  const history = useHistory();
  const { options: pageList } = useOptions(() => pages.list({ limit: 200 }), []);

  return (
    <CrudPage
      page={PAGE}
      api={roles}
      defaultSort="role_name"
      canRestore={false}
      subtitle={t('management.roles.rolesAreCapabilitiesNotRanks')}
      rowActions={(row) => (
        <Button
          size="xs"
          variant="ghost"
          onClick={() => history.push('/admin/management/permissions?role=' + row.id)}
        >
          {t('common.permissions')}
        </Button>
      )}
      columns={[
        { key: 'role_code', label: 'Code' },
        { key: 'role_name', label: 'Role' },
        { key: 'default_page_name', label: 'Lands on' },
        {
          key: 'is_system', label: 'Shipped',
          render: (row) => (row.is_system ? <StatusBadge value="OK" label={t('common.yes')} /> : '-')
        }
      ]}
      fields={[
        { name: 'role_code', label: 'Code', required: true },
        { name: 'role_name', label: 'Role', required: true },
        {
          name: 'default_page', label: 'Lands on after signing in', type: 'select', span: 2,
          options: pageList.map((row) => ({ value: row.id, label: row.page_name + ' (' + row.page_url + ')' }))
        }
      ]}
    />
  );
}
