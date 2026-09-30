import React from 'react';
import { Box, Button, Flex, Icon, IconButton, Input, Text } from '@chakra-ui/react';
import { AddIcon, ArrowDownIcon, ArrowUpIcon, CloseIcon } from '@chakra-ui/icons';
import { MdPhone } from 'react-icons/md';
import { useI18n } from '../i18n';
import { useSurface } from '../theme/tokens';

/**
 * A SERVICE CENTRE'S PHONE NUMBERS, edited as a list.
 *
 * A centre answers on a front desk, a repair line, sometimes an after-hours
 * mobile - and the single box this replaced was where people typed all three
 * with slashes between them, which the storefront then offered as one number
 * nobody could call.
 *
 * The value is the array the API stores and hands back, `[{ phone, label }]`,
 * and it is replaced WHOLE on save (agencies.repository.js, replacePhones), so
 * what is on screen when Save is pressed is exactly what is kept - the ORDER
 * included: the first number is the one the storefront card leads with, which
 * is why it can be moved.
 *
 * The LABEL is optional and says what the number is for. It is shown beside
 * the number on the website as typed, so it is written for customers.
 *
 * Blank rows are harmless: the server drops a row with no number rather than
 * refusing the save, so "Add a number" and then thinking better of it is not
 * a mistake anybody has to clean up.
 */
export default function PhoneListField({ value, isDisabled, onChange }) {
  const { t } = useI18n();
  const surface = useSurface();

  const list = Array.isArray(value) ? value : [];

  const replace = (next) => onChange(next);

  const setAt = (index, key, text) => replace(list.map((row, i) => (
    i === index ? Object.assign({}, row, { [key]: text }) : row
  )));

  const removeAt = (index) => replace(list.filter((row, i) => i !== index));

  const moveBy = (index, step) => {
    const next = list.slice();
    const target = index + step;
    if (target < 0 || target >= next.length) return;
    const held = next[index];
    next[index] = next[target];
    next[target] = held;
    replace(next);
  };

  return (
    <Box>
      {list.length ? (
        <Flex direction="column" gap="0.5rem" data-gap="8" data-gap-column mb="0.625rem">
          {list.map((row, index) => (
            <Flex
              // Position, not the number: the number is what is being typed,
              // and a key that changes on every keystroke remounts the input
              // under the cursor.
              key={index}
              align="center" gap="0.5rem" data-gap="8"
              p="0.375rem 0.5rem" borderRadius="0.5rem"
              bg={surface.raised} border="1px solid" borderColor={surface.border}
            >
              <Icon as={MdPhone} w="1rem" h="1rem" color={surface.muted} flexShrink={0} />

              <Input
                flex="1.2" minW="0" size="sm" h="1.875rem" fontSize="sm"
                inputMode="tel" maxLength={40}
                placeholder={t('support.agencies.phoneNumber')}
                value={row.phone || ''}
                isReadOnly={isDisabled}
                onChange={(e) => setAt(index, 'phone', e.target.value)}
              />

              <Input
                flex="1" minW="0" size="sm" h="1.875rem" fontSize="sm" maxLength={60}
                placeholder={t('support.agencies.phoneLabelOptional')}
                value={row.label || ''}
                isReadOnly={isDisabled}
                onChange={(e) => setAt(index, 'label', e.target.value)}
              />

              {isDisabled ? null : (
                <Flex gap="2px" data-gap="2" flexShrink={0}>
                  <IconButton
                    aria-label={t('components.filelistfield.moveUp')} variant="quiet" size="xs"
                    icon={<ArrowUpIcon />} isDisabled={index === 0}
                    onClick={() => moveBy(index, -1)}
                  />
                  <IconButton
                    aria-label={t('components.filelistfield.moveDown')} variant="quiet" size="xs"
                    icon={<ArrowDownIcon />} isDisabled={index === list.length - 1}
                    onClick={() => moveBy(index, 1)}
                  />
                  <IconButton
                    aria-label={t('common.remove')} variant="quiet" size="xs" color="red.400"
                    icon={<CloseIcon w="0.5rem" h="0.5rem" />}
                    onClick={() => removeAt(index)}
                  />
                </Flex>
              )}
            </Flex>
          ))}
        </Flex>
      ) : (
        <Text fontSize="sm" color={surface.muted} mb="0.625rem">
          {t('support.agencies.noPhoneNumbersYet')}
        </Text>
      )}

      <Button
        size="xs" h="1.75rem" variant="subtle"
        leftIcon={<AddIcon w="0.5625rem" h="0.5625rem" />}
        isDisabled={isDisabled}
        onClick={() => replace(list.concat([{ phone: '', label: '' }]))}
      >
        {t('support.agencies.addANumber')}
      </Button>
    </Box>
  );
}
