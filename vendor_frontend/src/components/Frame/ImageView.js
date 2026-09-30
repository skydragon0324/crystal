import React, { useState, useEffect } from 'react';
import { Image } from '@chakra-ui/react';
import { getFileUrl } from 'utils/utils';

const ImageView = ({ path, file, ...rest }) => {
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result);
      reader.readAsDataURL(file);
    } else {
      setPreview(null);
    }
  }, [file]);

  return (
    <Image
      src={preview || getFileUrl(path)}
      alt=""
      {...rest}
    />
  );
};

export default ImageView;
