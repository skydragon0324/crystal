import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Stack,
  Text,
  Textarea,
  Tooltip,
  useDisclosure,
  useToast
} from '@chakra-ui/react';
import { FiDownload, FiEye, FiRefreshCw } from 'react-icons/fi';

import StorefrontList from './StorefrontList';
import { DataTable, EmptyState, Loading, StatusBadge } from '@/components/common';
import api from '@/api';
import { useApi, useList } from '@/hooks/useApi';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';
import { number } from '@/utils/format';

/**
 * THE EPRODUCT SITE: a registration log, and three keygen logs.
 *
 * A third outside system alongside the Eshop and the Appstore, and the one
 * that keys its records by the member's LOGIN rather than by a pk of its own.
 *
 * THE REGISTRATION LOG IS THE ONLY ONE THERE IS NOW. Crystal used to keep its
 * own at /account/products, against its own warranty and points rules, and a
 * member could have rows in one and not the other with nothing to say which
 * was right. That page is gone; this is the record.
 *
 * THE THREE KEYGEN LOGS are one page shape twice and a different one once.
 * Karaoke and Manbang license a MACHINE KEY and record whether the attempt
 * succeeded; B-media licenses a DEVICE against a broadcaster and splits what
 * was paid from what came back. The first two share this file's table; the
 * third has its own, because bending it into the same columns would mean
 * three empty cells and two missing facts.
 *
 * The column order on all four is the vendor's, as on the Eshop and Appstore
 * pages - see the note there.
 *
 * ------------------------------------------------------------------
 *
 * EVERY FIGURE ON THESE PAGES IS A POINT FIGURE, AND POINTS ARE FRACTIONAL.
 *
 * The service answers 211.56 and 0.4, and every one of these columns used to
 * run it through `Number(x).toLocaleString()` - which follows the BROWSER's
 * locale rather than the reader's chosen language, and which a reader whose
 * browser is set to a currency-ish locale sees rounded. `number` from
 * utils/format is the site's one answer: thousands grouped with a space, at
 * most three decimals, trailing zeros trimmed. 0.4 stays 0.4.
 */

/** Who did the keying: the member, or an agency acting for them. */
const ACTOR = {
  MEMBER: 'account.storefront.eproduct.actorMember',
  AGENCY: 'account.storefront.eproduct.actorAgency'
};

/**
 * THE STATES, IN WORDS THE READER'S LANGUAGE HAS.
 *
 * StatusBadge prints its `value` lower-cased when it is given no children, so
 * every one of these used to render the raw code - "approved", "issued" - in
 * English on a Chinese page. The badge still takes the code (it picks the
 * colour from it); the WORDS come through t().
 */
const REGISTER_STATE = {
  PENDING: 'account.storefront.eproduct.statusPending',
  APPROVED: 'account.storefront.eproduct.statusApproved',
  REJECTED: 'account.storefront.eproduct.statusRejected'
};

const OUTCOME = {
  ISSUED: 'account.storefront.eproduct.outcomeIssued',
  FAILED: 'account.storefront.eproduct.outcomeFailed'
};

/**
 * WHERE A FAULT REPORT GOT TO - the vendor's EPROD_FEEDBACK_STATES, whose
 * whole job is to be the label on the button.
 *
 * NONE means "no report has been made", so the button invites one. The other
 * three are the answer the service gave, and PENDING is the one case where the
 * button is shown and does nothing: a second report on a licence somebody is
 * already looking at is noise for them and a false expectation for the member.
 * The vendor returns early on exactly that state; here it says why instead.
 */
const REPORT_STATE = {
  NONE: { label: 'account.storefront.eproduct.reportFault', scheme: 'pink' },
  PENDING: { label: 'account.storefront.eproduct.reportPending', scheme: 'blue' },
  ACCEPT: { label: 'account.storefront.eproduct.reportAccepted', scheme: 'green' },
  REJECT: { label: 'account.storefront.eproduct.reportRejected', scheme: 'red' }
};

/**
 * THE SYSTEM IS A STRING EVERYWHERE ELSE IN THIS FILE - it is what the row
 * actions pass to the API - but the two LIST calls predate that and are named
 * per system, so the string is resolved to one here rather than a third
 * endpoint being invented to take it as a parameter.
 */
const KEYGEN_LIST = {
  karaoke: (params) => api.account.karaokeKeygen(params),
  manbang: (params) => api.account.manbangKeygen(params)
};

/** The row's place in the whole list; every one of these tables leads with it. */
function numberColumn(surface) {
  return {
    key: 'no',
    label: 'account.storefront.eproduct.no',
    align: 'center',
    width: '56px',
    /* `rowNumber`, not `number` - the formatter of that name is imported here. */
    render: (row, rowNumber) => <Text fontSize="sm" color={surface.muted}>{rowNumber}</Text>
  };
}

/** The same column on all three keygen logs. */
function actorColumn(t, surface) {
  return {
    key: 'actor',
    label: 'account.storefront.eproduct.doneBy',
    render: (row) => (
      <Text fontSize="sm" color={surface.muted}>
        {ACTOR[row.actor] ? t(ACTOR[row.actor]) : '—'}
      </Text>
    )
  };
}

/** Points paid, on all three keygen logs, in the site's one number format. */
function paidColumn(surface) {
  return {
    key: 'price',
    label: 'account.storefront.eproduct.pointsPaid',
    align: 'right',
    render: (row) => (
      <Text fontWeight="700" color={surface.text}>{number(row.price)}</Text>
    )
  };
}

/**
 * THE SERVICE'S ERROR, SAID OUT LOUD.
 *
 * The eproduct site answers these three endpoints with a code that is TRUTHY
 * FOR FAILURE and a `message` explaining it. Both were being dropped on the
 * way through - the reply became an empty list - so a member whose keying had
 * been refused was shown "No Karaoke licences yet", which is a different and
 * untrue statement. The API now carries the service's words in
 * `summary.error`; this is the half that says them.
 *
 * A TOAST rather than the in-page notice `unavailable` gets, and the two are
 * different situations: `unavailable` means we could not reach the service at
 * all and retrying is the move, so it is a standing panel with a Try again on
 * it. This is the service ANSWERING and refusing, which is news - it arrives,
 * it is read, it goes.
 *
 * Keyed on the message, so a reload that fails the same way twice does not
 * stack two identical toasts; a DIFFERENT error still gets said. The id makes
 * a second one replace the first rather than queue behind it.
 */
function useServiceError(list, toast) {
  const summary = list.meta && list.meta.summary;
  const error = (summary && summary.error) || null;

  useEffect(() => {
    if (!error) return;
    toast({
      id: 'eproduct-keygen-error',
      status: 'error',
      description: error,
      duration: 9000,
      isClosable: true
    });
  }, [error, toast]);
}

/**
 * SAVING A LICENCE FILE, IN PLACE - no tab, no window, no navigation.
 *
 * This used to open a blank tab before the request and point it at the
 * eproduct site's download script afterwards. That was the only way to keep a
 * popup blocker from stopping a window opened after an await - but the window
 * was never wanted: it is a file, and a tab that flashes open (or stays open,
 * blank, when the download script answers with an attachment) is noise at
 * best and a stray tab on the eproduct site at worst.
 *
 * So the bytes come through Crystal's own API instead, on the member's
 * authenticated request (the API fetches them from the eproduct site server
 * to server), and are saved through an object URL on an anchor with
 * `download`. A click on an anchor is not a popup, so there is no gesture to
 * preserve across the await, and nothing to block.
 *
 * `pending` is the row being fetched, so its button can spin: a licence from
 * a slow service otherwise looks like a button that did nothing.
 */
function useLicenceDownload(system, toast) {
  const [pending, setPending] = useState(null);

  const download = async (row) => {
    if (pending) return;
    setPending(row.id);

    try {
      const { data } = await api.account.keygenLicenseFile(system, row.id);
      saveFile(data, licenceFilename(row));
    } catch (err) {
      toast({ status: 'error', description: err.message, duration: 7000, isClosable: true });
    } finally {
      setPending(null);
    }
  };

  return { download: download, pending: pending };
}

/**
 * The name the file is saved under - the basename of the path the row
 * carries, which is the same name the API sends in its Content-Disposition
 * (the header itself is not readable from another origin without exposing it).
 */
function licenceFilename(row) {
  const base = String(row.license_file || '').split(/[\\/]/).pop();
  return base || 'licence-' + row.id + '.lic';
}

/**
 * Bytes to a file on disk, through a temporary object URL.
 *
 * REVOKED ON THE NEXT TICK, NOT IMMEDIATELY. The click starts the download
 * asynchronously; revoking in the same task can cancel it in some browsers,
 * and leaving it unrevoked keeps the licence in memory for the life of the
 * page.
 */
function saveFile(bytes, filename) {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: 'application/octet-stream' });
  const url = window.URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
}

/* ------------------------------------------------------------------ */

/**
 * What the member has registered on the eproduct site.
 *
 * THE THREE SUMMARY CARDS ARE GONE - points held, points spent, devices
 * registered. They sat above the log and were the first thing on the page, and
 * none of the three was a number this page could support: the balance is one
 * of six that do not add up and belongs on the points page with the other
 * five; "devices registered" is the length of the list directly underneath it,
 * printed twice; and "points spent" is not reconcilable against anything on
 * screen. Removing them takes the whole of the eproduct balance call with
 * them, which is one fewer request on arrival.
 */
export function EprodRegistrations() {
  const t = useT();
  const surface = useSurface();

  const list = useList((params) => api.account.eprodRegistrations(params), {
    initialParams: { page: 1, limit: 12 }
  });

  const columns = [
    numberColumn(surface),
    {
      key: 'serial_number',
      label: 'account.storefront.eproduct.serial',
      render: (row) => (
        <Text fontSize="sm" fontFamily="mono" color={surface.text}>{row.serial_number}</Text>
      )
    },
    {
      key: 'product_name',
      label: 'account.storefront.eproduct.product',
      width: '200px',
      render: (row) => (
        <Text fontWeight="600" color={surface.text}>{row.product_name}</Text>
      )
    },
    {
      key: 'contact',
      label: 'account.storefront.eproduct.contact',
      render: (row) => (
        <Text fontSize="sm" color={surface.muted}>{row.contact || '—'}</Text>
      )
    },
    {
      /* The address the member typed into the eproduct site. Their words. */
      key: 'address',
      label: 'account.storefront.eproduct.address',
      width: '240px',
      render: (row) => (
        <Text fontSize="sm" color={surface.muted} noOfLines={2} maxW="320px">
          {row.address || '—'}
        </Text>
      )
    },
    {
      key: 'points',
      label: 'account.storefront.eproduct.pointsEarned',
      align: 'right',
      render: (row) => (
        <Text fontWeight="700" color={row.points > 0 ? 'green.500' : surface.muted}>
          {row.points > 0 ? '+' : ''}{number(row.points)}
        </Text>
      )
    },
    {
      key: 'status',
      label: 'account.storefront.eproduct.status',
      render: (row) => (
        <StatusBadge value={row.status}>
          {REGISTER_STATE[row.status] ? t(REGISTER_STATE[row.status]) : null}
        </StatusBadge>
      )
    },
    { key: 'at', label: 'account.storefront.eproduct.registered', render: (row) => row.at }
  ];

  return (
    <StorefrontList
      list={list}
      columns={columns}
      store={t('account.storefront.eproduct.eproduct')}
      emptyTitle={t('account.storefront.eproduct.nothingRegisteredYet')}
      emptyHint={t('account.storefront.eproduct.devicesYouRegisterOnThe')}
    />
  );
}

/* ------------------------------------------------------------------ */

/**
 * A Karaoke or Manbang keygen log.
 *
 * ONE COMPONENT FOR TWO SYSTEMS, because upstream they are two paths with an
 * identical row shape. The vendor had two files that were the same file, and
 * they had already begun to differ.
 *
 * THE OUTCOME IS A BADGE, NOT A MESSAGE COLOUR. The vendor put the service's
 * `message` in a red tag whenever `resultlog` was non-zero and a blue one
 * otherwise - which meant a successfully issued licence appeared in a
 * coloured tag reading "Issued", indistinguishable at a glance from a fault.
 * The outcome and the words the service chose are two things, so they are two
 * columns.
 *
 * THREE ROW ACTIONS, which is the vendor's set:
 *
 *   DOWNLOAD   on a row that produced a licence file.
 *   RETRY      on a row that did not. It is the same two states: the vendor
 *              shows one or the other, never both, because a row either has a
 *              licence to fetch or a keying to attempt again.
 *   REPORT     wherever the service gave the transaction a number, labelled
 *              with how far the report has got.
 *
 * The vendor's Retry is a button with NO onClick - a control that looks live
 * and does nothing. It calls a real endpoint here (requested alongside this
 * change) and reloads the page it changed; a button that cannot work would be
 * worse than no button.
 */
function KeygenLog({ system, empty }) {
  const t = useT();
  const surface = useSurface();
  const toast = useToast();

  const list = useList((params) => KEYGEN_LIST[system](params), {
    initialParams: { page: 1, limit: 15 }
  });

  useServiceError(list, toast);

  const licence = useLicenceDownload(system, toast);

  const report = useDisclosure();
  const [reporting, setReporting] = useState(null);
  const [busy, setBusy] = useState(null);

  const retry = async (row) => {
    setBusy(row.id);
    try {
      await api.account.retryKeygen(system, row.id);
      toast({
        status: 'success',
        description: t('account.storefront.eproduct.theKeyingWasAttemptedAgain'),
        duration: 6000
      });
      list.reload();
    } catch (err) {
      toast({ status: 'error', description: err.message, duration: 7000, isClosable: true });
    } finally {
      setBusy(null);
    }
  };

  const openReport = (row) => {
    /*
     * A report already with the service is not a second report. The vendor
     * returns early and the member is left wondering whether the click
     * registered; this says what the state means.
     */
    if (row.error_status === 'PENDING') {
      toast({
        status: 'info',
        description: t('account.storefront.eproduct.aReportOnThisLicence'),
        duration: 6000
      });
      return;
    }

    setReporting(row);
    report.onOpen();
  };

  const columns = [
    numberColumn(surface),
    {
      key: 'machine_key',
      label: 'account.storefront.eproduct.machineKey',
      render: (row) => (
        <Text fontSize="sm" fontFamily="mono" color={surface.text}>{row.machine_key}</Text>
      )
    },
    {
      key: 'reference',
      label: 'account.storefront.eproduct.reference',
      render: (row) => (
        <Text fontSize="xs" fontFamily="mono" color={surface.muted}>{row.id || '—'}</Text>
      )
    },
    paidColumn(surface),
    {
      key: 'succeeded',
      label: 'account.storefront.eproduct.outcome',
      render: (row) => (
        <Box>
          <StatusBadge value={row.succeeded ? 'ISSUED' : 'FAILED'}>
            {t(row.succeeded ? OUTCOME.ISSUED : OUTCOME.FAILED)}
          </StatusBadge>
          {/*
            * The service's own words, and only where they add something. On a
            * success the message IS the outcome ("Issued") and the badge has
            * already said it; on a failure it is the only explanation there is.
            * Untranslated on purpose - it is written by the eproduct service,
            * not by this site.
            */}
          {!!row.message && !row.succeeded && (
            <Text fontSize="xs" color={surface.muted} mt="1" noOfLines={2}>{row.message}</Text>
          )}
        </Box>
      )
    },
    actorColumn(t, surface),
    { key: 'at', label: 'account.storefront.eproduct.issued', render: (row) => row.at },
    {
      key: 'actions',
      label: 'account.storefront.eproduct.actions',
      align: 'right',
      width: '190px',
      render: (row) => {
        const state = REPORT_STATE[row.error_status] || null;

        return (
          <Flex align="center" justify="flex-end" gap="2" data-gap="8">
            {row.license_file ? (
              <Tooltip label={t('account.storefront.eproduct.download')} hasArrow placement="top">
                <IconButton
                  aria-label={t('account.storefront.eproduct.download')}
                  icon={<FiDownload />}
                  size="sm"
                  variant="quiet"
                  isLoading={licence.pending === row.id}
                  onClick={() => licence.download(row)}
                />
              </Tooltip>
            ) : (
              <Button
                size="xs"
                variant="quiet"
                leftIcon={<FiRefreshCw />}
                isLoading={busy === row.id}
                onClick={() => retry(row)}
              >
                {t('account.storefront.eproduct.retry')}
              </Button>
            )}

            {/*
              * Only where the service gave the transaction a number - that is
              * what a report is filed against, and the vendor gates on the
              * same field.
              */}
            {!!row.reference && !!state && (
              <Button
                size="xs"
                variant="ghost"
                colorScheme={state.scheme}
                onClick={() => openReport(row)}
              >
                {t(state.label)}
              </Button>
            )}
          </Flex>
        );
      }
    }
  ];

  return (
    <Box>
      <StorefrontList
        list={list}
        columns={columns}
        store={t('account.storefront.eproduct.eproduct')}
        emptyTitle={t(empty)}
        emptyHint={t('account.storefront.eproduct.licencesKeyedForYourDevices')}
      />

      <ErrorReportModal
        system={system}
        row={reporting}
        isOpen={report.isOpen}
        onClose={report.onClose}
        onSent={() => {
          report.onClose();
          list.reload();
        }}
      />
    </Box>
  );
}

export function KaraokeKeygen() {
  return <KeygenLog system="karaoke" empty="account.storefront.eproduct.noKaraokeLicencesYet" />;
}

export function ManbangKeygen() {
  return <KeygenLog system="manbang" empty="account.storefront.eproduct.noManbangLicencesYet" />;
}

/* ------------------------------------------------------------------ */

/**
 * REPORTING A LICENCE THAT WENT WRONG - the vendor's
 * EditEprodErrorReportModal, without formik and yup for two fields.
 *
 * Both are required and the button is what says so, rather than an error
 * appearing under a field the member has not reached yet. The phone number is
 * asked for because the service answers a report by RINGING: it is not on the
 * licence row and the profile's may be out of date, so it is typed each time.
 */
function ErrorReportModal({ system, row, isOpen, onClose, onSent }) {
  const t = useT();
  const surface = useSurface();
  const toast = useToast();

  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  /* A fresh form per licence - a report left half-typed on one row is not the
     opening of the next. */
  useEffect(() => {
    if (!isOpen) return;
    setPhone('');
    setMessage('');
  }, [isOpen, row]);

  const ready = phone.trim() && message.trim();

  const send = async () => {
    if (!ready || !row) return;

    setBusy(true);
    try {
      await api.account.reportKeygenError(system, row.id, {
        phone: phone.trim(),
        report: message.trim()
      });
      toast({
        status: 'success',
        description: t('account.storefront.eproduct.yourReportIsWithThe'),
        duration: 6000
      });
      onSent();
    } catch (err) {
      toast({ status: 'error', description: err.message, duration: 7000, isClosable: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="lg">
      <ModalOverlay />
      <ModalContent mx="4">
        <ModalHeader>{t('account.storefront.eproduct.reportALicenceFault')}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Stack spacing="4">
            {/* Which licence this is about, so the member can see they picked
                the right row before they describe anything. */}
            {!!row && (
              <Text fontSize="sm" fontFamily="mono" color={surface.muted}>
                {row.machine_key}
                {row.reference ? ` · ${row.id}` : ''}
              </Text>
            )}

            <FormControl isRequired>
              <FormLabel fontSize="sm" fontWeight="600">{t('common.phoneNumber')}</FormLabel>
              <Input
                value={phone}
                /*
                 * React 16 pools synthetic events: the value is read here,
                 * while the event is still alive, rather than inside an
                 * updater that runs after it has been recycled.
                 */
                onChange={(event) => {
                  const next = event.target.value;
                  setPhone(next);
                }}
                placeholder={t('account.storefront.eproduct.howTheServiceCanReach')}
              />
            </FormControl>

            <FormControl isRequired>
              <FormLabel fontSize="sm" fontWeight="600">
                {t('account.storefront.eproduct.whatWentWrong')}
              </FormLabel>
              <Textarea
                rows={5}
                value={message}
                onChange={(event) => {
                  const next = event.target.value;
                  setMessage(next);
                }}
                placeholder={t('account.storefront.eproduct.describeWhatHappenedWhenThe')}
              />
            </FormControl>
          </Stack>
        </ModalBody>
        <ModalFooter gap="3" data-gap="12">
          <Button variant="quiet" onClick={onClose} isDisabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="brand" isLoading={busy} isDisabled={!ready} onClick={send}>
            {t('account.storefront.eproduct.sendReport')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The B-media keygen log, which is its own shape.
 *
 * It licenses a DEVICE against a broadcaster rather than a machine key, and
 * it splits what was paid from what came back. Two figures, because they are
 * two facts: a member who paid 150 and got 21 back has not paid 129.
 *
 * TWO ROW ACTIONS, the vendor's: the licence file, and what the licence
 * covers. There is no retry and no fault report on this one - the vendor
 * offers neither, because a media licence is issued against a list of titles
 * rather than against a machine, and the thing to look at when it is wrong is
 * that list.
 */
export function BmediaKeygen() {
  const t = useT();
  const surface = useSurface();
  const toast = useToast();

  const list = useList((params) => api.account.bmediaKeygen(params), {
    initialParams: { page: 1, limit: 15 }
  });

  useServiceError(list, toast);

  const licence = useLicenceDownload('bmedia', toast);

  const detail = useDisclosure();
  const [showing, setShowing] = useState(null);

  const columns = [
    numberColumn(surface),
    {
      key: 'device_id',
      label: 'account.storefront.eproduct.device',
      render: (row) => (
        <Text fontSize="sm" fontFamily="mono" color={surface.text}>{row.device_id}</Text>
      )
    },
    {
      key: 'provider',
      label: 'account.storefront.eproduct.provider',
      render: (row) => (
        <Box>
          {/* The broadcaster's short code and its name, both the service's. */}
          <Text fontWeight="600" color={surface.text}>{row.provider}</Text>
          {!!row.provider_name && (
            <Text fontSize="xs" color={surface.muted} noOfLines={1}>{row.provider_name}</Text>
          )}
        </Box>
      )
    },
    actorColumn(t, surface),
    paidColumn(surface),
    {
      /*
       * SOFT POINTS - the vendor's EPROD_SOFT_POINT, which is what
       * `bonus_price` is. It used to be labelled as points coming back, which
       * reads as a refund of the charge beside it; it is not one. It is the
       * software allowance the licence earned, spendable on different things,
       * so it gets the name the system that issues it uses.
       */
      key: 'bonus',
      label: 'account.storefront.eproduct.pointsSoft',
      align: 'right',
      render: (row) => (
        <Text fontWeight="700" color={row.bonus > 0 ? 'green.500' : surface.muted}>
          {row.bonus > 0 ? '+' : ''}{number(row.bonus)}
        </Text>
      )
    },
    { key: 'at', label: 'account.storefront.eproduct.issued', render: (row) => row.at },
    {
      key: 'actions',
      label: 'account.storefront.eproduct.actions',
      align: 'right',
      width: '120px',
      render: (row) => (
        <Flex align="center" justify="flex-end" gap="2" data-gap="8">
          {/* Dropped rather than disabled on a row with no file: there is
              nothing the member could do to make it available. */}
          {!!row.license_file && (
            <Tooltip label={t('account.storefront.eproduct.download')} hasArrow placement="top">
              <IconButton
                aria-label={t('account.storefront.eproduct.download')}
                icon={<FiDownload />}
                size="sm"
                variant="quiet"
                isLoading={licence.pending === row.id}
                onClick={() => licence.download(row)}
              />
            </Tooltip>
          )}
          <Tooltip label={t('account.storefront.eproduct.detail')} hasArrow placement="top">
            <IconButton
              aria-label={t('account.storefront.eproduct.detail')}
              icon={<FiEye />}
              size="sm"
              variant="quiet"
              onClick={() => {
                setShowing(row);
                detail.onOpen();
              }}
            />
          </Tooltip>
        </Flex>
      )
    }
  ];

  return (
    <Box>
      <StorefrontList
        list={list}
        columns={columns}
        store={t('account.storefront.eproduct.eproduct')}
        emptyTitle={t('account.storefront.eproduct.noMediaLicencesYet')}
        emptyHint={t('account.storefront.eproduct.licencesKeyedForYourDevices')}
      />

      <BmediaDetailModal row={showing} isOpen={detail.isOpen} onClose={detail.onClose} />
    </Box>
  );
}

/**
 * WHAT ONE MEDIA LICENCE COVERS - the titles, their length and what each cost.
 *
 * Fetched per row and on demand, because it is a list per licence and nobody
 * wants all of them at once; the row itself carries the totals already.
 */
function BmediaDetailModal({ row, isOpen, onClose }) {
  const t = useT();
  const surface = useSurface();

  const id = row ? row.id : null;

  /*
   * Keyed on the id AND on `isOpen`, so reopening the same row re-reads it
   * rather than showing what it looked like last time. The guard is what
   * stops it firing for the closed modal on every render of the page behind.
   */
  const lines = useApi(
    () => (isOpen && id ? api.account.bmediaKeygenDetail(id) : Promise.resolve({ data: null })),
    [isOpen, id]
  );

  const rows = (lines.data && lines.data.rows) || [];

  const columns = [
    {
      key: 'no',
      label: 'account.storefront.eproduct.no',
      align: 'center',
      width: '56px',
      render: (line, rowNumber) => <Text fontSize="sm" color={surface.muted}>{rowNumber}</Text>
    },
    {
      /* The title, as the broadcaster wrote it. */
      key: 'title',
      label: 'account.storefront.eproduct.detailTitle',
      render: (line) => <Text color={surface.text}>{line.title}</Text>
    },
    {
      key: 'duration',
      label: 'account.storefront.eproduct.detailDuration',
      align: 'right',
      render: (line) => (
        <Text fontSize="sm" color={surface.muted}>{duration(line.duration)}</Text>
      )
    },
    {
      key: 'media_price',
      label: 'account.storefront.eproduct.detailPrice',
      align: 'right',
      render: (line) => (
        <Text fontWeight="600" color={surface.text}>{number(line.media_price)}</Text>
      )
    },
    {
      key: 'provider',
      label: 'account.storefront.eproduct.provider',
      render: (line) => (
        <Text fontSize="sm" color={surface.muted}>{line.provider || '—'}</Text>
      )
    }
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="4xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent mx="4">
        <ModalHeader>
          {t('account.storefront.eproduct.whatThisLicenceCovers')}
          {!!row && (
            <Text fontSize="sm" fontWeight="400" fontFamily="mono" color={surface.muted} mt="1">
              {row.device_id}
            </Text>
          )}
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody pb="6">
          {lines.loading ? (
            <Loading variant="list" count={3} height="44px" />
          ) : rows.length === 0 ? (
            <EmptyState
              title={t('account.storefront.eproduct.nothingRecordedAgainstThisLicence')}
              hint={t('account.storefront.eproduct.theServiceKeepsTheTitles')}
            />
          ) : (
            <DataTable columns={columns} rows={rows} />
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

/**
 * Seconds to `h:mm:ss`, or `m:ss` when it is under an hour.
 *
 * The service counts a media line in seconds and the vendor has a
 * `formatDuration` for exactly this. It is not a date, so none of the
 * utils/format helpers apply - those write timestamps, and a length is not a
 * moment.
 */
function duration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;

  const pad = (n) => (n < 10 ? '0' + n : String(n));

  return hours > 0
    ? hours + ':' + pad(minutes) + ':' + pad(rest)
    : minutes + ':' + pad(rest);
}
