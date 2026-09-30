import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Button, Center, Flex, IconButton, Input, Spinner, Stack, Text, Textarea,
  Tooltip, useColorModeValue, useToast
} from '@chakra-ui/react';
import { MdAdd, MdDelete } from 'react-icons/md';

import Card from '../../components/Card';
import usePermission from '../../hooks/usePermission';
import { footer } from '../../api';
import { useT } from '../../i18n';

export const PAGE = '/admin/base/footer';

/**
 * The website's footer, as a form rather than as a release.
 *
 * Every item on it - the app downloads, the numbers to reach an administrator
 * on, the support links, the company's address, and the two site buttons in
 * the corner - used to be hardcoded in the storefront, which meant a moved
 * phone number needed a deployment.
 *
 * IT IS ONE SETTINGS ROW HOLDING ONE JSON DOCUMENT, and that is why it needs
 * its own screen. Three of the four sections are LISTS of unknown length -
 * six or seven numbers today, five tomorrow - which the generic settings page
 * can only offer as a single-line text box full of raw JSON. That is not an
 * editor, it is a way to lose the footer to a missing brace.
 *
 * THE SERVER STILL DECIDES WHAT A GOOD DOCUMENT IS. It merges whatever is
 * saved over a default section by section, so a half-filled form cannot take
 * the footer off the site - see services/footer.service.js. This screen does
 * not repeat those rules; it just has to not fight them.
 */
export default function Footer() {
  const t = useT();
  const toast = useToast();
  const { canWrite } = usePermission(PAGE);

  const border = useColorModeValue('gray.100', 'gray.700');
  const muted = useColorModeValue('gray.500', 'gray.400');

  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await footer.detail();
      setDoc(normalise(data));
    } catch (err) {
      toast({ status: 'error', description: err.message, duration: 6000 });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await footer.save(clean(doc));
      toast({ status: 'success', description: t('common.saved'), duration: 2500 });
      await load();
    } catch (err) {
      toast({ status: 'error', description: err.message, duration: 7000 });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !doc) {
    return <Center py={20}><Spinner size="lg" thickness="3px" color="brand.500" /></Center>;
  }

  /** Replace one branch of the document without disturbing the others. */
  const patch = (section, value) => setDoc((current) => ({ ...current, [section]: value }));

  const saveButton = canWrite ? (
    <Button size="sm" colorScheme="brand" onClick={save} isLoading={saving}>
      {t('common.save')}
    </Button>
  ) : null;

  return (
    <Stack spacing={5}>
      {/* ---------------------------------------------------- downloads */}
      <Card
        title={t('base.footer.downloads')}
        bodyProps={false}
        actions={saveButton}
      >
        <Hint border={border} muted={muted}>
          {t('base.footer.theAppsTheFooterOffers')}
        </Hint>

        <Titled
          value={doc.downloads.title}
          onChange={(title) => patch('downloads', { ...doc.downloads, title })}
          canWrite={canWrite}
          border={border}
          t={t}
        />

        <PairList
          rows={doc.downloads.items}
          fields={['label', 'href']}
          placeholders={[t('base.footer.name'), t('base.footer.fileUrl')]}
          addLabel={t('base.footer.addALink')}
          onChange={(items) => patch('downloads', { ...doc.downloads, items })}
          canWrite={canWrite}
          border={border}
          t={t}
        />
      </Card>

      {/* ----------------------------------------------------- contacts */}
      <Card title={t('base.footer.contactNumbers')} bodyProps={false}>
        <Hint border={border} muted={muted}>
          {t('base.footer.theNumbersAMemberCan')}
        </Hint>

        <Titled
          value={doc.contacts.title}
          onChange={(title) => patch('contacts', { ...doc.contacts, title })}
          canWrite={canWrite}
          border={border}
          t={t}
        />

        {/*
          * A LABEL BESIDE EACH NUMBER. Seven numbers under one heading are
          * seven identical stripes of digits on the site, and a visitor
          * looking for the service line rings the wholesale desk. The label
          * is typed here and shown as typed - it is the company's own data,
          * like the address below, and is not translated.
          */}
        <PairList
          rows={doc.contacts.phones}
          fields={['label', 'number']}
          placeholders={[t('base.footer.phoneLabel'), t('base.footer.phoneNumber')]}
          addLabel={t('base.footer.addANumber')}
          onChange={(phones) => patch('contacts', { ...doc.contacts, phones })}
          canWrite={canWrite}
          border={border}
          t={t}
        />
      </Card>

      {/* ------------------------------------------------------ support */}
      <Card title={t('base.footer.support')} bodyProps={false}>
        <Hint border={border} muted={muted}>
          {t('base.footer.aPathBeginningWithA')}
        </Hint>

        <Titled
          value={doc.support.title}
          onChange={(title) => patch('support', { ...doc.support, title })}
          canWrite={canWrite}
          border={border}
          t={t}
        />

        <PairList
          rows={doc.support.links}
          fields={['label', 'to']}
          placeholders={[t('base.footer.name'), t('base.footer.pathOrUrl')]}
          addLabel={t('base.footer.addALink')}
          onChange={(links) => patch('support', { ...doc.support, links })}
          canWrite={canWrite}
          border={border}
          t={t}
        />
      </Card>

      {/* ------------------------------------------------------ company */}
      <Card title={t('base.footer.company')} bodyProps={false}>
        <Titled
          value={doc.company.title}
          onChange={(title) => patch('company', { ...doc.company, title })}
          canWrite={canWrite}
          border={border}
          t={t}
        />

        <Row label={t('base.footer.administratorEmail')} border={border}>
          <Input
            size="sm"
            type="email"
            isReadOnly={!canWrite}
            value={doc.company.email}
            onChange={(event) => {
              const email = event.target.value;
              setDoc((current) => ({ ...current, company: { ...current.company, email } }));
            }}
          />
        </Row>

        <Row label={t('base.footer.address')} border={border}>
          {/* An address wraps; a single-line input hides the end of it. */}
          <Textarea
            size="sm"
            rows={2}
            isReadOnly={!canWrite}
            value={doc.company.address}
            onChange={(event) => {
              const address = event.target.value;
              setDoc((current) => ({ ...current, company: { ...current.company, address } }));
            }}
          />
        </Row>
      </Card>

      {/* -------------------------------------------------- site buttons */}
      <Card title={t('base.footer.siteButtons')} bodyProps={false} actions={saveButton}>
        <Hint border={border} muted={muted}>
          {/*
            * A button with no address is not drawn on the site, and the row
            * stays here regardless - a pair that appears only once it is
            * filled in is a pair nobody knows exists.
            */}
          {t('base.footer.twoButtonsInTheBottom')}
        </Hint>

        {doc.sites.map((site, index) => (
          <Flex
            key={index}
            align="center"
            gap={3} data-gap="12" data-gap-wrap
            px={5}
            py={3}
            borderBottomWidth="1px"
            borderColor={border}
            wrap="wrap"
          >
            <Input
              size="sm"
              w={{ base: '100%', md: '11.25rem' }}
              isReadOnly={!canWrite}
              placeholder={t('base.footer.buttonName')}
              value={site.label}
              onChange={(event) => {
                const label = event.target.value;
                setDoc((current) => ({
                  ...current,
                  sites: current.sites.map((row, i) => (i === index ? { ...row, label } : row))
                }));
              }}
            />
            <Input
              size="sm"
              flex="1"
              minW="15rem"
              isReadOnly={!canWrite}
              placeholder="https://"
              value={site.href}
              onChange={(event) => {
                const href = event.target.value;
                setDoc((current) => ({
                  ...current,
                  sites: current.sites.map((row, i) => (i === index ? { ...row, href } : row))
                }));
              }}
            />
          </Flex>
        ))}
      </Card>
    </Stack>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Whatever came back, shaped so every field the form binds to exists.
 *
 * A controlled input handed `undefined` becomes uncontrolled, and React then
 * warns on the first keystroke and loses the value - so the document is made
 * complete here rather than guarded at forty call sites.
 */
function normalise(held) {
  const doc = held && typeof held === 'object' ? held : {};
  const list = (value) => (Array.isArray(value) ? value : []);

  return {
    downloads: {
      title: (doc.downloads && doc.downloads.title) || '',
      items: list(doc.downloads && doc.downloads.items)
        .map((row) => ({ label: row.label || '', href: row.href || '' }))
    },
    contacts: {
      title: (doc.contacts && doc.contacts.title) || '',
      /*
       * EITHER ERA OF ROW. Labels arrived after the first footers were
       * saved: an older row is a bare string, a newer one is
       * { label, number }. Both open in the form, an old one simply with an
       * empty label to type into - the numbers are never dropped on the way
       * in, so opening this screen cannot cost a site its footer.
       */
      phones: list(doc.contacts && doc.contacts.phones).map((phone) => (
        phone && typeof phone === 'object'
          ? { label: phone.label || '', number: phone.number || '' }
          : { label: '', number: String(phone || '') }
      ))
    },
    support: {
      title: (doc.support && doc.support.title) || '',
      links: list(doc.support && doc.support.links)
        .map((row) => ({ label: row.label || '', to: row.to || row.href || '' }))
    },
    company: {
      title: (doc.company && doc.company.title) || '',
      email: (doc.company && doc.company.email) || '',
      address: (doc.company && doc.company.address) || ''
    },
    /* Always exactly two rows to type into, however many were saved. */
    sites: [0, 1].map((i) => {
      const row = list(doc.sites)[i] || {};
      return { label: row.label || '', href: row.href || '' };
    })
  };
}

/**
 * On the way out: blank rows are dropped.
 *
 * An empty row is somebody who deleted an entry, not an entry that is empty -
 * and a footer that renders a nameless link with no destination looks broken
 * in a way nobody can explain from the form.
 */
function clean(doc) {
  return {
    downloads: {
      title: doc.downloads.title,
      items: doc.downloads.items.filter((row) => row.label.trim() && row.href.trim())
    },
    contacts: {
      title: doc.contacts.title,
      /* A row is kept for its NUMBER. The label is optional - a footer that
         has always shown bare numbers is allowed to go on doing so. */
      phones: doc.contacts.phones
        .map((phone) => ({ label: phone.label.trim(), number: phone.number.trim() }))
        .filter((phone) => phone.number)
    },
    support: {
      title: doc.support.title,
      links: doc.support.links.filter((row) => row.label.trim() && row.to.trim())
    },
    company: doc.company,
    /* Both rows are kept even when empty - the site draws neither, and the
       form still has somewhere to type next time. */
    sites: doc.sites
  };
}

/* ------------------------------------------------------------------ */

function Hint({ children, border, muted }) {
  return (
    <Box px={5} py={3} borderBottomWidth="1px" borderColor={border}>
      <Text fontSize="0.7rem" color={muted}>{children}</Text>
    </Box>
  );
}

function Row({ label, children, border }) {
  return (
    <Flex
      align="center"
      gap={4} data-gap="16" data-gap-wrap
      px={5}
      py={3}
      borderBottomWidth="1px"
      borderColor={border}
      wrap="wrap"
    >
      <Box minW="11.25rem"><Text fontSize="sm">{label}</Text></Box>
      <Box flex="1" minW="15rem">{children}</Box>
    </Flex>
  );
}

/** The heading a section shows on the site. */
function Titled({ value, onChange, canWrite, border, t }) {
  return (
    <Row label={t('base.footer.heading')} border={border}>
      <Input
        size="sm"
        isReadOnly={!canWrite}
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next);
        }}
      />
    </Row>
  );
}

/**
 * A list of two-field rows - the downloads, the support links, and the
 * phone numbers now that each one carries a label.
 *
 * The button that appends a row is NAMED BY THE CALLER: "Add a link" under a
 * list of links and "Add a number" under a list of numbers. One list of
 * pairs with a borrowed button label reads as somebody else's screen.
 */
function PairList({ rows, fields, placeholders, addLabel, onChange, canWrite, border, t }) {
  const blank = {};
  fields.forEach((field) => { blank[field] = ''; });

  return (
    <Box>
      {rows.map((row, index) => (
        <Flex
          key={index}
          align="center"
          gap={3} data-gap="12" data-gap-wrap
          px={5}
          py={2}
          borderBottomWidth="1px"
          borderColor={border}
          wrap="wrap"
        >
          {fields.map((field, f) => (
            <Input
              key={field}
              size="sm"
              w={f === 0 ? { base: '100%', md: '13.75rem' } : undefined}
              flex={f === 0 ? undefined : '1'}
              minW={f === 0 ? undefined : '15rem'}
              isReadOnly={!canWrite}
              placeholder={placeholders[f]}
              value={row[field]}
              onChange={(event) => {
                const next = event.target.value;
                onChange(rows.map((held, i) => (
                  i === index ? { ...held, [field]: next } : held
                )));
              }}
            />
          ))}
          <Remove
            canWrite={canWrite}
            label={t('common.remove')}
            onClick={() => onChange(rows.filter((held, i) => i !== index))}
          />
        </Flex>
      ))}

      <Add
        canWrite={canWrite}
        label={addLabel}
        onClick={() => onChange(rows.concat({ ...blank }))}
      />
    </Box>
  );
}

function Remove({ canWrite, label, onClick }) {
  /*
   * THE HOOK RUNS BEFORE THE EARLY RETURN, always. Rules of hooks, and this
   * project builds with warnings as errors - a `useT()` below the
   * `if (!canWrite)` line fails the build rather than misbehaving at runtime.
   */
  const t = useT();

  if (!canWrite) return null;

  return (
    /*
      A TOOLTIP, NOT `title`. The native tooltip is the operating system's
      own box in the operating system's own font - the one label on this
      screen that the console's typeface cannot reach. `aria-label` stays: it
      is the accessible name, which a tooltip is not.
    */
    <Tooltip label={t(label)} openDelay={350} hasArrow>
      <IconButton
        size="sm"
        variant="ghost"
        colorScheme="red"
        aria-label={t(label)}
        icon={<MdDelete />}
        onClick={onClick}
      />
    </Tooltip>
  );
}

function Add({ canWrite, label, onClick }) {
  if (!canWrite) return null;

  return (
    <Box px={5} py={3}>
      <Button size="sm" variant="outline" leftIcon={<MdAdd />} onClick={onClick}>
        {label}
      </Button>
    </Box>
  );
}
