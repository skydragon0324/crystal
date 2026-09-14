import React, { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Box, useBreakpointValue } from '@chakra-ui/react';

import { Loading, Section } from '@/components/common';
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
import ManufacturingSection from './components/ManufacturingSection';
import ShopSection from './components/ShopSection';
import ServiceSection from './components/ServiceSection';
import PresenceSection from './components/PresenceSection';
import useActiveAboutSection from './hooks/useActiveAboutSection';
import { SCROLL_OFFSET } from './constants';
import { scrollToSection, writeHash } from './utils';
import api from '@/api';
import { useApi } from '@/hooks/useApi';
import { useI18n } from '@/i18n';
import { buildAbout } from './content';

/**
 * THE COMPANY INTRODUCTION: ten chapters, one request, one story.
 *
 * This file coordinates and does not draw. It loads the page, holds which
 * chapter is being read, owns the URL hash, and hands each chapter its own
 * slice of the reply - the markup for a chapter lives in its own component,
 * because ten compositions in one file is how they stop being ten different
 * compositions.
 *
 * NOT HARDCODED, ANY OF IT. Every sentence, every figure, every picture and
 * every list on this page is a row somebody edits in the console. The only
 * things written here are structural: the chapter ids, which are anchors and
 * therefore a contract, and the order they are told in.
 */

/** Each chapter's band, in order, with the data it is given. */
function chapters(data) {
  return [
    {
      id: 'overview',
      tinted: false,
      render: () => <OverviewSection section={data.overview} facts={data.facts} />
    },
    {
      id: 'businesses',
      tinted: true,
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
      tinted: false,
      render: () => (
        <RecognitionSection
          section={data.recognition.overview}
          featured={data.recognition.featured}
          certificates={data.recognition.certificates}
        />
      )
    },
    {
      id: 'history',
      tinted: true,
      render: () => (
        <HistorySection section={data.history.overview} events={data.history.events} />
      )
    },
    {
      id: 'institute',
      tinted: false,
      render: () => (
        <InstituteSection
          section={data.institute.overview}
          researchAreas={data.institute.researchAreas}
        />
      )
    },
    {
      id: 'factory',
      tinted: true,
      render: () => (
        <FactorySection
          section={data.factory.overview}
          capabilities={data.factory.capabilities}
          certificates={data.factory.certificates}
        />
      )
    },
    {
      id: 'manufacturing',
      tinted: false,
      render: () => (
        <ManufacturingSection
          section={data.manufacturing.overview}
          capabilities={data.manufacturing.capabilities}
          flow={data.manufacturing.flow}
        />
      )
    },
    {
      id: 'shop',
      tinted: true,
      render: () => <ShopSection section={data.shop.overview} floors={data.shop.floors} />
    },
    {
      id: 'service',
      tinted: false,
      render: () => (
        <ServiceSection section={data.service.overview} services={data.service.services} />
      )
    },
    {
      id: 'presence',
      tinted: true,
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
   * THE WORDS ARE IMPORTED; ONLY THE PICTURES ARE FETCHED.
   *
   * /about used to answer with the whole page - eleven chapters of copy out of
   * three tables. It answers with an image map now, and `buildAbout` marries
   * that to content.js to produce the same object the sections always
   * consumed. See content.js for why the copy moved.
   */
  const about = useApi(() => api.about.page(), []);
  const ready = !about.loading && !about.error;

  /*
   * Built even when the request failed. The copy is in the bundle, so a page
   * whose images did not load still has every word on it - which is a better
   * failure for a company introduction than an error panel.
   */
  /*
   * THE LOCALE IS A BUILD INPUT, not a lookup at every sentence.
   *
   * This page is prose rather than interface, so the whole of it is
   * assembled in one language at once - see content.zh.js.
   */
  const page = buildAbout(about.data ? about.data.images : null, locale);

  const [active, setActive] = useActiveAboutSection(ready);

  /* The two sticky bars are different heights, so the scroll offset is too. */
  const offset = useBreakpointValue(SCROLL_OFFSET) || SCROLL_OFFSET.md;

  /*
   * A hash arriving with the page is only honoured ONCE, and only after the
   * data is in. Scrolling before then lands on a skeleton whose sections are
   * about to change height; honouring it more than once would fight the
   * reader every time the observer wrote the hash back.
   */
  const jumped = useRef(false);

  const go = useCallback((id) => {
    setActive(id);
    writeHash(id);
    scrollToSection(id, offset);
  }, [offset, setActive]);

  useEffect(() => {
    if (!ready || jumped.current) return;

    const id = String(location.hash || '').replace('#', '');
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
  }, [ready, location.hash, offset, setActive]);

  /* Scrolling rewrites the hash, so a copied URL is the chapter on screen. */
  useEffect(() => {
    if (!ready || !jumped.current) return;
    writeHash(active);
  }, [active, ready]);

  if (about.loading) {
    return (
      <Section py={{ base: 10, md: 16 }}>
        <Loading variant="block" height="380px" />
        <Box mt="10">
          <Loading variant="grid" count={4} height="160px" />
        </Box>
      </Section>
    );
  }

  /*
   * THERE IS NO ERROR BRANCH ANY MORE, and its absence is the point.
   *
   * This used to blank the whole page when /about failed, because the request
   * carried every word on it. It carries only the image map now - the copy is
   * in the bundle - so a failed request costs the reader some photographs and
   * nothing else. A company introduction with no pictures is still a company
   * introduction; an error panel where one should be is not.
   */

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
          tinted={chapter.tinted}
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
              backward link under the final chapter reads as a dead end. */}
          {index < all.length - 1 && (
            <ChapterNavigation id={chapter.id} onSelect={go} />
          )}
        </Section>
      ))}
    </Box>
  );
}
