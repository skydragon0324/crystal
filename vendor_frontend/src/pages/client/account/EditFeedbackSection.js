import React, { useState, useEffect, useRef } from 'react';
import { Box, Flex, Icon, IconButton, Image, Text, Textarea, Tooltip, useColorMode, useColorModeValue, useDisclosure } from '@chakra-ui/react';
import { FiCheck, FiSend, FiUser } from 'react-icons/fi';
import CustomScrollbar from 'components/Scrollbar/CustomScrollbar';
import ConfirmDialog from 'components/Dialog/ConfirmDialog';
import useCustomToast from 'hooks/useCustomToast';
import { getFeedbackMessages, addFeedbackMessage, editFeedbackThread } from 'api/client/accountApi';
import { formatTime, sanitizeRichText } from 'utils/utils';
import { getLangText } from 'lang/lang';
import { RESP_CODES } from 'constants/responseCodes';
import { ACTION_TYPE, FEEDBACK_THREAD_STATUS } from 'constants/constants';

import icLogoWhite from 'assets/images/logo_sm_white.png';
import icLogoBlack from 'assets/images/logo_sm_black.png';

const EditFeedbackSection = (props) => {
  const { open, onSave } = props;
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [scrollHeight, setScrollHeight] = useState(0);
  const [currentThread, setCurrentThread] = useState();
  const containerRef = useRef();
  const { toastError, toastSuccess } = useCustomToast();
  const { isOpen: isOpenFinish, onOpen: onOpenFinish, onClose: onCloseFinish } = useDisclosure();
  const textColor = useColorModeValue("var(--chakra-colors-gray-700)", "white");

  useEffect(() => {
    const updateScrollHeight = () => {
      if (containerRef.current) {
        setScrollHeight(containerRef.current.offsetHeight);
      }
    }

    if (messages.length > 0) {
      updateScrollHeight();
    }
    window.addEventListener('resize', updateScrollHeight);

    return () => {
      window.removeEventListener('resize', updateScrollHeight);
    };
  }, [containerRef, messages]);

  useEffect(() => {
    if (open && props.formData?.thread_pk) {
      setCurrentThread(props.formData);
      fetchMessages(props.formData.thread_pk);
    }
  }, [open, props.formData]);

  const fetchMessages = async (thread_pk) => {
    setLoading(true);
    const params = { thread_pk };
    const resp = await getFeedbackMessages(params);
    if (resp.code === RESP_CODES.SUCCESS.code) {
      setMessages(resp.data.rows.map(row => ({
        ...row,
        message: row.message.replace(/\n/g, "<br />"),
      })));
    } else {
      // toastError(resp.message);
    }
    setLoading(false);
  }

  const onKeyUpReply = async (e) => {
    if (e.ctrlKey && e.key === "Enter") {
      await onSendFeedback();
    }
  }

  const onSendFeedback = async () => {
    if (!currentThread) {
      return;
    }
    setLoading(true);
    const params = {
      thread_pk: currentThread.thread_pk,
      message: reply,
    };
    const resp = await addFeedbackMessage(params);
    if (resp.code === RESP_CODES.SUCCESS.code) {
      fetchMessages(currentThread.thread_pk);
      setReply("");
      onSave && onSave();
    } else {
      toastError(resp.message);
    }
    setLoading(false);
  }

  const handleFinishThread = async () => {
    onCloseFinish();
    if (!currentThread) {
      return;
    }

    const params = {
      thread_pk: currentThread.thread_pk,
      status: FEEDBACK_THREAD_STATUS.RESOLVED,
    };
    const resp = await editFeedbackThread(params);
    if (resp.code === RESP_CODES.SUCCESS.code) {
      toastSuccess(getLangText("OPERATION_SUCCESS"));
    } else {
      toastError(resp.message);
    }
  }

  return (
    <Flex h="full" direction="column">
      <Flex align="center" justify="space-between" mb="20px">
        <Flex align="center">
          <Text ml="12px" fontSize="lg" color={textColor} fontWeight="bold">
            {currentThread?.title || ""}
          </Text>
        </Flex>
        <Flex align="center">
          {currentThread?.category_field}
          <Box w="12px" />
          {currentThread?.status_field}
          {[FEEDBACK_THREAD_STATUS.DISCUSSING].includes(currentThread?.status) && (
            <Tooltip label={getLangText("FEEDBACK_RESOLVED")} hasArrow placement="top">
              <IconButton ml="12px" variant="outline" colorScheme="blue" icon={<FiCheck />} disabled={loading} onClick={onOpenFinish} />
            </Tooltip>
          )}
        </Flex>
      </Flex>
      <Flex h="full" direction="column" justify="space-between">
        <CustomScrollbar maxH="64vh" scrollHeight={scrollHeight} currentRatio={1}>
          <Flex direction="column" pr="12px" ref={containerRef}>
            {messages.map((row, index) => (
              <FeedbackRow
                key={index}
                row={row}
                loading={loading}
              />
            ))}
          </Flex>
        </CustomScrollbar>
        <Flex align="flex-end">
          <Textarea rows={6} placeholder={getLangText("FEEDBACK_SEND_TIP")} value={reply} onChange={e => setReply(e.target.value)} onKeyUp={onKeyUpReply} disabled={loading || ![FEEDBACK_THREAD_STATUS.DISCUSSING].includes(currentThread?.status)} />
          <Flex direction="column" ml="12px">
            <Tooltip label={getLangText("TEXT_SEND")} hasArrow placement="top">
              <IconButton mt="8px" variant="outline" colorScheme="blue" icon={<FiSend />} disabled={loading || !reply} onClick={onSendFeedback} />
            </Tooltip>
          </Flex>
        </Flex>
      </Flex>
      <ConfirmDialog
        isOpen={isOpenFinish}
        onClick={onCloseFinish}
        title={getLangText("FEEDBACK_FINISH_THREAD")}
        description={getLangText("FEEDBACK_FINISH_DESC")}
        primaryText={getLangText("TEXT_OK")}
        primaryColor="blue"
        primaryAction={handleFinishThread}
        secondaryText={getLangText("TEXT_CANCEL")}
        secondaryAction={onCloseFinish}
        loading={loading}
      />
    </Flex>
  );
}

const FeedbackRow = (props) => {
  const { row } = props;
  const { colorMode } = useColorMode();

  return (
    <Flex direction="column" mb="12px">
      {row?.action_type === ACTION_TYPE.USER ? (
        <Flex align="flex-end" justify="flex-end" mt="12px">
          <Box border="1px solid" borderColor={row.forward_pk ? "yellow" : ""} borderRadius="8px" padding="8px" mr="12px">
            <Text dangerouslySetInnerHTML={{ __html: sanitizeRichText(row.message, false) }} />
            <Flex align="center" justify="flex-start" mt="8px">
              <Text fontSize="sm">{formatTime(row.action_at)}</Text>
            </Flex>
          </Box>
          <Box w="26px" h="26px" border="1px solid" borderRadius="full">
            <Icon as={FiUser} w="24px" h="24px" />
          </Box>
        </Flex>
      ) : row?.action_type === ACTION_TYPE.MANAGER ? (
        <Flex align="flex-end">
          <Flex direction="column" align="center" mr="12px">
            <Image src={colorMode === "light" ? icLogoBlack : icLogoWhite} alt="" w="24px" minW="24px" h="24px" />
          </Flex>
          <Box border="1px solid" borderRadius="8px" padding="8px">
            <Text dangerouslySetInnerHTML={{ __html: sanitizeRichText(row.message, false) }} />
            <Flex align="center" justify="flex-end" mt="8px">
              <Text fontSize="sm" ml="12px">{formatTime(row.action_at)}</Text>
            </Flex>
          </Box>
        </Flex>
      ) : <></>}
    </Flex>
  );
}

export default EditFeedbackSection;
