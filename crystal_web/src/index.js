import React from 'react';
import ReactDOM from 'react-dom';
import { ChakraProvider, ColorModeScript } from '@chakra-ui/react';
import { Provider } from 'react-redux';
import { I18nProvider } from '@/i18n';

// Chrome 72 is the floor (spec 2). CRA's preset-env handles the syntax, but
// the helpers regenerator emits for async/await must exist before any
// application code runs.
import 'core-js/stable';
import 'regenerator-runtime/runtime';

/*
 * The one thing the site needs settled before it paints.
 *
 * boot() feature-tests flexbox `gap`, which did not ship until Chrome 84,
 * and marks the document when it is missing so styles/app.css can rebuild
 * the spacing out of margins.  It runs before the first render, so nothing
 * is ever painted with the wrong spacing and then corrected.
 */
import './styles/app.css';
import boot from './boot';

import App from './App';
import store from './app/store';
import theme from './theme';

boot();

ReactDOM.render(
  <React.StrictMode>
    <Provider store={store}>
      {/* Reads the stored colour mode before first paint, so a dark-mode
          visitor does not get a white flash on every load. */}
      <ColorModeScript initialColorMode={theme.config.initialColorMode} />
      <ChakraProvider theme={theme}>
        {/* Outside the router, so a language change re-renders every route
            at once rather than only the page that happened to be open. */}
        <I18nProvider>
          <App />
        </I18nProvider>
      </ChakraProvider>
    </Provider>
  </React.StrictMode>,
  document.getElementById('root')
);
