import React, { useCallback, useEffect, useState } from 'react';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import {
  Badge, Box, Breadcrumb, BreadcrumbItem, BreadcrumbLink, Button, ButtonGroup, Collapse, Divider, Flex, Grid, HStack, Icon,
  IconButton, Menu, MenuButton, MenuDivider, MenuItem, MenuList, SimpleGrid, Stack, Tab, TabList, TabPanel, TabPanels, Tabs,
  Text, Tooltip, Wrap, WrapItem, useColorModeValue, useDisclosure, useToast
} from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';
import * as Md from 'react-icons/md';

import Card from '../../components/Card';
import FormModal from '../../components/FormModal';
import { useConfirm } from '../../components/ConfirmDialog';
import usePermission from '../../hooks/usePermission';
import { crm } from '../../api';
import { useT } from '../../i18n';
import { useSurface } from '../../theme/tokens';
import { date, money, number } from '../../utils/format';
import { PartyPicker, Pending, amount, choices, optionsFrom, problemsOf, useCrmMeta, useSiteOptions, word, partyIdLabel } from './shared';
import CrmSearch from './CrmSearch';
import {
  AccountsCard, ContactPointsCard, HierarchyCard, InteractionsCard, KeyContactsCard, KeyMetricsCard, KeySegments,
  MarketingCard, NotesCard, OrganizationInfoCard, ProductsCard, RecentOrdersCard, RelatedPartiesCard,
  RelationshipOwnershipCard, ServiceSummaryCard, ValueMetricsCard, companySize
} from './c360Cards';
import {
  AccountsTab, AnalyticsTab, CampaignsTab, ConsentTab, ContactsTab, NotesFilesTab, OrdersTab, OrganizationTab, ProductsTab,
  RelatedTab, ServiceTab
} from './c360Tabs';
import { HeaderStat, Pill, TagChip } from './ui360';

const PAGE = '/admin/crm/customers';
const CONTACT_TYPES = ['MOBILE', 'EMAIL', 'PHONE', 'SIM_CID', 'WECHAT_ID', 'WHATSAPP'];

/* The tabs of each kind of customer, in the order the record shows them. */
const PERSON_TABS = [
  ['overview', 'crm.c360.tabOverview'], ['accounts', 'crm.c360.tabAccounts'], ['orders', 'crm.c360.tabOrders'],
  ['products', 'crm.c360.tabProducts'], ['service', 'crm.c360.tabService'], ['campaigns', 'crm.c360.tabCampaigns'],
  ['analytics', 'crm.c360.tabAnalytics'], ['consent', 'crm.c360.tabConsent'], ['related', 'crm.c360.tabRelated'],
  ['notes', 'crm.c360.tabNotes']
];
const ORGANIZATION_TABS = [
  ['overview', 'crm.c360.tabOverview'], ['organization', 'crm.c360.tabOrganization'], ['contacts', 'crm.c360.tabContacts'],
  ['accounts', 'crm.c360.tabAccountsProjects'], ['orders', 'crm.c360.tabOrdersTransactions'], ['products', 'crm.c360.tabProducts'],
  ['service', 'crm.c360.tabService'], ['campaigns', 'crm.c360.tabCampaigns'], ['analytics', 'crm.c360.tabAnalytics'],
  ['consent', 'crm.c360.tabConsent'], ['related', 'crm.c360.tabRelated'], ['notes', 'crm.c360.tabNotes']
];

function ageOf(birthDate) {
  if (!birthDate) return null;
  const born = new Date(birthDate);
  const today = new Date();
  let years = today.getFullYear() - born.getFullYear();
  if (today.getMonth() < born.getMonth() || (today.getMonth() === born.getMonth() && today.getDate() < born.getDate())) years -= 1;
  return years;
}

/**
 * CUSTOMER 360 - one customer, every project, on one screen.
 *
 * Two layouts on the same record, as the design draws them:
 *
 *   AN INDIVIDUAL - who they are and how to reach them, their value (lifetime
 *   value, average order, purchase frequency, RFM), their accounts, orders,
 *   products, service and campaigns, the people they are related to, notes.
 *
 *   AN ORGANIZATION - its profile, key metrics, who owns the relationship and
 *   on what contract, its key contacts, accounts in each project, the group
 *   it belongs to, its orders, assets and service.
 *
 * The header and the overview cards read /crm/parties/:id/360; the tabs read
 * the full record from /crm/parties/:id. Each card's "View all" opens its tab,
 * and the open tab is kept in the address (?tab=) so a link or a reload
 * comes back to it.
 */
export default function CustomerDetail() {
  const translate = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const history = useHistory();
  const location = useLocation();
  const { id } = useParams();
  const meta = useCrmMeta();
  const surface = useSurface();
  const sites = useSiteOptions();
  const { canWrite } = usePermission(PAGE);
  const mergedBg = useColorModeValue('purple.50', 'whiteAlpha.100');
  const avatarBg = useColorModeValue('blue.100', 'whiteAlpha.200');

  const [detail, setDetail] = useState(null);
  const [view, setView] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null);
  const [saving, setSaving] = useState(false);
  const [model, setModel] = useState(null);
  const [version, setVersion] = useState(0);
  const [aboutOpen, setAboutOpen] = useState(false);
  const modal = useDisclosure();

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      crm.parties.get(id).then(({ data }) => setDetail(data || null)).catch(() => setDetail(null)),
      crm.customer360.overview(id).then(({ data }) => setView(data || null)).catch(() => setView(null))
    ]).finally(() => { setLoading(false); setVersion((current) => current + 1); });
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    crm.analysis.model().then(({ data }) => setModel(data || null)).catch(() => setModel(null));
  }, []);

  const record = detail || {};
  const party = record.party;
  const facts = view || {};
  const isPerson = !party || party.party_type !== 'ORGANIZATION';
  const tabs = isPerson ? PERSON_TABS : ORGANIZATION_TABS;
  const wanted = new URLSearchParams(location.search).get('tab') || 'overview';
  const tabIndex = Math.max(0, tabs.map((tab) => tab[0]).indexOf(wanted));
  const goTab = (key) => {
    const query = new URLSearchParams(location.search);
    if (key === 'overview') query.delete('tab'); else query.set('tab', key);
    history.replace({ pathname: location.pathname, search: query.toString() ? '?' + query.toString() : '' });
    window.scrollTo(0, 0);
  };

  if (!party) return <Card><Pending loading={loading} /></Card>;

  const person = record.person || {};
  const org = record.organization || {};
  const header = facts.header || {};
  const reach = facts.reach || {};
  const merged = party.party_status === 'MERGED';
  const editable = canWrite && !merged;
  const verified = (record.contacts || []).some((contact) => contact.is_verified && contact.status === 'ACTIVE');
  const profile = facts.profile || {};

  const open = (kind, initial) => { setDialog({ kind: kind, initial: initial || {} }); modal.onOpen(); };

  const run = async (work, done) => {
    setSaving(true);
    try {
      const result = await work();
      toast({ title: done ? translate(done) : translate('Saved'), status: 'success', duration: 2500 });
      modal.onClose();
      load();
      return result || true;
    } catch (error) {
      toast({ title: error.message, description: problemsOf(error), status: 'error', duration: 8000, isClosable: true });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const ask = async (title, body, detailText, work, tone) => {
    const agreed = await confirm({ tone: tone || 'danger', title: translate(title), body: translate(body), detail: detailText, confirmLabel: translate(title) });
    if (agreed) run(work);
  };

  const copyNumber = () => {
    try {
      navigator.clipboard.writeText(String(party.party_pk));
      toast({ title: translate('crm.c360.copied'), status: 'success', duration: 1500 });
    } catch (error) {
      toast({ title: partyIdLabel(party.party_pk), status: 'info', duration: 3000 });
    }
  };

  const forms = formsFor({ translate, record, party, isPerson, meta, dialog, run, sites, history, view: facts });
  const current = dialog ? forms[dialog.kind] : null;
  const act = { editable: editable, open: open, run: run, ask: ask, refresh: load, version: version, timeline: timelineOf(record, translate) };
  const unusedTags = (meta.tags || []).filter((tag) => !(facts.tags || []).some((own) => own.tag_id === tag.tag_id));

  const statusPill = (
    <Pill code={party.party_status === 'ACTIVE' ? 'ACTIVE' : party.party_status}>
      {party.party_status === 'ACTIVE' ? translate('crm.c360.activeCustomer') : word(translate, party.party_status)}
    </Pill>
  );

  /* ------------------------------------------------------------ the header, left: who they are */
  const identity = isPerson ? (
    <Flex align="flex-start" minW={0}>
      <Flex w="5.5rem" h="5.5rem" borderRadius="full" bg={avatarBg} color="blue.500" align="center" justify="center"
        fontSize="2xl" fontWeight="700" flexShrink={0} mr={5}>
        {String(party.display_name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('')}
      </Flex>
      <Box minW={0}>
        <HStack spacing={3} wrap="wrap">
          <Text fontSize="2xl" fontWeight="800" noOfLines={1}>{party.display_name || partyIdLabel(party.party_pk)}</Text>
          {statusPill}
        </HStack>
        <HStack spacing={3} mt={1} fontSize="sm">
          <Text fontWeight="700">{translate('crm.c360.partyPk', { number: partyIdLabel(party.party_pk) })}</Text>
          <IconButton size="xs" variant="ghost" icon={<Icon as={Md.MdContentCopy} />} aria-label={translate('crm.c360.copyNumber')} onClick={copyNumber} />
          <Badge variant="subtle" colorScheme="gray" textTransform="none">{translate('crm.c360.individual')}</Badge>
          {verified ? <Badge variant="subtle" colorScheme="blue" textTransform="none">{translate('crm.customer.verified')}</Badge> : null}
          <Badge variant="subtle" colorScheme={person.is_checked_manually ? 'green' : 'orange'} textTransform="none">
            {translate(person.is_checked_manually ? 'crm.customers.checkedByHand' : 'crm.customers.notCheckedYet')}
          </Badge>
        </HStack>
        <Wrap spacing={4} mt={2} fontSize="sm" color={surface.muted}>
          {GENDER[person.gender_code] ? <WrapItem>{translate(GENDER[person.gender_code])}</WrapItem> : null}
          {person.birth_date ? <WrapItem>{translate('crm.c360.born', { date: date(person.birth_date), age: ageOf(person.birth_date) })}</WrapItem> : null}
          {person.home_location_name ? <WrapItem>{person.home_location_name}</WrapItem> : null}
          {person.job_title_name ? <WrapItem>{translate(person.job_title_name)}</WrapItem> : null}
        </Wrap>
        <Wrap spacing={5} mt={2} fontSize="sm">
          {reach.email ? <WrapItem><HStack spacing={1.5}><Icon as={Md.MdMailOutline} color="brand.500" /><Text color="brand.500">{reach.email.contact_value}</Text></HStack></WrapItem> : null}
          {reach.phone ? <WrapItem><HStack spacing={1.5}><Icon as={Md.MdPhone} color={surface.muted} /><Text>{reach.phone.contact_value}</Text></HStack></WrapItem> : null}
          {person.address_line ? <WrapItem><HStack spacing={1.5}><Icon as={Md.MdPlace} color={surface.muted} /><Text>{person.address_line}</Text></HStack></WrapItem> : null}
        </Wrap>
        <TagsLine facts={facts} unusedTags={unusedTags} editable={editable} party={party} run={run} />
      </Box>
    </Flex>
  ) : (
    <Flex align="flex-start" minW={0}>
      <Flex w="5.5rem" h="5.5rem" borderRadius="full" bg={avatarBg} color="blue.500" align="center" justify="center" flexShrink={0} mr={5}>
        <Icon as={Md.MdBusiness} boxSize="2.4rem" />
      </Flex>
      <Box minW={0}>
        <HStack spacing={3} wrap="wrap">
          <Text fontSize="2xl" fontWeight="800" noOfLines={1}>{party.display_name || partyIdLabel(party.party_pk)}</Text>
          <Pill tone="purple">{translate('crm.c360.organization')}</Pill>
          {statusPill}
        </HStack>
        <HStack spacing={3} mt={1} fontSize="sm">
          <Text fontWeight="700">{translate('crm.c360.partyPk', { number: partyIdLabel(party.party_pk) })}</Text>
          <IconButton size="xs" variant="ghost" icon={<Icon as={Md.MdContentCopy} />} aria-label={translate('crm.c360.copyNumber')} onClick={copyNumber} />
        </HStack>
        <Wrap spacing={6} mt={2} fontSize="sm">
          {[
            ['crm.c360.industry', (facts.industries || []).map((industry) => translate(industry.industry_name)).join(', ')],
            ['crm.c360.companySize', companySize(profile.employee_count_band)],
            ['Location', profile.location_full_name || profile.location_name || profile.headquarters_address],
            ['crm.c360.established', date(profile.founded_date)]
          ].map((pair) => (
            <WrapItem key={pair[0]}>
              <Box>
                <Text fontSize="xs" color={surface.muted}>{translate(pair[0])}</Text>
                <Text>{pair[1] || '-'}</Text>
              </Box>
            </WrapItem>
          ))}
          <WrapItem>
            <Box>
              <Text fontSize="xs" color={surface.muted}>{translate('crm.c360.website')}</Text>
              {org.website_url
                ? <Text as="a" href={org.website_url} target="_blank" rel="noopener noreferrer" color="brand.500">{org.website_url}</Text>
                : <Text>-</Text>}
            </Box>
          </WrapItem>
        </Wrap>
        {org.description ? (
          <Box mt={2} maxW="40rem">
            <Collapse startingHeight="2.7rem" in={aboutOpen}><Text fontSize="sm">{org.description}</Text></Collapse>
            {org.description.length > 140 ? (
              <Button size="xs" variant="link" colorScheme="brand" mt={1} rightIcon={<ChevronDownIcon />} onClick={() => setAboutOpen(!aboutOpen)}>
                {translate(aboutOpen ? 'crm.c360.showLess' : 'crm.c360.showMore')}
              </Button>
            ) : null}
          </Box>
        ) : null}
        <TagsLine facts={facts} unusedTags={unusedTags} editable={editable} party={party} run={run} />
      </Box>
    </Flex>
  );

  /* ------------------------------------------------------------ the header, right: what they are worth */
  /* Why a grade set by hand was set, and what the analysis would have given. */
  const gradeNote = [header.assigned_grade_reason, header.computed_grade_code ? translate('crm.c360.gradeComputedWas', { grade: header.computed_grade_code }) : null].filter(Boolean).join(' · ');
  const figures = (
    <Box>
      <SimpleGrid columns={{ base: 2, md: 5 }} spacing={3}>
        <HeaderStat icon={Md.MdStars} iconColor="yellow.500" label={translate('crm.c360.customerGrade')}
          action={editable ? (
            <Tooltip label={translate('crm.c360.setGrade')} hasArrow>
              <IconButton size="xs" variant="ghost" minW="1.25rem" h="1.25rem" icon={<Icon as={Md.MdEdit} boxSize="0.8rem" />} aria-label={translate('crm.c360.setGrade')}
                onClick={() => open('grade', { corporate_grade_id: header.assigned_grade_id, reason: header.assigned_grade_reason || '' })} />
            </Tooltip>
          ) : null}
          value={header.grade_code ? <HStack spacing={2}><Text as="span">{translate(header.grade_name || header.grade_code)}</Text><Pill tone="purple">{header.grade_code}</Pill></HStack> : null}
          sub={header.grade_assigned
            ? (
              <Tooltip hasArrow label={gradeNote} isDisabled={!gradeNote}>
                <Text as="span">{header.assigned_grade_by
                  ? translate('crm.c360.gradeSetBy', { who: header.assigned_grade_by, date: date(header.grade_since) })
                  : translate('crm.c360.gradeSetOn', { date: date(header.grade_since) })}</Text>
              </Tooltip>
            )
            : header.grade_since ? translate('crm.c360.sinceDate', { date: date(header.grade_since) }) : translate('crm.ui.notGradedYet')} />
        <HeaderStat icon={Md.MdAccountBalanceWallet} label={translate('crm.c360.totalSpend')} value={money(header.lifetime_spend)} sub={translate('crm.c360.lifetime')} />
        <HeaderStat icon={Md.MdShoppingCart} label={translate('crm.c360.totalOrders')} value={number(header.orders_total)}
          sub={isPerson ? translate('crm.c360.last12Months', { n: number(header.orders_12m) }) : translate('crm.c360.last24Months', { n: number(header.orders_24m) })} />
        <HeaderStat icon={Md.MdDevicesOther} iconColor="red.400" label={translate(isPerson ? 'crm.c360.totalProducts' : 'crm.c360.ownedProducts')}
          value={number(header.products_registered)} sub={translate('crm.c360.registered')} />
        <HeaderStat icon={Md.MdHeadsetMic} label={translate('crm.c360.openCases')} value={number(header.open_cases)}
          sub={translate('crm.c360.totalN', { n: number(header.total_cases) })} />
      </SimpleGrid>
      <Divider my={3} />
      <KeySegments view={facts} />
    </Box>
  );

  const editInitial = Object.assign({}, person, org, { display_name: party.display_name });

  return (
    <Box>
      {/* ---------------------------------------------------------- breadcrumb, search, title, actions */}
      <Flex align="center" justify="space-between" wrap="wrap" mb={3}>
        <Breadcrumb fontSize="sm" color={surface.muted} separator={<Icon as={Md.MdChevronRight} />} mb={{ base: 2, md: 0 }}>
          <BreadcrumbItem><BreadcrumbLink onClick={() => history.push(PAGE)}>{translate('crm.c360.customers')}</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbItem isCurrentPage={isPerson}><BreadcrumbLink onClick={() => goTab('overview')}>{translate('crm.c360.customer360')}</BreadcrumbLink></BreadcrumbItem>
          {isPerson ? null : <BreadcrumbItem isCurrentPage><Text as="span">{party.display_name}</Text></BreadcrumbItem>}
        </Breadcrumb>
        <CrmSearch />
      </Flex>

      <Flex align="center" justify="space-between" wrap="wrap" mb={4}>
        <HStack spacing={3} mb={{ base: 2, md: 0 }}>
          <IconButton size="sm" variant="outline" icon={<Icon as={Md.MdArrowBack} />} aria-label={translate('crm.customer.allCustomers')} onClick={() => history.push(PAGE)} />
          <Text fontSize="2xl" fontWeight="800">{translate('crm.c360.customer360')}</Text>
        </HStack>
        {editable ? (
          <HStack spacing={2} wrap="wrap">
            {isPerson ? (
              <Menu placement="bottom-end">
                <MenuButton as={Button} size="sm" variant="outline" leftIcon={<Icon as={Md.MdMergeType} />}>{translate('crm.c360.mergeLinkAccounts')}</MenuButton>
                <MenuList fontSize="sm">
                  <MenuItem icon={<Icon as={Md.MdMergeType} />} onClick={() => open('merge')}>{translate('crm.customer.mergeADuplicate')}</MenuItem>
                  <MenuItem icon={<Icon as={Md.MdLink} />} onClick={() => open('account')}>{translate('crm.c360.linkAccount')}</MenuItem>
                </MenuList>
              </Menu>
            ) : (
              <Button size="sm" variant="outline" leftIcon={<Icon as={Md.MdMergeType} />} onClick={() => open('merge')}>{translate('crm.c360.merge')}</Button>
            )}
            {isPerson
              ? <Button size="sm" variant="outline" leftIcon={<Icon as={Md.MdSend} />} onClick={() => open('message')}>{translate('crm.c360.sendMessage')}</Button>
              : (
                <>
                  <Button size="sm" variant="outline" onClick={() => open('case')}>{translate('crm.c360.newCase')}</Button>
                  <Button size="sm" variant="outline" onClick={() => open('campaign')}>{translate('crm.c360.newCampaign')}</Button>
                </>
              )}
            <ButtonGroup size="sm" isAttached variant="brand">
              <Button leftIcon={<Icon as={Md.MdEdit} />} onClick={() => open('profile', editInitial)}>
                {translate(isPerson ? 'crm.c360.editCustomer' : 'common.edit')}
              </Button>
              <Menu placement="bottom-end">
                <MenuButton as={IconButton} icon={<ChevronDownIcon />} aria-label={translate('crm.customer.moreActions')} borderLeftWidth="1px" borderColor="whiteAlpha.400" />
                <MenuList fontSize="sm">
                  <MenuItem icon={<Icon as={Md.MdContactPhone} />} onClick={() => open('contact', { contact_type: isPerson ? 'MOBILE' : 'PHONE' })}>{translate('crm.customer.addContact')}</MenuItem>
                  <MenuItem icon={<Icon as={Md.MdPeopleOutline} />} onClick={() => open('relationship')}>{translate('crm.c360.addRelationship')}</MenuItem>
                  {isPerson ? null : <MenuItem icon={<Icon as={Md.MdGroup} />} onClick={() => open('team')}>{translate('crm.c360.assignAccountTeam')}</MenuItem>}
                  <MenuItem icon={<Icon as={Md.MdForum} />} onClick={() => open('interaction', { direction: 'INBOUND', channel_code: 'PHONE', outcome_code: 'ANSWERED' })}>{translate('crm.c360.logInteraction')}</MenuItem>
                  <MenuItem icon={<Icon as={Md.MdStars} />} onClick={() => open('grade', { corporate_grade_id: header.assigned_grade_id, reason: header.assigned_grade_reason || '' })}>{translate('crm.c360.setGrade')}</MenuItem>
                  {header.grade_assigned ? (
                    <MenuItem icon={<Icon as={Md.MdRestore} />}
                      onClick={() => ask('crm.c360.clearGrade', 'crm.c360.clearGradeExplained', header.grade_code, () => crm.parties.assignGrade(party.party_pk, null), 'info')}>
                      {translate('crm.c360.clearGrade')}
                    </MenuItem>
                  ) : null}
                  {isPerson ? (
                    <MenuItem icon={<Icon as={Md.MdVerifiedUser} />}
                      onClick={() => run(() => crm.parties.setChecked(party.party_pk, !person.is_checked_manually))}>
                      {translate(person.is_checked_manually ? 'crm.customers.markUnchecked' : 'crm.customers.markChecked')}
                    </MenuItem>
                  ) : null}
                  <MenuDivider />
                  {party.party_status === 'ACTIVE' ? (
                    <MenuItem icon={<Icon as={Md.MdBlock} />}
                      onClick={() => ask('crm.customer.deactivate', 'crm.customer.statusExplained', partyIdLabel(party.party_pk), () => crm.parties.setStatus(party.party_pk, 'INACTIVE'))}>
                      {translate('crm.customer.deactivate')}
                    </MenuItem>
                  ) : (
                    <MenuItem icon={<Icon as={Md.MdRestore} />}
                      onClick={() => ask('crm.customer.reactivate', 'crm.customer.statusExplained', partyIdLabel(party.party_pk), () => crm.parties.setStatus(party.party_pk, 'ACTIVE'), 'restore')}>
                      {translate('crm.customer.reactivate')}
                    </MenuItem>
                  )}
                </MenuList>
              </Menu>
            </ButtonGroup>
            <Menu placement="bottom-end">
              <MenuButton as={IconButton} size="sm" variant="outline" icon={<Icon as={Md.MdMoreHoriz} />} aria-label={translate('crm.customer.moreActions')} />
              <MenuList fontSize="sm">
                <MenuItem icon={<Icon as={Md.MdContentCopy} />} onClick={copyNumber}>{translate('crm.c360.copyNumber')}</MenuItem>
                <MenuItem icon={<Icon as={Md.MdNote} />} onClick={() => goTab('notes')}>{translate('crm.c360.notesAndHistory')}</MenuItem>
                <MenuItem icon={<Icon as={Md.MdInsertChart} />} onClick={() => goTab('analytics')}>{translate('crm.c360.tabAnalytics')}</MenuItem>
              </MenuList>
            </Menu>
          </HStack>
        ) : null}
      </Flex>

      {/* ---------------------------------------------------------- the header card */}
      <Box borderWidth="1px" borderColor={surface.border} borderRadius="xl" bg={surface.card} p={5} mb={4}>
        <Grid templateColumns={{ base: '1fr', xl: 'minmax(0, 1fr) minmax(0, 1.25fr)' }} gridGap={6}>
          {identity}
          <Box borderLeftWidth={{ base: 0, xl: '1px' }} borderColor={surface.border} pl={{ base: 0, xl: 5 }}>{figures}</Box>
        </Grid>
        {merged ? (
          <Box mt={3} p={3} borderRadius="md" bg={mergedBg} fontSize="sm">
            {translate('crm.customer.mergedInto', { number: partyIdLabel(party.merged_into_party_pk) })}{' '}
            <Button size="xs" variant="link" onClick={() => history.push(PAGE + '/' + party.merged_into_party_pk)}>{translate('crm.customer.openIt')}</Button>
          </Box>
        ) : null}
      </Box>

      {/* ---------------------------------------------------------- the tabs */}
      <Tabs index={tabIndex} onChange={(index) => goTab(tabs[index][0])} isLazy variant="line" colorScheme="brand">
        <TabList overflowX="auto" overflowY="hidden" mb={4} borderColor={surface.border}>
          {tabs.map((tab) => <Tab key={tab[0]} fontSize="sm" whiteSpace="nowrap" fontWeight="600">{translate(tab[1])}</Tab>)}
        </TabList>
        <TabPanels>
          {tabs.map((tab) => (
            <TabPanel key={tab[0]} px={0} pt={0}>
              <TabBody tabKey={tab[0]} isPerson={isPerson} record={record} view={facts} act={act} goTab={goTab} model={model} />
            </TabPanel>
          ))}
        </TabPanels>
      </Tabs>

      {current ? (
        <FormModal
          isOpen={modal.isOpen}
          onClose={modal.onClose}
          title={current.title}
          fields={current.fields}
          initial={dialog.initial}
          onSubmit={current.submit}
          saving={saving}
        />
      ) : null}
    </Box>
  );
}

/** The tags under the name, and the menu that adds one. */
function TagsLine({ facts, unusedTags, editable, party, run }) {
  const translate = useT();
  const tags = facts.tags || [];
  if (!tags.length && !editable) return null;
  return (
    <Wrap spacing={2} mt={3} align="center">
      {tags.map((tag) => (
        <WrapItem key={tag.tag_id}>
          <TagChip tag={tag} onRemove={editable ? () => run(() => crm.customer360.removeTag(party.party_pk, tag.tag_id), 'crm.c360.tagRemoved') : null} />
        </WrapItem>
      ))}
      {editable && unusedTags.length ? (
        <WrapItem>
          <Menu>
            <MenuButton as={Button} size="xs" variant="outline" leftIcon={<Icon as={Md.MdAdd} />}>{translate('crm.c360.addTag')}</MenuButton>
            <MenuList fontSize="sm" maxH="16rem" overflowY="auto">
              {unusedTags.map((tag) => (
                <MenuItem key={tag.tag_id} onClick={() => run(() => crm.customer360.addTag(party.party_pk, tag.tag_id), 'crm.c360.tagAdded')}>
                  <TagChip tag={tag} />
                </MenuItem>
              ))}
            </MenuList>
          </Menu>
        </WrapItem>
      ) : null}
    </Wrap>
  );
}

/** One tab's content. The overview is laid out here; the other tabs live in c360Tabs. */
function TabBody({ tabKey, isPerson, record, view, act, goTab, model }) {
  const translate = useT();
  const props = { record: record, view: view, act: act };
  if (tabKey === 'overview') {
    return isPerson ? (
      <Stack spacing={4}>
        <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr', xl: '1fr 1fr 1fr' }} gridGap={4}>
          <AccountsCard view={view} onViewAll={() => goTab('accounts')} />
          <RecentOrdersCard view={view} onViewAll={() => goTab('orders')} />
          <ValueMetricsCard view={view} onViewAll={() => goTab('analytics')} />
        </Grid>
        <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr', xl: '1fr 1fr 1fr' }} gridGap={4}>
          <ContactPointsCard view={view} record={record} onManage={() => goTab('consent')} />
          <ProductsCard view={view} onViewAll={() => goTab('products')} />
          <ServiceSummaryCard view={view} onViewAll={() => goTab('service')} />
        </Grid>
        <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr', xl: '1.3fr 1fr 1fr' }} gridGap={4}>
          <InteractionsCard view={view} onViewAll={() => goTab('service')}
            onLog={act.editable ? () => act.open('interaction', { direction: 'INBOUND', channel_code: 'PHONE', outcome_code: 'ANSWERED' }) : null} />
          <MarketingCard view={view} onViewAll={() => goTab('campaigns')} />
          <Stack spacing={4}>
            <RelatedPartiesCard view={view} onViewAll={() => goTab('related')} />
            <NotesCard view={view} onViewAll={() => goTab('notes')} />
          </Stack>
        </Grid>
      </Stack>
    ) : (
      <Stack spacing={4}>
        <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr', xl: '1fr 1.25fr 1fr' }} gridGap={4}>
          <OrganizationInfoCard view={view} onEdit={act.editable ? () => goTab('organization') : null} />
          <Stack spacing={4}>
            <KeyMetricsCard view={view} onViewAll={() => goTab('analytics')} />
            <AccountsCard view={view} onViewAll={() => goTab('accounts')} title={translate('crm.c360.accountsAndProjects')}
              action={act.editable ? <Button size="xs" variant="outline" leftIcon={<Icon as={Md.MdAdd} />} onClick={() => act.open('account')}>{translate('crm.c360.linkAccount')}</Button> : null} />
          </Stack>
          <Stack spacing={4}>
            <RelationshipOwnershipCard view={view} onEdit={act.editable ? () => goTab('organization') : null} />
            <HierarchyCard view={view} onViewAll={() => goTab('related')} />
          </Stack>
        </Grid>
        <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr', xl: '1fr 1.25fr 1fr' }} gridGap={4}>
          <KeyContactsCard view={view} onViewAll={() => goTab('contacts')} onLink={act.editable ? () => act.open('person') : null} />
          <ProductsCard view={view} onViewAll={() => goTab('products')} title={translate('crm.c360.productsAndAssets')} />
          <ServiceSummaryCard view={view} onViewAll={() => goTab('service')} withRecentCases />
        </Grid>
        <RecentOrdersCard view={view} onViewAll={() => goTab('orders')} />
      </Stack>
    );
  }
  if (tabKey === 'organization') return <OrganizationTab {...props} />;
  if (tabKey === 'contacts') return <ContactsTab {...props} />;
  if (tabKey === 'accounts') return <AccountsTab {...props} />;
  if (tabKey === 'orders') return <OrdersTab {...props} />;
  if (tabKey === 'products') return <ProductsTab {...props} />;
  if (tabKey === 'service') return <ServiceTab {...props} />;
  if (tabKey === 'campaigns') return <CampaignsTab {...props} />;
  if (tabKey === 'analytics') return <AnalyticsTab {...props} model={model} />;
  if (tabKey === 'consent') return <ConsentTab {...props} />;
  if (tabKey === 'related') return <RelatedTab {...props} />;
  return <NotesFilesTab {...props} />;
}

/** Everything that happened to the customer, newest first, across projects. */
function timelineOf(record, translate) {
  const items = [];
  (record.transactions || []).forEach((transaction) => items.push({
    kind: transaction.transaction_type_code === 'REFUND' ? 'REFUND' : 'TRANSACTION', id: transaction.transaction_id, at: transaction.transaction_at,
    title: word(translate, transaction.transaction_type_code) + '  ·  ' + transaction.project_code,
    detail: money(transaction.net_amount, transaction.currency_code) + (transaction.points_used ? '  ·  ' + translate('crm.customer.pointsUsed', { n: amount(transaction.points_used, 0) }) : ''),
    link: '/admin/crm/transactions?txn=' + transaction.transaction_id
  }));
  (record.cases || []).forEach((serviceCase) => items.push({
    kind: 'CASE', id: serviceCase.case_id, at: serviceCase.received_at, title: translate(serviceCase.case_type_name || '-') + '  ·  ' + (serviceCase.external_case_id || ''),
    detail: [translate(serviceCase.status_name || '-'), serviceCase.service_center_name].filter(Boolean).join('  ·  '), link: '/admin/crm/service-cases?case=' + serviceCase.case_id
  }));
  (record.holdings || []).forEach((holding) => items.push({
    kind: 'REGISTRATION', id: holding.product_registration_id, at: holding.valid_from,
    title: (holding.product_name || '-') + '  ·  ' + word(translate, holding.relationship_code), detail: holding.external_product_instance_id,
    link: '/admin/crm/products?instance=' + holding.product_instance_id
  }));
  (record.activities || []).forEach((activity) => items.push({
    kind: 'VISIT', id: activity.service_center_activity_id, at: activity.occurred_at, title: translate(activity.activity_name || '-'), detail: activity.service_center_name
  }));
  (record.tier_history || []).forEach((tierChange) => items.push({
    kind: 'TIER', id: tierChange.membership_tier_history_id, at: tierChange.changed_at,
    title: tierChange.project_code + '  ·  ' + translate(tierChange.new_tier_name || '-'), detail: tierChange.change_reason
  }));
  (record.reservations || []).forEach((reservation) => items.push({
    kind: 'ENTRY', id: reservation.reservation_id, at: reservation.reserved_at, title: reservation.event_name, detail: reservation.reservation_code + '  ·  ' + word(translate, reservation.status)
  }));
  return items.filter((item) => item.at).sort((first, second) => new Date(second.at) - new Date(first.at)).slice(0, 30);
}

const GENDER = { M: 'Male', F: 'Female', OTHER: 'Other' };
const BANDS = ['1-10', '11-50', '51-200', '201-1000', '1001-5000', '5001+'];
const INTERACTION_CHANNELS = ['PHONE', 'EMAIL', 'CHAT', 'SMS', 'IN_PERSON', 'APP', 'WEB', 'LETTER'];
const INTERACTION_TYPES = ['GENERAL_INQUIRY', 'PRODUCT_SUPPORT', 'ORDER_INQUIRY', 'COMPLAINT', 'FEEDBACK', 'SALES', 'FOLLOW_UP'];
const OUTCOMES = ['ANSWERED', 'FOLLOW_UP', 'RESOLVED', 'CLOSED', 'NO_ANSWER'];
const CASE_CHANNELS = ['PHONE', 'WALK_IN', 'APP', 'WEB', 'MAIL_IN', 'COURIER', 'ON_SITE', 'AGENCY'];
const CAMPAIGN_TYPES = ['PROMOTION', 'RETENTION', 'WIN_BACK', 'PRODUCT_LAUNCH', 'SERVICE', 'EVENT_NOTICE', 'SURVEY'];
const MESSAGE_CHANNELS = ['EMAIL', 'SMS', 'PUSH', 'IN_APP'];

/** Every dialog the record can open, as FormModal configurations. */
function formsFor({ translate, record, party, isPerson, meta, dialog, run, sites, history, view }) {
  const projects = optionsFrom(meta.projects, 'project_id', 'project_name');
  return {
    profile: {
      title: translate(isPerson ? 'crm.customer.editProfile' : 'crm.c360.editOrganization'),
      fields: isPerson ? [
        { name: 'display_name', label: 'Name', required: true },
        { name: 'full_name', label: 'Full name' },
        { name: 'gender_code', label: 'Gender', type: 'select',
          options: [{ value: 'M', label: 'Male' }, { value: 'F', label: 'Female' }, { value: 'OTHER', label: 'Other' }, { value: 'UNKNOWN', label: 'Unknown' }] },
        { name: 'birth_date', label: 'Date of birth', type: 'date' },
        { name: 'job_title_id', label: 'Job title', type: 'select', isSearchable: true,
          options: optionsFrom((meta.job_titles || []).filter((job) => job.is_active || job.job_title_id === (record.person || {}).job_title_id),
            'job_title_id', 'job_name') },
        { name: 'home_location_pk', label: 'Location', type: 'select', options: optionsFrom(meta.areas, 'location_id', (area) => area.full_name || area.location_name), isSearchable: true },
        { name: 'address_line', label: 'Address', colSpan: 'full' }
      ] : [
        { name: 'display_name', label: 'Name', required: true },
        { name: 'legal_name', label: 'Legal name' },
        { name: 'local_name', label: 'Local name' },
        { name: 'trading_name', label: 'Trading name' },
        { name: 'registration_number', label: 'Registration number' },
        { name: 'employee_count_band', label: 'Company size', type: 'select', options: BANDS.map((band) => ({ value: band, label: band })) },
        { name: 'founded_date', label: 'Established', type: 'date' },
        { name: 'website_url', label: 'Website' },
        { name: 'location_pk', label: 'Location', type: 'select', options: optionsFrom(meta.areas, 'location_id', (area) => area.full_name || area.location_name), isSearchable: true },
        { name: 'headquarters_address', label: 'Address', colSpan: 'full' },
        { name: 'description', label: 'Business description', type: 'textarea', colSpan: 'full' }
      ],
      submit: (values) => run(() => crm.parties.update(party.party_pk, values))
    },
    contact: {
      title: translate('crm.customer.addContact'),
      fields: [
        { name: 'contact_type', label: 'Type', type: 'select', required: true, isClearable: false, options: choices(CONTACT_TYPES) },
        { name: 'contact_value', label: 'Contact', required: true },
        { name: 'label', label: 'Label' },
        { name: 'is_primary', label: 'Primary for this type', type: 'checkbox' },
        { name: 'is_verified', label: 'Verified', type: 'checkbox' }
      ],
      submit: (values) => run(() => crm.parties.addContact(party.party_pk, values), 'Created')
    },
    account: {
      title: translate('crm.customer.linkAccount'),
      fields: [
        { name: 'project_id', label: 'Project', type: 'select', required: true, options: projects },
        { name: 'external_account_id', label: 'Account PK in that project', required: true },
        { name: 'external_login', label: 'Account ID' }
      ],
      submit: (values) => run(() => crm.parties.linkAccount(party.party_pk, values), 'Created')
    },
    consent: {
      title: translate('crm.customer.changeConsent'),
      fields: [
        { name: 'consent_status', label: 'Consent', type: 'select', required: true, isClearable: false,
          options: choices(['GRANTED', 'DENIED', 'WITHDRAWN', 'NOT_REQUIRED']) },
        { name: 'contact_point_id', label: 'Send to', type: 'select',
          options: (record.contacts || []).filter((contact) => contact.status === 'ACTIVE')
            .map((contact) => ({ value: contact.contact_point_id, label: word(translate, contact.contact_type) + '  ' + contact.contact_value })) },
        { name: 'reason', label: 'Reason', type: 'textarea', required: true, colSpan: 'full',
          help: 'Say how the customer told you - a call, a letter, at a counter.' }
      ],
      submit: (values) => run(() => crm.parties.setConsent(party.party_pk, Object.assign({}, dialog.initial, values)))
    },
    merge: {
      title: translate('crm.customer.mergeIntoThis'),
      fields: [
        { name: 'merged_party_pk', label: 'The duplicate customer', type: 'custom', required: true, colSpan: 'full',
          render: (values, set) => <PartyPicker value={values.merged_party_pk} onChange={(value) => set('merged_party_pk', value)} /> },
        { name: 'merge_reason', label: 'Reason', type: 'textarea', colSpan: 'full',
          help: 'The duplicate keeps its number and points here; its products, cases and accounts move to this customer.' }
      ],
      submit: (values) => run(() => crm.parties.merge(party.party_pk, values.merged_party_pk, values.merge_reason), 'crm.customers.merged')
    },
    orgType: {
      title: translate('crm.customer.addOrganizationType'),
      fields: [
        { name: 'organization_type_id', label: 'Type', type: 'select', required: true, options: optionsFrom(meta.organization_types, 'organization_type_id', 'type_name') },
        { name: 'project_id', label: 'Only in project', type: 'select', options: projects, help: 'Left empty, the type holds across Dream.' }
      ],
      submit: (values) => run(() => crm.organizations.assignType(party.party_pk, values), 'Created')
    },
    industry: {
      title: translate('crm.customer.addIndustry'),
      fields: [
        { name: 'industry_id', label: 'Industry', type: 'select', required: true, options: optionsFrom(meta.industries, 'industry_id', 'industry_name') },
        { name: 'is_primary', label: 'Primary', type: 'checkbox' }
      ],
      submit: (values) => run(() => crm.organizations.setIndustry(party.party_pk, values))
    },
    person: {
      title: translate('crm.c360.linkContact'),
      fields: [
        { name: 'person_party_pk', label: 'Person', type: 'custom', required: true, colSpan: 'full',
          render: (values, set) => <PartyPicker value={values.person_party_pk} onChange={(value) => set('person_party_pk', value)} /> },
        { name: 'contact_role_ids', label: 'Roles', type: 'multiselect', options: optionsFrom(meta.contact_roles, 'contact_role_id', 'role_name') },
        { name: 'department_name', label: 'Their department' },
        { name: 'project_id', label: 'Only in project', type: 'select', options: projects }
      ],
      submit: (values) => run(() => crm.organizations.addPerson(party.party_pk, values), 'Created')
    },
    relationship: {
      title: translate('crm.c360.addRelationship'),
      fields: [
        { name: 'relationship_type_code', label: 'Relationship', type: 'select', required: true,
          options: (meta.party_relationship_types || [])
            .filter((type) => type.applies_to === 'ANY' || type.applies_to === (isPerson ? 'PERSON' : 'ORGANIZATION'))
            .map((type) => ({ value: type.relationship_type_code, label: type.relationship_name })),
          help: 'Read it as: the customer chosen below is their ... (spouse, parent company, affiliate).' },
        { name: 'related_party_pk', label: 'Related customer', type: 'custom', required: true, colSpan: 'full',
          render: (values, set) => <PartyPicker value={values.related_party_pk} onChange={(value) => set('related_party_pk', value)} /> },
        { name: 'valid_from', label: 'Since', type: 'date' },
        { name: 'note', label: 'Note', colSpan: 'full' }
      ],
      submit: (values) => run(() => crm.customer360.addRelationship(party.party_pk, values), 'Created')
    },
    grade: {
      title: translate('crm.c360.setGrade'),
      fields: [
        { name: 'corporate_grade_id', label: 'Corporate grade', type: 'select', required: true, isClearable: false, colSpan: 'full',
          options: (meta.corporate_grades || []).filter((grade) => grade.is_active !== false)
            .map((grade) => ({ value: grade.corporate_grade_id, label: grade.grade_code + '  ' + translate(grade.grade_name) })),
          help: translate('crm.c360.gradeSetExplained') },
        { name: 'reason', label: 'Reason', type: 'textarea', colSpan: 'full' }
      ],
      submit: (values) => run(() => crm.parties.assignGrade(party.party_pk, values.corporate_grade_id, values.reason))
    },
    interaction: {
      title: translate('crm.c360.logInteraction'),
      fields: [
        { name: 'direction', label: 'Direction', type: 'select', required: true, isClearable: false, options: choices(['INBOUND', 'OUTBOUND']) },
        { name: 'channel_code', label: 'Channel', type: 'select', required: true, isClearable: false, options: choices(INTERACTION_CHANNELS) },
        { name: 'interaction_type', label: 'Type', type: 'select', required: true, options: choices(INTERACTION_TYPES) },
        { name: 'outcome_code', label: 'Outcome', type: 'select', required: true, isClearable: false, options: choices(OUTCOMES) },
        { name: 'subject', label: 'Summary', required: true, colSpan: 'full' },
        { name: 'body', label: 'Details', type: 'textarea', colSpan: 'full' },
        { name: 'case_id', label: 'About service case', type: 'select',
          options: (record.cases || []).map((serviceCase) => ({ value: serviceCase.case_id, label: (serviceCase.external_case_id || '#' + serviceCase.case_id) + '  ' + (serviceCase.title || '') })) },
        { name: 'project_id', label: 'Project', type: 'select', options: projects },
        { name: 'duration_minutes', label: 'Duration in minutes', type: 'number' }
      ],
      submit: (values) => run(() => crm.customer360.logInteraction(party.party_pk, values), 'Created')
    },
    message: {
      title: translate('crm.c360.sendMessage'),
      fields: [
        { name: 'project_id', label: 'From project', type: 'select', required: true, options: projects },
        { name: 'channel_id', label: 'Channel', type: 'select', required: true,
          options: (meta.channels || []).filter((channel) => MESSAGE_CHANNELS.indexOf(channel.channel_code) !== -1)
            .map((channel) => ({ value: channel.channel_id, label: channel.channel_name })) },
        { name: 'purpose_id', label: 'What it is for', type: 'select', required: true,
          options: optionsFrom(meta.communication_purposes, 'purpose_id', 'purpose_name'),
          help: 'Marketing needs the customer to have opted in; a service notice does not.' },
        { name: 'subject', label: 'Subject', required: true, colSpan: 'full' },
        { name: 'body', label: 'Message', type: 'textarea', required: true, colSpan: 'full' }
      ],
      submit: (values) => run(() => crm.customer360.sendMessage(party.party_pk, values), 'crm.c360.messageQueued')
    },
    team: {
      title: translate('crm.c360.assignAccountTeam'),
      fields: [
        { name: 'team_role', label: 'Role', type: 'select', required: true, options: choices(['ACCOUNT_MANAGER', 'SALES_REP', 'SUPPORT_MANAGER']) },
        { name: 'manager_id', label: 'Staff member', type: 'select', required: true, isSearchable: true, options: optionsFrom(meta.staff, 'manager_id', 'name'),
          help: 'Whoever held the role before is kept in the history.' }
      ],
      submit: (values) => run(() => crm.customer360.assignTeam(party.party_pk, values))
    },
    agreement: {
      title: translate(dialog && dialog.initial && dialog.initial.agreement_id ? 'crm.c360.editAgreement' : 'crm.c360.addAgreement'),
      fields: [
        { name: 'agreement_type', label: 'Contract type', type: 'select', required: true,
          options: choices(['ENTERPRISE', 'RESELLER', 'DISTRIBUTION', 'SERVICE_LEVEL', 'PURCHASE', 'PARTNERSHIP']) },
        { name: 'agreement_no', label: 'Number' },
        { name: 'title', label: 'Title', colSpan: 'full' },
        { name: 'start_date', label: 'Start', type: 'date', required: true },
        { name: 'end_date', label: 'End', type: 'date' },
        { name: 'renewal_date', label: 'Next renewal', type: 'date' },
        { name: 'status', label: 'Status', type: 'select', required: true, isClearable: false, options: choices(['DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED']) },
        { name: 'annual_value', label: 'Annual value', type: 'number' },
        { name: 'note', label: 'Note', type: 'textarea', colSpan: 'full' }
      ],
      submit: (values) => run(() => (dialog.initial.agreement_id
        ? crm.customer360.updateAgreement(party.party_pk, dialog.initial.agreement_id, values)
        : crm.customer360.createAgreement(party.party_pk, values)))
    },
    case: {
      title: translate('crm.c360.newCase'),
      fields: [
        { name: 'case_type_id', label: 'Type', type: 'select', required: true, options: optionsFrom(meta.case_types, 'case_type_id', 'display_name') },
        { name: 'project_id', label: 'Project', type: 'select', required: true, options: projects },
        { name: 'service_priority_id', label: 'Priority', type: 'select', options: optionsFrom(meta.priorities, 'service_priority_id', 'priority_name') },
        { name: 'reception_channel_code', label: 'Received by', type: 'select', options: choices(CASE_CHANNELS) },
        { name: 'service_center_id', label: 'Service location', type: 'select', options: sites, isSearchable: true },
        { name: 'title', label: 'Subject', required: true, colSpan: 'full' },
        { name: 'description', label: 'Description', type: 'textarea', colSpan: 'full' }
      ],
      submit: (values) => run(() => crm.cases.create(Object.assign({ party_pk: party.party_pk }, values)), 'Created')
    },
    campaign: {
      title: translate('crm.c360.newCampaign'),
      fields: [
        { name: 'campaign_name', label: 'Name', required: true, colSpan: 'full' },
        { name: 'campaign_code', label: 'Code', required: true },
        { name: 'campaign_type', label: 'Type', type: 'select', required: true, options: choices(CAMPAIGN_TYPES) },
        { name: 'project_id', label: 'Project', type: 'select', options: projects },
        { name: 'with_contacts', label: 'Address it to this organization and its key contacts', type: 'checkbox', colSpan: 'full' }
      ],
      /* A draft campaign, its audience the organization and the people who act for it; approval and sending happen on the campaign. */
      submit: async (values) => {
        const created = await run(async () => {
          const { data: campaign } = await crm.campaigns.create({
            campaign_name: values.campaign_name, campaign_code: values.campaign_code, campaign_type: values.campaign_type, project_id: values.project_id
          });
          if (values.with_contacts) {
            const ids = [party.party_pk].concat((view.key_contacts || []).map((contact) => contact.person_party_pk));
            await crm.campaigns.addAudience(campaign.campaign_id, { audience_name: party.display_name, audience_type: 'MANUAL', party_pks: ids });
          }
          return campaign;
        }, 'Created');
        if (created && created.campaign_id) history.push('/admin/crm/campaigns/' + created.campaign_id);
        return !!created;
      }
    }
  };
}
