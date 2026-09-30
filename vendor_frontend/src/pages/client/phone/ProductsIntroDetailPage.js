import React, { useState } from 'react'
import { Box, Flex, Icon, Text, useColorModeValue } from '@chakra-ui/react'
import { NavLink } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';
import SiteContainer from 'components/Layout/SiteContainer';
import ProductsSpecInfoPage from './ProductsSpecInfoPage';
import ProductsOsHistoryPage from './ProductsOsHistoryPage';
import ProductsIntroImagesPage from './ProductsInroImagesPage';
import ProductsServiceCostPage from './ProductsServiceCostPage';
import { getLangText } from 'lang/lang';

/**
 * Product detail, with the four sections as tabs.
 *
 * The tab bar used to go `position: fixed` past 50px of scroll while
 * keeping its original place in the flow, so the content jumped up by the
 * bar's height the moment it detached - and the bar then overlapped the
 * site header, which is itself sticky. It is an ordinary sticky element
 * now, offset below the header, so it holds its own space and stacks
 * under the header rather than over it.
 *
 * The tab labels came from `detailSubMenus` in constants/intro, which
 * hard-coded English strings outside the catalogue. They are keys now.
 */
const TABS = [
  { id: 0, key: 'DETAIL_TAB_SPEC' },
  { id: 1, key: 'DETAIL_TAB_IMAGE' },
  { id: 2, key: 'DETAIL_TAB_PRICE' },
  { id: 3, key: 'DETAIL_TAB_OS' },
];

function ProductsIntroDetailPage(props) {
  const { match } = props;
  const productPk = match.params.product_pk;
  const [activeId, setActiveId] = useState(0);

  const barBg = useColorModeValue('white', 'navy.800');
  const borderColor = useColorModeValue('secondaryGray.100', 'whiteAlpha.100');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const mutedColor = useColorModeValue('secondaryGray.700', 'secondaryGray.400');
  const brandColor = useColorModeValue('brand.500', 'brand.400');

  const renderTab = (tab) => {
    const isActive = tab.id === activeId;

    return (
      <Box
        key={tab.id}
        as="button"
        type="button"
        onClick={() => setActiveId(tab.id)}
        position="relative"
        flex="0 0 auto"
        px={{ base: '14px', md: '20px' }}
        h="56px"
        fontSize="sm"
        fontWeight={isActive ? '700' : '500'}
        color={isActive ? brandColor : mutedColor}
        transition="color .15s ease"
        _hover={{ color: isActive ? brandColor : textColor }}
        // An underline drawn as a child rather than a border, so the
        // 2px rule does not shift the label by a pixel when it appears.
        _after={isActive ? {
          content: '""',
          position: 'absolute',
          left: '14px',
          right: '14px',
          bottom: '0',
          height: '2px',
          borderRadius: '2px',
          background: 'currentColor',
        } : undefined}
      >
        {getLangText(tab.key)}
      </Box>
    );
  };

  return (
    <Box pb="60px">
      <Box
        position="sticky"
        // Below the site header, which is sticky at 0 and 56/64px tall.
        top={{ base: '56px', md: '64px' }}
        zIndex={900}
        bg={barBg}
        borderBottomWidth="1px"
        borderColor={borderColor}
      >
        <SiteContainer>
          <Flex align="center" justify="space-between" gridGap="16px">
            <Flex
              align="center"
              overflowX="auto"
              className="global-scroll-x"
              flex="1"
              minW="0"
            >
              {TABS.map(renderTab)}
            </Flex>

            <Flex
              as={NavLink}
              to="/vendor/phone/products"
              align="center"
              flexShrink={0}
              fontSize="sm"
              color={mutedColor}
              display={{ base: 'none', md: 'flex' }}
              _hover={{ color: brandColor }}
            >
              <Icon as={FiArrowLeft} boxSize="14px" me="6px" />
              <Text>{getLangText('DETAIL_BACK')}</Text>
            </Flex>
          </Flex>
        </SiteContainer>
      </Box>

      {activeId === 0 ? <ProductsSpecInfoPage productPk={productPk} />
        : activeId === 1 ? <ProductsIntroImagesPage productPk={productPk} />
        : activeId === 2 ? <ProductsServiceCostPage productPk={productPk} />
        : <ProductsOsHistoryPage productPk={productPk} />}
    </Box>
  );
}

export default ProductsIntroDetailPage;
