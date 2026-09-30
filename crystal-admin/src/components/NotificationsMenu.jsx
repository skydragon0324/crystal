import React, { useCallback, useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import {
  Badge, Box, Flex, Icon, Menu, MenuButton, MenuList, Spinner, Text,
  useColorModeValue
} from '@chakra-ui/react';
import { BellIcon } from '@chakra-ui/icons';
import { MdWarning, MdWidgets, MdReceipt, MdChatBubbleOutline } from 'react-icons/md';
import { useI18n } from '../i18n';
import { notifications } from '../api';

/** How often the bell re-reads while the tab is open. */
const REFRESH_MS = 2 * 60 * 1000;

/**
 * What each signal is called, and the icon that marks it.
 *
 * Keyed by the same string the API sends, so adding a signal on the server is
 * a line here rather than a change to how the menu is built.
 */
const SIGNALS = {
  overdue_repairs: { label: 'Repairs past their promised date', icon: MdWarning },
  claims_awaiting: { label: 'Claims waiting for approval', icon: MdReceipt },
  low_stock: { label: 'Parts at or below reorder level', icon: MdWidgets },
  feedback_waiting: { label: 'Messages waiting for a reply', icon: MdChatBubbleOutline }
};

const TONES = { red: 'red.500', orange: 'orange.500', blue: 'blue.500' };

/**
 * The header bell: what is going wrong right now.
 *
 * Deliberately NOT an inbox.  Nothing in this system sends an administrator a
 * message, and a bell that has to be marked as read is a bell people learn to
 * clear without looking.  Every item is a live query, so it disappears when
 * the thing it describes is dealt with - the only definition of "read" that
 * cannot go stale.
 *
 * The badge counts the whole set and the list shows the first few of each: a
 * badge reading four beside a list of four when there are ninety makes a
 * crisis look like a quiet afternoon.
 */
export default function NotificationsMenu({ iconColor }) {
  const { t } = useI18n();
  const history = useHistory();

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const menuBg = useColorModeValue('white', 'navy.800');
  const menuBorder = useColorModeValue('secondaryGray.100', 'navy.600');
  const mainText = useColorModeValue('secondaryGray.900', 'navy.50');
  const mutedText = useColorModeValue('secondaryGray.600', 'navy.200');
  const hoverBg = useColorModeValue('secondaryGray.300', 'navy.700');
  const ruleColor = useColorModeValue('secondaryGray.100', 'navy.600');

  const load = useCallback(() => {
    let alive = true;
    notifications.summary()
      .then(function (res) { if (alive) setSummary(res.data); })
      .catch(function () { if (alive) setSummary(null); })
      .then(function () { if (alive) setLoading(false); });
    return function () { alive = false; };
  }, []);

  useEffect(() => {
    const cancel = load();
    const timer = window.setInterval(load, REFRESH_MS);
    return function () { cancel(); window.clearInterval(timer); };
  }, [load]);

  const total = (summary && summary.total) || 0;
  const urgent = (summary && summary.urgent) || 0;
  const groups = (summary && summary.groups) || [];

  const open = (url) => history.push(url);

  return (
    <Menu isLazy placement="bottom-end">
      <MenuButton
        p="0px" ms={{ base: '0px', md: '0.375rem' }} me={{ base: '0.375rem', md: '0.625rem' }}
        display="flex" alignItems="center" lineHeight="0"
        position="relative" aria-label={t('layout.notifications')}
      >
        <Icon as={BellIcon} color={iconColor} w="1.125rem" h="1.125rem" />
        {total ? (
          <Box
            position="absolute" top="-0.375rem" right="-0.4375rem"
            minW="1rem" h="1rem" px="0.25rem" borderRadius="0.5rem"
            // Red only when something is actually late; everything else is
            // work waiting, which is normal and should not read as an alarm.
            bg={urgent ? 'red.500' : 'brand.500'} color="white"
            fontSize="0.625rem" fontWeight="600"
            lineHeight="1rem" textAlign="center"
          >
            {total > 99 ? '99+' : total}
          </Box>
        ) : null}
      </MenuButton>

      <MenuList
        p="0.5rem" borderRadius="0.625rem" bg={menuBg}
        border="1px solid" borderColor={menuBorder}
        mt="0.5rem" minW={{ base: 'unset', md: '23.75rem' }}
        maxH="28.75rem" overflowY="auto"
      >
        <Flex w="100%" mb="0.5rem" px="0.375rem" justify="space-between" align="center">
          <Text fontSize="sm" fontWeight="600" color={mainText}>{t('layout.needsAttention')}</Text>
          {total ? (
            <Badge colorScheme={urgent ? 'red' : 'orange'} borderRadius="0.375rem" px="0.375rem" fontSize="0.6875rem">
              {total}
            </Badge>
          ) : null}
        </Flex>

        {loading ? (
          <Flex justify="center" py="1.25rem"><Spinner color="brand.500" size="sm" /></Flex>
        ) : !groups.length ? (
          <Text fontSize="sm" color={mutedText} px="0.375rem" py="0.75rem">
            {t('layout.nothingNeedsAttentionRightNow')}
          </Text>
        ) : (
          groups.map(function (group, index) {
            const meta = SIGNALS[group.key] || { label: group.key, icon: MdWarning };

            return (
              <Box key={group.key} pt={index ? '0.625rem' : '0'} mt={index ? '0.625rem' : '0'}
                borderTop={index ? '1px solid' : 'none'} borderColor={ruleColor}
              >
                <Flex
                  as="button" type="button" w="100%" textAlign="left"
                  align="center" gap="0.5rem" data-gap="8" px="0.375rem" pb="0.375rem"
                  onClick={() => open(group.page)}
                >
                  <Icon as={meta.icon} w="0.9375rem" h="0.9375rem" color={TONES[group.tone] || 'brand.500'} />
                  <Text fontSize="xs" fontWeight="600" color={mainText} flex="1" noOfLines={1}>
                    {t(meta.label)}
                  </Text>
                  <Text fontSize="xs" fontWeight="700" color={TONES[group.tone] || 'brand.500'}>
                    {group.total}
                  </Text>
                </Flex>

                {group.items.map(function (item) {
                  return (
                    <Flex
                      as="button" type="button" w="100%" textAlign="left"
                      key={group.key + '-' + item.id}
                      align="center" gap="0.5rem" data-gap="8" px="0.375rem" py="0.375rem" borderRadius="0.375rem"
                      _hover={{ bg: hoverBg }}
                      onClick={() => open(item.url)}
                    >
                      <Box minW="0" flex="1">
                        <Text fontSize="sm" color={mainText} noOfLines={1}>{item.title}</Text>
                        {item.subtitle ? (
                          <Text fontSize="xs" color={mutedText} noOfLines={1}>{item.subtitle}</Text>
                        ) : null}
                      </Box>
                    </Flex>
                  );
                })}

                {group.total > group.items.length ? (
                  <Text fontSize="xs" color={mutedText} px="0.375rem" pt="2px">
                    {t('layout.andMore', { count: group.total - group.items.length })}
                  </Text>
                ) : null}
              </Box>
            );
          })
        )}
      </MenuList>
    </Menu>
  );
}
