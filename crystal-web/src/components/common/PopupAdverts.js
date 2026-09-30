import React, { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalOverlay
} from '@chakra-ui/react';

import AdvertVideo from '@/components/common/AdvertVideo';
import Picture from '@/components/common/Picture';
import { useVerifiedImages } from '@/components/security/hooks';
import { STATES } from '@/security/verifySignature';
import { fileUrl } from '@/api/client';
import api from '@/api';
import { useApi } from '@/hooks/useApi';
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
 * IT IS THE WHOLE SCREEN, AND IT CARRIES NOTHING BUT THE ADVERT. No counter,
 * no "next", no "learn more": a full-screen advert with a toolbar under it
 * reads as a web page about an advert rather than as the advert. What is left
 * is the artwork, which advances when it is clicked, and the X, which closes.
 *
 * A CAMPAIGN THAT GOES SOMEWHERE SAYS SO IN A CORNER. `link_url` is followed
 * by one small button on the artwork, at the opposite edge from the speaker
 * and diagonally away from the close button, so the three controls on a
 * full-screen advert are never under the same thumb.
 *
 * The PICTURE still only ever advances. A picture that sometimes advanced
 * and sometimes navigated would be a trap: a visitor reaching for the next
 * advert must not be sent off the site by the same gesture. So the button
 * takes its own click and stops it there.
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
    isOpen, onClose, unseen, at, setAt, advert, checked, isVideo, isLast, refused, t
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
      /* The advert IS the screen - no dialog frame, no margins, no furniture. */
      size="full"
      motionPreset="fade"
    >
      <ModalOverlay bg="blackAlpha.900" />
      <ModalContent
        bg="black"
        m="0"
        borderRadius="0"
        overflow="hidden"
        position="relative"
      >
        {/*
          * THE ONLY CONTROL ON IT.
          *
          * There is no counter, no "next" and no "learn more" any more: a
          * full-screen advert with a toolbar under it reads as a web page
          * about an advert. The picture is the way on, the X is the way out,
          * and both are things a visitor already knows how to use.
          */}
        <ModalCloseButton
          zIndex="4"
          top={{ base: 3, md: 5 }}
          right={{ base: 3, md: 5 }}
          size="lg"
          color="white"
          bg="blackAlpha.600"
          borderRadius="999px"
          _hover={{ bg: 'blackAlpha.800' }}
          aria-label={t('common.close')}
        />

        <ModalBody p="0" position="relative">
          {/*
            * NOTHING IS CROPPED. The artwork is whatever shape the campaign
            * was drawn in - a portrait phone advert, a landscape banner
            * reused from the hero - and `contain` shows every one of them
            * whole against the black, rather than cutting the ends off half
            * of them, usually the half with the words on.
            */}
          <Box position="absolute" top="0" right="0" bottom="0" left="0">
            {isVideo ? (
              <AdvertVideo
                path={advert.file_path}
                altText={advert.alt_text || ''}
                active
                fit="contain"
                /* Not the top right - that corner is the close button. */
                corner="bottom-left"
              />
            ) : (
              <Picture
                verification={checked}
                src={fileUrl(advert.file_path)}
                alt={advert.alt_text || ''}
                height="100%"
                rounded={false}
                fit="contain"
                eager
              />
            )}
          </Box>

          {/*
            * THE WAY ON, laid OVER the advert rather than wrapped around it.
            *
            * It was the wrapper until a film went in one: a <button> inside a
            * <button> is invalid, and the sound control inside it passed its
            * clicks up to this one - so turning the sound on dismissed the
            * popup. As a sibling it takes the clicks nothing else wanted, and
            * the speaker, drawn above it, takes its own.
            *
            * It is a real button with a real label, so a screen reader is
            * told which advert this is and what activating it does, and a
            * keyboard can reach it.
            */}
          <Box
            as="button"
            type="button"
            onClick={next}
            position="absolute"
            top="0"
            right="0"
            bottom="0"
            left="0"
            zIndex="2"
            w="100%"
            aria-label={isLast
              ? t('components.popupadverts.closeTheAdverts')
              : t('components.popupadverts.theNextAdvert', { number: at + 2, total: unseen.length })}
            _focusVisible={{ outline: '2px solid', outlineColor: 'brand.500', outlineOffset: '-4px' }}
          />

          {/*
            * WHERE THE ADVERT GOES, if it goes anywhere.
            *
            * Above the surface that advances - z-index again - and it stops
            * its own click there, so this navigates and the picture around it
            * still turns the page. An address that leaves the site is a real
            * anchor; anything else is a route, and following it closes the
            * popup rather than leaving it hanging over the page it opened.
            */}
          {goesTo && (
            <Button
              {...(isExternalLink
                ? { as: 'a', href: goesTo }
                : { as: RouterLink, to: goesTo })}
              onClick={(event) => {
                event.stopPropagation();
                if (!isExternalLink) onClose();
              }}
              position="absolute"
              /*
                * BOTTOM CENTRE, which is where it lands ON the artwork.
                *
                * The picture is drawn `contain`, so it is always centred and
                * always touches either the top and bottom edges or the left
                * and right ones. A button in a corner sits on the black beside
                * a portrait advert on a wide screen; the middle of the bottom
                * edge is over the picture for every tall one and for every
                * advert on a phone, which is most of them. It is also where a
                * reader looks for the call to action on a full-screen advert.
                */
              bottom={{ base: 5, md: 8 }}
              left="50%"
              transform="translateX(-50%)"
              zIndex="3"
              variant="brand"
              size="lg"
              borderRadius="999px"
              px="7"
              boxShadow="0 10px 30px rgba(0, 0, 0, 0.45)"
            >
              {t('common.learnMore')}
            </Button>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
