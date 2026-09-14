import React from 'react';
import { Flex, Text, useColorModeValue } from '@chakra-ui/react';
import { NavLink } from 'react-router-dom';
import AppImage from 'components/Frame/AppImage';
import { getFileUrl, formatPrice } from 'utils/utils';
import { mockProductImage } from 'utils/mockImage';
import { PRICE_FORMAT } from 'constants/constants';
import { getLangText } from 'lang/lang';

/** The API sends -1 for "we do not quote a price for this". */
const isUnpriced = (price) =>
  +price === -1 || price === null || price === undefined || price === '';

/**
 * One product tile.
 *
 * Shared by the storefront grid and the homepage's featured strip. It was
 * written twice at first, and the two copies had already drifted on the
 * price rule - one of them printed a bare "-1" for an unpriced handset.
 * One component, one rule.
 */
const ProductCard = ({ row, ...rest }) => {
  const cardBg = useColorModeValue('white', 'navy.700');
  const cardShadow = useColorModeValue(
    '14px 17px 40px 4px rgba(112, 144, 176, 0.08)',
    '14px 17px 40px 4px rgba(12, 44, 55, 0.18)'
  );
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const priceColor = useColorModeValue('red.500', 'red.300');

  return (
    <Flex
      as={NavLink}
      to={`/vendor/phone/product/${row.product_pk}`}
      direction="column"
      h="100%"
      bg={cardBg}
      borderRadius="20px"
      boxShadow={cardShadow}
      p="14px"
      transition="transform .2s ease, box-shadow .2s ease"
      _hover={{ transform: 'translateY(-4px)' }}
      {...rest}
    >
      <AppImage
        src={getFileUrl(row.image_url)}
        mock={mockProductImage(row)}
        label={row.product_name}
        ratio={1}
        borderRadius="14px"
        objectFit="cover"
      />

      <Text mt="14px" fontSize="sm" fontWeight="700" color={textColor} textAlign="center" noOfLines={2}>
        {row.product_name}
      </Text>

      <Text mt="6px" fontSize="sm" fontWeight="700" color={priceColor} textAlign="center">
        {isUnpriced(row.price)
          ? getLangText('PHONE_PRICE_ON_REQUEST')
          : formatPrice(row.price, PRICE_FORMAT.FRONT)}
      </Text>
    </Flex>
  );
};

export default ProductCard;
