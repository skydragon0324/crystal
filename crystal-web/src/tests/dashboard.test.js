/*
 * THE MEMBER DASHBOARD IS FOUR CARDS AND THE MEMBER'S DETAILS - and nothing else.
 *
 * The page used to be every balance in four systems, a merged timeline, the
 * member's devices and their repairs. The member asked for four figures -
 * commerce value, software points, register points, activity points - and who
 * they are underneath, and for everything else to go. What is held here:
 *
 *   THE FOUR, IN THEIR ORDER, each with its figure, the line saying what it
 *   adds up, its parts, and the way to the rows behind it - and no fifth
 *   thing on the page.
 *
 *   THE DETAILS, translated where they are words (a gender) and formatted where
 *   they are data (a birthday), with every one of the member's numbers.
 *
 *   A DASH FOR WHAT IS MISSING, never a blank that reads as unfinished and never
 *   a 0 for a figure nobody could read.
 *
 *   WHAT DID NOT LOAD IS SAID, and what did load stays on the page.
 *
 * The figures themselves - which rows each one sums - are the server's, and
 * are held against the tables by crystal-backend/scripts/check.js.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';

import theme from '../theme';
import { I18nProvider } from '../i18n';
import Dashboard from '../pages/account/Dashboard';

/*
 * What the next call to /account/dashboard answers - a promise, so a test can
 * leave it pending or reject it. `var` and the `mock` prefix are jest's rule
 * for anything its hoisted factory reaches for.
 */
// eslint-disable-next-line no-var
var mockAnswer = null;

jest.mock('../api', () => ({
  __esModule: true,
  default: {
    account: {
      dashboard: () => mockAnswer()
    }
  },
  fileUrl: (p) => p || ''
}));

/** The reply as the API writes it for the demo member (see services/member.service.js). */
function reply(overrides) {
  const body = {
    cards: [
      { key: 'COMMERCE', unit: 'money', value: 77.72, state: 'OK', to: '/account/eshop/commerce', parts: [] },
      {
        key: 'SOFTWARE',
        unit: 'points',
        value: 707.8,
        state: 'OK',
        to: '/account/points?source=APPSTORE',
        parts: [
          { key: 'APPSTORE', value: 363.9, state: 'OK', to: '/account/points?source=APPSTORE' },
          { key: 'KARAOKE', value: 213.8, state: 'OK', to: '/account/points?source=KARAOKE' },
          { key: 'MEDIA', value: 241.9, state: 'OK', to: '/account/points?source=MEDIA' },
          { key: 'MINUS', value: -111.8, state: 'OK', to: '/account/points?source=SOFTWARE' }
        ]
      },
      {
        key: 'REGISTER',
        unit: 'points',
        value: 4694,
        state: 'OK',
        to: '/account/eproduct/registrations',
        parts: [
          { key: 'PHONE', value: 800, state: 'OK', to: null },
          { key: 'EPRODUCT', value: 3894, state: 'OK', to: '/account/eproduct/registrations' }
        ]
      },
      {
        key: 'ACTIVITY',
        unit: 'points',
        value: 704,
        state: 'OK',
        to: '/account/points/activity',
        parts: [
          { key: 'LIMIT', value: 3000, state: 'OK', to: null },
          { key: 'MINUS', value: 0, state: 'OK', to: null }
        ]
      }
    ],
    member: {
      state: 'OK',
      user_id: 'demo.1',
      user_name: 'Crystal demo',
      gender: 'F',
      birthday: '1992-03-18',
      phones: ['13810007919', '13810009030']
    }
  };

  return Object.assign(body, overrides || {});
}

let host = null;

async function mount(answer, locale) {
  mockAnswer = answer;
  window.localStorage.setItem('crystal.web.locale', locale || 'en');

  host = document.createElement('div');
  document.body.appendChild(host);

  await act(async () => {
    ReactDOM.render(
      <ChakraProvider theme={theme}>
        <I18nProvider>
          <MemoryRouter initialEntries={['/account']}>
            <Dashboard />
          </MemoryRouter>
        </I18nProvider>
      </ChakraProvider>,
      host
    );
  });

  return host;
}

afterEach(() => {
  ReactDOM.unmountComponentAtNode(host);
  host.remove();
  window.localStorage.clear();
});

const answered = (body) => () => Promise.resolve({ data: body });

/** The text of one field in the details panel, by its label. */
function detail(root, label) {
  const field = Array.from(root.querySelectorAll('[data-detail]'))
    .filter((node) => node.querySelector('dt').textContent === label)[0];
  return field ? field.querySelector('dd') : null;
}

function card(root, key) {
  return root.querySelector('[data-card="' + key + '"]');
}

test('four cards, in the order the member asked for, and nothing else on the page', async () => {
  const root = await mount(answered(reply()));

  const keys = Array.from(root.querySelectorAll('[data-card]')).map((node) => node.getAttribute('data-card'));
  expect(keys).toEqual(['COMMERCE', 'SOFTWARE', 'REGISTER', 'ACTIVITY']);

  /* Four cards and one details panel are every section there is. */
  expect(root.querySelectorAll('section')).toHaveLength(5);
  expect(root.querySelectorAll('[data-details]')).toHaveLength(1);
  expect(root.textContent).not.toMatch(/Where you stand|Your devices|Repairs in progress/);
  expect(root.querySelector('[role="alert"]')).toBeNull();
});

test('each card has its figure, the line saying what it adds up, its parts and its way to the rows', async () => {
  const root = await mount(answered(reply()));

  const figure = (key) => card(root, key).querySelector('[data-figure]').textContent;
  expect(figure('COMMERCE')).toBe('77.72');
  expect(figure('SOFTWARE')).toBe('707.8');
  expect(figure('REGISTER')).toBe('4 694');
  expect(figure('ACTIVITY')).toBe('704');

  expect(card(root, 'COMMERCE').textContent).toContain('The commerce value on your Eshop card.');
  expect(card(root, 'SOFTWARE').textContent).toContain('with the Minus deductions taken off');
  expect(card(root, 'REGISTER').textContent).toContain('Points for registering phones, plus points for registering products');
  expect(card(root, 'ACTIVITY').textContent).toContain('Your activity points on record');

  /* The software parts, each to its own ledger - Minus included, and negative. */
  const software = Array.from(card(root, 'SOFTWARE').querySelectorAll('[data-part]'));
  expect(software.map((node) => node.getAttribute('data-part'))).toEqual(['APPSTORE', 'KARAOKE', 'MEDIA', 'MINUS']);
  expect(software.map((node) => node.getAttribute('href'))).toEqual([
    '/account/points?source=APPSTORE', '/account/points?source=KARAOKE',
    '/account/points?source=MEDIA', '/account/points?source=SOFTWARE'
  ]);
  expect(software[3].textContent).toContain('-111.8');

  /* Phone registrations have no page on the site, so that part is not a link. */
  const phone = card(root, 'REGISTER').querySelector('[data-part="PHONE"]');
  expect(phone.tagName).toBe('DIV');
  expect(phone.textContent).toContain('800');

  const links = ['COMMERCE', 'SOFTWARE', 'REGISTER', 'ACTIVITY'].map((key) => {
    const anchors = Array.from(card(root, key).querySelectorAll('a'))
      .filter((a) => a.textContent.indexOf('See the log') !== -1);
    return anchors.length ? anchors[0].getAttribute('href') : null;
  });
  expect(links).toEqual([
    '/account/eshop/commerce', '/account/points?source=APPSTORE',
    '/account/eproduct/registrations', '/account/points/activity'
  ]);
});

test('the details panel: user ID, name, gender in words, the birthday as a date, and every number', async () => {
  const root = await mount(answered(reply()));

  expect(detail(root, 'User ID').textContent).toBe('demo.1');
  expect(detail(root, 'Name').textContent).toBe('Crystal demo');
  expect(detail(root, 'Gender').textContent).toBe('Female');
  expect(detail(root, 'Birthday').textContent).toBe('1992.03.18');

  const numbers = Array.from(detail(root, 'Phone numbers').querySelectorAll('li')).map((li) => li.textContent);
  expect(numbers).toEqual(['13810007919', '13810009030']);
});

test('a value the platform does not have is a dash', async () => {
  const root = await mount(answered(reply({
    member: { state: 'OK', user_id: 'demo.2', user_name: null, gender: null, birthday: null, phones: [] }
  })));

  expect(detail(root, 'User ID').textContent).toBe('demo.2');
  ['Name', 'Gender', 'Birthday', 'Phone numbers'].forEach((label) => {
    expect(detail(root, label).textContent).toBe('—');
  });
});

test('the words are the reader\'s language', async () => {
  const root = await mount(answered(reply()), 'zh');

  expect(detail(root, '性别').textContent).toBe('女');
  expect(card(root, 'SOFTWARE').textContent).toContain('软件积分');
  expect(root.textContent).not.toContain('account.dashboard.');
});

test('a card that could not be read says so, shows no number, and the rest of the page stays', async () => {
  const body = reply();
  body.cards[0] = Object.assign({}, body.cards[0], { value: null, state: 'UNAVAILABLE' });
  body.cards[2] = Object.assign({}, body.cards[2], {
    value: null,
    state: 'UNAVAILABLE',
    parts: [
      { key: 'PHONE', value: 800, state: 'OK', to: null },
      { key: 'EPRODUCT', value: null, state: 'UNAVAILABLE', to: '/account/eproduct/registrations' }
    ]
  });

  const root = await mount(answered(body));

  expect(root.querySelector('[role="alert"]').textContent).toContain('Part of this page could not be loaded');

  /* Not 0 - a figure nobody could read is not a figure of nothing. */
  expect(card(root, 'COMMERCE').querySelector('[data-figure]').textContent).toBe('—');
  expect(card(root, 'COMMERCE').textContent).toContain('This figure could not be loaded just now.');

  /* The half of the register card that did load is still shown. */
  expect(card(root, 'REGISTER').querySelector('[data-part="PHONE"]').textContent).toContain('800');
  expect(card(root, 'REGISTER').querySelector('[data-part="EPRODUCT"]').textContent).toContain('—');

  expect(card(root, 'SOFTWARE').querySelector('[data-figure]').textContent).toBe('707.8');
  expect(detail(root, 'User ID').textContent).toBe('demo.1');
});

test('details that could not be read say so, and the four cards stay', async () => {
  const root = await mount(answered(reply({ member: { state: 'UNAVAILABLE' } })));

  expect(root.querySelector('[data-details]').textContent).toContain('Your details could not be loaded just now.');
  expect(root.querySelectorAll('[data-card]')).toHaveLength(4);
  expect(root.querySelector('[role="alert"]')).not.toBeNull();
});

test('while it loads, the page is its own shape in grey: four cards and the details', async () => {
  const root = await mount(() => new Promise(() => {}));

  expect(root.querySelectorAll('[data-skeleton-card]')).toHaveLength(4);
  expect(root.querySelector('[data-card]')).toBeNull();
});

test('a first load that fails is an error with a way to try again', async () => {
  const root = await mount(() => Promise.reject(new Error('The dashboard did not answer')));

  expect(root.textContent).toContain('The dashboard did not answer');
  expect(Array.from(root.querySelectorAll('button')).map((b) => b.textContent)).toContain('Try again');
});
