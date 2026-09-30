import React, { useRef, useEffect, useState } from 'react';
import { AlertDialog, AlertDialogBody, AlertDialogCloseButton, AlertDialogContent, AlertDialogHeader, AlertDialogOverlay, Text, useColorModeValue } from '@chakra-ui/react';
import DataTable from 'components/Tables/DataTable';
import Pagination from 'components/Pagination/Pagination';
import { getBMediaKeygenById } from 'api/client/accountApi';
import { formatDuration, formatPrice } from 'utils/utils';
import { getLangText } from 'lang/lang';
import { RESP_CODES } from 'constants/responseCodes';
import { DEFAULT_PAGE_SIZE } from 'constants/constants';

const ViewBMediaDetailModal = (props) => {
  const { isOpen, onClose, title = "", id, closeButton = true, onSave, ...rest } = props;
  const cancelRef = useRef();
  const [total, setTotal] = useState(0);
  const [medias, setMedias] = useState([]);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const borderColor = useColorModeValue("var(--chakra-colors-gray-200)", "var(--chakra-colors-gray-600)");
  const tableStickyBg = useColorModeValue("white", "#111C44");

  useEffect(() => {
    if (isOpen && id) {
      setPage(0);
      setPageSize(DEFAULT_PAGE_SIZE);
      fetchData(id);
    }
  }, [isOpen, id])

  const fetchData = async (id) => {
    setLoading(true);
    const params = {
      id,
    };
    const resp = await getBMediaKeygenById(params);
    if (resp.code === RESP_CODES.SUCCESS.code) {
      setTotal(resp.data.total);
      const totalMedias = resp.data.rows.map((row, index) => ({
        ...row,
        key: row.id,
        no: index + 1,
        duration: formatDuration(row.duration),
        media_price: formatPrice(row.media_price),
      }));
      setMedias(totalMedias);
      setRows(totalMedias.slice(0, DEFAULT_PAGE_SIZE));
    }
    setLoading(false);
  }

  const onPageChange = (nextPage) => {
    setPage(nextPage);
    setRows(medias.slice(nextPage * pageSize, (nextPage + 1) * pageSize));
  }

  const headers = [
    { key: "no", name: getLangText("TEXT_NO"), width: "60px", thAlign: "center" },
    { key: "title", name: getLangText("TEXT_TITLE"), width: "200px" },
    { key: "duration", name: getLangText("MEDIA_DURATION"), width: "100px" },
    { key: "media_price", name: getLangText("MEDIA_PRICE"), width: "100px" },
    { key: "short_name", name: getLangText("MEDIA_PROVIDER"), width: "100px" },
  ];

  if (loading) {
    return <Text></Text>;
  }

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
            loading={loading}
            borderColor={borderColor}
            stickyBg={tableStickyBg}
          />
          <Pagination
            count={total}
            page={page}
            pageSize={pageSize}
            onPageChange={onPageChange}
            showGoto={false}
            showTotal={true}
          />
        </AlertDialogBody>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default ViewBMediaDetailModal;
