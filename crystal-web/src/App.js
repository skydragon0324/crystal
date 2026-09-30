import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Redirect, Route, Switch, useLocation } from 'react-router-dom';
import { Skeleton, Stack } from '@chakra-ui/react';
import { useDispatch, useSelector } from 'react-redux';

import { Loading, Section } from '@/components/common';
import Layout from '@/components/layout/Layout';
import AccountLayout from '@/components/account/AccountLayout';

import Home from '@/pages/Home';
import NotFound from '@/pages/NotFound';

import { restoreSession, selectAuthStatus, signOut } from '@/app/authSlice';
import { onUnauthorized } from '@/api/client';
import { useT } from '@/i18n';

/*
 * THE FIRST PAGE IS IN THE BUNDLE; THE REST ARRIVE WHEN THEY ARE ASKED FOR.
 *
 * Every page used to be imported here, so every visitor downloaded the whole
 * site before seeing any of it - the member centre's twenty-odd screens, the
 * ten chapters of the company story and both catalogue sections, in order to
 * read the homepage. On the connections this site is used on that is the
 * difference between a page that appears and a page that arrives.
 *
 * `React.lazy` gives each route its own download, and the chunk NAMES group
 * them the way a visit does: the whole member centre is one file rather than
 * twenty, because somebody who signs in walks through several of its pages,
 * and twenty round trips would cost more than the bytes they save. The same
 * goes for support, for the catalogue and for the blog.
 *
 * HOME AND THE NOT-FOUND PAGE STAY IN THE BUNDLE. Home is where most visits
 * start, and deferring it would put a round trip in front of the one page
 * that has to paint at once; NotFound is a few lines, and is reached when
 * something has already gone wrong.
 *
 * THE CATALOGUE IS PREFETCHED RATHER THAN LOADED: `webpackPrefetch` asks the
 * browser to fetch it while it is idle, after everything the current page
 * needs, so the first click from the homepage - which is nearly always a
 * product - is instant without costing anything at first paint.
 *
 * What stands in a page's place while its chunk is in flight is
 * `PageFallback` below.
 */
const AboutPage = lazy(() => import(/* webpackChunkName: "about" */ '@/pages/about/AboutPage'));
const Login = lazy(() => import(/* webpackChunkName: "auth" */ '@/pages/auth/Login'));
const SignIn = lazy(() => import(/* webpackChunkName: "auth" */ '@/pages/auth/SignIn'));

const SectionLanding = lazy(() => import(/* webpackChunkName: "catalogue", webpackPrefetch: true */ '@/pages/common/SectionLanding'));
const ProductList = lazy(() => import(/* webpackChunkName: "catalogue" */ '@/pages/common/ProductList'));
const ProductDetail = lazy(() => import(/* webpackChunkName: "catalogue" */ '@/pages/common/ProductDetail'));
const Compare = lazy(() => import(/* webpackChunkName: "catalogue" */ '@/pages/smartphones/Compare'));
const Eproducts = lazy(() => import(/* webpackChunkName: "catalogue" */ '@/pages/eproducts/Eproducts'));

const SupportHome = lazy(() => import(/* webpackChunkName: "support" */ '@/pages/support/SupportHome'));
const Agencies = lazy(() => import(/* webpackChunkName: "support" */ '@/pages/support/Agencies'));
const Faq = lazy(() => import(/* webpackChunkName: "support" */ '@/pages/support/Faq'));
const RepairPricing = lazy(() => import(/* webpackChunkName: "support" */ '@/pages/support/RepairPricing'));
const OsUpdates = lazy(() => import(/* webpackChunkName: "support" */ '@/pages/support/OsUpdates'));
const Warranty = lazy(() => import(/* webpackChunkName: "support" */ '@/pages/support/Warranty'));
const Contact = lazy(() => import(/* webpackChunkName: "support" */ '@/pages/support/Contact'));

const Notifications = lazy(() => import(/* webpackChunkName: "notifications" */ '@/pages/Notifications'));

const BlogList = lazy(() => import(/* webpackChunkName: "blog" */ '@/pages/blog/BlogList'));
const BlogArticle = lazy(() => import(/* webpackChunkName: "blog" */ '@/pages/blog/BlogArticle'));

/* The member centre, in one chunk - a signed-in visit uses several of these. */
const Dashboard = lazy(() => import(/* webpackChunkName: "account" */ '@/pages/account/Dashboard'));
const RegisterProduct = lazy(() => import(/* webpackChunkName: "account" */ '@/pages/account/RegisterProduct'));
const SoftwarePoints = lazy(() => import(/* webpackChunkName: "account" */ '@/pages/account/points/SoftwarePoints'));
const CrystalPoints = lazy(() => import(/* webpackChunkName: "account" */ '@/pages/account/points/CrystalPoints'));
const ActivityPoints = lazy(() => import(/* webpackChunkName: "account" */ '@/pages/account/points/ActivityPoints'));
const WalletTransfer = lazy(() => import(/* webpackChunkName: "account" */ '@/pages/account/points/WalletTransfer'));
const WalletCharge = lazy(() => import(/* webpackChunkName: "account" */ '@/pages/account/points/WalletCharge'));
const WalletPassword = lazy(() => import(/* webpackChunkName: "account" */ '@/pages/account/points/WalletPassword'));
const Repairs = lazy(() => import(/* webpackChunkName: "account" */ '@/pages/account/Repairs'));
const MyArticles = lazy(() => import(/* webpackChunkName: "account" */ '@/pages/account/MyArticles'));
const WriteArticle = lazy(() => import(/* webpackChunkName: "account" */ '@/pages/account/WriteArticle'));
const EshopCard = lazy(() => import(/* webpackChunkName: "account" */ '@/pages/account/storefront/EshopCard'));
const EshopOrders = lazy(() => import(/* webpackChunkName: "account" */ '@/pages/account/storefront/EshopOrders'));
const EshopLog = lazy(() => import(/* webpackChunkName: "account" */ '@/pages/account/storefront/EshopLog'));

/* Named exports, which lazy() cannot take as they are: it wants a default. */
const AppstoreComments = lazy(() => import(/* webpackChunkName: "account" */ '@/pages/account/storefront/Appstore').then((module) => ({ default: module.AppstoreComments })));
const AppstoreFavourites = lazy(() => import(/* webpackChunkName: "account" */ '@/pages/account/storefront/Appstore').then((module) => ({ default: module.AppstoreFavourites })));
const AppstorePurchases = lazy(() => import(/* webpackChunkName: "account" */ '@/pages/account/storefront/Appstore').then((module) => ({ default: module.AppstorePurchases })));
const AppstoreWallet = lazy(() => import(/* webpackChunkName: "account" */ '@/pages/account/storefront/Appstore').then((module) => ({ default: module.AppstoreWallet })));
const BmediaKeygen = lazy(() => import(/* webpackChunkName: "account" */ '@/pages/account/storefront/Eproduct').then((module) => ({ default: module.BmediaKeygen })));
const EprodRegistrations = lazy(() => import(/* webpackChunkName: "account" */ '@/pages/account/storefront/Eproduct').then((module) => ({ default: module.EprodRegistrations })));
const KaraokeKeygen = lazy(() => import(/* webpackChunkName: "account" */ '@/pages/account/storefront/Eproduct').then((module) => ({ default: module.KaraokeKeygen })));
const ManbangKeygen = lazy(() => import(/* webpackChunkName: "account" */ '@/pages/account/storefront/Eproduct').then((module) => ({ default: module.ManbangKeygen })));
const ActivityOldLog = lazy(() => import(/* webpackChunkName: "account" */ '@/pages/account/storefront/OldLogs').then((module) => ({ default: module.ActivityOldLog })));
const KaraokeOldLog = lazy(() => import(/* webpackChunkName: "account" */ '@/pages/account/storefront/OldLogs').then((module) => ({ default: module.KaraokeOldLog })));
const MediaOldLog = lazy(() => import(/* webpackChunkName: "account" */ '@/pages/account/storefront/OldLogs').then((module) => ({ default: module.MediaOldLog })));
const Feedback = lazy(() => import(/* webpackChunkName: "account" */ '@/pages/account/Feedback'));
const Settings = lazy(() => import(/* webpackChunkName: "account" */ '@/pages/account/Settings'));

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

/**
 * WHAT STANDS IN A PAGE'S PLACE WHILE ITS CHUNK ARRIVES.
 *
 * A spinner says only "wait". A skeleton says what is coming and holds the
 * space it will take, so nothing jumps when the page lands - and it is the
 * same Loading the pages themselves show while their data is in flight, so
 * a slow page and a slow connection read as one wait rather than two.
 */
function PageFallback() {
  return (
    <Section py={{ base: 6, md: 10 }}>
      <Stack spacing="6">
        <Skeleton height="28px" width="14rem" borderRadius="8px" />
        <Loading variant="block" height="360px" />
        <Loading variant="list" count={3} height="72px" />
      </Stack>
    </Section>
  );
}

/** Sends an anonymous visitor to sign-in, remembering where they meant to go. */
function PrivateRoute({ children, ...rest }) {
  const status = useSelector(selectAuthStatus);
  const location = useLocation();

  /* Reading the stored session is a wait like any other, and wears the same face. */
  if (status === 'restoring') return <PageFallback />;

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
        <Suspense fallback={<PageFallback />}>
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
            {/*
              SIGNING IN. /login is the certificate button on a desktop and the
              user ID, password and CID form on a phone. The page that used to
              be here - password, code and registration - moved, unchanged, to
              /auth/reganam. Nothing on the site links to it.
            */}
            <Route exact path="/login" component={SignIn} />
            <Route exact path="/auth/reganam" component={Login} />

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

                  {/*
                    * REGISTERING A DEVICE IS AN ACTION, NOT A PLACE, and it is
                    * now the only thing left of Crystal's own product pages.
                    *
                    * /account/products listed the devices Crystal knew about and
                    * /account/licenses issued keys against them. Both were a
                    * second, unsynchronised answer to a question the eproduct
                    * site already answers - a member could have rows in one and
                    * not the other, and neither could be derived from the other -
                    * so both are gone and /account/eproduct/registrations is the
                    * registration log that is kept.
                    *
                    * This route stays because the dashboard and several empty
                    * states send people to it, and because registering is what
                    * earns the points those pages are talking about. It is
                    * deliberately not in the menu; accountNav.test.js names it as
                    * the one allowed orphan for exactly that reason.
                    */}
                  <Route exact path="/account/products/register" component={RegisterProduct} />

                  {/*
                    * THREE POINTS PAGES, because there are three kinds of ledger.
                    *
                    * /account/points is the four software ledgers (Appstore,
                    * Karaoke, Media, Minus), one shape chosen by `?source=`.
                    * Crystal's own points and the activity log used to be two
                    * more sources on it and are pages of their own: their
                    * columns, filters and summaries have nothing in common with
                    * the software ledgers'. The old `?source=CRYSTAL` and
                    * `?source=ACTIVITY` addresses redirect to these two - see
                    * SoftwarePoints.js, which is where the query is read.
                    */}
                  <Route exact path="/account/points" component={SoftwarePoints} />
                  <Route exact path="/account/points/crystal" component={CrystalPoints} />
                  <Route exact path="/account/points/activity" component={ActivityPoints} />

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

                  {/*
                    * THE WALLET IS THE APPSTORE'S, AND IT ANSWERS AT
                    * /account/wallet.
                    *
                    * Crystal had a wallet page of its own here - a balance, a
                    * top-up form, a transfer form and a pay-password form - and
                    * the Appstore's, the one holding the coins a member can
                    * actually spend, was a fourth entry in the Appstore group.
                    * The member has one wallet and it is that one, so it moved to
                    * the address people already think of as their wallet.
                    *
                    * The old Appstore address REDIRECTS rather than being
                    * deleted: the site header links to it (siteNav.js), and so
                    * does anything anybody has bookmarked. A Redirect keeps both
                    * working while there is exactly one page underneath.
                    */}
                  <Route exact path="/account/wallet" component={AppstoreWallet} />
                  <Redirect exact from="/account/appstore/wallet" to="/account/wallet" />

                  {/*
                    * WHAT A MEMBER CAN DO TO THAT WALLET - the vendor's Charge
                    * and Transfer, and the password a transfer asks for. They
                    * live under /account/wallet as the old wallet page's views
                    * did, and /account/wallet/security, that page's name for the
                    * password form, leads to the one that exists now.
                    */}
                  <Route exact path="/account/wallet/transfer" component={WalletTransfer} />
                  <Route exact path="/account/wallet/charge" component={WalletCharge} />
                  <Route exact path="/account/wallet/password" component={WalletPassword} />
                  <Redirect exact from="/account/wallet/security" to="/account/wallet/password" />

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

                  {/*
                    * WRITING ONE, AND EDITING IT LATER - the same screen, which
                    * is why the id is optional. It sits under /account because
                    * only a signed-in member may write, and because what it
                    * produces belongs in their own list of articles rather than
                    * on the public blog until staff have read it.
                    */}
                  <Route exact path="/account/blog/write/:id?" component={WriteArticle} />

                  <Route exact path="/account/feedback/:id?" component={Feedback} />

                  <Route exact path="/account/settings/:view?" component={Settings} />

                  <Redirect to="/account" />
                </Switch>
              </AccountLayout>
            </PrivateRoute>

            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </Layout>
    </BrowserRouter>
  );
}
