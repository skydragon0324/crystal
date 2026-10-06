import React, { useEffect, useRef, useState } from 'react';
import { Box, IconButton, Input, InputGroup, InputLeftElement, InputRightElement, Spinner, Text, useColorModeValue } from '@chakra-ui/react';
import { CloseIcon, SearchIcon } from '@chakra-ui/icons';

import { crm } from '../../api';
import { useT } from '../../i18n';

/**
 * FIND ONE REGISTERED CUSTOMER.
 *
 * One box: type a name or a phone number, and the registered customers that
 * match are listed under it, one per line -
 *
 *     92, Zhang Wei, 21 Chaoyang Road Beijing, +86 138 0000 0101, 010 6500 1234
 *
 * (party_pk, name, home address, every phone). Choosing one puts the name in
 * the box and closes the list; typing again drops the choice and searches
 * anew. Merged and deleted records are never offered.
 *
 * Used wherever a form needs a customer - product registration, transfers,
 * links between customers, merges - with the same props everywhere:
 *
 *   value       the chosen party_pk, or null
 *   onChange    (party_pk | null, party | null) => void
 *   placeholder optional
 *   isDisabled  optional
 */

const MIN_LETTERS = 2;
const WAIT_MS = 300;

/** A customer's address: the street line, then the place it is in. */
export function partyAddress(party) {
  return [party.address_line, party.home_place].filter(Boolean).join(' ');
}

/** A customer on one line: party_pk, name, home address, every phone - comma-separated. */
export function partyLine(party) {
  const phones = Array.isArray(party.phones) && party.phones.length ? party.phones : [party.mobile];
  return [party.party_pk, party.display_name || '-', partyAddress(party)].concat(phones).filter(Boolean).join(', ');
}

export default function PartyPicker({ value, onChange, placeholder, isDisabled }) {
  const translate = useT();
  const [text, setText] = useState('');
  const [chosen, setChosen] = useState(null);
  const [found, setFound] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useRef('party-picker-' + Math.random().toString(36).slice(2)).current;
  const listBg = useColorModeValue('white', 'gray.800');
  const hoverBg = useColorModeValue('brand.50', 'whiteAlpha.100');

  /* Name the customer we were handed, so an edit opens showing who it is. */
  useEffect(() => {
    if (!value) { setChosen(null); return; }
    if (chosen && String(chosen.party_pk) === String(value)) return;
    crm.parties.lookup('', String(value))
      .then(({ data }) => {
        const party = Array.isArray(data) ? data[0] : null;
        if (party) { setChosen(party); setText(party.display_name || String(party.party_pk)); }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  /* Search while the list is open, once the text is long enough and has settled. */
  useEffect(() => {
    const term = text.trim();
    if (!open || term.length < MIN_LETTERS) { setFound([]); return undefined; }
    let alive = true;
    const timer = setTimeout(() => {
      setBusy(true);
      crm.parties.lookup(term)
        .then(({ data }) => { if (alive) { setFound(Array.isArray(data) ? data : []); setActive(-1); } })
        .catch(() => { if (alive) setFound([]); })
        .finally(() => { if (alive) setBusy(false); });
    }, WAIT_MS);
    return () => { alive = false; clearTimeout(timer); };
  }, [text, open]);

  const choose = (party) => {
    setChosen(party);
    setText(party.display_name || String(party.party_pk));
    setOpen(false);
    setFound([]);
    onChange(party.party_pk, party);
  };

  const type = (next) => {
    setText(next);
    setOpen(true);
    // A changed name is a new search: whoever was chosen is chosen no longer.
    if (chosen) { setChosen(null); onChange(null, null); }
  };

  const clear = () => {
    setText('');
    setFound([]);
    setOpen(false);
    if (chosen || value) { setChosen(null); onChange(null, null); }
  };

  const onKeyDown = (event) => {
    if (!open || !found.length) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((active + 1) % found.length); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((active - 1 + found.length) % found.length); }
    else if (event.key === 'Enter' && active >= 0) { event.preventDefault(); choose(found[active]); }
    else if (event.key === 'Escape') { setOpen(false); }
  };

  const showList = open && text.trim().length >= MIN_LETTERS;

  return (
    <Box position="relative">
      <InputGroup size="sm">
        <InputLeftElement pointerEvents="none">
          {busy ? <Spinner size="xs" /> : <SearchIcon color="gray.400" boxSize="0.8em" />}
        </InputLeftElement>
        <Input
          borderRadius="md"
          value={text}
          isDisabled={isDisabled}
          placeholder={placeholder || translate('crm.common.findACustomer')}
          onChange={(event) => type(event.target.value)}
          onFocus={() => { if (!chosen && text.trim().length >= MIN_LETTERS) setOpen(true); }}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          fontWeight={chosen ? '600' : undefined}
        />
        {text && !isDisabled ? (
          <InputRightElement>
            <IconButton size="xs" variant="ghost" icon={<CloseIcon boxSize="0.55em" />} aria-label={translate('crm.common.clearCustomer')} onClick={clear} />
          </InputRightElement>
        ) : null}
      </InputGroup>
      {showList ? (
        <Box id={listId} role="listbox" position="absolute" zIndex={20} left={0} right={0} mt={1} maxH="16rem" overflowY="auto"
          bg={listBg} borderWidth="1px" borderRadius="md" boxShadow="md">
          {found.length ? found.map((party, index) => (
            <Box key={party.party_pk} role="option" aria-selected={index === active} px={3} py={2} fontSize="sm" cursor="pointer"
              bg={index === active ? hoverBg : undefined} _hover={{ bg: hoverBg }}
              onMouseDown={(event) => event.preventDefault()} onClick={() => choose(party)}>
              <Text noOfLines={1}>{partyLine(party)}</Text>
            </Box>
          )) : (
            <Text px={3} py={2} fontSize="sm" color="gray.500">
              {busy ? translate('crm.common.searching') : translate('crm.common.noCustomerMatches')}
            </Text>
          )}
        </Box>
      ) : null}
    </Box>
  );
}
