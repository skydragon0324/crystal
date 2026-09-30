import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ChakraProvider } from '@chakra-ui/react';

import theme from '../theme';
import { I18nProvider } from '../i18n';

const mockUpload = jest.fn();
const mockDiscard = jest.fn();

jest.mock('../api', () => ({
  media: {
    upload: (...args) => mockUpload(...args),
    uploadDocument: (...args) => mockUpload(...args),
    discard: (...args) => mockDiscard(...args)
  }
}));

import FormModal from '../components/FormModal';

function renderForm(onSubmit) {
  const host = document.createElement('div');
  document.body.appendChild(host);

  act(() => {
    ReactDOM.render(
      <ChakraProvider theme={theme}>
        <I18nProvider>
          <FormModal
            isOpen
            title="Picture"
            onClose={() => {}}
            onSubmit={onSubmit}
            fields={[{ name: 'cover', label: 'Cover', type: 'image', folder: 'products' }]}
            initial={{}}
          />
        </I18nProvider>
      </ChakraProvider>,
      host
    );
  });

  return () => {
    ReactDOM.unmountComponentAtNode(host);
    document.body.removeChild(host);
  };
}

function button(name) {
  return Array.from(document.body.querySelectorAll('button'))
    .filter((node) => node.textContent === name)[0];
}

async function choose(file) {
  const input = document.body.querySelector('input[type="file"]');
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
  });
}

async function save() {
  await act(async () => {
    button('Save').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('deferred image uploads', () => {
  beforeEach(() => {
    mockUpload.mockReset();
    mockDiscard.mockReset();
    mockUpload.mockResolvedValue({ data: { file_path: '/uploads/products/new.png' } });
    mockDiscard.mockResolvedValue({ data: null });
    URL.createObjectURL = jest.fn(() => 'blob:pending');
    URL.revokeObjectURL = jest.fn();
  });

  test('choosing a file keeps it in the browser until Save', async () => {
    const submitted = jest.fn(() => Promise.resolve(true));
    const cleanup = renderForm(submitted);

    await choose(new File(['picture'], 'new.png', { type: 'image/png' }));
    expect(mockUpload).not.toHaveBeenCalled();

    await save();
    expect(mockUpload).toHaveBeenCalledWith('products', expect.any(File));
    expect(submitted).toHaveBeenCalledWith({ cover: '/uploads/products/new.png' });
    expect(mockDiscard).not.toHaveBeenCalled();

    cleanup();
  });

  test('a failed database save discards the newly uploaded bytes', async () => {
    const cleanup = renderForm(() => Promise.resolve(false));

    await choose(new File(['picture'], 'new.png', { type: 'image/png' }));
    await save();

    expect(mockDiscard).toHaveBeenCalledWith('/uploads/products/new.png');
    cleanup();
  });
});
