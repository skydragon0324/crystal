# Crystal Chrome — a shared header and footer for the Eshop and the Appstore

Two files, one script tag, no build step and no framework. The Eshop is
CodeIgniter and the Appstore is Laravel; neither can import a React component,
and to a member both of them *are* Crystal — so the bar across the top and the
block along the bottom have to match `crystal-web` without being it.

```
chrome/
├── crystal-chrome.css     the styles, every class namespaced
├── crystal-chrome.js      builds the header and footer, fetches the footer
├── example.html           a working page to open in a browser
└── README.md              this
```

## "Can it be pure HTML with jQuery and AJAX?" — and what is better

Yes, it can. It is not what this does, and the reason is worth a paragraph
because it is the whole point of the exercise.

**Pasting the markup into each layout is the problem, not the solution.** Write
the header out as HTML and drop a copy into the CodeIgniter layout and another
into the Blade layout, and you have three copies on day one and three
*different* copies by the end of the month — because the one thing nobody ever
does is remember to edit all three. Consistency is what was asked for, and
copied markup is the thing that destroys it.

So the markup lives in **one file** and is built into a placeholder:

```html
<div id="crystal-header"></div>
...
<div id="crystal-footer"></div>
```

Edit `crystal-chrome.js` once and all three sites change. That is the only
difference that matters between this and the paste-it-in approach, and it is
the difference the request is actually about.

**On jQuery specifically: it is not needed, and requiring it would cost you.**
The Eshop already loads it, but the Appstore should not have to load a library
in order to render a footer — and pinning both applications to the version this
was written against is a constraint that never goes away. Everything used here
is in **Chrome 72**, which is this platform's floor: `fetch`, `classList`,
`closest`, template literals. The widget neither needs jQuery nor minds it
being on the page.

**Other options, and why not:**

| | |
| --- | --- |
| **Server-side include** (`<?php include ?>` of a shared file on a shared mount) | Fastest, no JavaScript at all — but it needs the two applications to share a filesystem, which two separate deployments do not. |
| **An iframe** | Genuinely isolated, and genuinely awful: fixed height, no sticky header, its own scrollbar, and a screen reader treats it as a separate document. |
| **A web component** | Neat, and `customElements` is Chrome 67 so it would work — but it buys encapsulation this does not need (the classes are already namespaced) and makes the file harder to read for somebody whose day job is PHP. |
| **npm package** | Correct for two React apps. These are not React apps, and asking a CodeIgniter developer to run a build to change a footer is how the footer stops being changed. |

## Using it

### CodeIgniter (the Eshop)

In your layout view, usually `application/views/layouts/main.php`:

```php
<head>
  ...
  <link rel="stylesheet" href="<?= base_url('assets/crystal-chrome/crystal-chrome.css') ?>">
</head>
<body>
  <div id="crystal-header"></div>

  <?= $content ?>

  <div id="crystal-footer"></div>

  <script src="<?= base_url('assets/crystal-chrome/crystal-chrome.js') ?>"
          data-api="https://api.crystal.example/api"
          data-site="https://www.crystal.example"
          data-active="eshop"
          data-lang="<?= $this->lang->lang() ?>"></script>
</body>
```

### Laravel (the Appstore)

In `resources/views/layouts/app.blade.php`:

```blade
<head>
  ...
  <link rel="stylesheet" href="{{ asset('crystal-chrome/crystal-chrome.css') }}">
</head>
<body>
  <div id="crystal-header"></div>

  @yield('content')

  <div id="crystal-footer"></div>

  <script src="{{ asset('crystal-chrome/crystal-chrome.js') }}"
          data-api="{{ config('services.crystal.api') }}"
          data-site="{{ config('services.crystal.site') }}"
          data-active="appstore"
          data-lang="{{ app()->getLocale() }}"></script>
</body>
```

Copy the two files into the application's public assets directory as part of
your deploy — or serve them from the Crystal website and point the two tags at
it, which means neither application redeploys when the chrome changes.

## The script tag's attributes

| attribute | default | what it does |
| --- | --- | --- |
| `data-api` | `/api` | Where the Crystal API is. The footer is `GET {api}/site/footer`. |
| `data-site` | *(empty)* | Where the main website is, for the links back into it. Empty means same-origin paths. |
| `data-active` | *(empty)* | `eshop` or `appstore` — which heading to mark as current. |
| `data-lang` | `<html lang>` | `en`, `zh` or `ru`. Falls back to the page's own attribute, so the usual case needs nothing. |
| `data-theme` | `light` | `dark` for the dark palette. Deliberately **not** `prefers-color-scheme`: the host page has its own idea of light and dark and will not have consulted it. |
| `data-eshop` | *(the account page)* | Where the Eshop heading points. Set it on the Eshop itself so the heading stays on the site. |
| `data-appstore` | *(the account page)* | The same, for the Appstore. |

## What comes from where

- **The footer is fetched** from `GET /site/footer` — the same endpoint
  `crystal-web` reads. Change a phone number in the console and all three
  sites have it on the next page load, with nothing redeployed.
- **The header is built locally.** It is Crystal's own navigation rather than
  content, and it must not wait on a request before the page has a bar across
  the top.
- **The footer's content is never translated.** The download names, the
  numbers and the address are the company's data; only the labels this widget
  owns (the headings, "Sign in", the copyright line) are, and those are in
  `WORDS` at the top of the script.

## Two things to set up once

**CORS.** The two stores are on different origins from the API, so their
origins have to be in `CORS_ORIGINS` in the backend's `.env` — otherwise the
footer request is refused by the browser and the widget falls back silently:

```ini
CORS_ORIGINS=https://www.crystal.example,https://eshop.crystal.example,https://appstore.crystal.example
```

**Nothing else.** The footer request sends `credentials: 'omit'` and no token —
it is public, the same document for everybody, and deliberately carries nothing
about who is looking.

## If the API cannot be reached

The footer renders anyway, from the fallback in the script, and the failure is
logged to the console. The bottom of a shop is not the place to report that a
settings endpoint is down — and a footer that disappears when a third service
hiccups is worse than one that is briefly out of date.

## Checking it

Open `example.html` in a browser. It points at `http://localhost:5400/api` by
default, so with the backend running you will see the real footer; with it
stopped you will see the fallback and a warning in the console, which is the
degraded path working.
