import React, { useEffect, useState } from 'react'
import { useSelector } from 'react-redux';
import { Box, Flex, Select as ChakraSelect, Tag, Text, useColorModeValue, useDisclosure } from '@chakra-ui/react'
import { FiDownload, FiEye } from 'react-icons/fi';
import SelectField from 'components/Select/SelectField';
import Card from 'components/Card/Card';
import CardHeader from 'components/Card/CardHeader';
import CardBody from 'components/Card/CardBody';
import { SearchBar } from 'components/Navbars/SearchBar/SearchBar';
import DataTable from 'components/Tables/DataTable';
import Pagination from 'components/Pagination/Pagination';
import NoPermSection from 'components/Section/NoPermSection';
import CustomDatePicker from 'components/Picker/CustomDatePicker';
import ViewBMediaDetailModal from './ViewBMediaDetailModal';
import { getBMediaProviders, getBMediaKeygenLog } from 'api/client/accountApi';
import { calcTableSkeletonRows, formatTime, formatPrice, getServerUrl, convertDateFromString, formatDbDate } from 'utils/utils';
import { getLangText } from 'lang/lang';
import { RESP_CODES } from 'constants/responseCodes';
import { DEFAULT_PAGE_SIZE } from 'constants/constants';

const AccountBMediaKeygenLogPage = () => {
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
  const [providerOptions, setProviderOptions] = useState([]);
  const { isOpen: isOpenView, onOpen: onOpenView, onClose: onCloseView } = useDisclosure();
  const borderColor = useColorModeValue("var(--chakra-colors-gray-200)", "var(--chakra-colors-gray-600)");
  const inputBg = useColorModeValue("transparent", "navy.900");
  const tableStickyBg = useColorModeValue("white", "#111C44");

  useEffect(() => {
    fetchProviders();
    const newSort = { key: "", dir: "desc" };
    setSort(newSort);
    const newFilter = { provider: "", agency_type: "" };
    setFilter(newFilter);
    fetchData(0, DEFAULT_PAGE_SIZE, newSort, newFilter);
  }, []);

  const fetchProviders = async () => {
    const resp = await getBMediaProviders();
    if (resp.code === RESP_CODES.SUCCESS.code) {
      // SelectField keys options on `value`; "" is the "all providers"
      // sentinel the API treats as no filter.
      setProviderOptions([{
        value: "",
        label: getLangText("TEXT_ALL"),
      },
      ...resp.data.rows.map(item => ({
        value: item.id,
        label: item.short_name,
      }))]);
    }
  }

  const fetchData = async (page = 0, pageSize = DEFAULT_PAGE_SIZE, sort = {}, filter = {}) => {
    setLoading(true);
    const offset = page * pageSize;
    const params = { offset, limit: pageSize, sortKey: sort.key || "", sortDir: sort.dir || "", ...filter };
    const resp = await getBMediaKeygenLog(params);
    if (resp.code === RESP_CODES.SUCCESS.code) {
      setTotal(resp.data.total);
      setRows(resp.data.rows.map((row, index) => {
        return ({
          ...row,
          key: row.id,
          no: offset + index + 1,
          is_agency_field: +row.is_agent === 1 ? <Tag colorScheme="green" whiteSpace="nowrap">{getLangText("TEXT_AGENCY")}</Tag> : <Tag colorScheme="purple" whiteSpace="nowrap">{getLangText("TEXT_USER")}</Tag>,
          cal_price: formatPrice(row.cal_price),
          bonus_price: formatPrice(row.bonus_price),
          date_time: formatTime(row.date_time),
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

  const onSearch = (keyword) => {
    const newFilter = { ...filter, keyword };
    setFilter(newFilter);
    fetchData(page, pageSize, sort, newFilter);
  }

  const onFromChange = (e) => {
    const newFilter = { ...filter, from: formatDbDate(e) };
    setFilter(newFilter);
    fetchData(0, pageSize, sort, newFilter);
  }

  const onToChange = (e) => {
    const newFilter = { ...filter, to: formatDbDate(e) };
    setFilter(newFilter);
    fetchData(0, pageSize, sort, newFilter);
  }

  const onProviderChange = (value) => {
    const newFilter = { ...filter, provider: value };
    setFilter(newFilter);
    fetchData(0, pageSize, sort, newFilter);
  }

  const onAgencyTypeChange = (e) => {
    const newFilter = { ...filter, agency_type: e.target.value };
    setFilter(newFilter);
    fetchData(0, pageSize, sort, newFilter);
  }

  const onViewRow = (row) => {
    setCurrentRow(row);
    onOpenView();
  }

  const headers = [
    { key: "no", name: getLangText("TEXT_NO"), width: "60px", thAlign: "center" },
    { key: "dev_id", name: getLangText("TEXT_EQU_NUM"), width: "220px" },
    { key: "short_name", name: getLangText("MEDIA_PROVIDER"), width: "120px" },
    { key: "is_agency_field", name: getLangText("EPROD_IS_AGENCY"), width: "120px", sortable: true, sort_key: "is_agent" },
    { key: "cal_price", name: getLangText("EPROD_PAY_POINT"), width: "120px" },
    { key: "bonus_price", name: getLangText("EPROD_SOFT_POINT"), width: "120px" },
    { key: "date_time", name: getLangText("TEXT_PAY_TIME"), width: "100px" },
  ];

  const onDownloadRow = (row) => {
    const prefix = "/var/www/html/bp_licenses/";
    const filename = row.license_path && row.license_path.startsWith(prefix)
      ? row.license_path.slice(prefix.length)
      : row.license_path;
    window.open(
      getServerUrl(`/bp_licenses/keygen.php?download re=1&data re=0&file path=${filename}`),
      "_blank",
      "noreferrer"
    );
  }

  // Declared as a list rather than as rendered controls, so DataTable can
  // put them behind the "..." button. Download is dropped for a row with
  // no licence file rather than shown disabled - there is nothing the
  // user could do to make it available.
  const actionItems = (row) => [
    row.license_path ? {
      label: getLangText("TEXT_DOWNLOAD"),
      icon: <FiDownload />,
      onClick: onDownloadRow,
    } : null,
    {
      label: getLangText("TEXT_DETAIL"),
      icon: <FiEye />,
      onClick: onViewRow,
    },
  ];

  if (!user) {
    return <NoPermSection />
  }

  return (
    <Flex direction="column">
      <Card pb="0px">
        <CardHeader p="6px 0px 10px 0px" justify="flex-start">
          <Flex align="center">
            <Text whiteSpace="nowrap" mr="8px">{getLangText("MEDIA_PROVIDER")}:</Text>
            <SelectField
              w="200px"
              options={providerOptions}
              value={filter && filter.provider !== undefined ? filter.provider : ""}
              onChange={onProviderChange}
              isSearchable
              isClearable={false}
              isDisabled={loading}
            />
          </Flex>
          <Flex align="center" ml="16px">
            <Text whiteSpace="nowrap" mr="8px">{getLangText("TEXT_IS_AGENCY")}:</Text>
            <ChakraSelect
              value={filter?.agency_type === undefined ? "" : filter.agency_type}
              onChange={onAgencyTypeChange}
            >
              <option value="">{getLangText("TEXT_ALL")}</option>
              <option value={0}>{getLangText("TEXT_USER")}</option>
              <option value={1}>{getLangText("TEXT_AGENCY")}</option>
            </ChakraSelect>
          </Flex>
          <Flex align="center" justify="center" ml="16px">
            <CustomDatePicker
              value={filter.from ? convertDateFromString(filter.from) : null}
              onChange={onFromChange}
              disabled={loading}
            />
            <Box mr={2}></Box>
            <CustomDatePicker
              value={filter.to ? convertDateFromString(filter.to) : null}
              onChange={onToChange}
              disabled={loading}
            />
          </Flex>
          <SearchBar ml="16px" background={inputBg} onSearch={onSearch} disabled={loading} />
        </CardHeader>
        <CardBody>
          <DataTable
            headers={headers}
            rows={rows}
            sort={sort}
            actionItems={actionItems}
            actionMode="menu"
            actionWidth="120px"
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
      <ViewBMediaDetailModal
        isOpen={isOpenView}
        onClose={onCloseView}
        title={getLangText("TEXT_DETAIL")}
        id={currentRow?.id}
      />
    </Flex>
  )
}

export default AccountBMediaKeygenLogPage;
