'use strict';

const sanitizeHtml = require('sanitize-html');

/**
 * WHAT A MEMBER MAY WRITE, when a member writes HTML.
 *
 * A blog post from the storefront used to be plain text, because the
 * storefront had no editor. It has one now (crystal-web
 * components/common/RichTextEditor.js, the console's TinyMCE), so a post
 * arrives as markup - and markup from a stranger is exactly the thing not to
 * store as it came.
 *
 * SO IT IS SANITISED HERE, ON THE WRITE PATH, and stored clean. The storefront
 * sanitises again when it draws a body (security/sanitizeHtml.js), and that is
 * not one of these two being redundant: this one decides what is in the
 * database - what the console's editor will show a manager, what a search
 * indexes, what any other reader of the table gets - and that one defends the
 * page against whatever is in the database, including the console's own
 * articles and the vendor's older rows.
 *
 * THE ALLOWLIST IS THE MEMBER'S TOOLBAR, not the console's. The member's
 * editor offers bold, italic, underline, lists, quotes and links that
 * autolink as they are typed; nothing here is wider than that, so a tag can
 * only arrive by being typed into somebody's own request:
 *
 *   NO <img>. The blog renderer drops pictures inside a body - it is a
 *   text-first page - so an image that survived here would be stored, shown
 *   to the manager, and then not drawn. It is refused at the door instead.
 *
 *   NO <table>, <pre> or headings. The console keeps those for editorial
 *   articles written by staff; a member's post is prose, and every extra tag
 *   is another shape the article page has to be right about.
 *
 *   NO style, class or id attributes - a body cannot dress itself, or reach
 *   into the page's own stylesheet by borrowing a class name.
 *
 * A LINK OPENS WHERE IT IS WRITTEN. `target="_blank"` is allowed but always
 * carries `rel="noopener noreferrer"`, which is what stops the new tab from
 * reaching back into this one through `window.opener`.
 */

const ALLOWED_TAGS = [
  'p', 'br',
  'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del',
  'blockquote',
  'ul', 'ol', 'li',
  'a'
];

const OPTIONS = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    ol: ['start']
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesAppliedToAttributes: ['href'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  parseStyleAttributes: false,

  transformTags: {
    a: function (tagName, attribs) {
      const next = { href: attribs.href };
      if (attribs.title) next.title = attribs.title;

      /* One target is meaningful, and it never travels without its rel. */
      if (attribs.target === '_blank') {
        next.target = '_blank';
        next.rel = 'noopener noreferrer';
      }

      return { tagName: 'a', attribs: next };
    }
  }
};

/** The body as it will be stored: the member's markup, and nothing else. */
function memberHtml(value) {
  if (value === null || value === undefined) return '';

  return sanitizeHtml(String(value), OPTIONS)
    /* TinyMCE leaves a trailing empty paragraph behind a lot of the time. */
    .replace(/(?:\s*<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>\s*)+$/gi, '')
    .trim();
}

module.exports = {
  ALLOWED_TAGS: ALLOWED_TAGS,
  memberHtml: memberHtml
};
