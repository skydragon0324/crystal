import React, { Suspense, lazy } from 'react';
import { Switch, Route } from 'react-router-dom';
import Loader from 'components/Loader/Loader';

const AccountEshopInfoPage = lazy(() => import('pages/client/account/AccountEshopInfoPage'));
const AccountEshopOrdersPage = lazy(() => import('pages/client/account/AccountEshopOrdersPage'));
const AccountEshopWalletTransactionsPage = lazy(() => import('pages/client/account/AccountEshopWalletTransactionsPage'));
const AccountEshopExpLogPage = lazy(() => import('pages/client/account/AccountEshopExpLogPage'));
const AccountEshopCommerceValuesPage = lazy(() => import('pages/client/account/AccountEshopCommerceValuesPage'));
const AccountAppstorePurchaseLogPage = lazy(() => import('pages/client/account/AccountAppstorePurchaseLogPage'));
const AccountAppstoreCommentsPage = lazy(() => import('pages/client/account/AccountAppstoreCommentsPage'));
const AccountAppstoreFavoritesPage = lazy(() => import('pages/client/account/AccountAppstoreFavoritesPage'));
const AccountAppstoreWalletTransactionsPage = lazy(() => import('pages/client/account/AccountAppstoreWalletTransactionsPage'));
const AccountAppstorePointLogPage = lazy(() => import('pages/client/account/AccountAppstorePointLogPage'));
const AccountAppstoreWalletChargePage = lazy(() => import('pages/client/account/AccountAppstoreWalletChargePage'));
const AccountAppstoreWalletTransferPage = lazy(() => import('pages/client/account/AccountAppstoreWalletTransferPage'));
const AccountKaraokePointLogPage = lazy(() => import('pages/client/account/AccountKaraokePointLogPage'));
const AccountBMediaPointLogPage = lazy(() => import('pages/client/account/AccountBMediaPointLogPage'));
const AccountSoftMinusPointLogPage = lazy(() => import('pages/client/account/AccountSoftMinusPointLogPage'));
const AccountKaraokeOldLogPage = lazy(() => import('pages/client/account/AccountKaraokeOldLogPage'));
const AccountBMediaOldLogPage = lazy(() => import('pages/client/account/AccountBMediaOldLogPage'));
const AccountActivityPointLogPage = lazy(() => import('pages/client/account/AccountActivityPointLogPage'));
const AccountActivityOldLogPage = lazy(() => import('pages/client/account/AccountActivityOldLogPage'));
const AccountEprodRegistLogPage = lazy(() => import('pages/client/account/AccountEprodRegistLogPage'));
const AccountKaraokeKeygenLogPage = lazy(() => import('pages/client/account/AccountKaraokeKeygenLogPage'));
const AccountManbangKeygenLogPage = lazy(() => import('pages/client/account/AccountManbangKeygenLogPage'));
const AccountBMediaKeygenLogPage = lazy(() => import('pages/client/account/AccountBMediaKeygenLogPage'));
const AccountFeedbackThreadsPage = lazy(() => import('pages/client/account/AccountFeedbackThreadsPage'));
const AccountBlogMyArticlesPage = lazy(() => import('pages/client/account/AccountBlogMyArticlesPage'));
const AccountBlogMyDraftPage = lazy(() => import('pages/client/account/AccountBlogMyDraftPage'));

const AccountRoute = () => {
  return (
    <Suspense fallback={<Loader />}>
      <Switch>
        <Route path="/vendor/account/eshop/cards" exact component={AccountEshopInfoPage} />
        <Route path="/vendor/account/eshop/orders" exact component={AccountEshopOrdersPage} />
        <Route path="/vendor/account/eshop/transactions" exact component={AccountEshopWalletTransactionsPage} />
        <Route path="/vendor/account/eshop/exp_log" exact component={AccountEshopExpLogPage} />
        <Route path="/vendor/account/eshop/commerce_values" exact component={AccountEshopCommerceValuesPage} />
        <Route path="/vendor/account/appstore/purchase_log" exact component={AccountAppstorePurchaseLogPage} />
        <Route path="/vendor/account/appstore/comments" exact component={AccountAppstoreCommentsPage} />
        <Route path="/vendor/account/appstore/favorites" exact component={AccountAppstoreFavoritesPage} />
        <Route path="/vendor/account/appstore/wallet_transaction_log" exact component={AccountAppstoreWalletTransactionsPage} />
        <Route path="/vendor/account/wallet/wallet_charge" exact component={AccountAppstoreWalletChargePage} />
        <Route path="/vendor/account/wallet/wallet_transfer" exact component={AccountAppstoreWalletTransferPage} />
        <Route path="/vendor/account/soft/appstore_point_log" exact component={AccountAppstorePointLogPage} />
        <Route path="/vendor/account/soft/karaoke_point_log" exact component={AccountKaraokePointLogPage} />
        <Route path="/vendor/account/soft/bmedia_point_log" exact component={AccountBMediaPointLogPage} />
        <Route path="/vendor/account/soft/minus_point_log" exact component={AccountSoftMinusPointLogPage} />
        <Route path="/vendor/account/soft/karaoke_old_log" exact component={AccountKaraokeOldLogPage} />
        <Route path="/vendor/account/soft/bmedia_old_log" exact component={AccountBMediaOldLogPage} />
        <Route path="/vendor/account/activity/activity_point_log" exact component={AccountActivityPointLogPage} />
        <Route path="/vendor/account/activity/activity_old_log" exact component={AccountActivityOldLogPage} />
        <Route path="/vendor/account/eprod/register_log" exact component={AccountEprodRegistLogPage} />
        <Route path="/vendor/account/eprod/karaoke_keygen_log" exact component={AccountKaraokeKeygenLogPage} />
        <Route path="/vendor/account/eprod/manbang_keygen_log" exact component={AccountManbangKeygenLogPage} />
        <Route path="/vendor/account/eprod/bmedia_keygen_log" exact component={AccountBMediaKeygenLogPage} />
        <Route path="/vendor/account/message/feedback_threads" exact component={AccountFeedbackThreadsPage} />
        <Route path="/vendor/account/blog/my_articles" exact component={AccountBlogMyArticlesPage} />
        <Route path="/vendor/account/blog/my_drafts" exact component={AccountBlogMyDraftPage} />
      </Switch>
    </Suspense>
  );
}

export default AccountRoute;
