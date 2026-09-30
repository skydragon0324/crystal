import React, { Suspense, lazy } from 'react';
import { Switch, Route } from 'react-router-dom';
import Loader from 'components/Loader/Loader';

const HomePage = lazy(() => import('pages/client/main/HomePage'));
const ProductsIntroPage = lazy(() => import('pages/client/phone/ProductsIntroPage'));
const ProductsIntroDetailPage = lazy(() => import('pages/client/phone/ProductsIntroDetailPage'));
const ServiceAgencyPage = lazy(() => import('pages/client/phone/ServiceAgencyPage'));
const PhoneFaqPage = lazy(() => import('pages/client/phone/PhoneFaqPage'));
const CompanyIntroPage = lazy(() => import('pages/client/main/CompanyIntroPage'));
const BlogArticlesPage = lazy(() => import('pages/client/blog/BlogArticlesPage'));
const BlogRepliesPage = lazy(() => import('pages/client/blog/BlogRepliesPage'));
const BlogAddPage = lazy(() => import('pages/client/blog/BlogAddPage'));

const ClientRoute = () => {
  return (
    <Suspense fallback={<Loader />}>
      <Switch>
        {/* Both spellings land on the landing page: "/vendor" is what a
            visitor types, "/vendor/home" is what the logo and the logout
            handlers link to. */}
        <Route path="/vendor" exact component={HomePage} />
        <Route path="/vendor/home" exact component={HomePage} />
        <Route path="/vendor/blog/add/:parent" exact component={BlogAddPage} />
        <Route path="/vendor/phone/products" exact component={ProductsIntroPage} />
        <Route path="/vendor/phone/product/:product_pk" exact component={ProductsIntroDetailPage} />
        <Route path="/vendor/phone/agencies" exact component={ServiceAgencyPage} />
        <Route path="/vendor/phone/faqs" exact component={PhoneFaqPage} />
        <Route path="/vendor/intro" exact component={CompanyIntroPage} />
        <Route path="/vendor/blog" exact component={BlogArticlesPage} />
        <Route path="/vendor/blog/:id" exact component={BlogRepliesPage} />
      </Switch>
    </Suspense>
  );
}

export default ClientRoute;
