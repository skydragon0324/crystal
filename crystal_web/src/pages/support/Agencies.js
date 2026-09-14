import React, { useEffect, useState } from 'react';
import { Redirect, useParams } from 'react-router-dom';
import {
  Badge,
  Box,
  Flex,
  Heading,
  Icon,
  Input,
  InputGroup,
  InputLeftElement,
  Link,
  SimpleGrid,
  Text
} from '@chakra-ui/react';
import { SearchIcon } from '@chakra-ui/icons';
import { FiMapPin, FiPhone } from 'react-icons/fi';

import {
  Breadcrumbs,
  EmptyState,
  ErrorState,
  Loading,
  Pagination,
  Section,
  SelectField
} from '@/components/common';
import {
  SECTIONS,
  SECTION_SERVICES,
  centresPathOf,
  sectionOf,
  servicesOf
} from '@/components/support/serviceSections';
import api from '@/api';
import { useApi, useDebounced, useList } from '@/hooks/useApi';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * The store locator, FOR ONE COUNTER.
 *
 * It used to be one page over both. A centre appeared once, with a service
 * dropdown carrying both vocabularies stacked on top of each other, and a
 * "section" filter that defaulted to neither - so the first thing a visitor
 * saw was every branch in the country with a mixed list of what each one does
 * somewhere in the building. Somebody with a television read a card offering
 * Crystal OS installs and insurance, and somebody with a handset read one
 * offering media service.
 *
 * The two are run by different managers and customers already think of them as
 * two networks, so the section is part of the ADDRESS rather than a filter
 * inside the page: /support/centres/smartphones and /support/centres/eproducts.
 * Each is reached from its own product menu - Smartphones, or Eproducts -
 * because somebody with a broken handset is already in one of them.
 *
 * AND THERE IS NO WAY TO SWITCH FROM HERE. A pair of tabs across the top made
 * this one page about both counters again in all but the query: a visitor who
 * came for a television could flip to the handset network without noticing the
 * page had changed under them. Which network this is gets said once, in the
 * heading, and nothing on the page moves it.
 *
 * Everything the section implies follows from it: only centres that actually
 * serve it, only its own services on a card, and only its own vocabulary in
 * the service filter. The bare /support/centres still resolves - it is what
 * older links point at - and lands on the first network rather than 404ing.
 */
export default function Agencies() {
  const t = useT();
  const surface = useSurface();

  const params = useParams();
  const section = sectionOf(params.section);

  const [term, setTerm] = useState('');
  // Debounced, so typing a city is one request rather than eight.
  const debouncedTerm = useDebounced(term, 350);
  const [province, setProvince] = useState(null);
  const [service, setService] = useState(null);

  const sectionKey = section ? section.key : null;

  const regions = useApi(() => api.support.regions(), []);

  /*
   * PAGED AND SEARCHED ON THE SERVER.
   *
   * There are over a hundred centres. Fetching them all and filtering in
   * the browser searched only as far as whatever limit happened to be set -
   * so the ones past it were unreachable, which is the one thing a locator
   * must not do.
   */
  const centres = useList((query) => api.support.agencies(query), {
    /*
     * The section is in the FIRST request, not only in the effect below.
     * Without it the page opens with one unscoped fetch - every centre in the
     * country - and corrects itself a moment later, which on a slow connection
     * is long enough to read a card for the wrong counter.
     */
    initialParams: { page: 1, limit: 12, section: sectionKey || undefined }
  });

  const setFilter = centres.setFilter;
  useEffect(() => {
    if (!sectionKey) return;
    setFilter({
      section: sectionKey,
      province: province || undefined,
      service_type: service || undefined,
      q: debouncedTerm || undefined
    });
  }, [setFilter, sectionKey, province, service, debouncedTerm]);

  /*
   * A section that is not one of the two is not an error page: the two slugs
   * are the whole vocabulary and anything else is a stale link or a typo, so
   * it lands on the first counter rather than on a dead end. The bare
   * /support/centres arrives here the same way.
   */
  if (!section) return <Redirect to={centresPathOf(SECTIONS[0].key)} />;

  const rows = centres.rows;

  // The province NAME is the filter - the short code was a column and is
  // gone, and the name is what the dropdown showed anyway.
  const provinceOptions = (regions.data || []).map((row) => ({
    value: row.province,
    label: row.province,
    hint: String(row.agency_cnt)
  }));

  const total = centres.meta ? centres.meta.total : rows.length;

  return (
    <Section py={{ base: 6, md: 10 }}>
      {/*
        The crumb goes back to the SECTION, not to a support index. This page
        belongs to the product now - it is reached from the Smartphones or the
        Eproducts menu - and a trail through Support would offer a way back to
        somewhere the visitor has never been.
      */}
      <Breadcrumbs
        items={[
          { label: section.label, to: section.sectionPath },
          { label: 'Service centres' }
        ]}
      />

      {/* The network is named in the heading, because nothing on the page
          changes it any more. */}
      <Heading size="lg" color={surface.text} letterSpacing="-0.02em">
        {t('support.agencies.serviceCentres', { section: t(section.label) })}
      </Heading>
      <Text color={surface.muted} mt="1" mb="6">
        {t('support.agencies.walkInNoAppointmentNeeded')}{' '}
        {centres.loading ? '' : `${total} ${total === 1 ? t('support.agencies.centre') : t('support.agencies.centres')}.`}
      </Text>

      {/*
        NO WAY TO SWITCH NETWORK FROM HERE, and that is the point.

        There was a pair of tabs across the top. They made this one page about
        both counters again in everything but the query: a visitor who came
        for a television could flip to the handset list without noticing the
        page had changed under them, and the page had to hold a service filter
        that meant nothing until they picked. The two are separate businesses
        with separate managers, and each is reached from its own product menu.

        Which network you are looking at is said once, in the heading, and it
        does not move.
      */}
      <SimpleGrid columns={{ base: 1, md: 3 }} spacing="3" mb="8">
        <InputGroup>
          <InputLeftElement pointerEvents="none" h="40px">
            <SearchIcon color={surface.muted} boxSize="3.5" />
          </InputLeftElement>
          <Input
            placeholder={t('support.agencies.nameCityOrAddress')}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
          />
        </InputGroup>

        <SelectField
          value={province}
          onChange={(value) => setProvince(value || null)}
          options={provinceOptions}
          allowEmpty
          emptyLabel={t('support.agencies.allProvinces')}
        />

        {/* This counter's vocabulary only. The other one's services are not
            offered here, because nothing on this page can match them. */}
        <SelectField
          value={service}
          onChange={(value) => setService(value || null)}
          options={SECTION_SERVICES[section.key]}
          allowEmpty
          emptyLabel={t('support.agencies.allServices')}
          isSearchable={false}
        />
      </SimpleGrid>

      {centres.loading && <Loading variant="grid" count={6} height="180px" />}

      {!centres.loading && centres.error && (
        <ErrorState message={centres.error} onRetry={centres.reload} />
      )}

      {!centres.loading && !centres.error && rows.length === 0 && (
        <EmptyState
          title={t('support.agencies.noCentresMatchThoseFilters')}
          hint={t('support.agencies.tryAWiderAreaOr')}
        />
      )}

      {!centres.loading && rows.length > 0 && (
        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing="5">
          {rows.map((agency) => (
            <Box
              key={agency.id}
              p="6"
              borderRadius="14px"
              border="1px solid"
              borderColor={surface.border}
              bg={surface.card}
            >
              <Text fontWeight="700" color={surface.text} noOfLines={2}>
                {agency.name}
              </Text>

              <Flex gap="2" data-gap="8" align="flex-start" mt="3">
                <Icon as={FiMapPin} color={surface.muted} boxSize="4" mt="0.5" flexShrink={0} />
                <Text fontSize="sm" color={surface.muted}>
                  {agency.address}
                  <br />
                  {agency.province}
                </Text>
              </Flex>

              {agency.phone && (
                <Flex gap="2" data-gap="8" align="center" mt="2">
                  <Icon as={FiPhone} color={surface.muted} boxSize="4" flexShrink={0} />
                  <Link
                    href={`tel:${agency.phone.replace(/\s/g, '')}`}
                    fontSize="sm"
                    color="brand.500"
                  >
                    {agency.phone}
                  </Link>
                </Flex>
              )}

              {/*
                Only what this centre does at THIS counter. A branch that also
                repairs televisions does not advertise it on the smartphone
                page - it is a different desk, often different staff, and
                listing it is how somebody carries a television to a counter
                that will not take it.
              */}
              <Flex gap="1.5" data-gap="6" data-gap-wrap wrap="wrap" mt="4">
                {servicesOf(agency, section.key).map((entry) => (
                  <Badge
                    key={entry.key}
                    colorScheme="brand"
                    borderRadius="6px"
                    fontSize="10px"
                    textTransform="none"
                  >
                    {t(entry.label)}
                  </Badge>
                ))}
              </Flex>
            </Box>
          ))}
        </SimpleGrid>
      )}

      {/* The result runs past one page now that the network is a hundred
          centres, so the list is paged rather than capped. */}
      <Pagination meta={centres.meta} onPage={centres.setPage} />
    </Section>
  );
}
