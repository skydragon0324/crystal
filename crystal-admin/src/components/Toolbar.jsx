import React, { useEffect, useRef, useState } from 'react';
import {
  Box, Button, Flex, HStack, Input, InputGroup, InputLeftElement, Wrap, WrapItem
} from '@chakra-ui/react';
import { SearchIcon } from '@chakra-ui/icons';
import SelectField from './SelectField';
import { useT } from '../i18n';

/**
 * The strip above a table: one search box, some selects, and the buttons.
 *
 * Filters are declared as data rather than written as JSX at every call site,
 * so a screen adds a filter by adding an object - and every list in the
 * console ends up with the same spacing, the same "all" option and the same
 * behaviour when a filter is cleared.
 */
export default function Toolbar({ search, onSearch, filters, actions, children }) {
  const t = useT();
  const [typed, setTyped] = useState(search || '');
  const searchHandler = useRef(onSearch);

  useEffect(() => { setTyped(search || ''); }, [search]);
  useEffect(() => { searchHandler.current = onSearch; }, [onSearch]);

  /* Keep typing local and issue one request after the reader pauses. */
  useEffect(() => {
    if (!searchHandler.current || typed === (search || '')) return undefined;
    const timer = setTimeout(() => searchHandler.current(typed), 300);
    return () => clearTimeout(timer);
  }, [typed, search]);

  return (
    <Flex px={5} py={3} gap={3} data-gap="12" data-gap-wrap align="center" wrap="wrap">
      {onSearch && (
        <InputGroup size="sm" maxW="16.25rem">
          <InputLeftElement pointerEvents="none" h="2rem">
            <SearchIcon color="gray.400" boxSize="0.8em" />
          </InputLeftElement>
          <Input
            borderRadius="lg"
            placeholder={t('common.search')}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && typed !== (search || '')) onSearch(typed);
            }}
          />
        </InputGroup>
      )}

      <Wrap spacing={2}>
        {(filters || []).map((filter) => (
          <WrapItem key={filter.key}>
            {/*
              The console's own SelectField, not the browser's select.

              A native <select> draws its list with the operating system,
              which means it ignores the colour mode, cannot be searched,
              and looks like a different application on every machine the
              console is opened on. This one is searchable past seven
              options and clears to "no filter" through the same control.
            */}
            <Box minW={filter.width || '9.375rem'}>
              <SelectField
                size="sm"
                value={filter.value === null || filter.value === undefined ? null : filter.value}
                options={filter.options || []}
                placeholder={filter.placeholder || filter.label}
                // An empty value means "no filter", not a filter whose value
                // happens to be zero - hence the explicit ''.
                onChange={(next) => filter.onChange(next === null || next === undefined ? '' : next)}
              />
            </Box>
          </WrapItem>
        ))}
      </Wrap>

      {children}

      <HStack ml="auto" spacing={2}>{actions}</HStack>
    </Flex>
  );
}

/** The button every list has in its top right. */
export function PrimaryAction({ children, ...rest }) {
  return <Button size="sm" colorScheme="brand" borderRadius="lg" {...rest}>{children}</Button>;
}
