import React, { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { Box, Flex, Progress, SimpleGrid, Stack, Text, useToast } from '@chakra-ui/react';

import Card from '../../components/Card';
import DataTable from '../../components/DataTable';
import FormModal from '../../components/FormModal';
import Toolbar from '../../components/Toolbar';
import useList from '../../hooks/useList';
import usePermission from '../../hooks/usePermission';
import { crm } from '../../api';
import { useT } from '../../i18n';
import { useSurface } from '../../theme/tokens';
import { date, number } from '../../utils/format';
import { Status, amount, choices, filtersFor, optionsFrom, rowsOf, useCrmMeta } from './shared';
import { Panel, ProjectTags } from './ui';

export const PAGE = '/admin/crm/memberships';

/**
 * MEMBERSHIPS AND PROJECT TIERS (design 3.6 / 9).
 *
 * Each project runs its own ladder - Eshop card levels, a programme's grades -
 * and a membership is one customer's place on one project's ladder. The cards
 * at the top are those ladders side by side, deliberately NOT added together:
 * an Eshop level 3 and another project's level 3 are not the same thing. The
 * Dream-wide comparison is the corporate grade, on the Analysis screen.
 *
 * Tiers normally arrive with the project's data. A manager can correct one
 * here; the change is appended to the tier history with the reason given.
 */
export default function Memberships() {
  const t = useT();
  const toast = useToast();
  const history = useHistory();
  const meta = useCrmMeta();
  const surface = useSurface();
  const { canWrite } = usePermission(PAGE);
  const [ladders, setLadders] = useState([]);
  const [changing, setChanging] = useState(null);

  const list = useList((params) => crm.memberships.list(params), { page: 1, limit: 20, dir: 'desc' });

  const loadLadders = () => crm.memberships.distribution().then(({ data }) => setLadders(rowsOf(data))).catch(() => setLadders([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadLadders(); }, []);

  const byProject = {};
  ladders.forEach((ladderRow) => { (byProject[ladderRow.project_code] = byProject[ladderRow.project_code] || []).push(ladderRow); });

  const tiersOf = (projectId) => (meta.project_tiers || []).filter((tier) => String(tier.project_id) === String(projectId));

  const save = async (values) => {
    try {
      await crm.memberships.setTier(changing.membership_id, values.tier_id, values.reason);
      toast({ title: t('Saved'), status: 'success', duration: 2500 });
      setChanging(null);
      list.reload();
      loadLadders();
      return true;
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 6000, isClosable: true });
      return false;
    }
  };

  return (
    <Stack spacing={4}>
      {Object.keys(byProject).length ? (
        <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={4}>
          {Object.keys(byProject).map((code, position) => {
            const rows = byProject[code];
            const total = rows.reduce((sum, ladderRow) => sum + ladderRow.members, 0) || 1;
            return (
              <Panel key={code + position} title={<Flex align="center"><ProjectTags codes={[code]} /><Text ml={2}>{t('crm.memberships.ladder')}</Text></Flex>}>
                <Stack spacing={2.5} px={4} py={3}>
                  {rows.slice().reverse().map((ladderRow, index) => (
                    <Box key={String(ladderRow.project_tier_id) + index}>
                      <Flex justify="space-between" fontSize="sm">
                        <Text>{t(ladderRow.tier_name)}</Text>
                        <Text fontWeight="600" style={{ fontVariantNumeric: 'tabular-nums' }}>{number(ladderRow.members)}</Text>
                      </Flex>
                      <Progress value={(ladderRow.members / total) * 100} size="xs" borderRadius="full" colorScheme="brand" mt="2px" />
                    </Box>
                  ))}
                </Stack>
              </Panel>
            );
          })}
        </SimpleGrid>
      ) : (
        <Card><Text fontSize="sm" color={surface.muted}>{t('crm.memberships.noTiersYet')}</Text></Card>
      )}

      <Card bodyProps={false}>
        <Toolbar
          search={list.params.q}
          onSearch={(searchText) => list.setFilter({ q: searchText })}
          filters={filtersFor(t, [
            { key: 'project_id', label: 'Project', value: list.params.project_id,
              options: optionsFrom(meta.projects, 'project_id', 'project_name'),
              onChange: (value) => list.setFilter({ project_id: value || undefined, current_tier_id: undefined }) },
            { key: 'current_tier_id', label: 'Project tier', value: list.params.current_tier_id, width: '12rem',
              options: (list.params.project_id ? tiersOf(list.params.project_id) : (meta.project_tiers || []))
                .map((tier) => ({ value: tier.project_tier_id, label: tier.tier_name })),
              onChange: (value) => list.setFilter({ current_tier_id: value || undefined }) },
            { key: 'membership_status', label: 'Status', value: list.params.membership_status,
              options: choices(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'LEFT']),
              onChange: (value) => list.setFilter({ membership_status: value || undefined }) }
          ])}
        />
        <Box px="0.5rem" pb="0.5rem">
          <DataTable
            columns={[
              { key: 'party_name', label: 'Customer', render: (row) => (row.party_name || '-') + '  ' + (row.party_no || '') },
              { key: 'project_code', label: 'Project', render: (row) => <ProjectTags codes={[row.project_code]} /> },
              { key: 'external_member_id', label: 'Member number' },
              { key: 'tier_name', label: 'Project tier', render: (row) => t(row.tier_name || '-') },
              { key: 'tier_value', label: 'Tier value', isNumeric: true, render: (row) => amount(row.tier_value, 2) },
              { key: 'available_reward_points', label: 'Reward points', isNumeric: true, render: (row) => amount(row.available_reward_points, 2) },
              { key: 'change_cnt', label: 'Tier changes', isNumeric: true, render: (row) => number(row.change_cnt) },
              { key: 'membership_status', label: 'Status', render: (row) => <Status value={row.membership_status} /> },
              { key: 'joined_at', label: 'Joined', render: (row) => date(row.joined_at) }
            ]}
            rows={list.rows}
            loading={list.loading}
            page={list.params.page}
            limit={list.params.limit}
            total={list.total}
            sort={list.params.sort}
            dir={list.params.dir}
            onSort={list.setSort}
            onPageChange={list.setPage}
            onLimitChange={(limit) => list.setFilter({ limit: limit })}
            rowKey={(row) => row.membership_id || row.id}
            renderExpanded={(row) => <TierHistory membershipId={row.membership_id} />}
            actions={[
              { key: 'open', label: t('crm.memberships.openCustomer'), onClick: (row) => history.push('/admin/crm/customers/' + row.party_id) }
            ].concat(canWrite ? [{ key: 'tier', label: t('crm.memberships.changeTier'), onClick: (row) => setChanging(row) }] : [])}
            actionsIconOnly={false}
            storageKey={PAGE}
          />
        </Box>
      </Card>

      <FormModal
        isOpen={!!changing}
        onClose={() => setChanging(null)}
        title={t('crm.memberships.changeTier')}
        initial={changing ? { tier_id: changing.current_tier_id } : {}}
        onSubmit={save}
        fields={[
          { name: 'tier_id', label: 'Project tier', type: 'select', required: true, isClearable: false,
            options: changing ? tiersOf(changing.project_id).map((tier) => ({ value: tier.project_tier_id, label: tier.tier_name })) : [],
            help: 'Only the tiers of this membership\'s own project.' },
          { name: 'reason', label: 'Reason', type: 'textarea', required: true, colSpan: 'full' }
        ]}
      />
    </Stack>
  );
}

function TierHistory({ membershipId }) {
  const t = useT();
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!membershipId) return;
    crm.memberships.history(membershipId).then(({ data }) => setRows(rowsOf(data))).catch(() => setRows([]));
  }, [membershipId]);
  return (
    <DataTable
      hidePagination
      rows={rows}
      rowKey={(row) => row.membership_tier_history_id}
      columns={[
        { key: 'changed_at', label: 'When', render: (row) => date(row.changed_at) },
        { key: 'old_tier_name', label: 'From', render: (row) => t(row.old_tier_name || '-') },
        { key: 'new_tier_name', label: 'To', render: (row) => t(row.new_tier_name || '-') },
        { key: 'change_reason', label: 'Reason' }
      ]}
    />
  );
}
