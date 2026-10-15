import React, { useEffect, useState } from 'react';
import { Alert, AlertIcon, Box, HStack, SimpleGrid, Spinner, Text } from '@chakra-ui/react';
import * as Md from 'react-icons/md';

import { crm } from '../../../../../api';
import { useT } from '../../../../../i18n';
import { dateTime, number } from '../../../../../utils/format';
import { MiniTable } from '../c360Cards';
import { Card360, MiniBars, Pill, Tile } from '../../../shared/ui360';

/**
 * WHAT THE PROJECTS' OWN SYSTEMS SAY ABOUT THE CUSTOMER.
 *
 * One request per customer page (/crm/parties/:id/project-summary): the
 * e-shop's orders, the Appstore's purchases and SMARTPHONE_OFFLINE's devices
 * and service records, for all of the customer's linked accounts. The header
 * figures, the Service summary and the Recent activity list are all worked
 * out from it - not from the CRM's tables.
 */
export function useProjectSummary(partyPk, version) {
  const [state, setState] = useState(null);
  useEffect(() => {
    if (!partyPk) return undefined;
    let live = true;
    setState(null);
    crm.parties.projectSummary(partyPk)
      .then(({ data }) => { if (live) setState(data || {}); })
      .catch((error) => { if (live) setState({ failed: [{ error: error.message }] }); });
    return () => { live = false; };
  }, [partyPk, version]);
  return state;
}

/* A unit as shown: a currency code as it is, the store's own purses and points as words. */
const PURSE_WORD = { POINT: 'crm.eshopOrders.points', COMPANY: 'crm.appstore.purseCOMPANY', IMMATERIAL: 'crm.appstore.purseIMMATERIAL' };
export function unitWord(translate, unit) {
  return PURSE_WORD[unit] ? translate(PURSE_WORD[unit]) : unit;
}

function amountText(value) {
  return (Number(value) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * Total spend, one figure per currency - "21,191.53 USD · 1,345 NTV" - and the
 * points and coins on the line below. Never added across units.
 */
export function spendLines(translate, summary) {
  const spend = (summary && summary.spend) || {};
  const per = (bucket) => Object.keys(bucket || {}).map((unit) => amountText(bucket[unit]) + ' ' + unitWord(translate, unit));
  const currencies = per(spend.currencies);
  const other = per(spend.other);
  return { value: currencies.length ? currencies.join('  ·  ') : '0', sub: other.length ? other.join('  ·  ') : translate('crm.customer360.lifetime') };
}

/** The API events as Recent activity entries, newest first. */
export function activityItems(translate, summary) {
  return ((summary && summary.activity) || []).map((item) => {
    if (item.kind === 'TRANSACTION') {
      return { kind: item.kind, id: item.id, at: item.at,
        title: translate('crm.projectSummary.eshopOrder', { number: item.title || '' }),
        detail: [translate('crm.eshopOrders.status' + item.status), (item.tenders || []).map((tender) => amountText(tender.price) + ' ' + unitWord(translate, tender.unit)).join(' + '), item.account].filter(Boolean).join('  ·  ') };
    }
    if (item.kind === 'PURCHASE') {
      return { kind: item.kind, id: item.id, at: item.at,
        title: translate('crm.projectSummary.appstorePurchase', { name: item.title || translate('crm.appstore.kind' + (item.purchase_kind || 'APP')) }),
        detail: [amountText(item.price) + ' ' + unitWord(translate, item.unit), item.account].filter(Boolean).join('  ·  ') };
    }
    if (item.kind === 'REGISTRATION') {
      return { kind: item.kind, id: item.id, at: item.at,
        title: translate('crm.projectSummary.deviceRegistered', { device: item.title || '' }),
        detail: [item.color, item.imei ? 'IMEI ' + item.imei : null, item.account].filter(Boolean).join('  ·  ') };
    }
    return { kind: 'CASE', id: item.id, at: item.at,
      title: translate('crm.projectSummary.serviceVisit', { reason: item.title || '' }) + (item.open ? '  ·  ' + translate('crm.projectSummary.open') : ''),
      detail: [item.model, item.agent, item.reason, item.account].filter(Boolean).join('  ·  ') };
  });
}

/**
 * THE SERVICE SUMMARY, from SMARTPHONE_OFFLINE's service records: how many
 * visits and how many still open (the system has not updated them yet), the
 * points they earned, the last visit, how many agencies, and the reasons
 * customers come for most. With `withRecent`, the latest visits under it.
 */
export function ServiceSummaryCard({ summary, onViewAll, withRecent }) {
  const translate = useT();
  const services = (summary && summary.services) || null;
  const monthly = (services && services.monthly) || [];
  return (
    <Card360 icon={Md.MdHeadsetMic} title={translate('crm.customer360Cards.serviceSummary')} onViewAll={onViewAll}>
      {summary === null ? <HStack justify="center" py={4}><Spinner size="sm" /></HStack> : (
        <Box>
          {(summary.failed || []).length && !services ? <Alert status="error" fontSize="sm" mb={2} borderRadius="md"><AlertIcon />{translate('crm.smartphoneDevices.unreachable')}</Alert> : null}
          <SimpleGrid columns={3} spacing={2}>
            <Tile label={translate('crm.projectSummary.serviceVisits')} value={number(services ? services.total : 0)}
              chart={<MiniBars values={monthly.map((month) => month.visits)} color="brand.300" />} />
            <Tile label={translate('crm.customer360.openCases')} value={number(services ? services.open : 0)} tone={services && services.open ? 'red' : null} />
            <Tile label={translate('crm.projectSummary.pointsEarned')} value={number(services ? services.points : 0)} tone="green" />
            <Tile label={translate('crm.projectSummary.lastVisit')} value={services && services.last_at ? dateTime(services.last_at) : null} />
            <Tile label={translate('crm.projectSummary.agencies')} value={number(services ? services.agents : 0)} />
            <Tile label={translate('crm.projectSummary.topReason')} value={services && services.reasons && services.reasons.length ? services.reasons[0].name : null} />
          </SimpleGrid>
          {withRecent ? (
            <Box mt={3}>
              <Text fontSize="sm" fontWeight="700" mb={1}>{translate('crm.projectSummary.recentVisits')}</Text>
              <MiniTable
                rows={(services && services.recent) || []}
                rowKey={(row) => row.id}
                empty="crm.smartphoneServices.noServices"
                columns={[
                  { key: 'at', label: 'Date', render: (row) => dateTime(row.at) },
                  { key: 'account', label: 'Account ID' },
                  { key: 'title', label: 'Service Type', maxW: '10rem', render: (row) => <Text as="span" noOfLines={1}>{row.title || '-'}</Text> },
                  { key: 'open', label: 'Status', render: (row) => <Pill tone={row.open ? 'orange' : 'green'}>{translate(row.open ? 'crm.projectSummary.open' : 'crm.projectSummary.done')}</Pill> }
                ]}
              />
            </Box>
          ) : null}
        </Box>
      )}
    </Card360>
  );
}
