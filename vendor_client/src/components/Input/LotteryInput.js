import React, { useState, useEffect } from 'react';
import { Input } from '@chakra-ui/react';
import InputMask from 'react-input-mask';
import { formatLotteryNumber } from 'utils/utils';

const LotteryInput = ({ value, onChange, length, disabled, ...rest }) => {
  const [mask, setMask] = useState('999999');

  useEffect(() => {
    if (length > 0) {
      setMask('9'.repeat(length));
    }
  }, [length]);

  return (
    <InputMask
      {...rest}
      mask={mask}
      maskChar=" "
      value={formatLotteryNumber(value, length)}
      onChange={onChange}
      disabled={disabled}
    >
      {(inputProps) => (
        <Input
          {...inputProps}
          type="num"
          variant="outline"
          fontSize="sm"
          size="md"
          disabled={disabled}
        />
      )}
    </InputMask>
  );
};

export default LotteryInput;
