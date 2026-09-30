import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Container,
  Link,
  SimpleGrid,
  Stack,
  Text
} from '@chakra-ui/react';
import { branchLinks, SITE_BRANCHES } from './siteNav';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/** The panel's id, for the headings' aria-controls. */
export const MENU_PANEL_ID = 'site-menu-panel';

/**
 * The desktop menu panel: a full-bleed panel of text-link columns, in the
 * apple.com manner, ONE COLUMN PER BRANCH OF THE SITE MENU (siteNav.SITE_NAV).
 *
 * THE COLUMNS ARE THE PHONE'S BRANCHES, entry for entry. They used to be built
 * here from the live category tree, with a "Shop" column of two external
 * links, which is how the desktop ended up with an Eshop that only left the
 * site while the phone's Eshop opened onto the member's cards, orders and
 * the rest. Both menus read the same list now, and tests/menuParity.test.js
 * holds them to it.
 *
 * WHAT IT SHOWS IS THE WHOLE MENU, whichever heading opened it - the site's
 * structure in one steady panel rather than a box that changes shape as the
 * pointer travels along the bar. The heading that opened it is marked by its
 * column: the title turns brand-coloured, and that column is where keyboard
 * focus lands.
 *
 * Deliberately no product tiles. A grid of thumbnails in a menu is slower to
 * scan than a list of names, needs images loaded before it is usable, and
 * pushes the actual navigation below the fold on a laptop. And nothing here is
 * fetched, so there is nothing to wait for and no skeleton.
 *
 * CLOSED MEANS HIDDEN, NOT JUST INVISIBLE. The panel collapses to nothing and
 * fades, and it is also `visibility: hidden`, because a panel that is only
 * transparent still has thirty links in the tab order, and a keyboard user
 * walking the header would wander through a menu nobody can see.
 *
 * THE VISIBILITY IS TRANSITIONED ONE WAY ONLY. Closing, it waits out the
 * collapse, so the panel stays drawn while it folds. Opening, it must NOT
 * wait: the first frame of a hidden-to-visible transition is still hidden,
 * and that is the frame in which the header moves keyboard focus into the
 * column - a hidden link refuses focus without a word, so Enter opened the
 * panel and left focus on the heading. Only a real browser shows this; jsdom
 * runs no transitions.
 */
const MegaPanel = React.forwardRef(function MegaPanel({ menu, onMouseEnter, onClose }, ref) {
  const t = useT();
  const surface = useSurface();

  const isOpen = !!menu;

  return (
    <Box
      ref={ref}
      id={MENU_PANEL_ID}
      position="absolute"
      left="0"
      right="0"
      top="100%"
      bg={surface.card}
      borderBottom="1px solid"
      borderColor={surface.border}
      boxShadow={isOpen ? surface.shadowLifted : 'none'}
      // Animating max-height rather than mounting/unmounting keeps the panel
      // out of the layout when closed without a mount cost on every hover.
      maxH={isOpen ? '460px' : '0'}
      opacity={isOpen ? 1 : 0}
      visibility={isOpen ? 'visible' : 'hidden'}
      overflow="hidden"
      transition={`max-height 220ms ease, opacity 160ms ease, visibility ${isOpen ? '0s' : '220ms'}`}
      pointerEvents={isOpen ? 'auto' : 'none'}
      onMouseEnter={onMouseEnter}
      aria-hidden={!isOpen}
    >
      <Container maxW="container.site" py="8">
        <SimpleGrid columns={SITE_BRANCHES.length} spacing={{ base: 6, xl: 8 }}>
          {SITE_BRANCHES.map((branch) => {
            const titleId = `${MENU_PANEL_ID}-${branch.key}`;
            const opener = branch.key === menu;

            return (
              <Box key={branch.key} data-menu-column={branch.key} minW="0">
                <Text
                  id={titleId}
                  fontSize="xs"
                  fontWeight="700"
                  letterSpacing="0.6px"
                  textTransform="uppercase"
                  color={opener ? 'brand.500' : surface.muted}
                  mb="3"
                >
                  {t(branch.label)}
                </Text>

                {/*
                  * A LIST, named by its title - so a screen reader says
                  * "Crystal Eshop, list, six items" on the way in rather
                  * than reading a run of links with nothing to group them.
                  */}
                <Stack as="ul" aria-labelledby={titleId} spacing="3" listStyleType="none" m="0" p="0">
                  {branchLinks(branch).map((link) => (
                    <Box as="li" key={link.external ? link.href : link.to}>
                      {/*
                        * A STORE READS AS A PAGE OF THIS SITE. No icon, no
                        * new tab - the two shops are Crystal to the people
                        * shopping in them, so they are followed in place like
                        * every other row here. The bar and the phone say the
                        * same; see the note in Header.js.
                        */}
                      <Link
                        {...(link.external
                          ? { href: link.href }
                          : { as: RouterLink, to: link.to, onClick: onClose })}
                        fontSize="md"
                        fontWeight="500"
                        color={surface.text}
                        _hover={{ color: 'brand.500', textDecoration: 'none' }}
                      >
                        {t(link.label)}
                      </Link>
                    </Box>
                  ))}
                </Stack>
              </Box>
            );
          })}
        </SimpleGrid>
      </Container>
    </Box>
  );
});

export default MegaPanel;
