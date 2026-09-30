import React, { useEffect, useState } from 'react'
import {
  Box, Flex, Icon, SkeletonText, Tag, Text, useColorModeValue,
} from '@chakra-ui/react'
import { FiMapPin, FiPhone } from 'react-icons/fi';
import { SearchBar } from 'components/Navbars/SearchBar/SearchBar';
import AnimationScroll from 'components/Animation/AnimationScroll';
import SiteContainer from 'components/Layout/SiteContainer';
import useCustomToast from 'hooks/useCustomToast';
import { getProvinces, getServiceAgency } from 'api/client/clientPhoneApi';
import { getLangText } from 'lang/lang';
import { RESP_CODES } from 'constants/responseCodes';
import { AGENCY_BUSINESS } from 'constants/constants';

const SKELETON_ROWS = 5;

/**
 * Authorised service centres, filtered by province.
 *
 * The page used to be written twice - a card list for phones and a table-ish
 * list for desktop, each with its own copy of the row markup. They had
 * already diverged: the desktop copy rendered `item.name[0]`, so every
 * service tag showed a single letter, and neither copy passed a `key`, so
 * React re-used rows across filter changes.
 *
 * One list now, laid out as cards that reflow. The province filter is a
 * column beside it from lg up and a scrolling row of pills below that.
 * Search was also desktop-hidden, on the page whose whole purpose is
 * finding one centre in a long list.
 */
function ServiceAgencyPage() {
  const { toastError } = useCustomToast();
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ location_pk: "" });
  const [rows, setRows] = useState([]);
  const [provinces, setProvinces] = useState([]);

  const cardBg = useColorModeValue('white', 'navy.700');
  const cardShadow = useColorModeValue(
    '14px 17px 40px 4px rgba(112, 144, 176, 0.08)',
    '14px 17px 40px 4px rgba(12, 44, 55, 0.18)'
  );
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const mutedColor = useColorModeValue('secondaryGray.700', 'secondaryGray.400');
  const borderColor = useColorModeValue('secondaryGray.100', 'whiteAlpha.100');
  const brandColor = useColorModeValue('brand.500', 'brand.400');
  const activeBg = useColorModeValue('#F2EFFF', 'whiteAlpha.100');
  const hoverBg = useColorModeValue('secondaryGray.300', 'whiteAlpha.50');
  const inputBg = useColorModeValue('transparent', 'navy.800');

  useEffect(() => {
    fetchProvinces();
    fetchData({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = async (params) => {
    setLoading(true);
    const resp = await getServiceAgency(params);
    if (resp.code === RESP_CODES.SUCCESS.code) {
      setRows(resp.data.rows || []);
    } else {
      toastError(resp.message);
    }
    setLoading(false);
  }

  const fetchProvinces = async () => {
    const resp = await getProvinces();
    if (resp.code === RESP_CODES.SUCCESS.code) {
      setProvinces([
        { pk: "", code: "", name: getLangText("TEXT_ALL") },
        ...(resp.data.rows || []).map((row) => ({
          pk: row.location_pk,
          code: row.location_code,
          name: row.location_name,
        })),
      ]);
    } else {
      toastError(resp.message);
    }
  }

  const onSearch = (keyword) => {
    const newFilter = { ...filter, keyword };
    setFilter(newFilter);
    fetchData(newFilter);
  }

  const onChangeProvince = (item) => {
    const newFilter = { ...filter, parent_location_code: item.code, location_pk: item.pk };
    setFilter(newFilter);
    fetchData(newFilter);
  }

  // Compared as text: the "all" sentinel is "" and the province keys come
  // back from the API as numbers.
  const isActiveProvince = (item) => String(item.pk) === String(filter.location_pk);

  /**
   * The services a centre offers, as chips.
   *
   * `business` is indexed rather than coerced to a string first: the API
   * has sent it both as "1010" and as [1, 0, 1, 0], and stringifying the
   * array would insert commas and shift every index.
   */
  const renderBusinessTags = (row) => (
    AGENCY_BUSINESS
      .filter((item) => !!row.business && +row.business[item.id] === 1)
      .map((item) => (
        <Tag
          key={item.id}
          size="sm"
          borderRadius="10px"
          colorScheme={item.color}
          fontSize="xs"
        >
          {item.name}
        </Tag>
      ))
  );

  const renderAgency = (row, index) => (
    <AnimationScroll key={row.agency_pk || index} type="top" delay={Math.min(index, 6) * 0.04}>
      <Flex
        direction="column"
        bg={cardBg}
        boxShadow={cardShadow}
        borderRadius="20px"
        p={{ base: '18px', md: '22px' }}
        mb="14px"
      >
        <Text fontSize={{ base: 'md', md: 'lg' }} fontWeight="700" color={textColor} mb="10px">
          {row.agency_name}
        </Text>

        <Flex direction={{ base: 'column', sm: 'row' }} gridGap={{ base: '6px', sm: '24px' }} mb="12px">
          <Flex align="center" minW="0">
            <Icon as={FiMapPin} boxSize="14px" color={mutedColor} me="8px" flexShrink={0} />
            <Text fontSize="sm" color={mutedColor} noOfLines={1}>{row.location_name}</Text>
          </Flex>
          <Flex align="center" minW="0">
            <Icon as={FiPhone} boxSize="14px" color={mutedColor} me="8px" flexShrink={0} />
            {/* A phone number is the one thing a visitor came here to use,
                so it dials on a phone rather than being plain text. */}
            <Text
              as="a"
              href={`tel:${String(row.phone_numbers || '').split(/[,/]/)[0].trim()}`}
              fontSize="sm"
              color={mutedColor}
              _hover={{ color: brandColor }}
              noOfLines={1}
            >
              {row.phone_numbers}
            </Text>
          </Flex>
        </Flex>

        <Flex wrap="wrap" gridGap="6px">
          {renderBusinessTags(row)}
        </Flex>
      </Flex>
    </AnimationScroll>
  );

  const renderProvinceColumn = () => (
    <Box
      display={{ base: 'none', lg: 'block' }}
      w="240px"
      flexShrink={0}
      bg={cardBg}
      boxShadow={cardShadow}
      borderRadius="20px"
      p="12px"
      alignSelf="flex-start"
      position="sticky"
      top="90px"
      maxH="calc(100vh - 130px)"
      overflowY="auto"
    >
      <Text fontSize="xs" fontWeight="700" color={mutedColor} px="10px" py="8px" textTransform="uppercase" letterSpacing="0.6px">
        {getLangText('AGENCY_PROVINCE')}
      </Text>
      {provinces.map((item) => (
        <Box
          key={`${item.pk}-${item.code}`}
          as="button"
          type="button"
          w="100%"
          textAlign="left"
          px="10px"
          py="9px"
          borderRadius="12px"
          fontSize="sm"
          fontWeight={isActiveProvince(item) ? '700' : '500'}
          color={isActiveProvince(item) ? brandColor : textColor}
          bg={isActiveProvince(item) ? activeBg : 'transparent'}
          _hover={{ bg: isActiveProvince(item) ? activeBg : hoverBg }}
          onClick={() => onChangeProvince(item)}
        >
          {item.name}
        </Box>
      ))}
    </Box>
  );

  const renderProvincePills = () => (
    <Flex
      display={{ base: 'flex', lg: 'none' }}
      align="center"
      gridGap="8px"
      overflowX="auto"
      className="global-scroll-x"
      pb="6px"
      mb="16px"
    >
      {provinces.map((item) => (
        <Box
          key={`${item.pk}-${item.code}`}
          as="button"
          type="button"
          flex="0 0 auto"
          px="16px"
          h="36px"
          borderRadius="18px"
          borderWidth="1px"
          borderColor={isActiveProvince(item) ? 'transparent' : borderColor}
          bg={isActiveProvince(item) ? brandColor : cardBg}
          color={isActiveProvince(item) ? 'white' : textColor}
          fontSize="sm"
          fontWeight="600"
          onClick={() => onChangeProvince(item)}
        >
          {item.name}
        </Box>
      ))}
    </Flex>
  );

  return (
    <Box pb="60px">
      <SiteContainer pt={{ base: '20px', md: '32px' }}>
        <Flex
          direction={{ base: 'column', md: 'row' }}
          align={{ base: 'flex-start', md: 'flex-end' }}
          justify="space-between"
          gridGap="16px"
          mb={{ base: '18px', md: '24px' }}
        >
          <Box>
            <Text fontSize={{ base: 'xl', md: '2xl' }} fontWeight="800" color={textColor}>
              {getLangText('AGENCY_TITLE')}
            </Text>
            <Text fontSize="sm" color={mutedColor} mt="4px">
              {getLangText('AGENCY_SUBTITLE')}
            </Text>
          </Box>

          <SearchBar
            placeholder={getLangText('PLACEHOLDER_SEARCH')}
            onSearch={onSearch}
            background={inputBg}
            disabled={loading}
            w={{ base: '100%', md: '320px' }}
          />
        </Flex>

        {renderProvincePills()}

        <Flex align="flex-start" gridGap="24px">
          {renderProvinceColumn()}

          <Box flex="1" minW="0">
            {loading ? (
              Array.from({ length: SKELETON_ROWS }).map((_, index) => (
                <Box key={`sk-${index}`} bg={cardBg} boxShadow={cardShadow} borderRadius="20px" p="22px" mb="14px">
                  <SkeletonText noOfLines={3} spacing="12px" skeletonHeight="12px" />
                </Box>
              ))
            ) : !rows.length ? (
              <Box bg={cardBg} boxShadow={cardShadow} borderRadius="20px" py="48px" textAlign="center" fontSize="sm" color={mutedColor}>
                {getLangText('AGENCY_EMPTY')}
              </Box>
            ) : rows.map(renderAgency)}
          </Box>
        </Flex>
      </SiteContainer>
    </Box>
  );
}

export default ServiceAgencyPage;
