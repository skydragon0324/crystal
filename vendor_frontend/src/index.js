import React from 'react';
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';
import { ColorModeScript } from '@chakra-ui/react';
import App from './App';
import store from 'store/store';
import theme from 'theme/theme';
import { initLocale } from 'lang/lang';

// Language first: the catalogue has to be pointed at the visitor's stored
// choice before any module renders a label, or the first paint is in the
// wrong language and only corrects on the next render.
initLocale();

ReactDOM.render(
  <Provider store={store}>
    {/*
      Applies the stored colour mode to <html> before React paints. Without
      it a visitor in dark mode gets a white flash on every load, because
      the class is otherwise only set once the provider has mounted.
    */}
    <ColorModeScript initialColorMode={theme.config.initialColorMode} />
    <App />
  </Provider>,
  document.getElementById('root')
);
