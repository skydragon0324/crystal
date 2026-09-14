import React, { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Divider,
  Flex,
  Icon,
  SimpleGrid,
  Text,
  useColorModeValue,
} from '@chakra-ui/react';
import { FiArrowUp, FiHeadphones } from 'react-icons/fi';
import SiteContainer from 'components/Layout/SiteContainer';
import { getFooterColumns, getFooterLegalLinks } from 'constants/siteNav';
import { PAGE_FEEDBACK_URL } from 'constants/constants';
import { getLangText } from 'lang/lang';
import useLang from 'lang/useLang';

// Public fallback for visitors who are not signed in.
const HELP_URL = '/vendor/phone/faqs';

/**
 * Site footer, following mi.com/global:
 *
 *   - a service block on the left with the support number and hours
 *   - link columns on the right
 *   - a bottom strip carrying the copyright and the legal links
 *
 * On phones the columns collapse into an accordion rather than stacking
 * into one long scroll, which is how mi.com handles the same content and
 * keeps the footer from dwarfing the page above it.
 *
 * This replaces a footer that rendered a single copyright line and was
 * never mounted by ClientLayout, so the site had no footer at all.
 */
const ClientFooter = () => {
  const user = useSelector((state) => state.client.user);
  const { locale } = useLang();

  // Rebuilt when the language changes, and only then - these are two
  // dozen translated strings and the footer is on every page.
  const columns = useMemo(getFooterColumns, [locale]);
  const legalLinks = useMemo(getFooterLegalLinks, [locale]);

  const bg = useColorModeValue('gray.50', 'navy.900');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.200');
  const titleColor = useColorModeValue('gray.800', 'gray.100');
  const linkColor = useColorModeValue('gray.600', 'gray.400');
  const mutedColor = useColorModeValue('gray.500', 'gray.500');
  const accentColor = 'brand.600';

  // Links flagged `auth` point into the account area, which is useless
  // signed out - it would bounce the visitor to a login screen.
  const visibleLinks = (links) => links.filter((link) => !link.auth || !!user);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <Box as="footer" bg={bg} borderTopWidth="1px" borderColor={borderColor} mt="auto">
      <SiteContainer>
        {/* ---- service + links ---- */}
        <Flex direction={{ base: 'column', lg: 'row' }} py={{ base: '24px', md: '40px' }}>
          {/* service block */}
          <Flex
            direction="column"
            minW={{ lg: '280px' }}
            me={{ lg: '48px' }}
            mb={{ base: '20px', lg: '0' }}
            align={{ base: 'center', lg: 'flex-start' }}
            textAlign={{ base: 'center', lg: 'start' }}
          >
            <Flex align="center">
              <Icon as={FiHeadphones} boxSize="20px" color={accentColor} me="8px" />
              <Text fontSize="13px" fontWeight="600" color={titleColor} textTransform="uppercase" letterSpacing="0.06em">
                {getLangText('FOOTER_SERVICE_TITLE')}
              </Text>
            </Flex>
            <Text
              as="a"
              href={`tel:${getLangText('FOOTER_SERVICE_PHONE')}`}
              mt="10px"
              fontSize={{ base: '24px', md: '28px' }}
              fontWeight="700"
              color={accentColor}
              lineHeight="1.2"
            >
              {getLangText('FOOTER_SERVICE_PHONE')}
            </Text>
            <Text mt="4px" fontSize="13px" color={mutedColor}>
              {getLangText('FOOTER_SERVICE_HOURS')}
            </Text>

            <Flex mt="16px" wrap="wrap" justify={{ base: 'center', lg: 'flex-start' }}>
              <FooterButton
                to={user ? PAGE_FEEDBACK_URL : HELP_URL}
                borderColor={borderColor}
                color={linkColor}
              >
                {getLangText('FOOTER_CONTACT_US')}
              </FooterButton>
              <FooterButton to={HELP_URL} borderColor={borderColor} color={linkColor}>
                {getLangText('FOOTER_HELP_CENTER')}
              </FooterButton>
            </Flex>
          </Flex>

          {/* ---- columns: grid from md up ---- */}
          <SimpleGrid
            display={{ base: 'none', md: 'grid' }}
            columns={{ md: 4 }}
            spacing="24px"
            flex="1"
          >
            {columns.map((column) => (
              <Box key={column.title}>
                <Text fontSize="14px" fontWeight="600" color={titleColor} mb="12px">
                  {column.title}
                </Text>
                {visibleLinks(column.links).map((link) => (
                  <FooterLink key={`${column.title}-${link.name}`} link={link} color={linkColor} accentColor={accentColor} />
                ))}
              </Box>
            ))}
          </SimpleGrid>

          {/* ---- columns: accordion below md ---- */}
          <Accordion display={{ base: 'block', md: 'none' }} allowToggle w="100%">
            {columns.map((column) => (
              <AccordionItem key={column.title} borderColor={borderColor}>
                <AccordionButton px="0" py="14px" _hover={{ bg: 'transparent' }}>
                  <Box flex="1" textAlign="left">
                    <Text fontSize="15px" fontWeight="600" color={titleColor}>
                      {column.title}
                    </Text>
                  </Box>
                  <AccordionIcon color={mutedColor} />
                </AccordionButton>
                <AccordionPanel px="0" pb="12px">
                  {visibleLinks(column.links).map((link) => (
                    <FooterLink
                      key={`${column.title}-m-${link.name}`}
                      link={link}
                      color={linkColor}
                      accentColor={accentColor}
                      // 44px keeps every row above the minimum touch target.
                      minH="44px"
                    />
                  ))}
                </AccordionPanel>
              </AccordionItem>
            ))}
          </Accordion>
        </Flex>

        <Divider borderColor={borderColor} />

        {/* ---- bottom strip ---- */}
        <Flex
          direction={{ base: 'column', md: 'row' }}
          align={{ base: 'center', md: 'center' }}
          justify="space-between"
          py="20px"
        >
          <Text fontSize="13px" color={mutedColor} textAlign={{ base: 'center', md: 'start' }}>
            &copy; {new Date().getFullYear()} {getLangText('COMPANY_NAME')}. {getLangText('FOOTER_RIGHTS')}
          </Text>

          <Flex
            wrap="wrap"
            justify="center"
            mt={{ base: '12px', md: '0' }}
            align="center"
          >
            {legalLinks.map((link, index) => (
              <Flex key={link.name} align="center">
                {index > 0 && (
                  <Box w="1px" h="12px" bg={borderColor} mx="10px" display={{ base: 'none', sm: 'block' }} />
                )}
                <NavLink to={link.path}>
                  <Text
                    fontSize="13px"
                    color={mutedColor}
                    px={{ base: '8px', sm: '0' }}
                    py={{ base: '4px', sm: '0' }}
                    _hover={{ color: accentColor }}
                  >
                    {link.name}
                  </Text>
                </NavLink>
              </Flex>
            ))}

            <Flex
              align="center"
              ms={{ base: '0', md: '20px' }}
              mt={{ base: '8px', md: '0' }}
              cursor="pointer"
              onClick={scrollToTop}
              _hover={{ color: accentColor }}
              color={mutedColor}
            >
              <Icon as={FiArrowUp} boxSize="14px" me="6px" />
              <Text fontSize="13px">{getLangText('FOOTER_BACK_TO_TOP')}</Text>
            </Flex>
          </Flex>
        </Flex>
      </SiteContainer>
    </Box>
  );
};

/** External links leave the SPA, so they cannot go through NavLink. */
const FooterLink = ({ link, color, accentColor, minH }) => {
  const body = (
    <Flex align="center" minH={minH || '30px'}>
      <Text fontSize="14px" color={color} _hover={{ color: accentColor }} transition="color 0.15s ease">
        {link.name}
      </Text>
    </Flex>
  );

  if (link.external) {
    return (
      <Box as="a" href={link.path} display="block">
        {body}
      </Box>
    );
  }

  return (
    <Box as={NavLink} to={link.path} display="block">
      {body}
    </Box>
  );
};

const FooterButton = ({ to, children, borderColor, color }) => (
  <Box as={NavLink} to={to}>
    <Flex
      align="center"
      justify="center"
      h="36px"
      px="16px"
      me="8px"
      mb="8px"
      borderWidth="1px"
      borderColor={borderColor}
      borderRadius="md"
      _hover={{ borderColor: 'brand.500', color: 'brand.600' }}
      transition="border-color 0.15s ease, color 0.15s ease"
    >
      <Text fontSize="13px" color={color} whiteSpace="nowrap">
        {children}
      </Text>
    </Flex>
  </Box>
);

export default ClientFooter;
