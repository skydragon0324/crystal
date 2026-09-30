import React, { useEffect, useState } from 'react'
import { useSelector } from 'react-redux';
import { Flex, Tag, useColorModeValue } from '@chakra-ui/react'
import Card from 'components/Card/Card';
import CardHeader from 'components/Card/CardHeader';
import CardBody from 'components/Card/CardBody';
import DataTable from 'components/Tables/DataTable';
import Pagination from 'components/Pagination/Pagination';
import NoPermSection from 'components/Section/NoPermSection';
import { getEprodRegisterLog } from 'api/client/accountApi';
import { calcTableSkeletonRows, formatTime } from 'utils/utils';
import { getLangText } from 'lang/lang';
import { RESP_CODES } from 'constants/responseCodes';
import { DEFAULT_PAGE_SIZE, EPROD_REGISTER_STATUS } from 'constants/constants';

const AccountEprodRegistLogPage = () => {
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
    const params = { offset, limit: pageSize, sortKey: sort.key || "", sortDir: sort.dir || "", ...filter };
    const resp = await getEprodRegisterLog(params);
    if (resp.code === RESP_CODES.SUCCESS.code) {
      setTotal(resp.data.total);
      setRows(resp.data.rows.map((row, index) => {
        const statusItem = EPROD_REGISTER_STATUS.find(item => item.id === +row.status);
        return ({
          ...row,
          key: row.table_pk,
          no: offset + index + 1,
          status_field: statusItem ? <Tag colorScheme={statusItem.color} whiteSpace="nowrap">{statusItem.name}</Tag> : "",
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

  const headers = [
    { key: "no", name: getLangText("TEXT_NO"), width: "60px", thAlign: "center" },
    { key: "sn_num", name: getLangText("TEXT_EQU_NUM"), width: "140px" },
    { key: "product_name", name: getLangText("EPROD_PRODUCT_NAME"), width: "160px" },
    { key: "contact_num", name: getLangText("TEXT_CONTACT_NUM"), width: "120px" },
    { key: "address", name: getLangText("TEXT_ADDRESS"), width: "300px" },
    { key: "bonus_score", name: getLangText("EPROD_REG_POINT"), width: "100px" },
    { key: "status_field", name: getLangText("TEXT_STATUS"), width: "80px" },
    { key: "created_at", name: getLangText("TEXT_REGISTER_TIME"), width: "100px" },
  ];

  if (!user) {
    return <NoPermSection />
  }

  return (
    <Flex direction="column">
      <Card pb="0px">
        <CardHeader p="6px 0px 10px 0px">
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

export default AccountEprodRegistLogPage;
