import React, { useEffect, useState } from 'react'
import { useSelector } from 'react-redux';
import { Flex, IconButton, Tag, Text, Tooltip, useColorModeValue, useDisclosure } from '@chakra-ui/react'
import { FiEye } from 'react-icons/fi';
import Card from 'components/Card/Card';
import CardBody from 'components/Card/CardBody';
import DataTable from 'components/Tables/DataTable';
import Pagination from 'components/Pagination/Pagination';
import NoPermSection from 'components/Section/NoPermSection';
import ViewBlogDetailModal from './ViewBlogDetailModal';
import { getBlogMyArticles } from 'api/client/accountApi';
import { calcTableSkeletonRows, formatTime } from 'utils/utils';
import { getLangText } from 'lang/lang';
import { RESP_CODES } from 'constants/responseCodes';
import { DEFAULT_PAGE_SIZE, BLOG_OLD_TYPE, BLOG_OLD_CATEGORIES, BLOG_OLD_PUB_STATUS, BLOG_OLD_HELP_STATUS, BLOG_OLD_STAT_LIST } from 'constants/constants';

const AccountBlogMyArticlesPage = () => {
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
    const resp = await getBlogMyArticles(params);
    if (resp.code === RESP_CODES.SUCCESS.code) {
      setTotal(resp.data.total);
      setRows(resp.data.rows.map((row, index) => {
        const categoryItem = +row.subject_id > 20 ? BLOG_OLD_CATEGORIES[1].sub_categories.find(item => item.id === +row.subject_id) : BLOG_OLD_CATEGORIES.find(item => item.id === +row.subject_id);
        const helpStatusItem = BLOG_OLD_HELP_STATUS.find(item => item.id === +row.help_status);
        const stateItem = BLOG_OLD_STAT_LIST.find(item => item.id === +row.state);
        return ({
          ...row,
          key: row.id,
          no: offset + index + 1,
          summary_field: (<Flex direction="column">
            <Text fontSize="lg">{row.title}</Text>
            <Text mt="12px">{row.summary}</Text>
          </Flex>),
          type_field: +row.type === BLOG_OLD_TYPE.BLOG ? getLangText("BLOG_TYPE_BLOG") : +row.type === BLOG_OLD_TYPE.BBS ? getLangText("BLOG_TYPE_BBS") : "",
          subject_field: categoryItem ? categoryItem.name : "",
          is_help_field: +row.is_help_request === 1 ? <Tag colorScheme="pink" whiteSpace="nowrap">{getLangText("BLOG_ARTICLE_HELP")}</Tag> : <Tag colorScheme="green" whiteSpace="nowrap">{getLangText("BLOG_ARTICLE_NORMAL")}</Tag>,
          help_status_field: row.is_help_request === 1 && row.state === BLOG_OLD_PUB_STATUS.PUB_AGREE && row.parent === 0 && helpStatusItem ? <Tag colorScheme={helpStatusItem.color} whiteSpace="nowrap">{helpStatusItem.name}</Tag> : "",
          state_field: stateItem ? <Tag colorScheme={stateItem.color} whiteSpace="nowrap">{stateItem.name}</Tag> : "",
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
    { key: "type_field", name: getLangText("TEXT_TYPE"), width: "100px" },
    { key: "subject_field", name: getLangText("BLOG_SUBJECT"), width: "120px" },
    { key: "summary_field", name: getLangText("TEXT_CONTENT"), width: "480px" },
    { key: "is_help_field", name: getLangText("BLOG_ARTICLE_TYPE"), width: "120px" },
    { key: "help_status_field", name: getLangText("BLOG_HELP_STATUS"), width: "100px" },
    { key: "state_field", name: getLangText("TEXT_STATUS"), width: "100px" },
    { key: "created_at", name: getLangText("TEXT_TIME"), width: "100px" },
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
      <ViewBlogDetailModal
        isOpen={isOpenView}
        onClose={onCloseView}
        title={currentRow?.title || ""}
        article={currentRow}
      />
    </Flex>
  )
}

export default AccountBlogMyArticlesPage;
