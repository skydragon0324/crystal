import React, { useRef, useEffect, useState } from 'react';
import { AlertDialog, AlertDialogBody, AlertDialogCloseButton, AlertDialogContent, AlertDialogHeader, AlertDialogOverlay, Flex, Image, Text, useColorModeValue } from '@chakra-ui/react';
import DataTable from 'components/Tables/DataTable';
import { getEshopOrderDetail } from 'api/client/accountApi';
import { formatPrice, formatNumber, getEshopGoodDetailUrl, getEshopGoodImageUrl } from 'utils/utils';
import { getLangText } from 'lang/lang';
import { RESP_CODES } from 'constants/responseCodes';

const ViewEshopOrderDetailModal = (props) => {
  const { isOpen, onClose, title = "", orderId, closeButton = true, onSave, ...rest } = props;
  const cancelRef = useRef();
  const [rows, setRows] = useState([]);
  const [errText, setErrText] = useState("");
  const [loading, setLoading] = useState(false);
  const borderColor = useColorModeValue("var(--chakra-colors-gray-200)", "var(--chakra-colors-gray-600)");
  const tableStickyBg = useColorModeValue("white", "#111C44");

  useEffect(() => {
    if (isOpen && orderId) {
      fetchData(orderId);
    }
  }, [isOpen, orderId])

  const fetchData = async (order_id) => {
    setLoading(true);
    const params = {
      order_id,
    };
    const resp = await getEshopOrderDetail(params);
    if (resp.code === RESP_CODES.SUCCESS.code) {
      setRows(resp.data.rows.map((row, index) => ({
        ...row,
        key: row.good_id,
        no: index + 1,
        name_field: (
          <a href={getEshopGoodDetailUrl(row.goods_id)} target="_blank" rel="noreferrer">
            <Text>{row.goods_name}</Text>
          </a>
        ),
        img_field: (
          <Image src={getEshopGoodImageUrl(row.goods_img)} alt="" w="full" h="auto" objectFit="cover" />
        ),
        price_field: (<Flex>
          <Text color="red">{formatPrice(row.real_price)}</Text>
          {row.price !== row.real_price && (
            <Text color="red" textDecoration="line-through" ml="8px">{formatPrice(row.price)}</Text>
          )}
        </Flex>),
        qty_field: formatNumber(row.qty),
        total_field: <Text color="red">{formatPrice(row.real_total_price)}</Text>,
      })));
    } else {
      setErrText(resp.message);
    }
    setLoading(false);
  }

  const headers = [
    { key: "no", name: getLangText("TEXT_NO"), width: "60px", thAlign: "center" },
    { key: "name_field", name: getLangText("ESHOP_GOOD_NAME"), width: "160px" },
    { key: "img_field", name: getLangText("ESHOP_GOOD_IMAGE"), width: "80px" },
    { key: "standard", name: getLangText("ESHOP_GOOD_STANDARD"), width: "200px" },
    { key: "price_field", name: getLangText("ESHOP_GOOD_PRICE"), width: "120px" },
    { key: "qty_field", name: getLangText("TEXT_QUANTITY"), width: "80px" },
    { key: "total_field", name: getLangText("ESHOP_PRICE"), width: "80px" },
    { key: "status", name: getLangText("ESHOP_PRICE"), width: "80px" },
  ];

  return (
    <AlertDialog
      motionPreset="slideInBottom"
      leastDestructiveRef={cancelRef}
      isCentered
      closeOnOverlayClick={false}
      isOpen={isOpen}
      onClose={onClose}
      {...rest}
    >
      <AlertDialogOverlay />
      <AlertDialogContent maxW="1080px">
        {!!title && (
          <AlertDialogHeader fontSize="lg" fontWeight="bold">
            {title}
          </AlertDialogHeader>
        )}
        {closeButton && (
          <AlertDialogCloseButton />
        )}
        <AlertDialogBody mt={!!title ? "" : "3"}>
          <DataTable
            headers={headers}
            rows={rows}
            actions={null}
            loading={loading}
            borderColor={borderColor}
            stickyBg={tableStickyBg}
            errText={errText}
          />
        </AlertDialogBody>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default ViewEshopOrderDetailModal;
