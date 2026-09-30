import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Box, Button, Flex, Icon, useDisclosure, useToast } from '@chakra-ui/react';
import { AddIcon, DeleteIcon, EditIcon, RepeatIcon, WarningTwoIcon } from '@chakra-ui/icons';
import { MdDeleteSweep } from 'react-icons/md';

import Card from './Card';
import DataTable from './DataTable';
import FormModal, { tidyNumbers } from './FormModal';
import SearchBar from './SearchBar';
import ExcelActions from './ExcelActions';
import { useConfirm } from './ConfirmDialog';
import useList from '../hooks/useList';
import usePermission from '../hooks/usePermission';
import { useT } from '../i18n';
import { useSurface } from '../theme/tokens';

/**
 * One screen for a table with no rules of its own.
 *
 * The backend has a CRUD factory for exactly these tables; this is its
 * counterpart, and the pair is why adding a master table to the console costs
 * a route entry and a column list rather than a folder of files.
 *
 * What it gives every such screen for free: search, paging, sorting, the
 * recycle bin, a create/edit form, delete behind a confirmation, a
 * spreadsheet round trip where the API offers one, and buttons that are
 * simply absent when this administrator only has read.
 *
 * A table that needs more than this stops using it - Tickets, Stock and
 * Claims all have screens of their own - and nothing here bends to
 * accommodate them.
 */
export default function CrudPage({
  page, title, subtitle, api, columns, fields, filters,
  defaultSort, defaultDir, searchable, canRestore, canDelete, rowActions, extraActions,
  formTitle, formSize, formColumns, onRowClick, transform,

  /* ---- the newer half, all optional ---- */
  pkField, params, emptyRow, toPayload, fromRow, excel, excelFilename,
  renderExpanded, headerExtra, actionsMode, actionsIconOnly,
  onRowDoubleClick, rowHint, highlightRow, minHeight, searchPlaceholder
}) {
  const t = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const surface = useSurface();
  const { canWrite } = usePermission(page);
  const form = useDisclosure();

  const pk = pkField || 'id';

  /*
   * A ?q= in the address bar starts the screen already searched.
   *
   * It is what lets the header's search box land on a row rather than on a
   * page: the panel knows the model code, and this is how it hands it over.
   * Read once, on mount - after that the box belongs to whoever is typing in
   * it, and re-reading the url would fight them.
   */
  const initialQuery = new URLSearchParams(useLocation().search).get('q') || '';

  const [deleted, setDeleted] = useState(false);
  const [typed, setTyped] = useState(initialQuery);
  const [editing, setEditing] = useState(null);
  const [values, setValues] = useState(emptyRow || {});
  const [saving, setSaving] = useState(false);

  const paramsKey = JSON.stringify(params || {});

  const list = useList(
    (query) => api.list(query),
    Object.assign(
      { page: 1, limit: 20, q: initialQuery, sort: defaultSort, dir: defaultDir || 'asc' },
      params || {}
    )
  );

  // Extra filters supplied by the screen are part of the query, so a change
  // to them is a new first page rather than a stale one re-fetched.
  useEffect(() => {
    list.setFilter(JSON.parse(paramsKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);

  /** Best-effort human label for a row, shown in the confirm dialog. */
  const labelOf = (row) => {
    const first = columns.filter((c) => c.key && c.key.indexOf('__') !== 0)[0];
    const value = first ? row[first.key] : null;
    return value === null || value === undefined || value === '' ? '' : String(value);
  };

  const openCreate = () => {
    setEditing(null);
    setValues(Object.assign({}, emptyRow || {}));
    form.onOpen();
  };

  const openEdit = async (row) => {
    setEditing(row);
    /* The same field list the form is about to draw - see tidyNumbers in FormModal. */
    const editFields = typeof fields === 'function' ? fields('edit', row) : fields;
    setValues(tidyNumbers(editFields, fromRow ? await fromRow(row) : Object.assign({}, row)));
    form.onOpen();
  };

  /*
   * The payload comes FROM the form, already coerced - a number input hands
   * back a string, and an empty box means null rather than ''.  Falling back
   * to the raw state keeps a caller that submits some other way working.
   */
  const save = async (payload) => {
    const edited = payload || values;

    setSaving(true);
    try {
      const body = toPayload ? toPayload(edited) : (transform ? transform(edited) : edited);
      if (editing) await api.update(editing[pk], body);
      else await api.create(body);

      toast({ title: t(editing ? 'Saved' : 'Created'), status: 'success', duration: 2500 });
      form.onClose();
      list.reload();
      return true;
    } catch (e) {
      toast({ title: e.message, status: 'error', duration: 5000, isClosable: true });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row) => {
    const agreed = await confirm({
      tone: 'danger',
      title: t('common.delete'),
      body: t('components.crudpage.thisRecordWillBeMoved'),
      detail: labelOf(row),
      confirmLabel: t('common.delete')
    });
    if (!agreed) return;

    try {
      await api.remove(row[pk]);
      toast({ title: t('common.deleted'), status: 'success', duration: 2500 });
      list.reload();
    } catch (e) {
      toast({ title: e.message, status: 'error', duration: 5000, isClosable: true });
    }
  };

  /**
   * PERMANENTLY, and only from the recycle bin.
   *
   * The server is asked FIRST what refers to this row, so the prompt can
   * say "3 repair tickets are still attached" rather than letting the
   * delete fail on a foreign key - a constraint name is not something
   * anybody can act on.
   *
   * Three answers are possible and the dialog says which:
   *   nothing refers to it          - a plain, final confirmation
   *   owned children refer to it    - they go too, and are counted
   *   something blocks it           - refused, with what and how many
   */
  const purge = async (row) => {
    let report;
    try {
      report = (await api.dependents(row[pk])).data;
    } catch (e) {
      toast({ title: e.message, status: 'error', duration: 5000, isClosable: true });
      return;
    }

    const describe = (list) => list
      .map((entry) => entry.count + ' x ' + entry.table.replace(/_/g, ' '))
      .join(', ');

    if (!report.can_purge) {
      await confirm({
        tone: 'info',
        title: t('components.crudpage.cannotBeDeletedPermanently'),
        body: t('components.crudpage.otherRecordsStillReferTo'),
        detail: describe(report.blockers),
        // Nothing to decide - one button, and it says Close.
        acknowledge: true,
        confirmLabel: t('common.close')
      });
      return;
    }

    const cascades = report.dependents.filter((entry) => entry.effect !== 'BLOCKS');

    const agreed = await confirm({
      tone: 'danger',
      title: t('components.crudpage.deletePermanently'),
      body: cascades.length
        ? t('components.crudpage.thisRecordAndEverythingBelonging')
        : t('components.crudpage.thisRecordWillBeDestroyed'),
      detail: cascades.length ? describe(cascades) : labelOf(row),
      confirmLabel: t('components.crudpage.deletePermanently')
    });
    if (!agreed) return;

    try {
      await api.purge(row[pk]);
      toast({ title: t('common.deleted'), status: 'success', duration: 2500 });
      list.reload();
    } catch (e) {
      toast({ title: e.message, status: 'error', duration: 6000, isClosable: true });
    }
  };

  const restore = async (row) => {
    const agreed = await confirm({
      tone: 'restore',
      title: t('common.restore'),
      body: t('components.crudpage.thisRecordWillBeReturned'),
      detail: labelOf(row),
      confirmLabel: t('common.restore')
    });
    if (!agreed) return;

    try {
      await api.restore(row[pk]);
      toast({ title: t('components.crudpage.restored'), status: 'success', duration: 2500 });
      list.reload();
    } catch (e) {
      toast({ title: e.message, status: 'error', duration: 5000, isClosable: true });
    }
  };

  /*
   * The row actions, as data rather than as an injected column.
   *
   * `hidden` is what lets edit/delete and restore share one list: a row in
   * the recycle bin offers exactly one of them, so the table never draws a
   * button that would answer 404.
   */
  const actions = (canWrite
    ? [
      fields ? {
        key: 'edit',
        label: t('common.edit'),
        icon: EditIcon,
        hidden: (row) => !!row.is_deleted,
        onClick: openEdit
      } : null,
      canDelete === false ? null : {
        key: 'delete',
        label: t('common.delete'),
        icon: DeleteIcon,
        color: 'red',
        hidden: (row) => !!row.is_deleted,
        onClick: remove
      },
      canDelete === false ? null : {
        key: 'restore',
        label: t('common.restore'),
        icon: RepeatIcon,
        hidden: (row) => !row.is_deleted,
        onClick: restore
      },
      /*
       * Only on a row that is already in the recycle bin, and only where
       * the resource offers it. The two-step is the point: a soft delete is
       * reversible, and this is the deliberate second decision.
       */
      canDelete === false || typeof api.purge !== 'function' ? null : {
        key: 'purge',
        label: t('components.crudpage.deletePermanently'),
        icon: WarningTwoIcon,
        color: 'red',
        hidden: (row) => !row.is_deleted,
        onClick: purge
      }
    ].filter(Boolean)
    : []
  ).concat(
    // A screen's own actions arrive as a render function in this console;
    // they are wrapped so the table can treat them like any other.
    rowActions
      ? [{
        key: 'custom',
        label: t('table.moreActions'),
        render: (row) => rowActions(row, { reload: list.reload })
      }]
      : []
  ).concat(extraActions || []);

  const fieldList = typeof fields === 'function'
    ? fields(editing ? 'edit' : 'create', editing)
    : fields;

  return (
    <Box>
      <Card bodyProps={false}>
        <Flex
          px="1.125rem" pt="1rem" pb="0.875rem" gap="0.625rem" data-gap="10" data-gap-wrap
          justify="space-between" align="center" wrap="wrap"
        >
          {subtitle ? (
            <Box color={surface.muted} fontSize="sm" maxW="38.75rem">{subtitle}</Box>
          ) : <Box />}

          <Flex gap="0.5rem" data-gap="8" data-gap-wrap wrap="wrap" align="center">
            {/*
              * A FUNCTION GETS THE LIST, a node is rendered as it stands.
              *
              * This slot used to be nodes only, which meant nothing put in it
              * could actually filter: the list state lives in here, and a
              * control with no way to reach `setFilter` can only manage
              * something of its own. Every screen that wanted a real filter
              * used Toolbar instead and gave up the rest of CrudPage.
              *
              * Same shape as headerExtra below, for the same reason.
              */}
            {typeof filters === 'function' ? filters(list) : filters}
            {typeof headerExtra === 'function' ? headerExtra({ reload: list.reload }) : headerExtra}
            {extraActions && !Array.isArray(extraActions) ? extraActions : null}

            {searchable === false ? null : (
              <SearchBar
                placeholder={searchPlaceholder || t('common.search')}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onSubmit={() => list.setFilter({ q: typed })}
                w={{ base: '100%', md: '12.5rem' }}
              />
            )}

            {excel ? (
              <ExcelActions
                resource={api}
                params={Object.assign({ q: list.params.q }, params || {},
                  deleted ? { deleted: 1 } : {})}
                filename={(excelFilename || page.split('/').pop()) + '.xlsx'}
                canWrite={canWrite && excel !== 'export'}
                exportOnly={excel === 'export'}
                onImported={list.reload}
              />
            ) : null}

            {canRestore === false ? null : (
              <Button
                size="sm" h="2.25rem" variant={deleted ? 'brand' : 'subtle'}
                fontSize="sm" fontWeight="500" px="0.875rem"
                leftIcon={<Icon as={MdDeleteSweep} w="0.9375rem" h="0.9375rem" />}
                onClick={() => { setDeleted(!deleted); list.setFilter({ deleted: deleted ? undefined : 1 }); }}
              >
                {deleted ? t('components.crudpage.showingDeleted') : t('table.recycleBin')}
              </Button>
            )}

            {canWrite && fields && !deleted ? (
              <Button
                size="sm" h="2.25rem" variant="brand" fontSize="sm" fontWeight="500" px="1rem"
                leftIcon={<AddIcon w="0.5625rem" h="0.5625rem" />}
                onClick={openCreate}
              >
                {t('components.crudpage.create')}
              </Button>
            ) : null}
          </Flex>
        </Flex>

        <Box px="0.5rem" pb="0.5rem">
          <DataTable
            columns={columns}
            rows={list.rows}
            loading={list.loading}
            page={list.params.page}
            limit={list.params.limit}
            total={list.total}
            sort={list.params.sort}
            dir={list.params.dir}
            actions={actions}
            actionsMode={actionsMode}
            actionsIconOnly={actionsIconOnly}
            // The detail row often edits sub-records, so it gets the list
            // reload handed to it rather than having to invent its own.
            renderExpanded={renderExpanded ? (row) => renderExpanded(row, list.reload) : undefined}
            onRowClick={onRowClick}
            onRowDoubleClick={onRowDoubleClick}
            rowHint={rowHint}
            rowKey={(row, i) => (row[pk] === undefined ? i : row[pk])}
            highlightRow={highlightRow || ((row) => !!row.is_deleted)}
            minHeight={minHeight || '13.75rem'}
            // The page path is the table's identity, so every column width
            // somebody drags out on a master table is still there tomorrow.
            storageKey={page}
            onSort={list.setSort}
            onPageChange={list.setPage}
            onLimitChange={(limit) => list.setFilter({ limit })}
          />
        </Box>
      </Card>

      {fields ? (
        <FormModal
          isOpen={form.isOpen}
          onClose={form.onClose}
          title={t(editing ? 'Edit' : 'Create') + (formTitle ? ' - ' + t(formTitle) : (title ? ' - ' + title : ''))}
          fields={fieldList}
          values={values}
          onChange={setValues}
          onSubmit={save}
          saving={saving}
          size={formSize}
          columns={formColumns}
        />
      ) : null}
    </Box>
  );
}
