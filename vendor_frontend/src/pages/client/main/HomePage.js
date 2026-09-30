import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Button, Flex, Icon, SimpleGrid, Skeleton, SkeletonText, Text,
  useColorModeValue,
} from '@chakra-ui/react';
import { NavLink } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { FiArrowRight } from 'react-icons/fi';
import AppImage from 'components/Frame/AppImage';
import HeroCarousel from 'components/Carousel/HeroCarousel';
import ProductCard from 'components/Product/ProductCard';
import SiteContainer from 'components/Layout/SiteContainer';
import { getProducts } from 'api/client/clientPhoneApi';
import { getBlogArticles } from 'api/client/blogApi';
import { RESP_CODES } from 'constants/responseCodes';
import {
  getHomeHeroSlides, getHomePromos, getHomeShortcuts, getHomeValueProps,
} from 'constants/homeContent';
import { getLangText } from 'lang/lang';
import useLang from 'lang/useLang';

const FEATURED_COUNT = 5;
const BLOG_COUNT = 3;

/**
 * The landing page.
 *
 * There was not one. PAGE_HOME_URL pointed at the phone catalogue, so the
 * logo, the root redirect and both logout handlers all dropped the visitor
 * straight into a product grid with no context - and before that it
 * pointed at "/vendor/home", which had no route at all and rendered blank.
 *
 * Structure follows mi.com/global: an advertising deck, category
 * shortcuts, a featured strip pulled from the live catalogue, editorial
 * promos, the service promises, and recent writing. Everything sits in the
 * same centred column as the header and footer.
 *
 * Both network sections degrade rather than fail. A products call that
 * errors leaves the featured strip out entirely instead of showing an
 * error where a shop window should be; the page is still a page.
 */
const HomePage = () => {
  const { locale } = useLang();
  const user = useSelector((state) => state.client.user);

  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [articles, setArticles] = useState([]);
  const [articlesLoading, setArticlesLoading] = useState(true);

  const cardBg = useColorModeValue('white', 'navy.700');
  const cardShadow = useColorModeValue(
    '14px 17px 40px 4px rgba(112, 144, 176, 0.08)',
    '14px 17px 40px 4px rgba(12, 44, 55, 0.18)'
  );
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const mutedColor = useColorModeValue('secondaryGray.700', 'secondaryGray.400');
  const brandColor = useColorModeValue('brand.500', 'brand.400');
  const shortcutBg = useColorModeValue('white', 'navy.800');
  const shortcutIconBg = useColorModeValue('#F2EFFF', 'whiteAlpha.100');
  const borderColor = useColorModeValue('secondaryGray.100', 'whiteAlpha.100');

  const slides = useMemo(getHomeHeroSlides, [locale]);
  const shortcuts = useMemo(getHomeShortcuts, [locale]);
  const promos = useMemo(getHomePromos, [locale]);
  const valueProps = useMemo(getHomeValueProps, [locale]);

  useEffect(() => {
    let cancelled = false;

    const fetchProducts = async () => {
      const resp = await getProducts();
      if (cancelled) return;
      if (resp.code === RESP_CODES.SUCCESS.code) {
        setProducts((resp.data.rows || []).slice(0, FEATURED_COUNT));
      }
      setProductsLoading(false);
    };

    const fetchArticles = async () => {
      const resp = await getBlogArticles({
        offset: 0,
        limit: BLOG_COUNT,
        sortKey: 'publish_at',
        sortDir: 'desc',
      });
      if (cancelled) return;
      if (resp.code === RESP_CODES.SUCCESS.code) {
        setArticles(resp.data.rows || []);
      }
      setArticlesLoading(false);
    };

    fetchProducts();
    fetchArticles();

    return () => { cancelled = true; };
  }, []);

  /* ---------------- pieces ---------------- */

  const SectionHeading = ({ title, subtitle, action }) => (
    <Flex
      align={{ base: 'flex-start', md: 'flex-end' }}
      justify="space-between"
      direction={{ base: 'column', md: 'row' }}
      gridGap="8px"
      mb={{ base: '16px', md: '22px' }}
    >
      <Box>
        <Text fontSize={{ base: 'xl', md: '2xl' }} fontWeight="800" color={textColor}>
          {title}
        </Text>
        {subtitle ? (
          <Text fontSize="sm" color={mutedColor} mt="4px">{subtitle}</Text>
        ) : null}
      </Box>
      {action}
    </Flex>
  );

  const seeAllLink = (to) => (
    <Flex
      as={NavLink}
      to={to}
      align="center"
      fontSize="sm"
      fontWeight="600"
      color={brandColor}
      _hover={{ textDecoration: 'underline' }}
    >
      {getLangText('HOME_SEE_ALL')}
      <Icon as={FiArrowRight} ms="6px" boxSize="14px" />
    </Flex>
  );

  const renderShortcut = (item) => {
    const inner = (
      <Flex
        direction="column"
        align="center"
        justify="center"
        h="100%"
        bg={shortcutBg}
        borderRadius="18px"
        borderWidth="1px"
        borderColor={borderColor}
        py="18px"
        px="10px"
        transition="transform .18s ease, border-color .18s ease"
        _hover={{ transform: 'translateY(-3px)', borderColor: brandColor }}
      >
        <Flex
          align="center"
          justify="center"
          w="44px"
          h="44px"
          borderRadius="14px"
          bg={shortcutIconBg}
          mb="10px"
        >
          <Icon as={item.icon} boxSize="20px" color={brandColor} />
        </Flex>
        <Text fontSize="sm" fontWeight="600" color={textColor} textAlign="center" noOfLines={1}>
          {item.name}
        </Text>
      </Flex>
    );

    // The shop, app store and eproduct portal are separate applications;
    // a router link would push a route this SPA does not have.
    return item.external ? (
      <Box as="a" key={item.key} href={item.path} h="100%">{inner}</Box>
    ) : (
      <Box as={NavLink} key={item.key} to={item.path} h="100%">{inner}</Box>
    );
  };

  const renderPromo = (promo) => {
    // A promo that lands inside the account area is useless signed out -
    // it would bounce to a sign-in screen. It points at the public help
    // page instead until there is a session.
    const to = promo.auth && !user ? '/vendor/phone/faqs' : promo.path;

    return (
      <Flex
        as={NavLink}
        to={to}
        key={promo.key}
        direction="column"
        bg={cardBg}
        borderRadius="20px"
        boxShadow={cardShadow}
        overflow="hidden"
        h="100%"
        transition="transform .2s ease"
        _hover={{ transform: 'translateY(-4px)' }}
      >
        <AppImage mock={promo.mock} label={promo.title} ratio={16 / 9} objectFit="cover" />
        <Box p="20px">
          <Text fontSize="md" fontWeight="700" color={textColor} mb="6px">
            {promo.title}
          </Text>
          <Text fontSize="sm" color={mutedColor} noOfLines={2} mb="12px">
            {promo.body}
          </Text>
          <Flex align="center" fontSize="sm" fontWeight="600" color={brandColor}>
            {getLangText('HOME_PROMO_CTA')}
            <Icon as={FiArrowRight} ms="6px" boxSize="14px" />
          </Flex>
        </Box>
      </Flex>
    );
  };

  const renderArticle = (article) => (
    <Flex
      as={NavLink}
      to={`/vendor/blog/${article.id}`}
      key={article.id}
      direction="column"
      bg={cardBg}
      borderRadius="20px"
      boxShadow={cardShadow}
      p="22px"
      h="100%"
      transition="transform .2s ease"
      _hover={{ transform: 'translateY(-4px)' }}
    >
      <Text fontSize="md" fontWeight="700" color={textColor} noOfLines={2} mb="8px">
        {article.title}
      </Text>
      <Text fontSize="sm" color={mutedColor} noOfLines={3} mb="16px">
        {article.summary}
      </Text>
      <Flex align="center" justify="space-between" mt="auto">
        <Text fontSize="xs" color={mutedColor} noOfLines={1}>
          {article.user_userid}
        </Text>
        <Flex align="center" fontSize="sm" fontWeight="600" color={brandColor}>
          {getLangText('HOME_BLOG_READ')}
          <Icon as={FiArrowRight} ms="6px" boxSize="14px" />
        </Flex>
      </Flex>
    </Flex>
  );

  const renderCardSkeletons = (count, withImage) => (
    Array.from({ length: count }).map((_, index) => (
      <Box key={`sk-${index}`} bg={cardBg} borderRadius="20px" boxShadow={cardShadow} p={withImage ? '14px' : '22px'}>
        {withImage ? <Skeleton borderRadius="14px" paddingBottom="100%" /> : null}
        <SkeletonText mt={withImage ? '14px' : '0'} noOfLines={3} spacing="10px" skeletonHeight="10px" />
      </Box>
    ))
  );

  /* ---------------- page ---------------- */

  return (
    <Box pb="64px">
      <SiteContainer pt={{ base: '0px', md: '20px' }}>
        <HeroCarousel slides={slides} interval={5500} ariaLabel={getLangText('HOME_HERO_LABEL')} />
      </SiteContainer>

      {/* ---- category shortcuts ---- */}
      <SiteContainer mt={{ base: '24px', md: '36px' }}>
        <SimpleGrid columns={{ base: 3, md: 6 }} spacing={{ base: '10px', md: '16px' }}>
          {shortcuts.map(renderShortcut)}
        </SimpleGrid>
      </SiteContainer>

      {/* ---- featured products ---- */}
      <SiteContainer mt={{ base: '40px', md: '56px' }}>
        <SectionHeading
          title={getLangText('HOME_FEATURED_TITLE')}
          subtitle={getLangText('HOME_FEATURED_SUB')}
          action={seeAllLink('/vendor/phone/products')}
        />

        {productsLoading ? (
          <SimpleGrid columns={{ base: 2, md: 3, lg: 5 }} spacing={{ base: '12px', md: '20px' }}>
            {renderCardSkeletons(FEATURED_COUNT, true)}
          </SimpleGrid>
        ) : products.length ? (
          <SimpleGrid columns={{ base: 2, md: 3, lg: 5 }} spacing={{ base: '12px', md: '20px' }}>
            {products.map((row) => <ProductCard key={row.product_pk} row={row} />)}
          </SimpleGrid>
        ) : (
          <Box bg={cardBg} borderRadius="20px" boxShadow={cardShadow} py="40px" textAlign="center" fontSize="sm" color={mutedColor}>
            {getLangText('HOME_FEATURED_EMPTY')}
          </Box>
        )}
      </SiteContainer>

      {/* ---- promos ---- */}
      <SiteContainer mt={{ base: '40px', md: '56px' }}>
        <SectionHeading title={getLangText('HOME_PROMO_TITLE')} />
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={{ base: '16px', md: '20px' }}>
          {promos.map(renderPromo)}
        </SimpleGrid>
      </SiteContainer>

      {/* ---- service promises ---- */}
      <SiteContainer mt={{ base: '40px', md: '56px' }}>
        <SimpleGrid
          columns={{ base: 2, lg: 4 }}
          spacing="0px"
          bg={cardBg}
          borderRadius="20px"
          boxShadow={cardShadow}
          overflow="hidden"
        >
          {valueProps.map((item, index) => (
            <Flex
              key={item.key}
              align="center"
              px={{ base: '16px', md: '22px' }}
              py="22px"
              // Hairlines between the cells rather than gaps, so the four
              // read as one bar. The last cell in each row has no rule.
              borderRightWidth={{ base: index % 2 === 0 ? '1px' : '0', lg: index < 3 ? '1px' : '0' }}
              borderTopWidth={{ base: index > 1 ? '1px' : '0', lg: '0' }}
              borderColor={borderColor}
            >
              <Icon as={item.icon} boxSize="22px" color={brandColor} me="14px" flexShrink={0} />
              <Box minW="0">
                <Text fontSize="sm" fontWeight="700" color={textColor} noOfLines={1}>
                  {item.title}
                </Text>
                <Text fontSize="xs" color={mutedColor} noOfLines={1}>
                  {item.body}
                </Text>
              </Box>
            </Flex>
          ))}
        </SimpleGrid>
      </SiteContainer>

      {/* ---- from the blog ---- */}
      <SiteContainer mt={{ base: '40px', md: '56px' }}>
        <SectionHeading
          title={getLangText('HOME_BLOG_TITLE')}
          subtitle={getLangText('HOME_BLOG_SUB')}
          action={seeAllLink('/vendor/blog')}
        />

        {articlesLoading ? (
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={{ base: '16px', md: '20px' }}>
            {renderCardSkeletons(BLOG_COUNT, false)}
          </SimpleGrid>
        ) : articles.length ? (
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={{ base: '16px', md: '20px' }}>
            {articles.map(renderArticle)}
          </SimpleGrid>
        ) : (
          <Box bg={cardBg} borderRadius="20px" boxShadow={cardShadow} py="40px" textAlign="center" fontSize="sm" color={mutedColor}>
            {getLangText('HOME_BLOG_EMPTY')}
          </Box>
        )}
      </SiteContainer>

      {/* ---- closing call to action ---- */}
      <SiteContainer mt={{ base: '40px', md: '56px' }}>
        <Flex
          direction={{ base: 'column', md: 'row' }}
          align={{ base: 'flex-start', md: 'center' }}
          justify="space-between"
          gridGap="20px"
          borderRadius="24px"
          px={{ base: '24px', md: '44px' }}
          py={{ base: '30px', md: '40px' }}
          bgGradient="linear(to-r, brand.500, brand.900)"
        >
          <Box maxW="560px">
            <Text fontSize={{ base: 'xl', md: '2xl' }} fontWeight="800" color="white" mb="6px">
              {getLangText('HOME_CTA_TITLE')}
            </Text>
            <Text fontSize="sm" color="whiteAlpha.900">
              {getLangText('HOME_CTA_BODY')}
            </Text>
          </Box>

          <Flex gridGap="12px" flexShrink={0} wrap="wrap">
            <Button
              as={NavLink}
              to="/vendor/phone/products"
              bg="white"
              color="brand.500"
              _hover={{ bg: 'whiteAlpha.900' }}
              _active={{ bg: 'whiteAlpha.800' }}
              borderRadius="16px"
              h="46px"
              px="24px"
              fontSize="sm"
              fontWeight="700"
            >
              {getLangText('HOME_CTA_PRIMARY')}
            </Button>
            <Button
              as={NavLink}
              to="/vendor/phone/faqs"
              variant="outline"
              color="white"
              borderColor="whiteAlpha.700"
              _hover={{ bg: 'whiteAlpha.200' }}
              _active={{ bg: 'whiteAlpha.300' }}
              borderRadius="16px"
              h="46px"
              px="24px"
              fontSize="sm"
              fontWeight="700"
            >
              {getLangText('HOME_CTA_SECONDARY')}
            </Button>
          </Flex>
        </Flex>
      </SiteContainer>
    </Box>
  );
};

export default HomePage;
