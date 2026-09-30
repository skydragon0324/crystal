import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Box, Button, Center, Flex, Radio, RadioGroup, Spinner, Stack, Text,
  useColorModeValue, useToast
} from '@chakra-ui/react';

import Card from '../../components/Card';
import SelectField from '../../components/SelectField';
import useOptions from '../../hooks/useOptions';
import usePermission from '../../hooks/usePermission';
import { permissions, roles } from '../../api';
import { useT } from '../../i18n';

export const PAGE = '/admin/management/permissions';

const LEVELS = [
  { value: 0, label: 'None' },
  { value: 1, label: 'Read' },
  { value: 2, label: 'Write' },
  { value: 3, label: 'Super' }
];

/**
 * What a role may do, screen by screen.
 *
 * The whole grid saves in one request and one transaction, because a half
 * saved grid is a role that can write one screen and not read the next - and
 * the person who saved it has no way of knowing which half took.
 *
 * Handing out permissions is itself a permission, and not the ordinary one:
 * the API requires SUPER on this page, so the Save button is absent for
 * anybody who only has write.
 */
export default function Permissions() {
  const t = useT();
  const toast = useToast();
  const location = useLocation();
  const { isSuper } = usePermission(PAGE);

  const border = useColorModeValue('gray.100', 'gray.700');
  const groupBg = useColorModeValue('gray.50', 'whiteAlpha.50');

  const { options: roleList } = useOptions(() => roles.list({ limit: 100 }), []);

  const initialRole = new URLSearchParams(location.search).get('role');
  const [roleId, setRoleId] = useState(initialRole || '');
  const [matrix, setMatrix] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Land on the first role rather than on an empty screen.
  useEffect(() => {
    if (!roleId && roleList.length) setRoleId(String(roleList[0].id));
  }, [roleList, roleId]);

  const load = useCallback(async () => {
    if (!roleId) return;
    setLoading(true);
    try {
      const { data } = await permissions.matrix(roleId);
      setMatrix(data);
    } catch (err) {
      toast({ status: 'error', description: err.message, duration: 6000 });
      setMatrix([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleId]);

  useEffect(() => { load(); }, [load]);

  const setLevel = (pageId, level) => {
    setMatrix((current) => current.map((row) => (
      row.page_id === pageId ? { ...row, permission: Number(level) } : row
    )));
  };

  const save = async () => {
    setSaving(true);
    try {
      await permissions.save(roleId, matrix.map((row) => ({
        page_id: row.page_id, permission: row.permission
      })));
      toast({ status: 'success', description: t('common.saved'), duration: 2500 });
      await load();
    } catch (err) {
      toast({ status: 'error', description: err.message, duration: 7000 });
    } finally {
      setSaving(false);
    }
  };

  const groups = matrix.filter((row) => !row.parent_id);
  const childrenOf = (group) => matrix.filter((row) => row.parent_id === group.page_id);

  const renderRow = (row, indented) => (
    <Flex
      key={row.page_id}
      align="center"
      gap={4} data-gap="16" data-gap-wrap
      px={4}
      py={2}
      pl={indented ? 10 : 4}
      borderBottomWidth="1px"
      borderColor={border}
      wrap="wrap"
    >
      <Box minW="13.75rem" flex="1">
        <Text fontSize="sm">{t(row.page_name)}</Text>
        <Text fontSize="0.65rem" color="gray.500" fontFamily="mono">{row.page_url}</Text>
      </Box>

      <RadioGroup
        value={String(row.permission)}
        onChange={(value) => setLevel(row.page_id, value)}
        isDisabled={!isSuper}
      >
        <Stack direction="row" spacing={5}>
          {LEVELS.map((level) => (
            <Radio key={level.value} value={String(level.value)} size="sm">
              <Text fontSize="xs">{t(level.label)}</Text>
            </Radio>
          ))}
        </Stack>
      </RadioGroup>
    </Flex>
  );

  return (
    <Card
      title={t('common.permissions')}
      subtitle={t('management.permissions.theWholeGridSavesAt')}
      bodyProps={false}
      actions={
        <Flex gap={2} data-gap="8" align="center">
          {/* The console's own select: the browser's draws its list with the
              operating system, which ignores the colour mode entirely. */}
          <Box w="13.125rem">
            <SelectField
              size="sm"
              value={roleId}
              isClearable={false}
              options={roleList.map((role) => ({ value: role.id, label: role.role_name }))}
              onChange={(next) => setRoleId(next)}
            />
          </Box>

          {isSuper && (
            <Button size="sm" colorScheme="brand" onClick={save} isLoading={saving}>
              {t('common.save')}
            </Button>
          )}
        </Flex>
      }
    >
      {loading ? (
        <Center py={16}><Spinner size="md" thickness="3px" color="brand.500" /></Center>
      ) : (
        <Box>
          {groups.map((group) => {
            const children = childrenOf(group);

            return (
              <Box key={group.page_id}>
                <Box bg={groupBg}>{renderRow(group, false)}</Box>
                {children.map((child) => renderRow(child, true))}
              </Box>
            );
          })}

          {!matrix.length && (
            <Center py={16}>
              <Text fontSize="sm" color="gray.500">{t('table.emptyBrief')}</Text>
            </Center>
          )}
        </Box>
      )}
    </Card>
  );
}
