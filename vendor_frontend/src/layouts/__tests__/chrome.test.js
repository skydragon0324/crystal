import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import theme from 'theme/theme';
import ClientHeader from 'layouts/header/ClientHeader';
import ClientFooter from 'layouts/footer/ClientFooter';
import { getClientMenus } from 'constants/clientMenus';
import { getFooterColumns } from 'constants/siteNav';
import { PAGE_HOME_URL, PAGE_FEEDBACK_URL } from 'constants/constants';

/**
 * Render tests for the site chrome.
 *
 * The production build only proves the modules resolve and the JSX parses.
 * These mount the header and footer for real, so a bad Chakra prop, a
 * missing export or a broken link shows up here instead of in the browser.
 *
 * A hand-rolled store stands in for the real one: importing store/store
 * would start the saga middleware and fire a network request on mount.
 */
const makeStore = (state) => ({
  getState: () => state,
  subscribe: () => () => {},
  dispatch: () => {},
});

const SIGNED_OUT = { client: { user: null, isAuthenticated: false, loading: false }, config: { fixed: false } };
const SIGNED_IN = {
  client: {
    user: { user_pk: 1001, user_id: 'demo', user_name: 'Demo User' },
    isAuthenticated: true,
    loading: false,
  },
  config: { fixed: false },
};

let container;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  ReactDOM.unmountComponentAtNode(container);
  container.remove();
  container = null;
});

const render = (ui, state, route = '/vendor/phone/products') => {
  act(() => {
    ReactDOM.render(
      <Provider store={makeStore(state)}>
        <ChakraProvider theme={theme}>
          <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
        </ChakraProvider>
      </Provider>,
      container
    );
  });
};

const hrefs = () =>
  Array.from(container.querySelectorAll('a[href]')).map((a) => a.getAttribute('href'));

describe('ClientHeader', () => {
  it('renders without throwing', () => {
    render(<ClientHeader />, SIGNED_OUT);
    expect(container.querySelector('header')).toBeTruthy();
  });

  it('shows every top-level entry from the client menus', () => {
    render(<ClientHeader />, SIGNED_OUT);
    const text = container.textContent;

    getClientMenus().forEach((group) => {
      const name = group.category ? group.category.name : group.menus[0].name;
      expect(text).toContain(name);
    });
  });

  it('points the logo at a route that exists', () => {
    render(<ClientHeader />, SIGNED_OUT);
    expect(hrefs()).toContain(PAGE_HOME_URL);
  });

  it('offers sign-in when signed out and the account name when signed in', () => {
    render(<ClientHeader />, SIGNED_OUT);
    expect(container.textContent).toContain('Sign in');
    expect(container.textContent).not.toContain('Demo User');

    ReactDOM.unmountComponentAtNode(container);

    render(<ClientHeader />, SIGNED_IN);
    expect(container.textContent).toContain('Demo User');
    expect(container.textContent).not.toContain('Sign in');
  });

  it('never links a category that has no route of its own', () => {
    render(<ClientHeader />, SIGNED_OUT);
    // "/vendor/phone" is a dropdown label, not a page.
    expect(hrefs()).not.toContain('/vendor/phone');
  });

  it('has a single <header> landmark', () => {
    render(<ClientHeader />, SIGNED_OUT);
    expect(container.querySelectorAll('header').length).toBe(1);
  });
});

describe('ClientFooter', () => {
  it('renders without throwing', () => {
    render(<ClientFooter />, SIGNED_OUT);
    expect(container.querySelector('footer')).toBeTruthy();
  });

  it('renders every column heading', () => {
    render(<ClientFooter />, SIGNED_OUT);
    getFooterColumns().forEach((column) => {
      expect(container.textContent).toContain(column.title);
    });
  });

  it('shows the support number and the current year', () => {
    render(<ClientFooter />, SIGNED_OUT);
    expect(container.textContent).toContain('191-000-1234');
    expect(container.textContent).toContain(String(new Date().getFullYear()));
  });

  it('hides account-only links from signed-out visitors', () => {
    render(<ClientFooter />, SIGNED_OUT);
    expect(hrefs()).not.toContain(PAGE_FEEDBACK_URL);

    ReactDOM.unmountComponentAtNode(container);

    render(<ClientFooter />, SIGNED_IN);
    expect(hrefs()).toContain(PAGE_FEEDBACK_URL);
  });

  it('links only to internal routes under /vendor or to declared external paths', () => {
    render(<ClientFooter />, SIGNED_IN);
    const declared = getFooterColumns()
      .reduce((all, column) => all.concat(column.links), [])
      .filter((link) => link.external)
      .map((link) => link.path);

    hrefs()
      .filter((href) => href && !href.startsWith('tel:'))
      .forEach((href) => {
        const known = href.startsWith('/vendor') || declared.indexOf(href) !== -1;
        expect(known).toBe(true);
      });
  });
});
