import React from 'react';
import ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { ChakraProvider } from '@chakra-ui/react';

import Toolbar from '../components/Toolbar';
import { I18nProvider } from '../i18n';
import theme from '../theme';

function mount(onSearch) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    ReactDOM.render(
      <ChakraProvider theme={theme}>
        <I18nProvider><Toolbar search="" onSearch={onSearch} /></I18nProvider>
      </ChakraProvider>,
      host
    );
  });
  return { host: host, input: host.querySelector('input') };
}

afterEach(() => {
  jest.useRealTimers();
  document.body.innerHTML = '';
});

test('table search waits for a typing pause instead of requesting per key', () => {
  jest.useFakeTimers();
  const onSearch = jest.fn();
  const ui = mount(onSearch);

  act(() => { Simulate.change(ui.input, { target: { value: 'crys' } }); });
  act(() => { Simulate.change(ui.input, { target: { value: 'crystal' } }); });
  expect(onSearch).not.toHaveBeenCalled();

  act(() => { jest.advanceTimersByTime(299); });
  expect(onSearch).not.toHaveBeenCalled();
  act(() => { jest.advanceTimersByTime(1); });
  expect(onSearch).toHaveBeenCalledTimes(1);
  expect(onSearch).toHaveBeenCalledWith('crystal');

  act(() => { ReactDOM.unmountComponentAtNode(ui.host); });
});

test('Enter submits a table search immediately', () => {
  jest.useFakeTimers();
  const onSearch = jest.fn();
  const ui = mount(onSearch);

  act(() => { Simulate.change(ui.input, { target: { value: 'C9' } }); });
  act(() => { Simulate.keyDown(ui.input, { key: 'Enter' }); });
  expect(onSearch).toHaveBeenCalledWith('C9');

  act(() => { ReactDOM.unmountComponentAtNode(ui.host); });
});
