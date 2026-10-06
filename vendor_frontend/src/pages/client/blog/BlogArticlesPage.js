import React, { useEffect, useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  Avatar, Box, Button, Flex, Icon, SkeletonText, Text, useColorModeValue, useDisclosure,
} from '@chakra-ui/react'
import { FiArrowDown, FiArrowUp, FiUpload } from 'react-icons/fi';
import Pagination from 'components/Pagination/Pagination';
import SiteContainer from 'components/Layout/SiteContainer';
import { SearchBar } from 'components/Navbars/SearchBar/SearchBar';
import AnimationScroll from 'components/Animation/AnimationScroll';
import BlogHelpModal from './BlogHelpModal';
import BlogArticleCard from './BlogArticleCard';
import { getAdminRecomBlogArticles, getBlogArticles, getHonormans } from 'api/client/blogApi';
import { getLangText } from 'lang/lang';
import useLang from 'lang/useLang';
import { RESP_CODES } from 'constants/responseCodes';
import { DEFAULT_PAGE_SIZE, BLOG_OLD_CATEGORIES } from 'constants/constants';

const SKELETON_ROWS = 5;

/**
 * The public blog.
 *
 * Layout is the standard two-column reading page: filters and community
 * panels in a sidebar from lg up, the article list beside them, and the
 * sidebar dropped entirely below that rather than stacked above the
 * articles - the previous version hid it with `display`, which still
 * fetched and rendered it on every phone.
 *
 * Three navigation bugs went with the rewrite. Changing the category, the
 * sort or the search kept the current page number, so filtering from page
 * four asked the API for rows 30-40 of a result set that might have three;
 * all three reset to the first page now. A failed request replaced the
 * whole page with a bare error string, taking the navigation with it; the
 * message goes inside the list where the articles would be.
 *
 * SORT_CATEGORY was also a module-level constant calling getLangText, so
 * its four labels were fixed to whichever language loaded first.
 */
const BlogArticlesPage = () => {
  const { user } = useSelector((state) => state.client);
  const { locale } = useLang();
  const { isOpen: isOpenHelp, onOpen: onOpenHelp, onClose: onCloseHelp } = useDisclosure();

  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState([]);
  const [adminRecomArticles, setAdminRecomArticles] = useState([]);
  const [honormans, setHonormans] = useState([]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [filter, setFilter] = useState({});
  const [sort, setSort] = useState({});
  const [errText, setErrText] = useState("");
  const [activeId, setActiveId] = useState(-1);

  const cardBg = useColorModeValue('white', 'navy.700');
  const cardShadow = useColorModeValue(
    '14px 17px 40px 4px rgba(112, 144, 176, 0.08)',
    '14px 17px 40px 4px rgba(12, 44, 55, 0.18)'
  );
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const mutedColor = useColorModeValue('secondaryGray.700', 'secondaryGray.400');
  const borderColor = useColorModeValue('secondaryGray.100', 'whiteAlpha.100');
  const brandColor = useColorModeValue('brand.500', 'brand.400');
  const activeBg = useColorModeValue('#F2EFFF', 'whiteAlpha.100');
  const hoverBg = useColorModeValue('secondaryGray.300', 'whiteAlpha.50');
  const inputBg = useColorModeValue('transparent', 'navy.800');

  const sortOptions = useMemo(() => [
    { key: "publish_at", name: getLangText("BLOG_SORT_TIME") },
    { key: "reply_num", name: getLangText("BLOG_SORT_REPLY") },
    { key: "visited_num", name: getLangText("BLOG_SORT_VISIT") },
    { key: "thumb_count", name: getLangText("BLOG_SORT_THUMB") },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [locale]);

  const categories = useMemo(
    () => [{ id: -1, name: getLangText("TEXT_ALL") }, ...BLOG_OLD_CATEGORIES],
    // BLOG_OLD_CATEGORIES reads its labels through getters, so it only has
    // to be re-spread when the language moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale]
  );

  useEffect(() => {
    const newSort = { key: "publish_at", dir: "desc" };
    setSort(newSort);
    fetchAdminRecomArticles();
    fetchHonormans();
    fetchData(0, DEFAULT_PAGE_SIZE, newSort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = async (page = 0, pageSize = DEFAULT_PAGE_SIZE, sort = {}, filter = {}) => {
    setLoading(true);
    setErrText("");
    const offset = page * pageSize;
    const params = { offset, limit: pageSize, sortKey: sort.key || "", sortDir: sort.dir || "", ...filter };
    const resp = await getBlogArticles(params);
    if (resp.code === RESP_CODES.SUCCESS.code) {
      setTotal(resp.data.total);
      setRows(resp.data.rows || []);
    } else {
      setErrText(resp.message);
      setRows([]);
    }
    setLoading(false);
  }

  const fetchAdminRecomArticles = async () => {
    const resp = await getAdminRecomBlogArticles();
    if (resp.code === RESP_CODES.SUCCESS.code) {
      setAdminRecomArticles(resp.data.rows || []);
    }
  }

  const fetchHonormans = async () => {
    const resp = await getHonormans();
    if (resp.code === RESP_CODES.SUCCESS.code) {
      setHonormans(resp.data.rows || []);
    }
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

  const onCategoryChange = (id) => {
    const newFilter = { ...filter, subject_id: id === -1 ? "" : id };
    setActiveId(id);
    setFilter(newFilter);
    setPage(0);
    fetchData(0, pageSize, sort, newFilter);
  }

  const onSortChange = (item) => {
    // Clicking the active column flips the direction; clicking a new one
    // starts it at descending, which is what "most recent" and "most
    // replies" both want.
    const newSort = item.key === sort.key
      ? { key: item.key, dir: sort.dir === 'desc' ? 'asc' : 'desc' }
      : { key: item.key, dir: 'desc' };
    setSort(newSort);
    setPage(0);
    fetchData(0, pageSize, newSort, filter);
  }

  const onSearch = (keyword) => {
    const newFilter = { ...filter, keyword };
    setFilter(newFilter);
    setPage(0);
    fetchData(0, pageSize, sort, newFilter);
  }

  /* ---------------- sidebar ---------------- */

  const panel = (title, children) => (
    <Box bg={cardBg} boxShadow={cardShadow} borderRadius="20px" overflow="hidden" mb="16px">
      <Box px="16px" py="12px" borderBottomWidth="1px" borderColor={borderColor}>
        <Text fontSize="sm" fontWeight="700" color={textColor}>{title}</Text>
      </Box>
      {children}
    </Box>
  );

  const renderSidebar = () => (
    <Box display={{ base: 'none', lg: 'block' }} w="280px" flexShrink={0}>
      {user ? (
        <Button
          leftIcon={<FiUpload />}
          variant="brand"
          w="100%"
          h="46px"
          borderRadius="16px"
          fontSize="sm"
          fontWeight="700"
          mb="16px"
          onClick={onOpenHelp}
        >
          {getLangText("BLOG_SUBMIT_BTN")}
        </Button>
      ) : null}

      {panel(getLangText("TEXT_CATEGORY"), (
        <Box p="8px">
          {categories.map((item) => (
            <Box
              key={item.id}
              as="button"
              type="button"
              w="100%"
              textAlign="left"
              px="10px"
              py="9px"
              borderRadius="12px"
              fontSize="sm"
              fontWeight={activeId === item.id ? '700' : '500'}
              color={activeId === item.id ? brandColor : textColor}
              bg={activeId === item.id ? activeBg : 'transparent'}
              _hover={{ bg: activeId === item.id ? activeBg : hoverBg }}
              onClick={() => onCategoryChange(item.id)}
            >
              {item.name}
            </Box>
          ))}
        </Box>
      ))}

      {adminRecomArticles.length ? panel(getLangText("BLOG_ADMIN_RECOMM"), (
        <Box maxH="360px" overflowY="auto">
          {adminRecomArticles.map((row) => (
            <Flex
              key={row.id}
              as={NavLink}
              to={`/vendor/blog/${row.id}`}
              align="flex-start"
              px="16px"
              py="12px"
              borderBottomWidth="1px"
              borderColor={borderColor}
              _hover={{ bg: hoverBg }}
            >
              <Avatar size="xs" name={row.user_userid} bg="brand.500" color="white" me="10px" mt="2px" />
              <Box minW="0">
                <Text fontSize="sm" fontWeight="600" color={textColor} noOfLines={2}>{row.title}</Text>
                <Text fontSize="xs" color={mutedColor} noOfLines={1} mt="2px">{row.summary}</Text>
              </Box>
            </Flex>
          ))}
        </Box>
      )) : null}

      {honormans.length ? panel(getLangText("BLOG_MONTHLY_AUTHOR"), (
        <Flex wrap="wrap" gridGap="10px" p="16px">
          {honormans.map((row, index) => (
            <Flex key={`${row.user_userid}-${index}`} align="center" gridGap="6px">
              <Avatar size="xs" name={row.user_userid} bg="brand.500" color="white" />
              <Text fontSize="xs" color={mutedColor}>{row.user_userid}</Text>
            </Flex>
          ))}
        </Flex>
      )) : null}
    </Box>
  );

  /* ---------------- list ---------------- */

  const renderSortBar = () => (
    <Flex
      align="center"
      gridGap="8px"
      overflowX="auto"
      className="global-scroll-x"
      mb="14px"
    >
      {sortOptions.map((item) => {
        const isActive = item.key === sort.key;
        return (
          <Flex
            key={item.key}
            as="button"
            type="button"
            align="center"
            gridGap="4px"
            flex="0 0 auto"
            px="14px"
            h="34px"
            borderRadius="17px"
            borderWidth="1px"
            borderColor={isActive ? 'transparent' : borderColor}
            bg={isActive ? brandColor : cardBg}
            color={isActive ? 'white' : mutedColor}
            fontSize="sm"
            fontWeight="600"
            onClick={() => onSortChange(item)}
          >
            {item.name}
            {isActive ? (
              <Icon as={sort.dir === 'desc' ? FiArrowDown : FiArrowUp} boxSize="12px" />
            ) : null}
          </Flex>
        );
      })}
    </Flex>
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
              {getLangText('MENU_HOME_BLOG')}
            </Text>
            <Text fontSize="sm" color={mutedColor} mt="4px">
              {getLangText('BLOG_LIST_SUBTITLE')}
            </Text>
          </Box>

          <Flex align="center" gridGap="10px" w={{ base: '100%', md: 'auto' }}>
            <SearchBar
              onSearch={onSearch}
              background={inputBg}
              disabled={loading}
              w={{ base: '100%', md: '300px' }}
            />
            {user ? (
              <Button
                // The sidebar carries this action from lg up; below that
                // the sidebar is not rendered, so it moves up here.
                display={{ base: 'flex', lg: 'none' }}
                flexShrink={0}
                leftIcon={<FiUpload />}
                variant="brand"
                borderRadius="14px"
                fontSize="sm"
                onClick={onOpenHelp}
              >
                {getLangText('BLOG_SUBMIT_BTN')}
              </Button>
            ) : null}
          </Flex>
        </Flex>

        <Flex align="flex-start" gridGap="24px">
          {renderSidebar()}

          <Box flex="1" minW="0">
            {renderSortBar()}

            {loading ? (
              Array.from({ length: SKELETON_ROWS }).map((_, index) => (
                <Box key={`sk-${index}`} bg={cardBg} boxShadow={cardShadow} borderRadius="16px" p="20px" mb="12px">
                  <SkeletonText noOfLines={3} spacing="12px" skeletonHeight="12px" />
                </Box>
              ))
            ) : errText ? (
              <Box bg={cardBg} boxShadow={cardShadow} borderRadius="16px" py="48px" textAlign="center" fontSize="sm" color={mutedColor}>
                {errText}
              </Box>
            ) : !rows.length ? (
              <Box bg={cardBg} boxShadow={cardShadow} borderRadius="16px" py="48px" textAlign="center" fontSize="sm" color={mutedColor}>
                {getLangText('BLOG_EMPTY')}
              </Box>
            ) : rows.map((article) => (
              <AnimationScroll key={article.id} type="bottom" delay={0.1}>
                <BlogArticleCard article={article} />
              </AnimationScroll>
            ))}

            <Pagination
              count={total}
              page={page}
              pageSize={pageSize}
              onPageChange={onPageChange}
              onPageSizeChange={onPageSizeChange}
              showGoto={true}
              showTotal={true}
            />
          </Box>
        </Flex>
      </SiteContainer>

      <BlogHelpModal
        isOpen={isOpenHelp}
        onClose={onCloseHelp}
        title={getLangText("BLOG_ASSIST")}
      />
    </Box>
  );
}

export default BlogArticlesPage;
