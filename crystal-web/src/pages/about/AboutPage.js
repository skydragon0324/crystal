import React, { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Box, useBreakpointValue } from '@chakra-ui/react';

import { Section } from '@/components/common';
import AboutSectionNav from './components/AboutSectionNav';
import AboutMobileNav from './components/AboutMobileNav';
import ChapterNavigation from './components/ChapterNavigation';
import GrowthSection from './components/GrowthSection';
import OverviewSection from './components/OverviewSection';
import BusinessesSection from './components/BusinessesSection';
import RecognitionSection from './components/RecognitionSection';
import HistorySection from './components/HistorySection';
import InstituteSection from './components/InstituteSection';
import FactorySection from './components/FactorySection';
import ShopSection from './components/ShopSection';
import ServiceSection from './components/ServiceSection';
import PresenceSection from './components/PresenceSection';
import useActiveAboutSection from './hooks/useActiveAboutSection';
import { CHAPTER_ALIASES, SCROLL_OFFSET, SHOW_CHAPTER_NAVIGATION } from './constants';
import { scrollToSection, writeHash } from './utils';
import { useI18n } from '@/i18n';
import { buildAbout } from './content';
import ABOUT_IMAGES from './images';

/**
 * THE COMPANY INTRODUCTION: ten chapters, one request, one story.
 *
 * This file coordinates and does not draw. It loads the page, holds which
 * chapter is being read, owns the URL hash, and hands each chapter its own
 * slice of the reply - the markup for a chapter lives in its own component,
 * because ten compositions in one file is how they stop being ten different
 * compositions.
 *
 * THE WORDS AND FIGURES ARE IN content.js; THE PICTURES ARE IN images.js,
 * and both of them are in this bundle - so the page fetches nothing at all.
 * The only things written here are structural: the chapter ids, which are
 * anchors and therefore a contract, and the order they are told in.
 */

/** Each chapter's band, in order, with the data it is given. */
function chapters(data) {
  return [
    {
      id: 'overview',
      render: () => <OverviewSection section={data.overview} facts={data.facts} />
    },
    {
      id: 'businesses',
      render: () => (
        <BusinessesSection
          vision={data.vision}
          section={data.businesses.overview}
          businesses={data.businesses.items}
        />
      )
    },
    {
      id: 'growth',
      render: () => <GrowthSection growth={data.growth} />
    },
    {
      id: 'recognition',
      render: () => (
        <RecognitionSection
          section={data.recognition.overview}
          certificates={data.recognition.certificates}
        />
      )
    },
    {
      id: 'history',
      render: () => (
        <HistorySection section={data.history.overview} events={data.history.events} />
      )
    },
    {
      id: 'institute',
      render: () => (
        <InstituteSection
          section={data.institute.overview}
          researchAreas={data.institute.researchAreas}
          technology={data.institute.technology}
        />
      )
    },
    {
      id: 'factory',
      render: () => (
        <FactorySection
          section={data.factory.overview}
          manufacturing={data.factory.manufacturing}
          certificates={data.factory.certificates}
        />
      )
    },
    {
      id: 'shop',
      render: () => <ShopSection section={data.shop.overview} floors={data.shop.floors} />
    },
    {
      id: 'service',
      render: () => (
        <ServiceSection section={data.service.overview} services={data.service.services} />
      )
    },
    {
      id: 'presence',
      render: () => (
        <PresenceSection
          section={data.presence.overview}
          locations={data.presence.locations}
        />
      )
    }
  ];
}

export default function AboutPage() {
  const location = useLocation();
  const { locale } = useI18n();

  /*
   * NOTHING IS FETCHED, AND THE ABSENCE OF THE REQUEST IS THE POINT.
   *
   * /about once answered with the whole page - eleven chapters of copy out of
   * three tables - and then with an image map alone. It answers with nothing
   * now, because there is no endpoint: the words are content.js, the
   * photographs are images.js, and `buildAbout` marries the two into the same
   * object the sections have always consumed. There is no loading state
   * because there is nothing to wait for, and no error branch because there
   * is nothing left that can fail.
   */
  /*
   * THE LOCALE IS A BUILD INPUT, not a lookup at every sentence.
   *
   * This page is prose rather than interface, so the whole of it is
   * assembled in one language at once - see content.zh.js.
   */
  const page = buildAbout(ABOUT_IMAGES, locale);

  /*
   * The chapter observer starts watching immediately. It used to be held back
   * until the reply arrived, so that it did not measure a skeleton whose
   * sections were about to change height; every section is its final height on
   * the first paint now.
   */
  const [active, setActive] = useActiveAboutSection(true);

  /* The two sticky bars are different heights, so the scroll offset is too. */
  const offset = useBreakpointValue(SCROLL_OFFSET) || SCROLL_OFFSET.md;

  /*
   * A hash arriving with the page is only honoured ONCE. Honouring it more
   * than once would fight the reader every time the observer wrote the hash
   * back - which is still the reason, now that there is no reply to wait for.
   */
  const jumped = useRef(false);

  const go = useCallback((id) => {
    setActive(id);
    writeHash(id);
    scrollToSection(id, offset);
  }, [offset, setActive]);

  useEffect(() => {
    if (jumped.current) return;

    const raw = String(location.hash || '').replace('#', '');
    /* A chapter that was folded into another still answers its old anchor. */
    const id = CHAPTER_ALIASES[raw] || raw;
    jumped.current = true;
    if (!id) return;

    /*
     * One frame later: the sections have just been committed to the DOM and
     * their offsets are not final until the browser has laid them out.
     */
    window.requestAnimationFrame(function () {
      setActive(id);
      scrollToSection(id, offset);
    });
  }, [location.hash, offset, setActive]);

  /* Scrolling rewrites the hash, so a copied URL is the chapter on screen. */
  useEffect(() => {
    if (!jumped.current) return;
    writeHash(active);
  }, [active]);

  return (
    <Box>
      {/* One navigator per layout, and only one of them is ever mounted -
          they answer different questions, not the same one at two sizes. */}
      <AboutSectionNav active={active} onSelect={go} />
      <AboutMobileNav active={active} onSelect={go} />

      {chapters(page).map((chapter, index, all) => (
        <Section
          key={chapter.id}
          id={chapter.id}
          /*
           * ALTERNATE BY POSITION, not by a flag on each chapter. The flags were
           * written per chapter, so folding Manufacturing into Factory left two
           * tinted bands touching - the one place the alternation is visible
           * is the place it broke.
           */
          tinted={index % 2 === 1}
          py={{ base: 12, md: 20 }}
          /*
           * `scroll-margin-top` is the belt to the offset's braces: it is what
           * makes a browser's OWN anchor handling - a hash typed into the bar,
           * or the jump a reduced-motion reader gets - clear the sticky bars
           * too, without this file being involved.
           */
          sx={{ scrollMarginTop: { base: '116px', md: '148px' } }}
        >
          {chapter.render()}

          {/* Not after the last one: there is nothing next, and a lone
              backward link under the final chapter reads as a dead end.
              Hidden entirely at the moment - see SHOW_CHAPTER_NAVIGATION. */}
          {SHOW_CHAPTER_NAVIGATION && index < all.length - 1 && (
            <ChapterNavigation id={chapter.id} onSelect={go} />
          )}
        </Section>
      ))}
    </Box>
  );
}
