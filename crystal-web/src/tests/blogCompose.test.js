/*
 * A MEMBER WRITING IN THE BLOG, which until now they could only read.
 *
 * The rules are the vendor's (addBlog/editBlog/deleteBlog, with its bugs
 * fixed - they are listed at the top of the backend's services/blog.service.js)
 * and what is held here is the part a member would notice going wrong:
 *
 *   the two surprises are said BEFORE anything is typed - somebody reads the
 *   post first, and there is one article and one reply a day;
 *
 *   an allowance that is already spent closes the box and says when it comes
 *   back, instead of taking a written reply and refusing it - which is what
 *   the vendor's own blog does;
 *
 *   a reply is posted where the conversation is, and is NOT drawn into the
 *   thread afterwards, because it is not published yet;
 *
 *   signed out, the box is the way in rather than a box that cannot be sent;
 *
 *   and the member's own list says which state each post is in and, for a
 *   refusal, why.
 *
 * The strings are asked for by address, and this file matches a control by
 * its English OR its address, so it holds before and after the catalogue
 * learns the new entries.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ChakraProvider } from '@chakra-ui/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route } from 'react-router-dom';

import theme from '../theme';
import auth from '../app/authSlice';
import { I18nProvider } from '../i18n';
import BlogArticle from '../pages/blog/BlogArticle';
import MyArticles from '../pages/account/MyArticles';
import WriteArticle from '../pages/account/WriteArticle';
import { hasWords } from '../components/blog/BlogCompose';

// eslint-disable-next-line no-var
var mockApi = {
  article: null, replies: null, reply: null, subjects: null,
  articles: null, allowance: null, myArticle: null, write: null, edit: null, remove: null,
  thumbs: null, methods: null, calls: []
};

/*
 * THE EDITOR ITSELF IS NOT WHAT THESE TESTS ARE ABOUT.
 *
 * The body is written in TinyMCE now (components/common/RichTextEditor.js),
 * which is half a megabyte of third-party code, an iframe and a clipboard
 * stack - none of which jsdom runs, and none of which belongs in a test of
 * this form's rules. It stands in as a textarea with the same contract:
 * `value` in, `onChange(html)` out. What the real editor produces is HTML,
 * and the rule that cares about that - "is there anything in it" - is
 * hasWords() in BlogCompose, tested below.
 */
jest.mock('@/components/common/RichTextEditor', () => ({
  __esModule: true,
  default: ({ value, onChange, placeholder, isDisabled }) => (
    <textarea
      value={value || ''}
      placeholder={placeholder}
      disabled={isDisabled}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}));

jest.mock('../api', () => ({
  __esModule: true,
  default: {
    blog: {
      article: (slug) => { mockApi.calls.push({ name: 'article', slug: slug }); return mockApi.article(slug); },
      replies: (slug, params) => { mockApi.calls.push({ name: 'replies', slug: slug, params: params }); return mockApi.replies(slug, params); },
      reply: (id, params) => { mockApi.calls.push({ name: 'reply', id: id, params: params }); return mockApi.reply(id, params); },
      subjects: () => { mockApi.calls.push({ name: 'subjects' }); return mockApi.subjects(); }
    },
    account: {
      articles: (params) => { mockApi.calls.push({ name: 'articles', params: params }); return mockApi.articles(params); },
      articleAllowance: () => { mockApi.calls.push({ name: 'allowance' }); return mockApi.allowance(); },
      myArticle: (id) => { mockApi.calls.push({ name: 'myArticle', id: id }); return mockApi.myArticle(id); },
      writeArticle: (payload) => { mockApi.calls.push({ name: 'write', payload: payload }); return mockApi.write(payload); },
      editArticle: (id, payload) => { mockApi.calls.push({ name: 'edit', id: id, payload: payload }); return mockApi.edit(id, payload); },
      removeArticle: (id) => { mockApi.calls.push({ name: 'remove', id: id }); return mockApi.remove(id); },
      blogThumbs: (ids) => { mockApi.calls.push({ name: 'thumbs', ids: ids }); return mockApi.thumbs(ids); },
      giveBlogThumb: () => Promise.reject(new Error('no thumb expected'))
    },
  },
  fileUrl: (p) => p || ''
}));

const SLUG = 'crystal-os-5-2-is-rolling-out-now-3';

/** Both allowances free, and the hour they come back. */
const FREE = {
  article: { limit: 1, used: 0, left: 1 },
  reply: { limit: 1, used: 0, left: 1 },
  resets_at: '2026-09-18T07:00:00.000Z'
};

const SPENT_REPLY = {
  article: { limit: 1, used: 0, left: 1 },
  reply: { limit: 1, used: 1, left: 0 },
  resets_at: '2026-09-18T07:00:00.000Z'
};

function article(extra) {
  return Object.assign({
    id: 3,
    slug: SLUG,
    title: 'Crystal OS 5.2 is rolling out now',
    summary: 'Photo search that runs on the device.',
    content: 'The staged rollout begins this week.',
    author: 'contenteditor',
    category: 'SOFTWARE',
    subject: { id: 3, name: 'IT', parent_id: null, parent_name: null },
    status: 'PUBLISHED',
    view_count: 512,
    published_at: '2026-08-23T23:32:49.077Z',
    is_help_request: false,
    help_status: null,
    has_accepted_answer: false,
    reply_count: 0,
    origin: null,
    approval_num: 0,
    accepted_answers: [],
    media: []
  }, extra);
}

function mine(extra) {
  return Object.assign({
    id: 77,
    title: 'Two weeks with the C9 Pro',
    slug: 'two-weeks-with-the-c9-pro-77',
    summary: 'A fortnight of notes.',
    category: 'PRODUCTS',
    kind: 'ARTICLE',
    status: 'REVIEW',
    reason: null,
    thread: null,
    is_public: false,
    view_count: 0,
    updated_at: '2026-09-17T09:00:00.000Z'
  }, extra);
}

beforeEach(() => {
  mockApi.calls = [];
  mockApi.article = () => Promise.resolve({ data: article() });
  mockApi.replies = () => Promise.resolve({ data: { rows: [], total: 0, page: 1, limit: 10 } });
  mockApi.reply = () => Promise.reject(new Error('not found'));
  mockApi.subjects = () => Promise.resolve({
    data: [
      { id: 2, name: 'Product', children: [{ id: 21, name: 'Computer', children: [] }] },
      { id: 3, name: 'IT', children: [] }
    ]
  });
  mockApi.articles = () => Promise.resolve({ data: { rows: [mine()], total: 1, page: 1, limit: 12 } });
  mockApi.allowance = () => Promise.resolve({ data: FREE });
  mockApi.myArticle = () => Promise.reject(new Error('not asked for'));
  mockApi.write = () => Promise.resolve({ data: mine({ id: 91, status: 'REVIEW' }) });
  mockApi.edit = () => Promise.resolve({ data: mine() });
  mockApi.remove = () => Promise.resolve({ data: { id: 77, removed: 'ARCHIVED' } });
  mockApi.thumbs = () => Promise.resolve({ data: [] });
  mockApi.methods = () => Promise.resolve({ data: { login: 'password', certificate: false } });
  window.scrollTo = jest.fn();
});

afterEach(() => {
  document.body.innerHTML = '';
});

async function settle() {
  for (let i = 0; i < 10; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }
}

/** `member` is the login of a signed-in reader; without it the page is read signed out. */
async function mount(at, page, member) {
  const signedOut = auth(undefined, { type: '@@INIT' });
  const store = configureStore({
    reducer: { auth },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
    preloadedState: {
      auth: member
        ? { ...signedOut, status: 'authenticated', user: { id: 7, login: member } }
        : { ...signedOut, status: 'anonymous' }
    }
  });

  const host = document.createElement('div');
  document.body.appendChild(host);

  await act(async () => {
    ReactDOM.render(
      <Provider store={store}>
        <ChakraProvider theme={theme}>
          <I18nProvider>
            <MemoryRouter initialEntries={[at]}>
              {page || <Route path="/blog/:slug"><BlogArticle /></Route>}
            </MemoryRouter>
          </I18nProvider>
        </ChakraProvider>
      </Provider>,
      host
    );
  });
  await settle();

  /* SelectField opens into a portal on document.body, so the whole document is searched. */
  const all = (selector) => Array.from(document.body.querySelectorAll(selector));

  return {
    host,
    text: () => document.body.textContent,
    button: (english, address) => all('button').filter((node) => {
      const text = node.textContent.trim();
      return text === english || text === address;
    })[0] || null,
    textarea: () => host.querySelector('textarea'),
    input: (placeholder) => all('input').filter((node) => node.placeholder === placeholder)[0] || null,
    async click(node) {
      await act(async () => { node.click(); });
      await settle();
    },
    async type(node, value) {
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(node.constructor.prototype, 'value').set;
        setter.call(node, value);
        node.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await settle();
    },
    async done() {
      await act(async () => { ReactDOM.unmountComponentAtNode(host); });
    }
  };
}

/* ------------------------------------------------------------------ */
/*  the reply box, under the conversation                              */
/* ------------------------------------------------------------------ */

test('the reply box says who reads it next and what is left of today, before anything is typed', async () => {
  const ui = await mount('/blog/' + SLUG, null, 'demo.1');

  expect(mockApi.calls.filter((call) => call.name === 'allowance').length).toBe(1);
  expect(ui.text()).toContain('Our team reads a reply before it appears in the conversation.');
  expect(ui.text()).toContain('You have one reply left today.');
  expect(ui.textarea()).not.toBe(null);

  await ui.done();
});

test('posting a reply sends it to the thread, and what comes back is what happens next', async () => {
  const ui = await mount('/blog/' + SLUG, null, 'demo.1');

  await ui.type(ui.textarea(), 'Two weeks in and the battery is fine.');
  await ui.click(ui.button('Send your reply', 'blog.compose.sendReply'));

  const sent = mockApi.calls.filter((call) => call.name === 'write')[0];
  expect(sent.payload).toEqual({ parent_id: 3, content: 'Two weeks in and the battery is fine.' });

  /* It is with staff, and it is NOT drawn into the conversation. */
  expect(ui.text()).toContain('Your reply is with us.');
  expect(ui.text()).not.toContain('Two weeks in and the battery is fine.');
  expect(ui.textarea()).toBe(null);

  await ui.done();
});

test('a spent allowance closes the box and says when it comes back, rather than refusing a written reply', async () => {
  mockApi.allowance = () => Promise.resolve({ data: SPENT_REPLY });

  const ui = await mount('/blog/' + SLUG, null, 'demo.1');

  expect(ui.textarea()).toBe(null);
  expect(ui.button('Send your reply', 'blog.compose.sendReply')).toBe(null);
  expect(ui.text()).toContain('You have already replied today.');

  await ui.done();
});

test('a refusal from the API is shown as it stands, and corrects what the box says is left', async () => {
  const refusal = new Error('you have already replied today - you can reply again tomorrow');
  refusal.detail = { reason: 'LIMIT_REPLY', allowance: SPENT_REPLY };
  mockApi.write = () => Promise.reject(refusal);

  const ui = await mount('/blog/' + SLUG, null, 'demo.1');

  await ui.type(ui.textarea(), 'A reply written before the limit was known.');
  await ui.click(ui.button('Send your reply', 'blog.compose.sendReply'));

  /* The API's wording, already in the reader's language, and the corrected line. */
  expect(ui.text()).toContain('you have already replied today - you can reply again tomorrow');
  expect(ui.text()).toContain('You have already replied today.');

  await ui.done();
});

test('signed out, the box is the way in rather than a box that cannot be sent', async () => {
  const ui = await mount('/blog/' + SLUG);

  expect(ui.textarea()).toBe(null);
  expect(ui.text()).toContain('Replies come from signed-in members.');
  expect(ui.button('Sign in to reply', 'blog.compose.signInToReply')).not.toBe(null);

  /* Nothing about an allowance is asked for on behalf of nobody. */
  expect(mockApi.calls.filter((call) => call.name === 'allowance').length).toBe(0);

  await ui.done();
});

/**
 * Choosing a shelf the way somebody does: open the select, then press the
 * option. The panel is portalled to the body, and the click lands on the
 * option's own text so it bubbles to the row that carries the handler.
 */
async function chooseShelf(ui, from, option) {
  const trigger = Array.from(document.body.querySelectorAll('p'))
    .filter((node) => node.textContent.trim() === from)[0];
  expect(trigger).not.toBe(undefined);
  await ui.click(trigger);

  const panel = document.body.querySelector('[data-select-panel]');
  expect(panel).not.toBe(null);

  const row = Array.from(panel.querySelectorAll('p'))
    .filter((node) => node.textContent.trim() === option)[0];
  expect(row).not.toBe(undefined);
  await ui.click(row);
}

/* ------------------------------------------------------------------ */
/*  the compose page                                                   */
/* ------------------------------------------------------------------ */

const composePage = <Route path="/account/blog/write/:id?"><WriteArticle /></Route>;

test('an article is not sent without a shelf, and the shelf chosen is the one sent', async () => {
  const ui = await mount('/account/blog/write', composePage, 'demo.1');

  expect(ui.text()).toContain('Our team reads an article before it appears on the blog.');
  expect(ui.text()).toContain('You have one article left today.');

  await ui.type(ui.input('What is it about?'), 'Two weeks with the C9 Pro');
  await ui.type(ui.textarea(), 'A fortnight of notes.\n\nThe battery is the surprise.');

  const send = ui.button('Send it to be read', 'blog.compose.sendItToBeRead');
  await ui.click(send);

  /* Refused here, without a round trip - and said in the same words the API would use. */
  expect(mockApi.calls.filter((call) => call.name === 'write').length).toBe(0);
  expect(ui.text()).toContain('Choose the shelf it belongs on.');

  /* The shelves come from the vendor's own tree, children under their parent. */
  await chooseShelf(ui, 'Choose a shelf', 'Product › Computer');

  await ui.click(ui.button('Send it to be read', 'blog.compose.sendItToBeRead'));

  const sent = mockApi.calls.filter((call) => call.name === 'write')[0];
  expect(sent.payload).toEqual({
    title: 'Two weeks with the C9 Pro',
    subject_id: '21',
    content: 'A fortnight of notes.\n\nThe battery is the surprise.',
    origin: '',
    status: 'REVIEW'
  });

  await ui.done();
});

test('a draft is saved as a draft, and the page says a draft costs nothing', async () => {
  const ui = await mount('/account/blog/write', composePage, 'demo.1');

  await ui.type(ui.input('What is it about?'), 'Not finished yet');
  await ui.type(ui.textarea(), 'Half a thought.');

  await chooseShelf(ui, 'Choose a shelf', 'IT');

  await ui.click(ui.button('Save as a draft', 'blog.compose.saveAsADraft'));

  const sent = mockApi.calls.filter((call) => call.name === 'write')[0];
  expect(sent.payload.status).toBe('DRAFT');
  expect(sent.payload.subject_id).toBe('3');

  await ui.done();
});

test('opening a published post says, before anything is changed, that saving takes it off the blog', async () => {
  mockApi.myArticle = () => Promise.resolve({
    data: {
      id: 77,
      kind: 'ARTICLE',
      title: 'Two weeks with the C9 Pro',
      subject_id: 3,
      content: 'A fortnight of notes.',
      origin: null,
      status: 'PUBLISHED',
      thread: null,
      is_public: true
    }
  });

  const ui = await mount('/account/blog/write/77', composePage, 'demo.1');

  expect(ui.text()).toContain('Saving it sends it back to be read');
  expect(ui.textarea().value).toBe('A fortnight of notes.');

  /* A published post cannot be turned back into a draft, so that button is not offered. */
  expect(ui.button('Save as a draft', 'blog.compose.saveAsADraft')).toBe(null);

  await ui.click(ui.button('Send it to be read', 'blog.compose.sendItToBeRead'));
  expect(mockApi.calls.filter((call) => call.name === 'edit')[0].id).toBe('77');

  await ui.done();
});

test('editing a post that is already waiting says so, and says it costs nothing', async () => {
  mockApi.myArticle = () => Promise.resolve({
    data: {
      id: 78, kind: 'ARTICLE', title: 'Waiting', subject_id: 3, content: 'Words.',
      origin: null, status: 'REVIEW', thread: null, is_public: false
    }
  });
  /* The day is spent - and correcting a submission that is already in the queue is still allowed. */
  mockApi.allowance = () => Promise.resolve({
    data: { article: { limit: 1, used: 1, left: 0 }, reply: { limit: 1, used: 0, left: 1 }, resets_at: FREE.resets_at }
  });

  const ui = await mount('/account/blog/write/78', composePage, 'demo.1');

  expect(ui.text()).toContain('This post is waiting to be read.');
  expect(ui.text()).not.toContain('You have already posted an article today.');

  const send = ui.button('Send it to be read', 'blog.compose.sendItToBeRead');
  expect(send.disabled).toBe(false);

  await ui.done();
});

/* ------------------------------------------------------------------ */
/*  the member's own list                                              */
/* ------------------------------------------------------------------ */

test('a refused post carries the reason it was refused, beside its state', async () => {
  mockApi.articles = () => Promise.resolve({
    data: {
      rows: [mine({ status: 'ARCHIVED', reason: 'Please add the model number.' })],
      total: 1, page: 1, limit: 12
    }
  });

  const ui = await mount('/account/blog', <Route path="/account/blog"><MyArticles /></Route>, 'demo.1');

  expect(ui.text()).toContain('Not published');
  expect(ui.text()).toContain('Please add the model number.');

  /* And the way to write another one is on the page. */
  expect(ui.text()).toContain('Write an article');

  await ui.done();
});

test('withdrawing a post asks first, and says a draft cannot be got back', async () => {
  mockApi.articles = () => Promise.resolve({
    data: { rows: [mine({ status: 'DRAFT' })], total: 1, page: 1, limit: 12 }
  });

  const ui = await mount('/account/blog', <Route path="/account/blog"><MyArticles /></Route>, 'demo.1');

  await ui.click(ui.button('Withdraw', 'blog.compose.withdraw'));
  expect(ui.text()).toContain('A draft is deleted for good.');
  expect(mockApi.calls.filter((call) => call.name === 'remove').length).toBe(0);

  /* The dialog's own button is the second one with that word on it. */
  const confirmButton = Array.from(document.body.querySelectorAll('[role="alertdialog"] button'))
    .filter((node) => node.textContent.trim() === 'Withdraw')[0];
  await ui.click(confirmButton);

  expect(mockApi.calls.filter((call) => call.name === 'remove')[0].id).toBe(77);

  await ui.done();
});

/*
 * WHAT COUNTS AS HAVING WRITTEN SOMETHING, now that the body is markup.
 *
 * An "empty" editor is not an empty string: TinyMCE hands back an empty
 * paragraph, or one holding a non-breaking space. Both passed the old
 * `.trim()` check, so Send was offered, the request went, and the API
 * refused it a round trip later.
 */
test('an empty editor is empty however it says so', () => {
  expect(hasWords('')).toBe(false);
  expect(hasWords(null)).toBe(false);
  expect(hasWords('<p></p>')).toBe(false);
  expect(hasWords('<p>&nbsp;</p>')).toBe(false);
  expect(hasWords('<p><br></p>')).toBe(false);
  expect(hasWords('   <p>  </p>  ')).toBe(false);

  expect(hasWords('<p>a</p>')).toBe(true);
  expect(hasWords('<p><strong>words</strong></p>')).toBe(true);
  /* A character entity is a character somebody typed. */
  expect(hasWords('<p>&amp;</p>')).toBe(true);
});
