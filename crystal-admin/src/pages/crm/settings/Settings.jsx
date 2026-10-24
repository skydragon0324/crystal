import React, { useEffect, useState } from 'react';
import {
  Alert, AlertIcon, Box, Button, Code, Flex, HStack, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, ModalOverlay,
  Stack, Text, useDisclosure, useToast
} from '@chakra-ui/react';

import Card from '../../../components/Card';
import CrudPage from '../../../components/CrudPage';
import DataTable from '../../../components/DataTable';
import FormModal from '../../../components/FormModal';
import SelectField from '../../../components/SelectField';
import { useConfirm } from '../../../components/ConfirmDialog';
import usePermission from '../../../hooks/usePermission';
import { crm } from '../../../api';
import { useT } from '../../../i18n';
import { dateTime } from '../../../utils/format';
import { Status, choices, forgetCrmMeta, optionsFrom, rowsOf, translateOptions, useCrmMeta, word } from '../shared/shared';

export const PAGE = '/admin/crm/settings';

const IDENTITY_ROLES = { ESHOP: 'E-shop', USER_MANAGEMENT: 'User management' };

const active = { key: 'is_active', label: 'Status', sortable: false, render: (row) => <Status value={row.is_active ? 'ACTIVE' : 'INACTIVE'} /> };
const activeField = { name: 'is_active', label: 'In use', type: 'checkbox' };

/**
 * THE CRM'S WORD LISTS - one screen, every list.
 *
 * These are the values the rest of the CRM is built from: the projects, the
 * product classes, the tiers each project runs, the point currencies, the
 * activities a site can record, the ways a case is classified, the channels
 * and purposes consent is asked about. They change a few times a year, and
 * none of them is worth a release.
 *
 * A code the CRM itself relies on - OWNER, REPAIR_INTAKE - can be
 * renamed on screen but not re-coded or deleted: the server refuses, and says
 * which code it is protecting. A value still in use by a record cannot be
 * deleted either; its records have to go first.
 */
export default function Settings() {
  const translate = useT();
  const meta = useCrmMeta();
  const [current, setCurrent] = useState('projects');
  const [revision, setRevision] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const toast = useToast();
  const { canWrite } = usePermission(PAGE);

  /* Locations come from the vendor's list; this copies it again without running the whole Crystal import. */
  const refreshLocations = async () => {
    setRefreshing(true);
    try {
      const { data } = await crm.refreshLocations();
      forgetCrmMeta();
      setRevision((value) => value + 1);
      toast({ title: translate('crm.settings.locationsRefreshed', { added: (data || {}).added || 0, updated: (data || {}).updated || 0 }), status: 'success', duration: 4000 });
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 6000, isClosable: true });
    } finally {
      setRefreshing(false);
    }
  };

  const lists = listsOf(meta, translate);
  const chosen = lists.filter((list) => list.path === current)[0] || lists[0];

  return (
    <Stack spacing={4}>
      <Card bodyProps={false}>
        <Flex px={5} py={4} align="center" wrap="wrap">
          <Text fontSize="sm" mr={4} mb={{ base: 2, md: 0 }} flex="1" minW="16rem">{translate('crm.settings.intro')}</Text>
          <Box w={{ base: '100%', md: '18rem' }}>
            <SelectField
              size="sm"
              isClearable={false}
              isSearchable
              value={current}
              options={translateOptions(translate, lists.map((list) => ({ value: list.path, label: list.title })).concat([{ value: 'status-map', label: 'Status map' }, { value: 'staff-departments', label: 'Staff and departments' }, { value: 'api-keys', label: 'API keys' }]))}
              onChange={(value) => setCurrent(value || 'projects')}
            />
          </Box>
        </Flex>
      </Card>

      {current === 'staff-departments' ? <StaffDepartments /> : null}
      {current === 'status-map' ? <StatusMap /> : null}
      {current === 'api-keys' ? <ApiKeys /> : null}
      {['status-map', 'staff-departments', 'api-keys'].indexOf(current) !== -1 ? null : (
        <CrudPage
          key={chosen.path + ':' + revision}
          page={PAGE}
          api={crm.settings(chosen.path)}
          pkField={chosen.pk}
          canRestore={false}
          defaultSort={chosen.sort}
          filters={chosen.filters}
          subtitle={chosen.hint ? translate(chosen.hint) : undefined}
          columns={chosen.columns}
          fields={chosen.fields}
          emptyRow={chosen.emptyRow}
          toPayload={(values) => { forgetCrmMeta(); return values; }}
          extraActions={chosen.path === 'locations' && canWrite ? (
            <Button size="sm" variant="outline" isLoading={refreshing} onClick={refreshLocations}>{translate('crm.settings.refreshFromVendor')}</Button>
          ) : undefined}
        />
      )}
    </Stack>
  );
}

/** Every list: where it lives on the API, what it is called, and how it is shown and edited. */
function listsOf(meta, translate) {
  const yes = (value) => (value ? translate('common.yes') : '-');
  const projects = optionsFrom(meta.projects, 'project_id', 'project_name');
  /* Tier kinds by their code, which is what a tier stores. */
  const kinds = optionsFrom(meta.tier_kinds, 'kind_code', (kind) => translate(kind.kind_name));
  const classes = optionsFrom(meta.product_classes, 'product_class_id', 'class_name');
  const industries = optionsFrom(meta.industries, 'industry_id', 'industry_name');
  /* A vendor location's parent is named by its code, not its number. */
  const locationCodes = optionsFrom(meta.areas, 'location_code', (area) => area.full_name || area.location_name);

  return [
    { path: 'projects', title: 'Projects', pk: 'project_id', sort: 'project_id', hint: 'crm.settings.projectsHint',
      columns: [
        { key: 'project_code', label: 'Code' }, { key: 'project_name', label: 'Name' },
        { key: 'project_type_code', label: 'Kind', render: (row) => row.project_type_code || '-' },
        { key: 'source_system_code', label: 'Source system' },
        { key: 'identity_role', label: 'Identity role', render: (row) => (row.identity_role ? translate(IDENTITY_ROLES[row.identity_role] || row.identity_role) : '-') },
        { key: 'point_weight', label: 'Point weight', isNumeric: true, render: (row) => (row.point_weight === null || row.point_weight === undefined ? '-' : Number(row.point_weight)) },
        { key: 'status', label: 'Status', render: (row) => <Status value={row.status} /> }
      ],
      fields: [
        { name: 'project_code', label: 'Code', required: true }, { name: 'project_name', label: 'Name', required: true },
        /* A free label (PLATFORM, COMMERCE, CRM, ...): the database no longer fixes the list. */
        { name: 'project_type_code', label: 'Kind' },
        { name: 'source_system_code', label: 'Source system' }, { name: 'legal_entity_code', label: 'Legal entity' },
        { name: 'status', label: 'Status', type: 'select', options: choices(['ACTIVE', 'INACTIVE']) },
        /* Which project the Excel import's E-shop and User columns belong to; at most one project per role. */
        { name: 'identity_role', label: 'Identity role', type: 'select', colSpan: 'full',
          options: Object.keys(IDENTITY_ROLES).map((role) => ({ value: role, label: translate(IDENTITY_ROLES[role]) })),
          help: 'E-shop: the project of the Excel import\'s E-shop PK / ID columns. User management: the project of its User PK / User ID columns (the same User PK is the same person). One project per role.' },
        /* The project keeps its own points; this only says what one of them is worth company-wide. */
        { name: 'point_weight', label: 'Point weight', type: 'number', step: '0.000001', min: 0, nullable: true, colSpan: 'full',
          help: 'Company-wide points one of this project\'s reward points is worth. Leave empty to show its points without counting them in the company-wide score.' }
      ],
      emptyRow: { status: 'ACTIVE' } },

    { path: 'product-classes', title: 'Product classes', pk: 'product_class_id', sort: 'product_class_id', hint: 'crm.settings.classesHint',
      columns: [
        { key: 'class_code', label: 'Code' }, { key: 'class_name', label: 'Name' },
        { key: 'product_domain', label: 'Domain' }, { key: 'rank_no', label: 'Rank', isNumeric: true },
        { key: 'legacy_column', label: 'Vendor counter column' }, active
      ],
      fields: [
        { name: 'class_code', label: 'Code', required: true }, { name: 'class_name', label: 'Name', required: true },
        { name: 'parent_product_class_id', label: 'Under', type: 'select', options: classes },
        { name: 'product_domain', label: 'Domain', type: 'select', required: true,
          options: ['SMARTPHONE', 'EPRODUCT', 'SOFTWARE', 'LICENCE', 'GOODS', 'SERVICE'].map((code) => ({ value: code, label: code })) },
        { name: 'rank_no', label: 'Rank', type: 'number' }, { name: 'legacy_column', label: 'Vendor counter column' },
        { name: 'description', label: 'Description', type: 'textarea', colSpan: 'full' }, activeField
      ],
      emptyRow: { is_active: true } },

    /* The kinds of ladder a project ranks on (level, grade, ...): a member holds one tier of each kind, per account. */
    { path: 'tier-kinds', title: 'Tier kinds', pk: 'tier_kind_id', sort: 'sort_no', hint: 'crm.settings.tierKindsHint',
      columns: [
        { key: 'kind_code', label: 'Code' }, { key: 'kind_name', label: 'Name', render: (row) => translate(row.kind_name) },
        { key: 'sort_no', label: 'Order', isNumeric: true }, active
      ],
      fields: [
        { name: 'kind_code', label: 'Code', required: true, help: 'A short code, such as LEVEL or GRADE. Changing it later changes it on every tier and membership of this kind.' },
        { name: 'kind_name', label: 'Name', required: true },
        { name: 'sort_no', label: 'Order', type: 'number' }, activeField
      ],
      emptyRow: { is_active: true } },

    /* Each project's ladders, narrowed to a project and a kind, lowest rank first. */
    { path: 'project-tiers', title: 'Project tiers', pk: 'project_tier_id', sort: 'rank_no', hint: 'crm.settings.tiersHint',
      filters: (list) => (
        <>
          <Box w="12rem" maxW="100%">
            <SelectField size="sm" placeholder={translate('Project')} value={list.params.project_id || null}
              options={translateOptions(translate, projects)} onChange={(value) => list.setFilter({ project_id: value || undefined })} />
          </Box>
          <Box w="10rem" maxW="100%">
            <SelectField size="sm" placeholder={translate('Kind')} value={list.params.tier_kind || null}
              options={kinds} onChange={(value) => list.setFilter({ tier_kind: value || undefined })} />
          </Box>
        </>
      ),
      columns: [
        { key: 'project_id', label: 'Project', render: (row) => labelOf(projects, row.project_id) },
        { key: 'tier_code', label: 'Code' }, { key: 'tier_name', label: 'Name' },
        { key: 'tier_kind', label: 'Kind', render: (row) => labelOf(kinds, row.tier_kind) }, { key: 'rank_no', label: 'Rank', isNumeric: true },
        { key: 'min_value', label: 'From value', isNumeric: true }, active
      ],
      fields: [
        { name: 'project_id', label: 'Project', type: 'select', required: true, options: projects },
        { name: 'tier_code', label: 'Code', required: true }, { name: 'tier_name', label: 'Name', required: true },
        { name: 'tier_kind', label: 'Kind', type: 'select', required: true, isClearable: false, options: kinds,
          help: 'The ladder this tier is on. A member holds one tier of each kind; add kinds under Tier kinds.' },
        { name: 'rank_no', label: 'Rank', type: 'number' }, { name: 'min_value', label: 'From value', type: 'number', step: '0.0001' },
        { name: 'source_code', label: 'Code in the project' }, activeField
      ],
      emptyRow: { tier_kind: 'LEVEL', is_active: true } },

    { path: 'point-types', title: 'Point types', pk: 'point_type_id', sort: 'point_type_id', hint: 'crm.settings.pointTypesHint',
      columns: [
        { key: 'point_type_code', label: 'Code' }, { key: 'point_type_name', label: 'Name' },
        { key: 'owner_project_id', label: 'Belongs to', render: (row) => labelOf(projects, row.owner_project_id) },
        { key: 'decimal_places', label: 'Decimals', isNumeric: true },
        { key: 'expires_after_days', label: 'Expires after days', isNumeric: true }, active
      ],
      fields: [
        { name: 'point_type_code', label: 'Code', required: true }, { name: 'point_type_name', label: 'Name', required: true },
        { name: 'owner_project_id', label: 'Belongs to', type: 'select', options: projects },
        { name: 'decimal_places', label: 'Decimals', type: 'number' },
        { name: 'expires_after_days', label: 'Expires after days', type: 'number' },
        { name: 'is_dream_managed', label: 'Kept by the CRM', type: 'checkbox' }, activeField
      ],
      emptyRow: { decimal_places: 3, is_dream_managed: true, is_active: true } },

    { path: 'activity-types', title: 'Service center activity types', pk: 'activity_type_id', sort: 'activity_type_id',
      columns: [
        { key: 'activity_code', label: 'Code' }, { key: 'activity_name', label: 'Name' },
        { key: 'activity_group', label: 'Group' }, { key: 'required_capability_code', label: 'Needs the service location to do' }, active
      ],
      fields: [
        { name: 'activity_code', label: 'Code', required: true }, { name: 'activity_name', label: 'Name', required: true },
        { name: 'activity_group', label: 'Group', type: 'select', required: true,
          options: choices(['SERVICE', 'SALES', 'SOFTWARE', 'EVENT', 'MARKETING', 'OPERATIONS']) },
        { name: 'required_capability_code', label: 'Needs the service location to do' },
        { name: 'counts_quantity', label: 'Counts a quantity', type: 'checkbox' },
        { name: 'counts_amount', label: 'Counts an amount of money', type: 'checkbox' }, activeField
      ],
      emptyRow: { counts_quantity: true, is_active: true } },

    simple('case-types', 'Case types', 'case_type_id', 'case_type_code', 'display_name'),
    { path: 'service-statuses', title: 'Service statuses', pk: 'service_status_id', sort: 'sequence_no',
      columns: [
        { key: 'status_code', label: 'Code' }, { key: 'display_name', label: 'Name' },
        { key: 'sequence_no', label: 'Order', isNumeric: true },
        { key: 'is_terminal', label: 'Ends the case', render: (row) => yes(row.is_terminal) }
      ],
      fields: [
        { name: 'status_code', label: 'Code', required: true }, { name: 'display_name', label: 'Name', required: true },
        { name: 'sequence_no', label: 'Order', type: 'number' }, { name: 'is_terminal', label: 'Ends the case', type: 'checkbox' }
      ] },
    { path: 'priorities', title: 'Priorities', pk: 'service_priority_id', sort: 'rank_no',
      columns: [{ key: 'priority_code', label: 'Code' }, { key: 'priority_name', label: 'Name' }, { key: 'rank_no', label: 'Rank', isNumeric: true }],
      fields: [{ name: 'priority_code', label: 'Code', required: true }, { name: 'priority_name', label: 'Name', required: true },
        { name: 'rank_no', label: 'Rank', type: 'number' }] },
    classification('issue-categories', 'Reported issues', 'issue_category_id', 'category_code', 'parent_issue_category_id', projects, meta.issue_categories),
    classification('fault-categories', 'Faults found', 'fault_category_id', 'fault_code', 'parent_fault_category_id', projects, meta.fault_categories),
    classification('root-causes', 'Root causes', 'root_cause_id', 'root_cause_code', null, projects),
    classification('resolution-categories', 'Resolutions', 'resolution_category_id', 'resolution_code', null, projects),

    { path: 'corporate-grades', title: 'Corporate grades', pk: 'corporate_grade_id', sort: 'rank_no', hint: 'crm.settings.gradesHint',
      columns: [
        { key: 'grade_code', label: 'Code' }, { key: 'grade_name', label: 'Name' }, { key: 'rank_no', label: 'Rank', isNumeric: true },
        { key: 'min_score', label: 'From score', isNumeric: true }, { key: 'max_score', label: 'Below score', isNumeric: true }, active
      ],
      fields: [
        { name: 'grade_code', label: 'Code', required: true }, { name: 'grade_name', label: 'Name', required: true },
        { name: 'rank_no', label: 'Rank', type: 'number', required: true },
        { name: 'min_score', label: 'From score', type: 'number', step: '0.0001' },
        { name: 'max_score', label: 'Below score', type: 'number', step: '0.0001' }, activeField
      ],
      emptyRow: { is_active: true } },

    { path: 'relationship-types', title: 'Ways to hold a product', pk: 'relationship_type_id', sort: 'relationship_type_id',
      columns: [
        { key: 'relationship_code', label: 'Code' }, { key: 'relationship_name', label: 'Name' },
        { key: 'is_exclusive', label: 'One holder at a time', render: (row) => yes(row.is_exclusive) },
        { key: 'awards_registration_points', label: 'Earns registration points', render: (row) => yes(row.awards_registration_points) }
      ],
      fields: [
        { name: 'relationship_code', label: 'Code', required: true }, { name: 'relationship_name', label: 'Name', required: true },
        { name: 'is_exclusive', label: 'One holder at a time', type: 'checkbox' },
        { name: 'awards_registration_points', label: 'Earns registration points', type: 'checkbox' }
      ] },
    simple('purchase-purposes', 'Purchase purposes', 'purchase_purpose_id', 'purpose_code', 'purpose_name', true),
    simple('usage-types', 'Usage types', 'usage_type_id', 'usage_code', 'usage_name', true),
    simple('acquisition-types', 'Ways a product is obtained', 'acquisition_type_id', 'acquisition_code', 'acquisition_name', true),

    { path: 'channels', title: 'Channels', pk: 'channel_id', sort: 'channel_id',
      columns: [{ key: 'channel_code', label: 'Code' }, { key: 'channel_name', label: 'Name' },
        { key: 'required_contact_type', label: 'Needs a contact of type' }, active],
      fields: [{ name: 'channel_code', label: 'Code', required: true }, { name: 'channel_name', label: 'Name', required: true },
        { name: 'required_contact_type', label: 'Needs a contact of type', type: 'select',
          options: choices(['EMAIL', 'MOBILE', 'PHONE', 'PUSH_TOKEN', 'WECHAT_ID', 'WHATSAPP']) }, activeField],
      emptyRow: { is_active: true } },
    { path: 'communication-purposes', title: 'Reasons to contact', pk: 'purpose_id', sort: 'purpose_id',
      columns: [{ key: 'purpose_code', label: 'Code' }, { key: 'purpose_name', label: 'Name' },
        { key: 'requires_opt_in', label: 'Needs an opt-in', render: (row) => yes(row.requires_opt_in) }],
      fields: [{ name: 'purpose_code', label: 'Code', required: true }, { name: 'purpose_name', label: 'Name', required: true },
        { name: 'requires_opt_in', label: 'Needs an opt-in', type: 'checkbox' },
        { name: 'description', label: 'Description', type: 'textarea', colSpan: 'full' }] },
    { path: 'communication-options', title: 'What each project may send', pk: 'project_communication_option_id',
      sort: 'project_communication_option_id', hint: 'crm.settings.optionsHint',
      columns: [{ key: 'project_code', label: 'Project' }, { key: 'purpose_code', label: 'About' }, { key: 'channel_code', label: 'Channel' },
        { key: 'consent_required', label: 'Needs consent', render: (row) => yes(row.consent_required) },
        { key: 'is_enabled', label: 'Status', render: (row) => <Status value={row.is_enabled ? 'ACTIVE' : 'INACTIVE'} /> }],
      fields: [
        { name: 'project_id', label: 'Project', type: 'select', required: true, options: projects },
        { name: 'purpose_id', label: 'About', type: 'select', required: true,
          options: optionsFrom(meta.communication_purposes, 'purpose_id', 'purpose_name') },
        { name: 'channel_id', label: 'Channel', type: 'select', required: true, options: optionsFrom(meta.channels, 'channel_id', 'channel_name') },
        { name: 'consent_required', label: 'Needs consent', type: 'checkbox' },
        { name: 'is_enabled', label: 'In use', type: 'checkbox' }
      ],
      emptyRow: { consent_required: true, is_enabled: true } },
    simple('organization-types', 'Organization types', 'organization_type_id', 'type_code', 'type_name'),
    { path: 'job-titles', title: 'Job titles', pk: 'job_title_id', sort: 'sort_order',
      columns: [{ key: 'job_code', label: 'Code' }, { key: 'job_name', label: 'Name' }, { key: 'sort_order', label: 'Order', isNumeric: true }, active],
      fields: [{ name: 'job_code', label: 'Code', required: true }, { name: 'job_name', label: 'Name', required: true },
        { name: 'sort_order', label: 'Order', type: 'number' }, activeField],
      emptyRow: { is_active: true, sort_order: 0 } },
    simple('departments', 'Departments', 'department_id', 'department_code', 'department_name', true),
    { path: 'tags', title: 'Customer tags', pk: 'tag_id', sort: 'tag_id', hint: 'crm.settings.tagsHint',
      columns: [{ key: 'tag_code', label: 'Code' }, { key: 'tag_name', label: 'Name', render: (row) => translate(row.tag_name) },
        { key: 'color_scheme', label: 'Colour' }, { key: 'description', label: 'Description', maxW: '18rem' }, active],
      fields: [{ name: 'tag_code', label: 'Code', required: true }, { name: 'tag_name', label: 'Name', required: true },
        { name: 'color_scheme', label: 'Colour', type: 'select', required: true,
          options: ['gray', 'green', 'blue', 'purple', 'pink', 'orange', 'red', 'teal', 'yellow', 'cyan'].map((colour) => ({ value: colour, label: colour })) },
        { name: 'description', label: 'Description', colSpan: 'full' }, activeField],
      emptyRow: { color_scheme: 'blue', is_active: true } },
    { path: 'party-relationship-types', title: 'Relationships between customers', pk: 'relationship_type_code', sort: 'sort_order', hint: 'crm.settings.relationshipTypesHint',
      columns: [{ key: 'relationship_type_code', label: 'Code' }, { key: 'relationship_name', label: 'Name', render: (row) => translate(row.relationship_name) },
        { key: 'inverse_code', label: 'Seen from the other side' }, { key: 'applies_to', label: 'Between', render: (row) => word(translate, row.applies_to) },
        { key: 'is_hierarchy', label: 'Builds the group tree', render: (row) => yes(row.is_hierarchy) }, active],
      fields: [{ name: 'relationship_type_code', label: 'Code', required: true }, { name: 'relationship_name', label: 'Name', required: true },
        { name: 'inverse_code', label: 'Seen from the other side', required: true, help: 'The code of the relationship read the other way - SPOUSE for SPOUSE, CHILD for PARENT.' },
        { name: 'applies_to', label: 'Between', type: 'select', required: true, options: choices(['PERSON', 'ORGANIZATION', 'ANY']) },
        { name: 'sort_order', label: 'Order', type: 'number' }, activeField],
      emptyRow: { applies_to: 'ANY', is_active: true } },
    { path: 'industries', title: 'Industries', pk: 'industry_id', sort: 'industry_id', hint: 'crm.settings.industriesHint',
      columns: [{ key: 'industry_code', label: 'Code' }, { key: 'industry_name', label: 'Name' },
        { key: 'parent_industry_id', label: 'Under', render: (row) => labelOf(industries, row.parent_industry_id) }, active],
      fields: [{ name: 'industry_code', label: 'Code', required: true }, { name: 'industry_name', label: 'Name', required: true },
        { name: 'parent_industry_id', label: 'Under', type: 'select', options: industries }, activeField],
      emptyRow: { is_active: true } },
    { path: 'locations', title: 'Locations', pk: 'location_pk', sort: 'position', hint: 'crm.settings.locationsHint',
      columns: [{ key: 'location_pk', label: 'Number', isNumeric: true }, { key: 'location_code', label: 'Code' },
        { key: 'location_name', label: 'Name' }, { key: 'parent_code', label: 'Under' },
        { key: 'position', label: 'Order', isNumeric: true }],
      fields: [{ name: 'location_pk', label: 'Number', type: 'number', required: true },
        { name: 'location_code', label: 'Code', required: true }, { name: 'location_name', label: 'Name', required: true },
        { name: 'parent_code', label: 'Under', type: 'select', options: locationCodes },
        { name: 'position', label: 'Order', type: 'number' }],
      emptyRow: { position: 0 } },
    { path: 'metric-definitions', title: 'Metric definitions', pk: 'metric_definition_id', sort: 'metric_definition_id', hint: 'crm.settings.metricsHint',
      columns: [{ key: 'metric_code', label: 'Code' }, { key: 'metric_name', label: 'Name' },
        { key: 'value_type', label: 'Value' }, { key: 'unit_code', label: 'Unit' },
        { key: 'description', label: 'Description', maxW: '20rem' }, active],
      fields: [{ name: 'metric_code', label: 'Code', required: true }, { name: 'metric_name', label: 'Name', required: true },
        { name: 'value_type', label: 'Value', type: 'select', required: true,
          options: ['NUMBER', 'TEXT', 'BOOLEAN', 'DATE'].map((code) => ({ value: code, label: code })) },
        { name: 'unit_code', label: 'Unit' }, { name: 'description', label: 'Description', type: 'textarea', colSpan: 'full' }, activeField],
      emptyRow: { value_type: 'NUMBER', is_active: true } },
    { path: 'point-event-types', title: 'Point event types', pk: 'point_event_type_id', sort: 'point_event_type_id',
      columns: [{ key: 'event_code', label: 'Code' }, { key: 'display_name', label: 'Name' },
        { key: 'direction', label: 'Direction', isNumeric: true }],
      fields: [{ name: 'event_code', label: 'Code', required: true }, { name: 'display_name', label: 'Name', required: true },
        { name: 'direction', label: 'Direction', type: 'select', required: true,
          options: [{ value: 1, label: 'Adds points' }, { value: -1, label: 'Takes points' }, { value: 0, label: 'Neither' }] }],
      emptyRow: { direction: 1 } },
    simple('contact-roles', 'Organization contact roles', 'contact_role_id', 'role_code', 'role_name'),
    { path: 'currencies', title: 'Currencies', pk: 'currency_code', sort: 'currency_code',
      columns: [{ key: 'currency_code', label: 'Code' }, { key: 'currency_name', label: 'Name' },
        { key: 'decimal_places', label: 'Decimals', isNumeric: true },
        { key: 'is_reporting', label: 'Reporting currency', render: (row) => yes(row.is_reporting) }, active],
      fields: [{ name: 'currency_code', label: 'Code', required: true }, { name: 'currency_name', label: 'Name' },
        { name: 'decimal_places', label: 'Decimals', type: 'number' },
        { name: 'is_reporting', label: 'Reporting currency', type: 'checkbox' }, activeField],
      emptyRow: { decimal_places: 2, is_active: true } },
    { path: 'registration-questions', title: 'Registration questions', pk: 'question_id', sort: 'sort_order', hint: 'crm.settings.questionsHint',
      columns: [
        { key: 'question_code', label: 'Code' }, { key: 'question_label', label: 'Question', maxW: '18rem' },
        { key: 'answer_type', label: 'Answer' },
        { key: 'product_class_id', label: 'For class', render: (row) => labelOf(classes, row.product_class_id) },
        { key: 'sort_order', label: 'Order', isNumeric: true }, active
      ],
      fields: [
        { name: 'question_code', label: 'Code', required: true }, { name: 'question_label', label: 'Question', required: true, colSpan: 'full' },
        { name: 'answer_type', label: 'Answer', type: 'select', required: true,
          options: ['SINGLE', 'MULTIPLE', 'TEXT', 'NUMBER', 'RATING'].map((code) => ({ value: code, label: code })) },
        { name: 'project_id', label: 'Project', type: 'select', options: projects },
        { name: 'product_class_id', label: 'For class', type: 'select', options: classes },
        { name: 'sort_order', label: 'Order', type: 'number' },
        { name: 'is_required', label: 'Must be answered', type: 'checkbox' }, activeField
      ],
      emptyRow: { answer_type: 'SINGLE', is_active: true } }
  ];
}

function labelOf(options, value) {
  const hit = (options || []).filter((option) => String(option.value) === String(value))[0];
  return hit ? hit.label : '-';
}

/** A list that is a code and a name, and maybe an in-use flag. */
function simple(path, title, primaryKey, code, name, hasActive) {
  return {
    path: path, title: title, pk: primaryKey, sort: primaryKey,
    columns: [{ key: code, label: 'Code' }, { key: name, label: 'Name' }].concat(hasActive ? [active] : []),
    fields: [{ name: code, label: 'Code', required: true }, { name: name, label: 'Name', required: true }].concat(hasActive ? [activeField] : []),
    emptyRow: hasActive ? { is_active: true } : {}
  };
}

/** A classification list: optionally per project, optionally nested. */
function classification(path, title, primaryKey, code, parent, projects, rows) {
  const parents = parent ? optionsFrom(rows, primaryKey, 'display_name') : [];
  return {
    path: path, title: title, pk: primaryKey, sort: primaryKey,
    columns: [
      { key: code, label: 'Code' }, { key: 'display_name', label: 'Name' },
      { key: 'project_id', label: 'Project', render: (row) => (row.project_id ? labelOf(projects, row.project_id) : '-') },
      active
    ],
    fields: [
      { name: code, label: 'Code' }, { name: 'display_name', label: 'Name', required: true },
      { name: 'project_id', label: 'Project', type: 'select', options: projects }
    ].concat(parent ? [{ name: parent, label: 'Under', type: 'select', options: parents }] : []).concat([activeField]),
    emptyRow: { is_active: true }
  };
}

/**
 * DEPARTMENT API KEYS - what lets another project's system call the CRM.
 *
 * A key is issued here, shown ONCE, and handed to that department to keep in
 * its own configuration; the CRM stores only its hash, so a lost key is
 * revoked and a new one issued. Revoking is immediate and cannot be undone.
 */
function ApiKeys() {
  const translate = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const meta = useCrmMeta();
  const form = useDisclosure();
  const { canWrite } = usePermission(PAGE);
  const [rows, setRows] = useState([]);
  const [issued, setIssued] = useState(null);
  const projects = optionsFrom((meta.projects || []).filter((project) => project.status === 'ACTIVE'), 'project_id', 'project_name');

  const load = () => crm.apiKeys.list().then(({ data }) => setRows(rowsOf(data))).catch(() => setRows([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const issue = async (values) => {
    try {
      const { data } = await crm.apiKeys.issue(values);
      form.onClose();
      setIssued(data);
      load();
      return true;
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 6000, isClosable: true });
      return false;
    }
  };

  const revoke = async (row) => {
    const agreed = await confirm({
      tone: 'danger',
      title: translate('crm.settings.revokeApiKey'),
      body: translate('crm.settings.revokeApiKeyExplained'),
      detail: (row.project_code || '') + '  ' + row.label + '  (crmk_' + row.key_prefix + '_...)',
      confirmLabel: translate('crm.settings.revoke')
    });
    if (!agreed) return;
    try {
      await crm.apiKeys.revoke(row.api_key_id);
      toast({ title: translate('crm.settings.apiKeyRevoked'), status: 'success', duration: 2500 });
      load();
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 6000, isClosable: true });
    }
  };

  const copy = () => {
    try {
      navigator.clipboard.writeText(issued.key);
      toast({ title: translate('crm.customer360.copied'), status: 'success', duration: 1500 });
    } catch (error) {
      toast({ title: translate('crm.settings.copyByHand'), status: 'info', duration: 3000 });
    }
  };

  return (
    <Card
      title={translate('crm.settings.apiKeys')}
      actions={canWrite ? <Button size="xs" variant="subtle" onClick={form.onOpen}>{translate('crm.settings.issueApiKey')}</Button> : null}
    >
      <Text fontSize="sm" mb={3}>{translate('crm.settings.apiKeysHint')}</Text>
      <DataTable
        hidePagination
        rows={rows}
        rowKey={(row) => row.api_key_id}
        columns={[
          { key: 'project_code', label: 'Project', render: (row) => row.project_name || row.project_code },
          { key: 'label', label: translate('crm.settings.apiKeyLabel') },
          { key: 'key_prefix', label: translate('crm.settings.apiKeyStartsWith'), render: (row) => <Code fontSize="xs">{'crmk_' + row.key_prefix + '_...'}</Code> },
          { key: 'created_at', label: translate('crm.settings.issuedAt'), render: (row) => dateTime(row.created_at) },
          { key: 'last_used_at', label: translate('crm.settings.lastUsed'), render: (row) => (row.last_used_at ? dateTime(row.last_used_at) : translate('crm.settings.neverUsed')) },
          { key: 'revoked_at', label: 'Status', render: (row) => <Status value={row.revoked_at ? 'INACTIVE' : 'ACTIVE'} /> }
        ]}
        actions={canWrite ? [{ key: 'revoke', label: translate('crm.settings.revoke'), hidden: (row) => !!row.revoked_at, onClick: revoke }] : []}
        actionsIconOnly={false}
      />

      <FormModal
        isOpen={form.isOpen}
        onClose={form.onClose}
        title={translate('crm.settings.issueApiKey')}
        onSubmit={issue}
        fields={[
          { name: 'project_id', label: 'Project', type: 'select', required: true, options: projects },
          { name: 'label', label: translate('crm.settings.apiKeyLabel'), help: translate('crm.settings.apiKeyLabelHelp') }
        ]}
      />

      {/* The only time the key exists in readable form: closing this dialog is the end of it. */}
      <Modal isOpen={!!issued} onClose={() => setIssued(null)} size="xl" closeOnOverlayClick={false}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{translate('crm.settings.apiKeyIssuedTitle')}</ModalHeader>
          <ModalBody>
            <Alert status="warning" borderRadius="md" fontSize="sm" mb={3}><AlertIcon />{translate('crm.settings.apiKeyShownOnce')}</Alert>
            <Code display="block" whiteSpace="normal" wordBreak="break-all" p={3} borderRadius="md" fontSize="sm">{issued ? issued.key : ''}</Code>
            <Text fontSize="sm" mt={3}>{translate('crm.settings.apiKeyHowToUse')}</Text>
          </ModalBody>
          <ModalFooter>
            <HStack>
              <Button onClick={copy}>{translate('crm.settings.copyKey')}</Button>
              <Button variant="brand" onClick={() => setIssued(null)}>{translate('crm.settings.iHaveSavedIt')}</Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Card>
  );
}

/** Each project's own status codes, and the CRM status each one reads as. */
function StatusMap() {
  const translate = useT();
  const toast = useToast();
  const meta = useCrmMeta();
  const form = useDisclosure();
  const { canWrite } = usePermission(PAGE);
  const [rows, setRows] = useState([]);

  const load = () => crm.statusMap.list().then(({ data }) => setRows(rowsOf(data))).catch(() => setRows([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const save = async (values) => {
    try {
      await crm.statusMap.save(values);
      toast({ title: translate('Saved'), status: 'success', duration: 2500 });
      form.onClose();
      load();
      return true;
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 6000, isClosable: true });
      return false;
    }
  };

  return (
    <Card
      title={translate('crm.settings.statusMap')}
      actions={canWrite ? <Button size="xs" variant="subtle" onClick={form.onOpen}>{translate('crm.settings.mapAStatus')}</Button> : null}
    >
      <Text fontSize="sm" mb={3}>{translate('crm.settings.statusMapHint')}</Text>
      <DataTable
        hidePagination
        rows={rows}
        rowKey={(row) => row.project_id + ':' + row.source_status_code}
        columns={[
          { key: 'project_code', label: 'Project' },
          { key: 'source_status_code', label: 'Code in the project' },
          { key: 'source_status_label', label: 'Means there' },
          { key: 'display_name', label: 'Reads in the CRM as', render: (row) => translate(row.display_name || '-') }
        ]}
        actions={canWrite ? [{
          key: 'remove', label: translate('common.remove'),
          onClick: (row) => crm.statusMap.remove(row.project_id, row.source_status_code).then(load)
            .catch((error) => toast({ title: error.message, status: 'error', duration: 6000, isClosable: true }))
        }] : []}
        actionsIconOnly={false}
      />
      <FormModal
        isOpen={form.isOpen}
        onClose={form.onClose}
        title={translate('crm.settings.mapAStatus')}
        onSubmit={save}
        fields={[
          { name: 'project_id', label: 'Project', type: 'select', required: true, options: optionsFrom(meta.projects, 'project_id', 'project_name') },
          { name: 'source_status_code', label: 'Code in the project', required: true },
          { name: 'source_status_label', label: 'Means there' },
          { name: 'service_status_id', label: 'Reads in the CRM as', type: 'select', required: true,
            options: optionsFrom(meta.service_statuses, 'service_status_id', 'display_name') }
        ]}
      />
    </Card>
  );
}

/**
 * WHO WORKS WHERE (design 3.2). A department is descriptive - permissions
 * still come from the role - but a role can be marked as meant for one
 * department, and then nobody outside it can be put in that department with it.
 */
function StaffDepartments() {
  const translate = useT();
  const toast = useToast();
  const meta = useCrmMeta();
  const { canWrite } = usePermission(PAGE);
  const [staff, setStaff] = useState([]);
  const [roles, setRoles] = useState([]);
  const departments = translateOptions(translate, optionsFrom(meta.departments, 'department_id', 'department_name'));

  const load = () => {
    crm.departments.staff().then(({ data }) => setStaff(rowsOf(data))).catch(() => setStaff([]));
    crm.departments.roles().then(({ data }) => setRoles(rowsOf(data))).catch(() => setRoles([]));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const change = async (call) => {
    try {
      await call();
      toast({ title: translate('Saved'), status: 'success', duration: 2000 });
      load();
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 6000, isClosable: true });
    }
  };

  const picker = (value, onChange) => (
    <Box w="13rem">
      <SelectField
        size="sm" value={value || null} options={departments} isDisabled={!canWrite}
        placeholder={translate('crm.settings.noDepartment')} onChange={(picked) => onChange(picked || null)}
      />
    </Box>
  );

  return (
    <Stack spacing={4}>
      <Card title={translate('crm.settings.staff')} bodyProps={false}>
        <Text fontSize="sm" px={5} pt={3}>{translate('crm.settings.staffHint')}</Text>
        <Box px="0.5rem" pb="0.5rem">
          <DataTable
            hidePagination
            rows={staff}
            rowKey={(row) => row.manager_id}
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'username', label: 'Username' },
              { key: 'role_name', label: 'Role', render: (row) => translate(row.role_name || '-') },
              { key: 'role_department_name', label: 'Role is meant for', render: (row) => (row.role_department_name ? translate(row.role_department_name) : '-') },
              { key: 'department_id', label: 'Department',
                render: (row) => picker(row.department_id, (value) => change(() => crm.departments.assignManager(row.manager_id, value))) }
            ]}
          />
        </Box>
      </Card>
      <Card title={translate('crm.settings.rolesByDepartment')} bodyProps={false}>
        <Box px="0.5rem" pb="0.5rem">
          <DataTable
            hidePagination
            rows={roles}
            rowKey={(row) => row.role_id}
            columns={[
              { key: 'role_name', label: 'Role', render: (row) => translate(row.role_name) },
              { key: 'role_code', label: 'Code' },
              { key: 'manager_cnt', label: 'Staff', isNumeric: true },
              { key: 'department_id', label: 'Meant for',
                render: (row) => picker(row.department_id, (value) => change(() => crm.departments.setRoleDepartment(row.role_id, value))) }
            ]}
          />
        </Box>
      </Card>
    </Stack>
  );
}
