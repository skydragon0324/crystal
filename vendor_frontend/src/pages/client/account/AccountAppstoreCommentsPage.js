import React, { useEffect, useState } from 'react'
import moment from 'moment';
import { useSelector } from 'react-redux';
import { Box, Flex, Image, Tag, Text, useColorModeValue } from '@chakra-ui/react'
import Card from 'components/Card/Card';
import CardHeader from 'components/Card/CardHeader';
import CardBody from 'components/Card/CardBody';
import { SearchBar } from 'components/Navbars/SearchBar/SearchBar';
import DataTable from 'components/Tables/DataTable';
import Pagination from 'components/Pagination/Pagination';
import NoPermSection from 'components/Section/NoPermSection';
import CustomDatePicker from 'components/Picker/CustomDatePicker';
import { getAppstoreComments } from 'api/client/accountApi';
import { calcTableSkeletonRows, formatTime, getAppstoreUrl, formatDbDate, convertDateFromString, firstDateOfMonth } from 'utils/utils';
import { getLangText } from 'lang/lang';
import { RESP_CODES } from 'constants/responseCodes';
import { DEFAULT_PAGE_SIZE } from 'constants/constants';

const AccountAppstoreCommentsPage = () => {
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
    const newFilter = { start_date: formatDbDate(firstDateOfMonth(moment())), end_date: formatDbDate(moment()) };
    setFilter(newFilter);
    fetchData(0, DEFAULT_PAGE_SIZE, newSort, newFilter);
  }, []);

  const fetchData = async (page = 0, pageSize = DEFAULT_PAGE_SIZE, sort = {}, filter = {}) => {
    setLoading(true);
    const offset = page * pageSize;
    const params = { offset, limit: pageSize, sortKey: sort.key || "", sortDir: sort.dir || "", ...filter };
    const resp = await getAppstoreComments(params);
    if (resp.code === RESP_CODES.SUCCESS.code) {
      setTotal(resp.data.total);
      setRows(resp.data.rows.map((row, index) => {
        return ({
          ...row,
          key: row.rn,
          no: offset + index + 1,
          img_field: <Image w="120px" src={getAppstoreUrl(row.app?.app_icon?.icon_48_48_url)} alt="" />,
          app_name: row.app?.name || "",
          status_field: +row.active === 1 ? <Tag colorScheme="green" whiteSpace="nowrap">{getLangText("TEXT_APPROVED")}</Tag> : <Tag colorScheme="pink" whiteSpace="nowrap">{getLangText("TEXT_NON_APPROVED")}</Tag>,
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
    // { key: "img_field", name: getLangText("TEXT_IMAGE"), width: "160px" },
    { key: "app_name", name: getLangText("APPSTORE_COMMENTED_APP"), width: "240px" },
    { key: "rating", name: getLangText("APPSTORE_RATING"), width: "100px" },
    { key: "content", name: getLangText("APPSTORE_COMMENT"), width: "400px" },
    { key: "created_at", name: getLangText("APPSTORE_COMMENT_TIME"), width: "100px" },
    { key: "status_field", name: getLangText("TEXT_STATUS"), width: "150px" },
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

export default AccountAppstoreCommentsPage;