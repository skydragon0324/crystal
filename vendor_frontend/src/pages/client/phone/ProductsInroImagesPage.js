import React, { useEffect, useState } from 'react'
import { Box, Skeleton, Stack, Text, useColorModeValue } from '@chakra-ui/react'
import AppImage from 'components/Frame/AppImage';
import SiteContainer from 'components/Layout/SiteContainer';
import { getPhoneImages } from 'api/client/clientPhoneApi';
import useCustomToast from 'hooks/useCustomToast';
import { RESP_CODES } from 'constants/responseCodes';
import { getFileUrl } from 'utils/utils';
import { mockGalleryImage } from 'utils/mockImage';
import { getLangText } from 'lang/lang';

const SKELETON_PANELS = 2;

/**
 * The marketing gallery for one model: a single column of full-width
 * images, which is how the artwork is authored.
 *
 * Held to the site's centred column rather than the full viewport - at
 * 1920px the previous version stretched a 1200px-wide asset across the
 * whole screen and it read as blurred.
 */
function ProductsIntroImagesPage(props) {
  const { productPk } = props;
  const { toastError } = useCustomToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const cardBg = useColorModeValue('white', 'navy.700');
  const cardShadow = useColorModeValue(
    '14px 17px 40px 4px rgba(112, 144, 176, 0.08)',
    '14px 17px 40px 4px rgba(12, 44, 55, 0.18)'
  );
  const mutedColor = useColorModeValue('secondaryGray.700', 'secondaryGray.400');

  useEffect(() => {
    if (!productPk) return undefined;

    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      const resp = await getPhoneImages(productPk);
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

  return (
    <SiteContainer pt={{ base: '20px', md: '28px' }}>
      {loading ? (
        <Stack spacing="16px">
          {Array.from({ length: SKELETON_PANELS }).map((_, index) => (
            <Skeleton key={`sk-${index}`} borderRadius="20px" paddingBottom="56%" />
          ))}
        </Stack>
      ) : !rows.length ? (
        <Box bg={cardBg} boxShadow={cardShadow} borderRadius="20px" py="48px" textAlign="center">
          <Text fontSize="sm" color={mutedColor}>{getLangText('TEXT_NO_CONTENT')}</Text>
        </Box>
      ) : (
        <Stack spacing={{ base: '12px', md: '16px' }}>
          {rows.map((item, index) => (
            <Box key={item.table_pk || index} borderRadius={{ base: '10px', md: '20px' }} overflow="hidden">
              <AppImage
                src={getFileUrl(item.image_url)}
                mock={mockGalleryImage(item, index)}
                label={item.image_name}
              />
            </Box>
          ))}
        </Stack>
      )}
    </SiteContainer>
  );
}

export default ProductsIntroImagesPage;
