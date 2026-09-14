import React, { useCallback, useEffect, useState } from 'react';
import {
  Badge, Box, Button, Drawer, DrawerBody, DrawerCloseButton, DrawerContent,
  DrawerFooter, DrawerHeader, DrawerOverlay, Flex, SimpleGrid, Spinner, Stack,
  Text, Textarea, useColorModeValue, useDisclosure, useToast
} from '@chakra-ui/react';

import Card from '../../components/Card';
import StatusBadge from '../../components/StatusBadge';
import SelectField from '../../components/SelectField';
import SearchBar from '../../components/SearchBar';
import Pagination from '../../components/Pagination';
import { useConfirm } from '../../components/ConfirmDialog';
import useList from '../../hooks/useList';
import usePermission from '../../hooks/usePermission';
import { members } from '../../api';
import { useT } from '../../i18n';
import { dateTime } from '../../utils/format';
import { useSurface } from '../../theme/tokens';

export const PAGE = '/admin/members/feedback';

/**
 * THE FEEDBACK QUEUE, and it is a conversation rather than a form.
 *
 * THE QUEUE HAS THE PAGE, and the exchange opens in a DRAWER over it. Side by
 * side is the right shape for a mail client with a window to itself; this
 * screen sits inside a console that already spends its width on a sidebar and
 * a navbar, so half of what was left was a 300px reading column - and the
 * queue needed the other half for itself. The member centre opens the same
 * drawer, so both halves of a conversation are read in the same shape.
 *
 * Picking a thread marks it read; answering it moves it to REPLIED and makes
 * whoever answered its owner.
 *
 * THE QUEUE IS CARDS, NOT A TABLE, and that is the whole point of this screen.
 * A table gave one clipped line of the message, which is the one column
 * somebody triaging actually reads - and the ellipsis fell in the middle of
 * the sentence that said what the problem was. Each row now carries the
 * subject, who it is from, where it came from, its state, and AS MUCH OF THE
 * LAST MESSAGE AS FITS IN A FIXED HEIGHT - scrolling inside the row when there
 * is more. Every row is the same height whatever it holds, so the list is
 * still scannable, and a long message is readable without opening it.
 *
 * OPENING A THREAD DOES NOT MOVE IT. It used to: marking a thread read is an
 * UPDATE, `updated_at` is what the queue is sorted by, so clicking a row sent
 * it to the top and reshuffled the list under the reader. That is fixed at the
 * source - see the trigger on feedback_threads - and this screen no longer
 * refetches the page either, it patches the one row whose dot went out.
 *
 * THE DEFAULT FILTER IS "WAITING ON US", not "everything". A queue that opens
 * on all two hundred threads is a list; a queue that opens on the eleven
 * somebody has to answer today is a job.
 */

const STATUSES = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'REPLIED', label: 'Replied' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'FINISHED', label: 'Finished' }
];

const SOURCES = [
  { value: 'SMARTPHONE', label: 'Smartphones' },
  { value: 'EPRODUCT', label: 'Eproducts' },
  { value: 'ESHOP', label: 'Eshop' },
  { value: 'APPSTORE', label: 'Appstore' },
  { value: 'SMARTPHONE_REGISTER', label: 'Smartphone registration' },
  { value: 'EPRODUCT_REGISTER', label: 'Eproduct registration' },
  { value: 'CRYSTAL_APP', label: 'Crystal app' }
];

/**
 * A colour per origin, so a queue of mixed sources is sortable by eye.
 *
 * The two registration flows share the colour of the section they belong to:
 * they are the same team's work, arriving from a different moment in it.
 */
const SOURCE_SCHEME = {
  SMARTPHONE: 'blue',
  SMARTPHONE_REGISTER: 'blue',
  EPRODUCT: 'purple',
  EPRODUCT_REGISTER: 'purple',
  ESHOP: 'green',
  APPSTORE: 'pink',
  CRYSTAL_APP: 'orange'
};

const labelOf = (list, value) => (list.filter((o) => o.value === value)[0] || {}).label || value;

export default function Feedback() {
  const t = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const surface = useSurface();
  const { canWrite } = usePermission(PAGE);

  const detail = useDisclosure();

  const [selected, setSelected] = useState(null);
  const [thread, setThread] = useState(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState(null);
  const [typed, setTyped] = useState('');

  const list = useList((query) => members.feedback(query), {
    page: 1, limit: 20, sort: 'updated_at', dir: 'desc',
    // The queue somebody has to work, not the archive.
    waiting: 1
  });

  const loadCounts = useCallback(async () => {
    try {
      const { data } = await members.feedbackCounts();
      setCounts(data);
    } catch (e) { /* the counters are a nicety, not the screen */ }
  }, []);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  const patchRow = list.patchRow;

  const openThread = useCallback(async (id) => {
    setSelected(id);
    setLoadingThread(true);
    setDraft('');
    setThread(null);
    detail.onOpen();
    try {
      const { data } = await members.feedbackDetail(id);
      setThread(data);

      /*
       * Opening it marks it read, and the only thing on screen that changes is
       * this row's unread dot. Reloading the page for that would refetch
       * twenty rows to change one boolean - and, before the trigger was fixed,
       * would have reordered the queue while the reader was looking at it.
       */
      patchRow(id, { is_read: true });
      loadCounts();
    } catch (err) {
      toast({ status: 'error', description: err.message, duration: 6000 });
    } finally {
      setLoadingThread(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patchRow]);

  const act = async (action) => {
    setBusy(true);
    try {
      await action();
      const { data } = await members.feedbackDetail(selected);
      setThread(data);
      setDraft('');
      // A reply DOES change the queue - the state, the preview and the order
      // all move with it - so this one is a real reload.
      list.reload();
      loadCounts();
    } catch (err) {
      toast({ status: 'error', description: err.message, duration: 7000 });
    } finally {
      setBusy(false);
    }
  };

  const send = () => {
    if (!draft.trim()) return;
    act(() => members.reply(selected, draft.trim()));
  };

  const resolve = () => act(() => members.resolveFeedback(selected));

  const remove = async () => {
    const agreed = await confirm({
      tone: 'danger',
      title: t('common.delete'),
      body: t('members.feedback.theThreadIsMovedTo'),
      detail: thread && thread.thread.title,
      confirmLabel: t('common.delete')
    });
    if (!agreed) return;

    await act(() => members.removeFeedback(selected));
    detail.onClose();
    setSelected(null);
    setThread(null);
  };

  return (
    <Box>
      {counts && (
        <SimpleGrid columns={{ base: 2, md: 5 }} spacing={3} mb={4}>
          {[
            { key: 'OPEN', label: 'Needs an answer' },
            { key: 'PENDING', label: 'Pending' },
            { key: 'REPLIED', label: 'Replied' },
            { key: 'RESOLVED', label: 'Resolved' },
            { key: 'FINISHED', label: 'Finished' }
          ].map((tile) => (
            <Card key={tile.key}>
              <Text fontSize="0.66rem" color="gray.500" textTransform="uppercase" letterSpacing="0.06em">
                {t(tile.label)}
              </Text>
              <Text fontSize="xl" fontWeight="700" mt="2px">{counts[tile.key]}</Text>
            </Card>
          ))}
        </SimpleGrid>
      )}

      <SimpleGrid columns={1} spacing={4}>
        <Card bodyProps={false}>
          <Flex px="1.125rem" pt="1rem" pb="0.75rem" gap="0.5rem" data-gap="8" data-gap-wrap wrap="wrap" align="center">
            <SearchBar
              placeholder={t('common.search')}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onSubmit={() => list.setFilter({ q: typed })}
              w={{ base: '100%', md: '11.875rem' }}
            />
            <Box w="9.375rem">
              <SelectField
                size="sm"
                placeholder={t('members.feedback.anyState')}
                value={list.params.status || null}
                options={STATUSES}
                onChange={(v) => list.setFilter({ status: v || undefined, waiting: undefined })}
              />
            </Box>
            <Box w="10.625rem">
              <SelectField
                size="sm"
                placeholder={t('members.feedback.anyOrigin')}
                value={list.params.thread_source || null}
                options={SOURCES}
                onChange={(v) => list.setFilter({ thread_source: v || undefined })}
              />
            </Box>
            <Button
              size="sm" h="2.25rem"
              variant={list.params.waiting ? 'brand' : 'subtle'}
              onClick={() => list.setFilter({
                waiting: list.params.waiting ? undefined : 1,
                status: undefined
              })}
            >
              {t('members.feedback.waitingOnUs')}
            </Button>
          </Flex>

          <Box px="1.125rem" pb="0.5rem">
            {list.loading && !list.rows.length ? (
              <Flex justify="center" py="3.75rem"><Spinner color="brand.500" thickness="3px" /></Flex>
            ) : !list.rows.length ? (
              <Text fontSize="sm" color="gray.500" py="2.5rem" textAlign="center">
                {t('table.empty')}
              </Text>
            ) : (
              /* Two columns once there is room for two: a row is a fixed
                 height card, so a wide screen should fit twice as many of
                 them rather than twice as much white space. */
              <SimpleGrid
                columns={{ base: 1, '2xl': 2 }}
                spacing="0.5rem"
                maxH="38.75rem"
                overflowY="auto"
                pr="0.25rem"
              >
                {list.rows.map((row) => (
                  <QueueRow
                    key={row.id}
                    row={row}
                    surface={surface}
                    isSelected={String(selected) === String(row.id)}
                    onOpen={() => openThread(row.id)}
                  />
                ))}
              </SimpleGrid>
            )}

            <Pagination
              page={list.params.page}
              limit={list.params.limit}
              total={list.total}
              onPageChange={list.setPage}
              onLimitChange={(limit) => list.setFilter({ limit })}
            />
          </Box>
        </Card>

      </SimpleGrid>

      {/*
        THE EXCHANGE, IN A DRAWER.
        =========================

        It was a card beside the queue. Side by side is the right shape for a
        mail client with a window to itself; this screen sits inside a console
        with a sidebar and a navbar already taking their share, so half of
        what was left was a 300px reading column - and the queue, which now
        carries a scrolling message preview per row, had the other half and
        needed all of it.

        A drawer gives the queue the full width and the conversation a fixed
        one, and the storefront's member centre opens the same drawer - so
        both halves of a conversation are read in the same shape.
      */}
      {/*
        * A STEP WIDER THAN A FORM DRAWER, not a full-height page.
        *
        * `md` (448px) is the right width for a panel of fields and too narrow
        * for prose: the bubbles are capped at 82% of the column, so every
        * other sentence wrapped. `lg` is 512px - enough to read a paragraph,
        * still clearly a drawer over the queue rather than a screen of its own.
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
          <DrawerHeader borderBottomWidth="1px" borderColor={surface.border} pr="12">
            <Text fontSize="sm" fontWeight="700" noOfLines={2}>
              {thread ? thread.thread.title : t('members.feedback.feedback')}
            </Text>
            {thread && (
              <Flex align="center" gap="0.5rem" data-gap="8" data-gap-wrap mt="0.5rem" wrap="wrap">
                <StatusBadge value={thread.thread.status} />
                <Text fontSize="xs" fontWeight="400" color="gray.500">
                  {thread.thread.member_nickname}
                  {' - '}
                  {t(labelOf(SOURCES, thread.thread.thread_source))}
                </Text>
              </Flex>
            )}
          </DrawerHeader>

          {/*
            * A COLUMN THAT DOES NOT SCROLL ITSELF.
            *
            * The scrolling belongs to the message list inside it, so the
            * owner line stays put while the conversation moves under it. That
            * needs the body to be a flex column with its own overflow hidden -
            * otherwise there are two scroll containers and the outer one wins.
            */}
          <DrawerBody
            px="1.125rem"
            py="0.875rem"
            display="flex"
            flexDirection="column"
            overflow="hidden"
          >
            {loadingThread || !thread ? (
              <Flex justify="center" py="10"><Spinner color="brand.500" /></Flex>
            ) : (
              <>
                {thread.thread.manager_name && (
                  <Text fontSize="xs" color="gray.500" mb="0.625rem" flexShrink={0}>
                    {t('members.feedback.ownedBy')} {thread.thread.manager_name}
                  </Text>
                )}
                <Chain messages={thread.messages} surface={surface} />
              </>
            )}
          </DrawerBody>

          {thread && canWrite && (
            <DrawerFooter
              borderTopWidth="1px"
              borderColor={surface.border}
              display="block"
              px="1.125rem"
              py="0.875rem"
            >
              {/*
                A RESOLVED THREAD TAKES NO MORE MESSAGES, from this side
                either. The server refuses the post, so offering the box would
                mean a manager writing an answer and losing it to an error -
                and a member who was told the enquiry was closed would find it
                live again on the strength of it.
              */}
              {thread.thread.status === 'RESOLVED' ? (
                <Text fontSize="sm" color={surface.muted}>
                  {t('members.feedback.resolvedTakesNoReplies')}
                </Text>
              ) : (
                <Textarea
                  rows={3}
                  fontSize="sm"
                  placeholder={t('members.feedback.writeAReply')}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
              )}
              <Flex justify="space-between" align="center" mt="0.625rem" gap="0.5rem" data-gap="8">
                <Flex gap="0.5rem" data-gap="8">
                  {thread.thread.status !== 'RESOLVED' && (
                    <Button size="sm" onClick={resolve} isDisabled={busy}>
                      {t('members.feedback.markResolved')}
                    </Button>
                  )}
                  {/* Removing a thread outlives answering it - a closed queue
                      is exactly what somebody tidies. */}
                  <Button
                    size="sm" variant="quiet" color="red.400"
                    onClick={remove} isDisabled={busy}
                  >
                    {t('common.delete')}
                  </Button>
                </Flex>
                {thread.thread.status !== 'RESOLVED' && (
                  <Button
                    size="sm" colorScheme="brand"
                    onClick={send} isLoading={busy} isDisabled={!draft.trim()}
                  >
                    {t('members.feedback.send')}
                  </Button>
                )}
              </Flex>
              {/* What answering does - so it goes where answering is offered. */}
              {thread.thread.status !== 'RESOLVED' && (
                <Text fontSize="xs" color="gray.500" mt="0.5rem">
                  {t('members.feedback.answeringMovesTheThreadTo')}
                </Text>
              )}
            </DrawerFooter>
          )}
        </DrawerContent>
      </Drawer>
    </Box>
  );
}

/**
 * ONE THREAD IN THE QUEUE, at a glance.
 *
 * Everything a manager needs to decide whether to open it: whether anyone has
 * looked at it, what it is about, who from, which team it belongs to, what
 * state it is in, when it last moved - and the message itself.
 *
 * THE MESSAGE HAS ITS OWN SCROLLBAR. Enquiries are not one line: somebody
 * describing a fault writes a paragraph, and clipping it to one line with an
 * ellipsis hid exactly the sentence that said what went wrong. A fixed height
 * keeps every row the same size so the list is still scannable; the overflow
 * scrolls inside the row, so a long message can be read without opening it and
 * without pushing the next twelve rows off the screen.
 */
function QueueRow({ row, surface, isSelected, onOpen }) {
  const t = useT();
  const previewBg = useColorModeValue('secondaryGray.300', 'navy.900');

  // Unread means the MEMBER wrote last and nobody has opened it - which is
  // exactly the row a manager is looking for.
  const unread = !row.is_read && row.last_type === 'MEMBER';

  return (
    <Box
      as="button"
      type="button"
      w="100%"
      textAlign="left"
      p="0.75rem"
      borderRadius="0.75rem"
      borderWidth="1px"
      borderColor={isSelected ? 'brand.500' : surface.border}
      bg={isSelected ? surface.hover : surface.card}
      transition="border-color .15s ease, background .15s ease"
      _hover={{ borderColor: 'brand.500' }}
      onClick={onOpen}
    >
      <Flex align="center" gap="0.5rem" data-gap="8" mb="0.375rem">
        {unread && <Box w="0.4375rem" h="0.4375rem" borderRadius="full" bg="brand.500" flexShrink={0} />}
        <Text
          fontSize="sm"
          fontWeight={unread ? '700' : '600'}
          color={surface.text}
          noOfLines={1}
          flex="1"
          minW="0"
        >
          {row.title}
        </Text>
        <StatusBadge value={row.status} />
      </Flex>

      <Flex align="center" gap="0.5rem" data-gap="8" data-gap-wrap mb="0.5rem" wrap="wrap">
        <Badge
          colorScheme={SOURCE_SCHEME[row.thread_source] || 'gray'}
          borderRadius="0.375rem"
          fontSize="0.625rem"
          textTransform="none"
        >
          {t(labelOf(SOURCES, row.thread_source))}
        </Badge>
        <Text fontSize="xs" color="gray.500">{row.member_nickname}</Text>
        <Box flex="1" />
        <Text fontSize="0.65rem" color="gray.500">{dateTime(row.updated_at)}</Text>
      </Flex>

      {/*
        The message, in full, in a box of its own. `cursor: text` because it
        scrolls and is meant to be read in place - the row around it is the
        button.
      */}
      <Box
        bg={previewBg}
        borderRadius="0.5rem"
        px="0.625rem"
        py="0.5rem"
        h="4rem"
        overflowY="auto"
        cursor="text"
        onClick={(event) => event.stopPropagation()}
      >
        <Text fontSize="xs" color={surface.text} whiteSpace="pre-wrap">
          {row.last_type === 'MANAGER' && (
            <Text as="span" fontWeight="700" color="gray.500">{t('members.feedback.you')}</Text>
          )}
          {row.last_message}
        </Text>
      </Box>

      <Flex align="center" gap="0.375rem" data-gap="6" mt="0.375rem">
        <Text fontSize="0.65rem" color="gray.500">
          {t('members.feedback.messages', { count: row.message_cnt })}
        </Text>
      </Flex>
    </Box>
  );
}

/**
 * The exchange, oldest first.
 *
 * A conversation reads downwards, and the two sides are told apart by which
 * edge they sit against rather than by a label on every line - the same
 * convention every messaging tool uses, because it survives being skimmed.
 */
function Chain({ messages, surface }) {
  const t = useT();
  const mine = useColorModeValue('brand.50', 'navy.700');
  const theirs = useColorModeValue('secondaryGray.300', 'navy.600');

  if (!messages.length) {
    return <Text fontSize="sm" color="gray.500">{t('table.emptyBrief')}</Text>;
  }

  /*
   * FILLS THE SPACE ABOVE THE COMPOSER, rather than stopping at a number.
   *
   * This was `maxH="26.25rem"`, which is a guess about how tall a drawer is. On
   * anything taller it left a band of empty drawer under the last message and
   * scrolled inside 420px anyway; on anything shorter it pushed at the
   * footer. `flex: 1` takes exactly what the header and the composer leave.
   *
   * `minH: 0` is written out rather than relied upon. A flex child defaults
   * to min-height:auto and refuses to shrink below its content - the reason
   * this one does anyway is that `overflow-y: auto` resolves that auto to
   * zero. Saying it makes the layout survive somebody removing the overflow.
   */
  return (
    <Stack spacing={3} flex="1" minH="0" overflowY="auto" pr="0.25rem">
      {messages.map((message) => {
        const fromUs = message.action_type === 'MANAGER';

        return (
          <Flex key={message.id} justify={fromUs ? 'flex-end' : 'flex-start'}>
            <Box
              maxW="82%"
              bg={fromUs ? mine : theirs}
              borderRadius="0.75rem"
              px="0.75rem"
              py="0.625rem"
            >
              <Flex align="baseline" gap="0.5rem" data-gap="8" mb="0.25rem">
                <Text fontSize="0.65rem" fontWeight="700" color={surface.text}>
                  {message.author_name || (fromUs ? t('common.crystal') : t('members.feedback.member'))}
                </Text>
                <Text fontSize="0.6rem" color="gray.500">{dateTime(message.action_at)}</Text>
              </Flex>
              <Text fontSize="sm" whiteSpace="pre-wrap" color={surface.text}>
                {message.message}
              </Text>
            </Box>
          </Flex>
        );
      })}
    </Stack>
  );
}
