import React, { useEffect, useRef, useState } from 'react';
import { Box, Tooltip } from '@chakra-ui/react';

import { fileUrl } from '@/api/client';
import { useT } from '@/i18n';

/**
 * A HERO SLIDE OR A POPUP THAT MOVES.
 *
 * WHY IT IS NOT VERIFIED, unlike every picture beside it. A signature is
 * checked by hashing the whole file, and an advert film is allowed to be
 * sixty megabytes: hashing that in the browser before the first frame appears
 * is not a carousel, it is a download with a spinner. So a video is checked
 * at the door instead - the server sniffs the stored bytes and refuses
 * anything that is not really MP4 or WebM (middleware/upload.js) - and is
 * played from its ordinary address. An animated GIF is an image and IS
 * verified, like every other image on the page.
 *
 * SOUND: WANTED, AND NOT IN OUR GIFT.
 *
 * No browser will autoplay a video that can be heard. Chrome, Safari and
 * Firefox all require `muted` for a video that starts by itself; with sound
 * on, `play()` is REJECTED and the advert sits frozen on its first frame,
 * which is worse than silence. What they do allow is sound after the visitor
 * has interacted with the page at all.
 *
 * So every video ASKS FOR SOUND FIRST and falls back to muted when it is
 * refused - which means the popup's second slide, reached by a click, plays
 * aloud where the first could not - and a speaker button is always drawn, so
 * turning the sound on is one tap. The choice is remembered for the session
 * (`sessionStorage`), so the next video a visitor meets starts the way they
 * left the last one.
 *
 * It is muted, loop, playsInline and controls-less because it is ADVERTISING:
 * a control bar over artwork is furniture, and `playsInline` is what stops
 * iOS throwing the film into its own fullscreen player.
 */

/** Where the session's answer to "sound on?" is kept. */
const SOUND_KEY = 'crystal.advert.sound';

export function soundWanted() {
  try {
    return window.sessionStorage.getItem(SOUND_KEY) === 'on';
  } catch (error) {
    /* Private windows refuse storage; silence is the safe default. */
    return false;
  }
}

function rememberSound(on) {
  try {
    window.sessionStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch (error) { /* nothing to remember it in */ }
}

function SpeakerIcon({ muted }) {
  return (
    <Box as="span" display="flex" alignItems="center" justifyContent="center" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M4 9v6h4l5 4V5L8 9H4z" />
        {muted
          ? <path d="M16 8.5l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
          : <path d="M16.5 8a5 5 0 0 1 0 8" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />}
      </svg>
    </Box>
  );
}

/*
 * WHERE THE SPEAKER SITS.
 *
 * Top right on a hero slide, where nothing else is. NOT there in a popup:
 * that corner belongs to the dialog's close button, and two round buttons in
 * one corner is a visitor tapping the wrong one and losing the advert they
 * were about to turn the sound on for.
 */
const CORNERS = {
  'top-right': { top: { base: '10px', md: '14px' }, right: { base: '10px', md: '14px' } },
  'bottom-left': { bottom: { base: '10px', md: '14px' }, left: { base: '10px', md: '14px' } }
};

export default function AdvertVideo({ path, altText, active, fit, corner, onDuration, onEnded }) {
  const t = useT();

  const videoRef = useRef(null);
  const [muted, setMuted] = useState(!soundWanted());

  /*
   * PLAY ONLY WHAT IS BEING LOOKED AT.
   *
   * A deck of four films would otherwise have four of them running behind
   * each other, which is four downloads and, the moment one of them is
   * allowed sound, four soundtracks at once.
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!active) {
      video.pause();
      return;
    }

    let cancelled = false;

    /* Ask for sound; accept silence rather than a frozen first frame. */
    const start = async () => {
      video.muted = !soundWanted();
      try {
        await video.play();
        if (!cancelled) setMuted(video.muted);
        return;
      } catch (error) {
        if (cancelled) return;
      }

      video.muted = true;
      if (!cancelled) setMuted(true);
      try {
        await video.play();
      } catch (error) {
        /* Autoplay refused outright - the poster frame stays, which is legible. */
      }
    };

    start();
    return () => { cancelled = true; };
  }, [active, path]);

  const toggleSound = (event) => {
    /*
     * THE CLICK STOPS HERE.
     *
     * This button sits ON an advert, and an advert is itself something to
     * click: the popup's picture turns to the next one, and a hero slide with
     * a link follows it. Without this, turning the sound on dismissed the
     * popup or navigated away - the visitor asked to hear the advert and was
     * taken off it instead.
     */
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const video = videoRef.current;
    const next = !muted;

    setMuted(next);
    rememberSound(!next);
    if (!video) return;

    video.muted = next;
    /* Turning sound ON is a gesture, so this play() is one the browser allows. */
    if (!next) {
      const played = video.play();
      if (played && typeof played.catch === 'function') played.catch(() => {});
    }
  };

  return (
    <Box position="absolute" top="0" right="0" bottom="0" left="0">
      <Box
        as="video"
        ref={videoRef}
        src={fileUrl(path)}
        /* The slide beside this one is not downloaded until it is the slide. */
        preload={active ? 'auto' : 'none'}
        loop
        playsInline
        muted={muted}
        aria-label={altText || undefined}
        w="100%"
        h="100%"
        sx={{ objectFit: fit || 'cover' }}
        onLoadedMetadata={(event) => {
          if (onDuration) onDuration(event.target.duration);
        }}
        onEnded={onEnded}
      />

      <Tooltip
        label={muted ? t('components.advertvideo.turnTheSoundOn') : t('components.advertvideo.turnTheSoundOff')}
        placement="left"
        openDelay={350}
        hasArrow
      >
        <Box
          as="button"
          type="button"
          onClick={toggleSound}
          aria-label={muted ? t('components.advertvideo.turnTheSoundOn') : t('components.advertvideo.turnTheSoundOff')}
          aria-pressed={!muted}
          position="absolute"
          {...(CORNERS[corner] || CORNERS['top-right'])}
          /*
           * ABOVE WHATEVER COVERS THE ADVERT. Both places that show a film
           * lay a full-bleed target over it - the popup's "next" surface, a
           * hero slide's link - and the last one drawn would otherwise take
           * every click, including the ones aimed at this.
           */
          zIndex="3"
          w="34px"
          h="34px"
          display="flex"
          alignItems="center"
          justifyContent="center"
          borderRadius="999px"
          color="white"
          bg="blackAlpha.500"
          sx={{ backdropFilter: 'blur(6px)' }}
          _hover={{ bg: 'blackAlpha.700' }}
          _focusVisible={{ outline: '2px solid white', outlineOffset: '2px' }}
        >
          <SpeakerIcon muted={muted} />
        </Box>
      </Tooltip>
    </Box>
  );
}
