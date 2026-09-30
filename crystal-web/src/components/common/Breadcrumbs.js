import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink } from '@chakra-ui/react';
import { ChevronRightIcon } from '@chakra-ui/icons';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

export default function Breadcrumbs({ items }) {
  const t = useT();

  const surface = useSurface();
  return (
    <Breadcrumb
      spacing="2"
      separator={<ChevronRightIcon color={surface.muted} boxSize="3" />}
      fontSize="sm"
      color={surface.muted}
      mb="6"
    >
      <BreadcrumbItem>
        <BreadcrumbLink as={RouterLink} to="/" _hover={{ color: 'brand.500' }}>
          {t('common.crystal')}
        </BreadcrumbLink>
      </BreadcrumbItem>
      {/*
        * KEYED ON THE PATH, not on the words.
        *
        * This keyed on `t(item.label)`, which has two faults. The last crumb
        * is usually the title of whatever is being loaded, so before the
        * response lands the label is undefined and so is the key - which is
        * the warning this fixes. And a key made of translated text CHANGES
        * WITH THE LANGUAGE, so every crumb remounted on a locale switch.
        *
        * A crumb's path is its identity; the last one has none, and its
        * position is identity enough for a list of two or three.
        */}
      {(items || []).map((item, index) => (
        <BreadcrumbItem key={item.to || 'crumb-' + index} isCurrentPage={index === items.length - 1}>
          {item.to ? (
            <BreadcrumbLink as={RouterLink} to={item.to} _hover={{ color: 'brand.500' }}>
              {t(item.label)}
            </BreadcrumbLink>
          ) : (
            <BreadcrumbLink color={surface.text} fontWeight="600" cursor="default">
              {t(item.label)}
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>
      ))}
    </Breadcrumb>
  );
}
