import React, { useEffect, useRef, useState } from 'react';
import {
  Box, Button, Flex, HStack, Input, InputGroup, InputLeftElement, SimpleGrid, Spinner, Stack, Text,
  useColorModeValue
} from '@chakra-ui/react';
import { SearchIcon } from '@chakra-ui/icons';

import SelectField from '../../components/SelectField';
import StatusBadge from '../../components/StatusBadge';
import { crm } from '../../api';
import { useT } from '../../i18n';

/**
 * WHAT EVERY CRM SCREEN SHARES.
 *
 * The CRM names things by CODE - DRAFT, TARGETS_FROZEN, OWNER, PHONE_9 - the
 * way its tables do. A code is not a word, so it is never put on screen as it
 * is: WORDS below turns each one into English, and translate() turns the English into
 * the reader's language through the catalogue, the same way a column label
 * is. A code nobody has written a word for falls through as itself, which is
 * visible and greppable rather than blank.
 */
export const WORDS = {
  /* statuses of every kind */
  ACTIVE: 'Active', INACTIVE: 'Inactive', MERGED: 'Merged', DELETED: 'Deleted',
  DRAFT: 'Draft', APPROVED: 'Approved', TARGETS_FROZEN: 'Targets frozen', OPEN: 'Open',
  CLOSED: 'Closed', FULFILLED: 'Fulfilled', CANCELLED: 'Cancelled',
  PENDING: 'Pending', RESERVED: 'Reserved', PAID: 'Paid', EXPIRED: 'Expired', FAILED: 'Failed',
  ELIGIBLE: 'Eligible', NOTIFIED: 'Notified', EXHAUSTED: 'Used up', REVOKED: 'Revoked',
  REQUESTED: 'Requested', ACCEPTED: 'Accepted', REJECTED: 'Rejected', COMPLETED: 'Completed',
  READY: 'Ready', DISPATCHED: 'Dispatched', DELIVERED: 'Delivered', PICKED_UP: 'Picked up', CREDITED: 'Credited',
  ENDED: 'Ended', SUSPENDED: 'Suspended', LEFT: 'Left',
  PLANNED: 'Planned', CONFIRMED: 'Confirmed', IN_PROGRESS: 'In progress', REVERSED: 'Reversed',
  GRANTED: 'Granted', DENIED: 'Denied', WITHDRAWN: 'Withdrawn', NOT_REQUIRED: 'Not required',
  SKIPPED: 'Skipped', QUEUED: 'Queued', SENT: 'Sent', RUNNING: 'Running', COMPLETE: 'Complete',
  PAUSED: 'Paused', ARCHIVED: 'Archived', LOST: 'Lost', STOLEN: 'Stolen', SCRAPPED: 'Scrapped',
  VOID: 'Void', INVALID: 'Invalid', RETIRED: 'Retired',

  /* party and contact */
  PERSON: 'Person', ORGANIZATION: 'Organization',
  PLATFORM: 'Platform', EXACT: 'Exact match', MATCHED: 'Matched', REVIEWED: 'Reviewed',
  EXACT_MATCH: 'Exact match', REVIEWED_MATCH: 'Reviewed match',

  /* point movements */
  EARN: 'Earned', REDEEM: 'Redeemed', EXPIRE: 'Expired points', ADJUST: 'Adjustment', REFUND: 'Refund',
  RESERVATION_COST: 'Reservation cost', EVENT_AWARD: 'Event award', MERGE_CARRY_OVER: 'Carried over on merge',
  MOBILE: 'Mobile', EMAIL: 'Email', PHONE: 'Phone', SIM_CID: 'SIM card', WECHAT_ID: 'WeChat ID',
  WHATSAPP: 'WhatsApp number', PUSH_TOKEN: 'Push token',

  /* how a party holds a product */
  OWNER: 'Owner', USER: 'Assigned user', REGISTERED_USER: 'Registered user', LESSEE: 'Lessee', LICENSEE: 'Licence holder',
  DEVICE: 'Device', LICENCE: 'Licence', ENTITLEMENT: 'Entitlement',
  OWNERSHIP_TRANSFER: 'Ownership transfer', ASSIGN_USER: 'Assign a user', END_ASSIGNMENT: 'End an assignment',
  RETURN_TO_OWNER: 'Return to the owner', LEASE_START: 'Start a lease', LEASE_END: 'End a lease',
  LICENCE_REBIND: 'Move a licence to another device',
  TRANSFER: 'Transfer', ASSIGNMENT_END: 'Assignment ended', RETURNED: 'Returned', MERGE: 'Merge',
  APP: 'App', WEB: 'Web', AGENCY: 'At a service location', CONSOLE: 'Console', IMPORT: 'Import',

  /* events */
  RESERVATION: 'Reservation', LOTTERY: 'Lottery', PRIZE_SERVICE: 'Prize service', PUZZLE: 'Puzzle',
  SURVEY_REWARD: 'Survey reward', EVENT_ATTENDANCE: 'Event attendance',
  SEGMENT: 'Segment', POINT_RANKING: 'Points ranking', CORPORATE_GRADE: 'Corporate grade',
  PRODUCT_REGISTRATION: 'Product registration', SERVICE_CENTER_ACTIVITY: 'Service center activity', MANUAL: 'By hand',
  RANKING: 'Ranking', GRADE: 'Grade', REGISTRATION: 'Registration', LOCATION: 'Service location',
  NORMAL: 'Normal', REWARD: 'Reward',
  DELIVERABLE_GOODS: 'Goods to deliver', PICKUP_GOODS: 'Goods to collect', PRODUCT_COUPON: 'Product coupon',
  POINTS: 'Points', WALLET_CREDIT: 'Wallet credit',
  DELIVERY: 'Delivery', PICKUP: 'Collection', WALLET: 'Wallet', SALE: 'Sale', EVENT_VENUE: 'Event venue',
  DELIVERY_HUB: 'Delivery hub',

  /* sites */
  SERVICE_CENTER: 'Service centre', SALES_AGENCY: 'Sales agency', COLLECTION_POINT: 'Collection point',
  PARTNER_SHOP: 'Partner shop', OFFICE: 'Office',
  PROMOTION_DAY: 'Promotion day', PRODUCT_LAUNCH: 'Product launch', ROADSHOW: 'Roadshow', TRAINING: 'Training',
  INSPECTION: 'Inspection', EVENT_PICKUP_DAY: 'Collection day', COMMUNITY_EVENT: 'Community event',
  SERVICE: 'Service', SALES: 'Sales', SOFTWARE: 'Software', EVENT: 'Event', MARKETING: 'Marketing',
  OPERATIONS: 'Operations',

  /* the analysis */
  NEW: 'New', AT_RISK: 'At risk', LAPSED: 'Lapsed', NEVER_BOUGHT: 'Never bought',

  /* transactions */
  SERVICE_PAYMENT: 'Service payment',
  RESERVATION_PAYMENT: 'Reservation payment', RETURN: 'Return', REVERSAL: 'Reversal',
  REFUNDED: 'Refunded', FINISHED: 'Finished', DELIVERING: 'Delivering', CANCEL_PENDING: 'Cancel requested',
  REFUND_PENDING: 'Refund requested', REFUND_ACCEPTED: 'Refund accepted', SUCCESS: 'Succeeded',
  BUYER: 'Buyer', PAYER: 'Payer', RECEIVER: 'Receiver', SELLER: 'Seller',

  /* project tiers */
  LEVEL: 'Level', CARD_CLASS: 'Card class',

  /* catalogue */
  SUBSCRIPTION: 'Subscription', GOODS: 'Goods', DISCONTINUED: 'Discontinued',
  SMARTPHONE: 'Smartphone', EPRODUCT: 'Eproduct',

  /* what earns points */
  DAILY_LOGIN: 'Daily sign-in', DUTY: 'Task', PURCHASE: 'Purchase', LICENCE_PURCHASE: 'Licence purchase',
  APP_PURCHASE: 'App purchase', REPAIR: 'Repair', BLOG: 'Blog post',

  /* what a site can do */
  DEVICE_SALE: 'Device sale', APP_INSTALL: 'App install', LICENCE_ISSUE: 'Licence issue',
  REGISTRATION_ASSIST: 'Registration help', RESERVATION_PICKUP: 'Reservation pickup', PRIZE_PICKUP: 'Prize pickup',
  OS: 'OS install', INSURANCE: 'Insurance', REPLACEMENT: 'Replacement', MEDIA_SERVICE: 'Media service',
  STREAMING_DEVICES: 'Streaming devices', COMPUTER: 'Computers', CORDLESS_PHONE: 'Cordless phones', CAMERA_DEVICE: 'Cameras',

  /* service */
  WALK_IN: 'Walk-in', MAIL_IN: 'Mail-in', ON_SITE: 'On site', COURIER: 'Courier', PHONE_CALL: 'Phone call',

  /* campaigns */
  PROMOTION: 'Promotion', RETENTION: 'Retention', WIN_BACK: 'Win-back', EVENT_NOTICE: 'Event notice',
  SURVEY: 'Survey', RULE: 'Rule', EVENT_TARGETS: 'Event targets',
  SEND_MESSAGE: 'Send a message', CALL: 'Call', PUSH: 'Push notification', IN_APP: 'In the app', SMS: 'SMS',
  NO_OPTION: 'Not offered', OPTED_OUT: 'Opted out', NO_CONSENT: 'No consent', NO_CONTACT: 'No contact',
  MEDIA: 'Media', EMAIL_PROVIDER: 'Email provider', COUPON: 'Coupon', PRIZE: 'Prize', OTHER: 'Other',
  /* customer 360: accounts, campaign outcomes, interactions, the account team, agreements */
  PRIMARY: 'Primary', LINKED: 'Linked', UNLINKED: 'Unlinked', NOT_LINKED: 'Not linked',
  NOT_OPENED: 'Not opened', OPENED: 'Opened', CLICKED: 'Clicked', PURCHASED: 'Purchased', NOT_SENT: 'Not sent yet',
  GENERAL_INQUIRY: 'General inquiry', PRODUCT_SUPPORT: 'Product support', ORDER_INQUIRY: 'Order inquiry',
  COMPLAINT: 'Complaint', FEEDBACK: 'Feedback', SERVICE_NOTICE: 'Service notice', FOLLOW_UP: 'Follow-up',
  CHAT: 'Chat', IN_PERSON: 'In person', LETTER: 'Letter',
  ANSWERED: 'Answered', RESOLVED: 'Resolved', NO_ANSWER: 'No answer', INBOUND: 'Inbound', OUTBOUND: 'Outbound',
  ACCOUNT_MANAGER: 'Account manager', SALES_REP: 'Sales rep', SUPPORT_MANAGER: 'Support manager',
  ENTERPRISE: 'Enterprise agreement', RESELLER: 'Reseller agreement', DISTRIBUTION: 'Distribution agreement',
  SERVICE_LEVEL: 'Service level agreement', PARTNERSHIP: 'Partnership', TERMINATED: 'Terminated',
  EMPLOYER: 'Employer', ANY: 'Anyone'
};

/* The colour a status reads in, where StatusBadge's own palette has no opinion. */
const TONE = {
  APPROVED: 'blue', TARGETS_FROZEN: 'purple', FULFILLED: 'green', CANCELLED: 'red', RESERVED: 'blue',
  PAID: 'teal', FAILED: 'red', ELIGIBLE: 'green', NOTIFIED: 'blue', EXHAUSTED: 'gray', REVOKED: 'red',
  REQUESTED: 'orange', ACCEPTED: 'blue', REJECTED: 'red', COMPLETED: 'green', READY: 'teal',
  DISPATCHED: 'blue', DELIVERED: 'green', PICKED_UP: 'green', CREDITED: 'green', ENDED: 'gray',
  SUSPENDED: 'orange', MERGED: 'purple', PLANNED: 'gray', CONFIRMED: 'blue', IN_PROGRESS: 'orange',
  REVERSED: 'red', GRANTED: 'green', DENIED: 'red', WITHDRAWN: 'orange', SKIPPED: 'gray', QUEUED: 'blue',
  SENT: 'teal', RUNNING: 'orange', COMPLETE: 'green', PAUSED: 'orange', LEFT: 'gray', INACTIVE: 'gray'
};

/**
 * The field problems an API refusal carries in `detail` ([{ field, message }]),
 * joined with '; ', for a toast's description - so "some details are not valid"
 * is followed by which ones and why. Undefined when there are none.
 */
export function problemsOf(error) {
  const list = error && Array.isArray(error.detail) ? error.detail.filter((item) => item && item.message) : [];
  return list.length ? list.map((item) => item.message).join('; ') : undefined;
}

/** A code as the reader's word. */
export function word(translate, code) {
  if (code === null || code === undefined || code === '') return '-';
  return WORDS[code] ? translate(WORDS[code]) : String(code);
}

/** Select options for a list of codes, labelled by WORDS. */
export function choices(codes) {
  return codes.map(function (code) { return { value: code, label: WORDS[code] || code }; });
}

/** A status as a coloured word. */
export function Status({ value }) {
  const translate = useT();
  /* Only override the badge's own palette where this list has an opinion. */
  const tone = TONE[value] ? { colorScheme: TONE[value] } : {};
  return <StatusBadge value={value} label={word(translate, value)} {...tone} />;
}

/* ------------------------------------------------------------ the vocabularies */

let metaCache = null;
let metaAt = 0;

/**
 * THE CRM'S LISTS, loaded once and shared by every screen for a minute.
 *
 * A screen with four forms would otherwise ask four times, and moving between
 * CRM screens would ask again each time for twenty tables that change a few
 * times a year. A minute is short enough that an edit on the settings screen
 * shows up on the next screen opened after it.
 */
export function useCrmMeta() {
  const [meta, setMeta] = useState(metaCache || {});
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (metaCache && Date.now() - metaAt < 60000) return undefined;

    crm.meta()
      .then(({ data }) => {
        metaCache = data && typeof data === 'object' ? data : {};
        metaAt = Date.now();
        if (mounted.current) setMeta(metaCache);
      })
      .catch(() => { if (mounted.current) setMeta({}); });

    return () => { mounted.current = false; };
  }, []);

  return meta;
}

/** Forget the cached lists - the settings screen calls this after a save. */
export function forgetCrmMeta() {
  metaCache = null;
  metaAt = 0;
}

/** A vocabulary as select options. */
export function optionsFrom(list, idKey, label) {
  return (Array.isArray(list) ? list : []).map(function (row) {
    return { value: row[idKey], label: typeof label === 'function' ? label(row) : row[label] };
  });
}

/* ------------------------------------------------------------ pickers */

/** Finding one registered customer: see PartyPicker.jsx. */
export { default as PartyPicker } from './PartyPicker';

/** Finding one product instance, by serial, IMEI or product name. */
export function InstancePicker({ value, onChange }) {
  const translate = useT();
  const [query, setQuery] = useState('');
  const [found, setFound] = useState([]);

  useEffect(() => {
    if (!query || query.trim().length < 2) { setFound([]); return undefined; }
    const timer = setTimeout(() => {
      crm.products.instanceLookup(query.trim())
        .then(({ data }) => setFound(Array.isArray(data) ? data : []))
        .catch(() => setFound([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <Stack spacing={2}>
      <InputGroup size="sm">
        <InputLeftElement pointerEvents="none"><SearchIcon color="gray.400" boxSize="0.8em" /></InputLeftElement>
        <Input
          borderRadius="md" value={query} placeholder={translate('crm.common.findAProduct')}
          onChange={(event) => setQuery(event.target.value)}
        />
      </InputGroup>
      <SelectField
        size="sm"
        isSearchable={false}
        value={value || null}
        placeholder={translate('crm.common.chooseFromTheMatches')}
        options={found.map((instance) => ({
          value: instance.product_instance_id,
          label: instance.external_product_instance_id + '  ' + (instance.product_name || '') + (instance.holder_name ? '  (' + instance.holder_name + ')' : '')
        }))}
        onChange={(next) => onChange(next === undefined ? null : next)}
      />
    </Stack>
  );
}

/** Every open site, as options. */
export function useSiteOptions() {
  const [sites, setSites] = useState([]);
  useEffect(() => {
    let live = true;
    crm.sites.options()
      .then(({ data }) => { if (live) setSites(Array.isArray(data) ? data : []); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  return sites.map((site) => ({ value: site.service_center_id, label: site.service_center_name + '  ' + site.service_center_code }));
}

/** The CRM product catalogue, as options. */
export function useCatalogOptions() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let live = true;
    crm.products.catalogLookup()
      .then(({ data }) => { if (live) setRows(Array.isArray(data) ? data : []); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  return rows.map((product) => ({ value: product.product_id, label: product.product_name + '  ' + product.project_code }));
}

/* ------------------------------------------------------------ layout */

/** A labelled value, the way a record's facts are laid out on a detail screen. */
export function Fact({ label, children }) {
  const translate = useT();
  const muted = useColorModeValue('gray.500', 'gray.400');
  return (
    <Box minW={0}>
      <Text fontSize="0.66rem" color={muted} textTransform="uppercase" letterSpacing="0.05em">{translate(label)}</Text>
      <Box fontSize="sm" mt="2px" wordBreak="break-word">
        {children === null || children === undefined || children === '' ? '-' : children}
      </Box>
    </Box>
  );
}

export function Facts({ children, columns }) {
  return <SimpleGrid columns={columns || { base: 1, sm: 2, lg: 4 }} spacing={4}>{children}</SimpleGrid>;
}

/** The strip at the top of a record: what it is, and what can be done to it. */
export function RecordHeader({ title, subtitle, badges, actions, onBack }) {
  const translate = useT();
  const muted = useColorModeValue('gray.500', 'gray.400');
  return (
    <Flex justify="space-between" align="flex-start" wrap="wrap" mb={4}>
      <Box mb={2} mr={4}>
        <HStack spacing={3} align="center">
          {onBack ? <Button size="sm" variant="ghost" onClick={onBack}>{translate('common.back')}</Button> : null}
          <Text fontSize="lg" fontWeight="700">{title}</Text>
          {badges}
        </HStack>
        {subtitle ? <Text fontSize="sm" color={muted} mt={1}>{subtitle}</Text> : null}
      </Box>
      <HStack spacing={2} wrap="wrap">{actions}</HStack>
    </Flex>
  );
}

/** Loading, or not found - what a detail screen shows before it has a record. */
export function Pending({ loading }) {
  const translate = useT();
  if (loading) return <Flex justify="center" py={10}><Spinner /></Flex>;
  return <Text fontSize="sm" py={6}>{translate('crm.common.notFound')}</Text>;
}

/** A customer as screens show it: its party_pk. */
/**
 * A person's address, shown once. The address text is the full written
 * address (kept for search), so when there is one it is shown alone; the
 * location name from the location list is only the fallback. Showing both
 * printed the town twice.
 */
export function homeAddress(addressLine, locationName) {
  return addressLine || locationName || '';
}

export function partyIdLabel(partyId) {
  return partyId || '';
}

/** A number with a unit, blank-safe. */
export function amount(value, digits) {
  if (value === null || value === undefined || value === '') return '-';
  const numeric = Number(value);
  if (!isFinite(numeric)) return String(value);
  return numeric.toLocaleString(undefined, { maximumFractionDigits: digits === undefined ? 3 : digits });
}

/** Rows from a list reply, whatever shape the reply turned out to be. */
export function rowsOf(data) {
  if (Array.isArray(data)) return data;
  return (data && Array.isArray(data.rows)) ? data.rows : [];
}

/** Run an action with a toast either way; resolves true when it worked. */
export async function attempt(toast, translate, work, done) {
  try {
    const result = await work();
    toast({ title: translate(done || 'common.saved'), status: 'success', duration: 2500 });
    return result || true;
  } catch (error) {
    toast({ title: error.message, status: 'error', duration: 6000, isClosable: true });
    return false;
  }
}

/**
 * A stored timestamp as a datetime-local input shows it: "2026-09-30T16:24".
 *
 * The API sends ISO with a zone; the input wants local wall-clock time with no
 * zone, and shows nothing at all when handed the former.
 */
export function localInput(value) {
  if (!value) return '';
  const when = new Date(value);
  if (isNaN(when.getTime())) return '';
  const pad = (part) => String(part).padStart(2, '0');
  return when.getFullYear() + '-' + pad(when.getMonth() + 1) + '-' + pad(when.getDate()) +
    'T' + pad(when.getHours()) + ':' + pad(when.getMinutes());
}

/** The same for a date-only input: "2026-09-30". */
export function dateInput(value) {
  return localInput(value).slice(0, 10);
}

/** Option labels in the reader's language, for a SelectField that is not inside a FormModal. */
export function translateOptions(translate, options) {
  return (options || []).map(function (option) {
    return typeof option.label === 'string' ? Object.assign({}, option, { label: translate(option.label) }) : option;
  });
}

/**
 * A Toolbar's filters in the reader's language.
 *
 * The Toolbar hands its filters to SelectField as they are, and SelectField
 * draws a label as it is given - so a filter declared in English would be
 * English on a Chinese screen. Each filter's name (shown as its placeholder)
 * and each of its options go through translate() here instead.
 */
export function filtersFor(translate, filters) {
  return filters.map(function (filter) {
    return Object.assign({}, filter, {
      placeholder: translate(filter.placeholder || filter.label),
      options: translateOptions(translate, filter.options)
    });
  });
}
