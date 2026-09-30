import React, { useState, useEffect } from 'react'
import { useSelector } from 'react-redux';
import { Flex, Image, SimpleGrid, Text, useDisclosure } from '@chakra-ui/react'
import Card from 'components/Card/Card';
import CardBody from 'components/Card/CardBody';
import ConfirmDialog from 'components/Dialog/ConfirmDialog';
import NoPermSection from 'components/Section/NoPermSection';
import { getLangText } from 'lang/lang';
import { APPSTORE_MONEY_TYPE } from 'constants/constants';
import imgSH from 'assets/images/wallet/sh.png';
import imgMM from 'assets/images/wallet/mm.png';
import imgJS from 'assets/images/wallet/js.png';
import imgUR from 'assets/images/wallet/ur.png';

const WALLET_NATIVE_INFOS = [
  { id: 1, src: imgSH, name: getLangText("WALLET_SH") },
  { id: 2, src: imgMM, name: getLangText("WALLET_MM") },
  { id: 3, src: imgUR, name: getLangText("WALLET_UR") },
  { id: 4, src: imgJS, name: getLangText("WALLET_SY") },
];

const WALLET_FOREIGN_INFOS = [
  { id: 1, image: imgSH, name: getLangText("WALLET_SH") },
];

const AccountAppstoreWalletChargePage = () => {
  const { user } = useSelector((state) => state.client);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState();
  const { isOpen: isOpenTransfer, onOpen: onOpenTransfer, onClose: onCloseTransfer } = useDisclosure();

  useEffect(() => {
    setFormData({ money_type: APPSTORE_MONEY_TYPE.COMPANY });
  }, []);

  const handleTransfer = () => {

  }

  if (!user) {
    return <NoPermSection />
  }

  const WalletCard = (info) => (
    <Flex direction="column" w="100px" h="100px">
      <Image src={info.src} alt="" />
      <Text>{info.name}</Text>
    </Flex>
  );

  return (
    <Flex w="full" direction="column">
      <Card pb="0px">
        <CardBody>
          <SimpleGrid columns={{ base: 2, lg: 4 }} spacing="12px" mt="24px" mb="12px">
            {formData?.money_type === APPSTORE_MONEY_TYPE.COMPANY ? (
              WALLET_NATIVE_INFOS.map(item => (
                <WalletCard key={item.id} info={item} />
              ))
            ) : formData?.money_type === APPSTORE_MONEY_TYPE.FOREIGN ? (
              WALLET_FOREIGN_INFOS.map(item => (
                <WalletCard key={item.id} info={item} />
              ))
            ) : ""}
          </SimpleGrid>
        </CardBody>
      </Card>
      <ConfirmDialog
        isOpen={isOpenTransfer}
        onClose={onCloseTransfer}
        title={getLangText("APPSTORE_WALLET_TRANSFER")}
        description={getLangText("APPSTORE_WALLET_TRANSFER_DESC")}
        primaryText={getLangText("TEXT_TRANSFER")}
        primaryColor="green"
        primaryAction={handleTransfer}
        secondaryText={getLangText("TEXT_CANCEL")}
        loading={loading}
      />
    </Flex>
  )
}

export default AccountAppstoreWalletChargePage;