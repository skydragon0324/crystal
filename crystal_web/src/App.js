import React, { useEffect } from 'react';
import { BrowserRouter, Redirect, Route, Switch, useLocation } from 'react-router-dom';
import { Center, Spinner } from '@chakra-ui/react';
import { useDispatch, useSelector } from 'react-redux';

import Layout from '@/components/layout/Layout';
import AccountLayout from '@/components/account/AccountLayout';

import Home from '@/pages/Home';
import AboutPage from '@/pages/about/AboutPage';
import Login from '@/pages/auth/Login';

import SectionLanding from '@/pages/common/SectionLanding';
import ProductList from '@/pages/common/ProductList';
import ProductDetail from '@/pages/common/ProductDetail';
import Compare from '@/pages/smartphones/Compare';
import Eproducts from '@/pages/eproducts/Eproducts';

import SupportHome from '@/pages/support/SupportHome';
import Agencies from '@/pages/support/Agencies';
import Faq from '@/pages/support/Faq';
import RepairPricing from '@/pages/support/RepairPricing';
import OsUpdates from '@/pages/support/OsUpdates';
import Warranty from '@/pages/support/Warranty';
import Contact from '@/pages/support/Contact';

import Notifications from '@/pages/Notifications';

import BlogList from '@/pages/blog/BlogList';
import BlogArticle from '@/pages/blog/BlogArticle';

import Dashboard from '@/pages/account/Dashboard';
import Products from '@/pages/account/Products';
import RegisterProduct from '@/pages/account/RegisterProduct';
import Licenses from '@/pages/account/Licenses';
import Wallet from '@/pages/account/Wallet';
import Points from '@/pages/account/Points';
import Repairs from '@/pages/account/Repairs';
import MyArticles from '@/pages/account/MyArticles';
import EshopCard from '@/pages/account/storefront/EshopCard';
import EshopOrders from '@/pages/account/storefront/EshopOrders';
import EshopLog from '@/pages/account/storefront/EshopLog';
import {
  AppstoreComments,
  AppstoreFavourites,
  AppstorePurchases,
  AppstoreWallet
} from '@/pages/account/storefront/Appstore';
import {
  BmediaKeygen,
  EprodRegistrations,
  KaraokeKeygen,
  ManbangKeygen
} from '@/pages/account/storefront/Eproduct';
import {
  ActivityOldLog,
  KaraokeOldLog,
  MediaOldLog
} from '@/pages/account/storefront/OldLogs';
import Feedback from '@/pages/account/Feedback';
import Settings from '@/pages/account/Settings';
import NotFound from '@/pages/NotFound';

import { restoreSession, selectAuthStatus, signOut } from '@/app/authSlice';
import { onUnauthorized } from '@/api/client';
import { useT } from '@/i18n';

/**
 * Routing.
 *
 * Two structural decisions worth knowing:
 *
 *   - EVERY route sits inside `<Layout>`, the account area included. When the
 *     account routes lived outside it the signed-in half of the site had no
 *     header, no search and no mobile menu at all.
 *   - the two catalogue sections share one set of components with different
 *     props, rather than each having its own copy of the landing, list and
 *     detail pages.
 */

/** Sends an anonymous visitor to sign-in, remembering where they meant to go. */
function PrivateRoute({ children, ...rest }) {
  const status = useSelector(selectAuthStatus);
  const location = useLocation();

  if (status === 'restoring') {
    return (
      <Center py="24">
        <Spinner size="lg" color="brand.500" thickness="3px" />
      </Center>
    );
  }

  if (status !== 'authenticated') {
    return (
      <Redirect
        to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
      />
    );
  }

  return <Route {...rest}>{children}</Route>;
}

/**
 * THE PATH THIS APP IS SERVED UNDER, or '' when it is served from the root.
 *
 * Behind nginx each frontend lives under a prefix - /crystal_admin,
 * /crystal_web - so every route and every asset has to resolve under it. CRA
 * bakes PUBLIC_URL in at build time and rewrites %PUBLIC_URL% in index.html
 * for the assets; the ROUTER is the part it cannot do for us, because it has
 * no idea the paths in a Switch are relative to anything.
 *
 * Without this, a build served at /crystal_admin/ loads its bundle correctly
 * and then matches no route at all: the browser is at /crystal_admin/admin
 * and the Switch is looking for /admin.
 *
 * PUBLIC_URL may be a path or a whole URL, depending on whether it was set as
 * an env var or as `homepage`, so the path is extracted rather than assumed.
 * A trailing slash is dropped because basename must not have one.
 */
function basename() {
  const raw = process.env.PUBLIC_URL || '';
  if (!raw) return '';

  /* Strip the scheme and host when PUBLIC_URL was given as a whole URL. */
  const path = raw.indexOf('//') === -1
    ? raw
    : raw.replace(/^[a-z]+:\/\/[^/]+/i, '');

  /* basename must not end in a slash. */
  return path.replace(/\/+$/, '');
}

export default function App() {
  const t = useT();

  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(restoreSession());
  }, [dispatch]);

  useEffect(() => {
    // Only fires for /account requests - see api/client.js. A stale token on a
    // public page just means the anonymous view.
    const off = onUnauthorized(() => dispatch(signOut()));
    return off;
  }, [dispatch]);

  return (
    <BrowserRouter basename={basename()}>
      <Layout>
        <Switch>
          <Route exact path="/" component={Home} />
          {/*
            THE COMPANY INTRODUCTION.

            /about is the address; /intro is what the site called it before
            and what any link written since points at, so it redirects rather
            than being kept as a second copy of the page.
          */}
          <Route exact path="/about" component={AboutPage} />
          <Redirect exact from="/intro" to="/about" />
          <Route exact path="/login" component={Login} />

          {/* ------------------------------------------------- smartphones */}
          <Route exact path="/smartphones">
            <SectionLanding type="SMARTPHONE" sectionPath="/smartphones" title={t('common.smartphones')} />
          </Route>
          <Route exact path="/smartphones/compare" component={Compare} />
          <Route exact path="/smartphones/products">
            <ProductList categoryType="SMARTPHONE" sectionPath="/smartphones" title={t('common.smartphones')} />
          </Route>
          <Route exact path="/smartphones/products/:slug/:tab?">
            <ProductDetail sectionPath="/smartphones" sectionTitle="Smartphones" />
          </Route>

          {/* --------------------------------------------------- eproducts */}
          <Route exact path="/eproducts" component={Eproducts} />
          <Route exact path="/eproducts/:category/products/:slug/:tab?">
            <ProductDetail sectionPath="/eproducts" sectionTitle="Eproducts" />
          </Route>
          <Route exact path="/eproducts/:category" component={Eproducts} />

          {/* ----------------------------------------------------- support */}
          <Route exact path="/support" component={SupportHome} />
          {/*
            THE LOCATOR IS ALWAYS SCOPED TO ONE COUNTER.

            Smartphone and eproduct service centres are run by different
            managers and customers think of them as two networks, so the
            section is part of the address rather than a filter inside one
            page that defaulted to neither. The bare path is kept because it
            is what the menu, the footer and every old link point at; the
            page redirects it to the first network rather than 404ing.
          */}
          <Route exact path="/support/centres" component={Agencies} />
          <Route exact path="/support/centres/:section" component={Agencies} />
          <Route exact path="/support/faq" component={Faq} />
          <Route exact path="/support/pricing" component={RepairPricing} />
          <Route exact path="/support/os" component={OsUpdates} />
          <Route exact path="/support/warranty" component={Warranty} />
          <Route exact path="/support/contact" component={Contact} />

          {/*
            EVERYTHING CRYSTAL HAS TO SAY TODAY.

            Public and outside /support, because the bell that opens it is in
            the header on every page - including the account area - and what
            it lists is announcements rather than help. It is also the only
            way back to a notice somebody put down on arrival, which is what
            makes "do not remind me today" safe to offer at all.
          */}
          <Route exact path="/notifications" component={Notifications} />

          {/* -------------------------------------------------------- blog */}
          <Route exact path="/blog" component={BlogList} />
          <Route exact path="/blog/:slug" component={BlogArticle} />

          {/* ---------------------------------------------- member centre */}
          <PrivateRoute path="/account">
            <AccountLayout>
              <Switch>
                <Route exact path="/account" component={Dashboard} />

                <Route exact path="/account/products" component={Products} />
                <Route exact path="/account/products/register" component={RegisterProduct} />
                <Route exact path="/account/licenses" component={Licenses} />

                <Route exact path="/account/wallet/:view?" component={Wallet} />

                {/*
                  * ONE POINTS ROUTE, not two. /account/points/log was a second
                  * path to the same component from when the balance and the
                  * ledger were separate screens; they are one page now, and a
                  * route nothing links to is a page nobody can reach.
                  */}
                <Route exact path="/account/points" component={Points} />

                {/* ---- the Eshop, over HTTP ---- */}
                <Route exact path="/account/eshop/card" component={EshopCard} />
                <Route exact path="/account/eshop/orders" component={EshopOrders} />
                {/*
                  * Three menu entries, one page. The Eshop serves transactions,
                  * experience and commerce value from one endpoint with a type,
                  * so the view is a prop rather than three components.
                  */}
                <Route exact path="/account/eshop/transactions" render={() => <EshopLog view="TRANSACTIONS" />} />
                <Route exact path="/account/eshop/experience" render={() => <EshopLog view="EXPERIENCE" />} />
                <Route exact path="/account/eshop/commerce" render={() => <EshopLog view="COMMERCE" />} />

                {/* ---- the Appstore, over HTTP ---- */}
                <Route exact path="/account/appstore/purchases" component={AppstorePurchases} />
                <Route exact path="/account/appstore/comments" component={AppstoreComments} />
                <Route exact path="/account/appstore/favourites" component={AppstoreFavourites} />
                <Route exact path="/account/appstore/wallet" component={AppstoreWallet} />

                {/* ---- the eproduct site, over HTTP ---- */}
                <Route exact path="/account/eproduct/registrations" component={EprodRegistrations} />
                <Route exact path="/account/eproduct/keygen/karaoke" component={KaraokeKeygen} />
                <Route exact path="/account/eproduct/keygen/manbang" component={ManbangKeygen} />
                <Route exact path="/account/eproduct/keygen/bmedia" component={BmediaKeygen} />

                {/* ---- what you did before, in the systems that came first ---- */}
                <Route exact path="/account/history/activity" component={ActivityOldLog} />
                <Route exact path="/account/history/karaoke" component={KaraokeOldLog} />
                <Route exact path="/account/history/media" component={MediaOldLog} />

                {/*
                  * Both of these were menu entries with no route: they matched
                  * nothing and fell through to the redirect below, so the
                  * member was bounced to the dashboard without explanation.
                  */}
                <Route exact path="/account/repairs" component={Repairs} />
                <Route exact path="/account/blog" component={MyArticles} />

                <Route exact path="/account/feedback/:id?" component={Feedback} />

                <Route exact path="/account/settings/:view?" component={Settings} />

                <Redirect to="/account" />
              </Switch>
            </AccountLayout>
          </PrivateRoute>

          <Route component={NotFound} />
        </Switch>
      </Layout>
    </BrowserRouter>
  );
}
