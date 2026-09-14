import React, { useState, useEffect } from 'react';
import { Input } from '@chakra-ui/react';
import InputMask from 'react-input-mask';
import { getLangText } from 'lang/lang';

const PhoneInput = ({ value, onChange, disabled, ...rest }) => {
  const [mask, setMask] = useState('999-999-9999');

  useEffect(() => {
    const cleanedValue = value.replace(/\D/g, ''); // Remove non-numeric characters

    if (cleanedValue.startsWith(getLangText("PHONE_PREFIX_1")) || cleanedValue.startsWith(getLangText("PHONE_PREFIX_5")) || cleanedValue.startsWith(getLangText("PHONE_PREFIX_8"))) {
      setMask('999-999-9999'); // mobile phones
    } else if (cleanedValue.startsWith(getLangText("LINE_PREFIX_1"))) {
      setMask('99-999-9999'); // capital
    } else {
      setMask('999-99-9999'); // other format
    }
  }, [value]);

  return (
    <InputMask
      {...rest}
      mask={mask}
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
};

export default PhoneInput;
