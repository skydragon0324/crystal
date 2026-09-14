import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box, Button, Flex, IconButton, SimpleGrid, Spinner, Text, Tooltip,
  useColorModeValue, useToast
} from '@chakra-ui/react';
import {
  ArrowBackIcon, ArrowForwardIcon, DeleteIcon, EditIcon
} from '@chakra-ui/icons';

import FormModal from './FormModal';
import { useConfirm } from './ConfirmDialog';
import { media } from '../api';
import { fileUrl } from '../api/client';
import { useT } from '../i18n';

/**
 * A SECTION'S OWN ADVERTISING RUN - what the top of its landing page shows.
 *
 * Not a product photograph. These are pictures of a RANGE - "the C9 line",
 * "fast charging on the C7 Pro" - with the copy burnt into the artwork, so a
 * slide needs nothing beyond the image and somewhere to go. The landing page
 * used to put its flagged product's studio shots up there instead, which is a
 * photograph of one handset standing in for a whole section.
 *
 * They are `media_assets` on the CATEGORY owner with purpose HERO, edited here
 * rather than in the global media library: the library needs an owner type and
 * an owner id typed in by hand, which is not something anybody should have to
 * know to change a banner.
 *
 * PER DEVICE WIDTH, and both matter. A 1920x760 banner on a phone is a strip;
 * the storefront asks for the device it is on and gets the matching crop, so a
 * section with only desktop art has no hero at all on a phone. The list makes
 * that visible by grouping on it rather than hiding it.
 */

const DEVICES = [
  { value: 'desktop', label: 'Desktop' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'all', label: 'Both' }
];

export default function SectionHero({ category, canWrite }) {
  const t = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const inputRef = useRef(null);

  const border = useColorModeValue('gray.100', 'gray.700');
  const tileBg = useColorModeValue('gray.50', 'whiteAlpha.50');

  const [slides, setSlides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [device, setDevice] = useState('desktop');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // No device filter: the console manages both crops, and the one that is
      // missing is exactly what somebody opened this to notice.
      const { data } = await media.ofOwner('CATEGORY', category.id, { purpose: 'HERO' });
      setSlides(data || []);
    } catch (err) {
      toast({ status: 'error', description: err.message, duration: 6000 });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category.id]);

  useEffect(() => { load(); }, [load]);

  const run = async (action) => {
    setBusy(true);
    try {
      await action();
      toast({ status: 'success', description: t('common.saved'), duration: 2000 });
      await load();
    } catch (err) {
      toast({ status: 'error', description: err.message, duration: 7000 });
    } finally {
      setBusy(false);
    }
  };

  const upload = async (event) => {
    const files = Array.prototype.slice.call(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;

    setBusy(true);
    try {
      const inDevice = slides.filter((slide) => slide.device_type === device);
      const last = inDevice.reduce((most, s) => Math.max(most, s.sort_order || 0), 0);

      for (let i = 0; i < files.length; i += 1) {
        // Owner and purpose ride with the upload, so the row exists the moment
        // the bytes do - a file with no row is invisible.
        // eslint-disable-next-line no-await-in-loop
        await media.upload('categories', files[i], {
          owner_type: 'CATEGORY',
          owner_id: category.id,
          purpose: 'HERO',
          device_type: device,
          alt_text: category.name,
          sort_order: last + (i + 1) * 10
        });
      }
      toast({ status: 'success', description: t('common.saved'), duration: 2000 });
      await load();
    } catch (err) {
      toast({ status: 'error', description: err.message, duration: 7000 });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (slide) => {
    const agreed = await confirm({
      tone: 'danger',
      title: t('common.delete'),
      body: t('common.slideRemovedHint'),
      detail: slide.file_path,
      confirmLabel: t('common.delete')
    });
    if (!agreed) return;
    run(() => media.remove(slide.id));
  };

  /**
   * Moves a slide one place within its own device run.
   *
   * The two rows SWAP sort_order rather than the moved one being renumbered,
   * so the rest of the run keeps its numbers.
   */
  const moveBy = (slide, step) => {
    const run_ = ordered(slides, slide.device_type);
    const at = run_.findIndex((row) => row.id === slide.id);
    const target = run_[at + step];
    if (!target) return;

    run(() => Promise.all([
      media.update(slide.id, { sort_order: target.sort_order }),
      media.update(target.id, { sort_order: slide.sort_order })
    ]));
  };

  if (loading) {
    return <Flex justify="center" py="6"><Spinner size="sm" color="brand.500" /></Flex>;
  }

  const groups = DEVICES
    .map((option) => ({ device: option.value, label: option.label, items: ordered(slides, option.value) }))
    .filter((group) => group.items.length > 0);

  return (
    <Box>
      <Flex justify="space-between" align="center" gap="0.625rem" data-gap="10" data-gap-wrap mb="0.75rem" wrap="wrap">
        <Text fontSize="sm" color="gray.500">
          {t('common.sectionIntroHint')}
        </Text>

        {canWrite && (
          <Flex align="center" gap="0.5rem" data-gap="8">
            {/* Which crop the next upload is, asked before the file picker -
                retagging afterwards is the tedium this avoids. */}
            <Flex gap="0.25rem" data-gap="4">
              {DEVICES.map((option) => (
                <Button
                  key={option.value}
                  size="xs"
                  variant={device === option.value ? 'brand' : 'subtle'}
                  onClick={() => setDevice(option.value)}
                >
                  {t(option.label)}
                </Button>
              ))}
            </Flex>

            <Button
              size="xs" isDisabled={busy}
              onClick={() => inputRef.current && inputRef.current.click()}
            >
              {t('common.addSlides')}
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
        )}
      </Flex>

      {!groups.length ? (
        <Text fontSize="sm" color="gray.500">
          {t('common.noSlidesHint')}
        </Text>
      ) : groups.map((group) => (
        <Box key={group.device} mb="1rem">
          <Text
            fontSize="0.66rem" fontWeight="700" textTransform="uppercase"
            letterSpacing="0.06em" color="gray.500" mb="0.375rem"
          >
            {t(group.label)}
          </Text>

          <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={3}>
            {group.items.map((slide, index) => (
              <Box
                key={slide.id}
                borderWidth="1px" borderColor={border} borderRadius="lg"
                overflow="hidden" position="relative" role="group"
              >
                <Box
                  as="img"
                  src={fileUrl(slide.file_path)}
                  alt={slide.alt_text || ''}
                  w="100%" h="7.5rem" objectFit="cover" bg={tileBg}
                />

                {canWrite && (
                  <Flex
                    position="absolute" top="0.25rem" left="0.25rem" right="0.25rem"
                    justify="space-between"
                    opacity={0} transition="opacity .15s ease"
                    _groupHover={{ opacity: 1 }}
                  >
                    <Flex gap="0.25rem" data-gap="4">
                      <Tooltip label={t('common.moveEarlier')} openDelay={250} placement="top" hasArrow>
                        <IconButton
                          aria-label={t('common.moveEarlier')} icon={<ArrowBackIcon />} size="xs"
                          isDisabled={index === 0 || busy}
                          onClick={() => moveBy(slide, -1)}
                        />
                      </Tooltip>
                      <Tooltip label={t('common.moveLater')} openDelay={250} placement="top" hasArrow>
                        <IconButton
                          aria-label={t('common.moveLater')} icon={<ArrowForwardIcon />} size="xs"
                          isDisabled={index === group.items.length - 1 || busy}
                          onClick={() => moveBy(slide, 1)}
                        />
                      </Tooltip>
                    </Flex>

                    <Flex gap="0.25rem" data-gap="4">
                      <Tooltip label={t('common.edit')} openDelay={250} placement="top" hasArrow>
                        <IconButton
                          aria-label={t('common.edit')} icon={<EditIcon />} size="xs"
                          onClick={() => setEditing(slide)}
                        />
                      </Tooltip>
                      <Tooltip label={t('common.delete')} openDelay={250} placement="top" hasArrow>
                        <IconButton
                          aria-label={t('common.delete')} icon={<DeleteIcon />} size="xs"
                          colorScheme="red" onClick={() => remove(slide)}
                        />
                      </Tooltip>
                    </Flex>
                  </Flex>
                )}

                <Box p="0.5rem">
                  <Text fontSize="0.65rem" noOfLines={1}>{slide.alt_text || '-'}</Text>
                  <Text fontSize="0.6rem" color="gray.500" noOfLines={1}>
                    {slide.link_url || t('common.notALink')}
                  </Text>
                </Box>
              </Box>
            ))}
          </SimpleGrid>
        </Box>
      ))}

      <FormModal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        isLoading={busy}
        title={t('common.edit')}
        initial={editing || {}}
        onSubmit={(payload) => {
          const id = editing.id;
          setEditing(null);
          return run(() => media.update(id, payload));
        }}
        fields={[
          { name: 'device_type', label: 'Crop', type: 'select', required: true, options: DEVICES },
          { name: 'sort_order', label: 'Order', type: 'number' },
          { name: 'file_path', label: 'Image', type: 'image', folder: 'categories', span: 2 },
          {
            name: 'alt_text', label: 'Alt text', span: 2,
            help: 'Read out in place of the picture. The visible copy is in the artwork itself.'
          },
          {
            name: 'link_url', label: 'Goes to', span: 2,
            help: 'A path on the website such as /smartphones/products/c9-pro, or a full address. Leave it empty for a slide that is not a link.'
          }
        ]}
      />
    </Box>
  );
}

/** One device's run, in the order the website shows it. */
function ordered(slides, device) {
  return slides
    .filter((slide) => slide.device_type === device)
    .slice()
    .sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id));
}
