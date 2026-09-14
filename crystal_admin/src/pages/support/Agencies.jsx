import React from 'react';
import { Box, Text, Wrap, WrapItem, Tag } from '@chakra-ui/react';
import CrudPage from '../../components/CrudPage';
import StatusBadge from '../../components/StatusBadge';
import { agencies } from '../../api';
import { useT } from '../../i18n';

export const PAGE = '/admin/support/agencies';
export const SMARTPHONE_PAGE = '/admin/support/agencies/smartphone';
export const EPRODUCT_PAGE = '/admin/support/agencies/eproduct';

const TIERS = [
  { value: 0, label: 'Collection point' },
  { value: 1, label: 'Authorised' },
  { value: 2, label: 'Flagship' },
  { value: 3, label: 'Factory service' }
];

/**
 * WHAT A CENTRE MAY OFFER, and it is a different list per section.
 *
 * Fixed rather than free text, and the server rejects anything outside these -
 * see services/agencies.service.js, which holds the same two lists. They are
 * the counters a customer picks from on the storefront, so a centre that typed
 * "Repairs" instead of "REPAIR" would simply not appear under the filter and
 * nobody would notice until somebody drove there.
 *
 * The two overlap only at REPAIR. That is the same word for two different
 * counters, which is exactly why the section is part of the key rather than
 * something inferred from the service name.
 */
const SECTION_SERVICES = {
  SMARTPHONE: [
    { value: 'OS', label: 'Crystal OS' },
    { value: 'REPAIR', label: 'Repair' },
    { value: 'INSURANCE', label: 'Insurance' },
    { value: 'REPLACEMENT', label: 'Replacement' }
  ],
  EPRODUCT: [
    { value: 'MEDIA_SERVICE', label: 'Media service' },
    { value: 'REPAIR', label: 'Repair' },
    { value: 'STREAMING_DEVICES', label: 'Streaming devices' },
    { value: 'COMPUTER', label: 'Computer' },
    { value: 'CORDLESS_PHONE', label: 'Cordless phone' },
    { value: 'CAMERA_DEVICE', label: 'Camera device' }
  ]
};

const SECTION_TITLE = {
  SMARTPHONE: 'Smartphone service centres',
  EPRODUCT: 'Eproduct service centres'
};

/**
 * The service centres, ONE SECTION AT A TIME.
 *
 * The same building repairs a handset and a set-top box, but they are two
 * businesses to the people who run them - a different manager, a different
 * service vocabulary - so they are two screens, each granted independently in
 * the permission grid.
 *
 * There is still ONE `agencies` row behind both. Splitting the table would
 * have meant one real place described twice, with two addresses to keep in
 * step when it moves; what differs between the sections is what the centre
 * OFFERS, and that is `agency_services`, which carries the section.
 *
 * The consequence worth knowing: **saving here replaces only this section's
 * service list.** The other section's list is left exactly as it was, because
 * somebody else maintains it. That is enforced on the server, in
 * `repo.replaceServices`, rather than trusted to this form.
 *
 * Tier decides what a centre is allowed to attempt - a board-level repair does
 * not belong at a collection point - and the SLA is per centre rather than
 * global, because a flagship in a capital city and a collection point three
 * provinces away cannot honestly promise the same turnaround.
 */
export default function Agencies({ section }) {
  const t = useT();

  const scope = section || 'SMARTPHONE';
  const vocabulary = SECTION_SERVICES[scope];

  /*
   * The API sends services as `SECTION:TYPE` pairs, because "REPAIR" alone
   * does not say which counter. This screen only shows one section, so the
   * prefix is stripped for display.
   */
  const servicesOf = (row) => String(row.services || '')
    .split(',')
    .filter(Boolean)
    .map((entry) => (entry.indexOf(':') === -1 ? entry : entry.split(':')[1]));

  const labelFor = (value) => {
    const found = vocabulary.filter((option) => option.value === value)[0];
    return t(found ? found.label : value);
  };

  return (
    <CrudPage
      page={scope === 'EPRODUCT' ? EPRODUCT_PAGE : SMARTPHONE_PAGE}
      excel={true}
      api={agencies}
      defaultSort="name"
      title={t(SECTION_TITLE[scope])}
      /*
       * `section` rides on every request: it filters the list to the centres
       * that offer this section, and it tells the save which service list it
       * is replacing.
       */
      params={{ section: scope }}
      subtitle={t(scope === 'EPRODUCT'
        ? 'Centres that serve eproduct customers. Saving here does not touch their smartphone counter.'
        : 'Centres that serve smartphone customers. Saving here does not touch their eproduct counter.')}
      columns={[
        {
          key: 'name', label: 'Service centre', maxW: '14.375rem',
          render: (row) => (
            <Box>
              <Text fontSize="xs" fontWeight="600" noOfLines={1}>{row.name}</Text>
              <Text fontSize="0.65rem" color="gray.500" noOfLines={1}>
                {row.province}
              </Text>
            </Box>
          )
        },
        { key: 'code', label: 'Code' },
        {
          key: 'tier', label: 'Tier',
          render: (row) => t((TIERS.filter((tier) => tier.value === row.tier)[0] || {}).label || '-')
        },
        { key: 'sla_hours', label: 'SLA', isNumeric: true, render: (row) => row.sla_hours + 'h' },
        { key: 'daily_capacity', label: 'Capacity', isNumeric: true },
        { key: 'technician_cnt', label: 'Technicians', isNumeric: true },
        { key: 'open_cnt', label: 'Open', isNumeric: true },
        {
          key: 'services', label: 'Offers here', maxW: '16.25rem', sortable: false,
          render: (row) => {
            const offered = servicesOf(row);
            if (!offered.length) return <Text fontSize="xs" color="gray.500">-</Text>;

            return (
              <Wrap spacing="0.25rem">
                {offered.map((value) => (
                  <WrapItem key={value}>
                    <Tag size="sm" borderRadius="0.375rem" fontSize="0.62rem">
                      {labelFor(value)}
                    </Tag>
                  </WrapItem>
                ))}
              </Wrap>
            );
          }
        },
        { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> }
      ]}
      /*
       * The form holds the section's service list as `services`; `fromRow`
       * seeds it from the row the list already carries, so opening the editor
       * costs no extra request.
       */
      fromRow={(row) => Object.assign({}, row, {
        section: scope,
        services: servicesOf(row)
      })}
      toPayload={(values) => Object.assign({}, values, { section: scope })}
      fields={[
        { name: 'name', label: 'Name', required: true },
        { name: 'code', label: 'Code' },
        { name: 'province', label: 'Province', required: true },
        {
          name: 'phone', label: 'Phone'
        },
        {
          name: 'address', label: 'Address', required: true, span: 2,
          help: 'The whole address, city included - there is no separate city field.'
        },
        { name: 'tier', label: 'Tier', type: 'select', options: TIERS },
        {
          name: 'status', label: 'Status', type: 'select',
          options: [{ value: 'ACTIVE', label: 'Active' }, { value: 'CLOSED', label: 'Closed' }]
        },
        { name: 'sla_hours', label: 'Promised turnaround (hours)', type: 'number' },
        { name: 'daily_capacity', label: 'Tickets a day', type: 'number' },

        { type: 'section', label: SECTION_TITLE[scope] },
        {
          name: 'services', label: 'Services offered here', type: 'multiselect', span: 2,
          options: vocabulary,
          help: scope === 'EPRODUCT'
            ? 'Only these six are accepted. The centre smartphone counter is edited on its own page.'
            : 'Only these four are accepted. The centre eproduct counter is edited on its own page.'
        }
      ]}
    />
  );
}

/** The two screens, so the router and the permission grid can name each. */
export function SmartphoneAgencies() {
  return <Agencies section="SMARTPHONE" />;
}

export function EproductAgencies() {
  return <Agencies section="EPRODUCT" />;
}
