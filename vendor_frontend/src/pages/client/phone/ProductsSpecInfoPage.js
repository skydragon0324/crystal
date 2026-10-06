import React, { useEffect, useState } from 'react'
import {
  Box, Flex, Skeleton, SkeletonText, Text, useColorModeValue,
} from '@chakra-ui/react';
import AppImage from 'components/Frame/AppImage';
import SiteContainer from 'components/Layout/SiteContainer';
import { getProductSpec } from 'api/client/clientPhoneApi';
import useCustomToast from 'hooks/useCustomToast';
import { RESP_CODES } from 'constants/responseCodes';
import { getFileUrl } from 'utils/utils';
import { mockProductImage } from 'utils/mockImage';
import { getLangText } from 'lang/lang';

const SKELETON_ROWS = 8;

/**
 * The specification tab.
 *
 * Laid out as a two-column sheet from md up - the photograph on the left,
 * the spec rows on the right - rather than the previous stacked centre
 * column, which pushed the specifications below the fold on every screen.
 *
 * The response was also read without checking it: `resp.data.images[0]`
 * throws for a model with no images at all, which took the whole tab down
 * rather than showing a placeholder.
 */
function ProductsSpecInfoPage(props) {
  const { productPk } = props;
  const { toastError } = useCustomToast();
  const [specs, setSpecs] = useState([]);
  const [productImg, setProductImg] = useState({});
  const [loading, setLoading] = useState(true);

  const cardBg = useColorModeValue('white', 'navy.700');
  const cardShadow = useColorModeValue(
    '14px 17px 40px 4px rgba(112, 144, 176, 0.08)',
    '14px 17px 40px 4px rgba(12, 44, 55, 0.18)'
  );
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const mutedColor = useColorModeValue('secondaryGray.700', 'secondaryGray.400');
  const borderColor = useColorModeValue('secondaryGray.100', 'whiteAlpha.100');
  const stripeBg = useColorModeValue('secondaryGray.300', 'whiteAlpha.50');

  useEffect(() => {
    if (!productPk) return undefined;

    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      const resp = await getProductSpec(productPk);
      if (cancelled) return;

      if (resp.code === RESP_CODES.SUCCESS.code) {
        const data = resp.data || {};
        setSpecs((data.specs || []).filter((item) => item.spec_type === 0));
        // `images[0]` on a model with no images threw and took the tab
        // down with it.
        setProductImg((data.images || [])[0] || {});
      } else {
        toastError(resp.message);
      }
      setLoading(false);
    };

    fetchData();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productPk]);

  const renderSpecRow = (spec, index) => (
    <Flex
      key={spec.spec_pk || index}
      align="flex-start"
      px={{ base: '16px', md: '20px' }}
      py="14px"
      bg={index % 2 ? stripeBg : 'transparent'}
      borderBottomWidth={index === specs.length - 1 ? '0' : '1px'}
      borderColor={borderColor}
    >
      <Text
        w={{ base: '38%', md: '30%' }}
        flexShrink={0}
        fontSize="sm"
        fontWeight="600"
        color={mutedColor}
      >
        {spec.spec_name}
      </Text>
      <Text flex="1" fontSize="sm" color={textColor} wordBreak="break-word">
        {spec.spec_value}
      </Text>
    </Flex>
  );

  return (
    <SiteContainer pt={{ base: '20px', md: '28px' }}>
      <Flex direction={{ base: 'column', md: 'row' }} align="flex-start" gridGap={{ base: '20px', md: '28px' }}>
        {/* photograph */}
        <Box
          w={{ base: '100%', md: '320px', lg: '380px' }}
          flexShrink={0}
          bg={cardBg}
          boxShadow={cardShadow}
          borderRadius="20px"
          p="18px"
          // Sticky on a wide screen so the handset stays in view while
          // a long specification list scrolls beside it.
          position={{ base: 'static', md: 'sticky' }}
          top={{ md: '130px' }}
        >
          {loading ? (
            <Skeleton borderRadius="16px" paddingBottom="100%" />
          ) : (
            <AppImage
              src={getFileUrl(productImg.image_url)}
              mock={mockProductImage({ product_pk: productPk }, 720)}
              label={productImg.image_name}
              ratio={1}
              borderRadius="16px"
            />
          )}
        </Box>

        {/* specification sheet */}
        <Box flex="1" minW="0" w="100%" bg={cardBg} boxShadow={cardShadow} borderRadius="20px" overflow="hidden">
          <Box px={{ base: '16px', md: '20px' }} py="16px" borderBottomWidth="1px" borderColor={borderColor}>
            <Text fontSize={{ base: 'md', md: 'lg' }} fontWeight="800" color={textColor}>
              {getLangText('DETAIL_TAB_SPEC')}
            </Text>
          </Box>

          {loading ? (
            <Box px="20px" py="18px">
              <SkeletonText noOfLines={SKELETON_ROWS} spacing="16px" skeletonHeight="12px" />
            </Box>
          ) : !specs.length ? (
            <Box py="48px" textAlign="center" fontSize="sm" color={mutedColor}>
              {getLangText('TEXT_NO_CONTENT')}
            </Box>
          ) : specs.map(renderSpecRow)}
        </Box>
      </Flex>
    </SiteContainer>
  );
}

export default ProductsSpecInfoPage;
