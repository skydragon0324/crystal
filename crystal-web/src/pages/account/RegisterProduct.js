import React, { useState } from 'react';
import { useHistory } from 'react-router-dom';
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  Icon,
  Input,
  Stack,
  Text,
  useToast
} from '@chakra-ui/react';
import { FiCheckCircle, FiInfo } from 'react-icons/fi';
import { useDispatch } from 'react-redux';

import api from '@/api';
import { refreshWallet } from '@/app/authSlice';
import { DatePicker } from '@/components/common';
import { toISODate } from '@/components/common/DatePicker';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';
import { number } from '@/utils/format';

/**
 * Product registration (spec 11: input SN -> check Oracle -> get product ->
 * register -> give points).
 *
 * It is deliberately two steps. Checking first tells the member WHAT they are
 * about to register and whether it is already claimed, before anything is
 * written - a one-shot form that answers "that serial is already registered"
 * after the fact is a worse experience and a worse support ticket.
 *
 * The wallet is refreshed after a successful registration so the points in
 * the header update without a reload.
 */
export default function RegisterProduct() {
  const t = useT();

  const surface = useSurface();
  const toast = useToast();
  const history = useHistory();
  const dispatch = useDispatch();

  const [serial, setSerial] = useState('');
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(null);
  const [purchaseDate, setPurchaseDate] = useState('');
  const [nickname, setNickname] = useState('');
  const [saving, setSaving] = useState(false);

  const check = async (event) => {
    event.preventDefault();
    if (!serial.trim()) return;
    setChecking(true);
    setChecked(null);
    try {
      const { data } = await api.account.checkSerial(serial.trim());
      setChecked(data);
    } catch (err) {
      toast({ title: err.message, status: 'error', duration: 6000, isClosable: true });
    } finally {
      setChecking(false);
    }
  };

  const register = async () => {
    setSaving(true);
    try {
      const { data } = await api.account.registerProduct({
        serial_number: checked.serial_number,
        purchase_date: purchaseDate || null,
        nickname: nickname || null
      });
      dispatch(refreshWallet());
      toast({
        title: t('account.registerproduct.deviceRegistered'),
        /*
         * ONE SENTENCE WITH THE FIGURE IN IT, not a template literal gluing a
         * number to an English phrase - that fixes English word order on every
         * language, and Chinese puts the unit straight after the figure while
         * Russian declines it with the number. The points are run through
         * `number` for the same reason as everywhere else: they are fractional
         * and 0.4 is not 0.
         */
        description: t('account.registerproduct.pointsAddedToYourAccount', {
          points: number(data.points_awarded)
        }),
        status: 'success',
        duration: 5000,
        isClosable: true
      });
      /*
       * TO THE DASHBOARD, because there is nowhere else to go. This used to
       * push to /account/products - Crystal's own list of registered devices -
       * and that page is gone; the dashboard is where the devices and the
       * points this just earned are both shown.
       */
      history.push('/account');
    } catch (err) {
      toast({ title: err.message, status: 'error', duration: 6000, isClosable: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box maxW="620px">
      <Text color={surface.muted} mb="8">
        {t('account.registerproduct.theSerialNumberIsOn')}
      </Text>

      <Box as="form" onSubmit={check}>
        <FormControl isRequired>
          <FormLabel fontSize="sm" fontWeight="600">
            {t('account.registerproduct.serialNumber')}
          </FormLabel>
          <Flex gap="3" data-gap="12">
            <Input
              value={serial}
              onChange={(event) => {
                setSerial(event.target.value.toUpperCase());
                setChecked(null);
              }}
              placeholder={t('common.cr1a2b3c4d5e')}
              fontFamily="mono"
              autoFocus
            />
            <Button
              type="submit"
              variant="brand"
              flexShrink={0}
              isLoading={checking}
              isDisabled={!serial.trim()}
            >
              {t('account.registerproduct.check')}
            </Button>
          </Flex>
        </FormControl>
      </Box>

      {/* --------------------------------------------------- unknown serial */}
      {checked && !checked.known && (
        <Alert status="warning" borderRadius="12px" mt="6" fontSize="sm">
          <AlertIcon />
          {t('account.registerproduct.weCouldNotFindThat')}
        </Alert>
      )}

      {/* -------------------------------------------------- already claimed */}
      {checked && checked.known && checked.registered && (
        <Alert status="error" borderRadius="12px" mt="6" fontSize="sm">
          <AlertIcon />
          {t('account.registerproduct.thatSerialNumberIsAlready')}
        </Alert>
      )}

      {/* ------------------------------------------------------- ready to go */}
      {checked && checked.known && !checked.registered && (
        <Box
          mt="8"
          p="6"
          borderRadius="16px"
          border="1px solid"
          borderColor={surface.border}
          bg={surface.card}
        >
          <Flex align="center" gap="2" data-gap="8" color="green.500" mb="5">
            <Icon as={FiCheckCircle} boxSize="5" />
            <Text fontWeight="700">{t('account.registerproduct.readyToRegister')}</Text>
          </Flex>

          {/*
            * The check answers what the warehouse knows - the model, the
            * serial and the cover date - and deliberately not the artwork:
            * this is a lookup against the serial mirror, not a catalogue read.
            */}
          <Flex gap="4" data-gap="16" align="center" mb="6">
            <Box minW="0">
              <Heading size="md" color={surface.text}>
                {/* The model name is the warehouse's own; the fallback is
                    ours, so only the fallback is translated. */}
                {checked.product ? checked.product.name : t('account.registerproduct.crystalDevice')}
              </Heading>
              <Text fontSize="sm" color={surface.muted} fontFamily="mono">
                {checked.serial_number}
              </Text>
              {checked.warranty_until && (
                <Text fontSize="sm" color={surface.muted} mt="1">
                  {t('common.warrantyUntil')} {checked.warranty_until}
                </Text>
              )}
            </Box>
          </Flex>

          <Stack spacing="4">
            <FormControl>
              <FormLabel fontSize="sm" fontWeight="600">
                {t('account.registerproduct.giveItAName')}
              </FormLabel>
              <Input
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder={t('account.registerproduct.livingRoomTv')}
              />
              <Text fontSize="xs" color={surface.muted} mt="1">
                {t('account.registerproduct.optionalItJustMakesTwo')}
              </Text>
            </FormControl>

            <FormControl>
              <FormLabel fontSize="sm" fontWeight="600">
                {t('account.registerproduct.purchaseDate')}
              </FormLabel>
              {/*
                * NOTHING LATER THAN TODAY. A device is registered after it is
                * bought, and the native field this replaces would take any
                * date at all - including one that starts the warranty in the
                * future. The label above names the field through the
                * FormControl, as it did for the input.
                */}
              <DatePicker
                value={purchaseDate}
                max={toISODate(new Date())}
                aria-label={t('account.registerproduct.purchaseDate')}
                onChange={setPurchaseDate}
              />
            </FormControl>

            <Button variant="brand" size="lg" isLoading={saving} onClick={register}>
              {t('account.registerproduct.registerThisDevice')}
            </Button>
          </Stack>
        </Box>
      )}

      <Flex gap="3" data-gap="12" mt="10" p="5" borderRadius="12px" bg={surface.raised} align="flex-start">
        <Icon as={FiInfo} color="brand.500" boxSize="5" mt="0.5" flexShrink={0} />
        <Box>
          <Text fontWeight="600" color={surface.text}>
            {t('account.registerproduct.whyRegister')}
          </Text>
          <Text fontSize="sm" color={surface.muted} mt="1">
            {t('account.registerproduct.yourWarrantyDateComesFrom')}
          </Text>
        </Box>
      </Flex>
    </Box>
  );
}
