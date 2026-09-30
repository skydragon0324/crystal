import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  AlertDialog, AlertDialogOverlay, AlertDialogContent, AlertDialogHeader,
  AlertDialogBody, AlertDialogFooter, Button, Flex, Icon, Text, useColorModeValue
} from '@chakra-ui/react';
import { WarningTwoIcon, RepeatIcon, InfoOutlineIcon } from '@chakra-ui/icons';
import { useI18n } from '../i18n';

const TONES = {
  danger: { bg: '#EE5D50', hover: '#E31A1A', accent: 'red.500', icon: WarningTwoIcon },
  restore: { bg: '#01B574', hover: '#019A63', accent: 'green.500', icon: RepeatIcon },
  info: { bg: '#2E10B8', hover: '#23148F', accent: 'brand.500', icon: InfoOutlineIcon }
};

const ConfirmContext = createContext(null);

/**
 * Promise based confirm dialog, mounted once near the app root.
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title, body, tone: 'danger' }))) return;
 *
 * Replaces window.confirm so the prompt is themed and translatable.
 */
export function ConfirmProvider({ children }) {
  const { t } = useI18n();
  const [state, setState] = useState(null);
  const resolveRef = useRef(null);
  const cancelRef = useRef(null);

  const dialogBg = useColorModeValue('white', 'navy.800');
  const titleColor = useColorModeValue('navy.700', 'white');
  const bodyColor = useColorModeValue('secondaryGray.700', 'secondaryGray.500');

  const confirm = useCallback((options) => {
    setState(Object.assign({ tone: 'danger' }, options || {}));
    return new Promise((resolve) => { resolveRef.current = resolve; });
  }, []);

  const settle = useCallback((answer) => {
    if (resolveRef.current) resolveRef.current(answer);
    resolveRef.current = null;
    setState(null);
  }, []);

  /*
   * ENTER MEANS YES, wherever the focus happens to be.
   *
   * `leastDestructiveRef` puts the initial focus on Cancel, which is the right
   * default for a mouse and the wrong one for the keyboard: somebody who has
   * read the prompt and reached for Enter means "go ahead", not "never mind".
   *
   * This is a CAPTURE listener on the document rather than an `onKeyDown` on
   * the dialog, for the same reason the select and the date picker handle
   * Escape that way. A handler on the panel only fires when the event reaches
   * the panel, and it did not reliably: the dialog is portalled, the focus
   * lock moves focus around inside it, and a keydown on the focused Cancel
   * button would otherwise turn into a click on Cancel as well. Capturing
   * first means one interpretation of the key, every time.
   *
   * `preventDefault` is the half that stops the focused button also being
   * activated; without it Enter both confirms and cancels.
   */
  useEffect(() => {
    if (!state) return undefined;

    const onKey = (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      event.stopPropagation();
      settle(true);
    };

    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [state, settle]);

  const tone = TONES[(state && state.tone) || 'danger'] || TONES.danger;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      <AlertDialog
        isOpen={!!state}
        leastDestructiveRef={cancelRef}
        onClose={() => settle(false)}
        isCentered
        motionPreset="slideInBottom"
      >
        <AlertDialogOverlay>
          <AlertDialogContent
            bg={dialogBg} borderRadius="1.25rem" mx="1.25rem"
          >
            <AlertDialogHeader pt="1.5rem" pb="0.5rem">
              <Flex align="center" gap="0.75rem" data-gap="12">
                <Icon as={tone.icon} w="1.25rem" h="1.25rem" color={tone.accent} />
                <Text fontSize="lg" fontWeight="700" color={titleColor}>
                  {(state && state.title) || t('dialog.deleteRecord')}
                </Text>
              </Flex>
            </AlertDialogHeader>

            <AlertDialogBody pb="0.5rem">
              <Text fontSize="sm" color={bodyColor}>
                {(state && state.body) || t('dialog.deleteExplains')}
              </Text>
              {state && state.detail ? (
                <Text fontSize="sm" fontWeight="700" color={titleColor} mt="0.625rem">
                  {state.detail}
                </Text>
              ) : null}
            </AlertDialogBody>

            <AlertDialogFooter pb="1.5rem" pt="1rem">
              {/*
                A dialog that only reports something has ONE button.

                `acknowledge` is for the case where there is no decision to
                make - "this cannot be deleted, here is what is in the way".
                Offering Cancel and Close side by side asks the reader to
                choose between two words for the same thing.
              */}
              {state && state.acknowledge ? null : (
                <Button
                  ref={cancelRef} variant="subtle" borderRadius="1rem"
                  fontSize="sm" onClick={() => settle(false)}
                >
                  {(state && state.cancelLabel) || t('common.cancel')}
                </Button>
              )}
              <Button
                ref={state && state.acknowledge ? cancelRef : undefined}
                bg={tone.bg} color="white" borderRadius="1rem" ms={state && state.acknowledge ? '0' : '0.75rem'}
                _hover={{ bg: tone.hover }} _active={{ bg: tone.hover }}
                _focus={{ bg: tone.bg, boxShadow: 'none' }}
                fontSize="sm" fontWeight="600" px="1.5rem" onClick={() => settle(true)}
              >
                {(state && state.confirmLabel) || t('dialog.confirm')}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  // Outside the provider nothing should silently destroy data, so refuse.
  return ctx || (() => Promise.resolve(false));
}

/**
 * The same dialog as a plain controlled component.
 *
 * The promise API above is the better one and is what CrudPage uses, but a
 * screen that already holds its own `isOpen` - the ticket screen's cancel
 * confirmation, say - should not have to be rewritten to keep working.  Both
 * render the same thing, so the two can never look different.
 */
export function ConfirmDialogBox({
  isOpen, onClose, onConfirm, isLoading, title, body, confirmText, colorScheme
}) {
  const { t } = useI18n();
  const cancelRef = useRef(null);

  const dialogBg = useColorModeValue('white', 'navy.800');
  const titleColor = useColorModeValue('navy.700', 'white');
  const bodyColor = useColorModeValue('secondaryGray.700', 'secondaryGray.500');

  const tone = colorScheme === 'green' ? TONES.restore : TONES.danger;

  return (
    <AlertDialog
      isOpen={!!isOpen}
      leastDestructiveRef={cancelRef}
      onClose={onClose}
      isCentered
      motionPreset="slideInBottom"
    >
      <AlertDialogOverlay>
        <AlertDialogContent bg={dialogBg} borderRadius="0.75rem" mx="1.25rem">
          <AlertDialogHeader pt="1.5rem" pb="0.5rem">
            <Flex align="center" gap="0.75rem" data-gap="12">
              <Icon as={tone.icon} w="1.25rem" h="1.25rem" color={tone.accent} />
              <Text fontSize="lg" fontWeight="700" color={titleColor}>
                {title || t('dialog.areYouSure')}
              </Text>
            </Flex>
          </AlertDialogHeader>

          <AlertDialogBody pb="0.5rem">
            <Text fontSize="sm" color={bodyColor}>{body}</Text>
          </AlertDialogBody>

          <AlertDialogFooter pb="1.5rem" pt="1rem">
            <Button ref={cancelRef} variant="subtle" borderRadius="0.5rem" fontSize="sm" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              bg={tone.bg} color="white" borderRadius="0.5rem" ms="0.75rem"
              _hover={{ bg: tone.hover }} _active={{ bg: tone.hover }}
              fontSize="sm" fontWeight="600" px="1.5rem"
              isLoading={isLoading}
              onClick={onConfirm}
            >
              {confirmText || t('dialog.confirm')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  );
}

export default ConfirmDialogBox;
