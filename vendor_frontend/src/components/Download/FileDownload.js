import React, { useState } from 'react'
import { IconButton, Tooltip } from '@chakra-ui/react'
import { FiDownload } from 'react-icons/fi'
import { downloadFile } from 'api/commonApi'
import { downloadBlob } from 'utils/utils'
import useCustomToast from 'hooks/useCustomToast';
import { getLangText } from 'lang/lang'
import { RESP_CODES } from 'constants/responseCodes'

const FileDownload = (props) => {
  const { size = "xs", file_path, file_name, onDownload } = props;
  const { toastError } = useCustomToast();
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    const params = { file_path, file_name };
    setLoading(true);
    try {
      const resp = await downloadFile(params);
      if (resp.status === RESP_CODES.SUCCESS.code) {
        downloadBlob(resp.data, file_name);
        if (onDownload) {
          await onDownload();
        }
      } else {
        toastError(getLangText("OPERATION_FAIL"));
      }
    } catch (error) {
      toastError(error.message);
    }
    setLoading(false);
  }

  return (
    <Tooltip label={file_name || getLangText("TEXT_DOWNLOAD")} hasArrow placement="top">
      <IconButton size={size} variant="outline" colorScheme="blue" icon={<FiDownload />} disabled={loading} onClick={handleDownload} />
    </Tooltip>
  )
}

export default FileDownload;
