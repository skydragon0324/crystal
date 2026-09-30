import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { Box, Button, Icon, Text, Tooltip } from '@chakra-ui/react';
import { MdError, MdVerifiedUser, MdWarning } from 'react-icons/md';

import { loadCertificates, selectCertificates } from '../app/certificatesSlice';
import { useT } from '../i18n';
import { dateMinute } from '../utils/format';
import {
  CERTIFICATES_ANCHOR, STATUS_SCHEME, activeCertificate, certificatesAsOf, thresholdsIn
} from '../utils/certificates';

const ICONS = { ok: MdVerifiedUser, warning: MdWarning, critical: MdWarning, expired: MdError };

/* What to do about it, by status - the second half of the tooltip. */
const ADVICE = {
  ok: 'layout.certificate.adviceOk',
  warning: 'layout.certificate.adviceWarning',
  critical: 'layout.certificate.adviceCritical',
  expired: 'layout.certificate.adviceExpired'
};

/*
 * How loud, by status. Green and quiet while there is nothing to do, an amber
 * outline once the startup log has started warning, and a solid red block in
 * the last week and after - the one state in which the header should look
 * wrong, because something is.
 */
const VARIANT = { ok: 'ghost', warning: 'outline', critical: 'solid', expired: 'solid' };

/**
 * THE ACTIVE SIGNING CERTIFICATE'S DAYS LEFT, in the header, on every screen.
 *
 * Only the ACTIVE certificate. A previous key's certificate running out
 * changes nothing - what it signed keeps verifying - and a member CA is one
 * line of the dashboard card; this is the number that stops the API starting
 * when it reaches zero, and nothing else competes with it for the space.
 *
 * ASKED ONCE A SESSION. The report sits in the store (certificatesSlice) and
 * this dispatches a load that does nothing once one has been made, so moving
 * between screens re-renders the number - recounted against the time held,
 * see utils/certificates.js - without another request. The dashboard card
 * refreshes it.
 *
 * NOTHING AT ALL WHEN THERE IS NOTHING TO SAY. Before the first answer, when
 * the API cannot be reached, and for a role that cannot read the dashboard,
 * this renders null: a grey "?" on every screen is noise to the people who
 * were never meant to see it, and a spinner in a header that never stops is
 * worse.
 *
 * On a narrow screen the words go and the icon stays, still in its colour -
 * the colour is the message.
 */
export default function CertificateExpiry() {
  const t = useT();
  const dispatch = useDispatch();
  const history = useHistory();
  const { report, receivedAt } = useSelector(selectCertificates);

  useEffect(() => {
    dispatch(loadCertificates());
  }, [dispatch]);

  const active = activeCertificate(certificatesAsOf(report, receivedAt, Date.now()));
  if (!active || !active.status) return null;

  const status = active.status;
  const expired = status === 'expired';
  const when = dateMinute(active.notAfter);

  const heading = t('layout.certificate.heading', { keyId: active.keyId });
  const validity = expired
    ? t('layout.certificate.expiredOn', { date: when })
    : t('layout.certificate.validUntil', { date: when, days: active.daysLeft });
  const advice = t(ADVICE[status], { warningDays: thresholdsIn(report).warningDays });

  const open = () => history.push({ pathname: '/admin/dashboard', hash: '#' + CERTIFICATES_ANCHOR });

  return (
    <Tooltip
      hasArrow
      openDelay={300}
      placement="bottom-end"
      label={(
        <Box py="0.125rem" maxW="18rem">
          <Text fontWeight="600">{heading}</Text>
          <Text>{validity}</Text>
          <Text mt="0.375rem">{advice}</Text>
          <Text mt="0.375rem" opacity={0.8}>{t('layout.certificate.openDetails')}</Text>
        </Box>
      )}
    >
      <Button
        size="sm"
        h="1.875rem"
        px="0.5rem"
        minW="0"
        variant={VARIANT[status]}
        colorScheme={STATUS_SCHEME[status]}
        fontSize="xs"
        fontWeight="600"
        aria-label={heading + '. ' + validity}
        data-status={status}
        data-scheme={STATUS_SCHEME[status]}
        data-key-id={active.keyId}
        onClick={open}
      >
        <Icon as={ICONS[status]} w="1rem" h="1rem" />
        <Box
          as="span"
          ms="0.3125rem"
          display={{ base: 'none', md: 'inline' }}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {expired
            ? t('layout.certificate.expiredShort')
            : t('layout.certificate.daysShort', { days: active.daysLeft })}
        </Box>
      </Button>
    </Tooltip>
  );
}
