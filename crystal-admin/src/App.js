import React, { Suspense, useEffect } from 'react';
import { BrowserRouter, Redirect, Route, Switch, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Center, Skeleton, Spinner, Stack, Text } from '@chakra-ui/react';

import AdminLayout from './layouts/AdminLayout';
import SignIn from './pages/SignIn';
import SessionExpired from './components/SessionExpired';
import { ConfirmProvider } from './components/ConfirmDialog';
import routes, { REDIRECTS } from './routes';

import { loadSession, permissionOf, signedOut } from './app/authSlice';
import { SESSION_EXPIRED_EVENT, tokenStore } from './api/client';
import { I18nProvider, useT } from './i18n';

/**
 * Routing and the session gate.
 *
 * Nothing renders until the session has been re-read, because at first paint
 * the app cannot know whether the stored token is still good - and flashing
 * the sign-in screen at somebody who IS signed in, on every reload, is worse
 * than a moment of spinner.
 *
 * The session is re-read rather than trusted from storage: an account given a
 * different role this morning gets the new menu on its next page load rather
 * than at its next sign-in.
 */
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
  return (
    <I18nProvider>
      {/*
        * The confirm dialog is mounted once, here, and reached through
        * useConfirm() as a promise - which is what lets a delete read as
        * three lines in the screen that owns it rather than as a piece of
        * dialog state every screen has to carry.
        */}
      <ConfirmProvider>
        <Shell />
      </ConfirmProvider>
    </I18nProvider>
  );
}

function Shell() {
  const dispatch = useDispatch();
  const status = useSelector((state) => state.auth.status);

  /*
   * A session that ENDED is not the same as one that never started.
   *
   * Somebody who was working and is now signed out deserves to be told why,
   * on a page of its own; somebody arriving at the app cold just needs the
   * sign-in form.  Both end up at the same place - this only decides whether
   * a sentence appears on the way.
   */
  const [expired, setExpired] = React.useState(false);

  useEffect(() => {
    if (tokenStore.get() || tokenStore.getRefresh()) dispatch(loadSession());
  }, [dispatch]);

  useEffect(() => {
    /*
     * A token that could not be renewed shows up as one event rather than as
     * a 401 on whatever request happened to be in flight - which is what
     * turns "your session ended" into one message instead of six error
     * toasts.
     */
    const onExpired = () => { setExpired(true); dispatch(signedOut()); };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [dispatch]);

  if (status === 'loading') {
    return (
      <Center h="100vh">
        <Spinner size="lg" color="brand.500" thickness="3px" />
      </Center>
    );
  }

  if (status !== 'signedIn') {
    return expired
      ? <SessionExpired onSignIn={() => setExpired(false)} />
      : <SignIn />;
  }

  return (
    <BrowserRouter basename={basename()}>
      <AdminLayout>
        <Suspense fallback={<RouteFallback />}>
          <Switch>
          {routes.map((route) => (
            <Route
              key={route.path}
              path={route.path}
              exact
              render={(props) => <Guarded route={route} {...props} />}
            />
          ))}

          {/*
            * A permission page that is not a screen - see REDIRECTS in
            * routes.js. These sit BELOW the real routes, so none of them can
            * shadow a screen, and ABOVE the catch-all, so they land where
            * they mean to instead of on the dashboard.
            */}
          {REDIRECTS.map((entry) => (
            <Redirect key={entry.from} exact from={entry.from} to={entry.to} />
          ))}

          <Route exact path="/"><Landing /></Route>
          <Redirect to="/admin/dashboard" />
          </Switch>
        </Suspense>
      </AdminLayout>
    </BrowserRouter>
  );
}

/** Holds the page shape steady while a route chunk is downloaded. */
function RouteFallback() {
  const t = useT();
  return (
    <Stack spacing="4" aria-busy="true" aria-label={t('common.loadingPage')}>
      <Skeleton h="2rem" w="13rem" borderRadius="md" />
      <Skeleton h="3rem" w="100%" borderRadius="lg" />
      <Skeleton h="18rem" w="100%" borderRadius="lg" />
    </Stack>
  );
}

/**
 * A screen this role may not open.
 *
 * The API refuses it anyway - this is the guard that matters - but rendering
 * a page that then fills with permission errors is a worse way to say no than
 * saying it once, plainly.
 */
function Guarded({ route, ...props }) {
  const t = useT();
  const location = useLocation();
  const pages = useSelector((state) => state.auth.pages);

  const level = permissionOf(pages, location.pathname);
  if (level < 1) {
    return (
      <Center py={24}>
        <Text fontSize="sm" color="gray.500">{t('app.youDoNotHaveAccess')}</Text>
      </Center>
    );
  }

  const Component = route.component;
  return <Component {...props} />;
}

/**
 * Where "/" goes.
 *
 * To the role's own landing page rather than to a fixed one: a branch manager
 * who cannot open the dashboard should not have the app redirect them to it
 * and then refuse.
 */
function Landing() {
  const pages = useSelector((state) => state.auth.pages);
  const admin = useSelector((state) => state.auth.admin);

  const home = (admin && admin.default_page_url)
    || (pages.find((page) => page.page_url === '/admin/dashboard') && '/admin/dashboard')
    || (pages[0] && pages[0].page_url)
    || '/admin/dashboard';

  return <Redirect to={home} />;
}
