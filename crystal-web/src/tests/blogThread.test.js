/*
 * A BLOG THREAD, READ THE WAY A PHONE READS IT.
 *
 * The vendor's blog is a forum: an article, and replies whose parent is that
 * article, newest activity first (the model is written down at the top of the
 * backend's repositories/legacy/articles.repository.js). Until this page drew
 * replies, every reply in the vendor's database was invisible - so what is
 * held here is the part a reader would notice going wrong:
 *
 *   the replies come out in the order the API gives them, which is the
 *   vendor's order - the page must not re-sort a conversation;
 *
 *   "show older" ADDS a page below and keeps what was read, rather than
 *   replacing the page the reader is halfway down;
 *
 *   a link to one reply opens its thread at the page that holds it, grows
 *   upwards from there, and a reply linked under the wrong article is taken
 *   to the article it belongs to;
 *
 *   a question's accepted answer is shown under the question, before the
 *   conversation;
 *
 *   and stored HTML is rendered SAFELY and WITHOUT PICTURES - the blog is
 *   text-first, and a body is somebody else's markup.
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
import { MemoryRouter, Route, useLocation } from 'react-router-dom';

import theme from '../theme';
import auth from '../app/authSlice';
import { I18nProvider } from '../i18n';
import BlogArticle from '../pages/blog/BlogArticle';
import MyArticles from '../pages/account/MyArticles';

/*
 * What each endpoint answers, set per test, and every call made. `var`, and
 * named `mock…`, because jest hoists the factory above the imports and that
 * prefix is its allow-list for reaching outwards.
 */
// eslint-disable-next-line no-var
var mockApi = {
  article: null, replies: null, reply: null, articles: null, thumbs: null, give: null, methods: null, calls: []
};

jest.mock('../api', () => ({
  __esModule: true,
  default: {
    blog: {
      article: (slug) => {
        mockApi.calls.push({ name: 'article', slug: slug });
        return mockApi.article(slug);
      },
      replies: (slug, params) => {
        mockApi.calls.push({ name: 'replies', slug: slug, params: params });
        return mockApi.replies(slug, params);
      },
      reply: (id, params) => {
        mockApi.calls.push({ name: 'reply', id: id, params: params });
        return mockApi.reply(id, params);
      }
    },
    account: {
      articles: (params) => {
        mockApi.calls.push({ name: 'articles', params: params });
        return mockApi.articles(params);
      },
      blogThumbs: (ids) => {
        mockApi.calls.push({ name: 'thumbs', ids: ids });
        return mockApi.thumbs(ids);
      },
      giveBlogThumb: (id, kind) => {
        mockApi.calls.push({ name: 'give', id: id, kind: kind });
        return mockApi.give(id, kind);
      }
    },
    auth: {
      methods: () => {
        mockApi.calls.push({ name: 'methods' });
        return mockApi.methods();
      }
    }
  },
  fileUrl: (p) => p || ''
}));

/* ------------------------------------------------------------------ */
/*  the thread                                                         */
/* ------------------------------------------------------------------ */

const SLUG = 'crystal-os-5-2-is-rolling-out-now-3';

function article(extra) {
  return Object.assign({
    id: 3,
    slug: SLUG,
    title: 'Crystal OS 5.2 is rolling out now',
    summary: 'Photo search that runs on the device.',
    content: '<p>The staged rollout begins this week.</p>',
    author: 'contenteditor',
    category: 'SOFTWARE',
    subject: { id: 3, name: 'IT', parent_id: null, parent_name: null },
    status: 'PUBLISHED',
    view_count: 512,
    published_at: '2026-08-23T23:32:49.077Z',
    is_help_request: false,
    help_status: null,
    has_accepted_answer: false,
    reply_count: 23,
    origin: null,
    approval_num: 0,
    accepted_answers: [],
    media: []
  }, extra);
}

function reply(id, extra) {
  return Object.assign({
    id: id,
    parent_id: 3,
    author: 'member' + id,
    content: '<p>Reply number ' + id + '</p>',
    published_at: '2026-09-16T10:00:00.000Z',
    updated_at: '2026-09-16T10:00:00.000Z',
    view_count: 4,
    is_accepted: false
  }, extra);
}

/* Twenty-three replies, newest activity first - the order the API answers in. */
const THREAD = Array.from({ length: 23 }).map((ignored, i) => reply(123 - i));

function serveThread(rows) {
  mockApi.replies = (slug, params) => {
    const start = (params.page - 1) * params.limit;
    return Promise.resolve({
      data: { rows: rows.slice(start, start + params.limit), total: rows.length, page: params.page, limit: params.limit }
    });
  };
}

beforeEach(() => {
  mockApi.calls = [];
  mockApi.article = () => Promise.resolve({ data: article() });
  mockApi.reply = () => Promise.reject(new Error('not found'));
  mockApi.thumbs = () => Promise.resolve({ data: [] });
  mockApi.give = () => Promise.reject(new Error('no thumb expected'));
  mockApi.methods = () => Promise.resolve({ data: { login: 'password', certificate: false } });
  serveThread(THREAD);
  window.scrollTo = jest.fn();
});

afterEach(() => {
  document.body.innerHTML = '';
});

/* Promises, the sanitiser's chunk and the effects behind them, all allowed to land. */
async function settle() {
  for (let i = 0; i < 10; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }
}

/**
 * `member`, when given, is the login of a signed-in reader; without it the
 * page is read signed out.
 */
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

  let where = null;
  function Probe() {
    where = useLocation();
    return null;
  }

  await act(async () => {
    ReactDOM.render(
      <Provider store={store}>
        <ChakraProvider theme={theme}>
          <I18nProvider>
            <MemoryRouter initialEntries={[at]}>
              <Probe />
              {page || <Route path="/blog/:slug"><BlogArticle /></Route>}
            </MemoryRouter>
          </I18nProvider>
        </ChakraProvider>
      </Provider>,
      host
    );
  });
  await settle();

  return {
    host,
    location: () => where,
    ids: () => Array.from(host.querySelectorAll('article[id^="reply-"]')).map((node) => Number(node.id.slice(6))),
    /** A button by its English or, before the catalogue has the entry, its address. */
    button: (english, address) => Array.from(host.querySelectorAll('button'))
      .filter((node) => {
        const text = node.textContent.trim();
        return text === english || text === address;
      })[0] || null,
    async click(node) {
      await act(async () => { node.click(); });
      await settle();
    },
    async done() {
      await act(async () => { ReactDOM.unmountComponentAtNode(host); });
    }
  };
}

const ids = (from, to) => {
  const out = [];
  for (let id = from; id >= to; id -= 1) out.push(id);
  return out;
};

test('replies render in the order the API answers them - the vendor\'s, newest activity first', async () => {
  const ui = await mount('/blog/' + SLUG);

  expect(mockApi.calls.filter((call) => call.name === 'replies')[0].params).toEqual({ page: 1, limit: 10 });
  expect(ui.ids()).toEqual(ids(123, 114));

  /* The article and its reply bodies are both on the page. */
  expect(ui.host.textContent).toContain('The staged rollout begins this week.');
  expect(ui.host.textContent).toContain('Reply number 123');

  await ui.done();
});

test('showing older replies adds the next page below and keeps every reply already read', async () => {
  const ui = await mount('/blog/' + SLUG);
  const firstTen = ui.host.querySelector('#reply-118');

  const older = ui.button('Show older replies', 'blog.thread.showOlderReplies');
  expect(older).not.toBe(null);
  expect(ui.button('Show newer replies', 'blog.thread.showNewerReplies')).toBe(null);

  await ui.click(older);
  expect(ui.ids()).toEqual(ids(123, 104));

  /* The SAME node - kept, not torn down and redrawn, which is what loses a reader's place. */
  expect(ui.host.querySelector('#reply-118')).toBe(firstTen);

  await ui.click(ui.button('Show older replies', 'blog.thread.showOlderReplies'));
  expect(ui.ids()).toEqual(ids(123, 101));

  /* Twenty-three of twenty-three: nothing left to ask for. */
  expect(ui.button('Show older replies', 'blog.thread.showOlderReplies')).toBe(null);

  await ui.done();
});

test('a page that overlaps what is on screen does not show a reply twice', async () => {
  const ui = await mount('/blog/' + SLUG);

  /* A reply was approved while the page was open: every later page shifts down by one. */
  serveThread([reply(124)].concat(THREAD));

  await ui.click(ui.button('Show older replies', 'blog.thread.showOlderReplies'));

  const seen = ui.ids();
  expect(seen.filter((id, i) => seen.indexOf(id) !== i)).toEqual([]);
  expect(seen.slice(0, 10)).toEqual(ids(123, 114));

  await ui.done();
});

test('a link to one reply opens its thread at the page that holds it, and grows upwards from there', async () => {
  mockApi.reply = (id) => Promise.resolve({
    data: {
      reply: reply(Number(id)),
      thread: { id: 3, slug: SLUG, title: 'Crystal OS 5.2 is rolling out now', is_help_request: false },
      position: 13,
      page: 2,
      limit: 10
    }
  });

  const ui = await mount('/blog/' + SLUG + '?reply=110');

  const asked = mockApi.calls.filter((call) => call.name === 'reply')[0];
  expect(String(asked.id)).toBe('110');
  expect(asked.params).toEqual({ limit: 10 });

  /* Page two, not page one - the reply is on screen without anybody paging to it. */
  expect(mockApi.calls.filter((call) => call.name === 'replies').map((call) => call.params.page)).toEqual([2]);
  expect(ui.ids()).toEqual(ids(113, 104));
  expect(ui.ids()).toContain(110);

  /* And the page moved to it. */
  expect(window.scrollTo).toHaveBeenCalled();

  /* Newer replies are above it, and asking for them keeps the linked reply where it is. */
  const linked = ui.host.querySelector('#reply-110');
  await ui.click(ui.button('Show newer replies', 'blog.thread.showNewerReplies'));

  expect(ui.ids()).toEqual(ids(123, 104));
  expect(ui.host.querySelector('#reply-110')).toBe(linked);
  expect(ui.button('Show newer replies', 'blog.thread.showNewerReplies')).toBe(null);

  await ui.done();
});

test('a reply linked under the wrong article goes to the thread it belongs to', async () => {
  mockApi.reply = () => Promise.resolve({
    data: {
      reply: reply(110),
      thread: { id: 3, slug: SLUG, title: 'Crystal OS 5.2 is rolling out now', is_help_request: false },
      position: 13,
      page: 2,
      limit: 10
    }
  });

  const ui = await mount('/blog/some-other-article-9?reply=110');

  expect(ui.location().pathname).toBe('/blog/' + SLUG);
  expect(ui.location().search).toBe('?reply=110');
  expect(mockApi.calls.filter((call) => call.name === 'replies').map((call) => call.slug)).toEqual([SLUG]);
  expect(ui.ids()).toContain(110);

  await ui.done();
});

test('a link to a reply nobody may see still opens the conversation, and says so', async () => {
  const ui = await mount('/blog/' + SLUG + '?reply=999');

  expect(mockApi.calls.filter((call) => call.name === 'replies').map((call) => call.params.page)).toEqual([1]);
  expect(ui.ids()).toEqual(ids(123, 114));

  const text = ui.host.textContent;
  expect(
    text.indexOf('The reply you followed is not available') !== -1
    || text.indexOf('blog.thread.replyUnavailable') !== -1
  ).toBe(true);

  await ui.done();
});

test('a question\'s accepted answer is shown under the question, before the conversation', async () => {
  const answer = reply(115, {
    is_accepted: true,
    content: '<p>That is <strong>Adaptive charging</strong>, not a fault.</p>'
  });

  mockApi.article = () => Promise.resolve({
    data: article({ is_help_request: true, help_status: 'ANSWERED', has_accepted_answer: true, accepted_answers: [answer] })
  });
  serveThread(THREAD.map((row) => (row.id === 115 ? answer : row)));

  const ui = await mount('/blog/' + SLUG);

  const replies = ui.host.querySelector('#replies');
  const strong = Array.from(ui.host.querySelectorAll('strong')).filter((node) => node.textContent === 'Adaptive charging');

  /* Twice: surfaced above the thread, and in its own place in the thread. */
  expect(strong.length).toBe(2);
  // eslint-disable-next-line no-bitwise
  expect(strong[0].compareDocumentPosition(replies) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(ui.host.querySelector('#reply-115').contains(strong[1])).toBe(true);

  /* The question says it is one, and that it was answered. */
  const text = ui.host.textContent;
  expect(text.indexOf('Help request') !== -1 || text.indexOf('blog.help.request') !== -1).toBe(true);
  expect(text.indexOf('Answered') !== -1 || text.indexOf('blog.help.answered') !== -1).toBe(true);

  await ui.done();
});

test('no picture is drawn, from the article or from a reply, and the words around them stay', async () => {
  mockApi.article = () => Promise.resolve({
    data: article({ content: '<p>Before the picture <img src="https://example.com/a.png" alt="A charger"> and after it.</p>' })
  });
  serveThread([reply(120, { content: '<p>Look: <img src="https://example.com/b.png"> there.</p>' })]);

  const ui = await mount('/blog/' + SLUG);

  expect(ui.host.querySelectorAll('img').length).toBe(0);
  expect(ui.host.textContent).toContain('Before the picture');
  expect(ui.host.textContent).toContain('and after it.');
  expect(ui.host.querySelector('#reply-120').textContent).toContain('Look:');

  await ui.done();
});

test('stored HTML is sanitised before it reaches the page', async () => {
  const hostile = '<p id="kept">Hello <em>there</em></p>'
    + '<script>window.__blogPwned = true</script>'
    + '<p onmouseover="window.__blogPwned = true" style="position:fixed">styled</p>'
    + '<a href="javascript:window.__blogPwned=true" onclick="window.__blogPwned=true">a link</a>'
    + '<iframe src="https://evil.example"></iframe>'
    + '<form action="/steal"><input name="password"></form>';

  mockApi.article = () => Promise.resolve({ data: article({ content: hostile }) });
  serveThread([reply(120, { content: hostile })]);

  const ui = await mount('/blog/' + SLUG);

  expect(ui.host.textContent).toContain('Hello there');
  expect(ui.host.querySelectorAll('script, iframe, form, input[name="password"]').length).toBe(0);

  const attributes = Array.from(ui.host.querySelectorAll('*'))
    .reduce((out, node) => out.concat(Array.from(node.attributes).map((attr) => attr.name + '=' + attr.value)), []);

  expect(attributes.filter((pair) => /^on/i.test(pair))).toEqual([]);
  expect(attributes.filter((pair) => /javascript:/i.test(pair))).toEqual([]);
  expect(attributes.filter((pair) => /position:\s*fixed/i.test(pair))).toEqual([]);
  expect(window.__blogPwned).toBe(undefined);

  await ui.done();
});

test('a body written as plain text keeps its paragraphs and shows no markup', async () => {
  /*
   * Crystal's own editorial articles are stored like this. Sent through the
   * HTML path the blank line would collapse and the two paragraphs run into
   * one; printed as text, a comparison like "a < b" must stay words.
   */
  mockApi.article = () => Promise.resolve({
    data: article({ content: 'The first paragraph, where 3 < 5.\n\nThe second paragraph, written as text.' })
  });

  const ui = await mount('/blog/' + SLUG);

  const paragraphs = Array.from(ui.host.querySelectorAll('p')).map((node) => node.textContent);
  expect(paragraphs).toContain('The first paragraph, where 3 < 5.');
  expect(paragraphs).toContain('The second paragraph, written as text.');

  await ui.done();
});

/* ------------------------------------------------------------------ */
/*  the member's own list                                              */
/* ------------------------------------------------------------------ */

test('a member\'s reply is listed as a reply, linked into its thread at the reply', async () => {
  mockApi.articles = () => Promise.resolve({
    data: {
      rows: [
        {
          id: 950000710021,
          kind: 'REPLY',
          parent_id: 3,
          title: 'Re: Crystal OS 5.2 is rolling out now',
          summary: 'C9 Pro here, no problems after a week.',
          slug: 're-crystal-os-5-2-is-rolling-out-now-950000710021',
          status: 'PUBLISHED',
          is_public: true,
          category: 'SOFTWARE',
          view_count: 30,
          updated_at: '2026-09-17T03:04:36.711Z',
          thread: { id: 3, title: 'Crystal OS 5.2 is rolling out now', slug: SLUG, is_public: true }
        },
        {
          id: 950000710024,
          kind: 'REPLY',
          parent_id: 3,
          title: 'Re: Crystal OS 5.2 is rolling out now',
          summary: 'Submitted and waiting for review.',
          slug: 're-crystal-os-5-2-is-rolling-out-now-950000710024',
          status: 'REVIEW',
          is_public: false,
          category: 'SOFTWARE',
          view_count: 0,
          updated_at: '2026-09-17T03:04:36.711Z',
          thread: { id: 3, title: 'Crystal OS 5.2 is rolling out now', slug: SLUG, is_public: true }
        },
        {
          id: 950000700000,
          kind: 'ARTICLE',
          parent_id: null,
          title: 'Two weeks with the C9 Pro',
          summary: 'Two weeks with the C9 Pro.',
          slug: 'two-weeks-with-the-c9-pro-950000700000',
          status: 'PUBLISHED',
          is_public: true,
          category: 'PRODUCTS',
          view_count: 58,
          updated_at: '2026-09-14T23:32:52.972Z',
          thread: null
        }
      ],
      total: 3,
      page: 1,
      limit: 12
    }
  });

  const ui = await mount('/account/blog', <Route path="/account/blog"><MyArticles /></Route>);

  const hrefs = Array.from(ui.host.querySelectorAll('a')).map((node) => node.getAttribute('href'));

  /* The published reply opens its thread AT the reply; the pending one opens the thread only. */
  expect(hrefs).toContain('/blog/' + SLUG + '?reply=950000710021');
  expect(hrefs.filter((href) => href === '/blog/' + SLUG).length).toBeGreaterThan(0);
  expect(hrefs).not.toContain('/blog/re-crystal-os-5-2-is-rolling-out-now-950000710021');

  /* The article is still an article, linked by its own slug. */
  expect(hrefs).toContain('/blog/two-weeks-with-the-c9-pro-950000700000');

  /* What the member SAID leads a reply row - not "Re: somebody else's headline". */
  expect(ui.host.textContent).toContain('C9 Pro here, no problems after a week.');
  expect(ui.host.textContent).not.toContain('Re: Crystal OS 5.2 is rolling out now');

  await ui.done();
});

/* ------------------------------------------------------------------ */
/*  the three thumbs                                                   */
/* ------------------------------------------------------------------ */

/*
 * GOLD, SILVER, BRONZE - the vendor's submitBlogRating, met by a reader.
 *
 * What is held: a signed-out reader is offered sign-in, not an error; a thumb
 * is confirmed before it is sent, because it can never be changed; the counts
 * drawn afterwards are the server's; once given, the other two stand down;
 * and a reader's own writing offers nothing to press.
 */

const medalsOf = (ui, id) => Array.from(ui.host.querySelectorAll('[data-thumbs="' + id + '"] [data-medal]'));
const pressable = (ui, id) => medalsOf(ui, id).filter((node) => node.tagName === 'BUTTON');
const medal = (ui, id, kind) => medalsOf(ui, id).filter((node) => node.getAttribute('data-medal') === kind)[0];

function withCounts() {
  mockApi.article = () => Promise.resolve({
    data: article({ author: 'contenteditor', recommendations: { gold: 5, silver: 2, bronze: 1 } })
  });
}

test('signed out, a medal offers sign-in and sends nothing', async () => {
  withCounts();
  const ui = await mount('/blog/' + SLUG);

  expect(medalsOf(ui, 3).map((node) => node.textContent.replace(/[^0-9]/g, '').slice(0, 1))).toEqual(['5', '2', '1']);
  expect(pressable(ui, 3).length).toBe(3);

  await ui.click(medal(ui, 3, 'GOLD'));
  const signIn = document.querySelector('button[data-sign-in]');
  expect(signIn).not.toBe(null);
  expect(document.querySelector('button[data-confirm]')).toBe(null);

  await ui.click(signIn);
  expect(ui.location().pathname).toBe('/login');
  expect(ui.location().search).toBe('?next=' + encodeURIComponent('/blog/' + SLUG));

  /* Nobody to ask about, and nothing given. */
  expect(mockApi.calls.filter((call) => call.name === 'thumbs' || call.name === 'give')).toEqual([]);

  await ui.done();
});

test('a member confirms a thumb, and the page draws the server\'s counts afterwards', async () => {
  withCounts();
  mockApi.give = (id, kind) => Promise.resolve({
    data: { id: id, kind: kind, recommendations: { gold: 8, silver: 2, bronze: 1 } }
  });

  const ui = await mount('/blog/' + SLUG, null, 'reader1');

  /* One question about everything on screen: the article and the ten replies. */
  const asked = mockApi.calls.filter((call) => call.name === 'thumbs');
  expect(asked.length).toBe(1);
  expect(asked[0].ids).toEqual(['3'].concat(ids(123, 114).map(String)));

  /* Cancel sends nothing. */
  await ui.click(medal(ui, 3, 'GOLD'));
  const cancel = Array.from(document.querySelectorAll('button'))
    .filter((node) => ['Cancel', 'common.cancel'].indexOf(node.textContent.trim()) !== -1)[0];
  await ui.click(cancel);
  expect(mockApi.calls.filter((call) => call.name === 'give')).toEqual([]);

  await ui.click(medal(ui, 3, 'GOLD'));
  await ui.click(document.querySelector('button[data-confirm="GOLD"]'));

  expect(mockApi.calls.filter((call) => call.name === 'give')).toEqual([{ name: 'give', id: 3, kind: 'GOLD' }]);

  /* 8, not 5 + 1: somebody else's gold landed in between, and the server knows. */
  expect(medal(ui, 3, 'GOLD').textContent).toContain('8');
  expect(medal(ui, 3, 'GOLD').getAttribute('data-chosen')).toBe('true');

  /* One thumb per row, for good: nothing on the article is pressable any more. */
  expect(pressable(ui, 3)).toEqual([]);

  /* The replies are rows of their own and still take a thumb. */
  expect(pressable(ui, 123).length).toBe(3);

  await ui.done();
});

test('a thumb given earlier is shown as given, and the reader\'s own reply offers nothing', async () => {
  withCounts();
  serveThread(THREAD.map((row) => (row.id === 122 ? { ...row, author: 'reader1' } : row)));
  mockApi.thumbs = () => Promise.resolve({ data: [{ id: 123, kind: 'SILVER', at: '2026-09-16T10:00:00.000Z' }] });

  const ui = await mount('/blog/' + SLUG, null, 'reader1');

  expect(pressable(ui, 123)).toEqual([]);
  expect(medal(ui, 123, 'SILVER').getAttribute('data-chosen')).toBe('true');
  expect(medal(ui, 123, 'GOLD').getAttribute('data-chosen')).toBe(null);

  expect(medalsOf(ui, 122).length).toBe(3);
  expect(pressable(ui, 122)).toEqual([]);

  expect(pressable(ui, 121).length).toBe(3);

  await ui.done();
});

test('a thumb refused as already given marks the one that stands', async () => {
  withCounts();
  mockApi.give = () => {
    const err = new Error('you have already given this a thumb, and a thumb cannot be changed');
    err.status = 409;
    err.detail = { reason: 'ALREADY', id: 3, kind: 'BRONZE', recommendations: { gold: 5, silver: 2, bronze: 4 } };
    return Promise.reject(err);
  };

  const ui = await mount('/blog/' + SLUG, null, 'reader1');

  await ui.click(medal(ui, 3, 'GOLD'));
  await ui.click(document.querySelector('button[data-confirm="GOLD"]'));

  expect(pressable(ui, 3)).toEqual([]);
  expect(medal(ui, 3, 'BRONZE').getAttribute('data-chosen')).toBe('true');
  expect(medal(ui, 3, 'BRONZE').textContent).toContain('4');

  await ui.done();
});

test('older replies ask only about the rows that are new', async () => {
  const ui = await mount('/blog/' + SLUG, null, 'reader1');

  await ui.click(ui.button('Show older replies', 'blog.thread.showOlderReplies'));

  const asked = mockApi.calls.filter((call) => call.name === 'thumbs');
  expect(asked.length).toBe(2);
  expect(asked[1].ids).toEqual(ids(113, 104).map(String));

  await ui.done();
});
