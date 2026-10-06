import React, { useRef } from 'react';
import { AlertDialog, AlertDialogBody, AlertDialogCloseButton, AlertDialogContent, AlertDialogHeader, AlertDialogOverlay, Button, FormControl, FormErrorMessage, FormLabel, SimpleGrid, Textarea } from '@chakra-ui/react';
import PhoneInput from 'components/Input/PhoneInput';
import { Field, Form, Formik } from 'formik';
import { object as YupObject, string as YupString } from 'yup';
import { sendLicenseErrorReport } from 'api/client/accountApi';
import useCustomToast from 'hooks/useCustomToast';
import { getLangText } from 'lang/lang';
import { RESP_CODES } from 'constants/responseCodes';

const EditEprodErrorReportModal = (props) => {
  const { isOpen, onClose, title = "", formData, closeButton = true, onSuccess, ...rest } = props;
  const cancelRef = useRef();
  const { toastError, toastSuccess } = useCustomToast();

  const onSubmit = async (values, { setSubmitting }) => {
    const params = {
      lic_id: formData?.id,
      phone_number: values.phoneNumber.trim(),
      report: values.report.trim(),
    };
    const resp = await sendLicenseErrorReport(params);
    if (resp.code === RESP_CODES.SUCCESS.code) {
      toastSuccess(getLangText("OPERATION_SUCCESS"));
      onClose();
      onSuccess();
    } else {
      toastError(resp.message);
    }
    setSubmitting(false);
  }

  const initialValues = {
    phoneNumber: "",
    report: "",
  };

  const validationSchema = YupObject({
    phoneNumber: YupString().required(getLangText("TEXT_REQUIRED")),
    report: YupString().required(getLangText("TEXT_REQUIRED")),
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
      <AlertDialogContent>
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
                <FormControl isInvalid={errors.phoneNumber && touched.phoneNumber} isRequired>
                  <FormLabel htmlFor="phoneNumber" fontSize="sm" fontWeight="normal">{getLangText("TEXT_PHONE_NUMBER")}</FormLabel>
                  <Field name="phoneNumber">
                    {({ field, form }) => (
                      <PhoneInput
                        id="phoneNumber"
                        onChange={(e) => form.setFieldValue(field.name, e.target.value)}
                        value={field.value}
                        disabled={isSubmitting}
                      />
                    )}
                  </Field>
                  <FormErrorMessage>{errors.phoneNumber}</FormErrorMessage>
                </FormControl>
                <FormControl isInvalid={errors.report && touched.report} mt="12px">
                  <FormLabel htmlFor="report" fontSize="sm" fontWeight="normal">{getLangText("TEXT_CONTENT")}</FormLabel>
                  <Field as={Textarea} id="report" name="report" type="text" variant="outline" fontSize="sm" size="md" disabled={isSubmitting} />
                  <FormErrorMessage>{errors.report}</FormErrorMessage>
                </FormControl>
                <SimpleGrid columns={{ sm: 1, lg: 2 }} spacing="12px" mt="24px" mb="12px">
                  <Button ref={cancelRef} variant="light" fontSize="14px" onClick={onClose}>{getLangText("TEXT_CANCEL")}</Button>
                  <Button type="submit" variant="dark" fontSize="14px" isLoading={isSubmitting}>{getLangText("TEXT_SAVE")}</Button>
                </SimpleGrid>
              </Form>
            )}
          </Formik>
        </AlertDialogBody>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default EditEprodErrorReportModal;
