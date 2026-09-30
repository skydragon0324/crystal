/**
 * A NOTICE'S HTML, CUT DOWN TO WHAT A NOTICE NEEDS.
 *
 * VERIFIED IS NOT THE SAME AS SAFE. A valid signature proves the HTML is what
 * the backend stored when the console saved it - it says nothing about what
 * that HTML does. Until this file existed the notice body went straight into
 * dangerouslySetInnerHTML with no sanitising at all, on the reasoning that
 * only an administrator can write one. That makes every console account, and
 * everything that can write to site_notices, a way to run script on every
 * visitor's page - and the backend does not sanitise on save either. So the
 * body is signed, verified, AND sanitised, in that order, and each of the
 * three is doing a different job.
 *
 * WHY sanitize-html. It was already a dependency of this project (and in
 * node_modules), so this adds nothing to package.json, and it runs the same
 * way in the browser and under Jest - the tests exercise the exact function
 * the page calls.
 *
 * IT IS LOADED ON DEMAND, NOT BUNDLED UP FRONT. With its parser and postcss
 * it is about 90 KB gzipped, and a static import put all of that into the
 * vendor chunk every page downloads - including the pages that never show a
 * notice. So it is a separate chunk, fetched the first time a notice body is
 * about to be drawn; until it arrives the body is a skeleton, and if it never
 * arrives the body is the neutral error state. There is no path on which the
 * HTML is inserted without having been through it.
 *
 * AN ALLOW-LIST, NOT A DENY-LIST. What the console's editor can produce is
 * known (crystal-admin's RichTextEditor: paragraphs, headings, lists, links,
 * tables, a rule, quotes, uploaded pictures), so that is what survives.
 * Everything else is dropped - the tag, never the words inside it, except
 * for script and style, whose contents are not words.
 *
 * NO `style` ATTRIBUTE, which costs the editor's text colours and alignment.
 * sanitize-html can only filter CSS through postcss, and its own
 * documentation says that does not work reliably in a browser; letting style
 * through unfiltered is how `position:fixed` covers a page with a fake
 * sign-in form. Losing a colour is the right trade.
 *
 * LINKS are http, https, mailto and tel, or relative. A link that opens a new
 * tab gets rel="noopener noreferrer", so the opened page cannot reach back
 * into this one. Pictures are http or https only: no data: URIs, which are
 * how a payload rides inside an attribute that looks like an image.
 */

const OPTIONS = {
  allowedTags: [
    'p', 'br', 'hr', 'div', 'span',
    'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'ins', 'sub', 'sup', 'small',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'pre', 'code',
    'ul', 'ol', 'li',
    'a', 'img',
    'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td'
  ],

  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    th: ['colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
    ol: ['start']
  },

  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  allowProtocolRelative: false,

  /* Parsing CSS needs postcss, which is unreliable in a browser - and no style is allowed anyway. */
  parseStyleAttributes: false,

  disallowedTagsMode: 'discard',

  transformTags: {
    a: function (tagName, attribs) {
      const next = {};
      Object.keys(attribs).forEach((name) => {
        if (name !== 'target' && name !== 'rel') next[name] = attribs[name];
      });

      /* Only one target is meaningful here, and it always travels with its rel. */
      if (attribs.target === '_blank') {
        next.target = '_blank';
        next.rel = 'noopener noreferrer';
      }

      return { tagName: 'a', attribs: next };
    }
  }
};

/**
 * A BLOG ARTICLE OR REPLY: the notice's list, WITHOUT PICTURES.
 *
 * The same allow-list, because it is the same problem - stored HTML from an
 * editor, written by people who are not this page - and a second list would
 * be a second thing to keep right. The one difference is `img`, and it is a
 * decision about the blog rather than about safety: the blog is text-first
 * and shows no article images, and a picture embedded in a reply's body is
 * still an article image. Dropping the tag here means no body can bring one
 * back in, whoever wrote it. The words around it stay.
 */
const ARTICLE_OPTIONS = Object.assign({}, OPTIONS, {
  allowedTags: OPTIONS.allowedTags.filter((tag) => tag !== 'img'),
  allowedAttributes: Object.keys(OPTIONS.allowedAttributes).reduce((out, tag) => {
    if (tag !== 'img') out[tag] = OPTIONS.allowedAttributes[tag];
    return out;
  }, {}),
  allowedSchemesByTag: {}
});

/*
 * ONE CHUNK, TWO LISTS. The library is loaded once, whichever is asked for
 * first; each list gets its own function around it.
 */
let library = null;
let loading = null;
const ready = { notice: null, article: null };

function loadLibrary() {
  if (library) return Promise.resolve(library);

  if (!loading) {
    loading = import('sanitize-html').then((mod) => {
      library = mod.default || mod;
      return library;
    });

    loading.catch(() => { loading = null; });
  }

  return loading;
}

function build(options) {
  return function sanitize(html) {
    if (typeof html !== 'string' || !html) return '';
    return library(html, options);
  };
}

function loadSanitizer(kind, options) {
  if (ready[kind]) return Promise.resolve(ready[kind]);

  return loadLibrary().then(() => {
    if (!ready[kind]) ready[kind] = build(options);
    return ready[kind];
  });
}

/**
 * The sanitiser, once its chunk has loaded: `(html) => safeHtml`.
 *
 * Resolves to the same function every time; a failed load is forgotten, so
 * the next notice to be drawn tries again rather than inheriting the failure.
 */
export function loadNoticeSanitizer() {
  return loadSanitizer('notice', OPTIONS);
}

/** The sanitiser if it has already loaded, else null - for a first render without a skeleton. */
export function loadedNoticeSanitizer() {
  return ready.notice;
}

/** The blog's sanitiser - the notice's list without `img`. Loaded the same way. */
export function loadArticleSanitizer() {
  return loadSanitizer('article', ARTICLE_OPTIONS);
}

export function loadedArticleSanitizer() {
  return ready.article;
}
