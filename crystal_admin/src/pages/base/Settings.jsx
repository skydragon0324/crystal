import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Button, Center, Checkbox, Flex, Input, Spinner, Stack, Text,
  useColorModeValue, useToast
} from '@chakra-ui/react';

import Card from '../../components/Card';
import usePermission from '../../hooks/usePermission';
import { settings } from '../../api';
import { useT } from '../../i18n';

export const PAGE = '/admin/base/settings';

/**
 * The values that change what the platform does without a release.
 *
 * `value_type` is what lets a text column be cast back to what it means, so
 * the form draws a checkbox for a boolean and a number field for a number
 * rather than a row of identical text boxes.
 */
export default function Settings() {
  const t = useT();
  const toast = useToast();
  const { canWrite } = usePermission(PAGE);

  const border = useColorModeValue('gray.100', 'gray.700');
  const muted = useColorModeValue('gray.500', 'gray.400');

  const [rows, setRows] = useState([]);
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await settings.list();
      setRows(data);

      const next = {};
      data.forEach((row) => { next[row.setting_key] = row.setting_val; });
      setValues(next);
    } catch (err) {
      toast({ status: 'error', description: err.message, duration: 6000 });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await settings.save(values);
      toast({ status: 'success', description: t('common.saved'), duration: 2500 });
      await load();
    } catch (err) {
      toast({ status: 'error', description: err.message, duration: 7000 });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Center py={20}><Spinner size="lg" thickness="3px" color="brand.500" /></Center>;

  /*
   * JSON SETTINGS ARE NOT EDITED HERE.
   *
   * A row whose value is a document - the website footer is the one so far -
   * renders as a single-line text box full of raw JSON, which is not an
   * editor: it is a way to lose the whole value to a missing brace. Each has
   * its own screen, and hiding it here is what stops somebody finding the
   * text box first.
   */
  const groups = [];
  const index = {};
  rows.filter((row) => row.value_type !== 'json').forEach((row) => {
    if (!index[row.category]) {
      index[row.category] = { category: row.category, items: [] };
      groups.push(index[row.category]);
    }
    index[row.category].items.push(row);
  });

  return (
    <Stack spacing={5}>
      {groups.map((group) => (
        <Card
          key={group.category}
          title={t(group.category)}
          bodyProps={false}
          actions={group === groups[0] && canWrite ? (
            <Button size="sm" colorScheme="brand" onClick={save} isLoading={saving}>
              {t('common.save')}
            </Button>
          ) : null}
        >
          {group.items.map((row) => (
            <Flex
              key={row.setting_key}
              align="center"
              gap={4} data-gap="16" data-gap-wrap
              px={5}
              py={3}
              borderBottomWidth="1px"
              borderColor={border}
              wrap="wrap"
            >
              <Box minW="16.25rem" flex="1">
                <Text fontSize="sm">{t(row.label)}</Text>
                {row.description && (
                  <Text fontSize="0.68rem" color={muted} mt="2px">{row.description}</Text>
                )}
                <Text fontSize="0.62rem" color={muted} fontFamily="mono" mt="2px">
                  {row.setting_key}
                </Text>
              </Box>

              <Box w={{ base: '100%', md: '13.75rem' }}>
                {row.value_type === 'boolean' ? (
                  <Checkbox
                    size="sm"
                    isDisabled={!canWrite}
                    isChecked={values[row.setting_key] === 'true' || values[row.setting_key] === '1'}
                    onChange={(event) => {
                      /*
                       * READ BEFORE THE UPDATER. React 16 recycles the
                       * synthetic event as soon as the handler returns, and
                       * a functional updater runs after that - so reaching
                       * for event.target inside one finds null.
                       */
                      const next = event.target.checked ? 'true' : 'false';
                      setValues((current) => ({ ...current, [row.setting_key]: next }));
                    }}
                  >
                    <Text fontSize="xs">{t(values[row.setting_key] === 'true' ? 'On' : 'Off')}</Text>
                  </Checkbox>
                ) : (
                  <Input
                    size="sm"
                    type={row.value_type === 'number' ? 'number' : 'text'}
                    isReadOnly={!canWrite}
                    value={values[row.setting_key] === null || values[row.setting_key] === undefined
                      ? '' : values[row.setting_key]}
                    onChange={(event) => {
                      const next = event.target.value;
                      setValues((current) => ({ ...current, [row.setting_key]: next }));
                    }}
                  />
                )}
              </Box>
            </Flex>
          ))}
        </Card>
      ))}
    </Stack>
  );
}
