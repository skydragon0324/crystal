import React, { useEffect, useState } from 'react'
import { Box, SkeletonText, Text, useColorModeValue } from '@chakra-ui/react'
import { Flex } from '@chakra-ui/react'
import SiteContainer from 'components/Layout/SiteContainer';
import BlogReplyCard from './BlogReplyCard';
import BlogInfoCard from './BlogInfoCard';
import { getBlogReplies } from 'api/client/blogApi';
import { getLangText } from 'lang/lang';
import { RESP_CODES } from 'constants/responseCodes';

// FIXME iron@ the replies endpoint is called once for the whole thread.
// Paging it needs the API to report a total the client can trust; until
// then a single large page is both simpler and correct.
const ALL_REPLIES = 1000;

/**
 * One blog thread: the article, then its replies.
 *
 * Two things were wrong here.
 *
 * `rows.slice(1, rows.length - 1)` dropped the last reply on every thread.
 * The article is rows[0] and the replies are the rest, so the second
 * argument was one short - a thread with three replies showed two, and a
 * thread with one showed none at all.
 *
 * And three <InfiniteScroll> wrappers each rendered a single static child
 * with `hasMore` pinned to false, so none of them could ever load
 * anything; they were three copies of machinery with nothing to drive.
 */
const BlogRepliesPage = (props) => {
  const { match } = props;
  const blogId = match.params.id;

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [errText, setErrText] = useState("");

  const cardBg = useColorModeValue('white', 'navy.700');
  const cardShadow = useColorModeValue(
    '14px 17px 40px 4px rgba(112, 144, 176, 0.08)',
    '14px 17px 40px 4px rgba(12, 44, 55, 0.18)'
  );
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const mutedColor = useColorModeValue('secondaryGray.700', 'secondaryGray.400');
  const borderColor = useColorModeValue('secondaryGray.100', 'whiteAlpha.100');

  useEffect(() => {
    if (!blogId) return undefined;

    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setErrText("");

      const resp = await getBlogReplies({
        offset: 0,
        limit: ALL_REPLIES,
        sortKey: "",
        sortDir: "desc",
        parent_pk: blogId,
      });
      if (cancelled) return;

      if (resp.code === RESP_CODES.SUCCESS.code) {
        setRows(resp.data.rows || []);
      } else {
        setErrText(resp.message);
        setRows([]);
      }
      setLoading(false);
    };

    fetchData();
    return () => { cancelled = true; };
  }, [blogId]);

  const article = rows[0];
  const replies = rows.slice(1);

  const panel = (children, props) => (
    <Box bg={cardBg} boxShadow={cardShadow} borderRadius="20px" p={{ base: '18px', md: '24px' }} {...props}>
      {children}
    </Box>
  );

  if (loading) {
    return (
      <SiteContainer pt={{ base: '20px', md: '32px' }} pb="60px">
        {panel(<SkeletonText noOfLines={8} spacing="14px" skeletonHeight="12px" />)}
      </SiteContainer>
    );
  }

  if (errText || !article) {
    return (
      <SiteContainer pt={{ base: '20px', md: '32px' }} pb="60px">
        {panel(
          <Text py="36px" textAlign="center" fontSize="sm" color={mutedColor}>
            {errText || getLangText('TEXT_NO_CONTENT')}
          </Text>
        )}
      </SiteContainer>
    );
  }

  return (
    <Box pb="60px">
      <SiteContainer pt={{ base: '20px', md: '32px' }}>
        <Flex align="flex-start" gridGap="24px">
          {/* author column - sticky, so the reply button stays reachable
              down a long thread */}
          <Box display={{ base: 'none', lg: 'block' }} w="260px" flexShrink={0} position="sticky" top="90px">
            {panel(<BlogInfoCard article={article} blogId={blogId} />)}
          </Box>

          <Box flex="1" minW="0">
            {panel(<BlogReplyCard article={article} disabled={loading} />)}

            {replies.length ? (
              <Box mt="24px">
                {panel(
                  <>
                    <Text
                      fontSize={{ base: 'md', md: 'lg' }}
                      fontWeight="800"
                      color={textColor}
                      pb="14px"
                      mb="6px"
                      borderBottomWidth="1px"
                      borderColor={borderColor}
                    >
                      {getLangText('BLOG_REPLY_ARTICLES')} ({replies.length})
                    </Text>

                    {replies.map((row, index) => (
                      <Box
                        key={row.id || index}
                        pt="18px"
                        borderTopWidth={index === 0 ? '0' : '1px'}
                        borderColor={borderColor}
                      >
                        <BlogReplyCard article={row} disabled={loading} />
                      </Box>
                    ))}
                  </>
                )}
              </Box>
            ) : null}

            {/* The author panel is not rendered below lg, so its two
                actions have to appear somewhere on a phone. */}
            <Box display={{ base: 'block', lg: 'none' }} mt="24px">
              {panel(<BlogInfoCard article={article} blogId={blogId} />)}
            </Box>
          </Box>
        </Flex>
      </SiteContainer>
    </Box>
  )
}

export default BlogRepliesPage;
