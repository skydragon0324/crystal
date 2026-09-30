import React, { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Flex,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalOverlay,
  Text
} from '@chakra-ui/react';

import AdvertVideo from '@/components/common/AdvertVideo';
import Picture from '@/components/common/Picture';
import { useVerifiedImages } from '@/components/security/hooks';
import { STATES } from '@/security/verifySignature';
import { fileUrl } from '@/api/client';
import api from '@/api';
import { useApi } from '@/hooks/useApi';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * THE ADVERTS THAT OPEN OVER THE HOMEPAGE.
 *
 * The console runs them with a period - first day and last day, inclusive -
 * and the server sends only what is live today (site_popups, sql/deltas/034).
 * Everything else about when a visitor sees one is decided here, because it
 * is about this browser rather than about the campaign.
 *
 * ONCE PER SESSION, NOT ONCE PER PAGE. A reader who opens the homepage, goes
 * to a product and comes back is interrupted ONCE. Tomorrow, or in a new
 * window, they are interrupted again - which is what "session" means and why
 * `sessionStorage` rather than `localStorage` is the right shelf for it.
 *
 * THE IDS ARE REMEMBERED, NOT A FLAG. A campaign published this afternoon is
 * shown to somebody who has been reading all day, because the ids it holds
 * are not the ids they were shown. A flag would have hidden it until they
 * closed their browser.
 *
 * ONE DIALOG FOR ALL OF THEM, clicked through in the console's order: the
 * picture IS the button to the next one. Three live campaigns are one
 * interruption rather than three, which is the difference between a site
 * somebody keeps reading and a site somebody leaves.
 *
 * THE CLOSE BUTTON IS THERE FROM THE FIRST FRAME. Making somebody click
 * through every advert to escape is the pattern that gets sites blocked, and
 * Escape closes it as it does every dialog on the site. Clicking past the
 * LAST one closes it too, so the natural way through it is also a way out.
 *
 * A LINK IS A BUTTON, NOT THE PICTURE. The picture already does something -
 * it advances - so an advert that goes somewhere gets its own button
 * underneath. A picture that sometimes advanced and sometimes navigated
 * would be a trap.
 */

/** Where this browser remembers the popups it has already been shown. */
const SEEN_KEY = 'crystal.popups.seen';

function seenIds() {
  try {
    const held = window.sessionStorage.getItem(SEEN_KEY);
    return held ? String(held).split(',').filter(Boolean) : [];
  } catch (error) {
    /* A private window refuses storage; better shown twice than never. */
    return [];
  }
}

function rememberSeen(ids) {
  try {
    const all = seenIds().concat(ids.map(String));
    const unique = all.filter((id, at) => all.indexOf(id) === at);
    window.sessionStorage.setItem(SEEN_KEY, unique.join(','));
  } catch (error) { /* nothing to remember it in */ }
}

export default function PopupAdverts() {
  const t = useT();
  const surface = useSurface();

  const popups = useApi(() => api.site.popups(), []);

  const [isOpen, setOpen] = useState(false);
  const [at, setAt] = useState(0);

  /*
   * What this visitor has not been shown yet, in the console's order. Held
   * from the moment the reply arrives, so dismissing one does not re-filter
   * the list under the dialog while it is open.
   */
  const unseen = useMemo(() => {
    const rows = (popups.data || []);
    if (!rows.length) return [];

    const seen = seenIds();
    return rows.filter((row) => seen.indexOf(String(row.id)) === -1);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [popups.data]);

  useEffect(() => {
    if (!unseen.length) return;
    setAt(0);
    setOpen(true);
    /* Seen is "shown at all", recorded once: closing early still counts. */
    rememberSeen(unseen.map((row) => row.id));
  }, [unseen]);

  /*
   * Every picture in the run is verified, exactly as the hero's are - one
   * hook call for the whole set, so the next one is ready before it is
   * reached. A film carries no envelope and is asked nothing.
   */
  const verification = useVerifiedImages(
    unseen.map((row) => (row.media_type === 'video'
      ? { integrity: null, expectedPath: null }
      : { integrity: row.integrity, expectedPath: row.file_path }))
  );

  const advert = unseen[at];
  const checked = verification[at];
  const isVideo = !!advert && advert.media_type === 'video';
  const isLast = at >= unseen.length - 1;

  /* Checked and refused: the bytes are not what was signed. */
  const refused = !isVideo && !!checked
    && checked.state !== STATES.CHECKING
    && checked.state !== STATES.VERIFIED;

  return (
    <PopupDialog
      isOpen={isOpen && !!advert}
      onClose={() => setOpen(false)}
      unseen={unseen}
      at={at}
      setAt={setAt}
      advert={advert}
      checked={checked}
      isVideo={isVideo}
      isLast={isLast}
      refused={refused}
      surface={surface}
      t={t}
    />
  );
}

/**
 * The dialog itself, split out so the decision above - which advert, and
 * whether it survived its signature - is made in one place and drawn in
 * another.
 */
function PopupDialog(props) {
  const {
    isOpen, onClose, unseen, at, setAt, advert, checked, isVideo, isLast, refused, surface, t
  } = props;

  /*
   * A REFUSED PICTURE IS SKIPPED, and skipped HERE rather than during the
   * render that noticed it: moving to the next advert is a state change, and
   * a state change made while rendering is the loop React warns about.
   */
  useEffect(() => {
    if (!isOpen || !refused) return;
    if (isLast) onClose();
    else setAt((current) => current + 1);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [isOpen, refused, isLast, at]);

  if (!advert) return null;

  const next = () => {
    if (isLast) {
      onClose();
      return;
    }
    setAt((current) => current + 1);
  };

  const goesTo = advert.link_url || '';
  const isExternalLink = /^https?:\/\//i.test(goesTo);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      isCentered
      size="xl"
      motionPreset="slideInBottom"
    >
      <ModalOverlay bg="blackAlpha.700" />
      <ModalContent bg={surface.card} borderRadius="16px" overflow="hidden" mx="4">
        {/* Always reachable, from the first advert onward. */}
        <ModalCloseButton
          zIndex="2"
          color="white"
          bg="blackAlpha.500"
          borderRadius="999px"
          _hover={{ bg: 'blackAlpha.700' }}
          aria-label={t('common.close')}
        />

        <ModalBody p="0">
          {/*
            * THE PICTURE IS THE WAY ON. It is a button, and it says so - a
            * screen reader is told which advert this is and that activating
            * it brings the next, rather than being handed an image with a
            * click handler bolted to it.
            */}
          <Box
            as="button"
            type="button"
            onClick={next}
            display="block"
            w="100%"
            position="relative"
            /*
              * A TALL BOX, AND NOTHING CROPPED INSIDE IT.
              *
              * The artwork is whatever shape the campaign was drawn in -
              * a portrait phone advert, a landscape banner reused from the
              * hero - and `cover` would cut the ends off half of them,
              * usually the half with the words on. `contain` shows every
              * advert whole, on the dialog's own ground, at the cost of a
              * band above and below a wide one - kept small by giving the
              * phone a tall box and the desktop a wide one, which is the way
              * round campaigns are drawn.
              */
            pb={{ base: '125%', md: '70%' }}
            bg={surface.raised}
            aria-label={isLast
              ? t('components.popupadverts.closeTheAdverts')
              : t('components.popupadverts.theNextAdvert', { number: at + 2, total: unseen.length })}
            _focusVisible={{ outline: '2px solid', outlineColor: 'brand.500', outlineOffset: '-2px' }}
          >
            {isVideo ? (
              <AdvertVideo
                path={advert.file_path}
                altText={advert.alt_text || ''}
                active
                fit="contain"
              />
            ) : (
              <Box position="absolute" top="0" right="0" bottom="0" left="0">
                <Picture
                  verification={checked}
                  src={fileUrl(advert.file_path)}
                  alt={advert.alt_text || ''}
                  height="100%"
                  rounded={false}
                  fit="contain"
                  eager
                />
              </Box>
            )}
          </Box>

          <Flex
            align="center"
            justify="space-between"
            gap="3"
            data-gap="12"
            px={{ base: 4, md: 5 }}
            py="3"
            borderTop="1px solid"
            borderColor={surface.border}
          >
            {/* Where in the run this is - so the close button is an informed choice. */}
            <Text fontSize="xs" color={surface.muted}>
              {unseen.length > 1
                ? t('components.popupadverts.advertOfTotal', { number: at + 1, total: unseen.length })
                : t('components.popupadverts.advertisement')}
            </Text>

            <Flex align="center" gap="2" data-gap="8">
              {goesTo && (
                <Button
                  size="sm"
                  variant="brand"
                  {...(isExternalLink
                    ? { as: 'a', href: goesTo }
                    : { as: RouterLink, to: goesTo, onClick: onClose })}
                >
                  {t('common.learnMore')}
                </Button>
              )}

              <Button size="sm" variant="quiet" onClick={next}>
                {isLast ? t('common.close') : t('common.next')}
              </Button>
            </Flex>
          </Flex>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
