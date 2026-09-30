import {
  contentVerificationEnabled,
  contentVerificationMode,
  createServerVerifiedRenderer,
  createUnverifiedRenderer
} from '../security/verifyContent';
import { STATES } from '../security/verifySignature';

const NOTICE = {
  id: 7,
  title: 'Maintenance',
  content: '<p>Tonight</p>',
  originId: null,
  status: 'PUBLISHED',
  startsAt: null,
  endsAt: null,
  sortOrder: 10,
  createdAt: '2026-09-20T12:00:00.000Z',
  updatedAt: '2026-09-20T12:00:00.000Z'
};

test('verification policy distinguishes browser, server and explicit off modes', () => {
  expect(contentVerificationEnabled('')).toBe(true);
  expect(contentVerificationEnabled('required')).toBe(true);
  expect(contentVerificationMode('server')).toBe('server');
  expect(contentVerificationEnabled('server')).toBe(false);
  expect(contentVerificationMode('backend')).toBe('server');
  expect(contentVerificationEnabled('off')).toBe(false);
  expect(contentVerificationEnabled('false')).toBe(false);
  expect(contentVerificationEnabled('0')).toBe(false);
});

test('server mode renders only text retained by the backend integrity gate', async () => {
  const renderer = createServerVerifiedRenderer();
  const accepted = await renderer.verifyText('notification', { content: NOTICE });
  const refused = await renderer.verifyText('notification', null);

  expect(accepted.state).toBe(STATES.VERIFIED);
  expect(accepted.content).toEqual(NOTICE);
  expect(refused.state).toBe(STATES.INVALID);
});

test('server mode requires an integrity envelope and uses the verified image endpoint', async () => {
  const path = '/uploads/products/c9/main.png';
  const renderer = createServerVerifiedRenderer({
    resolveUrl: (value, sha256) => '/api/site/verified-image?path=' + encodeURIComponent(value) + '&sha256=' + sha256
  });
  const integrity = {
    content: {
      storageKey: path,
      mimeType: 'image/png',
      size: 123,
      sha256: 'a'.repeat(64)
    }
  };

  const accepted = await renderer.verifyImage(integrity, { expectedPath: path });
  expect(accepted.state).toBe(STATES.VERIFIED);
  expect(accepted.directUrl).toBe(
    '/api/site/verified-image?path=%2Fuploads%2Fproducts%2Fc9%2Fmain.png&sha256=' + 'a'.repeat(64)
  );
  expect((await renderer.verifyImage(null, { expectedPath: path })).state).toBe(STATES.INVALID);
});

test('HTTP compatibility mode renders schema-valid text without checking a signature', async () => {
  const renderer = createUnverifiedRenderer();
  const answer = await renderer.verifyText('notification', {
    content: NOTICE,
    signature: { value: 'deliberately not checked' }
  });

  expect(answer.state).toBe(STATES.VERIFIED);
  expect(answer.content).toEqual(NOTICE);
});

test('HTTP compatibility mode uses the row image path without WebCrypto or an envelope', async () => {
  const renderer = createUnverifiedRenderer({ resolveUrl: (path) => 'http://lan.example' + path });
  const answer = await renderer.verifyImage(null, { expectedPath: '/uploads/products/c9/main.png' });

  expect(answer.state).toBe(STATES.VERIFIED);
  expect(answer.directUrl).toBe('http://lan.example/uploads/products/c9/main.png');
  expect(answer.blob).toBeNull();
});
