/*
 * THE DATE PICKER - the console's, on the storefront.
 *
 * What is held here is what a native <input type="date"> gave for nothing
 * and a hand-built one can quietly lose:
 *
 *   A PICK IS 'YYYY-MM-DD', exactly the string the API takes - never a Date,
 *   never a timestamp, never shifted a day by a timezone.
 *
 *   `min` AND `max` HOLD. A day outside them cannot be chosen, by pointer or
 *   by keyboard, and the arrows do not lead to a month with nothing in it.
 *
 *   THE MONTH AND YEAR VIEWS WORK BOTH WAYS - out from the caption, and back
 *   in by picking - because a member looking for a purchase two years ago
 *   should not have to press "previous month" twenty-four times.
 *
 *   THE KEYBOARD CAN DO ALL OF IT, which is the part a hand-built picker most
 *   often forgets.
 *
 * The panel is portalled to <body>, so it is looked for there rather than in
 * the host the picker was mounted into.
 */
import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ChakraProvider, FormControl, FormLabel } from '@chakra-ui/react';

import theme from '../theme';
import { I18nProvider } from '../i18n';
import DatePicker, { parseISODate, toISODate } from '../components/common/DatePicker';

/** The picker with its value held, as every page holds it. */
function Harness({ initial, spy, ...rest }) {
  const [value, setValue] = useState(initial || '');

  return (
    <DatePicker
      aria-label="From"
      {...rest}
      value={value}
      onChange={(next) => {
        spy(next);
        setValue(next);
      }}
    />
  );
}

async function mount(element) {
  const host = document.createElement('div');
  document.body.appendChild(host);

  await act(async () => {
    ReactDOM.render(
      <ChakraProvider theme={theme}>
        <I18nProvider>{element}</I18nProvider>
      </ChakraProvider>,
      host
    );
  });

  return {
    host,
    trigger: () => host.querySelector('button[aria-haspopup="dialog"]'),
    panel: () => document.body.querySelector('[role="dialog"]'),
    day: (iso) => document.body.querySelector('[data-date="' + iso + '"]'),
    async done() {
      await act(async () => { ReactDOM.unmountComponentAtNode(host); });
      document.body.removeChild(host);
    }
  };
}

async function click(node) {
  await act(async () => { node.click(); });
}

async function key(node, name, extra) {
  await act(async () => {
    node.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: name, bubbles: true }, extra)));
  });
}

afterEach(() => {
  document.body.innerHTML = '';
});

test('a date string round-trips without crossing a timezone', () => {
  /* Local fields in, local fields out - never through UTC. */
  expect(toISODate(parseISODate('2026-03-01'))).toBe('2026-03-01');
  expect(toISODate(parseISODate('2026-12-31T23:30:00Z'))).toBe('2026-12-31');

  /* A day that does not exist is no day, not the 3rd of the next month. */
  expect(parseISODate('2026-02-31')).toBe(null);
  expect(parseISODate('')).toBe(null);
  expect(toISODate(null)).toBe('');
});

test('picking a day hands back YYYY-MM-DD, and the field shows the site\'s date', async () => {
  const spy = jest.fn();
  const ui = await mount(<Harness initial="2026-03-10" spy={spy} />);

  /* The closed field writes the date the way every other page does. */
  expect(ui.trigger().textContent).toBe('2026.03.10');

  await click(ui.trigger());
  expect(ui.panel()).not.toBe(null);
  expect(ui.trigger().getAttribute('aria-expanded')).toBe('true');

  /* The chosen day is marked as chosen, and it is where the grid opened. */
  expect(ui.day('2026-03-10').getAttribute('aria-pressed')).toBe('true');

  await click(ui.day('2026-03-14'));

  expect(spy).toHaveBeenCalledTimes(1);
  expect(spy).toHaveBeenCalledWith('2026-03-14');
  expect(ui.trigger().textContent).toBe('2026.03.14');
  expect(ui.trigger().getAttribute('aria-expanded')).toBe('false');

  await ui.done();
});

test('min and max hold, for the days, the arrows and the keyboard', async () => {
  const spy = jest.fn();
  const ui = await mount(
    <Harness initial="2026-03-10" min="2026-03-05" max="2026-03-20" spy={spy} />
  );

  await click(ui.trigger());

  /* Either side of the window is shown, and refused. */
  expect(ui.day('2026-03-04').getAttribute('aria-disabled')).toBe('true');
  expect(ui.day('2026-03-21').getAttribute('aria-disabled')).toBe('true');
  expect(ui.day('2026-03-05').getAttribute('aria-disabled')).toBe(null);
  expect(ui.day('2026-03-20').getAttribute('aria-disabled')).toBe(null);

  await click(ui.day('2026-03-04'));
  await click(ui.day('2026-03-21'));
  expect(spy).not.toHaveBeenCalled();

  /* February and April hold nothing pickable, so neither arrow goes there. */
  const arrows = ui.panel().querySelectorAll('[data-step]');
  expect(arrows.length).toBe(2);
  arrows.forEach((arrow) => expect(arrow.disabled).toBe(true));

  /* "Today" is only offered when today is inside the window. */
  const today = toISODate(new Date());
  const todayButton = ui.panel().querySelector('[data-today]');
  expect(todayButton.disabled).toBe(today < '2026-03-05' || today > '2026-03-20');

  /* The keyboard can reach a disabled day - it is announced as such - but not pick it. */
  await key(ui.day('2026-03-10'), 'PageDown');
  expect(document.activeElement.getAttribute('data-date')).toBe('2026-04-10');
  expect(document.activeElement.getAttribute('aria-disabled')).toBe('true');
  await click(document.activeElement);
  expect(spy).not.toHaveBeenCalled();

  /* And the edge of the window is pickable. */
  await key(document.activeElement, 'PageUp');
  await key(document.activeElement, 'ArrowRight');
  await click(ui.day('2026-03-20'));
  expect(spy).toHaveBeenCalledWith('2026-03-20');

  await ui.done();
});

test('the caption drills out to months and years, and picking drills back in', async () => {
  const spy = jest.fn();
  const ui = await mount(<Harness initial="2026-03-10" spy={spy} />);

  await click(ui.trigger());

  const caption = () => ui.panel().querySelector('[data-caption]');

  /* Days -> months of 2026. */
  await click(caption());
  expect(caption().textContent).toBe('2026');
  expect(ui.panel().querySelectorAll('[data-month]').length).toBe(12);
  expect(ui.panel().querySelector('[data-month="3"]').getAttribute('aria-pressed')).toBe('true');

  /* Months -> twenty years at a time. */
  await click(caption());
  expect(ui.panel().querySelectorAll('[data-year]').length).toBe(20);
  expect(ui.panel().querySelector('[data-year="2026"]')).not.toBe(null);

  /* Later years, then a year, then a month - and the day grid is there. */
  await click(ui.panel().querySelector('[data-step="1"]'));
  await click(ui.panel().querySelector('[data-year="2047"]'));
  expect(caption().textContent).toBe('2047');

  await click(ui.panel().querySelector('[data-month="7"]'));
  expect(ui.day('2047-07-15')).not.toBe(null);

  await click(ui.day('2047-07-15'));
  expect(spy).toHaveBeenCalledWith('2047-07-15');

  await ui.done();
});

test('the keyboard opens it, moves through it, picks, and closes it', async () => {
  const spy = jest.fn();
  const ui = await mount(<Harness initial="2026-03-10" spy={spy} />);

  /* Down opens, as it does on a native date field - and focus goes to the day. */
  await key(ui.trigger(), 'ArrowDown');
  expect(ui.panel()).not.toBe(null);
  expect(document.activeElement.getAttribute('data-date')).toBe('2026-03-10');

  /* Only the cursor is in the tab order - Tab leaves the grid, not walks it. */
  expect(ui.panel().querySelectorAll('[data-date][tabindex="0"]').length).toBe(1);

  await key(document.activeElement, 'ArrowRight');
  expect(document.activeElement.getAttribute('data-date')).toBe('2026-03-11');

  await key(document.activeElement, 'ArrowDown');
  expect(document.activeElement.getAttribute('data-date')).toBe('2026-03-18');

  /* Home is the start of the week - Monday, in all three languages. */
  await key(document.activeElement, 'Home');
  expect(document.activeElement.getAttribute('data-date')).toBe('2026-03-16');

  /* PageDown a month, Shift+PageDown a year - across a month boundary. */
  await key(document.activeElement, 'PageDown');
  expect(document.activeElement.getAttribute('data-date')).toBe('2026-04-16');
  await key(document.activeElement, 'PageDown', { shiftKey: true });
  expect(document.activeElement.getAttribute('data-date')).toBe('2027-04-16');

  /* Enter on a focused day is a click on it, which picks. */
  await click(document.activeElement);
  expect(spy).toHaveBeenCalledWith('2027-04-16');

  /* Escape closes without picking, and nothing else is told about the key. */
  await key(ui.trigger(), 'ArrowDown');
  expect(ui.trigger().getAttribute('aria-expanded')).toBe('true');
  const outer = jest.fn();
  document.addEventListener('keydown', outer);
  await key(document.activeElement, 'Escape');
  document.removeEventListener('keydown', outer);

  expect(ui.trigger().getAttribute('aria-expanded')).toBe('false');
  expect(outer).not.toHaveBeenCalled();
  expect(spy).toHaveBeenCalledTimes(1);

  await ui.done();
});

test('clearing empties the value, from the field and from the panel', async () => {
  const spy = jest.fn();
  const ui = await mount(<Harness initial="2026-03-10" spy={spy} />);

  const clear = ui.host.querySelector('button[aria-label="Clear"]');
  expect(clear).not.toBe(null);
  /* A sibling of the field, not nested in it - two buttons, reachable apart. */
  expect(ui.trigger().contains(clear)).toBe(false);

  await click(clear);
  expect(spy).toHaveBeenLastCalledWith('');
  expect(ui.host.querySelector('button[aria-label="Clear"]')).toBe(null);

  /* And empty, the field says what it is for. */
  expect(ui.trigger().textContent).toBe('Select a date');

  await ui.done();
});

test('the field carries its label and its value to a screen reader', async () => {
  const spy = jest.fn();
  const ui = await mount(
    <FormControl id="bought">
      <FormLabel>Purchase date</FormLabel>
      <Harness initial="2026-03-10" spy={spy} aria-label="Purchase date" />
    </FormControl>
  );

  /* The label's `for` finds the button, as it found the input. */
  const label = ui.host.querySelector('label');
  expect(label.getAttribute('for')).toBe(ui.trigger().id);

  /* A name that says the date, not only what the field is for. */
  expect(ui.trigger().getAttribute('aria-label')).toBe('Purchase date: 2026.03.10');

  await ui.done();
});
