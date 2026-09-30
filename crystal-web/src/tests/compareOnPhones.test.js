/*
 * COMPARING, ON A PHONE.
 *
 * "I add a phone to compare and the bar at the bottom never appears" was not
 * the bar. The product list's filter row was wider than a 390px screen, the
 * browser widened its layout viewport to fit the page, and a bar fixed to the
 * bottom of THAT viewport was drawn below the glass. The compare page had the
 * same overflow, with its Clear button pushed off the right edge.
 *
 * jsdom has no layout, so what is held here is the part that can be read
 * without one: the shapes that decide whether a row fits - no control that
 * insists on half the screen beside another that will not shrink - and that
 * the tray, once something is in it, is on the page with its own space
 * reserved at the end of it.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ChakraProvider } from '@chakra-ui/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';

import theme from '@/theme';
import { I18nProvider } from '@/i18n';
import compare, { toggle } from '@/app/compareSlice';
import CompareTray, { TRAY_HEIGHT } from '@/components/product/CompareTray';
import ProductList from '@/pages/common/ProductList';
import Compare from '@/pages/smartphones/Compare';
import { SecurityProvider } from '@/components/security/SecurityProvider';

jest.mock('@/api', () => ({
  __esModule: true,
  default: {
    catalog: {
      series: () => Promise.resolve({ data: [{ slug: 'c9', name: 'C9', product_cnt: 3 }] }),
      products: () => Promise.resolve({ data: { rows: [], total: 0, page: 1, limit: 12 } }),
      comparable: () => Promise.resolve({ data: [] }),
      compare: () => Promise.resolve({ data: null })
    }
  },
  fileUrl: (p) => p || ''
}));

const PHONES = [
  { id: 1, slug: 'c9-pro', name: 'Crystal C9 Pro', main_image: '/uploads/a.png', main_image_integrity: null },
  { id: 2, slug: 'c9', name: 'Crystal C9', main_image: '/uploads/b.png', main_image_integrity: null }
];

let warned;
const originalWidth = window.innerWidth;

beforeEach(() => {
  /* The unsigned test pictures are refused, and say so in the console. */
  warned = jest.spyOn(console, 'warn').mockImplementation(() => {});
  window.localStorage.clear();
  window.innerWidth = 360;
  window.dispatchEvent(new Event('resize'));
});

afterEach(() => {
  warned.mockRestore();
  window.innerWidth = originalWidth;
  document.body.innerHTML = '';
});

/*
 * The chips' pictures are signed; what they show is not the question here, so
 * the verifier simply refuses every one of them (and says nothing about the
 * build having no trusted keys, which the real one would).
 */
const REFUSING = {
  verifyImage: () => Promise.resolve({ state: 'invalid', content: null, blob: null, reason: 'test' })
};

function mount(element, path, items) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const store = configureStore({ reducer: { compare } });
  (items || []).forEach((item) => store.dispatch(toggle(item)));

  act(() => {
    ReactDOM.render(
      <ChakraProvider theme={theme}>
        <I18nProvider>
          <Provider store={store}>
            <SecurityProvider verifier={REFUSING}>
              <MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>
            </SecurityProvider>
          </Provider>
        </I18nProvider>
      </ChakraProvider>,
      host
    );
  });

  return {
    host: host,
    unmount() { act(() => { ReactDOM.unmountComponentAtNode(host); }); }
  };
}

async function settle() {
  for (let i = 0; i < 6; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }
}

const style = (node) => window.getComputedStyle(node);

test('the tray is on the page once a phone is in it, with its height reserved at the end', async () => {
  const ui = mount(<CompareTray />, '/smartphones/products', PHONES);
  await settle();

  const tray = ui.host.querySelector('[data-compare-tray]');
  expect(tray).not.toBe(null);
  expect(style(tray).position).toBe('fixed');
  expect(style(tray).bottom).toBe('0px');

  /* Every chip can be taken out, and the way on to the comparison is there. */
  expect(tray.querySelector('button[aria-label="Remove Crystal C9 Pro"]')).not.toBe(null);
  expect(tray.querySelector('button[aria-label="Remove Crystal C9"]')).not.toBe(null);
  expect(tray.textContent).toContain('Compare 2');

  /*
   * THE SPACER is what stops a bar fixed over the bottom of the page from
   * covering the footer's last lines for good: the same height as the bar,
   * in the flow of the page.
   */
  const spacer = ui.host.querySelector('[data-compare-tray-spacer]');
  expect(spacer).not.toBe(null);
  expect(spacer.getAttribute('aria-hidden')).toBe('true');
  /* The bar's row and its 1px top border (the safe area is padding, which jsdom cannot resolve). */
  expect(style(spacer).height).toBe((TRAY_HEIGHT + 1) + 'px');

  ui.unmount();
});

test('the tray stays off the compare page and off pages that cannot compare', async () => {
  const onCompare = mount(<CompareTray />, '/smartphones/compare', PHONES);
  expect(onCompare.host.querySelector('[data-compare-tray]')).toBe(null);
  onCompare.unmount();

  const onBlog = mount(<CompareTray />, '/blog', PHONES);
  expect(onBlog.host.querySelector('[data-compare-tray]')).toBe(null);
  expect(onBlog.host.querySelector('[data-compare-tray-spacer]')).toBe(null);
  onBlog.unmount();
});

test('on a phone the list\'s two selects share one row whose columns may shrink', async () => {
  const ui = mount(
    <ProductList categoryType="SMARTPHONE" sectionPath="/smartphones" title="Smartphones" />,
    '/smartphones/products'
  );
  await settle();

  /*
   * The row that overflowed: each select was at least half the screen, next
   * to a button that does not shrink. Now they are the two columns of a grid
   * that are allowed to be narrower than their text.
   */
  const grids = Array.prototype.slice.call(ui.host.querySelectorAll('div'))
    .filter((node) => style(node).gridTemplateColumns === 'minmax(0, 1fr) minmax(0, 1fr)');
  expect(grids.length).toBe(1);
  expect(grids[0].children.length).toBe(2);

  /* And nothing on the row still claims half the screen as a minimum. */
  Array.prototype.forEach.call(ui.host.querySelectorAll('div'), (node) => {
    expect(style(node).minWidth).not.toBe('50%');
  });

  ui.unmount();
});

test('on a phone the compare page\'s select takes only what the Clear button leaves', async () => {
  const ui = mount(<Compare />, '/smartphones/compare', PHONES);
  await settle();

  const clear = Array.prototype.slice.call(ui.host.querySelectorAll('button'))
    .filter((button) => button.textContent === 'Clear')[0];
  expect(clear).toBeTruthy();

  /* The select's box is the flexible one; it used to be minW 100%, which pushed Clear off screen. */
  const row = clear.parentNode;
  const selectBox = row.firstChild;
  expect(style(selectBox).minWidth).toBe('0px');
  expect(style(selectBox).flexGrow).toBe('1');
  expect(style(clear).flexShrink).toBe('0');

  ui.unmount();
});
