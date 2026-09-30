import React from 'react';
import { Box, Text, Wrap, WrapItem, Tag } from '@chakra-ui/react';
import CrudPage from '../../components/CrudPage';
import StatusBadge from '../../components/StatusBadge';
import PhoneListField from '../../components/PhoneListField';
import useOptions from '../../hooks/useOptions';
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

/**
 * ADDRESSES, NOT ENGLISH, for the six sentences that differ by section.
 *
 * Everything else on this screen - the column headings, the field labels, the
 * tier and status words - is a label passed by value and looked up by its
 * English text, which is how the rest of the console writes them and how the
 * catalogue already holds them.  These six could not be.  Two were picked out
 * of a lookup table rather than written at a call site and four were
 * ternaries spanning several lines, and neither shape is something the
 * coverage test can see - which is exactly why all six reached a Chinese
 * reader in English while every heading around them was translated.
 *
 * They are kept in tables here rather than inlined because the pair is the
 * point: each section has one, and a screen that reads one of them and
 * hard-codes the other is the bug this file keeps almost having.
 */
const SECTION_TITLE = {
  SMARTPHONE: 'support.agencies.smartphoneServiceCentres',
  EPRODUCT: 'support.agencies.eproductServiceCentres'
};

const SECTION_SUBTITLE = {
  SMARTPHONE: 'support.agencies.centresThatServeSmartphoneCustomers',
  EPRODUCT: 'support.agencies.centresThatServeEproductCustomers'
};

const SECTION_SERVICES_HELP = {
  SMARTPHONE: 'support.agencies.onlyTheseFourAreAccepted',
  EPRODUCT: 'support.agencies.onlyTheseSixAreAccepted'
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
 *
 * THE DISPLAY ORDER is the default sort of this list AND of the storefront's:
 * lower first, and a blank one is "not placed" - it follows every placed
 * centre in province, tier and name order, so moving one centre to the top
 * does not mean numbering a hundred. The LANDMARK is for staff and never
 * leaves the console: the storefront API does not select it (see
 * agencies.repository.js, PUBLIC, and the check in scripts/check.js).
 */
export default function Agencies({ section }) {
  const t = useT();

  const scope = section || 'SMARTPHONE';
  const vocabulary = SECTION_SERVICES[scope];

  /*
   * EVERY PROVINCE A CENTRE MAY BE FILED UNDER, in the order the Provinces
   * screen set - the empty ones too, because a centre opening in a new
   * province is exactly when it has no centres yet. A picked list rather than
   * a text box: the storefront filters by this name, and "Guangdong " with a
   * trailing space was a centre the filter would never have offered.
   */
  const { options: provinces } = useOptions(() => agencies.provinces({ all: 1 }), []);

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
      defaultSort="sort_order"
      title={t(SECTION_TITLE[scope])}
      /*
       * `section` rides on every request: it filters the list to the centres
       * that offer this section, and it tells the save which service list it
       * is replacing.
       */
      params={{ section: scope }}
      subtitle={t(SECTION_SUBTITLE[scope])}
      columns={[
        {
          key: 'name', label: 'Service centre', maxW: '14.375rem',
          render: (row) => (
            <Box>
              <Text fontSize="xs" fontWeight="600" noOfLines={1}>{row.name}</Text>
              <Text fontSize="0.65rem" color="gray.500" noOfLines={1}>
                {row.province}
              </Text>
              {/* The landmark is what staff give a courier; it sits under the
                  province it narrows down, and nowhere a customer can see. */}
              {row.landmark ? (
                <Text fontSize="0.65rem" color="gray.500" fontStyle="italic" noOfLines={2}>
                  {row.landmark}
                </Text>
              ) : null}
            </Box>
          )
        },
        { key: 'code', label: 'Code' },
        {
          /* Blank is "not placed" - after every numbered centre. */
          key: 'sort_order', label: 'Display order', isNumeric: true,
          render: (row) => (row.sort_order === null || row.sort_order === undefined ? '-' : row.sort_order)
        },
        {
          key: 'phones', label: 'Phone numbers', sortable: false, maxW: '11.25rem',
          render: (row) => {
            const phones = Array.isArray(row.phones) ? row.phones : [];
            if (!phones.length) return <Text fontSize="xs" color="gray.500">-</Text>;

            return (
              <Box>
                {phones.map((entry) => (
                  <Text key={entry.phone} fontSize="xs" noOfLines={1}>
                    {entry.phone}
                    {entry.label ? <Text as="span" color="gray.500">{' - ' + entry.label}</Text> : null}
                  </Text>
                ))}
              </Box>
            );
          }
        },
        {
          key: 'tier', label: 'Tier',
          render: (row) => t((TIERS.filter((tier) => tier.value === row.tier)[0] || {}).label || '-')
        },
        {
          /*
           * The hour is part of the sentence, not a suffix bolted onto a
           * number: 'h' is an English abbreviation, and concatenating it left
           * a Russian reader reading "48h". The whole cell goes through the
           * catalogue so each language can put its own unit where it belongs.
           */
          key: 'sla_hours', label: 'SLA', isNumeric: true,
          render: (row) => (row.sla_hours === null || row.sla_hours === undefined
            ? '-'
            : t('support.agencies.slaHours', { hours: row.sla_hours }))
        },
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
        services: servicesOf(row),
        phones: Array.isArray(row.phones) ? row.phones : []
      })}
      toPayload={(values) => Object.assign({}, values, { section: scope })}
      fields={[
        { name: 'name', label: 'Name', required: true },
        { name: 'code', label: 'Code' },
        {
          name: 'province', label: 'Province', type: 'select', required: true, isSearchable: true,
          options: provinces.map((row) => ({ value: row.province, label: row.province })),
          help: 'support.agencies.provincesAreAddedAndOrdered'
        },
        {
          /*
           * Blank is "not placed", and it has to be SENDABLE: an empty number
           * box is normally left out of the save, which would make a placed
           * centre impossible to un-place.
           */
          name: 'sort_order', label: 'Display order', type: 'number', nullable: true,
          help: 'support.agencies.lowerComesFirstHere'
        },
        {
          name: 'address', label: 'Address', required: true, span: 2,
          help: 'The whole address, city included - there is no separate city field.'
        },
        {
          name: 'landmark', label: 'Landmark', span: 2,
          help: 'support.agencies.theWellKnownBuildingNearby'
        },
        {
          name: 'phones', label: 'Phone numbers', type: 'custom', span: 2,
          help: 'support.agencies.theFirstNumberIsThe',
          render: (values, set) => (
            <PhoneListField value={values.phones} onChange={(next) => set('phones', next)} />
          )
        },
        { name: 'tier', label: 'Tier', type: 'select', options: TIERS },
        {
          /*
           * ACTIVE and INACTIVE - the two words record_status has. This offered
           * CLOSED, which the column's type refuses, so closing a centre from
           * this form failed with an error about a word nobody had typed.
           */
          name: 'status', label: 'Status', type: 'select',
          options: [{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }]
        },
        { name: 'sla_hours', label: 'Promised turnaround (hours)', type: 'number' },
        { name: 'daily_capacity', label: 'Tickets a day', type: 'number' },

        { type: 'section', label: SECTION_TITLE[scope] },
        {
          name: 'services', label: 'Services offered here', type: 'multiselect', span: 2,
          options: vocabulary,
          help: SECTION_SERVICES_HELP[scope]
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
