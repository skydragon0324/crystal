import React, { useState } from 'react';
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Heading,
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
  useDisclosure,
  useToast
} from '@chakra-ui/react';
import { useDispatch, useSelector } from 'react-redux';

import { DataTable, ErrorState, SelectField, StatusBadge } from '@/components/common';
import api from '@/api';
import { useApi, useList } from '@/hooks/useApi';
import { refreshWallet, selectWallet } from '@/app/authSlice';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';
import { date as formatDate } from '@/utils/format';

const DEVICE_OPTIONS = [
  { value: 'TV', label: 'TV' },
  { value: 'STB', label: 'Set-top box' },
  { value: 'KARAOKE', label: 'Karaoke' },
  { value: 'MEDIA', label: 'Media' }
];

/**
 * Device licences (spec 11).
 *
 * Generating one SPENDS points - the cost is shown before the button, and the
 * button is disabled when the balance is short, because discovering the price
 * from an error message is a bad way to learn it.
 *
 * The points balance is refreshed afterwards so the header and the sidebar
 * agree with the ledger without a reload.
 */
export default function Licenses() {
  const t = useT();

  const surface = useSurface();
  const toast = useToast();
  const dispatch = useDispatch();
  const modal = useDisclosure();
  const wallet = useSelector(selectWallet);

  const devices = useApi(() => api.account.licensableDevices(), []);
  const list = useList((params) => api.account.licenses(params), {
    initialParams: { page: 1, limit: 10 }
  });

  const [form, setForm] = useState({ deviceType: 'KARAOKE', deviceSn: '', deviceNo: '', registeredProductId: null });
  const [saving, setSaving] = useState(false);

  // The server is the authority on the price; this mirrors it for the UI.
  const COST = 1000;
  const balance = wallet ? Number(wallet.point_balance || 0) : 0;
  const affordable = balance >= COST;

  const setValue = (name, value) => setForm((current) => ({ ...current, [name]: value }));

  const issue = async () => {
    setSaving(true);
    try {
      const { data } = await api.account.issueLicense(form);
      dispatch(refreshWallet());
      toast({
        title: t('account.licenses.licenceIssued'),
        /*
         * A template literal is a sentence in English word order with two
         * values dropped into it, which is the same problem as gluing
         * fragments together and harder to spot. One key, two placeholders.
         */
        description: t('account.licenses.pointsSpentYourKeyIs', {
          points: data.points_used,
          key: data.license.license_key
        }),
        status: 'success',
        duration: 8000,
        isClosable: true
      });
      modal.onClose();
      setForm({ deviceType: 'KARAOKE', deviceSn: '', deviceNo: '', registeredProductId: null });
      list.reload();
    } catch (err) {
      toast({ title: err.message, status: 'error', duration: 6000, isClosable: true });
    } finally {
      setSaving(false);
    }
  };

  /* The row's own id IS the registration - that is what a licence hangs off. */
  const deviceOptions = (devices.data || []).map((device) => ({
    value: device.id,
    label: device.product_name || device.serial_number,
    hint: device.serial_number
  }));

  const columns = [
    {
      key: 'license_key',
      label: 'Licence key',
      render: (row) => (
        <Box>
          <Text fontWeight="700" fontFamily="mono" fontSize="sm" color={surface.text}>
            {row.license_key}
          </Text>
          <Text fontSize="xs" color={surface.muted} fontFamily="mono">
            {row.device_sn}
          </Text>
        </Box>
      )
    },
    { key: 'device_type', label: 'Device', render: (row) => <StatusBadge value={row.device_type} /> },
    { key: 'points_used', label: 'Points', align: 'right' },
    { key: 'valid_until', label: 'Valid until', render: (row) => row.valid_until || '—' },
    {
      key: 'created_at',
      label: 'Issued',
      render: (row) => formatDate(row.created_at)
    },
    { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> }
  ];

  return (
    <Box>
      <Flex justify="space-between" align="center" gap="4" data-gap="16" data-gap-wrap mb="6" wrap="wrap">
        <Box>
          <Text color={surface.muted}>
            {t('account.licenses.licencesUnlockKaraokeAndMedia')}
          </Text>
          {/*
            ONE SENTENCE, TWO NUMBERS IN IT.

            This was four fragments - a phrase, a bolded cost, another phrase,
            a bolded balance - which fixes English word order on every
            language and leaves the bare word "points" untranslated in the
            middle. Chinese puts the unit after the figure with no space and
            Russian declines it with the number; neither can be expressed by
            gluing pieces together in this order.

            The bold is gone rather than being solved with a rich-text
            placeholder: emphasis inside a translated sentence means each
            language has to be told which words to wrap, and that is a lot of
            machinery to buy two bold numbers.
          */}
          <Text fontSize="sm" color={surface.muted} mt="1">
            {t('account.licenses.eachOneCostsYouHave', {
              cost: COST.toLocaleString(),
              balance: balance.toLocaleString()
            })}
          </Text>
        </Box>
        <Button variant="brand" size="sm" onClick={modal.onOpen} isDisabled={!affordable}>
          {t('account.licenses.generateALicence')}
        </Button>
      </Flex>

      {!affordable && (
        <Alert status="info" borderRadius="12px" mb="6" fontSize="sm">
          <AlertIcon />
          {t('account.licenses.youNeedMorePoints', { points: (COST - balance).toLocaleString() })}
        </Alert>
      )}

      {list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : (
        <DataTable
          columns={columns}
          rows={list.rows}
          loading={list.loading}
          meta={list.meta}
          onPage={list.setPage}
          emptyTitle={t('account.licenses.noLicencesYet')}
          emptyHint={t('account.licenses.generateOneForARegistered')}
        />
      )}

      <Modal isOpen={modal.isOpen} onClose={modal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent borderRadius="16px" mx="4">
          <ModalHeader>
            <Heading size="md">{t('account.licenses.generateALicence')}</Heading>
            <Text fontSize="sm" fontWeight="400" color={surface.muted} mt="1">
              {t('account.licenses.pointsWillBeDeducted', { points: COST.toLocaleString() })}
            </Text>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing="4">
              <SelectField
                label={t('account.licenses.deviceType')}
                value={form.deviceType}
                onChange={(value) => setValue('deviceType', value)}
                options={DEVICE_OPTIONS}
                isSearchable={false}
              />

              {deviceOptions.length > 0 && (
                <SelectField
                  label={t('account.licenses.registeredDevice')}
                  value={form.registeredProductId}
                  onChange={(value) => {
                    setValue('registeredProductId', value);
                    const device = (devices.data || []).filter(
                      (item) => item.id === value
                    )[0];
                    // Prefilling the serial from the registration is the whole
                    // point of asking - typing it again invites a typo.  The
                    // device type comes with it, for the same reason.
                    if (device) {
                      setValue('deviceSn', device.serial_number);
                      if (device.device_type) setValue('deviceType', device.device_type);
                    }
                  }}
                  options={deviceOptions}
                  allowEmpty
                  emptyLabel={t('account.licenses.notOneOfMyRegistered')}
                />
              )}

              <FormControl isRequired>
                <FormLabel fontSize="sm" fontWeight="600">
                  {t('account.licenses.deviceSerialNumber')}
                </FormLabel>
                <Input
                  value={form.deviceSn}
                  onChange={(event) => setValue('deviceSn', event.target.value.toUpperCase())}
                  fontFamily="mono"
                  placeholder={t('common.cr1a2b3c4d5e')}
                />
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm" fontWeight="600">
                  {t('account.licenses.deviceNumber')}
                </FormLabel>
                <Input
                  value={form.deviceNo}
                  onChange={(event) => setValue('deviceNo', event.target.value)}
                  placeholder={t('account.licenses.shownInSettingsAboutOn')}
                />
              </FormControl>
            </Stack>
          </ModalBody>
          <ModalFooter gap="3" data-gap="12">
            <Button variant="quiet" onClick={modal.onClose} isDisabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="brand"
              isLoading={saving}
              isDisabled={form.deviceSn.trim().length < 6}
              onClick={issue}
            >
              {t('account.licenses.spendPoints', { points: COST.toLocaleString() })}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
