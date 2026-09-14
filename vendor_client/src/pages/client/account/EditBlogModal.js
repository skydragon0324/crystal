import React, { useRef, useEffect, useState } from 'react';
import SelectField from 'components/Select/SelectField';
import { AlertDialog, AlertDialogBody, AlertDialogCloseButton, AlertDialogContent, AlertDialogHeader, AlertDialogOverlay, Flex, Text, FormControl, FormErrorMessage, FormLabel, Input, Button } from '@chakra-ui/react';
import { Field, Form, Formik } from 'formik';
import { object as YupObject, string as YupString } from 'yup';
import TextEditor from 'components/Editor/TextEditor';
import { getBlogContent } from 'api/client/accountApi';
import { getLangText } from 'lang/lang';
import { RESP_CODES } from 'constants/responseCodes';
import { BLOG_OLD_CATEGORIES } from 'constants/constants';

const EditBlogModal = (props) => {
  const { isOpen, onClose, title = "", formData, closeButton = true, onSave, ...rest } = props;
  const cancelRef = useRef();
  const [lob, setLob] = useState();
  const [loading, setLoading] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState([]);

  useEffect(() => {
    if (isOpen && formData) {
      fetchData(formData);
      // SelectField keys options on `value`. The empty entry also carried
      // its key as `pk` rather than `id`, so it never matched the current
      // field value and "(none)" could not show as selected.
      const options = BLOG_OLD_CATEGORIES.map(row => ({
        value: row.id,
        label: row.name,
      }));
      setCategoryOptions([
        { value: "", label: `(${getLangText("TEXT_NONE")})` },
        ...options,
      ]);
    }
  }, [isOpen, formData])

  const fetchData = async (formData) => {
    setLoading(true);
    const params = {
      blog_pk: formData.id,
    };
    const resp = await getBlogContent(params);
    if (resp.code === RESP_CODES.SUCCESS.code) {
      setLob({
        ...formData,
        ...resp.data.row,
      });
    } else {
      // setErrText(resp.message);
    }
    setLoading(false);
  }

  if (!lob || loading) {
    return <Text></Text>;
  }

  const onSubmit = (values, { setSubmitting }) => {
    setSubmitting(false);
    onSave({ key: formData.key, blog_pk: formData.key, title: values.title, content: values.content, origin: values.origin, subject_id: +values.subjectId });
  }

  const initialValues = {
    title: lob?.title || "",
    content: lob?.content || "",
    origin: lob?.origin || "",
    subjectId: lob?.subject_id || "",
  };

  const validationSchema = YupObject({
    title: YupString().required(getLangText("TEXT_REQUIRED")),
    content: YupString().required(getLangText("TEXT_REQUIRED")),
  });

  return (
    <AlertDialog
      motionPreset="slideInBottom"
      leastDestructiveRef={cancelRef}
      isCentered
      closeOnOverlayClick={false}
      isOpen={isOpen}
      onClose={onClose}
      {...rest}
    >
      <AlertDialogOverlay />
      <AlertDialogContent maxW="1080px">
        {!!title && (
          <AlertDialogHeader fontSize="lg" fontWeight="bold">
            {title}
          </AlertDialogHeader>
        )}
        {closeButton && (
          <AlertDialogCloseButton />
        )}
        <AlertDialogBody mt={!!title ? "" : "3"}>
          <Formik
            initialValues={initialValues}
            validationSchema={validationSchema}
            enableReinitialize={true}
            onSubmit={onSubmit}
          >
            {({ errors, touched, isSubmitting }) => (
              <Form>
                <FormControl mt="13px" isInvalid={errors.subjectId && touched.subjectId}>
                  <FormLabel htmlFor="subjectId" fontSize="sm" fontWeight="normal">{getLangText("BLOG_SUBJECT")}</FormLabel>
                  <Field name="subjectId">
                    {({ field, form }) => (
                      <Flex direction="column" width={"100%"}>
                        <SelectField
                          w="100%"
                          options={categoryOptions}
                          value={field.value === undefined ? "" : field.value}
                          onChange={(value) => form.setFieldValue(field.name, value)}
                          isSearchable
                          isClearable={false}
                        />
                      </Flex>
                    )}
                  </Field>
                  <FormErrorMessage>{errors.subjectId}</FormErrorMessage>
                </FormControl>
                <FormControl isInvalid={errors.title && touched.title} mt={"12px"} isRequired>
                  <FormLabel htmlFor="title" fontSize="sm" fontWeight="normal">{getLangText("TEXT_TITLE")}</FormLabel>
                  <Field as={Input} id="title" name="title" type="text" variant="outline" fontSize="sm" size="md" placeholder="" disabled={isSubmitting} />
                  <FormErrorMessage>{errors.title}</FormErrorMessage>
                </FormControl>
                <FormControl isInvalid={errors.origin && touched.origin} mt={"12px"}>
                  <FormLabel htmlFor="origin" fontSize="sm" fontWeight="normal">{getLangText("BLOG_ORIGIN")}</FormLabel>
                  <Field as={Input} id="origin" name="origin" type="text" variant="outline" fontSize="sm" size="md" placeholder="" disabled={isSubmitting} />
                  <FormErrorMessage>{errors.origin}</FormErrorMessage>
                </FormControl>
                <FormControl isInvalid={errors.content && touched.content} mt="12px">
                  <FormLabel htmlFor="content" fontSize="sm" fontWeight="normal">{getLangText("TEXT_CONTENT")}</FormLabel>
                  <Field name="content">
                    {({ field, form }) => (
                      <TextEditor
                        id="content"
                        initialValue={lob?.content}
                        onChange={e => form.setFieldValue(field.name, e)}
                        disabled={isSubmitting}
                      />
                    )}
                  </Field>
                  <FormErrorMessage>{errors.content}</FormErrorMessage>
                </FormControl>
                <Flex justify={"center"} mt={"30px"}>
                  <Button type='submit'>{getLangText("TEXT_SAVE")}</Button>
                </Flex>
              </Form>
            )}
          </Formik>
        </AlertDialogBody>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default EditBlogModal;
