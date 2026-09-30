/*
 * WHICH ADDRESSES GET THE API'S HOST, AND WHICH ARE LEFT ALONE.
 *
 * `fileUrl` was written for one kind of path - `/uploads/...`, a file the API
 * stores and serves - and applied the API's host to whatever it was given.
 * Once the About page's artwork moved into the bundle, it was also handed
 * `/static/media/overview.7e427d58.svg`, and turned it into
 * `http://localhost:3401/static/media/...` in development and an address on
 * the wrong server in production, where the site is served under its own path
 * prefix and the API is somewhere else.
 *
 * So what is held here is the division: uploads are the API's, everything
 * else is already where the browser should go.
 */
import { baseURL, fileUrl } from '../api/client';

const API_ORIGIN = baseURL.replace(/\/api\/?$/, '');

test('an upload is served by the API', () => {
  expect(fileUrl('/uploads/products/c9-pro.jpg')).toBe(API_ORIGIN + '/uploads/products/c9-pro.jpg');
});

test('a picture the build emitted keeps the address webpack gave it', () => {
  expect(fileUrl('/static/media/overview.7e427d58.svg')).toBe('/static/media/overview.7e427d58.svg');

  /* Built for a path prefix, PUBLIC_URL is already part of it. */
  expect(fileUrl('/crystal_web/static/media/overview.7e427d58.svg'))
    .toBe('/crystal_web/static/media/overview.7e427d58.svg');
});

test('a whole address, a data URL and a blob URL pass straight through', () => {
  expect(fileUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
  expect(fileUrl('//cdn.example.com/a.png')).toBe('//cdn.example.com/a.png');
  expect(fileUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
  expect(fileUrl('blob:http://localhost:3401/9f2c')).toBe('blob:http://localhost:3401/9f2c');
});

test('nothing in, nothing out', () => {
  expect(fileUrl(null)).toBe(null);
  expect(fileUrl('')).toBe(null);
});
