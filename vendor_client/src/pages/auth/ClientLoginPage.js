import React, { useEffect, useState } from 'react';
import {
  Box, Button, Flex, FormControl, FormErrorMessage, FormLabel, Icon, IconButton,
  Image, Input, InputGroup, InputRightElement, Text, useColorModeValue,
} from '@chakra-ui/react';
import { ViewIcon, ViewOffIcon } from '@chakra-ui/icons';
import { FiArrowLeft, FiCheck } from 'react-icons/fi';
import { NavLink, useHistory } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Field, Form, Formik } from 'formik';
import { object as YupObject, string as YupString } from 'yup';
import AppImage from 'components/Frame/AppImage';
import { loginRequest } from 'store/slices/clientSlice';
import { RESP_CODES } from 'constants/responseCodes';
import { PAGE_HOME_URL } from 'constants/constants';
import useCustomToast from 'hooks/useCustomToast';
import { getLangText } from 'lang/lang';
import { mockPhotoUrl } from 'utils/mockImage';

import icLogoDark from 'assets/images/logo_dark.png';
import icLogoWhite from 'assets/images/logo_white.png';

const ASIDE_POINTS = ['LOGIN_ASIDE_POINT_1', 'LOGIN_ASIDE_POINT_2', 'LOGIN_ASIDE_POINT_3'];

/**
 * Sign in.
 *
 * Laid out the way the Horizon sign-in template is: a centred form column
 * with the brand panel beside it from lg up, and the panel dropped rather
 * than stacked below lg - on a phone it would be a screen of decoration
 * standing between the visitor and the two fields they came for.
 *
 * What changed from the previous version, beyond the styling:
 *
 *   - the card was a 445px box with `mx={{ base: "100px" }}`, which on a
 *     375px phone left it 175px wide. It is fluid now with a max width.
 *   - the password field had no reveal, and the only way to check a typo
 *     was to clear and retype.
 *   - `bgForm` and `textColor` were read through useColorModeValue but the
 *     layout forced light mode on every mount, so the dark values were
 *     unreachable. Both modes are real now.
 */
const ClientLoginPage = () => {
  const history = useHistory();
  const dispatch = useDispatch();
  const { toastError } = useCustomToast();
  const { isAuthenticated, error, user } = useSelector((state) => state.client);

  const [showPassword, setShowPassword] = useState(false);

  const cardBg = useColorModeValue('white', 'navy.800');
  const cardShadow = useColorModeValue(
    '0px 18px 40px rgba(112, 144, 176, 0.16)',
    '0px 18px 40px rgba(0, 0, 0, 0.35)'
  );
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const mutedColor = useColorModeValue('secondaryGray.700', 'secondaryGray.400');
  const labelColor = useColorModeValue('secondaryGray.900', 'gray.200');
  const linkColor = useColorModeValue('brand.500', 'brand.400');
  const icLogo = useColorModeValue(icLogoDark, icLogoWhite);

  useEffect(() => {
    if (isAuthenticated) {
      history.push(user.default_page || '/vendor/account/eshop/orders');
    } else if (error?.code === RESP_CODES.NOT_FOUND.code) {
      toastError(getLangText('USER_ERR_NO_USERID'));
    } else if (error?.code === RESP_CODES.UNAUTHORIZED.code) {
      toastError(getLangText('PASSWORD_MISMATCH'));
    } else if (error) {
      toastError(getLangText('OPERATION_FAIL'));
    }
  }, [isAuthenticated, error, user, history, toastError]);

  const handleLogin = (params) => {
    dispatch(loginRequest(params));
  };

  const validationSchema = YupObject({
    userId: YupString().required(getLangText('TEXT_REQUIRED')),
    password: YupString()
      .min(3, getLangText('PASSWORD_ERR_MIN_LEN', { min: 3 }))
      .required(getLangText('TEXT_REQUIRED')),
  });

  /* ---------------- brand panel ---------------- */

  const renderAside = () => (
    <Box
      display={{ base: 'none', lg: 'block' }}
      position="relative"
      flex="1"
      minH="100%"
      borderRadius="24px"
      overflow="hidden"
    >
      <AppImage
        fill
        src=""
        mock={mockPhotoUrl('vendor-signin', { width: 900, height: 1100 })}
        label={getLangText('LOGIN_ASIDE_TITLE')}
        objectFit="cover"
        skeleton={false}
      />

      {/* Brand wash over the photograph, so the copy has a consistent
          ground no matter which picture the mock host returns. */}
      <Box
        position="absolute"
        top="0"
        left="0"
        w="100%"
        h="100%"
        bgGradient="linear(to-br, rgba(66, 42, 251, 0.92), rgba(17, 4, 122, 0.86))"
      />

      <Flex
        position="absolute"
        top="0"
        left="0"
        w="100%"
        h="100%"
        direction="column"
        justify="flex-end"
        p="44px"
      >
        <Text fontSize="30px" fontWeight="800" color="white" lineHeight="1.2" mb="12px">
          {getLangText('LOGIN_ASIDE_TITLE')}
        </Text>
        <Text fontSize="md" color="whiteAlpha.900" mb="26px" maxW="380px">
          {getLangText('LOGIN_ASIDE_BODY')}
        </Text>

        {ASIDE_POINTS.map((key) => (
          <Flex key={key} align="center" mb="12px">
            <Flex
              align="center"
              justify="center"
              w="22px"
              h="22px"
              borderRadius="50%"
              bg="whiteAlpha.300"
              me="12px"
              flexShrink={0}
            >
              <Icon as={FiCheck} boxSize="12px" color="white" />
            </Flex>
            <Text fontSize="sm" color="whiteAlpha.900">
              {getLangText(key)}
            </Text>
          </Flex>
        ))}
      </Flex>
    </Box>
  );

  /* ---------------- form ---------------- */

  return (
    <Flex w="100%" minH="100vh" align="center" justify="center" p={{ base: '16px', md: '32px' }}>
      <Flex
        w="100%"
        maxW="1100px"
        minH={{ base: 'auto', lg: '640px' }}
        bg={cardBg}
        boxShadow={cardShadow}
        borderRadius="24px"
        overflow="hidden"
      >
        {/* form column */}
        <Flex
          direction="column"
          justify="center"
          flex={{ base: '1', lg: '0 0 50%' }}
          px={{ base: '24px', md: '48px' }}
          py={{ base: '36px', md: '52px' }}
        >
          <Image src={icLogo} alt={getLangText('COMPANY_NAME')} h="26px" w="auto" alignSelf="flex-start" mb="28px" />

          <Text fontSize={{ base: '26px', md: '32px' }} fontWeight="800" color={textColor} mb="8px">
            {getLangText('LOGIN_TITLE')}
          </Text>
          <Text fontSize="sm" color={mutedColor} mb="28px">
            {getLangText('LOGIN_SUBTITLE')}
          </Text>

          <Formik
            initialValues={{ userId: '', password: '' }}
            validationSchema={validationSchema}
            onSubmit={(values, { setSubmitting }) => {
              handleLogin(values);
              setSubmitting(false);
            }}
          >
            {({ errors, touched, isSubmitting }) => (
              <Form>
                <FormControl isInvalid={errors.userId && touched.userId} mb="20px">
                  <FormLabel htmlFor="userId" fontSize="sm" fontWeight="600" color={labelColor} ms="4px">
                    {getLangText('TEXT_USERID')}
                  </FormLabel>
                  <Field
                    as={Input}
                    id="userId"
                    name="userId"
                    type="text"
                    variant="auth"
                    fontSize="sm"
                    size="lg"
                    h="52px"
                    autoComplete="username"
                  />
                  <FormErrorMessage ms="4px">{errors.userId}</FormErrorMessage>
                </FormControl>

                <FormControl isInvalid={errors.password && touched.password} mb="28px">
                  <FormLabel htmlFor="password" fontSize="sm" fontWeight="600" color={labelColor} ms="4px">
                    {getLangText('TEXT_PASSWORD')}
                  </FormLabel>
                  <InputGroup size="lg">
                    <Field
                      as={Input}
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      variant="auth"
                      fontSize="sm"
                      h="52px"
                      autoComplete="current-password"
                    />
                    <InputRightElement h="52px" me="4px">
                      <IconButton
                        aria-label={getLangText(showPassword ? 'LOGIN_HIDE_PASSWORD' : 'LOGIN_SHOW_PASSWORD')}
                        icon={showPassword ? <ViewOffIcon /> : <ViewIcon />}
                        onClick={() => setShowPassword((current) => !current)}
                        variant="ghost"
                        size="sm"
                        color={mutedColor}
                        // A submit button is the default inside a form, and
                        // this one would sign the visitor in when all they
                        // wanted was to check their typing.
                        type="button"
                        tabIndex={-1}
                      />
                    </InputRightElement>
                  </InputGroup>
                  <FormErrorMessage ms="4px">{errors.password}</FormErrorMessage>
                </FormControl>

                <Button
                  type="submit"
                  variant="brand"
                  w="100%"
                  h="52px"
                  borderRadius="16px"
                  fontSize="sm"
                  fontWeight="700"
                  isLoading={isSubmitting}
                >
                  {getLangText('TEXT_LOGIN')}
                </Button>
              </Form>
            )}
          </Formik>

          <Flex align="center" justify="space-between" mt="24px" gridGap="12px">
            <Flex as={NavLink} to={PAGE_HOME_URL} align="center" color={mutedColor} _hover={{ color: linkColor }}>
              <Icon as={FiArrowLeft} boxSize="14px" me="6px" />
              <Text fontSize="sm">{getLangText('LOGIN_BACK_TO_SITE')}</Text>
            </Flex>
            <Text
              as={NavLink}
              to="/vendor/phone/faqs"
              fontSize="sm"
              color={mutedColor}
              _hover={{ color: linkColor }}
            >
              {getLangText('LOGIN_HELP')}
            </Text>
          </Flex>
        </Flex>

        {renderAside()}
      </Flex>
    </Flex>
  );
}

export default ClientLoginPage;
