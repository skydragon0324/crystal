import React, { useEffect, useState } from 'react';
import {
  Avatar, Box, Button, Flex, Icon, Tag, Text, useBoolean, useColorModeValue,
} from '@chakra-ui/react';
import { NavLink } from 'react-router-dom';
import { FiCalendar, FiEye, FiMessageCircle, FiThumbsUp } from 'react-icons/fi';
import useCustomToast from 'hooks/useCustomToast';
import { viewBlogReply, recomArticle } from 'api/client/blogApi';
import { formatDate, formatNumber, sanitizeRichText } from 'utils/utils';
import { getLangText } from 'lang/lang';
import { RESP_CODES } from 'constants/responseCodes';

/** The three recommendation tiers, in the order the API numbers them. */
const MEDALS = [
  { type: 0, field: 'thumb_gold', color: '#E9B949' },
  { type: 1, field: 'thumb_silver', color: '#A0AEC0' },
  { type: 2, field: 'thumb_bronze', color: '#C05621' },
];

/** Styling for stored HTML, which arrives with its own markup. */
const RICH_TEXT_SX = {
  'a': { color: 'brand.500', textDecoration: 'underline' },
  'ul, ol': { paddingInlineStart: '20px' },
  'img': { maxWidth: '100%', height: 'auto', borderRadius: '8px' },
  'p': { marginBottom: '10px' },
};

/**
 * A blog article, or one reply to it - `parent === 0` picks which.
 *
 * Recommending used to call `window.location.reload()` half a second after
 * the request came back, which threw away the whole page - scroll
 * position, expanded replies and all - to move one number by one. The
 * count is updated in place instead; the server stays the source of truth
 * on the next load.
 *
 * The metadata row was also written twice per mode, once for phones and
 * once for desktop, hidden from each other with `display`. There is one
 * row per mode now.
 */
const BlogReplyCard = (props) => {
  const { disabled } = props;
  const { toastSuccess, toastError } = useCustomToast();
  const [article, setArticle] = useState();
  const [isMore, setIsMore] = useBoolean();

  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const mutedColor = useColorModeValue('secondaryGray.700', 'secondaryGray.400');
  const bodyColor = useColorModeValue('secondaryGray.900', 'gray.300');
  const borderColor = useColorModeValue('secondaryGray.100', 'whiteAlpha.100');

  useEffect(() => {
    if (props.article) {
      setArticle(props.article);
    }
  }, [props.article]);

  const onRecomArticle = async (type) => {
    const params = { blog_pk: article.id, rating_type: type + 1, imei: "" };
    const resp = await recomArticle(params);

    if (resp.code === RESP_CODES.SUCCESS.code) {
      const field = MEDALS[type].field;
      setArticle((current) => ({
        ...current,
        [field]: (+current[field] || 0) + 1,
      }));
      toastSuccess(getLangText("BLOG_THUMB_SUCCESS"));
    } else {
      toastError(resp.message);
    }
  }

  const onViewReply = async (blog_pk) => {
    if (disabled) return;

    const resp = await viewBlogReply({ blog_pk });
    if (resp.code !== RESP_CODES.SUCCESS.code) return;

    setIsMore.toggle();
    setArticle((current) => ({
      ...current,
      visit_count: resp.data.is_increase ? current.visit_count + 1 : current.visit_count,
      ...resp.data.lob_row,
    }));
  }

  if (!article) return null;

  const meta = (icon, value, options) => {
    const opts = options || {};
    return (
      <Flex
        align="center"
        gridGap="5px"
        color={mutedColor}
        cursor={opts.onClick ? 'pointer' : 'default'}
        onClick={opts.onClick}
        _hover={opts.onClick ? { color: textColor } : undefined}
      >
        <Icon as={icon} boxSize="13px" color={opts.color || mutedColor} />
        <Text fontSize="xs">{value}</Text>
      </Flex>
    );
  };

  const medals = () => MEDALS.map((medal) => (
    <Box key={medal.type}>
      {meta(FiThumbsUp, formatNumber(article[medal.field]), {
        color: medal.color,
        onClick: () => onRecomArticle(medal.type),
      })}
    </Box>
  ));

  /* ---------------- the article itself ---------------- */

  if (article.parent === 0) {
    return (
      <Flex direction="column">
        <Text fontSize={{ base: 'lg', md: '2xl' }} fontWeight="800" color={textColor} mb="12px">
          {article.title}
        </Text>

        <Flex align="center" wrap="wrap" gridGap={{ base: '10px', md: '16px' }} pb="14px" borderBottomWidth="1px" borderColor={borderColor}>
          <Flex align="center" gridGap="8px" me="4px">
            <Avatar size="xs" name={article.user_userid} bg="brand.500" color="white" />
            <Text fontSize="xs" fontWeight="600" color={mutedColor}>{article.user_userid}</Text>
          </Flex>

          {article.subject_name ? (
            <Tag size="sm" borderRadius="8px" colorScheme="brandScheme" fontSize="xs">
              {article.subject_name}
            </Tag>
          ) : null}

          {meta(FiCalendar, formatDate(article.publish_at))}
          {meta(FiEye, formatNumber(article.visit_count))}
          {meta(FiMessageCircle, formatNumber(article.reply_count))}

          <Flex align="center" gridGap="12px" ms={{ base: '0', md: 'auto' }}>
            {medals()}
          </Flex>
        </Flex>

        <Box
          mt="18px"
          fontSize="sm"
          color={bodyColor}
          sx={RICH_TEXT_SX}
          dangerouslySetInnerHTML={{ __html: sanitizeRichText(article.content) }}
        />

        {article.origin ? (
          <Text fontSize="xs" color={mutedColor} mt="16px">
            {getLangText("BLOG_ORIGIN")}: {article.origin}
          </Text>
        ) : null}

        {article.approval_num ? (
          <Text fontSize="xs" color={mutedColor} textAlign="end" mt="8px">
            {article.approval_num}
          </Text>
        ) : null}

        <Flex justify="center" display={{ base: 'flex', lg: 'none' }} mt="20px">
          <Button as={NavLink} to="/vendor/blog" variant="light" borderRadius="14px" fontSize="sm">
            {getLangText("BLOG_TO_LIST")}
          </Button>
        </Flex>
      </Flex>
    );
  }

  /* ---------------- one reply ---------------- */

  return (
    <Flex direction="column" pb="18px">
      <Flex align="center" wrap="wrap" gridGap="12px" mb="10px">
        <Flex align="center" gridGap="8px">
          <Avatar size="xs" name={article.user_userid} bg="brand.500" color="white" />
          <Text fontSize="xs" fontWeight="600" color={mutedColor}>{article.user_userid}</Text>
        </Flex>

        {meta(FiCalendar, formatDate(article.publish_at))}
        {meta(FiEye, formatNumber(article.visit_count))}

        <Flex align="center" gridGap="12px" ms="auto">
          {medals()}
        </Flex>
      </Flex>

      {isMore ? (
        <Box cursor="pointer" onClick={() => setIsMore.toggle()}>
          <Box
            fontSize="sm"
            color={bodyColor}
            sx={RICH_TEXT_SX}
            dangerouslySetInnerHTML={{ __html: sanitizeRichText(article.content) }}
          />
          {article.approval_num ? (
            <Text fontSize="xs" color={mutedColor} textAlign="end" mt="8px">
              {article.approval_num}
            </Text>
          ) : null}
        </Box>
      ) : (
        // Collapsed: the summary is the affordance, so it says so rather
        // than relying on the visitor guessing that two lines are clickable.
        <Box cursor="pointer" onClick={() => onViewReply(article.id)}>
          <Text fontSize="sm" color={bodyColor} noOfLines={2}>
            {article.summary}
          </Text>
          <Text fontSize="xs" fontWeight="600" color="brand.500" mt="6px">
            {getLangText("TEXT_DETAIL")}
          </Text>
        </Box>
      )}
    </Flex>
  );
}

export default BlogReplyCard;
