import React from 'react';
import { NavLink } from 'react-router-dom';
import { Avatar, Box, Button, Flex, Text, useColorModeValue } from '@chakra-ui/react';
import { FiMessageCircle, FiSkipBack } from 'react-icons/fi';
import { getLangText } from 'lang/lang';

/**
 * The author panel beside a blog thread.
 *
 * The age line used to be built as `(${article.user_age}ì‚´)` - a Korean
 * character that had been decoded as Latin-1 somewhere in the file's
 * history and re-saved as UTF-8, so it rendered as mojibake for every
 * reader. It uses the catalogue's unit string now, which is translatable
 * and cannot rot the same way.
 */
const BlogInfoCard = ({ article, blogId }) => {
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const mutedColor = useColorModeValue('secondaryGray.700', 'secondaryGray.400');
  const borderColor = useColorModeValue('secondaryGray.100', 'whiteAlpha.100');

  if (!article) return null;

  const age = article.user_age
    ? `${article.user_age} ${getLangText('TEXT_UNIT_AGE')}`
    : '';

  return (
    <Flex direction="column" align="center" py="8px">
      <Avatar size="xl" name={article.user_userid} bg="brand.500" color="white" mb="12px" />

      <Text fontSize="md" fontWeight="700" color={textColor} noOfLines={1}>
        {article.user_userid}
      </Text>
      <Text fontSize="sm" color={mutedColor} noOfLines={1}>
        {article.user_name}{age ? ` · ${age}` : ''}
      </Text>

      <Box w="100%" h="1px" bg={borderColor} my="18px" />

      <Button
        as={NavLink}
        to={`/vendor/blog/add/${blogId}`}
        leftIcon={<FiMessageCircle />}
        variant="brand"
        w="100%"
        h="44px"
        borderRadius="14px"
        fontSize="sm"
        fontWeight="700"
        mb="10px"
      >
        {getLangText('BLOG_REPLY_BTN')}
      </Button>

      <Button
        as={NavLink}
        to="/vendor/blog"
        leftIcon={<FiSkipBack />}
        variant="light"
        w="100%"
        h="44px"
        borderRadius="14px"
        fontSize="sm"
        fontWeight="600"
      >
        {getLangText('BLOG_TO_LIST')}
      </Button>
    </Flex>
  );
}

export default BlogInfoCard;
