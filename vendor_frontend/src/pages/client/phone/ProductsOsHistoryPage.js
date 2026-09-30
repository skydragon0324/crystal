import React, { useEffect, useState } from 'react'
import { Box, Flex, SkeletonText, Tag, Text, useColorModeValue } from '@chakra-ui/react';
import SiteContainer from 'components/Layout/SiteContainer';
import useCustomToast from 'hooks/useCustomToast';
import { getOsHistory } from 'api/client/clientPhoneApi';
import { sanitizeRichText } from 'utils/utils';
import { getLangText } from 'lang/lang';
import { RESP_CODES } from 'constants/responseCodes';

const SKELETON_ENTRIES = 3;

/**
 * OS release notes for one model.
 *
 * The release body is stored HTML written by staff and was rendered
 * straight into dangerouslySetInnerHTML; it goes through sanitizeRichText
 * now like every other stored field.
 *
 * The fetch also ignored its own failure - a rejected request left the
 * page silently empty with no toast and no message - and it took a
 * `product` argument it never used, reading productPk from the closure
 * instead.
 */
function ProductsOsHistoryPage(props) {
  const { productPk } = props;
  const { toastError } = useCustomToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const cardBg = useColorModeValue('white', 'navy.700');
  const cardShadow = useColorModeValue(
    '14px 17px 40px 4px rgba(112, 144, 176, 0.08)',
    '14px 17px 40px 4px rgba(12, 44, 55, 0.18)'
  );
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const mutedColor = useColorModeValue('secondaryGray.700', 'secondaryGray.400');
  const borderColor = useColorModeValue('secondaryGray.100', 'whiteAlpha.100');

  useEffect(() => {
    if (!productPk) return undefined;

    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      const resp = await getOsHistory(productPk);
      if (cancelled) return;

      if (resp.code === RESP_CODES.SUCCESS.code) {
        setRows(resp.data.rows || []);
      } else {
        toastError(resp.message);
      }
      setLoading(false);
    };

    fetchData();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productPk]);

  const renderEntry = (row) => (
    <Box
      key={row.table_pk}
      bg={cardBg}
      boxShadow={cardShadow}
      borderRadius="20px"
      p={{ base: '20px', md: '26px' }}
      mb="16px"
    >
      <Flex align="flex-start" justify="space-between" gridGap="12px" mb="12px">
        <Text fontSize={{ base: 'md', md: 'lg' }} fontWeight="700" color={textColor}>
          {row.title}
        </Text>
        {row.publish_num ? (
          <Tag size="sm" borderRadius="8px" flexShrink={0} colorScheme="brandScheme">
            {getLangText('OS_HISTORY_BUILD')} {row.publish_num}
          </Tag>
        ) : null}
      </Flex>

      <Box
        fontSize="sm"
        color={mutedColor}
        borderTopWidth="1px"
        borderColor={borderColor}
        pt="14px"
        sx={{
          'a': { color: 'brand.500', textDecoration: 'underline' },
          'ul, ol': { paddingInlineStart: '20px' },
          'img': { maxWidth: '100%', height: 'auto', borderRadius: '8px' },
        }}
        dangerouslySetInnerHTML={{ __html: sanitizeRichText(row.content) }}
      />
    </Box>
  );

  return (
    <SiteContainer pt={{ base: '20px', md: '28px' }}>
      <Text fontSize={{ base: 'lg', md: 'xl' }} fontWeight="800" color={textColor} mb="14px">
        {getLangText('DETAIL_TAB_OS')}
      </Text>

      {loading ? (
        Array.from({ length: SKELETON_ENTRIES }).map((_, index) => (
          <Box key={`sk-${index}`} bg={cardBg} boxShadow={cardShadow} borderRadius="20px" p="26px" mb="16px">
            <SkeletonText noOfLines={4} spacing="12px" skeletonHeight="12px" />
          </Box>
        ))
      ) : !rows.length ? (
        <Box bg={cardBg} boxShadow={cardShadow} borderRadius="20px" py="48px" textAlign="center" fontSize="sm" color={mutedColor}>
          {getLangText('OS_HISTORY_EMPTY')}
        </Box>
      ) : rows.map(renderEntry)}
    </SiteContainer>
  );
}

export default ProductsOsHistoryPage;
