import React, { useEffect, useRef } from 'react';
import { useColorModeValue } from '@chakra-ui/system';
import Scrollbars from 'react-custom-scrollbars';
import { renderTrack, renderThumbLight, renderThumbDark, renderView } from 'components/Scrollbar/Scrollbar';

const CustomScrollbar = (props) => {
  const { maxH, scrollHeight, currentRatio, children } = props;
  const scrollRef = useRef();

  useEffect(() => {
    if (scrollRef.current && scrollHeight && currentRatio) {
      if (currentRatio > 0.8) {
        scrollRef.current.scrollToBottom();
      } else {
        scrollRef.current.scrollTop(scrollHeight * currentRatio);
      }
    }
  }, [scrollHeight, currentRatio]);

  return (
    <Scrollbars
      autoHide
      autoHeight
      autoHeightMax={maxH || 200}
      renderTrackVertical={renderTrack}
      renderThumbVertical={useColorModeValue(renderThumbLight, renderThumbDark)}
      renderView={renderView}
      ref={scrollRef}
      style={{ paddingRight: "4px" }}
    >
      {children}
    </Scrollbars>
  );
}

export default CustomScrollbar;
