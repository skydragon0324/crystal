import React, { useRef } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Box,
  Button,
  Flex,
  Link,
  SimpleGrid,
  Text
} from '@chakra-ui/react';

import { EmptyState, Loading } from '@/components/common';
import api from '@/api';
import { useApi } from '@/hooks/useApi';
import { MONEY_COLOR, POINT_COLOR, useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';
import { number } from '@/utils/format';

/**
 * WHAT THE THREE WALLET FORMS SHARE - charge, transfer and the password.
 *
 * All three act on the APPSTORE WALLET, the one /account/wallet shows. That is
 * the vendor's answer, not a guess: its member console files "Charge" and
 * "Transfer" under a Points menu whose pages are AccountAppstoreWalletChargePage
 * and AccountAppstoreWalletTransferPage, their only money type is the
 * Appstore's, and the transfer form asks for the "Wallet Password". Crystal's
 * own wallet - the one with a pay password and a USD balance - has no page any
 * more, and a charge that credited it would move a figure the member cannot
 * see anywhere next to the wallet they can.
 *
 * FOUR RULES ALL THREE KEEP, because these forms move money:
 *
 *   A BAD FORM NEVER LEAVES THE PAGE. Every rule the API enforces that the
 *   page can check - an amount, a required field, a balance - is checked here
 *   first, so a mistake is answered under the field at once and not after a
 *   round trip, and no request goes out that is known to be refused.
 *
 *   THE API IS STILL THE JUDGE. Everything checked here is checked again
 *   there, and its refusals come back naming a field and a reason
 *   (`detail.field`, `detail.reason`) - see problemOf - so a wrong password
 *   lands under the password box whichever side found it.
 *
 *   NOTHING IS SENT WITHOUT A CONFIRMATION that says what will happen in
 *   words: how much, of what, to whom. The vendor's pages confirm the same way.
 *
 *   NO BALANCE IS EVER WORKED OUT HERE. After a charge or a transfer the page
 *   shows the figure the WALLET answers with, and re-reads the strip - it
 *   never adds or subtracts the amount itself. A page that did would show a
 *   balance the wallet does not hold the moment anything else moved it.
 */

/** Every reason the API or these pages refuse with, and the words for it. */
const PROBLEMS = {
  AMOUNT_REQUIRED: 'account.points.walletform.amountRequired',
  AMOUNT_TOO_LARGE: 'account.points.walletform.amountTooLarge',
  AMOUNT_TOO_FINE: 'account.points.walletform.amountTooFine',
  OVER_BALANCE: 'account.points.walletform.overBalance',
  PASSWORD_REQUIRED: 'account.points.walletform.passwordRequired',
  WRONG_PASSWORD: 'account.points.walletform.wrongPassword',
  RECEIVER_REQUIRED: 'account.points.walletform.receiverRequired',
  NO_RECEIVER: 'account.points.walletform.noReceiver',
  RECEIVER_IS_SELF: 'account.points.walletform.receiverIsSelf',
  MONEY_REQUIRED: 'account.points.walletform.moneyRequired',
  CHANNEL_REQUIRED: 'account.points.walletform.channelRequired',
  PASSWORD_TOO_SHORT: 'account.points.walletform.passwordTooShort',
  PASSWORD_UNCHANGED: 'account.points.walletform.passwordUnchanged',
  PASSWORDS_DIFFER: 'common.theTwoDoNotMatch',
  NO_WALLET: 'account.points.walletform.noWalletLinked',
  UNAVAILABLE: 'account.points.walletform.theWalletDidNotAnswer',
  REFUSED: 'account.points.walletform.theWalletDidNotAccept'
};

/** The vendor's field limit, until the API's own figure has arrived. */
export const MOVE_LIMIT = 99999999;

/** The two purses, in the words the wallet page uses for their balances. */
export const PURSES = {
  COMPANY: { label: 'account.points.walletform.nativePoints', balance: 'native_score', color: POINT_COLOR },
  FOREIGN: { label: 'account.points.walletform.foreignPoints', balance: 'foreign_score', color: MONEY_COLOR }
};

/**
 * WHAT IS WRONG WITH AN AMOUNT, or null - the same four rules the API applies.
 *
 * Checked as TEXT first, because what the member typed is text: "12.5" is an
 * amount, "12,5" and "1e3" are not, and Number() would quietly accept the
 * second and turn the first into NaN in some locales' hands. The decimal rule
 * is three places, the scale every balance on the platform is kept to - a
 * figure that is too fine is refused, not rounded, because rounding somebody's
 * transfer is moving a different amount from the one they typed.
 */
export function amountProblem(text, options) {
  const opts = options || {};
  const value = String(text === undefined || text === null ? '' : text).trim();

  if (!/^\d+(\.\d+)?$/.test(value) || !(Number(value) > 0)) return { reason: 'AMOUNT_REQUIRED' };

  const decimals = value.indexOf('.') === -1 ? '' : value.split('.')[1].replace(/0+$/, '');
  if (decimals.length > 3) return { reason: 'AMOUNT_TOO_FINE' };

  const limit = opts.limit || MOVE_LIMIT;
  if (Number(value) > limit) return { reason: 'AMOUNT_TOO_LARGE', limit: limit };

  if (opts.available !== undefined && opts.available !== null && Number(value) > Number(opts.available)) {
    return { reason: 'OVER_BALANCE', balance: opts.available };
  }

  return null;
}

/**
 * A refusal from the API as `{ field, reason, message }`.
 *
 * A reason this page has words for is said in the reader's language, with its
 * figures filled in; one it does not know falls back to the API's own message,
 * which is already translated - so a new refusal added on the server reads as
 * a sentence here before anybody has written words for it.
 */
export function problemOf(err, t) {
  const detail = (err && err.detail) || {};
  const address = PROBLEMS[detail.reason];

  return {
    field: detail.field || null,
    reason: detail.reason || null,
    message: address
      ? t(address, {
        limit: number(detail.limit || MOVE_LIMIT),
        balance: number(detail.balance),
        n: detail.n || 6
      })
      : (err && err.message) || t('account.points.walletform.theWalletDidNotAnswer')
  };
}

/** The words for a problem the page found itself. */
export function sayProblem(problem, t) {
  if (!problem) return null;
  return t(PROBLEMS[problem.reason], {
    limit: number(problem.limit || MOVE_LIMIT),
    balance: number(problem.balance),
    n: 6
  });
}

/** The member's wallet, read once per page and re-read after every write. */
export function useWalletBalance() {
  return useApi(() => api.account.appstoreBalance(), []);
}

/**
 * THE TWO POINT BALANCES A FORM CAN MOVE, and the way back to the wallet.
 *
 * The same figures, colours and words as the wallet page's tiles, so a member
 * who has just come from there recognises what they are about to spend.
 */
export function WalletStrip({ balance, highlight }) {
  const t = useT();
  const surface = useSurface();

  if (balance.loading && !balance.data) return <Loading variant="list" count={1} height="72px" />;

  const coins = balance.data || {};

  return (
    <Flex align="flex-end" wrap="wrap" gap="3" data-gap="12" data-gap-wrap mb="7">
      <SimpleGrid columns={2} spacing="3" flex="1" maxW="440px" minW="260px">
        {Object.keys(PURSES).map((key) => (
          <Box
            key={key}
            p="4"
            borderRadius="14px"
            bg={surface.raised}
            borderWidth="1px"
            borderColor={highlight === key ? PURSES[key].color : 'transparent'}
          >
            <Text fontSize="xs" fontWeight="700" textTransform="uppercase" letterSpacing="0.5px" color={surface.muted}>
              {t(PURSES[key].label)}
            </Text>
            <Text fontSize="xl" fontWeight="800" color={PURSES[key].color}>
              {number(coins[PURSES[key].balance])}
            </Text>
          </Box>
        ))}
      </SimpleGrid>
      <Link as={RouterLink} to="/account/wallet" fontSize="sm" fontWeight="600" color="brand.500">
        {t('account.points.walletform.openTheWallet')}
      </Link>
    </Flex>
  );
}

/** A member with no Appstore wallet has nothing to charge, send or protect. */
export function NoWallet() {
  const t = useT();

  return (
    <EmptyState
      title={t('account.points.walletform.noWalletLinked')}
      hint={t('account.points.walletform.thisAccountIsNotConnected')}
    />
  );
}

/** A problem that belongs to the whole form rather than one field. */
export function FormProblem({ children }) {
  if (!children) return null;

  return (
    <Box role="alert" mb="4" p="3" borderRadius="10px" borderWidth="1px" borderColor="red.300">
      <Text fontSize="sm" color="red.500">{children}</Text>
    </Box>
  );
}

/**
 * The last word before money moves.
 *
 * `leastDestructiveRef` is Cancel, so Enter and the initial focus land on the
 * button that does nothing - the member has to reach for the one that sends.
 */
export function ConfirmMove({ isOpen, onClose, title, body, confirmLabel, onConfirm, isBusy }) {
  const t = useT();
  const surface = useSurface();
  const cancelRef = useRef(null);

  return (
    <AlertDialog isOpen={isOpen} leastDestructiveRef={cancelRef} onClose={isBusy ? () => {} : onClose} isCentered>
      <AlertDialogOverlay>
        <AlertDialogContent mx="4">
          <AlertDialogHeader fontSize="lg" fontWeight="700">{title}</AlertDialogHeader>
          <AlertDialogBody fontSize="sm" color={surface.muted}>{body}</AlertDialogBody>
          <AlertDialogFooter>
            <Button ref={cancelRef} variant="quiet" onClick={onClose} isDisabled={isBusy}>
              {t('common.cancel')}
            </Button>
            <Button variant="brand" ml="3" onClick={onConfirm} isLoading={isBusy}>
              {confirmLabel}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  );
}

/** What happened, in place of the form, with the wallet's own figures. */
export function Done({ title, lines, againLabel, onAgain }) {
  const surface = useSurface();

  return (
    <Box role="status" p="5" borderRadius="14px" bg={surface.raised} maxW="520px">
      <Text fontWeight="700" color={surface.text} mb="1">{title}</Text>
      {(lines || []).filter(Boolean).map((line) => (
        <Text key={line} fontSize="sm" color={surface.muted}>{line}</Text>
      ))}
      {onAgain && (
        <Button size="sm" variant="quiet" mt="4" onClick={onAgain}>{againLabel}</Button>
      )}
    </Box>
  );
}
