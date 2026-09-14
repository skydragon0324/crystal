import React, { useEffect, useState } from 'react';
import {
  Accordion, AccordionButton, AccordionItem, AccordionPanel, Box, Button, Checkbox,
  Flex, Icon, Modal, ModalBody, ModalCloseButton, ModalContent, ModalFooter,
  ModalHeader, ModalOverlay, Stack, Text, useBreakpointValue
} from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';
import { FiBell } from 'react-icons/fi';
import { useDispatch, useSelector } from 'react-redux';

import { NoticeBody, NoticeWhen, OriginBadge } from '@/components/notices/NoticeContent';
import { loadNotices, selectGreetingNotices, selectNoticeStatus, silence } from '@/app/noticeSlice';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * THE NOTICES A VISITOR IS GREETED WITH, all of them, in one dialog.
 *
 * TWO SHAPES, ONE FOR EACH SIZE OF SCREEN, because the same content wants a
 * different arrangement at each:
 *
 *   ON A DESKTOP it is a wide master-detail. The titles, origins and dates
 *   stack down the left; the one that is selected is read on the right.
 *   Moving between them costs one click, and the reading column keeps its
 *   width whatever is in it.
 *
 *   ON A PHONE it is an accordion, because there is no room for two columns
 *   and a 160px list beside a 160px body helps nobody. One open at a time,
 *   the first one open, and the modal scrolls.
 *
 * EVERY LIVE NOTICE IS HERE. There was a limit of six with a "see all" link
 * beneath it, which meant the greeting could show part of the day and then
 * send the reader elsewhere for the rest - a link only ever offered to
 * somebody who cannot see what it is offering. Both shapes scroll, so a long
 * day costs a scroll rather than a page.
 *
 * IT IS DISMISSED PER DAY, ONCE, FOR ALL OF THEM. "Do not remind me today" is
 * one tick in the footer rather than one per notice: the question is "stop
 * greeting me today", which is a decision about the dialog and not six
 * decisions about its contents. It silences every notice on screen, so it
 * cannot half-apply and return an hour later with whatever was not opened.
 * Dismissing hides the DIALOG and nothing else - the notices are still on
 * /notifications, because putting down a greeting is not deleting an
 * announcement.
 *
 * IT CAN ALWAYS BE PUT DOWN. There used to be a per-notice `dismissible`
 * flag, and one notice with it off locked the whole dialog for all of them -
 * no overlay click, no Escape, no checkbox, for the ordinary greetings
 * beside it. A visitor who cannot close a modal does not read it more
 * carefully; they learn to click Got it faster. Anything that genuinely must
 * be read is a page, not a modal somebody has to escape.
 *
 * IT WAITS A MOMENT. Firing a modal into a page that is still painting is how
 * a visitor dismisses something they never saw.
 */

/** How long after arrival the dialog appears. */
const APPEAR_AFTER_MS = 900;

export default function NoticeDialog() {
  const t = useT();
  const surface = useSurface();
  const dispatch = useDispatch();

  const status = useSelector(selectNoticeStatus);
  const greeting = useSelector(selectGreetingNotices);

  /*
   * `useBreakpointValue` rather than a CSS-only split, because the two shapes
   * are different COMPONENTS - an accordion and a two-pane - not one component
   * with different padding. Rendering both and hiding one would mount every
   * notice body twice.
   */
  const twoPane = useBreakpointValue({ base: false, md: true });

  const [open, setOpen] = useState(false);

  /*
   * The list is FROZEN when the dialog opens rather than read live: ticking
   * "do not remind me today" removes notices from `greeting`, and a list
   * re-derived from that would empty itself under the reader.
   */
  const [shown, setShown] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [silenceAll, setSilenceAll] = useState(false);

  useEffect(() => {
    dispatch(loadNotices());
  }, [dispatch]);

  useEffect(() => {
    if (status !== 'ready' || shown !== null) return undefined;
    if (!greeting.length) return undefined;

    const timer = setTimeout(() => {
      /*
       * EVERY LIVE NOTICE, not a first handful.
       *
       * There used to be a limit of six with a "see all" link under it,
       * which meant the dialog could show a visitor part of the day and
       * then ask them to go somewhere else for the rest. The list column
       * scrolls, so a long day costs a scroll rather than a page.
       */
      const queue = greeting.slice();
      setShown(queue);
      // The top one is open on arrival: a list of headings has told nobody
      // anything, and the top one is what the editors ranked first.
      setSelectedId(queue[0].id);
      setOpen(true);
    }, APPEAR_AFTER_MS);

    return () => clearTimeout(timer);
    // `greeting` is a fresh array each render; the guard above is what stops
    // this re-running, so it is deliberately not in the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, shown]);

  if (!shown || !shown.length) return null;

  const selected = shown.filter((notice) => notice.id === selectedId)[0] || shown[0];

  const close = () => {
    /* One choice, for the day, made once - see noticeSlice. */
    if (silenceAll) dispatch(silence());
    setOpen(false);
  };

  return (
    <Modal
      isOpen={open}
      onClose={close}
      isCentered
      /* Wide enough for two columns to each be worth having. */
      size={twoPane ? '4xl' : 'lg'}
      scrollBehavior="inside"
      /*
       * Chakra's own entrance is off, not layered under ours: its scale
       * preset animates the same element on the same frames, and two
       * transforms on one node means whichever renders last wins.
       */
      motionPreset="none"
      closeOnOverlayClick
      closeOnEsc
    >
      <ModalOverlay bg="blackAlpha.700" />

      {/*
        * A TRANSPARENT SHELL AROUND THE DEVICE.
        *
        * The keys have to stand PROUD of the body to read as buttons rather
        * than as marks printed on it, and anything inside the body is cut off
        * by the clip-path that does the unfolding. So the modal's own box
        * carries no colour and does not clip: it is just the space the device
        * and its hardware sit in.
        *
        * Chakra's entrance is turned off rather than layered under ours - its
        * scale preset animates the same element on the same frames, and two
        * transforms on one node means whichever renders last wins.
        */}
      <ModalContent
        position="relative"
        mx="4"
        bg="transparent"
        boxShadow="none"
        overflow="visible"
        maxH={{ base: '86vh', md: '80vh' }}
      >
        {/*
          * The frame hardware, on the edge a phone keeps it: volume up,
          * volume down, and power below them.
          *
          * A SIBLING of the panel, not a child. The panel clips - that is
          * what does the unfolding - so a key inside it would be sheared
          * off at exactly the edge it is meant to stand proud of. Out here
          * the overlay shows between and around them, which is what makes
          * them read as buttons on a case rather than stripes printed on
          * one. They are drawn in the case colour for the same reason.
          */}
        {twoPane && (
          <Box className="crystal-notice-keys" color={surface.card} aria-hidden="true">
            <span />
            <span />
            <span />
          </Box>
        )}

        <Box
          className="crystal-notice-panel"
          position="relative"
          display="flex"
          flexDirection="column"
          flex="1"
          minH="0"
          borderRadius="18px"
          bg={surface.card}
          boxShadow="overlay"
          overflow="hidden"
        >
          {twoPane && (
            <>
              {/*
                * The two wings, in the panel's own colour - the background does
                * not change as it folds, only the shape does. They swing on
                * their inner edges while the centre stays exactly where it is.
                */}
              <Box className="crystal-notice-wing crystal-notice-wing-left" bg={surface.card} aria-hidden="true" />
              <Box className="crystal-notice-wing crystal-notice-wing-right" bg={surface.card} aria-hidden="true" />

              <Box className="crystal-notice-seam crystal-notice-seam-left" left="33.33%" color={surface.border} />
              <Box className="crystal-notice-seam crystal-notice-seam-right" left="66.66%" color={surface.border} />

              {/*
                * WHAT THE DEVICE SHOWS WHILE IT IS STILL FOLDED.
                *
                * The unfold takes most of a second and the content is held
                * back until both wings are flat, so without this the panel
                * spends that time as a blank card - which reads as a slow
                * dialog rather than as a device opening.
                *
                * It is centred on the panel, which IS the centre leaf: the
                * mark stays exactly where it is while the wings swing out,
                * the way something printed on the middle of a folding phone
                * would. Then it hands over to the content.
                */}
              <Flex
                className="crystal-notice-splash"
                direction="column"
                align="center"
                justify="center"
                gap="3" data-gap="12" data-gap-column
                aria-hidden="true"
              >
                <Flex
                  align="center"
                  justify="center"
                  boxSize="56px"
                  borderRadius="16px"
                  bgGradient="linear(to-br, brand.400, brand.600)"
                >
                  <Text fontWeight="800" color="white" fontSize="2xl" lineHeight="1">
                    C
                  </Text>
                </Flex>
                <Text fontWeight="800" fontSize="lg" color={surface.text}>
                  {t('common.crystal')}
                </Text>
              </Flex>
            </>
          )}
          <ModalHeader
            flexShrink={0}
            borderBottom="1px solid"
            borderColor={surface.border}
            py="4"
            pr="12"
          >
            <Flex align="center" gap="3" data-gap="12">
              <Flex
                align="center"
                justify="center"
                boxSize="34px"
                borderRadius="10px"
                bg="brand.500"
                flexShrink={0}
              >
                <Icon as={FiBell} color="white" boxSize="4" />
              </Flex>
              <Box minW="0">
                <Text fontSize="md" fontWeight="800" color={surface.text} lineHeight="1.2">
                  {t('dialog.fromCrystalToday')}
                </Text>
                <Text fontSize="xs" fontWeight="400" color={surface.muted} mt="0.5">
                  {shown.length === 1
                    ? t('dialog.n1Notice')
                    : t('dialog.notices', { count: shown.length })}
                </Text>
              </Box>
            </Flex>
          </ModalHeader>

          <ModalCloseButton top="4" right="4" />

          {/*
            * THE PART THAT GIVES WAY.
            *
            * The header and footer are fixed; this takes whatever is left of
            * the panel's 80vh and no more, and the columns inside it scroll.
            *
            * It is `flex` rather than a vh cap on purpose. The cap used to be
            * 58vh, chosen against a tall window - on a short one, 58vh plus a
            * header plus a footer came to more than the 80vh the panel is
            * allowed, and the panel clips, so the footer and its Got it button
            * were simply cut off. A flex child that may shrink cannot be wrong
            * about a window it has never seen.
            */}
          <ModalBody
            p="0"
            /*
              * A FLEX COLUMN, not a box with a percentage inside it.
              *
              * The columns used to hang off `h="100%"`, which only resolves
              * when the parent's height is definite - and this one's comes
              * from flexing inside a container that has a max-height and no
              * height. When that fails, `height: 100%` falls back to `auto`
              * SILENTLY: the column grows to fit all fourteen notices, the
              * panel clips the overflow, and the list simply does not
              * scroll. A flexed child needs no percentage to resolve.
              */
            display="flex"
            flexDirection="column"
            flex="1"
            minH="0"
            overflow="hidden"
          >
            {twoPane ? (
              <Flex align="stretch" flex="1" minH="0">
                {/* ------------------------------------------- the titles */}
                <Stack
                  spacing="0"
                  w="290px"
                  flexShrink={0}
                  /* Stretched to the row's height by `align="stretch"`, and
                     free to be shorter than its own content. */
                  minH="0"
                  borderRight="1px solid"
                  borderColor={surface.border}
                  bg={surface.raised}
                  overflowY="auto"
                >
                  {shown.map((notice) => {
                    const isSelected = notice.id === selected.id;

                    return (
                      <Box
                        key={notice.id}
                        as="button"
                        type="button"
                        textAlign="left"
                        px="4"
                        py="3"
                        borderBottom="1px solid"
                        borderColor={surface.border}
                        bg={isSelected ? surface.card : 'transparent'}
                        /* The selected row is marked on the edge that touches
                           the reading pane, so the two read as one surface. */
                        boxShadow={isSelected ? 'inset -3px 0 0 var(--chakra-colors-brand-500)' : 'none'}
                        _hover={{ bg: surface.card }}
                        transition="background 140ms ease"
                        onClick={() => setSelectedId(notice.id)}
                      >
                        {/*
                          * THE TITLE LEADS. It is the only part of a row that
                          * tells the reader whether to open it - the origin and
                          * the date qualify it, and a row that opened with a
                          * badge made six notices look like six badges.
                          */}
                        <Text
                          fontSize="sm"
                          fontWeight={isSelected ? '700' : '600'}
                          color={surface.text}
                          noOfLines={2}
                          mb="1.5"
                        >
                          {notice.title}
                        </Text>
                        <Flex align="center" justify="space-between" gap="2" data-gap="8">
                          <OriginBadge notice={notice} size="sm" />
                          <NoticeWhen notice={notice} />
                        </Flex>
                      </Box>
                    );
                  })}
                </Stack>

                {/* ------------------------------------------ the reading */}
                <Box flex="1" minW="0" minH="0" px="6" py="5" overflowY="auto">
                  <Flex align="center" gap="2" data-gap="8" data-gap-wrap wrap="wrap" mb="2">
                    <OriginBadge notice={selected} />
                    <NoticeWhen notice={selected} />
                  </Flex>
                  <Text fontSize="lg" fontWeight="700" color={surface.text} mb="3">
                    {selected.title}
                  </Text>
                  <NoticeBody html={selected.content} />
                </Box>
              </Flex>
            ) : (
              /*
                ON A PHONE, the accordion. Two columns at 360px would be a
                160px list beside a 160px body, which helps nobody.
              */
              <Box px="3" py="3" flex="1" minH="0" overflowY="auto">
                <Accordion allowToggle defaultIndex={0}>
                  {shown.map((notice) => (
                    <AccordionItem
                      key={notice.id}
                      border="1px solid"
                      borderColor={surface.border}
                      borderRadius="14px"
                      mb="2.5"
                      overflow="hidden"
                    >
                      {({ isExpanded }) => (
                        <>
                          <AccordionButton
                            px="4"
                            py="3"
                            _hover={{ bg: surface.hover }}
                            _expanded={{ bg: surface.raised }}
                          >
                            <Box flex="1" textAlign="left" minW="0">
                              <Text
                                fontWeight="700"
                                fontSize="sm"
                                color={surface.text}
                                noOfLines={isExpanded ? undefined : 1}
                                mb="1.5"
                              >
                                {notice.title}
                              </Text>
                              <Flex align="center" justify="space-between" gap="2" data-gap="8">
                                <OriginBadge notice={notice} size="sm" />
                                <NoticeWhen notice={notice} />
                              </Flex>
                            </Box>
                            <ChevronDownIcon
                              boxSize="5"
                              color={surface.muted}
                              flexShrink={0}
                              ml="2"
                              transform={isExpanded ? 'rotate(180deg)' : 'none'}
                              transition="transform 160ms ease"
                            />
                          </AccordionButton>

                          <AccordionPanel px="4" pb="4" pt="0">
                            <NoticeBody html={notice.content} size="sm" />
                          </AccordionPanel>
                        </>
                      )}
                    </AccordionItem>
                  ))}
                </Accordion>
              </Box>
            )}
          </ModalBody>

          <ModalFooter
            flexShrink={0}
            borderTop="1px solid"
            borderColor={surface.border}
            px={{ base: 4, md: 6 }}
            py="4"
          >
            <Flex
              w="100%"
              align={{ base: 'stretch', sm: 'center' }}
              justify="space-between"
              gap="3" data-gap="12" data-gap-row-from="sm"
              direction={{ base: 'column', sm: 'row' }}
            >
              <Stack spacing="1" minW="0">
                {/*
                  * BOTTOM LEFT, AND ALWAYS AVAILABLE.
                  *
                  * It is a property of the dialog, not of any notice in it - so
                  * it sits with the dialog's own controls rather than in the
                  * list, and no notice can take it away. Ticking it and closing
                  * means the dialog does not appear again today.
                  */}
                <Checkbox
                  size="sm"
                  isChecked={silenceAll}
                  onChange={(event) => setSilenceAll(event.target.checked)}
                >
                  <Text fontSize="sm" color={surface.muted}>
                    {t('dialog.doNotRemindMeToday')}
                  </Text>
                </Checkbox>

                {/*
                  * NO "SEE ALL" LINK. There is nothing left to see - the
                  * dialog holds every live notice now, and a link offering
                  * to show what is already on screen is worse than none.
                  */}
              </Stack>

              <Button variant="brand" onClick={close} flexShrink={0}>
                {t('dialog.gotIt')}
              </Button>
            </Flex>
          </ModalFooter>
        </Box>
      </ModalContent>
    </Modal>
  );
}
