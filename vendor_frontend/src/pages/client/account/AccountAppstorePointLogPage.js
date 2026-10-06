import React, { useEffect, useState } from 'react'
import { useSelector } from 'react-redux';
import { Box, Flex, Tag, Text, useColorModeValue } from '@chakra-ui/react'
import Card from 'components/Card/Card';
import CardHeader from 'components/Card/CardHeader';
import CardBody from 'components/Card/CardBody';
import { SearchBar } from 'components/Navbars/SearchBar/SearchBar';
import DataTable from 'components/Tables/DataTable';
import Pagination from 'components/Pagination/Pagination';
import NoPermSection from 'components/Section/NoPermSection';
import CustomDatePicker from 'components/Picker/CustomDatePicker';
import { getSoftPointLog } from 'api/client/accountApi';
import { calcTableSkeletonRows, formatTime, formatNumber, formatDbDate, convertDateFromString } from 'utils/utils';
import { getLangText } from 'lang/lang';
import { RESP_CODES } from 'constants/responseCodes';
import { DEFAULT_PAGE_SIZE, SOFT_POINT_TYPES, SOFT_POINT_STATUS_LIST } from 'constants/constants';

const AccountAppstorePointLogPage = () => {
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
  const inputBg = useColorModeValue("transparent", "navy.900");
  const tableStickyBg = useColorModeValue("white", "#111C44");

  useEffect(() => {
    const newSort = { key: "", dir: "desc" };
    setSort(newSort);
    fetchData(0, DEFAULT_PAGE_SIZE, newSort);
  }, []);

  const fetchData = async (page = 0, pageSize = DEFAULT_PAGE_SIZE, sort = {}, filter = {}) => {
    setLoading(true);
    const offset = page * pageSize;
    const params = { offset, limit: pageSize, sortKey: sort.key || "", sortDir: sort.dir || "", ...filter, point_type: SOFT_POINT_TYPES.APPSTORE };
    const resp = await getSoftPointLog(params);
    if (resp.code === RESP_CODES.SUCCESS.code) {
      setTotal(resp.data.total);
      setRows(resp.data.rows.map((row, index) => {
        const statusItem = SOFT_POINT_STATUS_LIST.find(item => item.id === row.status);
        return ({
          ...row,
          key: row.table_pk,
          no: offset + index + 1,
          pay_field: formatNumber(row.pay_points),
          soft_point_field: formatNumber(row.soft_points),
          status_field: statusItem ? <Tag colorScheme={statusItem.color} whiteSpace="nowrap">{statusItem.name}</Tag> : "",
          action_at: formatTime(row.action_at),
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

  const onSearch = (keyword) => {
    const newFilter = { ...filter, keyword };
    setFilter(newFilter);
    fetchData(page, pageSize, sort, newFilter);
  }

  const onSortChange = (config) => {
    setSort(config);
    fetchData(page, pageSize, config, filter);
  }

  const onStartDateChange = (e) => {
    const newFilter = { ...filter, start_date: formatDbDate(e) };
    setFilter(newFilter);
    fetchData(0, pageSize, sort, newFilter);
  }

  const onEndDateChange = (e) => {
    const newFilter = { ...filter, end_date: formatDbDate(e) };
    setFilter(newFilter);
    fetchData(0, pageSize, sort, newFilter);
  }

  const headers = [
    { key: "no", name: getLangText("TEXT_NO"), width: "60px", thAlign: "center" },
    { key: "equ_num", name: getLangText("TEXT_EQU_NUM"), width: "200px" },
    { key: "pay_field", name: getLangText("APPSTORE_PAY_POINT"), width: "100px" },
    { key: "soft_point_field", name: getLangText("APPSTORE_SOFT_POINT"), width: "100px" },
    { key: "reason", name: getLangText("TEXT_REASON"), width: "360px" },
    { key: "status_field", name: getLangText('TEXT_STATUS'), width: "80px" },
    { key: "action_at", name: getLangText("TEXT_PURCHASE_TIME"), width: "100px" },
  ];

  if (!user) {
    return <NoPermSection />
  }

  return (
    <Flex direction="column">
      <Card pb="0px">
        <CardHeader p="6px 0px 10px 0px">
          <Flex align="center">
            <Text whiteSpace="nowrap" mr="8px">{getLangText("TEXT_PERIOD")}:</Text>
            <CustomDatePicker
              value={filter.start_date ? convertDateFromString(filter.start_date) : null}
              onChange={onStartDateChange}
              disabled={loading}
            />
            <Box w="8px" />
            <CustomDatePicker
              value={filter.end_date ? convertDateFromString(filter.end_date) : null}
              onChange={onEndDateChange}
              disabled={loading}
            />
          </Flex>
          <SearchBar background={inputBg} onSearch={onSearch} disabled={loading} />
        </CardHeader>
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

export default AccountAppstorePointLogPage;
