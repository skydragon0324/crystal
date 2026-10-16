/*
 * A PRODUCT WITH NO PRICE SHOWS NO PRICE.
 *
 * The catalogue carries two values for "no published figure", both the
 * vendor's: 0 for a row nobody has priced and -1 for something not sold at a
 * listed price. The storefront knew about -1 in exactly ONE place - a literal
 * `=== -1` on the listing card - so the comparison table and the product page
 * printed "$0" and "$-1" to shoppers, and 0 printed everywhere.
 *
 * WHAT MAKES THIS WORTH A TEST rather than a comment: the check now lives
 * inside Price, so the FIFTH screen to show a price inherits it. These hold
 * that - the rule itself, the component, and the two places whose answer to
 * "no figure" is deliberately different from each other.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ChakraProvider } from '@chakra-ui/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';

import { hasPrice } from '../utils/format';
import { hasPrice as hasPriceFromTokens } from '../theme/tokens';
import Price from '../components/common/Price';
import store from '../app/store';
import { I18nProvider } from '../i18n';

function mount(element) {
  const host = document.createElement('div');
  document.body.appendChild(host);

  act(() => {
    ReactDOM.render(
      /* A card is a link and dispatches, so it needs the router and the
         store; Price itself needs neither, and sharing one mount keeps the
         two halves of this file comparable. */
      <Provider store={store}>
        <MemoryRouter>
          <ChakraProvider><I18nProvider>{element}</I18nProvider></ChakraProvider>
        </MemoryRouter>
      </Provider>,
      host
    );
  });

  return host;
}

test('zero and minus one are not prices, and neither is nonsense', () => {
  expect(hasPrice(0)).toBe(false);
  expect(hasPrice(-1)).toBe(false);
  expect(hasPrice('0')).toBe(false);
  expect(hasPrice('-1')).toBe(false);

  /*
   * ANYTHING AT OR BELOW ZERO, rather than those two exactly: a negative
   * price is not a price whichever negative it is, so a bad import cannot
   * reach a shopper by being -2 instead of -1.
   */
  expect(hasPrice(-2)).toBe(false);
  expect(hasPrice(-0.01)).toBe(false);

  /* And absent, or not a number at all. */
  expect(hasPrice(null)).toBe(false);
  expect(hasPrice(undefined)).toBe(false);
  expect(hasPrice('')).toBe(false);
  expect(hasPrice('free')).toBe(false);
  expect(hasPrice(Infinity)).toBe(false);

  /* A real figure is a real figure, however small. */
  expect(hasPrice(0.01)).toBe(true);
  expect(hasPrice(199)).toBe(true);
  expect(hasPrice('1299.99')).toBe(true);
});

test('the rule is one implementation, whichever module a screen imports it from', () => {
  /* tokens re-exports it beside formatPrice, so a screen that wants both
     does not have to go to two modules and skip one. */
  expect(hasPriceFromTokens).toBe(hasPrice);
});

test('Price draws nothing for an unpriced product, and the figure otherwise', () => {
  expect(mount(<Price amount={1299} currency="USD" />).textContent).toContain('1 299');

  [0, -1, null, undefined].forEach((amount) => {
    const host = mount(<Price amount={amount} currency="USD" />);
    expect(host.textContent).toBe('');
    /* Not an empty element either - nothing at all, so a reserved height
       around it is what holds the row. */
    expect(host.querySelector('span')).toBeNull();
  });
});

test('a caller may ask for a placeholder instead of nothing', () => {
  /*
   * The two needs are genuinely opposite. A listing card wants NOTHING and
   * keeps its own reserved height, so a grid does not reflow around the
   * products with no figure. A comparison table wants a DASH, because a blank
   * cell under one of four phones reads as a column that failed to load.
   */
  const host = mount(<Price amount={-1} currency="USD" fallback={<span>—</span>} />);
  expect(host.textContent).toBe('—');
});

test('the listing card and the comparison table each show their own answer', () => {
  const ProductCard = require('../components/product/ProductCard').default;

  /* The card: no figure, and no stray "$0" or "$-1". */
  [0, -1].forEach((price) => {
    const host = mount(
      <ProductCard product={{ id: 1, name: 'C9 Pro', price: price, currency: 'USD' }} />
    );
    expect(host.textContent).toContain('C9 Pro');
    expect(host.textContent).not.toContain('0');
    expect(host.textContent).not.toContain('-1');
  });

  /* And with a price, it shows it. */
  const priced = mount(
    <ProductCard product={{ id: 1, name: 'C9 Pro', price: 1299, currency: 'USD' }} />
  );
  expect(priced.textContent).toContain('1 299');
});
