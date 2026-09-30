import React, { useCallback, useState } from 'react';
import {
  AlertDialog, AlertDialogBody, AlertDialogContent, AlertDialogFooter,
  AlertDialogHeader, AlertDialogOverlay,
  Badge, Box, Button, Drawer, DrawerBody, DrawerCloseButton, DrawerContent,
  DrawerHeader, DrawerOverlay, Flex, Heading, IconButton, Input,
  Modal, ModalBody, ModalCloseButton, ModalContent, ModalFooter, ModalHeader,
  ModalOverlay, Stack, Text, Textarea, useDisclosure, useToast
} from '@chakra-ui/react';
import { FiMessageSquare, FiPlus, FiTrash2 } from 'react-icons/fi';

import { EmptyState, ErrorState, Loading, Pagination, SelectField } from '@/components/common';
import api from '@/api';
import { useList } from '@/hooks/useApi';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';
import { dateMinute } from '@/utils/format';

/**
 * FEEDBACK, as a conversation.
 *
 * It used to be a form and a footnote: a member wrote once, and if an answer
 * came it appeared underneath. Anything else - a clarification, a follow-up,
 * a manager asking which model - meant opening a second enquiry with none of
 * the history that explained the first.
 *
 * THE EXCHANGE IS A DRAWER from the right, at every width, and the console's
 * queue opens the same one - so both halves of a conversation are read in the
 * same shape.
 *
 * It replaced a row that grew in place, which reflowed the list, pushed the
 * rows under it off the screen, and put the reply box wherever the
 * conversation happened to end. A drawer is the same size whatever thread is
 * in it, and closing it leaves the list where it was.
 *
 * A THREAD CAN BE REMOVED. Members open enquiries they then answer themselves,
 * and a list you cannot tidy is a list you stop reading. It is a soft delete -
 * it leaves the member's list and the support queue, and somebody with the
 * recycle bin can still recover it - behind a confirmation, because there is
 * no undo on this side of it.
 *
 * FOUR STATES, and the copy says what each one means for the reader rather
 * than repeating the code:
 *
 *   PENDING   we have it, nobody has answered yet
 *   REPLIED   answered, and back with them
 *   RESOLVED  either side said it was fixed
 *   FINISHED  nobody resolved it and it aged out after seven days
 */

const SOURCES = [
  { value: 'SMARTPHONE', label: 'Smartphones' },
  { value: 'EPRODUCT', label: 'Eproducts' },
  { value: 'ESHOP', label: 'Eshop' },
  { value: 'APPSTORE', label: 'Appstore' },
  { value: 'SMARTPHONE_REGISTER', label: 'Registering a phone' },
  { value: 'EPRODUCT_REGISTER', label: 'Registering an eproduct' },
  { value: 'CRYSTAL_APP', label: 'Crystal app' }
];

const STATE_COPY = {
  PENDING: { label: 'Waiting for us', scheme: 'orange' },
  REPLIED: { label: 'Answered', scheme: 'blue' },
  RESOLVED: { label: 'Resolved', scheme: 'green' },
  FINISHED: { label: 'Closed', scheme: 'gray' }
};

const labelOf = (list, value) => (list.filter((o) => o.value === value)[0] || {}).label || value;
const stateOf = (status) => STATE_COPY[status] || STATE_COPY.PENDING;

/**
 * THE TWO STATES A MEMBER CANNOT WRITE INTO.
 *
 * RESOLVED and FINISHED are both endings, and the page has to refuse both -
 * it used to refuse only RESOLVED. That left FINISHED offering a box, a Send
 * button and a Resolve button on a conversation that is over: the member
 * types out the rest of their problem and finds out afterwards, which is the
 * exact failure the resolved panel was written to avoid.
 *
 * Named rather than tested inline in four places, because the four have to
 * agree: the box, the two buttons beside it and the panel that replaces them
 * are one decision with four consequences.
 */
const CLOSED = ['RESOLVED', 'FINISHED'];

const isClosed = (status) => CLOSED.indexOf(status) !== -1;

export default function Feedback() {
  const t = useT();
  const surface = useSurface();
  const toast = useToast();

  const compose = useDisclosure();
  const detail = useDisclosure();
  const confirmDelete = useDisclosure();
  const confirmResolve = useDisclosure();
  const cancelRef = React.useRef();

  const [openId, setOpenId] = useState(null);
  const [thread, setThread] = useState(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    title: '', message: '', thread_source: 'SMARTPHONE'
  });

  const list = useList((params) => api.account.feedback(params), {
    initialParams: { page: 1, limit: 10 }
  });

  const openThread = useCallback(async (id) => {
    setOpenId(id);
    setThread(null);
    setDraft('');
    setLoadingThread(true);
    detail.onOpen();

    try {
      const { data } = await api.account.feedbackDetail(id);
      setThread(data);
      /*
       * Reading clears the unread mark, and THAT IS THE WHOLE CHANGE - so the
       * row is patched where it sits instead of the list being fetched again.
       *
       * `list.reload()` was doing this, and it re-requested ten rows to flip
       * one boolean on one of them. Worse, it raised `loading`, so the table
       * the member had just clicked dimmed and redrew underneath the drawer
       * sliding over it - two things moving at once, for a change to a dot.
       *
       * Nothing else about the row moved: the server does not count reading as
       * activity, so `updated_at` is untouched and the row does not re-sort.
       * There is nothing here the server could tell us that we do not know.
       */
      list.patchRow(id, { is_read: true });
    } catch (err) {
      toast({ status: 'error', description: err.message, duration: 6000 });
      detail.onClose();
    } finally {
      setLoadingThread(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = async (action) => {
    setBusy(true);
    try {
      await action();
      const { data } = await api.account.feedbackDetail(openId);
      setThread(data);
      setDraft('');
      list.reload();
    } catch (err) {
      toast({ status: 'error', description: err.message, duration: 7000 });
    } finally {
      setBusy(false);
    }
  };

  const send = () => {
    if (!draft.trim()) return;
    act(() => api.account.postFeedback(openId, draft.trim()));
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.account.removeFeedback(openId);
      confirmDelete.onClose();
      detail.onClose();
      setThread(null);
      setOpenId(null);
      list.reload();
      toast({ status: 'success', description: t('account.feedback.conversationRemoved'), duration: 4000 });
    } catch (err) {
      toast({ status: 'error', description: err.message, duration: 7000 });
    } finally {
      setBusy(false);
    }
  };

  const submitNew = async () => {
    if (!form.title.trim() || !form.message.trim()) return;

    setBusy(true);
    try {
      const { data } = await api.account.submitFeedback(form);
      compose.onClose();
      setForm({ title: '', message: '', thread_source: 'SMARTPHONE' });
      list.reload();
      openThread(data.id);
    } catch (err) {
      toast({ status: 'error', description: err.message, duration: 7000 });
    } finally {
      setBusy(false);
    }
  };

  const conversation = (
    <Conversation
      thread={thread}
      loading={loadingThread}
      draft={draft}
      busy={busy}
      surface={surface}
      onDraft={setDraft}
      onSend={send}
      /*
       * Both ask first. Resolving used to be one click because a message
       * reopened the thread; it no longer does, so resolving is as final
       * from here as removing is, and gets the same pause.
       */
      onResolve={confirmResolve.onOpen}
      onDelete={confirmDelete.onOpen}
    />
  );

  const rows = (
    <Stack spacing="3">
      {list.rows.map((row) => {
        const state = stateOf(row.status);
        const isSelected = openId === row.id;
        // Unread means WE wrote last and they have not looked.
        const unread = !row.is_read && row.last_type === 'MANAGER';

        return (
          <Flex
            key={row.id}
            as="button"
            w="100%"
            textAlign="left"
            align="flex-start"
            gap="4" data-gap="16"
            p={{ base: 4, md: 5 }}
            borderRadius="14px"
            bg={surface.card}
            border="1px solid"
            borderColor={isSelected ? 'brand.500' : surface.border}
            transition="border-color 160ms ease"
            _hover={{ borderColor: 'brand.500' }}
            onClick={() => openThread(row.id)}
          >
            <Box flex="1" minW="0">
              <Flex align="center" gap="2" data-gap="8" data-gap-wrap wrap="wrap">
                {unread && (
                  <Box w="8px" h="8px" borderRadius="full" bg="brand.500" flexShrink={0} />
                )}
                <Text fontWeight="700" color={surface.text} noOfLines={1}>
                  {row.title}
                </Text>
                <Badge colorScheme={state.scheme} borderRadius="6px" textTransform="none">
                  {t(state.label)}
                </Badge>
              </Flex>

              <Text fontSize="sm" color={surface.muted} noOfLines={1} mt="1">
                {row.last_type === 'MANAGER' ? t('account.feedback.crystal') : t('account.feedback.you')}
                {row.last_message}
              </Text>

              <Flex gap="3" data-gap="12" data-gap-wrap mt="2" wrap="wrap">
                <Text fontSize="xs" color={surface.muted}>
                  {t(labelOf(SOURCES, row.thread_source))}
                </Text>
                <Text fontSize="xs" color={surface.muted}>
                  {dateMinute(row.updated_at)}
                </Text>
                <Flex align="center" gap="1" data-gap="4">
                  <Box as={FiMessageSquare} color={surface.muted} />
                  <Text fontSize="xs" color={surface.muted}>{row.message_cnt}</Text>
                </Flex>
              </Flex>
            </Box>
          </Flex>
        );
      })}
    </Stack>
  );

  return (
    <Box>
      <Flex align="center" justify="space-between" gap="4" data-gap="16" data-gap-wrap mb="6" wrap="wrap">
        <Box>
          <Heading size="lg" color={surface.text}>{t('account.feedback.feedback')}</Heading>
          <Text color={surface.muted} fontSize="sm" mt="1">
            {t('account.feedback.askUsAnythingRepliesArrive')}
          </Text>
        </Box>
        <Button variant="brand" leftIcon={<FiPlus />} onClick={compose.onOpen}>
          {t('account.feedback.startAConversation')}
        </Button>
      </Flex>

      {list.error && <ErrorState message={list.error} onRetry={list.reload} />}
      {list.loading && <Loading variant="list" count={4} height="84px" />}

      {!list.loading && !list.error && list.rows.length === 0 && (
        <EmptyState
          title={t('account.feedback.nothingHereYet')}
          hint={t('account.feedback.anythingYouAskUsAppears')}
        />
      )}

      {!list.loading && list.rows.length > 0 && (
        <>
          {rows}
          <Pagination meta={list.meta} onPage={list.setPage} />
        </>
      )}

      {/*
        THE EXCHANGE, IN A DRAWER, at every width.
        =========================================

        It was a pane beside the list from `xl` up and a drawer below that -
        two arrangements of the same thing, which meant the page behaved
        differently depending on how wide the window happened to be, and the
        conversation was one width on a laptop and another on a monitor.

        One shape, and it is the drawer: the list keeps the full width of the
        page - which is what makes a long subject line readable - the reading
        column is the same size whatever opened it, and closing it leaves the
        list exactly where it was. The console's queue does the same, so the
        two halves of a conversation are read in the same shape on both sides.
      */}
      {/*
        * A STEP WIDER THAN A FORM DRAWER, not a full-height page.
        *
        * `md` (448px) is the right width for a panel of fields and too narrow
        * for prose: the bubbles are capped at 86% of the column, so every
        * other sentence wrapped. `lg` is 512px - enough to read a paragraph,
        * still clearly a drawer over the list rather than a screen of its own.
        *
        * One value, not a responsive pair: Chakra's drawer sizes are
        * max-widths, so a phone narrower than 512px already gets its full
        * width from this.
        */}
      <Drawer
        isOpen={detail.isOpen}
        onClose={detail.onClose}
        placement="right"
        size="lg"
      >
        <DrawerOverlay />
        <DrawerContent bg={surface.page}>
          <DrawerCloseButton />
          <DrawerHeader borderBottom="1px solid" borderColor={surface.border} pr="12">
            <Text fontSize="md" fontWeight="700" color={surface.text} noOfLines={2}>
              {thread ? thread.thread.title : t('account.feedback.conversation')}
            </Text>
          </DrawerHeader>
          <DrawerBody p="0">{conversation}</DrawerBody>
        </DrawerContent>
      </Drawer>

      {/* ----------------------------------------------- resolve, confirmed */}
      <AlertDialog
        isOpen={confirmResolve.isOpen}
        leastDestructiveRef={cancelRef}
        onClose={confirmResolve.onClose}
        isCentered
      >
        <AlertDialogOverlay>
          <AlertDialogContent mx="4">
            <AlertDialogHeader fontSize="lg" fontWeight="700">
              {t('account.feedback.markThisAsResolved')}
            </AlertDialogHeader>
            <AlertDialogBody fontSize="sm" color={surface.muted}>
              {t('account.feedback.resolvingClosesItForGood')}
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button ref={cancelRef} variant="quiet" onClick={confirmResolve.onClose}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="brand"
                ml="3"
                isLoading={busy}
                onClick={() => {
                  confirmResolve.onClose();
                  act(() => api.account.closeFeedback(openId));
                }}
              >
                {t('account.feedback.thisIsResolved')}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>

      {/* ------------------------------------------------ delete, confirmed */}
      <AlertDialog
        isOpen={confirmDelete.isOpen}
        leastDestructiveRef={cancelRef}
        onClose={confirmDelete.onClose}
        isCentered
      >
        <AlertDialogOverlay>
          <AlertDialogContent mx="4">
            <AlertDialogHeader fontSize="lg" fontWeight="700">
              {t('account.feedback.removeThisConversation')}
            </AlertDialogHeader>
            <AlertDialogBody fontSize="sm" color={surface.muted}>
              {t('account.feedback.itLeavesYourListAnd')}
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button ref={cancelRef} variant="quiet" onClick={confirmDelete.onClose}>
                {t('common.cancel')}
              </Button>
              <Button colorScheme="red" ml="3" isLoading={busy} onClick={remove}>
                {t('common.remove')}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>

      {/* --------------------------------------------------- a new thread */}
      <Modal isOpen={compose.isOpen} onClose={compose.onClose} size="lg" isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t('account.feedback.startAConversation')}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing="4">
              <Box>
                <Text fontSize="sm" color={surface.muted} mb="1">{t('common.subject')}</Text>
                <Input
                  value={form.title}
                  placeholder={t('account.feedback.whatIsThisAbout')}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                />
              </Box>

              <Box>
                {/* Where it came from decides who answers it, so it is asked
                    rather than guessed. */}
                <Text fontSize="sm" color={surface.muted} mb="1">{t('common.thisIsAbout')}</Text>
                <SelectField
                  value={form.thread_source}
                  options={SOURCES}
                  onChange={(value) => setForm({ ...form, thread_source: value })}
                />
              </Box>

              <Box>
                <Text fontSize="sm" color={surface.muted} mb="1">{t('account.feedback.message')}</Text>
                <Textarea
                  rows={6}
                  value={form.message}
                  placeholder={t('account.feedback.tellUsWhatHappened')}
                  onChange={(event) => setForm({ ...form, message: event.target.value })}
                />
              </Box>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button variant="quiet" mr="3" onClick={compose.onClose}>{t('common.cancel')}</Button>
            <Button
              variant="brand"
              isLoading={busy}
              isDisabled={!form.title.trim() || !form.message.trim()}
              onClick={submitNew}
            >
              {t('account.feedback.send')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}

/**
 * ONE EXCHANGE, and the box to add to it.
 *
 * Written once and mounted in whichever container the viewport called for -
 * the pane on a wide screen, the drawer on a narrow one. Two copies of a
 * message chain is how the two slowly stop behaving the same way.
 */
/*
 * Exported for feedbackComposer.test.js, which asserts the keyboard
 * contract - Enter breaks a line, ctrl+Enter sends - directly rather than
 * through the drawer that happens to contain it.
 */
export function Conversation({
  thread, loading, draft, busy, surface, onDraft, onSend, onResolve, onDelete
}) {
  const t = useT();

  /**
   * THE NEWEST MESSAGE IS THE ONE WORTH SEEING.
   *
   * A thread opens at the top and a reply lands at the bottom, so without
   * this the message you just sent is off screen and the drawer looks as
   * though nothing happened.
   *
   * Keyed on the thread AND the message count: opening a different thread of
   * the same length has to scroll too, and sending is exactly the case where
   * the count changes and the id does not.
   *
   * Declared above the early returns below - a hook that runs only sometimes
   * is a hook that runs in a different order between renders.
   */
  const listRef = React.useRef(null);
  const threadId = thread ? thread.thread.id : null;
  const messageCount = thread ? thread.messages.length : 0;

  React.useEffect(() => {
    /*
     * SCROLLED MORE THAN ONCE, because the height it is scrolling to keeps
     * changing after the effect runs.
     *
     * An effect fires as soon as React has committed the DOM, which is before
     * the browser has finished with it: the drawer is still animating in, and
     * a web font that arrives a moment later re-flows every bubble and makes
     * the content taller than it was when we measured. Scrolling once lands
     * near the bottom and then the bottom moves.
     *
     * So it repeats over the next few frames. Each one is a no-op if nothing
     * moved - assigning the same scrollTop does not scroll - and they stop
     * before anybody could have scrolled up on purpose.
     */
    let frame = null;
    let left = 4;

    const toBottom = () => {
      const box = listRef.current;
      if (!box) return;

      box.scrollTop = box.scrollHeight;

      left -= 1;
      if (left > 0) frame = window.requestAnimationFrame(toBottom);
    };

    toBottom();

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [threadId, messageCount]);

  if (!thread && !loading) {
    return (
      <Box px="6" py="10">
        <Text fontSize="sm" color={surface.muted} textAlign="center">
          {t('account.feedback.pickAConversationToRead')}
        </Text>
      </Box>
    );
  }

  if (loading || !thread) {
    return (
      <Box px={{ base: 4, md: 5 }} py="4">
        <Loading variant="list" count={3} height="64px" />
      </Box>
    );
  }

  const state = stateOf(thread.thread.status);

  return (
    <Box display="flex" flexDirection="column" h="100%">
      <Box
        px={{ base: 4, md: 5 }}
        py="4"
        borderBottom="1px solid"
        borderColor={surface.border}
        flexShrink={0}
      >
        <Text fontWeight="700" color={surface.text} noOfLines={2}>
          {thread.thread.title}
        </Text>
        <Flex align="center" gap="2" data-gap="8" data-gap-wrap mt="2" wrap="wrap">
          <Badge colorScheme={state.scheme} borderRadius="6px" textTransform="none">
            {t(state.label)}
          </Badge>
          <Text fontSize="xs" color={surface.muted}>
            {t(labelOf(SOURCES, thread.thread.thread_source))}
          </Text>
        </Flex>
      </Box>

      <Stack ref={listRef} spacing="3" px={{ base: 4, md: 5 }} py="4" overflowY="auto" flex="1">
        {thread.messages.map((message) => {
          const fromUs = message.action_type === 'MANAGER';

          return (
            <Flex key={message.id} justify={fromUs ? 'flex-start' : 'flex-end'}>
              <Box
                maxW="86%"
                bg={fromUs ? surface.raised : 'brand.500'}
                color={fromUs ? surface.text : 'white'}
                borderRadius="14px"
                px="4"
                py="3"
              >
                <Text fontSize="xs" opacity={0.75} mb="1">
                  {fromUs ? (message.author_name || t('common.crystal')) : t('account.feedback.you2')}
                  {' · '}
                  {dateMinute(message.action_at)}
                </Text>
                <Text fontSize="sm" whiteSpace="pre-wrap">
                  {message.message}
                </Text>
              </Box>
            </Flex>
          );
        })}
      </Stack>

      <Box
        px={{ base: 4, md: 5 }}
        py="4"
        borderTop="1px solid"
        borderColor={surface.border}
        flexShrink={0}
      >
        {/*
          A CLOSED THREAD SAYS SO, INSTEAD of offering a box.

          The box used to be offered whatever the state, on the grounds that
          writing reopened the thread - it does not now, so a box here would
          take a message the member had typed out and then lose it to an
          error. Saying what to do next is the point of the panel: the rule is
          useless to somebody who does not know where their new enquiry goes.

          BOTH ENDINGS, not just the one. RESOLVED is somebody saying the
          problem is fixed; FINISHED is the housekeeping sweep giving up on a
          thread nobody answered for seven days. They got there differently
          and they are the same thing to the member: an enquiry that is over.
          Only RESOLVED was being refused here, so a FINISHED thread still
          showed a Send button.
        */}
        {isClosed(thread.thread.status) ? (
          <Box
            px="4"
            py="3"
            borderRadius="12px"
            bg={surface.raised}
            textAlign="center"
          >
            {/*
              * WHY it is closed, because the two endings are not the same
              * news. "Somebody marked this fixed" is an answer; "nobody
              * replied for a week and it timed out" is a member finding out
              * they were not forgotten so much as dropped, and telling them
              * the first when the second happened is worse than saying
              * nothing. The second line - where a new enquiry goes - is the
              * same either way, and is the whole point of the panel.
              */}
            <Text fontSize="sm" color={surface.text} fontWeight="600">
              {thread.thread.status === 'FINISHED'
                ? t('account.feedback.thisEnquiryTimedOut')
                : t('account.feedback.thisEnquiryIsClosed')}
            </Text>
            <Text fontSize="xs" color={surface.muted} mt="1">
              {t('account.feedback.openANewEnquiry')}
            </Text>
          </Box>
        ) : (
        <Textarea
          rows={3}
          bg={surface.card}
          placeholder={t('account.feedback.addToThisConversation')}
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          /*
           * CTRL+ENTER SENDS; Enter alone still makes a paragraph.
           *
           * A support message is often several lines - what happened, what
           * was expected, what the device is - so Enter has to keep breaking
           * lines. The modifier is what turns it into an action.
           *
           * The same guards as the button: nothing is sent while a request is
           * in flight, and an empty box is not a message.
           */
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            if (!event.ctrlKey && !event.metaKey) return;

            event.preventDefault();
            if (busy || !draft.trim()) return;
            onSend();
          }}
        />
        )}

        <Flex justify="space-between" align="center" gap="2" data-gap="8" mt="3">
          {/*
            Delete sits apart from the two actions that carry the conversation
            forward, and is an icon rather than a word: it is the one control
            here that cannot be undone from this side.

            IT OUTLIVES THE OTHER TWO. A closed thread can still be removed -
            tidying a list of finished enquiries is exactly when somebody
            reaches for it.
          */}
          <IconButton
            aria-label={t('account.feedback.removeThisConversation2')}
            icon={<FiTrash2 />}
            variant="ghost"
            color="red.400"
            isDisabled={busy}
            onClick={onDelete}
          />

          {/* Neither ending can be written into, so neither offers the two
              controls that carry a conversation forward. */}
          {!isClosed(thread.thread.status) && (
            <Flex gap="2" data-gap="8">
              <Button variant="quiet" isDisabled={busy} onClick={onResolve}>
                {t('account.feedback.thisIsResolved')}
              </Button>
              <Button variant="brand" isLoading={busy} isDisabled={!draft.trim()} onClick={onSend}>
                {t('account.feedback.send')}
              </Button>
            </Flex>
          )}
        </Flex>
      </Box>
    </Box>
  );
}
