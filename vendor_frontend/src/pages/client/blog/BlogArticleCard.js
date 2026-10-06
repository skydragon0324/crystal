import React from 'react';
import { NavLink } from 'react-router-dom';
import { Avatar, Box, Flex, Icon, Tag, Text, useColorModeValue } from '@chakra-ui/react';
import { FiCalendar, FiEye, FiMessageCircle, FiThumbsUp } from 'react-icons/fi';
import { formatDate, formatNumber } from 'utils/utils';

/**
 * One article in the blog list.
 *
 * The previous version printed the same metadata twice - once in a
 * phone-only row inside the body, once in a desktop-only row underneath -
 * and hid each with `display`. Both copies had to be kept in step by hand.
 * There is one metadata row now; the pieces that do not fit a narrow
 * screen drop out of it individually.
 *
 * The three medal counts were three identical rows differing only by the
 * colour passed to the icon, so they are a small table driven off a list.
 */
const MEDALS = [
  { key: 'thumb_gold', color: '#E9B949' },
  { key: 'thumb_silver', color: '#A0AEC0' },
  { key: 'thumb_bronze', color: '#C05621' },
];

const BlogArticleCard = ({ article }) => {
  const cardBg = useColorModeValue('white', 'navy.700');
  const cardShadow = useColorModeValue(
    '14px 17px 40px 4px rgba(112, 144, 176, 0.08)',
    '14px 17px 40px 4px rgba(12, 44, 55, 0.18)'
  );
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const mutedColor = useColorModeValue('secondaryGray.700', 'secondaryGray.400');
  const borderColor = useColorModeValue('secondaryGray.100', 'whiteAlpha.100');
  const brandColor = useColorModeValue('brand.500', 'brand.400');

  if (!article) return null;

  const meta = (icon, value, color) => (
    <Flex align="center" gridGap="5px" color={mutedColor}>
      <Icon as={icon} boxSize="13px" color={color || mutedColor} />
      <Text fontSize="xs">{value}</Text>
    </Flex>
  );

  return (
    <Flex
      as={NavLink}
      to={`/vendor/blog/${article.id}`}
      direction="column"
      bg={cardBg}
      boxShadow={cardShadow}
      borderRadius="16px"
      borderWidth="1px"
      borderColor="transparent"
      p={{ base: '16px', md: '20px' }}
      mb="12px"
      transition="border-color .18s ease, transform .18s ease"
      _hover={{ borderColor: brandColor, transform: 'translateY(-2px)' }}
    >
      <Flex align="flex-start" gridGap="14px">
        <Flex direction="column" align="center" w="56px" flexShrink={0}>
          <Avatar size="sm" name={article.user_userid} bg="brand.500" color="white" />
          <Text fontSize="11px" fontWeight="600" color={mutedColor} mt="6px" noOfLines={1} maxW="56px">
            {article.user_userid}
          </Text>
        </Flex>

        <Box flex="1" minW="0">
          <Text fontSize={{ base: 'sm', md: 'md' }} fontWeight="700" color={textColor} noOfLines={2}>
            {article.title}
          </Text>
          <Text fontSize="sm" color={mutedColor} noOfLines={2} mt="6px">
            {article.summary}
          </Text>
        </Box>
      </Flex>

      <Flex
        align="center"
        wrap="wrap"
        gridGap={{ base: '10px', md: '16px' }}
        mt="14px"
        pt="12px"
        borderTopWidth="1px"
        borderColor={borderColor}
      >
        {article.subject_name ? (
          <Tag size="sm" borderRadius="8px" colorScheme="brandScheme" fontSize="xs">
            {article.subject_name}
          </Tag>
        ) : null}

        {/* The date is the first thing to go on a narrow screen: the
            counts below carry more meaning in a list this dense. */}
        <Box display={{ base: 'none', sm: 'block' }}>
          {meta(FiCalendar, formatDate(article.publish_at))}
        </Box>

        <Flex align="center" gridGap="12px" ms="auto">
          {MEDALS.map((medal) => meta(FiThumbsUp, formatNumber(article[medal.key]), medal.color))}
          {meta(FiEye, formatNumber(article.visit_count))}
          {meta(FiMessageCircle, formatNumber(article.reply_count))}
        </Flex>
      </Flex>
    </Flex>
  );
}

export default BlogArticleCard;
