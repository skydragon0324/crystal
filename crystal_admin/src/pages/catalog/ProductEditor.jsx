import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import {
  Box, Button, Center, Flex, IconButton, Input, SimpleGrid, Spinner, Stack, Tab,
  TabList, TabPanel, TabPanels, Tabs, Text, Tooltip, useColorModeValue, useToast
} from '@chakra-ui/react';
import {
  ArrowBackIcon, ArrowForwardIcon, DeleteIcon, EditIcon, RepeatIcon
} from '@chakra-ui/icons';

import Card from '../../components/Card';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import FormModal from '../../components/FormModal';
import SelectField from '../../components/SelectField';
import { useConfirm } from '../../components/ConfirmDialog';

import usePermission from '../../hooks/usePermission';
import { media, productImages, products } from '../../api';
import { useT } from '../../i18n';
import { date, money } from '../../utils/format';
import { fileUrl } from '../../api/client';

const PAGE = '/admin/catalog/products';
const SMARTPHONE_LIST = PAGE + '/smartphone';
const EPRODUCT_LIST = PAGE + '/eproduct';

/**
 * Which of the two product lists a product belongs on.
 *
 * The console splits one table across two screens - handsets and everything
 * else - and `category_type` is what decides. A product whose section did not
 * load falls back to the smartphone list rather than to a path with no route:
 * being on the wrong list is recoverable, being on the dashboard is not
 * obviously anything.
 */
function listFor(product) {
  return product && product.category_type && product.category_type !== 'SMARTPHONE'
    ? EPRODUCT_LIST
    : SMARTPHONE_LIST;
}

/**
 * One product, across the five tabs the spec lists.
 *
 * The specification tab is the interesting one: it offers every definition in
 * the dictionary, not only the ones this product has answered - the blanks
 * are exactly what somebody opened the tab to fill in - and an emptied field
 * DELETES the value rather than storing an empty string, so clearing a field
 * on the form actually clears it.
 */
export default function ProductEditor() {
  const t = useT();
  const toast = useToast();
  const history = useHistory();
  const { id } = useParams();
  const { canWrite } = usePermission(PAGE);
  const confirm = useConfirm();

  const [detail, setDetail] = useState(null);
  // Read inside `load`, which must not depend on `detail` itself or the
  // callback re-creates on every fetch and the effect loops.
  const detailRef = useRef(null);

  /*
   * The open tab, held here rather than left to <Tabs>.
   *
   * Uncontrolled, it forgets which tab was open the moment anything
   * remounts it - so somebody who saved a specification landed back on
   * Overview and had to find their place again.
   */
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState({});
  const [osForm, setOsForm] = useState(false);
  // Null means the form is a create; a row means it is an edit.
  const [editingOs, setEditingOs] = useState(null);

  /*
   * NO os_versions LOOKUP HERE ANY MORE.
   *
   * A device's update record used to point at a Crystal OS release, so this
   * screen had to offer the list of releases to pick from. It does not: the
   * firmware a television ships is not a Crystal OS build, and even a
   * handset reports its own version string, so the version is typed in.
   */

  const load = useCallback(async () => {
    /*
     * The spinner is for the FIRST load only.
     *
     * Every save calls this to refresh, and blanking the page while it runs
     * unmounted the whole <Tabs> - so it came back at index 0 and threw the
     * editor back to Overview after every single save. Keeping the previous
     * detail on screen while the new one is fetched is both nicer and the
     * fix.
     */
    setLoading((current) => current || detailRef.current === null);
    try {
      const { data } = await products.get(id);
      setDetail(data);
      detailRef.current = data;

      const next = {};
      data.specifications.forEach((row) => { next[row.specification_id] = row.value; });
      setValues(next);
    } catch (err) {
      toast({ status: 'error', description: err.message, duration: 6000 });
      setDetail(null);
      detailRef.current = null;
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const run = async (action) => {
    setBusy(true);
    try {
      await action();
      toast({ status: 'success', description: t('common.saved'), duration: 2500 });
      await load();
    } catch (err) {
      toast({ status: 'error', description: err.message, duration: 7000 });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Center py={20}><Spinner size="lg" thickness="3px" color="brand.500" /></Center>;
  if (!detail) return <Card><Text fontSize="sm">{t('editor.notFound')}</Text></Card>;

  const product = detail.product;

  const saveSpecs = () => run(() => products.saveSpecifications(
    product.id,
    detail.dictionary.map((definition) => ({
      specification_id: definition.id,
      value: values[definition.id] === undefined ? '' : values[definition.id]
    }))
  ));

  return (
    <Box>
      <Flex align="center" gap={3} data-gap="12" data-gap-wrap mb={5} wrap="wrap">
        {/*
          * BACK GOES TO THE LIST THIS PRODUCT IS ON, not to /products.
          *
          * There is no route at '/admin/catalog/products' - the lists live at
          * '/products/smartphone' and '/products/eproduct', because they are
          * two screens over one table. Pushing the bare path matched nothing
          * and fell through to the dashboard, which is what made Back look
          * like it logged you out of the section you were working in.
          *
          * The product knows which list it belongs on: its section's type.
          */}
        <IconButton
          aria-label={t('common.back')} icon={<ArrowBackIcon />} size="sm" variant="ghost"
          onClick={() => history.push(listFor(product))}
        />
        <Text fontSize="lg" fontWeight="700">{product.name}</Text>
        <StatusBadge value={product.status} />
        {product.is_hero && <StatusBadge value="WATCH" label={t('common.hero')} />}
        <Text fontSize="xs" color="gray.500">{product.model_code}</Text>
      </Flex>

      <Tabs variant="soft-rounded" colorScheme="brand" size="sm" index={tab} onChange={setTab}>
        <TabList mb={4} flexWrap="wrap">
          <Tab>{t('editor.overview')}</Tab>
          <Tab>{t('editor.specifications')}</Tab>
          <Tab>{t('editor.images')}</Tab>
          <Tab>{t('editor.finishes')}</Tab>
          <Tab>{t('editor.repairPricing')}</Tab>
          <Tab>{t('editor.softwareUpdates')}</Tab>
        </TabList>

        <TabPanels>
          <TabPanel p={0}>
            <Card title={t('editor.overview')}>
              <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
                <Detail label="Section" value={product.category_name} />
                <Detail label="Series" value={product.series_name} />
                <Detail label="Model code" value={product.model_code} />
                <Detail label="Price" value={money(product.price, product.currency)} />
                <Detail label="Standard warranty" value={t('editor.monthsCount', { count: product.warranty_months })} />
                <Detail label="Released" value={date(product.release_date)} />
                <Detail label="Slug" value={product.slug} />
              </SimpleGrid>

              {product.tagline && <Text fontSize="sm" mt={4} color="gray.500">{product.tagline}</Text>}
            </Card>
          </TabPanel>

          <TabPanel p={0}>
            <Card
              title={t('editor.specifications')}
              subtitle={t('editor.anEmptiedFieldRemovesThe')}
              actions={canWrite && (
                <Button size="sm" colorScheme="brand" onClick={saveSpecs} isLoading={busy}>
                  {t('common.save')}
                </Button>
              )}
            >
              <Stack spacing={5}>
                {groupBy(detail.dictionary).map((group) => (
                  <Box key={group.group_id}>
                    <Text
                      fontSize="0.66rem" fontWeight="700" textTransform="uppercase"
                      letterSpacing="0.06em" color="gray.500" mb={2}
                    >
                      {group.group_name}
                    </Text>

                    <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={3}>
                      {group.items.map((definition) => (
                        <Box key={definition.id}>
                          <Flex align="center" gap={1} data-gap="4" mb={1}>
                            <Text fontSize="xs">{definition.name}</Text>
                            {definition.unit && (
                              <Text fontSize="0.65rem" color="gray.500">({definition.unit})</Text>
                            )}
                            {definition.compare_enabled && (
                              <StatusBadge value="OK" label={t('editor.compare')} />
                            )}
                          </Flex>
                          <Input
                            size="sm"
                            isReadOnly={!canWrite}
                            value={values[definition.id] === undefined ? '' : values[definition.id]}
                            onChange={(event) => {
                              /*
                               * READ BEFORE THE UPDATER.
                               *
                               * React 16 recycles the synthetic event once
                               * the handler returns - it nulls the fields
                               * and puts the object back in a pool. A
                               * functional updater does NOT run inside the
                               * handler; React calls it later, during the
                               * update, by which time event.target is null
                               * and typing in this field throws.
                               *
                               * React 17 removed pooling, which is exactly
                               * why the shorter form gets written.
                               */
                              const next = event.target.value;
                              setValues((current) => ({ ...current, [definition.id]: next }));
                            }}
                          />
                        </Box>
                      ))}
                    </SimpleGrid>
                  </Box>
                ))}
              </Stack>
            </Card>
          </TabPanel>

          <TabPanel p={0}>
            <Gallery
              images={detail.images}
              productId={product.id}
              canWrite={canWrite}
              busy={busy}
              onChanged={load}
              run={run}
            />
          </TabPanel>

          <TabPanel p={0}>
            <Finishes
              colors={detail.colors}
              productId={product.id}
              canWrite={canWrite}
              busy={busy}
              run={run}
            />
          </TabPanel>

          <TabPanel p={0}>
            <Card
              title={t('editor.repairPricing')}
              subtitle={t('editor.whatTheWebsiteQuotesAnd')}
              bodyProps={false}
            >
              <DataTable
                columns={[
                  { key: 'part_name', label: 'Part', maxW: '16.25rem' },
                  { key: 'part_price', label: 'Part price', isNumeric: true, render: (row) => money(row.part_price) },
                  { key: 'service_price', label: 'Service price', isNumeric: true, render: (row) => money(row.service_price) },
                  {
                    key: 'approval_no', label: 'Approval no',
                    render: (row) => <Text fontSize="xs" fontFamily="mono">{row.approval_no || '-'}</Text>
                  }
                ]}
                rows={detail.service_pricing}
              />
            </Card>
          </TabPanel>

          <TabPanel p={0}>
            <Card
              title={t('editor.softwareUpdates')}
              subtitle={t('editor.whatThisDeviceHasReceived')}
              bodyProps={false}
              actions={canWrite && (
                <Button size="xs" onClick={() => { setEditingOs(null); setOsForm(true); }}>
                  {t('editor.addAnUpdate')}
                </Button>
              )}
            >
              <DataTable
                columns={osColumns(t)}
                rows={detail.os_history}
                actions={canWrite ? [
                  {
                    key: 'edit', label: t('common.edit'), icon: EditIcon,
                    onClick: (row) => { setEditingOs(row); setOsForm(true); }
                  },
                  {
                    key: 'delete', label: t('common.delete'), icon: DeleteIcon, color: 'red',
                    isDisabled: () => busy,
                    /*
                     * Behind a confirmation, like every other delete in the
                     * console. This one was a bare button, and it sat right
                     * beside Edit in a table of rows that look alike.
                     */
                    onClick: async (row) => {
                      const agreed = await confirm({
                        tone: 'danger',
                        title: t('common.delete'),
                        body: t('editor.thisUpdateIsRemovedFrom'),
                        detail: row.os_version,
                        confirmLabel: t('common.delete')
                      });
                      if (!agreed) return;
                      return run(() => products.removeOsHistory(product.id, row.id));
                    }
                  }
                ] : undefined}
              />
            </Card>
          </TabPanel>
        </TabPanels>
      </Tabs>

      <FormModal
        isOpen={osForm}
        onClose={() => { setOsForm(false); setEditingOs(null); }}
        isLoading={busy}
        size="2xl"
        title={t(editingOs ? 'Edit an update' : 'Add an update')}
        initial={editingOs || {}}
        onSubmit={(payload) => {
          const row = editingOs;
          setOsForm(false);
          setEditingOs(null);
          return run(() => (row
            ? products.updateOsHistory(product.id, row.id, payload)
            : products.addOsHistory(product.id, payload)));
        }}
        fields={[
          {
            name: 'os_version', label: 'Version', required: true,
            help: 'As the DEVICE reports it. Typed in, not picked from the Crystal OS releases - a television reports a build that is not a Crystal OS version at all.'
          },
          { name: 'release_date', label: 'Reached this device on', type: 'date' },
          { name: 'pub_approve_number', label: 'Publication approval number' },
          { name: 'sort_order', label: 'Order', type: 'number' },
          {
            name: 'content', label: 'Notice', type: 'textarea', rows: 6, span: 2,
            help: 'What is published against this device, in sentences. Shown on the product page.'
          }
        ]}
      />
    </Box>
  );
}

/** One labelled value on the overview tab. */
function Detail({ label, value }) {
  const t = useT();
  const muted = useColorModeValue('gray.500', 'gray.400');

  return (
    <Box>
      <Text fontSize="0.66rem" color={muted} textTransform="uppercase" letterSpacing="0.05em">
        {t(label)}
      </Text>
      <Text fontSize="sm" mt="2px">{value || '-'}</Text>
    </Box>
  );
}

/** The flat dictionary, folded into the groups it belongs to. */
function groupBy(definitions) {
  const groups = [];
  const index = {};

  definitions.forEach((definition) => {
    if (!index[definition.group_id]) {
      index[definition.group_id] = {
        group_id: definition.group_id,
        group_name: definition.group_name,
        items: []
      };
      groups.push(index[definition.group_id]);
    }
    index[definition.group_id].items.push(definition);
  });

  return groups;
}

/**
 * The update record's columns.
 *
 * No `title` and no link to a release: the version is the string the DEVICE
 * reports, and the notice beside it is what was published against this device.
 * The row actions are supplied by the table rather than injected as a column,
 * so they get the same icon-and-tooltip treatment as every other screen.
 */function osColumns(t) {
  return [
    { key: 'os_version', label: 'Version' },
    { key: 'release_date', label: 'Reached this device', render: (row) => date(row.release_date) },
    { key: 'content', label: 'Notice', maxW: '26.25rem', wrap: true },
    {
      key: 'pub_approve_number', label: 'Approval no',
      render: (row) => (
        <Text fontSize="xs" fontFamily="mono">{row.pub_approve_number || '-'}</Text>
      )
    },
    { key: 'sort_order', label: 'Order', isNumeric: true }
  ];
}

/**
 * The two runs of artwork a product has, and where each one appears.
 *
 * Spelt out on the form rather than left as two bare codes, because this is
 * the distinction that kept going wrong - they are both "pictures of the
 * product" and they show up in completely different places.
 */
const KINDS = [
  { value: 'MAIN', label: 'Main - the studio set, shown at the top of the product page' },
  { value: 'ADVERT', label: 'Advert - the marketing panels, shown down the Gallery tab' }
];

const DEVICES = [
  { value: 'all', label: 'Both' },
  { value: 'desktop', label: 'Desktop' },
  { value: 'mobile', label: 'Mobile' }
];

/**
 * A product's own artwork - and it is EDITABLE, which it was not.
 *
 * This tab used to be a read-only contact sheet over media_assets: it drew
 * every asset and offered no way to add, replace, retag or remove one, and the
 * only route to a product's pictures was the global media library where the
 * owner id had to be typed in by hand.
 *
 * It now reads product_images, which is a real relation with a foreign key to
 * the product rather than a polymorphic (owner_type, owner_id) pair. The
 * upload is two steps on purpose: the file goes up with NO owner, so the API
 * answers a path rather than creating a media row, and the product_images row
 * is written from that path.
 *
 * ORDER IS EDITABLE, and it matters: the storefront shows the first three MAIN
 * shots at the top of the product page and reads the ADVERT run top to bottom,
 * so which picture is first is an editorial decision rather than an accident
 * of upload time.
 *
 * DELETED PICTURES ARE RECOVERABLE. The delete is soft - the row stays with
 * `is_deleted` set - and until now nothing in the console could see one again,
 * so a mistake was permanent in practice while looking reversible in the
 * database. The recycle bin below is what closes that gap.
 */
function Gallery({ images, productId, canWrite, busy, onChanged, run }) {
  const t = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const inputRef = useRef(null);

  const border = useColorModeValue('gray.100', 'gray.700');
  const tileBg = useColorModeValue('gray.50', 'whiteAlpha.50');

  const [editing, setEditing] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [kind, setKind] = useState('MAIN');

  /* The recycle bin: loaded on demand, because most visits never open it. */
  const [binOpen, setBinOpen] = useState(false);
  const [bin, setBin] = useState([]);
  const [binBusy, setBinBusy] = useState(false);

  const list = images || [];

  const loadBin = async () => {
    setBinBusy(true);
    try {
      const { data } = await productImages.list({ product_id: productId, deleted: 1, limit: 100 });
      setBin(data.rows || []);
    } catch (err) {
      toast({ status: 'error', description: err.message, duration: 7000 });
    } finally {
      setBinBusy(false);
    }
  };

  const toggleBin = async () => {
    const next = !binOpen;
    setBinOpen(next);
    if (next) await loadBin();
  };

  const upload = async (event) => {
    const files = Array.prototype.slice.call(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;

    setUploading(true);
    try {
      // Where the new pictures go in the order: after everything already in
      // the run they are joining, not after everything on the product.
      const inKind = list.filter((image) => image.kind === kind);
      const last = inKind.reduce((most, image) => Math.max(most, image.sort_order || 0), 0);

      for (let i = 0; i < files.length; i += 1) {
        // No owner on the upload, so the API stores the file and answers its
        // path rather than creating a media_assets row - see the media
        // controller. The row this screen wants is a product_images one.
        // eslint-disable-next-line no-await-in-loop
        const { data } = await media.upload('products', files[i]);

        // eslint-disable-next-line no-await-in-loop
        await productImages.create({
          product_id: productId,
          kind: kind,
          device_type: 'all',
          file_path: data.file_path,
          alt_text: files[i].name.replace(/\.[^.]+$/, ''),
          sort_order: last + (i + 1) * 10
        });
      }
      toast({ status: 'success', description: t('common.saved'), duration: 2500 });
      await onChanged();
    } catch (err) {
      toast({ status: 'error', description: err.message, duration: 7000 });
    } finally {
      setUploading(false);
    }
  };

  const remove = async (image) => {
    const agreed = await confirm({
      tone: 'danger',
      title: t('common.delete'),
      body: t('editor.thePictureIsRemovedFrom'),
      detail: image.file_path,
      confirmLabel: t('common.delete')
    });
    if (!agreed) return;
    run(() => productImages.remove(image.id));
  };

  const restore = async (image) => {
    const agreed = await confirm({
      tone: 'restore',
      title: t('common.restore'),
      body: t('editor.thePictureIsReturnedTo'),
      detail: image.file_path,
      confirmLabel: t('common.restore')
    });
    if (!agreed) return;

    await run(() => productImages.restore(image.id));
    await loadBin();
  };

  /**
   * Moves a picture one place within its own run.
   *
   * The two rows SWAP sort_order rather than the moved one being renumbered,
   * so the rest of the run keeps its numbers and a list edited fifty times
   * does not drift into 10, 11, 12, 13.
   */
  const moveBy = (image, step) => {
    const run_ = groupImages(list).filter((group) => group.kind === image.kind)[0];
    if (!run_) return;

    const at = run_.items.findIndex((row) => row.id === image.id);
    const target = run_.items[at + step];
    if (!target) return;

    run(() => Promise.all([
      productImages.update(image.id, { sort_order: target.sort_order }),
      productImages.update(target.id, { sort_order: image.sort_order })
    ]));
  };

  const groups = groupImages(list);

  const actions = canWrite && (
    <Flex align="center" gap="0.5rem" data-gap="8">
      {/* Which run the next upload joins. Asked BEFORE the file picker rather
          than after, because retagging six pictures one at a time is the
          tedium this avoids. */}
      <Box w="7.5rem">
        <SelectField
          size="sm"
          value={kind}
          options={KINDS.map((option) => ({ value: option.value, label: option.value }))}
          onChange={(next) => setKind(next || 'MAIN')}
        />
      </Box>
      <Button
        size="xs" isLoading={uploading} isDisabled={busy}
        onClick={() => inputRef.current && inputRef.current.click()}
      >
        {t('editor.addImages')}
      </Button>
      <Button
        size="xs" variant={binOpen ? 'brand' : 'subtle'}
        isLoading={binBusy}
        onClick={toggleBin}
      >
        {t('table.recycleBin')}
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
        style={{ display: 'none' }}
        onChange={upload}
      />
    </Flex>
  );

  const tile = (image, extra) => (
    <Box
      key={image.id}
      borderWidth="1px" borderColor={border} borderRadius="lg"
      overflow="hidden" position="relative" role="group"
    >
      <Box
        as="img"
        src={fileUrl(image.file_path)}
        alt={image.alt_text || ''}
        w="100%" h="6.875rem" objectFit="cover" bg={tileBg}
      />
      {extra}
      <Box p={2}>
        <Text fontSize="0.65rem" fontWeight="600">{image.kind}</Text>
        <Text fontSize="0.6rem" color="gray.500" noOfLines={1}>
          {image.device_type}
          {image.alt_text ? ' - ' + image.alt_text : ''}
        </Text>
      </Box>
    </Box>
  );

  return (
    <>
      <Card
        title={t('editor.images')}
        subtitle={t('editor.theStudioSetAndThe')}
        actions={actions}
      >
        {!list.length ? (
          <Text fontSize="sm">{t('table.emptyBrief')}</Text>
        ) : (
          <Stack spacing={5}>
            {groups.map((group) => (
              <Box key={group.kind}>
                <Text
                  fontSize="0.66rem" fontWeight="700" textTransform="uppercase"
                  letterSpacing="0.06em" color="gray.500" mb={2}
                >
                  {group.kind === 'MAIN' ? t('editor.mainProductPage') : t('editor.advertGalleryTab')}
                </Text>

                <SimpleGrid columns={{ base: 2, md: 4, xl: 6 }} spacing={4}>
                  {group.items.map((image, index) => tile(image, canWrite && (
                    <Flex
                      position="absolute" top="0.25rem" left="0.25rem" right="0.25rem"
                      justify="space-between"
                      opacity={0} transition="opacity .15s ease"
                      _groupHover={{ opacity: 1 }}
                    >
                      {/* Order first and on the left, because it is the thing
                          most often being adjusted and the two arrows read as
                          a pair. */}
                      <Flex gap="0.25rem" data-gap="4">
                        <Tooltip label={t('common.moveEarlier')} openDelay={250} placement="top" hasArrow>
                          <IconButton
                            aria-label={t('common.moveEarlier')} icon={<ArrowBackIcon />} size="xs"
                            isDisabled={index === 0 || busy}
                            onClick={() => moveBy(image, -1)}
                          />
                        </Tooltip>
                        <Tooltip label={t('common.moveLater')} openDelay={250} placement="top" hasArrow>
                          <IconButton
                            aria-label={t('common.moveLater')} icon={<ArrowForwardIcon />} size="xs"
                            isDisabled={index === group.items.length - 1 || busy}
                            onClick={() => moveBy(image, 1)}
                          />
                        </Tooltip>
                      </Flex>

                      <Flex gap="0.25rem" data-gap="4">
                        <Tooltip label={t('common.edit')} openDelay={250} placement="top" hasArrow>
                          <IconButton
                            aria-label={t('common.edit')} icon={<EditIcon />} size="xs"
                            onClick={() => setEditing(image)}
                          />
                        </Tooltip>
                        <Tooltip label={t('common.delete')} openDelay={250} placement="top" hasArrow>
                          <IconButton
                            aria-label={t('common.delete')} icon={<DeleteIcon />} size="xs"
                            colorScheme="red" onClick={() => remove(image)}
                          />
                        </Tooltip>
                      </Flex>
                    </Flex>
                  )))}
                </SimpleGrid>
              </Box>
            ))}
          </Stack>
        )}

        {/*
          The recycle bin.
          Inside the same card rather than on a screen of its own: what
          somebody wants after deleting the wrong picture is to see it next to
          the ones that survived, and put it back.
        */}
        {binOpen && (
          <Box mt={6} pt={5} borderTopWidth="1px" borderColor={border}>
            <Text
              fontSize="0.66rem" fontWeight="700" textTransform="uppercase"
              letterSpacing="0.06em" color="gray.500" mb={2}
            >
              {t('common.deleted')}
            </Text>

            {!bin.length ? (
              <Text fontSize="sm" color="gray.500">{t('table.emptyBrief')}</Text>
            ) : (
              <SimpleGrid columns={{ base: 2, md: 4, xl: 6 }} spacing={4}>
                {bin.map((image) => tile(image, canWrite && (
                  <Flex
                    position="absolute" top="0.25rem" right="0.25rem"
                    opacity={0} transition="opacity .15s ease"
                    _groupHover={{ opacity: 1 }}
                  >
                    <Tooltip label={t('common.restore')} openDelay={250} placement="top" hasArrow>
                      <IconButton
                        aria-label={t('common.restore')} icon={<RepeatIcon />} size="xs"
                        colorScheme="green" isDisabled={busy}
                        onClick={() => restore(image)}
                      />
                    </Tooltip>
                  </Flex>
                )))}
              </SimpleGrid>
            )}
          </Box>
        )}
      </Card>

      <FormModal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        isLoading={busy}
        title={t('common.edit')}
        initial={editing || {}}
        onSubmit={(payload) => {
          const id = editing.id;
          setEditing(null);
          return run(() => productImages.update(id, payload));
        }}
        fields={[
          { name: 'kind', label: 'Shown as', type: 'select', required: true, options: KINDS, span: 2 },
          { name: 'device_type', label: 'Device', type: 'select', required: true, options: DEVICES },
          {
            name: 'sort_order', label: 'Order', type: 'number',
            help: 'Low numbers first. The arrows on the tile are usually easier.'
          },
          { name: 'file_path', label: 'File', type: 'image', folder: 'products', span: 2 },
          {
            name: 'alt_text', label: 'Alt text', span: 2,
            help: 'Read out in place of the picture, and shown as the caption on the gallery tab.'
          }
        ]}
      />
    </>
  );
}

/** The flat image list, folded into the two runs, main first, each in order. */
function groupImages(images) {
  return ['MAIN', 'ADVERT']
    .map((kind) => ({
      kind: kind,
      items: images
        .filter((image) => image.kind === kind)
        .slice()
        .sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id))
    }))
    .filter((group) => group.items.length > 0);
}

/**
 * The finishes, which had NO EDITOR AT ALL until now.
 *
 * `product_colors` was seeded and read by the storefront - the swatch row on a
 * product page comes straight from it - and there was no screen anywhere in
 * the console that could add, rename or remove one. A colour discontinued in
 * the real world stayed on the website forever.
 *
 * A FINISH IS A NAME AND A HEX. There was an `image` column too; it was
 * stored, seeded and returned by the API and no page ever drew it, because
 * the swatch is painted from the hex - the dot on a product card has to be
 * paintable before any artwork has loaded. The column is gone.
 *
 * Edited as a WHOLE LIST rather than row by row, matching the endpoint: the
 * console sends the list it wants and the server replaces what is there, so a
 * save that drops a row actually drops it.
 */
function Finishes({ colors, productId, canWrite, busy, run }) {
  const t = useT();
  const confirm = useConfirm();
  const border = useColorModeValue('gray.100', 'gray.700');

  const [rows, setRows] = useState(null);

  // Seeded from the server until somebody starts editing, so a reload after a
  // save is reflected rather than being fought by local state.
  const list = rows === null ? (colors || []) : rows;

  const set = (index, patch) => setRows(list.map((row, i) => (
    i === index ? Object.assign({}, row, patch) : row
  )));

  const add = () => setRows(list.concat([{ name: '', hex: '#CCCCCC' }]));
  /*
   * Behind a confirmation, like every other delete in the console.
   *
   * It is only a local edit until Save - but the row vanishes from the
   * screen the instant it is clicked, and the button sits at the end of a
   * row of identical ones. Somebody who removes the wrong finish and then
   * saves has no way back to what the colour was.
   */
  const removeAt = async (index) => {
    const row = list[index];
    const agreed = await confirm({
      tone: 'danger',
      title: t('common.remove'),
      body: t('editor.theFinishIsRemovedFrom'),
      detail: row && row.name,
      confirmLabel: t('common.remove')
    });
    if (!agreed) return;

    setRows(list.filter((entry, i) => i !== index));
  };

  const save = () => run(async () => {
    await products.saveColors(productId, list.map((row) => ({
      name: row.name,
      hex: row.hex
    })));
    // Hand control back to the server's copy.
    setRows(null);
  });

  const valid = list.every((row) => row.name && /^#[0-9A-Fa-f]{6}$/.test(row.hex || ''));

  return (
    <Card
      title={t('editor.finishes')}
      subtitle={t('editor.theColoursThisProductIs')}
      actions={canWrite && (
        <Flex gap="0.5rem" data-gap="8">
          <Button size="xs" onClick={add}>{t('editor.addAFinish')}</Button>
          <Button
            size="xs" colorScheme="brand" onClick={save}
            isLoading={busy} isDisabled={!valid}
          >
            {t('common.save')}
          </Button>
        </Flex>
      )}
    >
      {!list.length ? (
        <Text fontSize="sm">{t('table.emptyBrief')}</Text>
      ) : (
        <Stack spacing={3}>
          {list.map((row, index) => (
            <Flex
              key={index}
              align="center" gap="0.625rem" data-gap="10"
              p="0.625rem" borderWidth="1px" borderColor={border} borderRadius="lg"
            >
              {/* The swatch, painted from the hex beside it - so a typo is
                  visible immediately rather than on the live site. */}
              <Box
                w="2.125rem" h="2.125rem" borderRadius="0.5rem" flexShrink={0}
                borderWidth="1px" borderColor={border}
                bg={/^#[0-9A-Fa-f]{6}$/.test(row.hex || '') ? row.hex : 'transparent'}
              />

              <Box flex="1" minW="0">
                <Input
                  size="sm" placeholder={t('editor.finish')}
                  value={row.name || ''}
                  isReadOnly={!canWrite}
                  onChange={(e) => set(index, { name: e.target.value })}
                />
              </Box>

              <Box w="8.75rem" flexShrink={0}>
                <Input
                  size="sm" fontFamily="mono" placeholder="#RRGGBB"
                  value={row.hex || ''}
                  isReadOnly={!canWrite}
                  isInvalid={!/^#[0-9A-Fa-f]{6}$/.test(row.hex || '')}
                  onChange={(e) => set(index, { hex: e.target.value })}
                />
              </Box>

              {canWrite && (
                <Tooltip label={t('common.remove')} openDelay={250} placement="top" hasArrow>
                  <IconButton
                    aria-label={t('common.remove')} icon={<DeleteIcon />} size="xs"
                    variant="ghost" colorScheme="red"
                    onClick={() => removeAt(index)}
                  />
                </Tooltip>
              )}
            </Flex>
          ))}
        </Stack>
      )}

      {!valid && (
        <Text fontSize="xs" color="red.400" mt="0.625rem">
          {t('editor.everyFinishNeedsAName')}
        </Text>
      )}
    </Card>
  );
}
