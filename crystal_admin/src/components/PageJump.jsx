import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { Box, Flex, Icon, Kbd, Text, useColorModeValue } from '@chakra-ui/react';
import * as Md from 'react-icons/md';
import { useSelector } from 'react-redux';
import SearchBar from './SearchBar';
import { useI18n } from '../i18n';
import { search } from '../api';

/** Never show more than this many pages, however loose the query is. */
const MAX_PAGES = 7;

/** Below this the search is everybody, so the API is not asked. */
const MIN_DATA_QUERY = 2;

/**
 * How long to wait after the last keystroke before asking the API.
 *
 * Pages are matched in the browser and stay instant; only the data search
 * costs a round trip, and firing one per character would send six requests
 * for a word nobody has finished typing.
 */
const DEBOUNCE_MS = 220;

/** What each group of API hits is called, and which icon marks it. */
const GROUP_LABELS = {
  product: 'Products',
  ticket: 'Repair tickets',
  member: 'Members',
  agency: 'Service centres',
  part: 'Parts',
  article: 'Articles'
};

const GROUP_ICONS = {
  product: 'MdWidgets',
  ticket: 'MdBuild',
  member: 'MdPerson',
  agency: 'MdStore',
  part: 'MdSettings',
  article: 'MdDescription'
};

/**
 * Every letter typed has to appear, in order, somewhere in the text - so
 * "stick" finds "Service / Repair tickets" and "mo" finds both monthly pages.
 * Initials and half remembered names are how people search a menu they know
 * roughly, and a plain substring match answers neither.
 */
function subsequenceScore(haystack, needle) {
  const text = haystack.toLowerCase();
  const query = needle.toLowerCase();

  let at = 0;
  let score = 0;
  let previous = -1;

  for (let i = 0; i < query.length; i += 1) {
    const found = text.indexOf(query[i], at);
    if (found < 0) return -1;

    // Letters that ran together, and letters starting a word, are the ones
    // somebody meant to type; scattered hits are more likely coincidence.
    if (found === previous + 1) score += 3;
    if (found === 0 || text[found - 1] === ' ' || text[found - 1] === '/') score += 2;

    previous = found;
    at = found + 1;
    score += 1;
  }

  // A short label matching is a better answer than a long one that also does.
  return score - text.length * 0.01;
}

/**
 * The header search: type a few letters, jump to whatever it was.
 *
 * TWO searches in one box.  Pages are matched here in the browser, against
 * the same permission-filtered list the sidebar is built from, so they stay
 * instant and can never offer a screen that would answer 403.  Everything
 * else - a product, a member, a ticket number off a printed job sheet - is
 * the API's answer, because it is the only thing that has them, and it
 * filters by the same grid for the same reason.
 *
 * People arrive at a search box with a model code or half a customer name,
 * not with the name of a screen.  Finding only pages meant knowing which page
 * held the thing and searching again once you got there.
 */
export default function PageJump() {
  const { t } = useI18n();
  const history = useHistory();
  const pages = useSelector((state) => state.auth.pages);

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [dataGroups, setDataGroups] = useState([]);
  const [searching, setSearching] = useState(false);
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  const panelBg = useColorModeValue('white', 'navy.800');
  const panelBorder = useColorModeValue('secondaryGray.100', 'navy.600');
  const textColor = useColorModeValue('secondaryGray.900', 'navy.50');
  const mutedColor = useColorModeValue('secondaryGray.600', 'navy.200');
  const hoverBg = useColorModeValue('secondaryGray.300', 'navy.700');
  const brandColor = useColorModeValue('brand.500', 'brand.400');
  const shadow = useColorModeValue(
    '0 10px 30px rgba(15, 23, 42, 0.12)',
    '0 10px 30px rgba(0, 0, 0, 0.55)'
  );

  /*
   * The searchable menu, with each page's group prefixed.
   *
   * The rows come from the server - the same ones the sidebar draws - so a
   * screen this role cannot open is not in the list to be found.
   */
  const searchable = useMemo(() => {
    const byId = {};
    pages.forEach(function (page) { byId[page.page_id] = page; });

    return pages
      .filter(function (page) { return page.permission > 0 && page.page_url.split('/').length > 3; })
      .map(function (page) {
        const parent = byId[page.parent_id];
        const group = parent ? t(parent.page_name) : '';
        const label = t(page.page_name);
        return {
          url: page.page_url,
          label: label,
          group: group,
          icon: Md[page.icon] || Md.MdChevronRight,
          haystack: group + ' / ' + label + ' ' + page.page_url
        };
      });
  }, [pages, t]);

  const pageHits = useMemo(() => {
    const needle = query.trim();
    if (!needle) return [];

    return searchable
      .map(function (page) { return { page: page, score: subsequenceScore(page.haystack, needle) }; })
      .filter(function (hit) { return hit.score >= 0; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, MAX_PAGES)
      .map(function (hit) { return hit.page; });
  }, [searchable, query]);

  /*
   * Ask the API, once the typing pauses.
   *
   * A request in flight when the next keystroke lands is abandoned rather
   * than cancelled - it is one small GET, and the flag is what stops its
   * answer overwriting a newer one, which is the bug that actually bites:
   * results for "c9" arriving after results for "c9 pro".
   */
  useEffect(() => {
    const needle = query.trim();
    if (needle.length < MIN_DATA_QUERY) { setDataGroups([]); return undefined; }

    let current = true;
    setSearching(true);

    const timer = setTimeout(function () {
      search.query(needle)
        .then(function (res) { if (current) setDataGroups((res.data && res.data.groups) || []); })
        .catch(function () { if (current) setDataGroups([]); })
        .then(function () { if (current) setSearching(false); });
    }, DEBOUNCE_MS);

    return function () { current = false; clearTimeout(timer); };
  }, [query]);

  /*
   * Pages first, then the data groups in the order the API returned them.
   * One flat list, so the arrow keys and Enter never have to know which kind
   * of thing they are sitting on.
   */
  const options = useMemo(() => {
    const out = pageHits.map(function (page) {
      return {
        key: 'page:' + page.url,
        url: page.url,
        icon: page.icon,
        title: page.label,
        subtitle: page.group
      };
    });

    dataGroups.forEach(function (group) {
      group.items.forEach(function (item) {
        out.push({
          key: group.type + ':' + item.id,
          url: item.url,
          icon: Md[GROUP_ICONS[group.type]] || Md.MdSearch,
          title: item.title,
          subtitle: item.subtitle,
          groupLabel: t(GROUP_LABELS[group.type] || group.type)
        });
      });
    });

    return out;
  }, [pageHits, dataGroups, t]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setCursor(0);
    setDataGroups([]);
  }, []);

  const jump = useCallback((option) => {
    if (!option) return;
    close();
    if (inputRef.current) inputRef.current.blur();
    history.push(option.url);
  }, [close, history]);

  // Ctrl+K / Cmd+K from anywhere, Escape to leave. Typing into a form must not
  // steal the shortcut back, so this only ever adds a focus, never removes one.
  useEffect(() => {
    const onKey = function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (inputRef.current) inputRef.current.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return function () { window.removeEventListener('keydown', onKey); };
  }, []);

  // A click anywhere else is a dismissal; without this the panel outlives the
  // page it was opened over.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = function (e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) close();
    };
    document.addEventListener('mousedown', onDown);
    return function () { document.removeEventListener('mousedown', onDown); };
  }, [open, close]);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') return close();
    if (!options.length) return undefined;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      return setCursor(function (c) { return (c + 1) % options.length; });
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      return setCursor(function (c) { return (c - 1 + options.length) % options.length; });
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      return jump(options[cursor] || options[0]);
    }
    return undefined;
  };

  const showPanel = open && !!query.trim();

  return (
    <Box ref={boxRef} position="relative" display={{ base: 'none', md: 'block' }} me="0.625rem">
      <SearchBar
        ref={inputRef}
        borderRadius="0.5rem"
        placeholder={t('table.searchPlaceholder')}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setCursor(0); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        w={{ md: '16.25rem', lg: '20rem' }}
      />

      {showPanel ? (
        <Box
          position="absolute" top="calc(100% + 8px)" left="0" zIndex="1500"
          w={{ md: '26.25rem' }} bg={panelBg} borderRadius="0.625rem"
          border="1px solid" borderColor={panelBorder}
          boxShadow={shadow} p="0.375rem"
          maxH="70vh" overflowY="auto" overflowX="hidden"
        >
          {!options.length ? (
            <Text fontSize="sm" color={mutedColor} px="0.75rem" py="0.875rem">
              {searching ? t('table.searching') : t('table.noMatches')}
            </Text>
          ) : (
            options.map(function (option, index) {
              // A heading before the first row of each group, so a list of
              // mixed things reads as sections rather than as one run.
              const previous = options[index - 1];
              const heading = option.groupLabel &&
                (!previous || previous.groupLabel !== option.groupLabel)
                ? option.groupLabel
                : null;

              return (
                <Box key={option.key}>
                  {heading ? (
                    <Text
                      fontSize="0.625rem" fontWeight="600" color={mutedColor}
                      textTransform="uppercase" letterSpacing="0.04em"
                      px="0.625rem" pt="0.625rem" pb="0.25rem"
                    >
                      {heading}
                    </Text>
                  ) : null}

                  <Flex
                    as="button" type="button" w="100%" textAlign="left"
                    align="center" gap="0.625rem" data-gap="10" px="0.625rem" py="0.5rem" borderRadius="0.375rem"
                    bg={index === cursor ? hoverBg : 'transparent'}
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => jump(option)}
                  >
                    <Icon
                      as={option.icon} w="1rem" h="1rem"
                      color={index === cursor ? brandColor : mutedColor}
                    />
                    <Box minW="0" flex="1">
                      <Text fontSize="sm" fontWeight="500" color={textColor} noOfLines={1}>
                        {option.title}
                      </Text>
                      {option.subtitle ? (
                        <Text fontSize="xs" color={mutedColor} noOfLines={1}>
                          {option.subtitle}
                        </Text>
                      ) : null}
                    </Box>
                  </Flex>
                </Box>
              );
            })
          )}

          <Flex align="center" justify="flex-end" gap="0.375rem" data-gap="6" px="0.625rem" pt="0.5rem" pb="0.25rem">
            <Kbd fontSize="0.625rem">↑</Kbd>
            <Kbd fontSize="0.625rem">↓</Kbd>
            <Text fontSize="0.625rem" color={mutedColor}>{t('table.hintMove')}</Text>
            <Kbd fontSize="0.625rem" ms="0.5rem">↵</Kbd>
            <Text fontSize="0.625rem" color={mutedColor}>{t('table.hintOpen')}</Text>
          </Flex>
        </Box>
      ) : null}
    </Box>
  );
}
