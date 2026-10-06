import React, { useEffect, useState } from 'react'
import {
  Accordion, AccordionButton, AccordionIcon, AccordionItem, AccordionPanel,
  Box, Flex, Skeleton, Text, useColorModeValue,
} from '@chakra-ui/react';
import { SearchBar } from 'components/Navbars/SearchBar/SearchBar';
import Pagination from 'components/Pagination/Pagination';
import SiteContainer from 'components/Layout/SiteContainer';
import useCustomToast from 'hooks/useCustomToast';
import { getPhoneFaqs } from 'api/client/clientPhoneApi';
import { getLangText } from 'lang/lang';
import { sanitizeRichText } from 'utils/utils';
import { RESP_CODES } from 'constants/responseCodes';
import { DEFAULT_PAGE_SIZE } from 'constants/constants';

const SKELETON_ROWS = 6;

/**
 * Frequently asked questions.
 *
 * Three things were wrong beyond the styling.
 *
 * Search was broken: `onSearch` called `fetchData(newFilter)`, passing the
 * filter object as the `page` argument, so the offset came out NaN and the
 * request either returned the wrong slice or nothing at all.
 *
 * The search box was `display={{ sx: 'flex', md: 'none' }}` - hidden on
 * every screen wide enough to be a desktop, which is where a visitor
 * scanning a long FAQ most wants it.
 *
 * And the page opened with a dashboard screenshot from the admin theme's
 * sample assets, which has nothing to do with a phone FAQ.
 */
function PhoneFaqPage() {
  const { toastError } = useCustomToast();
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [sort, setSort] = useState({});
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState({});

  const cardBg = useColorModeValue('white', 'navy.700');
  const cardShadow = useColorModeValue(
    '14px 17px 40px 4px rgba(112, 144, 176, 0.08)',
    '14px 17px 40px 4px rgba(12, 44, 55, 0.18)'
  );
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const mutedColor = useColorModeValue('secondaryGray.700', 'secondaryGray.400');
  const borderColor = useColorModeValue('secondaryGray.100', 'whiteAlpha.100');
  const hoverBg = useColorModeValue('secondaryGray.300', 'whiteAlpha.50');
  const inputBg = useColorModeValue('transparent', 'navy.800');

  useEffect(() => {
    const newSort = { key: "created_at", dir: "desc" };
    setSort(newSort);
    fetchData(0, DEFAULT_PAGE_SIZE, newSort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchData = async (page = 0, pageSize = DEFAULT_PAGE_SIZE, sort = {}, filter = {}) => {
    setLoading(true);
    const offset = page * pageSize;
    const params = { offset, limit: pageSize, sortKey: sort.key || "", sortDir: sort.dir || "", ...filter };
    const resp = await getPhoneFaqs(params);
    if (resp.code === RESP_CODES.SUCCESS.code) {
      setTotal(resp.data.total);
      setRows(resp.data.rows);
    } else {
      toastError(resp.message);
    }
    setLoading(false);
  }

  const onSearch = (keyword) => {
    const newFilter = { ...filter, keyword };
    setFilter(newFilter);
    // Back to the first page: staying on page 4 of the old result set
    // shows an empty list for a search that did match something.
    setPage(0);
    fetchData(0, pageSize, sort, newFilter);
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

  const renderSkeletons = () => (
    Array.from({ length: SKELETON_ROWS }).map((_, index) => (
      <Box key={`sk-${index}`} px="20px" py="18px" borderBottomWidth="1px" borderColor={borderColor}>
        <Skeleton height="14px" width={`${45 + (index % 3) * 15}%`} borderRadius="6px" />
      </Box>
    ))
  );

  return (
    <Box pb="60px">
      <SiteContainer pt={{ base: '20px', md: '32px' }}>
        <Flex
          direction={{ base: 'column', md: 'row' }}
          align={{ base: 'flex-start', md: 'flex-end' }}
          justify="space-between"
          gridGap="16px"
          mb={{ base: '18px', md: '24px' }}
        >
          <Box>
            <Text fontSize={{ base: 'xl', md: '2xl' }} fontWeight="800" color={textColor}>
              {getLangText('MENU_PHONE_FAQ')}
            </Text>
            <Text fontSize="sm" color={mutedColor} mt="4px">
              {getLangText('FAQ_SUBTITLE')}
            </Text>
          </Box>

          <SearchBar
            placeholder={getLangText('PLACEHOLDER_SEARCH')}
            onSearch={onSearch}
            background={inputBg}
            disabled={loading}
            w={{ base: '100%', md: '320px' }}
          />
        </Flex>

        <Box bg={cardBg} boxShadow={cardShadow} borderRadius="20px" overflow="hidden">
          {loading ? renderSkeletons() : !rows.length ? (
            <Box py="56px" textAlign="center" fontSize="sm" color={mutedColor}>
              {getLangText('TEXT_NO_CONTENT')}
            </Box>
          ) : (
            <Accordion allowMultiple={false} allowToggle defaultIndex={0}>
              {rows.map((row, index) => (
                <AccordionItem
                  key={row.table_pk || index}
                  borderTopWidth={index === 0 ? '0' : '1px'}
                  borderBottomWidth="0"
                  borderColor={borderColor}
                >
                  <AccordionButton
                    px={{ base: '18px', md: '24px' }}
                    py="18px"
                    justifyContent="space-between"
                    _hover={{ bg: hoverBg }}
                  >
                    <Text
                      textAlign="left"
                      fontWeight="700"
                      fontSize={{ base: 'sm', md: 'md' }}
                      color={textColor}
                    >
                      {row.question}
                    </Text>
                    <AccordionIcon color={mutedColor} />
                  </AccordionButton>

                  <AccordionPanel
                    px={{ base: '18px', md: '24px' }}
                    pb="22px"
                    fontSize="sm"
                    color={mutedColor}
                    // The answer is stored HTML from the admin editor, so
                    // it carries its own markup and needs the page's link
                    // and list styling rather than Chakra defaults.
                    sx={{
                      'a': { color: 'brand.500', textDecoration: 'underline' },
                      'ul, ol': { paddingInlineStart: '20px' },
                      'img': { maxWidth: '100%', height: 'auto', borderRadius: '8px' },
                    }}
                  >
                    <Box dangerouslySetInnerHTML={{ __html: sanitizeRichText(row.answer) }} />
                  </AccordionPanel>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </Box>

        <Pagination
          count={total}
          page={page}
          pageSize={pageSize}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          showGoto={true}
          showTotal={true}
        />
      </SiteContainer>
    </Box>
  );
}

export default PhoneFaqPage;
