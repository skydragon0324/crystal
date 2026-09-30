import React, { useEffect, useState } from 'react'
import moment from 'moment';
import { useSelector } from 'react-redux';
import { Box, Flex, IconButton, Tag, Text, Tooltip, useColorModeValue, useDisclosure } from '@chakra-ui/react'
import { FiKey } from 'react-icons/fi';
import Card from 'components/Card/Card';
import CardHeader from 'components/Card/CardHeader';
import CardBody from 'components/Card/CardBody';
import { SearchBar } from 'components/Navbars/SearchBar/SearchBar';
import DataTable from 'components/Tables/DataTable';
import Pagination from 'components/Pagination/Pagination';
import NoPermSection from 'components/Section/NoPermSection';
import CustomDatePicker from 'components/Picker/CustomDatePicker';
import ViewAppstoreLicenseQrModal from './ViewAppstoreLicenseQrModal';
import useCustomToast from 'hooks/useCustomToast';
import { getAppstorePurchaseLog, getAppstoreLicenseQr } from 'api/client/accountApi';
import { calcTableSkeletonRows, formatTime, formatNumber, getAppstoreUrl, formatDbDate, convertDateFromString, firstDateOfMonth } from 'utils/utils';
import { getLangText } from 'lang/lang';
import { RESP_CODES } from 'constants/responseCodes';
import { DEFAULT_PAGE_SIZE, APPSTORE_PURCHASE_TYPE, APPSTORE_PURCHASE_TYPES, APPSTORE_PURCHASE_STATE, APPSTORE_PURCHASE_STATES, APPSTORE_LICENSE_STATES } from 'constants/constants';

const AccountAppstorePurchaseLogPage = () => {
  const { user } = useSelector((state) => state.client);
  const { toastError, toastWarning } = useCustomToast();
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [filter, setFilter] = useState({});
  const [sort, setSort] = useState({});
  const [errText, setErrText] = useState("");
  const [currentRow, setCurrentRow] = useState();
  const [currentLoading, setCurrentLoading] = useState(false);
  const [deviceLicense, setDeviceLicense] = useState();
  const { isOpen: isOpenView, onOpen: onOpenView, onClose: onCloseView } = useDisclosure();
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
    const resp = await getAppstorePurchaseLog(params);
    if (resp.code === RESP_CODES.SUCCESS.code) {
      setTotal(resp.data.total);
      setRows(resp.data.rows.map((row, index) => {
        const typeItem = APPSTORE_PURCHASE_TYPES.find(item => item.type === row.purchasable_type);
        const statusItem = APPSTORE_PURCHASE_STATES.find(item => item.id === +row.spd_state_id);
        const licenseItem = APPSTORE_LICENSE_STATES.find(item => item.id === +row.spd_state_id);
        return ({
          ...row,
          key: row.purchase_history_unique_id,
          no: offset + index + 1,
          type_field: typeItem ? typeItem.name : "",
          name_field: row.purchasable_type === APPSTORE_PURCHASE_TYPE.DIAMOND && row.diamond_name ? <a href={getAppstoreUrl("/others/diamonds")} target="_blank" rel="noreferrer">{row.diamond_name}</a>
            : row.purchasable_type === APPSTORE_PURCHASE_TYPE.APPVERSION ? <a href={getAppstoreUrl(`/app/${row.purchasable_id}`)} target="_blank" rel="noreferrer">{row.app_name}</a>
              : row.purchasable_type === APPSTORE_PURCHASE_TYPE.AVATAR ? ""
                : row.purchasable_type === APPSTORE_PURCHASE_TYPE.EVENTITEM && row.eventitem_title ? <a href={getAppstoreUrl("/events")} target="_blank" rel="noreferrer">{row.eventitem_title}</a>
                  : row.purchasable_type === APPSTORE_PURCHASE_TYPE.NICKNAME && row.nickname_name ? row.nickname_name
                    : "",
          money_field: (<Flex direction="column">
            <Text fontSize="sm">{+row.purchasemoney_type === 0 ? getLangText("APPSTORE_WALLET_MONEY_IMMATERIAL") : getLangText("APPSTORE_WALLET_MONEY_COMPANY")}</Text>
            <Text>{formatNumber(row.purchase_actual_value)}</Text>
          </Flex>),
          status_field: statusItem ? statusItem.name : row.spd_change_reason ? row.spd_change_reason : getLangText("TEXT_PURCHASE_FAILED"),
          license_field: licenseItem ? <Tag colorScheme={licenseItem.color} whiteSpace="nowrap">{licenseItem.name}</Tag> : "",
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

  const onViewRow = async (row) => {
    setCurrentRow(row);
    setCurrentLoading(true);
    const params = {
      purchase_history_unique_id: row.purchase_history_unique_id,
    };
    const resp = await getAppstoreLicenseQr(params);
    if (resp.code === RESP_CODES.SUCCESS.code) {
      if (+resp.data.spd_state_id === APPSTORE_PURCHASE_STATE.PURCHASED) {
        if (!resp.data.device_license?.qr && resp.data.device_license?.license_file && resp.data.device_license?.license_file_url) {
          window.location.href = getAppstoreUrl(`/download/licenses/${resp.data.device_license.license_file_url}/${resp.data.device_license.license_file}`);
        } else {
          setDeviceLicense(resp.data.device_license);
          onOpenView();
        }
      } else {
        toastWarning(getLangText("APPSTORE_ERR_GET_LICENSE"));
      }
    } else {
      toastError(resp.message);
    }
    setCurrentLoading(false);
  }

  const headers = [
    { key: "no", name: getLangText("TEXT_NO"), width: "60px", thAlign: "center" },
    { key: "type_field", name: getLangText("TEXT_TYPE"), width: "120px" },
    { key: "name_field", name: getLangText("TEXT_NAME"), width: "240px" },
    { key: "device_no", name: getLangText("TEXT_EQU_NUM"), width: "220px" },
    { key: "money_field", name: getLangText("APPSTORE_PAY_PRICE"), width: "160px" },
    { key: "created_at", name: getLangText("TEXT_PURCHASE_TIME"), width: "100px" },
    { key: "status_field", name: getLangText("TEXT_STATUS"), width: "100px" },
    { key: "license_field", name: getLangText("TEXT_LICENSE_INFO"), width: "100px" },
  ];

  const actions = (row, disabled = false) => (
    <Flex direction="row" align="center" justify="flex-end">
      {[APPSTORE_PURCHASE_STATE.PURCHASED, APPSTORE_PURCHASE_STATE.PURCHASING].includes(+row.spd_state_id) && (
        <Tooltip label={getLangText("TEXT_LICENSE_INFO")} hasArrow placement="top">
          <IconButton variant="outline" colorScheme="blue" icon={<FiKey />} disabled={disabled} onClick={() => onViewRow(row)} />
        </Tooltip>
      )}
    </Flex>
  );

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
            actions={actions}
            actionWidth="70px"
            loading={loading}
            borderColor={borderColor}
            stickyBg={tableStickyBg}
            rightSticky={1}
            isShadow={true}
            errText={errText}
            skeletons={calcTableSkeletonRows(total, page, pageSize)}
            disableKey={currentLoading && currentRow ? currentRow.key : 0}
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
      <ViewAppstoreLicenseQrModal
        isOpen={isOpenView}
        onClose={onCloseView}
        title={getLangText("TEXT_LICENSE_INFO")}
        deviceLicense={deviceLicense}
      />
    </Flex>
  )
}

export default AccountAppstorePurchaseLogPage;