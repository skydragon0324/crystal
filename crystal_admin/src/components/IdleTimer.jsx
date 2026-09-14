import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertDialog, AlertDialogOverlay, AlertDialogContent, AlertDialogHeader,
  AlertDialogBody, AlertDialogFooter, Button, Flex, Icon, Text, useColorModeValue
} from '@chakra-ui/react';
import { TimeIcon } from '@chakra-ui/icons';
import { useDispatch } from 'react-redux';
import { signedOut } from '../app/authSlice';
import { renewSession } from '../api/client';
import { useI18n } from '../i18n';
import { IDLE_MS, readActivity, writeActivity } from '../utils/session';

/** Seconds of countdown shown before the session is dropped. */
const WARN_SECONDS = 60;

const ACTIVITY_EVENTS = [
  'mousedown', 'mousemove', 'keydown', 'wheel', 'touchstart', 'scroll', 'visibilitychange'
];

/** Do not reset the clock more than once a second on a moving mouse. */
const THROTTLE_MS = 1000;

/**
 * Signs the manager out after a stretch of no interaction, with a countdown
 * dialog first so nobody loses a half-filled form without warning.
 *
 * The last-activity stamp lives in localStorage, so working in a second tab
 * keeps every tab alive; the timer is a plain interval rather than a long
 * setTimeout because a suspended laptop does not fire those on time.
 */
export default function IdleTimer() {
  const dispatch = useDispatch();
  const { t } = useI18n();

  const [remaining, setRemaining] = useState(null);
  const lastWrite = useRef(0);

  const dialogBg = useColorModeValue('white', 'navy.800');
  const titleColor = useColorModeValue('navy.700', 'white');
  const bodyColor = useColorModeValue('secondaryGray.700', 'secondaryGray.500');
  const cancelRef = useRef(null);

  const markActive = useCallback(() => {
    const now = Date.now();
    if (now - lastWrite.current < THROTTLE_MS) return;
    lastWrite.current = now;
    writeActivity(now);
  }, []);

  // Fresh mount (a reload, or straight after login) counts as activity,
  // otherwise a stale stamp from an old session would expire us immediately.
  useEffect(() => { writeActivity(Date.now()); }, []);

  useEffect(() => {
    ACTIVITY_EVENTS.forEach((name) =>
      window.addEventListener(name, markActive, { passive: true })
    );
    return () => {
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, markActive));
    };
  }, [markActive]);

  useEffect(() => {
    const tick = () => {
      const idleFor = Date.now() - (readActivity() || Date.now());
      const left = Math.ceil((IDLE_MS - idleFor) / 1000);

      if (left <= 0) {
        setRemaining(null);
        dispatch(signedOut());
        return;
      }

      setRemaining(left <= WARN_SECONDS ? left : null);
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [dispatch]);

  // "Stay signed in" has to renew the token as well: the countdown only
  // tracks the browser, while the JWT is what the server actually checks, and
  // by this point it is usually the older of the two.
  const stay = () => {
    writeActivity(Date.now());
    setRemaining(null);
    renewSession().catch(() => dispatch(signedOut()));
  };

  return (
    <AlertDialog
      isOpen={remaining !== null}
      leastDestructiveRef={cancelRef}
      onClose={stay}
      isCentered
      motionPreset="slideInBottom"
    >
      <AlertDialogOverlay>
        <AlertDialogContent bg={dialogBg} borderRadius="1.25rem" mx="1.25rem">
          <AlertDialogHeader pt="1.5rem" pb="0.5rem">
            <Flex align="center" gap="0.75rem" data-gap="12">
              <Icon as={TimeIcon} w="1.25rem" h="1.25rem" color="orange.500" />
              <Text fontSize="lg" fontWeight="700" color={titleColor}>
                {t('components.idletimer.stillThere')}
              </Text>
            </Flex>
          </AlertDialogHeader>

          <AlertDialogBody pb="0.5rem">
            <Text fontSize="sm" color={bodyColor}>
              {t('components.idletimer.yourSessionEndsInSeconds', { seconds: remaining === null ? 0 : remaining })}
            </Text>
          </AlertDialogBody>

          <AlertDialogFooter pb="1.5rem" pt="1rem">
            <Button
              variant="subtle" borderRadius="1rem" fontSize="sm"
              onClick={() => dispatch(signedOut())}
            >
              {t('common.signOut')}
            </Button>
            <Button
              ref={cancelRef}
              variant="brand" borderRadius="1rem" ms="0.75rem"
              fontSize="sm" fontWeight="600" px="1.5rem" onClick={stay}
            >
              {t('components.idletimer.staySignedIn')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  );
}
