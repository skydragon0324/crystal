import React, { useRef, useEffect, useState } from 'react';
import { AlertDialog, AlertDialogBody, AlertDialogCloseButton, AlertDialogContent, AlertDialogHeader, AlertDialogOverlay, Flex, Text } from '@chakra-ui/react';
import { FiCalendar, FiEye, FiMessageCircle } from 'react-icons/fi';
import CustomScrollbar from 'components/Scrollbar/CustomScrollbar';
import { getBlogContent } from 'api/client/accountApi';
import { formatDate, formatNumber, sanitizeRichText } from 'utils/utils';
import { getLangText } from 'lang/lang';
import { RESP_CODES } from 'constants/responseCodes';
import { BLOG_OLD_PUB_STATUS } from 'constants/constants';

const ViewBlogDetailModal = (props) => {
  const { isOpen, onClose, title = "", article, closeButton = true, onSave, ...rest } = props;
  const cancelRef = useRef();
  const [lob, setLob] = useState();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && article) {
      fetchData(article);
    }
  }, [isOpen, article])

  const fetchData = async (article) => {
    setLoading(true);
    const params = {
      blog_pk: article.id,
    };
    const resp = await getBlogContent(params);
    if (resp.code === RESP_CODES.SUCCESS.code) {
      setLob({
        ...article,
        ...resp.data.row,
      });
    } else {
      // setErrText(resp.message);
    }
    setLoading(false);
  }

  if (!lob || loading) {
    return <Text></Text>;
  }

  return (
    <AlertDialog
      motionPreset="slideInBottom"
      leastDestructiveRef={cancelRef}
      isCentered
      closeOnOverlayClick={false}
      isOpen={isOpen}
      onClose={onClose}
      {...rest}
    >
      <AlertDialogOverlay />
      <AlertDialogContent maxW="1080px">
        {!!title && (
          <AlertDialogHeader fontSize="lg" fontWeight="bold">
            {title}
          </AlertDialogHeader>
        )}
        {closeButton && (
          <AlertDialogCloseButton />
        )}
        <AlertDialogBody mt={!!title ? "" : "3"}>
          <Flex mb="12px">
            {lob.is_help_request === 1 && (
              <Text>{getLangText("TEXT_CATEGORY")}: {getLangText("BLOG_CATEGORY_HELP")}</Text>
            )}
            <Text ml="12px">{getLangText("BLOG_SUBJECT")}: {lob.subject_field}</Text>
            <Flex align="center" ml="12px">
              <FiCalendar />
              <Text ml="4px">{formatDate(lob.created_at)}</Text>
            </Flex>
            <Flex align="center" ml="12px">
              <FiEye />
              <Text ml="4px">{formatNumber(lob.visited_num)}</Text>
            </Flex>
            <Flex align="center" ml="12px">
              <FiMessageCircle />
              <Text ml="4px">{formatNumber(lob.reply_num || 0)}</Text>
            </Flex>
            {lob.help_status_field}
          </Flex>
          <CustomScrollbar maxH="300px">
            <p dangerouslySetInnerHTML={{ __html: sanitizeRichText(lob && lob.content) }} />
          </CustomScrollbar>
          <Text mt="12px">{lob?.approval_num || ""}</Text>
          {[BLOG_OLD_PUB_STATUS.ADMIN_DENY, BLOG_OLD_PUB_STATUS.PUB_DENY, BLOG_OLD_PUB_STATUS.REQUESTING_COPIED_BLOG, BLOG_OLD_PUB_STATUS.COPIED_BLOG].includes(+lob.state) && (
            <Flex direction="column">
              <Text color="red" fontSize="lg">{getLangText("BLOG_DENY_REASON")}</Text>
              <Text mt="8px">{lob.reason || ""}</Text>
            </Flex>
          )}
        </AlertDialogBody>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default ViewBlogDetailModal;
