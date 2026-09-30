# Serving `/uploads` — and why video makes it urgent

Written for: whoever deploys Crystal.

Everything a visitor sees that was uploaded through the console — product
photographs, series banners, advert artwork and now advert **video** — is a
file under `UPLOAD_DIR`, published at `/uploads/...`.

Today Node serves it (`app.js`, the `express.static` mount). That is correct
and it is not what you want in front of a campaign.

## The problem, in one paragraph

A hero or popup advert may be an MP4 of up to `MAX_VIDEO_UPLOAD_MB`
(60 by default). Every visitor who reaches that slide downloads it. Served by
Node, those bytes travel through the same event loop and the same process that
answers `/api/...`: a thousand people watching a 6 MB clip is 6 GB of egress
and a thousand long-lived sockets held by the API server, and the API gets
slower for everyone — including the people who are not watching anything.

Nginx exists to do precisely this, with `sendfile`, byte ranges and an open
file cache, without occupying a JavaScript runtime.

## The location block

Put this **before** the `/api` proxy, in the same `server` block:

```nginx
# Uploaded files are static. Nginx serves them; Node never sees the request.
location /uploads/ {
    alias /srv/crystal/uploads/;   # must match UPLOAD_DIR, with a trailing slash

    # The bytes never change under a name: a replaced picture is a new file
    # with a new name, because the upload step generates the name. So they can
    # be cached hard and for a long time.
    expires 30d;
    add_header Cache-Control "public, max-age=2592000, immutable" always;

    # The same three headers app.js sets, because Node is no longer setting them.
    add_header Cross-Origin-Resource-Policy "cross-origin" always;
    add_header Content-Security-Policy "default-src 'none'; img-src 'self'; media-src 'self'" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Large files, efficiently. sendfile keeps the bytes out of user space;
    # the two below stop one slow reader holding a worker.
    sendfile on;
    tcp_nopush on;
    aio threads;                   # needs --with-threads; drop the line if absent
    output_buffers 2 1m;

    # Byte ranges are what let a browser seek in a video and resume a download.
    # They are on by default; this is here so nobody turns them off by accident.
    max_ranges 1;

    # Nothing under here is ever executed, and nothing is generated.
    autoindex off;
    access_log off;
}
```

Two details that are easy to miss:

- **`alias`, not `root`.** With `root /srv/crystal/uploads`, nginx looks for
  `/srv/crystal/uploads/uploads/...`. The trailing slash on both the location
  and the alias matters.
- **MIME types.** `video/mp4` and `video/webm` must be in `mime.types` (they
  are, in every stock build). If a browser refuses to play a file that
  downloads fine, check `Content-Type` first — it is almost always this.

## Optional: `mp4` module for pseudo-streaming

If you serve long films and want seeking to a point that has not downloaded
yet, add `mp4;` inside the location and build nginx with `--with-http_mp4_module`.
An advert that loops for ten seconds does not need it.

## The size ceiling

Nginx must be allowed to accept what the console can send, or the upload fails
at the proxy with 413 before Node sees it:

```nginx
client_max_body_size 64m;   # >= MAX_VIDEO_UPLOAD_MB, with room for the multipart wrapper
```

## What is NOT affected

Signed images fetched through `/api/site/verified-image` still go through
Node, deliberately: that endpoint exists to check a signature against the exact
bytes before they are sent, which nginx cannot do. It is a small, cached path,
and video never uses it — video is not signed. See `middleware/upload.js` for
why.

## If you would rather use a CDN

Point the CDN at the same origin with the same cache headers and change
nothing else: the storefront asks for `/uploads/...` relative to the API host,
so a CDN in front of that host needs no application change. Object storage
(S3 and friends) is a larger change — the upload path, the file cleanup in
`services/storedFiles.service.js`, and a migration for the files already on
disk — and is only worth it once one machine is genuinely the limit.
