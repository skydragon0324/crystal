import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Collapse, Flex, Heading, Icon, Stack, Text
} from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';
import { FiBell } from 'react-icons/fi';
import { useDispatch, useSelector } from 'react-redux';

import { Breadcrumbs, EmptyState, ErrorState, Loading, Section } from '@/components/common';
import { NoticeBody, NoticeWhen, OriginBadge } from '@/components/notices/NoticeContent';
import {
  loadNotices,
  markSeen,
  selectNoticeStatus,
  selectNotices
} from '@/app/noticeSlice';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * EVERYTHING CRYSTAL HAS TO SAY TODAY.
 *
 * The arrival dialog greets a VISIT and shows the first few; this is the page
 * that holds the rest, and the only way back to one that was put down. Without
 * it "do not remind me today" was a delete button: a visitor who ticked it in
 * a hurry had no way to read the notice again, and a visitor who arrived on a
 * day with eight announcements only ever saw the top one.
 *
 * It shows what is LIVE, which is the same set the dialog draws from - the
 * window on each notice is evaluated against the database's clock, so this is
 * "available today" in the company's reckoning rather than the browser's.
 *
 * ONE OPEN AT A TIME, and the first is open on arrival. Eight cards expanded
 * at once is a wall; eight collapsed is a list nobody opens. The dismissed
 * ones are here too and marked as such - putting down a greeting is not the
 * same as deleting an announcement.
 */
export default function Notifications() {
  const t = useT();
  const surface = useSurface();
  const dispatch = useDispatch();

  const notices = useSelector(selectNotices);
  const status = useSelector(selectNoticeStatus);

  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    dispatch(loadNotices());
  }, [dispatch]);

  /*
   * Reading the page is what clears the bell.
   *
   * The ids are passed rather than read from state inside the reducer, so a
   * failed or still-running request cannot mark an empty list as read and
   * empty a badge nobody has looked at.
   */
  const ids = useMemo(() => notices.map((notice) => notice.id), [notices]);

  useEffect(() => {
    if (status === 'ready' && ids.length) dispatch(markSeen(ids));
  }, [dispatch, status, ids]);

  // The top notice opens itself: a page of collapsed rows has not told
  // anybody anything, and the top one is the one the editors ranked first.
  useEffect(() => {
    if (openId === null && notices.length) setOpenId(notices[0].id);
  }, [openId, notices]);

  return (
    <Section py={{ base: 6, md: 10 }}>
      <Breadcrumbs items={[{ label: 'Notifications' }]} />

      <Flex align="center" gap="3" data-gap="12">
        <Icon as={FiBell} boxSize="6" color="brand.500" />
        <Heading size="lg" color={surface.text} letterSpacing="-0.02em">
          {t('common.notifications')}
        </Heading>
      </Flex>
      <Text color={surface.muted} mt="1" mb="8">
        {status === 'loading'
          ? t('notifications.lookingForAnythingNew')
          : t('notifications.everythingCrystalHasPublishedFor')}
      </Text>

      {status === 'loading' && <Loading variant="list" count={5} height="88px" />}

      {status === 'failed' && (
        <ErrorState
          message={t('notifications.notificationsAreUnavailableRightNow')}
          onRetry={() => dispatch(loadNotices())}
        />
      )}

      {status === 'ready' && notices.length === 0 && (
        <EmptyState
          title={t('notifications.nothingNewToday')}
          hint={t('notifications.announcementsAboutYourProductsYour')}
          actionLabel={t('common.supportHome')}
          actionTo="/support"
        />
      )}

      {status === 'ready' && notices.length > 0 && (
        <Stack spacing="3">
          {notices.map((notice) => {
            const isOpen = openId === notice.id;

            return (
              <Box
                key={notice.id}
                border="1px solid"
                borderColor={isOpen ? 'brand.500' : surface.border}
                borderRadius="14px"
                bg={surface.card}
                overflow="hidden"
                transition="border-color 160ms ease"
              >
                <Flex
                  as="button"
                  type="button"
                  w="100%"
                  textAlign="left"
                  align="flex-start"
                  justify="space-between"
                  gap="4" data-gap="16"
                  px={{ base: 4, md: 5 }}
                  py="4"
                  _hover={{ bg: surface.hover }}
                  onClick={() => setOpenId(isOpen ? null : notice.id)}
                  aria-expanded={isOpen}
                >
                  <Box minW="0" flex="1">
                    {/*
                      * TITLE FIRST, then who it is from on the left and when on
                      * the right. The title is the only part that says whether
                      * to open the row; the other two qualify it.
                      */}
                    <Text fontWeight="700" color={surface.text} mb="1.5">
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
                    mt="1"
                    transform={isOpen ? 'rotate(180deg)' : 'none'}
                    transition="transform 160ms ease"
                  />
                </Flex>

                <Collapse in={isOpen} animateOpacity>
                  <Box px={{ base: 4, md: 5 }} pb="5" pt="0">
                    <NoticeBody html={notice.content} size="sm" />
                  </Box>
                </Collapse>
              </Box>
            );
          })}
        </Stack>
      )}

    </Section>
  );
}
