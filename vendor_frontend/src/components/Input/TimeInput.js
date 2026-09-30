import React from 'react';
import { Input } from '@chakra-ui/react';
import InputMask from 'react-input-mask';

const TimeInput = (props) => {
  const { value, onChange, disabled, ...rest } = props;

  return (
    <InputMask
      {...rest}
      mask="99:99"
      maskChar=" "
      value={value}
      onChange={onChange}
      disabled={disabled}
    >
      {(inputProps) => (
        <Input
          {...inputProps}
          type="tel"
          variant="outline"
          fontSize="sm"
          size="md"
          disabled={disabled}
        />
      )}
    </InputMask>
  );
}

export default TimeInput;
