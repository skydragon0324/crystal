import React from 'react';
import ReactDOM from 'react-dom';
import { ChakraProvider, ColorModeScript } from '@chakra-ui/react';
import { Provider } from 'react-redux';

// Chrome 72 is the floor (spec 2). CRA's preset-env handles the syntax, but
// the runtime helpers regenerator emits for async/await have to be present
// before any application code runs.
import 'core-js/stable';
import 'regenerator-runtime/runtime';

/*
 * The two things the console needs settled before it paints.
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
import theme, { buildTheme } from './theme';
import { AppearanceProvider, useAppearance } from './app/appearance';

boot();

/**
 * The theme, rebuilt when the chosen primary colour changes.
 *
 * ChakraProvider resolves a theme into CSS variables once, when it is given
 * one - so changing the palette means handing it a NEW object rather than
 * mutating the old. useMemo keeps that to the moments it actually changed.
 *
 * It sits INSIDE AppearanceProvider and outside everything else, which is
 * the only place it can be: it has to read the choice, and every component
 * below it has to read the theme.
 */
function Themed({ children }) {
  const { palette } = useAppearance();
  const current = React.useMemo(() => buildTheme(palette), [palette]);

  return <ChakraProvider theme={current}>{children}</ChakraProvider>;
}

ReactDOM.render(
  <React.StrictMode>
    <Provider store={store}>
      {/* Reads the stored colour mode before first paint, so a dark-mode
          session does not flash white on every reload. */}
      <ColorModeScript initialColorMode={theme.config.initialColorMode} />
      <AppearanceProvider>
        <Themed>
          <App />
        </Themed>
      </AppearanceProvider>
    </Provider>
  </React.StrictMode>,
  document.getElementById('root')
);
