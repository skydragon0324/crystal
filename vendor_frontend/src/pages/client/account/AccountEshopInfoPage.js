import React, { useEffect, useState } from 'react'
import { useSelector } from 'react-redux';
import { Flex, Image, Text } from '@chakra-ui/react'
import Card from 'components/Card/Card';
import CardBody from 'components/Card/CardBody';
import NoPermSection from 'components/Section/NoPermSection';
import { getEshopWalletBalance } from 'api/client/accountApi';
import { formatPrice } from 'utils/utils';
import { getLangText } from 'lang/lang';
import { RESP_CODES } from 'constants/responseCodes';

import imgWallet0 from 'assets/images/cards/card_wallet_none.png';
import imgWallet1 from 'assets/images/cards/card_wallet_gold.png';
import imgWallet2 from 'assets/images/cards/card_wallet_silver.png';
import imgWallet3 from 'assets/images/cards/card_wallet_blue.png';
import imgCustomer0 from 'assets/images/cards/card_level_0.png';
import imgCustomer1 from 'assets/images/cards/card_level_1.png';
import imgCustomer2 from 'assets/images/cards/card_level_2.png';
import imgCustomer3 from 'assets/images/cards/card_level_3.png';
import imgCustomer4 from 'assets/images/cards/card_level_4.png';
import imgCustomer5 from 'assets/images/cards/card_level_5.png';

const AccountEshopInfoPage = () => {
  const { user } = useSelector((state) => state.client);
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const resp = await getEshopWalletBalance();
    if (resp.code === RESP_CODES.SUCCESS.code) {
      setInfo(resp.data);
    }
    setLoading(false);
  }

  // const onChangePassword = () => {
  //   setFormData({
  //     old_trans_pass: '',
  //     new_trans_pass: '',
  //     check_new_trans_pass: ''
  //   });
  //   setOpenPassword(true);
  // }

  const getWalletImage = (cardType) => {
    return +cardType === 1 || +cardType === 4 ? imgWallet1
      : +cardType === 2 ? imgWallet2
        : +cardType === 3 ? imgWallet3
          : imgWallet0;
  }

  const getCustomerImage = (cardLv) => {
    return +cardLv === 1 ? imgCustomer1
      : +cardLv === 2 ? imgCustomer2
        : +cardLv === 3 ? imgCustomer3
          : +cardLv === 4 ? imgCustomer4
            : +cardLv === 5 ? imgCustomer5
              : imgCustomer0;
  }

  if (!user) {
    return <NoPermSection />
  }

  return (
    <Flex direction="column">
      <Card pb="0px">
        <CardBody>
          {loading ? (
            <Image src={getCustomerImage()} alt="" />
          ) : (
            <Image src={getCustomerImage(info?.card_level)} alt="" />
          )}
          {info && (
            <Flex direction="column">
              <Text>{getLangText("ESHOP_ACCUM_CARD")}: {info.customer_no}</Text>
              <Text>{getLangText("ESHOP_PRIZE_VALUE")}: {formatPrice(info.prize_value)}</Text>
              <Text>{getLangText("ESHOP_EXP_VALUE")}: {formatPrice(info.accum_value)}</Text>
            </Flex>
          )}

          {loading ? (
            <Image src={getWalletImage()} alt="" />
          ) : (
            <Image src={getWalletImage(info?.card_type)} alt="" />
          )}
          {info && (
            <Flex direction="column">
              <Text>{getLangText("ESHOP_WALLET_CARD")}: {info.vip_no}</Text>
              <Text>{getLangText("ESHOP_WALLET_BALANCE")}: {formatPrice(info.real_value)}</Text>
              <Text>{getLangText("ESHOP_COMMERCE_VALUE")}: {formatPrice(info.commerce_value)}</Text>
            </Flex>
          )}
        </CardBody>
      </Card>
    </Flex>
  )
}

export default AccountEshopInfoPage;