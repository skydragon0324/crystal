import React, { useEffect, useState } from 'react'
import { Box, Text, useColorModeValue } from '@chakra-ui/react';
import DataTable from 'components/Tables/DataTable';
import SiteContainer from 'components/Layout/SiteContainer';
import useCustomToast from 'hooks/useCustomToast';
import { getServiceCosts } from 'api/client/clientPhoneApi';
import { formatPrice } from 'utils/utils';
import { getLangText } from 'lang/lang';
import { RESP_CODES } from 'constants/responseCodes';

/**
 * Parts and labour pricing for one model.
 *
 * This page used to render the list twice: a DataTable pinned to
 * `view="table"` for desktop, and a hand-written stack of cards below it
 * shown only under md. That is exactly what DataTable's default `auto`
 * view does - table from md up, cards below - so the second copy is gone.
 *
 * The duplicate had also drifted: it called formatPrice on values the
 * fetch had already formatted, so a price that came back as "1 200 000"
 * was re-parsed and printed as "0".
 */
function ProductsServiceCostPage(props) {
  const { productPk } = props;
  const { toastError } = useCustomToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const cardBg = useColorModeValue('white', 'navy.700');
  const cardShadow = useColorModeValue(
    '14px 17px 40px 4px rgba(112, 144, 176, 0.08)',
    '14px 17px 40px 4px rgba(12, 44, 55, 0.18)'
  );

  useEffect(() => {
    if (!productPk) return undefined;

    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      const resp = await getServiceCosts(productPk);
      if (cancelled) return;

      if (resp.code === RESP_CODES.SUCCESS.code) {
        setRows((resp.data.rows || []).map((row) => ({
          ...row,
          key: row.accessory_pk,
          service_price: formatPrice(row.service_price),
          resource_price: formatPrice(row.resource_price),
        })));
      } else {
        toastError(resp.message);
      }
      setLoading(false);
    };

    fetchData();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productPk]);

  const headers = [
    { key: "accessory_name", name: getLangText("PHONE_ACCESSARY_NAME"), width: "220px", cardTitle: true },
    { key: "resource_price", name: getLangText("PHONE_RESOURCE_PRICE"), width: "140px", thAlign: "right", tdAlign: "right" },
    { key: "service_price", name: getLangText("PHONE_SERVICE_PRICE"), width: "140px", thAlign: "right", tdAlign: "right" },
    { key: "allow_num", name: getLangText("PHONE_PRICE_ALLOW_NUM"), width: "120px", thAlign: "center", tdAlign: "center" },
  ];

  return (
    <SiteContainer pt={{ base: '20px', md: '28px' }}>
      <Text fontSize={{ base: 'lg', md: 'xl' }} fontWeight="800" color={textColor} mb="14px">
        {getLangText('DETAIL_TAB_PRICE')}
      </Text>

      <Box bg={cardBg} boxShadow={cardShadow} borderRadius="20px" p={{ base: '12px', md: '20px' }}>
        <DataTable
          headers={headers}
          rows={rows}
          loading={loading}
          errText={!loading && !rows.length ? getLangText('SERVICE_COST_EMPTY') : ''}
          // A long parts list: freezing the header keeps the column labels
          // in view while scrolling, and the part-name column is the one
          // most likely to need widening.
          resizable
          stickyHeader
          maxHeight="60vh"
          skeletons={6}
        />
      </Box>
    </SiteContainer>
  );
}

export default ProductsServiceCostPage;
