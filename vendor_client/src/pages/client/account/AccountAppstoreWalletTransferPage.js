import React, { useState } from 'react'
import { useSelector } from 'react-redux';
import { Box, Button, Flex, FormControl, FormErrorMessage, FormLabel, Input, NumberInput, NumberInputField, Select, useDisclosure } from '@chakra-ui/react'
import { Field, Form, Formik } from 'formik';
import Card from 'components/Card/Card';
import CardBody from 'components/Card/CardBody';
import ConfirmDialog from 'components/Dialog/ConfirmDialog';
import NoPermSection from 'components/Section/NoPermSection';
import { number as YupNumber, object as YupObject, string as YupString } from 'yup';
import { getLangText } from 'lang/lang';
import { APPSTORE_MONEY_TYPE } from 'constants/constants';

const AccountAppstoreWalletTransferPage = () => {
  const { user } = useSelector((state) => state.client);
  const [formData, setFormData] = useState();
  const [loading, setLoading] = useState(false);
  const { isOpen: isOpenTransfer, onOpen: onOpenTransfer, onClose: onCloseTransfer } = useDisclosure();

  const onSubmit = (values, { setSubmitting }) => {
    setSubmitting(false);
    setFormData(values);
    onOpenTransfer();
  }

  const handleTransfer = async () => {
    setLoading(true);
    setLoading(false);
  }

  const initialValues = {
    moneyType: APPSTORE_MONEY_TYPE,
    targetId: "",
    moneyValue: "",
    password: "",
  };

  const validationSchema = YupObject({
    targetId: YupString().required(getLangText("TEXT_REQUIRED")),
    moneyValue: YupNumber().required(getLangText("TEXT_REQUIRED")),
    password: YupString().required(getLangText("TEXT_REQUIRED")),
  });

  if (!user) {
    return <NoPermSection />
  }

  return (
    <Flex w="full" direction="column">
      <Card pb="0px">
        <CardBody>
          <Box w="400px" align="center" justify="center" mt="40px" mb="60px" mx="auto">
            <Formik
              initialValues={initialValues}
              validationSchema={validationSchema}
              enableReinitialize={true}
              onSubmit={onSubmit}
            >
              {({ errors, touched, isSubmitting }) => (
                <Form>
                  <FormControl isInvalid={errors.moneyType && touched.moneyType} isRequired>
                    <FormLabel htmlFor="moneyType" fontSize="sm" fontWeight="normal">{getLangText("APPSTORE_WALLET_TYPE")}</FormLabel>
                    <Field name="moneyType">
                      {({ field, form }) => (
                        <Select
                          {...field}
                          id="moneyType"
                          value={field.value}
                          onChange={e => form.setFieldValue(field.name, +e.target.value)}
                          variant="outline"
                          fontSize="sm"
                          size="md"
                          disabled={isSubmitting || loading}
                        >
                          <option value={APPSTORE_MONEY_TYPE}>{getLangText("APPSTORE_WALLET_MONEY_COMPANY")}</option>
                        </Select>
                      )}
                    </Field>
                    <FormErrorMessage>{errors.moneyType}</FormErrorMessage>
                  </FormControl>
                  <FormControl isInvalid={errors.targetId && touched.targetId} isRequired mt="12px">
                    <FormLabel htmlFor="targetId" fontSize="sm" fontWeight="normal">{getLangText("APPSTORE_WALLET_RECEIVER_ID")}</FormLabel>
                    <Field as={Input} id="targetId" name="targetId" type="text" variant="outline" fontSize="sm" size="md" placeholder="" disabled={isSubmitting || loading} />
                    <FormErrorMessage>{errors.targetId}</FormErrorMessage>
                  </FormControl>
                  <FormControl isInvalid={errors.moneyValue && touched.moneyValue} isRequired mt="12px">
                    <FormLabel htmlFor="moneyValue" fontSize="sm" fontWeight="normal">{getLangText("APPSTORE_WALLET_TRANSFER_POINT")}</FormLabel>
                    <Field name="moneyValue">
                      {({ field, form }) => (
                        <NumberInput {...field} id="moneyValue" min={0} max={99999999} onChange={e => form.setFieldValue(field.name, e)} isDisabled={isSubmitting || loading}>
                          <NumberInputField fontSize="sm" size="md" />
                        </NumberInput>
                      )}
                    </Field>
                    <FormErrorMessage>{errors.moneyValue}</FormErrorMessage>
                  </FormControl>
                  <FormControl isInvalid={errors.password && touched.password} isRequired mt="12px">
                    <FormLabel htmlFor="password" fontSize="sm" fontWeight="normal">{getLangText("APPSTORE_WALLET_PASSWORD")}</FormLabel>
                    <Field as={Input} id="password" name="password" type="password" variant="outline" fontSize="sm" size="md" placeholder="" disabled={isSubmitting || loading} />
                    <FormErrorMessage>{errors.password}</FormErrorMessage>
                  </FormControl>
                  <Flex mt="20px">
                    <Button type="submit" variant="dark" fontSize="14px" isLoading={isSubmitting || loading} px="40px" ms="auto">{getLangText("TEXT_TRANSFER")}</Button>
                  </Flex>
                </Form>
              )}
            </Formik>
          </Box>
        </CardBody>
      </Card>
      <ConfirmDialog
        isOpen={isOpenTransfer}
        onClose={onCloseTransfer}
        title={getLangText("APPSTORE_WALLET_TRANSFER")}
        description={getLangText("APPSTORE_WALLET_TRANSFER_DESC", [formData?.targetId, formData?.moneyValue])}
        primaryText={getLangText("TEXT_TRANSFER")}
        primaryColor="green"
        primaryAction={handleTransfer}
        secondaryText={getLangText("TEXT_CANCEL")}
        loading={loading}
      />
    </Flex>
  )
}

export default AccountAppstoreWalletTransferPage;