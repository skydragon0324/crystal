import React, { useEffect, useState } from 'react'
import { useSelector } from 'react-redux';
import { Flex, IconButton, Text, Tooltip, useColorModeValue, useDisclosure } from '@chakra-ui/react'
import { FiEye } from 'react-icons/fi';
import Card from 'components/Card/Card';
import CardBody from 'components/Card/CardBody';
import DataTable from 'components/Tables/DataTable';
import Pagination from 'components/Pagination/Pagination';
import NoPermSection from 'components/Section/NoPermSection';
import ViewEshopOrderDetailModal from './ViewEshopOrderDetailModal';
import { getEshopOrderList } from 'api/client/accountApi';
import { calcTableSkeletonRows, formatTime, formatPrice, formatNumber } from 'utils/utils';
import { RESP_CODES } from 'constants/responseCodes';
import { DEFAULT_PAGE_SIZE } from 'constants/constants';
import { getLangText } from 'lang/lang';

const AccountEshopOrdersPage = () => {
  const { user } = useSelector((state) => state.client);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [filter, setFilter] = useState({});
  const [sort, setSort] = useState({});
  const [errText, setErrText] = useState("");
  const [currentRow, setCurrentRow] = useState();
  const { isOpen: isOpenView, onOpen: onOpenView, onClose: onCloseView } = useDisclosure();
  const borderColor = useColorModeValue("var(--chakra-colors-gray-200)", "var(--chakra-colors-gray-600)");
  const tableStickyBg = useColorModeValue("white", "#111C44");

  useEffect(() => {
    const newSort = { key: "", dir: "desc" };
    setSort(newSort);
    setFilter({});
    fetchData(0, DEFAULT_PAGE_SIZE, newSort);
  }, []);

  const fetchData = async (page = 0, pageSize = DEFAULT_PAGE_SIZE, sort = {}, filter = {}) => {
    setLoading(true);
    const offset = page * pageSize;
    const params = { offset, limit: pageSize, sortKey: sort.key || "", sortDir: sort.dir || "", ...filter };
    const resp = await getEshopOrderList(params);
    if (resp.code === RESP_CODES.SUCCESS.code) {
      setTotal(resp.data.total);
      setRows(resp.data.rows.map((row, index) => {
        return ({
          ...row,
          key: row.id,
          no: offset + index + 1,
          money_field: (<Flex direction="column">
            {+row.foreign_qty > 0 && (
              <Flex><Text>{getLangText("ESHOP_GOOD_FOREIGN")} {row.foreign_qty}{getLangText("TEXT_UNIT_COUNT")}</Text> (<Text color="red">{formatPrice(row.foreign_price)}</Text>)</Flex>
            )}
            {+row.native_qty > 0 && (
              <Flex><Text>{getLangText("ESHOP_GOOD_NATIVE")} {row.native_qty}{getLangText("TEXT_UNIT_COUNT")}</Text> (<Text>{formatNumber(row.native_price)}</Text>)</Flex>
            )}
            {+row.point_qty > 0 && (
              <Flex><Text>{getLangText("ESHOP_GOOD_POINT")} {row.point_qty}{getLangText("TEXT_UNIT_COUNT")}</Text> (<Text>{formatPrice(row.point_price)}</Text>)</Flex>
            )}
          </Flex>),
          address_field: (<Flex direction="column">
            <Text>{row.address}</Text>
            <Text>{row.contact}</Text>
            <Text>{row.building}</Text>
          </Flex>),
          created_at: formatTime(row.created_at),
        });
      }))
    } else {
      setErrText(resp.message);
    }
    setLoading(false);
  }

  const onPageChange = (nextPage) => {
    setPage(nextPage);
    fetchData(nextPage, pageSize, sort, filter);
  }

  const onPageSizeChange = (size) => {
    setPageSize(size);
    setPage(0);
    fetchData(0, size, sort, filter);
  }

  const onSortChange = (config) => {
    setSort(config);
    fetchData(page, pageSize, config, filter);
  }

  const onViewRow = (row) => {
    setCurrentRow(row);
    onOpenView();
  }

  const headers = [
    { key: "no", name: getLangText("TEXT_NO"), width: "60px", thAlign: "center" },
    { key: "created_at", name: getLangText("TEXT_ORDER_TIME"), width: "100px" },
    { key: "status", name: getLangText("TEXT_STATUS"), width: "80px" },
    { key: "money_field", name: getLangText("ESHOP_PRICE"), width: "160px" },
    { key: "address_field", name: getLangText("ESHOP_ADDRESS"), width: "300px" },
    { key: "user_reason", name: getLangText("ESHOP_CANCEL_USER"), width: "160px" },
    { key: "reason", name: getLangText("ESHOP_CANCEL_MANAGER"), width: "160px" },
  ];

  const actions = (row, disabled = false) => (
    <Flex direction="row" align="center" justify="flex-end">
      <Tooltip label={getLangText("TEXT_DETAIL")} hasArrow placement="top">
        <IconButton variant="outline" colorScheme="blue" icon={<FiEye />} disabled={disabled} onClick={() => onViewRow(row)} />
      </Tooltip>
    </Flex>
  );

  if (!user) {
    return <NoPermSection />
  }

  return (
    <Flex direction="column">
      <Card pb="0px">
        <CardBody>
          <DataTable
            headers={headers}
            rows={rows}
            sort={sort}
            actions={actions}
            actionWidth="70px"
            loading={loading}
            borderColor={borderColor}
            stickyBg={tableStickyBg}
            errText={errText}
            skeletons={calcTableSkeletonRows(total, page, pageSize)}
            disableKey={0}
            onSortChange={onSortChange}
          />
          <Pagination
            count={total}
            page={page}
            pageSize={pageSize}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
            showGoto={true}
            showTotal={true}
          />
        </CardBody>
      </Card>
      <ViewEshopOrderDetailModal
        isOpen={isOpenView}
        onClose={onCloseView}
        title={getLangText("TEXT_DETAIL")}
        orderId={currentRow?.order_id}
      />
    </Flex>
  )
}

export default AccountEshopOrdersPage;