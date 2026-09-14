/* =====================================================================
 * CRYSTAL CHROME — one header and one footer, for the Eshop and the
 * Appstore.
 *
 * WHY THIS IS A SCRIPT AND NOT A SNIPPET OF HTML TO COPY
 *
 * The obvious answer to "make the three sites match" is to write the markup
 * out and paste it into each application's layout. That produces three copies
 * on day one and three DIFFERENT copies by the end of the month, because the
 * one thing nobody does is edit all three. Copying is the problem being
 * solved, so the markup lives here and is built into a placeholder.
 *
 * NO JQUERY, and that is not a preference about jQuery.
 *
 * It would work - the Eshop has it - but requiring it means the Appstore has
 * to load a library it may not want in order to render a footer, and it means
 * the version this was written against becomes a constraint on both
 * applications forever. Everything used below is in Chrome 72, which is this
 * platform's floor: fetch, classList, closest, template literals. The widget
 * neither needs jQuery nor minds it being there.
 *
 * NO BUILD STEP. Two files and a script tag. Somebody working on a
 * CodeIgniter controller should not have to install npm to change a phone
 * number - and they do not have to change anything at all, because the
 * numbers come from the API.
 *
 * WHAT COMES FROM WHERE
 *
 *   the footer   GET /site/footer, the same endpoint crystal-web reads, so
 *                all three are in step the moment somebody saves in the
 *                console. Its content is DATA and is never translated.
 *   the header   built here from a fixed menu, because it is Crystal's own
 *                navigation rather than content, and it must not wait on a
 *                request before the page has a bar across the top.
 *   the words    translated below, in three languages, for the labels this
 *                file owns.
 * ===================================================================== */

(function (window, document) {
  'use strict';

  /* ---------------------------------------------------------------- */
  /*  configuration                                                    */
  /* ---------------------------------------------------------------- */

  /**
   * Read off the script tag, so a host application configures this without
   * writing any JavaScript:
   *
   *   <script src="/crystal-chrome/crystal-chrome.js"
   *           data-api="https://api.crystal.example/api"
   *           data-site="https://www.crystal.example"
   *           data-active="eshop"
   *           data-lang="zh"></script>
   *
   * `document.currentScript` is not available once the script has finished
   * executing, so it is captured immediately.
   */
  var script = document.currentScript
    || (function () {
      var all = document.getElementsByTagName('script');
      return all[all.length - 1];
    }());

  function attr(name, fallback) {
    var value = script && script.getAttribute(name);
    return value === null || value === undefined || value === '' ? fallback : value;
  }

  var config = {
    /* Where the API lives. Same-origin deployments can leave it as /api. */
    api: attr('data-api', '/api').replace(/\/+$/, ''),
    /* Where the main website lives, for the links back into it. */
    site: attr('data-site', '').replace(/\/+$/, ''),
    /* Which heading to mark as the current one: eshop | appstore | ''. */
    active: attr('data-active', ''),
    /*
     * The language. Falls back to the page's own <html lang>, which is what
     * a Laravel or CodeIgniter layout will already have set - so the usual
     * case needs no attribute at all.
     */
    lang: attr('data-lang', (document.documentElement.getAttribute('lang') || 'en')),
    /* `dark` puts the widget into the dark palette; see the stylesheet. */
    theme: attr('data-theme', 'light')
  };

  /* ---------------------------------------------------------------- */
  /*  words                                                            */
  /* ---------------------------------------------------------------- */

  /*
   * ONLY THE LABELS THIS FILE OWNS.
   *
   * The footer's content - the download names, the numbers, the address -
   * arrives from the API and is NOT translated: it is the company's data,
   * not this widget's vocabulary. Running it through a dictionary would mean
   * Crystal editing its own records on the way to the page.
   */
  var WORDS = {
    en: {
      crystal: 'Crystal',
      smartphones: 'Smartphones',
      eproducts: 'Eproducts',
      eshop: 'Eshop',
      appstore: 'Appstore',
      blog: 'Blog',
      about: 'About',
      account: 'My account',
      signIn: 'Sign in',
      menu: 'Menu',
      rights: 'Crystal Electronics. All rights reserved.'
    },
    zh: {
      crystal: '晶石',
      smartphones: '智能手机',
      eproducts: '电子产品',
      eshop: '商城',
      appstore: '应用商店',
      blog: '博客',
      about: '关于我们',
      account: '我的账户',
      signIn: '登录',
      menu: '菜单',
      rights: '晶石电子。保留所有权利。'
    },
    ru: {
      crystal: 'Crystal',
      smartphones: 'Смартфоны',
      eproducts: 'Электроника',
      eshop: 'Eshop',
      appstore: 'Appstore',
      blog: 'Блог',
      about: 'О компании',
      account: 'Мой аккаунт',
      signIn: 'Войти',
      menu: 'Меню',
      rights: 'Crystal Electronics. Все права защищены.'
    }
  };

  /** `zh-CN` and `ZH` both mean zh; anything unknown means English. */
  function say(key) {
    var base = String(config.lang || 'en').toLowerCase().split(/[-_]/)[0];
    var table = WORDS[base] || WORDS.en;
    return table[key] === undefined ? WORDS.en[key] : table[key];
  }

  /* ---------------------------------------------------------------- */
  /*  helpers                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * ESCAPED, ALWAYS.
   *
   * Every string below reaches the page through innerHTML, and the footer's
   * content comes out of a database an administrator types into. An address
   * containing an angle bracket must render as an angle bracket, not as the
   * start of a tag.
   */
  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** A link into the main website, absolute when a site URL was configured. */
  function siteUrl(path) {
    return config.site ? config.site + path : path;
  }

  /* A chevron and an arrow, inline so the widget needs no icon font. */
  var CHEVRON = '<svg class="crystal-chrome-chevron" width="16" height="16" viewBox="0 0 24 24"'
    + ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"'
    + ' stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';

  var DOWNLOAD = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"'
    + ' stroke="currentColor" stroke-width="2" stroke-linecap="round"'
    + ' stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>'
    + '<polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';

  var PHONE = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"'
    + ' stroke="currentColor" stroke-width="2" stroke-linecap="round"'
    + ' stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07'
    + ' 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72'
    + ' 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27'
    +'a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>';

  var BURGER = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"'
    + ' stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21"'
    + ' y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21"'
    + ' y2="18"></line></svg>';

  /* ---------------------------------------------------------------- */
  /*  the header                                                       */
  /* ---------------------------------------------------------------- */

  /**
   * The same headings crystal-web has, in the same order.
   *
   * The Eshop and the Appstore point at THEMSELVES rather than at the main
   * site: a member on the Eshop clicking "Eshop" should stay where they are,
   * and the point of this widget is that the three sites are one site.
   */
  function headings() {
    return [
      { key: 'smartphones', label: say('smartphones'), href: siteUrl('/smartphones') },
      { key: 'eproducts', label: say('eproducts'), href: siteUrl('/eproducts') },
      { key: 'eshop', label: say('eshop'), href: attr('data-eshop', siteUrl('/account/eshop/card')) },
      { key: 'appstore', label: say('appstore'), href: attr('data-appstore', siteUrl('/account/appstore/purchases')) },
      { key: 'blog', label: say('blog'), href: siteUrl('/blog') },
      { key: 'about', label: say('about'), href: siteUrl('/about') }
    ];
  }

  function headerHtml() {
    var items = headings();
    var nav = '';
    var sheet = '';

    for (var i = 0; i < items.length; i += 1) {
      var item = items[i];
      var active = item.key === config.active ? ' is-active' : '';

      nav += '<a class="crystal-chrome-nav-link' + active + '" href="' + esc(item.href) + '">'
        + esc(item.label) + '</a>';

      /*
       * EVERY ROW IN THE SHEET GETS THE SAME CHEVRON, the two stores
       * included. They were an external-link icon on the main site, which
       * told a member that tapping Eshop takes them off Crystal - and to a
       * member the Eshop is Crystal.
       */
      sheet += '<a class="crystal-chrome-sheet-link" href="' + esc(item.href) + '">'
        + '<span>' + esc(item.label) + '</span>' + CHEVRON + '</a>';
    }

    return ''
      + '<div class="crystal-chrome-bar crystal-chrome-inner">'
      +   '<div class="crystal-chrome-left">'
      +     '<button type="button" class="crystal-chrome-burger"'
      +       ' aria-label="' + esc(say('menu')) + '" aria-expanded="false">' + BURGER + '</button>'
      +     '<a class="crystal-chrome-brand" href="' + esc(siteUrl('/')) + '">'
      +       '<span class="crystal-chrome-mark">C</span>'
      +       '<span class="crystal-chrome-wordmark">' + esc(say('crystal')) + '</span>'
      +     '</a>'
      +     '<nav class="crystal-chrome-nav">' + nav + '</nav>'
      +   '</div>'
      +   '<div class="crystal-chrome-right">'
      +     '<a class="crystal-chrome-action" href="' + esc(siteUrl('/account')) + '">'
      +       esc(say('account')) + '</a>'
      +   '</div>'
      + '</div>'
      + '<div class="crystal-chrome-sheet">' + sheet + '</div>';
  }

  /* ---------------------------------------------------------------- */
  /*  the footer                                                       */
  /* ---------------------------------------------------------------- */

  /**
   * What the footer says before the API has answered, and if it never does.
   *
   * The footer is at the bottom of every page, so a widget that rendered
   * nothing until a request came back would leave a hole on every first
   * paint - and a hole permanently if the API is unreachable. The server
   * merges the saved document over its own copy of this, so the two agree.
   */
  var FALLBACK = {
    downloads: { title: 'Downloads', items: [] },
    contacts: { title: 'Contact us', phones: [] },
    support: { title: 'Support', links: [] },
    company: { title: 'Crystal', email: '', address: '' },
    sites: []
  };

  function columnHtml(title, body) {
    return '<div><p class="crystal-chrome-col-title">' + esc(title) + '</p>' + body + '</div>';
  }

  function footerHtml(doc) {
    var i;
    var html = '';

    /* 1 - the apps. */
    var downloads = '';
    for (i = 0; i < doc.downloads.items.length; i += 1) {
      var file = doc.downloads.items[i];
      downloads += '<a class="crystal-chrome-col-link" href="' + esc(file.href) + '">'
        + DOWNLOAD + esc(file.label) + '</a>';
    }
    html += columnHtml(doc.downloads.title, downloads);

    /* 2 - the numbers, as tel: links. */
    var phones = '';
    for (i = 0; i < doc.contacts.phones.length; i += 1) {
      var phone = String(doc.contacts.phones[i]);
      phones += '<a class="crystal-chrome-col-link" href="tel:'
        + esc(phone.replace(/[^\d+]/g, '')) + '">' + PHONE + esc(phone) + '</a>';
    }
    html += columnHtml(doc.contacts.title, '<div class="crystal-chrome-phones">' + phones + '</div>');

    /* 3 - support. A path stays on the main site; a full address does not. */
    var support = '';
    for (i = 0; i < doc.support.links.length; i += 1) {
      var link = doc.support.links[i];
      var href = link.to ? siteUrl(link.to) : link.href;
      support += '<a class="crystal-chrome-col-link" href="' + esc(href) + '">'
        + esc(link.label) + '</a>';
    }
    html += columnHtml(doc.support.title, support);

    /* 4 - the company. */
    var company = '';
    if (doc.company.email) {
      company += '<a class="crystal-chrome-col-link" href="mailto:' + esc(doc.company.email)
        + '">' + esc(doc.company.email) + '</a>';
    }
    if (doc.company.address) {
      company += '<p class="crystal-chrome-col-text">' + esc(doc.company.address) + '</p>';
    }
    html += columnHtml(doc.company.title, company);

    /* The two corner buttons - and only the ones with somewhere to go. */
    var sites = '';
    for (i = 0; i < doc.sites.length; i += 1) {
      var site = doc.sites[i];
      if (!site.href) continue;
      sites += '<a class="crystal-chrome-action" href="' + esc(site.href)
        + '" target="_blank" rel="noopener">' + esc(site.label) + '</a>';
    }

    return ''
      + '<div class="crystal-chrome-inner">'
      +   '<div class="crystal-chrome-footer-top">' + html + '</div>'
      +   '<div class="crystal-chrome-footer-bottom">'
      +     '<div class="crystal-chrome-copyright">'
      +       '<span class="crystal-chrome-mark">C</span>'
      +       '<span>&copy; ' + new Date().getFullYear() + ' ' + esc(say('rights')) + '</span>'
      +     '</div>'
      +     '<div class="crystal-chrome-sites">' + sites + '</div>'
      +   '</div>'
      + '</div>';
  }

  /** Whatever came back, with every field the renderer reads present. */
  function shape(held) {
    var doc = held && typeof held === 'object' ? held : {};
    var list = function (value) { return Object.prototype.toString.call(value) === '[object Array]' ? value : []; };

    return {
      downloads: {
        title: (doc.downloads && doc.downloads.title) || FALLBACK.downloads.title,
        items: list(doc.downloads && doc.downloads.items)
      },
      contacts: {
        title: (doc.contacts && doc.contacts.title) || FALLBACK.contacts.title,
        phones: list(doc.contacts && doc.contacts.phones)
      },
      support: {
        title: (doc.support && doc.support.title) || FALLBACK.support.title,
        links: list(doc.support && doc.support.links)
      },
      company: {
        title: (doc.company && doc.company.title) || FALLBACK.company.title,
        email: (doc.company && doc.company.email) || '',
        address: (doc.company && doc.company.address) || ''
      },
      sites: list(doc.sites)
    };
  }

  /* ---------------------------------------------------------------- */
  /*  wiring                                                           */
  /* ---------------------------------------------------------------- */

  function mountHeader(host) {
    host.className = 'crystal-chrome crystal-chrome-header'
      + (config.theme === 'dark' ? ' crystal-chrome-dark' : '');
    host.innerHTML = headerHtml();

    var burger = host.querySelector('.crystal-chrome-burger');
    var sheet = host.querySelector('.crystal-chrome-sheet');

    if (burger && sheet) {
      burger.addEventListener('click', function () {
        var open = sheet.className.indexOf('is-open') === -1;
        sheet.className = 'crystal-chrome-sheet' + (open ? ' is-open' : '');
        burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }
  }

  function mountFooter(host) {
    host.className = 'crystal-chrome crystal-chrome-footer'
      + (config.theme === 'dark' ? ' crystal-chrome-dark' : '');

    /* Drawn immediately from the fallback, then again when the API answers. */
    host.innerHTML = footerHtml(shape(null));

    var url = config.api + '/site/footer';

    /*
     * A FAILURE IS NOT AN ERROR HERE. The bottom of a shop is not the place
     * to report that a settings endpoint is down - the fallback is already
     * on the page and the visitor is none the wiser. It is logged, because
     * nobody can fix what nothing reports.
     */
    window.fetch(url, { credentials: 'omit', headers: { 'X-Lang': config.lang } })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (body) {
        host.innerHTML = footerHtml(shape(body && body.data));
      })
      .catch(function (err) {
        if (window.console && window.console.warn) {
          window.console.warn('[crystal-chrome] the footer could not be loaded from '
            + url + ' - ' + err.message);
        }
      });
  }

  /**
   * MOUNTS INTO WHATEVER IS ON THE PAGE, and does not mind if one is absent.
   *
   * A CodeIgniter layout that wants only the footer puts only the footer
   * placeholder in; the header half then does nothing rather than throwing
   * and taking the footer with it.
   */
  function mount() {
    var header = document.getElementById('crystal-header');
    var footer = document.getElementById('crystal-footer');

    if (header) mountHeader(header);
    if (footer) mountFooter(footer);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  /* Exposed so a host application can re-render after changing the language. */
  window.CrystalChrome = {
    config: config,
    mount: mount,
    setLanguage: function (lang) {
      config.lang = lang;
      mount();
    }
  };
}(window, document));
