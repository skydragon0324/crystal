import React, { useEffect, useState } from 'react'
import { useSelector } from 'react-redux';
import { Flex, useColorModeValue } from '@chakra-ui/react'
import Card from 'components/Card/Card';
import CardBody from 'components/Card/CardBody';
import DataTable from 'components/Tables/DataTable';
import Pagination from 'components/Pagination/Pagination';
import NoPermSection from 'components/Section/NoPermSection';
import { getEshopWalletTransactions } from 'api/client/accountApi';
import { calcTableSkeletonRows, formatTime, formatPrice } from 'utils/utils';
import { getLangText } from 'lang/lang';
import { RESP_CODES } from 'constants/responseCodes';
import { DEFAULT_PAGE_SIZE, ESHOP_WALLET_API_TYPE, ESHOP_MONEY_TYPES, ESHOP_FILL_TYPES } from 'constants/constants';

const AccountEshopCommerceValuesPage = () => {
  const { user } = useSelector((state) => state.client);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [filter, setFilter] = useState({});
  const [sort, setSort] = useState({});
  const [errText, setErrText] = useState("");
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
    const params = { offset, limit: pageSize, sortKey: sort.key || "", sortDir: sort.dir || "", type: ESHOP_WALLET_API_TYPE.COMMERCE_VALUE, ...filter };
    const resp = await getEshopWalletTransactions(params);
    if (resp.code === RESP_CODES.SUCCESS.code) {
      setTotal(resp.data.total);
      setRows(resp.data.rows.map((row, index) => {
        const moneyItem = ESHOP_MONEY_TYPES.find(item => item.id === +row.money_type);
        const fillItem = ESHOP_FILL_TYPES.find(item => item.type === row.fill_type);
        return ({
          ...row,
          key: row.id,
          no: offset + index + 1,
          money_field: formatPrice(row.money_value),
          type_field: moneyItem ? moneyItem.name : "",
          fill_field: fillItem ? fillItem.name : "",
          created_at: formatTime(row.fill_dt),
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

  const headers = [
    { key: "no", name: getLangText("TEXT_NO"), width: "60px", thAlign: "center" },
    { key: "created_at", name: getLangText("TEXT_TIME"), width: "100px" },
    { key: "money_field", name: getLangText("ESHOP_COMMERCE_VALUE"), width: "100px" },
    // { key: "type_field", name: getLangText("ESHOP_MONEY_TYPE"), width: "80px" },
    { key: "fill_field", name: getLangText("TEXT_TYPE"), width: "80px" },
    { key: "detail", name: getLangText("TEXT_DETAIL"), width: "200px" },
  ];

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
            actions={null}
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
    </Flex>
  )
}

export default AccountEshopCommerceValuesPage;