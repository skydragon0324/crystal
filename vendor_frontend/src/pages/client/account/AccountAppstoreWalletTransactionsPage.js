import React, { useEffect, useState } from 'react'
import moment from 'moment';
import { useSelector } from 'react-redux';
import { Box, Flex, Tag, Text, useColorModeValue } from '@chakra-ui/react'
import SelectField from 'components/Select/SelectField';
import Card from 'components/Card/Card';
import CardHeader from 'components/Card/CardHeader';
import CardBody from 'components/Card/CardBody';
import DataTable from 'components/Tables/DataTable';
import Pagination from 'components/Pagination/Pagination';
import NoPermSection from 'components/Section/NoPermSection';
import CustomDatePicker from 'components/Picker/CustomDatePicker';
import { getAppstoreWalletTransactions } from 'api/client/accountApi';
import { calcTableSkeletonRows, formatTime, formatNumber, formatDbDate, convertDateFromString, firstDateOfMonth } from 'utils/utils';
import { getLangText } from 'lang/lang';
import { RESP_CODES } from 'constants/responseCodes';
import { DEFAULT_PAGE_SIZE, APPSTORE_MONEY_TYPE, APPSTORE_MONEY_TYPES, APPSTORE_TRANSACTION_TYPES, APPSTORE_TRANSACTION_TYPE_LABELS } from 'constants/constants';

const AccountAppstoreWalletTransactionsPage = () => {
  const { user } = useSelector((state) => state.client);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [filter, setFilter] = useState({});
  const [sort, setSort] = useState({});
  const [errText, setErrText] = useState("");
  const [typeOptions, setTypeOptions] = useState([]);
  const borderColor = useColorModeValue("var(--chakra-colors-gray-200)", "var(--chakra-colors-gray-600)");
  const tableStickyBg = useColorModeValue("white", "#111C44");

  useEffect(() => {
    const newSort = { key: "", dir: "desc" };
    setSort(newSort);
    const newFilter = { type: 0, start_date: formatDbDate(firstDateOfMonth(moment())), end_date: formatDbDate(moment()) };
    setFilter(newFilter);
    fetchData(0, DEFAULT_PAGE_SIZE, newSort, newFilter);
    setTypeOptions(APPSTORE_TRANSACTION_TYPE_LABELS.map(item => ({
      value: item.id,
      label: item.name,
    })));
  }, []);

  const fetchData = async (page = 0, pageSize = DEFAULT_PAGE_SIZE, sort = {}, filter = {}) => {
    setLoading(true);
    const offset = page * pageSize;
    const params = { offset, limit: pageSize, sortKey: sort.key || "", sortDir: sort.dir || "", ...filter };
    const resp = await getAppstoreWalletTransactions(params);
    if (resp.code === RESP_CODES.SUCCESS.code) {
      setTotal(resp.data.total);
      setRows(resp.data.rows.map((row, index) => {
        const typeItem = APPSTORE_MONEY_TYPES.find(item => item.id === +row.money_value_type_id);
        const tranItem = APPSTORE_TRANSACTION_TYPES.find(item => item.id === +row.transaction_type_id);
        return ({
          ...row,
          key: row.unique_id,
          no: offset + index + 1,
          money_field: <Text color={+row.money_value_type_id === APPSTORE_MONEY_TYPE.FOREIGN ? "red" : ""}>{formatNumber(row.money_value)}</Text>,
          type_field: typeItem ? <Tag colorScheme={typeItem.color} whiteSpace="nowrap">{typeItem.name}</Tag> : "",
          tran_field: tranItem ? tranItem.name : "",
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

  const onTypeChange = (value) => {
    const newFilter = { ...filter, type: value };
    setFilter(newFilter);
    fetchData(page, pageSize, sort, newFilter);
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
    { key: "money_field", name: getLangText("APPSTORE_WALLET_MONEY"), width: "100px" },
    { key: "type_field", name: getLangText("APPSTORE_WALLET_TYPE"), width: "100px" },
    { key: "tran_field", name: getLangText('APPSTORE_WALLET_TRAN_TYPE'), width: "100px" },
    { key: "transaction_number", name: getLangText("APPSTORE_WALLET_TRAN_NO"), width: "240px" },
    { key: "transaction_detail_1", name: getLangText("APPSTORE_WALLET_TRAN_DETAIL"), width: "360px" },
    { key: "created_at", name: getLangText("APPSTORE_WALLET_TRAN_TIME"), width: "100px" },
  ];

  if (!user) {
    return <NoPermSection />
  }

  return (
    <Flex direction="column">
      <Card pb="0px">
        <CardHeader p="6px 0px 10px 0px">
          <Flex>
            <Flex align="center">
              <Text whiteSpace="nowrap" mr="8px">{getLangText("TEXT_TYPE")}:</Text>
              <SelectField
                w="200px"
                options={typeOptions}
                value={filter?.type}
                onChange={onTypeChange}
                isSearchable
                isClearable={false}
                isDisabled={loading}
              />
            </Flex>
            <Flex align="center" ml="24px">
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
          </Flex>
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

export default AccountAppstoreWalletTransactionsPage;