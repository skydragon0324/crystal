import React from 'react';
import {
  Flex, Stat, StatLabel, StatNumber, Text, useColorModeValue
} from '@chakra-ui/react';
import Card from './Card';

/**
 * Horizon's stat tile: a tinted icon puck, a small grey caption and one
 * large number.
 *
 *   startContent  usually an <IconBox />, drawn to the left
 *   endContent    trailing control, pushed to the right edge
 *   growth        e.g. '+2.45%', shown in green before the subtext
 *   subtext       the qualifier under the number
 *
 * Built for the account summary strips - wallet balance, point totals -
 * where a full table for a single figure is too much furniture.
 */
const MiniStatistics = ({
  startContent, endContent, name, growth, value, subtext, ...rest
}) => {
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const textColorSecondary = useColorModeValue('secondaryGray.700', 'secondaryGray.500');

  return (
    <Card py="15px" {...rest}>
      <Flex
        my="auto" h="100%"
        align={{ base: 'center', xl: 'start' }}
        justify={{ base: 'center', xl: 'center' }}
      >
        {startContent}

        <Stat my="auto" ms={startContent ? '18px' : '0px'}>
          <StatLabel
            lineHeight="100%" color={textColorSecondary}
            fontSize={{ base: 'sm' }} fontWeight="500"
          >
            {name}
          </StatLabel>
          <StatNumber color={textColor} fontSize={{ base: '2xl' }} fontWeight="700" mt="6px">
            {value}
          </StatNumber>

          {growth ? (
            <Flex align="center" mt="4px">
              <Text color="green.500" fontSize="xs" fontWeight="700" me="5px">
                {growth}
              </Text>
              {subtext ? (
                <Text color={textColorSecondary} fontSize="xs" fontWeight="400">
                  {subtext}
                </Text>
              ) : null}
            </Flex>
          ) : subtext ? (
            <Text color={textColorSecondary} fontSize="xs" fontWeight="400" mt="4px">
              {subtext}
            </Text>
          ) : null}
        </Stat>

        {endContent ? <Flex ms="auto" w="max-content">{endContent}</Flex> : null}
      </Flex>
    </Card>
  );
};

export default MiniStatistics;
