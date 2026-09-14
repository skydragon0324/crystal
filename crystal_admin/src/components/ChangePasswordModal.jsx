import React, { useEffect, useState } from 'react';
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  ModalCloseButton, FormControl, FormLabel, FormHelperText, Input, Button,
  InputGroup, InputRightElement, Stack, Text, Icon, useToast, useColorModeValue
} from '@chakra-ui/react';
import { ViewIcon, ViewOffIcon } from '@chakra-ui/icons';
import { useI18n } from '../i18n';
import { auth } from '../api';

const MIN_LENGTH = 8;

const EMPTY = { current_password: '', new_password: '', confirm_password: '' };

/*
 * The API takes the two passwords positionally and calls the first one
 * `old_password` - see api/index.js.  The form keeps its own names because
 * they are what the autocomplete attributes below are keyed on.
 */

/**
 * Change password for the signed-in manager, opened from the avatar menu.
 * Talks to POST /admin/auth/password, which re-checks the current password
 * server side; the checks here only save the user a round trip.
 */
export default function ChangePasswordModal({ isOpen, onClose }) {
  const toast = useToast();
  const { t } = useI18n();

  const [values, setValues] = useState(EMPTY);
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const textColor = useColorModeValue('navy.700', 'white');
  const mutedColor = 'secondaryGray.600';

  // Never leave a typed password sitting in state after the dialog closes.
  useEffect(() => {
    if (!isOpen) { setValues(EMPTY); setError(null); setShow(false); }
  }, [isOpen]);

  const set = (name, value) => {
    setValues((prev) => Object.assign({}, prev, { [name]: value }));
    setError(null);
  };

  const validate = () => {
    if (values.new_password.length < MIN_LENGTH) return t('components.changepasswordmodal.theNewPasswordMustBe');
    if (values.new_password !== values.confirm_password) return t('components.changepasswordmodal.theTwoNewPasswordsDo');
    return null;
  };

  const submit = async () => {
    const problem = validate();
    if (problem) { setError(problem); return; }

    setSaving(true);
    try {
      await auth.changePassword(values.current_password, values.new_password);
      toast({ title: t('components.changepasswordmodal.passwordChanged'), status: 'success', duration: 3000 });
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const field = (name, label, helper) => (
    <FormControl isInvalid={!!error}>
      <FormLabel ms="0.25rem" fontSize="sm" fontWeight="500" color={textColor} mb="0.375rem">
        {label}
      </FormLabel>
      <InputGroup>
        <Input
          fontSize="sm" h="2.75rem"
          type={show ? 'text' : 'password'}
          autoComplete={name === 'current_password' ? 'current-password' : 'new-password'}
          value={values[name]}
          onChange={(e) => set(name, e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
        />
        <InputRightElement h="2.75rem" w="2.75rem">
          <Icon
            as={show ? ViewOffIcon : ViewIcon}
            color={mutedColor} cursor="pointer" w="1rem" h="1rem"
            onClick={() => setShow(!show)}
          />
        </InputRightElement>
      </InputGroup>
      {helper ? (
        <FormHelperText fontSize="xs" color={mutedColor} ms="0.25rem">{helper}</FormHelperText>
      ) : null}
    </FormControl>
  );

  const canSubmit = values.current_password && values.new_password && values.confirm_password;

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="md">
      <ModalOverlay />
      <ModalContent borderRadius="1.25rem">
        <ModalHeader color={textColor}>{t('common.changePassword')}</ModalHeader>
        <ModalCloseButton _focus={{ boxShadow: 'none' }} />

        <ModalBody pb="0.375rem">
          <Stack spacing="1rem">
            {field('current_password', t('components.changepasswordmodal.currentPassword'))}
            {field('new_password', t('components.changepasswordmodal.newPassword'), t('components.changepasswordmodal.atLeast8Characters'))}
            {field('confirm_password', t('components.changepasswordmodal.repeatNewPassword'))}

            {error ? (
              <Text fontSize="sm" color="red.500" fontWeight="500">{error}</Text>
            ) : null}
          </Stack>
        </ModalBody>

        <ModalFooter pt="1.25rem">
          <Button variant="subtle" fontSize="sm" borderRadius="1rem" me="0.75rem" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="brand" fontSize="sm" fontWeight="500" borderRadius="1rem"
            px="1.625rem" onClick={submit} isLoading={saving} isDisabled={!canSubmit}
          >
            {t('common.save')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
