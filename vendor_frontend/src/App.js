import React from 'react';
import { BrowserRouter, Redirect, Route, Switch } from "react-router-dom";
import { ChakraProvider } from "@chakra-ui/react";
import AuthLayout from 'layouts/AuthLayout';
import ClientLayout from 'layouts/ClientLayout';
import theme from "theme/theme.js";
import { PAGE_HOME_URL } from "constants/constants";
import 'react-date-picker/dist/DatePicker.css';
import 'react-calendar/dist/Calendar.css';
import 'react-multi-carousel/lib/styles.css';
import 'styles/global.scss';
import 'styles/custom.scss';

const App = () => {
  // const dispatch = useDispatch();

  // useEffect(() => {
  //   dispatch({ type: "auth/checkAuth" }); // Check authentication on load
  // }, [dispatch]);

  return (
    <ChakraProvider theme={theme} resetCss={false} position="relative">
      <BrowserRouter>
        <Switch>
          <Route path="/vendor/auth" component={AuthLayout} />
          <Route path="/vendor" component={ClientLayout} />
          <Redirect from="/" to={PAGE_HOME_URL} />
        </Switch>
      </BrowserRouter>
    </ChakraProvider>
  );
}

export default App;
