import React, { useEffect, useState } from 'react'
import { useSelector } from 'react-redux';
import { Box, Button, Flex, IconButton, Tag, Tooltip, useColorModeValue, useDisclosure } from '@chakra-ui/react'
import { FiDownload } from 'react-icons/fi';
import Card from 'components/Card/Card';
import CardHeader from 'components/Card/CardHeader';
import CardBody from 'components/Card/CardBody';
import { SearchBar } from 'components/Navbars/SearchBar/SearchBar';
import DataTable from 'components/Tables/DataTable';
import Pagination from 'components/Pagination/Pagination';
import NoPermSection from 'components/Section/NoPermSection';
import CustomDatePicker from 'components/Picker/CustomDatePicker';
import EditEprodErrorReportModal from './EditEprodErrorReportModal';
import { getManbangKeygenLog } from 'api/client/accountApi';
import { calcTableSkeletonRows, formatTime, formatPrice, getServerUrl, convertDateFromString, formatDbDate } from 'utils/utils';
import { getLangText } from 'lang/lang';
import { RESP_CODES } from 'constants/responseCodes';
import { DEFAULT_PAGE_SIZE, EPROD_FEEDBACK_STATUS, EPROD_FEEDBACK_STATES } from 'constants/constants';

const AccountManbangKeygenLogPage = () => {
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
  const { isOpen: isOpenEdit, onOpen: onOpenEdit, onClose: onCloseEdit } = useDisclosure();
  const borderColor = useColorModeValue("var(--chakra-colors-gray-200)", "var(--chakra-colors-gray-600)");
  const inputBg = useColorModeValue("transparent", "navy.900");
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
    const resp = await getManbangKeygenLog(params);
    if (resp.code === RESP_CODES.SUCCESS.code) {
      setTotal(resp.data.total);
      setRows(resp.data.rows.map((row, index) => {
        return ({
          ...row,
          key: row.id,
          no: offset + index + 1,
          status_field: +row.resultlog === 0 ? <Tag colorScheme="blue" whiteSpace="nowrap">{row.message}</Tag> : <Tag colorScheme="red" whiteSpace="nowrap">{row.message}</Tag>,
          is_agency_field: +row.is_agent === 1 ? <Tag colorScheme="green" whiteSpace="nowrap">{getLangText("TEXT_AGENCY")}</Tag> : <Tag colorScheme="purple" whiteSpace="nowrap">{getLangText("TEXT_USER")}</Tag>,
          real_price: formatPrice(row.real_price),
          updated_at: formatTime(row.updated_at),
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

  const onErrorReport = (row) => {
    if ([EPROD_FEEDBACK_STATUS.PENDING].includes(+row.error_status)) {
      return;
    }
    setCurrentRow(row);
    onOpenEdit();
  }

  const onSuccessReport = () => {
    fetchData(0, pageSize, sort, filter);
  }

  const headers = [
    { key: "no", name: getLangText("TEXT_NO"), width: "60px", thAlign: "center" },
    { key: "machinekey", name: getLangText("TEXT_EQU_NUM"), width: "180px" },
    { key: "id", name: getLangText("EPROD_TRAN_NO"), width: "160px" },
    { key: "real_price", name: getLangText("EPROD_PAY_POINT"), width: "120px" },
    { key: "status_field", name: getLangText("TEXT_STATUS"), width: "120px", sortable: true, sort_key: "resultlog" },
    { key: "is_agency_field", name: getLangText("EPROD_IS_AGENCY"), width: "120px", sortable: true, sort_key: "is_agent" },
    { key: "updated_at", name: getLangText("TEXT_PAY_TIME"), width: "100px" },
  ];

  const actions = (row, disabled = false) => {
    const prefix = "/var/www/html/ora_licenses/";
    const filename = row.licensefilepath && row.licensefilepath.startsWith(prefix) ? row.licensefilepath.slice(prefix.length) : row.licensefilepath;
    const feedbackItem = EPROD_FEEDBACK_STATES.find(item => item.id === +row.error_status);
    return (
      <Flex direction="row" align="center" justify="flex-end">
        {row.licensefilepath ? (
          <Tooltip label={getLangText("TEXT_DOWNLOAD")} hasArrow placement="top">
            <a href={getServerUrl(`/ora_licenses/keygen.php?download re=1&data re=0&file path=${filename}`)} target="_blank" rel="noreferrer">
              <IconButton variant="outline" colorScheme="blue" icon={<FiDownload />} disabled={disabled} />
            </a>
          </Tooltip>
        ) : (
          <Button variant="outline" colorScheme="pink" disabled={disabled}>{getLangText("TEXT_RETRY")}</Button>
        )}
        {row.transaction_number && feedbackItem && (
          <Button ml="8px" variant="outline" colorScheme={feedbackItem.color} fontSize="12px" onClick={() => onErrorReport(row)}>
            {feedbackItem.name}
          </Button>
        )}
      </Flex>
    );
  }

  if (!user) {
    return <NoPermSection />
  }

  return (
    <Flex direction="column">
      <Card pb="0px">
        <CardHeader p="6px 0px 10px 0px" justify="flex-start">
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
            actions={actions}
            actionWidth="80px"
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
      <EditEprodErrorReportModal
        isOpen={isOpenEdit}
        onClose={onCloseEdit}
        title={getLangText("EPROD_ERR_REPORT")}
        formData={currentRow}
        onSuccess={onSuccessReport}
      />
    </Flex>
  )
}

export default AccountManbangKeygenLogPage;
