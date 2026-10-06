import React, { Suspense, lazy } from 'react';
import { Switch, Route } from 'react-router-dom';
import Loader from 'components/Loader/Loader';

const ClientLoginPage = lazy(() => import('pages/auth/ClientLoginPage'));

const AuthRoute = () => {
  return (
    <Suspense fallback={<Loader />}>
      <Switch>
        <Route path="/vendor/auth/reganam" exact component={ClientLoginPage} />
      </Switch>
    </Suspense>
  );
}

export default AuthRoute;