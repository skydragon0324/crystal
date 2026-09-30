import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Alert, AlertIcon, Box, Button, Flex, FormControl, FormLabel, Heading, Icon,
  IconButton, Input, InputGroup, InputRightElement, Stack, Text,
  useColorMode, useColorModeValue
} from '@chakra-ui/react';
import { MoonIcon, SunIcon, ViewIcon, ViewOffIcon } from '@chakra-ui/icons';
import { MdBuild, MdInsertChart, MdSmartphone, MdVerifiedUser } from 'react-icons/md';

import SelectField from '../components/SelectField';
import { clearError, signIn } from '../app/authSlice';
import { LOCALES, useI18n } from '../i18n';

/**
 * THE WAY IN.
 *
 * Two panels on a desktop and one on a phone. The left is the product saying
 * what this is; the right is the only thing anybody came here to do.
 *
 * The split is not decoration. A console sign-in is opened by two kinds of
 * person - somebody who works here every day and wants the form, and somebody
 * seeing it for the first time who wants to know what they have opened - and a
 * single centred card serves the first well and the second not at all. On a
 * phone there is no room for both, so the panel goes and the form stays.
 *
 * The BRAND SIDE carries the sky ramp; the FORM SIDE stays on the page ground.
 * Putting the gradient behind the inputs is the version of this design that
 * looks striking in a screenshot and is tiring to use eight hours a day.
 *
 * The error shown is the one the API wrote - already in the reader's language
 * - and it deliberately does not say WHICH half was wrong: distinguishing "no
 * such account" from "wrong password" is a list of who works here.
 */

/** What the console actually does, in the four words each part deserves. */
const CAPABILITIES = [
  { icon: MdBuild, title: 'Repairs', blurb: 'Tickets, parts and the bench, across every centre.' },
  { icon: MdSmartphone, title: 'Catalogue', blurb: 'Products, specifications and the storefront copy.' },
  { icon: MdVerifiedUser, title: 'Warranty', blurb: 'Cover, claims and what each one costs.' },
  { icon: MdInsertChart, title: 'Analysis', blurb: 'Centre health, defect watch and the monthly report.' }
];

export default function SignIn() {
  const dispatch = useDispatch();
  const { status, error } = useSelector((state) => state.auth);
  const { locale, setLocale, t } = useI18n();
  const { colorMode, toggleColorMode } = useColorMode();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);

  const page = useColorModeValue('white', 'navy.900');
  const muted = useColorModeValue('secondaryGray.600', 'navy.200');

  const submit = (event) => {
    event.preventDefault();
    if (!username || !password) return;
    dispatch(signIn({ username, password }));
  };

  const onType = (setter) => (event) => {
    setter(event.target.value);
    // The error belongs to the attempt that produced it; typing starts a new one.
    if (error) dispatch(clearError());
  };

  return (
    <Flex minH="100vh" bg={page}>
      {/* ------------------------------------------------- the brand side */}
      <Flex
        display={{ base: 'none', lg: 'flex' }}
        w="46%"
        direction="column"
        justify="space-between"
        p="14"
        position="relative"
        overflow="hidden"
        bgGradient="linear(160deg, brand.500, brand.700 55%, brand.900)"
      >
        {/*
          Two soft discs rather than a photograph or an illustration. They cost
          nothing to load, they never look dated, and they carry the brand hue
          across the panel without competing with the words on top of them.
        */}
        <Box
          position="absolute"
          top="-7.5rem"
          right="-5.625rem"
          w="26.25rem"
          h="26.25rem"
          borderRadius="full"
          bg="whiteAlpha.200"
          filter="blur(2px)"
        />
        <Box
          position="absolute"
          bottom="-10rem"
          left="-3.75rem"
          w="22.5rem"
          h="22.5rem"
          borderRadius="full"
          bg="whiteAlpha.100"
        />

        <Flex align="center" gap="0.75rem" data-gap="12" position="relative">
          <Box
            w="2.375rem"
            h="2.375rem"
            borderRadius="0.75rem"
            bg="whiteAlpha.900"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <Box w="1rem" h="1rem" borderRadius="0.25rem" bgGradient="linear(135deg, brand.400, brand.700)" />
          </Box>
          <Heading size="md" color="white" letterSpacing="-0.02em">Crystal</Heading>
        </Flex>

        <Box position="relative" maxW="27.5rem">
          <Heading size="xl" color="white" letterSpacing="-0.03em" lineHeight="1.2">
            {t('signin.everythingAfterTheSaleIn')}
          </Heading>
          <Text color="whiteAlpha.800" mt="4" fontSize="sm" lineHeight="1.7">
            {t('signin.theConsoleBehindTheCrystal')}
          </Text>

          <Stack spacing="4" mt="10">
            {CAPABILITIES.map((item) => (
              <Flex key={item.title} align="flex-start" gap="0.75rem" data-gap="12">
                <Flex
                  w="2rem"
                  h="2rem"
                  flexShrink={0}
                  borderRadius="0.5625rem"
                  bg="whiteAlpha.200"
                  align="center"
                  justify="center"
                >
                  <Icon as={item.icon} w="1rem" h="1rem" color="white" />
                </Flex>
                <Box>
                  <Text fontSize="sm" fontWeight="600" color="white">{t(item.title)}</Text>
                  <Text fontSize="xs" color="whiteAlpha.700">{t(item.blurb)}</Text>
                </Box>
              </Flex>
            ))}
          </Stack>
        </Box>

        <Text fontSize="xs" color="whiteAlpha.600" position="relative">
          {t('signin.crystalElectronicsAllRightsReserved')}
        </Text>
      </Flex>

      {/* -------------------------------------------------- the form side */}
      <Flex flex="1" align="center" justify="center" px={{ base: 6, md: 10 }} py="10">
        <Box w="100%" maxW="23.75rem">
          {/* The two settings somebody might need BEFORE they can sign in:
              the language the form is written in, and a screen they can look
              at. Both belong here rather than behind the login. */}
          <Flex justify="flex-end" align="center" gap="0.5rem" data-gap="8" mb="10">
            {/* The console's own select even here, before anybody has signed
                in: the browser's draws its list with the operating system and
                would be the one control on this screen that ignores the
                colour mode the button beside it toggles. */}
            <Box w="7.25rem">
              <SelectField
                size="sm"
                name="locale"
                value={locale}
                isClearable={false}
                isSearchable={false}
                options={LOCALES.map((option) => ({ value: option.code, label: option.label }))}
                onChange={(next) => setLocale(next)}
              />
            </Box>

            <IconButton
              size="xs"
              variant="quiet"
              aria-label={colorMode === 'light' ? t('signin.darkMode') : t('signin.lightMode')}
              icon={colorMode === 'light' ? <MoonIcon /> : <SunIcon />}
              onClick={toggleColorMode}
            />
          </Flex>

          {/* On a phone the brand panel is gone, so the mark comes here. */}
          <Flex
            display={{ base: 'flex', lg: 'none' }}
            align="center"
            gap="0.625rem" data-gap="10"
            mb="6"
          >
            <Box w="2rem" h="2rem" borderRadius="0.625rem" bgGradient="linear(135deg, brand.400, brand.600)" />
            <Heading size="md" letterSpacing="-0.02em">Crystal</Heading>
          </Flex>

          <Heading size="lg" letterSpacing="-0.02em">{t('signin.signIn')}</Heading>
          <Text fontSize="sm" color={muted} mt="1" mb="8">
            {t('signin.serviceOperationsConsole')}
          </Text>

          <form onSubmit={submit}>
            <Stack spacing="5">
              {error && (
                <Alert status="error" borderRadius="0.625rem" fontSize="sm" py="2">
                  <AlertIcon boxSize="1em" />
                  {error}
                </Alert>
              )}

              <FormControl>
                <FormLabel fontSize="xs" color={muted} mb="1.5">{t('signin.username')}</FormLabel>
                <Input
                  h="2.75rem"
                  borderRadius="0.625rem"
                  autoFocus
                  autoComplete="username"
                  value={username}
                  onChange={onType(setUsername)}
                />
              </FormControl>

              <FormControl>
                <FormLabel fontSize="xs" color={muted} mb="1.5">{t('signin.password')}</FormLabel>
                <InputGroup>
                  <Input
                    h="2.75rem"
                    borderRadius="0.625rem"
                    type={reveal ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={onType(setPassword)}
                  />
                  {/*
                    Revealing the password is a genuine help on a long
                    generated one, and the risk it carries - somebody reading
                    over a shoulder - is the visitor's own call to make.
                  */}
                  <InputRightElement h="2.75rem">
                    <IconButton
                      size="sm"
                      variant="quiet"
                      aria-label={reveal ? t('signin.hidePassword') : t('signin.showPassword')}
                      icon={reveal ? <ViewOffIcon /> : <ViewIcon />}
                      onClick={() => setReveal((current) => !current)}
                    />
                  </InputRightElement>
                </InputGroup>
              </FormControl>

              <Button
                type="submit"
                h="2.75rem"
                variant="brand"
                borderRadius="0.625rem"
                fontSize="sm"
                isLoading={status === 'loading'}
                // Disabled until there is something to send, so the button
                // never fires a request that cannot succeed.
                isDisabled={!username || !password}
              >
                {t('signin.signIn')}
              </Button>
            </Stack>
          </form>
        </Box>
      </Flex>
    </Flex>
  );
}
