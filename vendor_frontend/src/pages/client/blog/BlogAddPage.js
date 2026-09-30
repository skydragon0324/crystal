import React, { useMemo, useRef, useState } from 'react'
import { NavLink, useHistory } from 'react-router-dom';
import {
  Box, Button, Flex, FormControl, FormErrorMessage, FormLabel, Input, Text,
  useColorModeValue,
} from '@chakra-ui/react'
import { Field, Form, Formik } from 'formik';
import { object as YupObject, string as YupString } from 'yup';
import SiteContainer from 'components/Layout/SiteContainer';
import SelectField from 'components/Select/SelectField';
import TextEditor from 'components/Editor/TextEditor';
import useCustomToast from 'hooks/useCustomToast';
import { addArticle } from 'api/client/blogApi';
import { checkTextEmpty, checkHello } from 'utils/utils';
import { RESP_CODES } from 'constants/responseCodes';
import { getLangText } from 'lang/lang';
import useLang from 'lang/useLang';
import { BLOG_OLD_CATEGORIES } from 'constants/constants'

/** The `state` the API expects for each of the two submit buttons. */
const STATE_SUBMIT = -1;
const STATE_DRAFT = -2;

/**
 * Compose a blog article, or a reply to one.
 *
 * The draft button was broken. It set `state` to -2 with a `useState`
 * setter in its onClick and relied on that value being readable by the
 * submit handler that ran moments later in the same event - but a state
 * update is not visible until the next render, so the handler always sent
 * whatever the previous submit had left behind. The first "Save draft" of
 * a session published the article. The intent is held in a ref now, which
 * updates synchronously.
 *
 * A successful save also did nothing but raise a toast, leaving the
 * visitor on a form full of the text they had just submitted with no
 * indication of where it went. It returns to the list.
 *
 * The category picker was a fixed 30%-wide column of rows, so on a phone
 * the form beside it was 60% of a small screen. It is a searchable select
 * above the form now, which is the same control the rest of the site uses.
 */
function BlogAddPage(props) {
  const { match } = props;
  const history = useHistory();
  const { locale } = useLang();
  const { toastSuccess, toastError } = useCustomToast();

  const parent = +match.params.parent;
  const [categoryId, setCategoryId] = useState(null);

  // Which button was pressed. A ref rather than state: the submit handler
  // reads it in the same event that sets it.
  const intentRef = useRef(STATE_SUBMIT);

  const cardBg = useColorModeValue('white', 'navy.700');
  const cardShadow = useColorModeValue(
    '14px 17px 40px 4px rgba(112, 144, 176, 0.08)',
    '14px 17px 40px 4px rgba(12, 44, 55, 0.18)'
  );
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const mutedColor = useColorModeValue('secondaryGray.700', 'secondaryGray.400');
  const borderColor = useColorModeValue('secondaryGray.100', 'whiteAlpha.100');

  /*
   * The category list is two levels deep - "Products" carries the phone,
   * TV and computer sub-categories - so it is flattened into one list with
   * the children indented, rather than hiding the sub-categories behind a
   * second click the old row list never offered.
   */
  const categoryOptions = useMemo(() => {
    const options = [];
    BLOG_OLD_CATEGORIES.forEach((item) => {
      options.push({ value: item.id, label: item.name });
      (item.sub_categories || []).forEach((sub) => {
        options.push({ value: sub.id, label: `— ${sub.name}` });
      });
    });
    return options;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  const onSubmit = async (values, { setSubmitting }) => {
    if (checkTextEmpty(values.title)) {
      toastError(getLangText("BLOG_REQUIRE_TITLE"));
    } else if (checkTextEmpty(values.origin)) {
      toastError(getLangText("BLOG_REQUIRE_ORIGIN"));
    } else if (checkTextEmpty(values.content)) {
      toastError(getLangText("BLOG_REQUIRE_CONTENT"));
    } else if (checkHello(values.content)) {
      toastError(getLangText("BLOG_REQUIRE_HELLO"));
    } else if (categoryId === null || categoryId === undefined) {
      toastError(getLangText("BLOG_REQUIRE_CATEGORY"));
    } else {
      await onSave({
        parent_pk: +parent,
        title: values.title,
        origin: values.origin,
        content: values.content,
        type: 2,
        subject_id: categoryId,
        state: intentRef.current,
      });
    }
    setSubmitting(false);
  }

  const onSave = async (params) => {
    const resp = await addArticle(params);
    if (resp.code === RESP_CODES.SUCCESS.code) {
      toastSuccess(getLangText("OPERATION_SUCCESS"));
      history.push('/vendor/blog');
    } else {
      toastError(resp.message);
    }
  }

  const validationSchema = YupObject({
    title: YupString().required(getLangText("TEXT_REQUIRED")),
    content: YupString().required(getLangText("TEXT_REQUIRED")),
  });

  const heading = parent === 0
    ? `${getLangText("BLOG_ARTICLE_NEW")} ${getLangText("BLOG_SUBMIT")}`
    : `${getLangText("BLOG_ARTICLE_REPLY")} ${getLangText("BLOG_SUBMIT")}`;

  return (
    <Box pb="60px">
      <SiteContainer pt={{ base: '20px', md: '32px' }} maxW="900px">
        <Text fontSize={{ base: 'xl', md: '2xl' }} fontWeight="800" color={textColor} mb="18px">
          {heading}
        </Text>

        <Box bg={cardBg} boxShadow={cardShadow} borderRadius="20px" p={{ base: '20px', md: '28px' }}>
          <Formik
            initialValues={{ title: "", origin: "", content: "" }}
            validationSchema={validationSchema}
            enableReinitialize={true}
            onSubmit={onSubmit}
          >
            {({ errors, touched, isSubmitting }) => (
              <Form style={{ width: "100%" }}>
                <FormControl mb="20px" isRequired>
                  <FormLabel fontSize="sm" fontWeight="600" color={textColor} ms="4px">
                    {getLangText("TEXT_CATEGORY")}
                  </FormLabel>
                  <SelectField
                    options={categoryOptions}
                    value={categoryId}
                    onChange={setCategoryId}
                    placeholder={getLangText("BLOG_REQUIRE_CATEGORY")}
                    isDisabled={isSubmitting}
                  />
                </FormControl>

                <FormControl isInvalid={errors.title && touched.title} isRequired mb="20px">
                  <FormLabel htmlFor="title" fontSize="sm" fontWeight="600" color={textColor} ms="4px">
                    {getLangText("TEXT_TITLE")}
                  </FormLabel>
                  <Field as={Input} id="title" name="title" type="text" variant="main" fontSize="sm" h="48px" disabled={isSubmitting} />
                  <FormErrorMessage ms="4px">{errors.title}</FormErrorMessage>
                </FormControl>

                <FormControl isInvalid={errors.origin && touched.origin} mb="20px">
                  <FormLabel htmlFor="origin" fontSize="sm" fontWeight="600" color={textColor} ms="4px">
                    {getLangText("BLOG_ORIGIN")}
                  </FormLabel>
                  <Field as={Input} id="origin" name="origin" type="text" variant="main" fontSize="sm" h="48px" disabled={isSubmitting} />
                  <FormErrorMessage ms="4px">{errors.origin}</FormErrorMessage>
                </FormControl>

                <FormControl isInvalid={errors.content && touched.content} isRequired mb="8px">
                  <FormLabel htmlFor="content" fontSize="sm" fontWeight="600" color={textColor} ms="4px">
                    {getLangText("TEXT_CONTENT")}
                  </FormLabel>
                  <Field name="content">
                    {({ field, form }) => (
                      <TextEditor
                        id="content"
                        initialValue={""}
                        onChange={(value) => form.setFieldValue(field.name, value)}
                      />
                    )}
                  </Field>
                  <FormErrorMessage ms="4px">{errors.content}</FormErrorMessage>
                </FormControl>

                <Flex
                  justify="flex-end"
                  wrap="wrap"
                  gridGap="12px"
                  mt="24px"
                  pt="20px"
                  borderTopWidth="1px"
                  borderColor={borderColor}
                >
                  <Button
                    as={NavLink}
                    to="/vendor/blog"
                    variant="light"
                    borderRadius="14px"
                    h="46px"
                    fontSize="sm"
                    color={mutedColor}
                  >
                    {getLangText("BLOG_TO_LIST")}
                  </Button>
                  <Button
                    type="submit"
                    variant="lightBrand"
                    borderRadius="14px"
                    h="46px"
                    fontSize="sm"
                    isLoading={isSubmitting}
                    onClick={() => { intentRef.current = STATE_DRAFT; }}
                  >
                    {getLangText("BLOG_SAVE_DRAFT")}
                  </Button>
                  <Button
                    type="submit"
                    variant="brand"
                    borderRadius="14px"
                    h="46px"
                    fontSize="sm"
                    isLoading={isSubmitting}
                    onClick={() => { intentRef.current = STATE_SUBMIT; }}
                  >
                    {getLangText("BLOG_SUBMIT")}
                  </Button>
                </Flex>
              </Form>
            )}
          </Formik>
        </Box>
      </SiteContainer>
    </Box>
  );
}

export default BlogAddPage;
