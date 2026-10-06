import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Flex, Select as ChakraSelect, Tag, Text, useColorModeValue, useDisclosure } from '@chakra-ui/react';
import { FiMessageSquare, FiRepeat, FiTrash2 } from 'react-icons/fi';
import SelectField from 'components/Select/SelectField';
import Card from 'components/Card/Card';
import CardHeader from 'components/Card/CardHeader';
import CardBody from 'components/Card/CardBody';
import { SearchBar } from 'components/Navbars/SearchBar/SearchBar';
import DataTable from 'components/Tables/DataTable';
import Pagination from 'components/Pagination/Pagination';
import ConfirmDialog from 'components/Dialog/ConfirmDialog';
import NoPermSection from 'components/Section/NoPermSection';
import CustomScrollbar from 'components/Scrollbar/CustomScrollbar';
import RightDrawer from 'components/Drawer/RightDrawer';
import EditFeedbackSection from './EditFeedbackSection';
import useCustomToast from 'hooks/useCustomToast';
import { getFeedbackThreads, editFeedbackThread } from 'api/client/accountApi';
import { calcTableSkeletonRows, formatTime, sanitizeRichText } from 'utils/utils';
import { getLangText } from 'lang/lang';
import { RESP_CODES } from 'constants/responseCodes';
import { DEFAULT_PAGE_SIZE, FEEDBACK_CATEGORIES, FEEDBACK_THREAD_STATUS_LIST } from 'constants/constants';

const AccountFeedbackThreadsPage = () => {
  const { toastSuccess, toastError } = useCustomToast();
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
  const [currentLoading, setCurrentLoading] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const { isOpen: isOpenDelete, onOpen: onOpenDelete, onClose: onCloseDelete } = useDisclosure();
  const { isOpen: isOpenChat, onOpen: onOpenChat, onClose: onCloseChat } = useDisclosure();
  const textColor = useColorModeValue("secondaryGray.900", "white");
  const borderColor = useColorModeValue("var(--chakra-colors-gray-200)", "var(--chakra-colors-gray-600)");
  const inputBg = useColorModeValue("transparent", "navy.900");
  const tableStickyBg = useColorModeValue("white", "#111C44");

  useEffect(() => {
    const newSort = { key: "updated_at", dir: "desc" };
    setSort(newSort);

    // SelectField keys options on `value`; "" is the "all categories"
    // sentinel the API treats as no filter.
    setCategoryOptions([{
      value: "",
      label: getLangText("TEXT_ALL"),
    }, ...FEEDBACK_CATEGORIES.map(item => ({
      value: item.id,
      label: item.name,
    }))]);

    fetchData(0, DEFAULT_PAGE_SIZE, newSort);
  }, []);

  const fetchData = async (page = 0, pageSize = DEFAULT_PAGE_SIZE, sort = {}, filter = {}) => {
    setLoading(true);
    const offset = page * pageSize;
    const params = { offset, limit: pageSize, sortKey: sort.key || "", sortDir: sort.dir || "", ...filter };
    const resp = await getFeedbackThreads(params);
    if (resp.code === RESP_CODES.SUCCESS.code) {
      setTotal(resp.data.total);
      setRows(resp.data.rows.map((row, index) => {
        const categoryItem = FEEDBACK_CATEGORIES.find(item => item.id === row.category);
        const statusItem = FEEDBACK_THREAD_STATUS_LIST.find(item => item.id === row.status);
        return ({
          ...row,
          key: row.thread_pk,
          no: offset + index + 1,
          message_field: (
            <CustomScrollbar maxH="60px">
              <p dangerouslySetInnerHTML={{ __html: sanitizeRichText(row.last_message) }} />
            </CustomScrollbar>
          ),
          category_field: categoryItem ? <Tag variant="solid" colorScheme={categoryItem.color} w="fit-content" whiteSpace="nowrap">{categoryItem.name}</Tag> : "",
          status_field: statusItem ? <Tag variant="solid" colorScheme={statusItem.color} w="fit-content" whiteSpace="nowrap">{statusItem.name}</Tag> : "",
          created_at: formatTime(row.created_at),
          updated_at: formatTime(row.updated_at),
        });
      }));
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

  const onThreadCategoryChange = (value) => {
    const newFilter = { ...filter, category: value };
    setFilter(newFilter);
    fetchData(page, pageSize, sort, newFilter);
  }

  const onThreadStatusChange = (e) => {
    const newFilter = { ...filter, status: e.target.value };
    setFilter(newFilter);
    fetchData(page, pageSize, sort, newFilter);
  }

  const onDeleteRow = (row) => {
    setCurrentRow(row);
    onOpenDelete();
  }

  const handleDeleteRow = async () => {
    setCurrentLoading(true);
    const is_deleted = currentRow.is_deleted ? 0 : 1;
    const params = {
      thread_pk: currentRow.thread_pk,
      is_deleted,
    }
    const resp = await editFeedbackThread(params);
    if (resp.code === RESP_CODES.SUCCESS.code) {
      if (total === (page - 1) * pageSize + 1 && total > pageSize) {
        onPageChange(page - 1);
      } else {
        fetchData(page, pageSize, sort, filter);
      }
      toastSuccess(getLangText("OPERATION_SUCCESS"));
    } else {
      toastError(resp.message);
    }
    onCloseDelete();
    setCurrentLoading(false);
  }

  const onChatRow = (row) => {
    setCurrentRow(row);
    onOpenChat();
  }

  const handleChatRow = async () => {
    fetchData(page, pageSize, sort, filter);
  }

  const handleCloseRow = async () => {
    onCloseChat();
  }

  const headers = [
    { key: "no", name: getLangText("TEXT_NO"), width: "100px", thAlign: "center" },
    { key: "category_field", name: getLangText("TEXT_CATEGORY"), width: "180px", sortable: true, sort_key: "category" },
    { key: "title", name: getLangText("TEXT_TITLE"), width: "240px", sortable: true },
    { key: "message_field", name: getLangText("FEEDBACK_LAST_MESSAGE"), width: "480px" },
    { key: "status_field", name: getLangText("TEXT_STATUS"), width: "80px", sortable: true, sort_key: "status" },
    { key: "updated_at", name: getLangText("TEXT_UPDATED_TIME"), width: "100px", sortable: true },
  ];

  // Declared as a list rather than as rendered controls, so DataTable can
  // put them behind the "..." button. A row of icon buttons in a card
  // header competes with the title for attention; the menu does not.
  const actionItems = (row) => [
    {
      label: getLangText("FEEDBACK_CHAT"),
      icon: <FiMessageSquare />,
      onClick: onChatRow,
    },
    {
      label: row.is_deleted ? getLangText("TEXT_RESTORE") : getLangText("TEXT_DELETE"),
      icon: row.is_deleted ? <FiRepeat /> : <FiTrash2 />,
      isDanger: !row.is_deleted,
      onClick: onDeleteRow,
    },
  ];

  if (!user) {
    return <NoPermSection />
  }

  return (
    <Flex direction="column">
      <Card pb="0px">
        <CardHeader p="6px 0px 10px 0px">
          <Text fontSize="xl" color={textColor} fontWeight="bold">
            {getLangText("FEEDBACK_LIST")}
          </Text>
          <Flex>
            <Flex align="center" justify="center">
              <Text whiteSpace="nowrap" mr="8px">{getLangText("TEXT_CATEGORY")}:</Text>
              <SelectField
                w="200px"
                options={categoryOptions}
                value={filter && filter.category !== undefined ? filter.category : ""}
                onChange={onThreadCategoryChange}
                isSearchable
                isClearable={false}
                isDisabled={loading}
              />
            </Flex>
            <Flex align="center" justify="center" ml="16px">
              <Text whiteSpace="nowrap" mr="8px">{getLangText("TEXT_STATUS")}:</Text>
              <ChakraSelect value={filter?.status === undefined ? "" : filter.status} onChange={onThreadStatusChange}>
                <option value=""></option>
                {FEEDBACK_THREAD_STATUS_LIST.map(item => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </ChakraSelect>
            </Flex>
            <SearchBar ml="16px" background={inputBg} onSearch={onSearch} disabled={loading} />
          </Flex>
          <Flex></Flex>
        </CardHeader>
        <CardBody mt="12px">
          <DataTable
            headers={headers}
            rows={rows}
            sort={sort}
            actionItems={actionItems}
            actionMode="menu"
            actionWidth={"120px"}
            loading={loading}
            borderColor={borderColor}
            stickyBg={tableStickyBg}
            leftSticky={2}
            rightSticky={1}
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
      <ConfirmDialog
        isOpen={isOpenDelete}
        onClose={onCloseDelete}
        title={getLangText("FEEDBACK_DELETE_TITLE")}
        description={getLangText("FEEDBACK_CONFIRM_DELETE", [currentRow?.title])}
        primaryText={getLangText("TEXT_DELETE")}
        primaryColor="red"
        primaryAction={handleDeleteRow}
        secondaryText={getLangText("TEXT_CANCEL")}
        loading={currentLoading}
      />
      <RightDrawer
        isOpen={isOpenChat}
        onClose={handleCloseRow}
        title={getLangText("FEEDBACK_THREAD")}
        closeOnEsc={true}
        closeOnOverlayClick={true}
      >
        <EditFeedbackSection
          open={isOpenChat}
          onClose={handleCloseRow}
          formData={currentRow}
          onSave={handleChatRow}
        />
      </RightDrawer>
    </Flex>
  );
}

export default AccountFeedbackThreadsPage;
