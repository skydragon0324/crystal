# Signed content

Notices, FAQs and uploaded images are **signed on the server**, and the
storefront (crystal-web) **verifies the signature before it renders them**. An image is verified byte for byte: the storefront downloads
it, hashes it, and only draws it when the hash is the one that was signed.

This document is for whoever runs, rotates or audits it. The design decisions
are recorded beside the code (`src/security/`) in the comments; this is the
operating manual.

- [What a signature proves, and what it does not](#what-a-signature-proves-and-what-it-does-not)
- [How trust is established](#how-trust-is-established)
- [The pieces](#the-pieces)
- [Keys and certificates](#keys-and-certificates)
- [PKCS#12 (.p12) keys and the CA chain](#pkcs12-p12-keys-and-the-ca-chain)
- [Switching algorithms](#switching-algorithms)
- [Rotation](#rotation)
- [Revocation, and after a compromise](#revocation-and-after-a-compromise)
- [Which writes sign, and how atomically](#which-writes-sign-and-how-atomically)
- [The audit and the backfill](#the-audit-and-the-backfill)
- [Signatures in the database](#signatures-in-the-database)
- [Tests and checks](#tests-and-checks)
- [Walkthrough: catching a tampered image and a tampered notice](#walkthrough-catching-a-tampered-image-and-a-tampered-notice)
- [Signatures versus ordinary application security](#signatures-versus-ordinary-application-security)
- [Limitations](#limitations)

---

## What a signature proves, and what it does not

A valid signature says: **these exact bytes were written through Crystal's
backend, by a process holding the signing key, and nothing has changed them
since.** A notice edited straight in the database, a file replaced on disk, a
response rewritten by a proxy - all of those arrive at the storefront as
content whose signature no longer matches, and the storefront never draws it:
a picture or an answer gets a neutral "could not be verified" in its place,
and a notice is simply not listed.

It does **not** say the content is true, appropriate or authorised. An
administrator with console access who publishes something wrong gets a valid
signature on it: signing happens *after* the ordinary permission checks, and
never replaces them. A valid signature is never authorisation for anything.

## How trust is established

**The storefront's trust is pinned at build time.** crystal-web is built with
`REACT_APP_CONTENT_SIGNING_KEYS`, a JSON list of the public keys it believes:

```
REACT_APP_CONTENT_SIGNING_KEYS=[{"keyId":"content-key-v1","algorithm":"ECDSA-P256-SHA256","spki":"MFkwEwYH..."}]
```

`spki` is the base64 DER SubjectPublicKeyInfo of the key. Nothing the API
sends can add to that list: a reply names a `keyId`, the storefront looks the
id up in its own list, and the key it finds there decides the algorithm. A key
or certificate that arrived in a response would prove nothing, which is why none
ever does. An empty list means **nothing verifies**, and the storefront fails
closed.

The X.509 certificate beside each private key is how the *backend* manages the
identity - it carries a validity window the server checks at startup, and is
the format every key tool understands. A certificate `npm run content-keys`
makes is self-signed and names its key id (subject CN). A certificate from a CA
- normally delivered as a [.p12](#pkcs12-p12-keys-and-the-ca-chain) - is also
**checked against the CA chain**: when the API starts, by the audit, and by the
setup tool before it prints the pin. The browser never sees the chain. Either
way, the pin is the trust: the chain decides whether a key is *fit to be
pinned*, and the pin decides what the storefront believes.

For development, `npm run content-keys` writes the pin to
`crystal-web/.env.development.local` (ignored by git and svn). For a production
build, set the same variable in the build environment - see
[Rotation](#rotation) for how it changes over time.

## The pieces

| File | What it does |
| --- | --- |
| `src/security/schemas.js` | The fields each signed type is made of, in order. crystal-web has the same table. |
| `src/security/canonicalPayload.js` | The exact bytes signed: `{"v":1,"type","alg","kid","content"}` as UTF-8 JSON. |
| `src/security/algorithms/{ecdsa,rsa}.js` | The two implementations, and `index.js`, the only place a name becomes one. |
| `src/security/signingConfig.js` | Reads the `CONTENT_SIGNING_*` values and refuses what they cannot mean. |
| `src/security/keyProvider.js` | Loads and checks the active key (from a .p12 or the key directory) and the trusted certificates; the certificate and chain checks. |
| `src/utils/x509.js` | Runs openssl (no shell) and parses what it prints - shared with the desktop certificate sign-in. |
| `src/security/signatureValidation.js` | Every envelope check that is not cryptography. |
| `src/security/signingService.js` | `signContent`, `verifyContent`, storing signatures, building envelopes. |
| `src/security/contentOf.js` | A row or a file, as the content a signature covers. |
| `src/security/imageFile.js` | A stored file's real type (from its bytes), size and SHA-256. |
| `src/security/signedRows.js` | The CRUD and spreadsheet hook: sign on write, refuse to re-sign a tampered row. |
| `src/services/integrity.service.js` | The `integrity` envelopes on storefront replies. |
| `src/security/{inventory,maintenance}.js` | Everything signable; the audit and the backfill. |
| `crystal_v1.content_signatures` | One current signature per item (`sql/deltas/029`), and the last audit's verdict on it (`sql/deltas/030`). |
| `crystal_v1.v_*_signatures` | Each notice, FAQ, advert, product image and media image beside its signature and its state (`sql/deltas/030`). |
| `scripts/content-keys.js` | Development keys, the storefront pin (also for a checked .p12), a development CA and .p12, and the test vectors. |
| `test/fixtures/signing-vectors.json` | Shared vectors; crystal-web copies them verbatim. |

### What is signed

| Type | Covers | Not covered |
| --- | --- | --- |
| `notification` | a `site_notices` row: id, title, content (the stored HTML), origin id, status, window, order, created/updated | the origin's name and colour (a join), `is_deleted` |
| `faq` | a `faqs` row: id, category (a product kind, or the Crystal App, Eshop or Appstore - `faq_category`), question, answer, order, status, created/updated | `view_count`; the catalogue section, which is no longer a column (delta 033 - its migration re-signed every FAQ whose old signature still held) |
| `image` | a file under the upload directory: storage key (`/uploads/...`), MIME type from its bytes, size, SHA-256 | anything about which row points at it |

**Feedback is not signed.** Threads and their messages - staff replies
included - live in the vendor's `ora_pid` schema: the vendor's database, which
Crystal reads and writes but does not own. The storefront renders them as it
always has, and neither the audit nor the backfill looks at them.

**Crystal does not transform uploads.** There are no resized or re-encoded
variants: the file the storefront downloads is the file that was uploaded and
signed. A future variant would be a different storage key, signed on its own -
never a source hash compared against a transformed file.

### Where the storefront finds the envelopes

Every item it verifies carries `integrity: { content, signature }` beside its
usual fields (which stay, for the console and anything else that reads them):
`GET /site/adverts/:placement`, the `hero_slides`, `hero.media` and
`support.faqs` of `/smartphones/home` and `/sections/:type/home`, the `images`
and `media` of `/products/:slug` (and `product.main_image_integrity`),
`/products/:slug/gallery`, `/notices`, `/support/faqs` and `/support/faqs/:id`.

The envelope is **the item as it is now beside the signature that was stored**
when it was last signed. Nothing is verified or signed on the read path - so a
change that skipped signing reaches the storefront as a mismatch, rather than
being signed on its way out. `integrity: null` means there is nothing to verify
against, and the storefront treats it as invalid.

## Keys and certificates

A signing identity is a **key id** with two files in the key directory:

```
<keyId>.key.pem   the private key - PKCS#8 PEM, unencrypted, mode 600. The ACTIVE key only.
<keyId>.crt.pem   an X.509 certificate for its public key, subject CN = <keyId>
```

### Development

```
cd crystal-backend
npm run content-keys
```

writes `.content-keys/content-key-dev.key.pem` and `.crt.pem` (ECDSA P-256,
825 days), and rewrites `REACT_APP_CONTENT_SIGNING_KEYS` in
`crystal-web/.env.development.local` from every certificate in the directory.
It never replaces an existing key id - run it again and it only refreshes the
storefront pin. With **no** `CONTENT_SIGNING_*` variables set and `NODE_ENV`
not `production`, the API signs with this key. Restart the storefront's dev
server after it changes.

`npm run db:reset` runs it first, so a fresh machine gets a key.

### Production, with the script

```
npm run content-keys -- --algorithm ECDSA --key-id content-key-v1 --dir /secure/content-keys --no-web-env
npm run content-keys -- --algorithm RSA   --key-id content-key-rsa-v1 --dir /secure/content-keys --no-web-env
```

It prints the backend configuration to use. Keep the directory outside the
checkout, readable only by the user the API runs as.

### Production, by hand with openssl

A config file keeps the command identical across OpenSSL 1.1 and 3.x (and
avoids Git Bash rewriting `-subj /CN=...` into a Windows path):

```
cat > content-key.cnf <<'EOF'
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = content-key-v1
[ext]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature
subjectKeyIdentifier = hash
EOF
```

ECDSA P-256:

```
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -sha256 -days 825 \
  -config content-key.cnf -keyout content-key-v1.key.pem -out content-key-v1.crt.pem
chmod 600 content-key-v1.key.pem
```

RSA 3072 (change `CN` in the config to the RSA key's id first):

```
openssl req -x509 -newkey rsa:3072 -nodes -sha256 -days 825 \
  -config content-key.cnf -keyout content-key-rsa-v1.key.pem -out content-key-rsa-v1.crt.pem
chmod 600 content-key-rsa-v1.key.pem
```

The storefront pin for a certificate:

```
openssl x509 -in content-key-v1.crt.pem -pubkey -noout | openssl pkey -pubin -outform DER | base64 -w0
```

giving the `spki` of `{"keyId":"content-key-v1","algorithm":"ECDSA-P256-SHA256","spki":"..."}`
(or `"RSA-PSS-SHA256"` for an RSA key).

### Configuration

ECDSA:

```
CONTENT_SIGNING_ALGORITHM=ECDSA
CONTENT_SIGNING_KEY_ID=content-key-v1
CONTENT_SIGNING_KEY_DIR=/secure/content-keys
CONTENT_SIGNING_VERIFY_KEY_IDS=
CONTENT_SIGNING_REVOKED_KEY_IDS=
```

RSA-PSS:

```
CONTENT_SIGNING_ALGORITHM=RSA
CONTENT_SIGNING_KEY_ID=content-key-rsa-v1
CONTENT_SIGNING_KEY_DIR=/secure/content-keys
CONTENT_SIGNING_VERIFY_KEY_IDS=
CONTENT_SIGNING_REVOKED_KEY_IDS=
```

| Algorithm | Envelope name | Key | Parameters | Signature |
| --- | --- | --- | --- | --- |
| `ECDSA` | `ECDSA-P256-SHA256`, encoding `ieee-p1363` | EC prime256v1 | SHA-256 | raw r‖s, 64 bytes |
| `RSA` | `RSA-PSS-SHA256`, encoding `rsa-pss` | RSA ≥ 3072 bits (rsaEncryption) | SHA-256, MGF1-SHA-256, salt 32 | modulus length (384 bytes at 3072) |

**The server refuses to start** - with a sentence naming the problem, and no
fallback - when: the algorithm is not exactly `ECDSA` or `RSA`; any of the
required values is missing (in production, or once any one is set); a key id
is not a plain name; the active key id is revoked; the private key or
certificate is missing or unreadable; the certificate is for a different key
pair; the key is the wrong type or size for the algorithm; a self-signed
certificate's CN is not the key id; the active certificate is outside its
validity window; `openssl` is not found (`OPENSSL_BIN`; Node 12 cannot read
certificate dates); in production, the private key file is readable by group
or others; or anything in [the .p12 list](#what-startup-checks) fails. An
active certificate that expires **within 30 days** is a startup *warning*.

## PKCS#12 (.p12) keys and the CA chain

A signing key issued by a CA usually arrives as a `.p12` (PKCS#12) file: the
private key, its certificate and the CA certificates, protected by a password.
The API signs straight from that file, and checks the certificate against the
CA's chain before it signs anything.

**The storefront does not change.** It still pins one public key at build
time, exactly as in [How trust is established](#how-trust-is-established). The
chain is checked where somebody can act on the answer - when the API starts, in
the audit, and by the setup tool before it will print a pin - never in a
browser. A certificate that fails the chain is never pinned and never signs.

### The .env variables

```
CONTENT_SIGNING_ALGORITHM=ECDSA
CONTENT_SIGNING_KEY_ID=content-key-v2
CONTENT_SIGNING_P12=/secure/content-signing.p12
CONTENT_SIGNING_P12_PASSWORD=the-export-password
CONTENT_SIGNING_CA_CHAIN=/secure/caChain.crt
# only while previous keys are still believed (rotation, renewal):
CONTENT_SIGNING_KEY_DIR=/secure/content-keys
CONTENT_SIGNING_VERIFY_KEY_IDS=content-key-v1
CONTENT_SIGNING_REVOKED_KEY_IDS=
```

- With `CONTENT_SIGNING_P12` set, the **active** key comes from that file and
  nowhere else. `CONTENT_SIGNING_ALGORITHM` and `CONTENT_SIGNING_KEY_ID` are
  still required: the key id is the name the storefront pins the key under, and
  is never read out of the certificate (a CA chooses that name, and keeps it
  across a renewal). The algorithm must match the key in the file.
- `CONTENT_SIGNING_P12_PASSWORD` is required with the file.
- `CONTENT_SIGNING_CA_CHAIN` is the PEM file of the CA certificates the signing
  certificate must verify against - the root, and any intermediates. It must
  contain the root: the chain is anchored there, and an intermediate on its own
  does not verify (`unable to get local issuer certificate`). **Required in
  production** whenever a .p12 is used; optional in development, where startup
  says the chain was not checked. With a key directory it is optional everywhere
  (those certificates are self-signed, and chain to nothing) and, when set,
  applies the same checks to the key-directory certificate.
- `CONTENT_SIGNING_KEY_DIR` is only where **previous** keys' certificates
  (`<keyId>.crt.pem`) are read from, and is needed only when
  `CONTENT_SIGNING_VERIFY_KEY_IDS` names any. It must not hold a private key
  under the active id, nor a certificate under the active id for a different
  key.

### What startup checks

In this order, each failure a startup error naming the problem:

1. The file exists, and opens with the password. A wrong password (or a
   damaged file) is `could not open the .p12 at ... - wrong password or damaged
   file`, and the message never contains the password.
2. It holds exactly one private key and exactly one certificate for it (the
   one carrying the key's localKeyID); any other certificates in it are the
   bundled CA certificates.
3. The certificate's public key is the private key's public key.
4. The key is the type and size `CONTENT_SIGNING_ALGORITHM` needs.
5. The certificate is inside its validity window (a warning within 30 days of
   its end).
6. It is not a CA certificate (`basicConstraints` `CA:TRUE`), and if it has a
   `keyUsage` extension, that includes Digital Signature.
7. `openssl verify -CAfile <CONTENT_SIGNING_CA_CHAIN> -untrusted <the bundled
   CA certificates> <the certificate>` succeeds. The bundled certificates help
   build the path and are never trusted on their own: the anchor is always the
   chain file you configured.

The startup log then shows what was checked:

```
content signing: content-key-v2 (ECDSA-P256-SHA256); trusted: content-key-v2, content-key-v1
  certificate subject  CN=Crystal Content Signing, O=Crystal
  certificate issuer   CN=Crystal Issuing CA, O=Crystal
  certificate valid    2026-09-16T00:00:00.000Z to 2027-09-16T00:00:00.000Z (364 days left)
  certificate from     .p12 /secure/content-signing.p12
  certificate chain    verified against /secure/caChain.crt
```

and `npm run sign:audit` begins with the same description, so a cron audit
also notices a certificate running out. Nothing fetches a CRL or asks OCSP:
revoking a key here is `CONTENT_SIGNING_REVOKED_KEY_IDS` and removing its pin.

A previous key's certificate (in `CONTENT_SIGNING_KEY_DIR`) is checked more
gently: expired, or no longer verifying against the chain (checked without its
dates), is a warning - the content it signed was signed while it was good, and
the way to stop believing a key is to revoke it.

### Building a .p12 from a key, a certificate and the chain

```
openssl pkcs12 -export \
  -inkey content-signing.key.pem -in content-signing.crt.pem -certfile caChain.crt \
  -name content-key-v2 \
  -keypbe AES-256-CBC -certpbe AES-256-CBC -macalg sha256 \
  -out content-signing.p12
chmod 600 content-signing.p12
```

openssl asks for the export password. The three `-keypbe`/`-certpbe`/`-macalg`
options are OpenSSL 3's defaults already; spelling them out stops an OpenSSL
1.1 machine writing the [legacy kind](#re-exporting-a-legacy-p12).

### Inspecting a .p12

```
openssl pkcs12 -in content-signing.p12 -info -nokeys      # how it is encrypted, and every certificate in it
openssl pkcs12 -in content-signing.p12 -clcerts -nokeys | openssl x509 -noout -subject -issuer -dates -ext basicConstraints,keyUsage
openssl pkcs12 -in content-signing.p12 -cacerts -nokeys   # the CA certificates bundled with it
```

`-info` prints `PBES2, PBKDF2, AES-256-CBC` for a modern file and
`pbeWithSHA1And40BitRC2-CBC` for a legacy one. To run the chain check by hand:

```
openssl pkcs12 -in content-signing.p12 -clcerts -nokeys -out leaf.crt
openssl pkcs12 -in content-signing.p12 -cacerts -nokeys -out bundled.crt
openssl verify -CAfile caChain.crt -untrusted bundled.crt leaf.crt
```

### Re-exporting a legacy .p12

OpenSSL 1.x, and older Windows and Java exports, encrypt a .p12's certificates
with RC2-40 (and sometimes RC4). OpenSSL 3 opens those only with its **legacy
provider**, which is not loaded by default. The API tries the file normally,
and on that specific failure (`unsupported`) retries with `-legacy`, logging a
warning that the file should be re-exported. If this openssl has no legacy
provider (Git for Windows' `usr/bin/openssl.exe` has none), startup stops with
a message saying the file needs the legacy provider or a re-export.

Re-export it once, on a machine whose openssl has the legacy provider, without
writing the decrypted key to a file (bash process substitution):

```
read -rs OLD_P12_PASSWORD && export OLD_P12_PASSWORD
read -rs NEW_P12_PASSWORD && export NEW_P12_PASSWORD

openssl pkcs12 -legacy -in old.p12 -nokeys -passin env:OLD_P12_PASSWORD -out certificates.pem
openssl pkcs12 -export \
  -inkey <(openssl pkcs12 -legacy -in old.p12 -nocerts -nodes -passin env:OLD_P12_PASSWORD) \
  -in certificates.pem -name content-key-v2 \
  -keypbe AES-256-CBC -certpbe AES-256-CBC -macalg sha256 \
  -passout env:NEW_P12_PASSWORD -out content-signing.p12

unset OLD_P12_PASSWORD NEW_P12_PASSWORD
rm certificates.pem
openssl pkcs12 -in content-signing.p12 -info -nokeys   # now PBES2 / AES-256-CBC
```

(`-inkey -` does not read standard input, and one standard input cannot carry
both the key and the certificates - hence the substitution.) The re-exported
file holds the same key, so it keeps the same key id and the same pin.

### Pinning it: `--from-p12`

On the machine that builds the storefront (or wherever the .p12 and chain are):

```
cd crystal-backend
read -rs CONTENT_SIGNING_P12_PASSWORD && export CONTENT_SIGNING_P12_PASSWORD
npm run content-keys -- --from-p12 /secure/content-signing.p12 --ca-chain /secure/caChain.crt --key-id content-key-v2
unset CONTENT_SIGNING_P12_PASSWORD
```

It opens the file exactly as the API does, runs every check above against the
chain - which it requires - and only then prints the certificate, the pin

```
REACT_APP_CONTENT_SIGNING_KEYS=[{"keyId":"content-key-v2","algorithm":"ECDSA-P256-SHA256","spki":"MFkw..."}]
```

and the backend `.env` lines (without the password). A certificate that fails
is refused: no pin is printed and nothing is written. The password is read from
`CONTENT_SIGNING_P12_PASSWORD` and never taken as an argument (`--password` is
refused), because arguments show up in process lists and shell history.
`--key-id` is required. With `--write-web-env` the entry is **added** to
`crystal-web/.env.development.local` (or `--web-env <file>`) beside the keys
already there; a different key already pinned under the same id is refused.

In a production build environment, put the entry into
`REACT_APP_CONTENT_SIGNING_KEYS` **beside** the keys already trusted.

### What the password protects, and what it does not

The password protects the **file**: in a backup, in a transfer, in a ticket
attachment, in a commit made by mistake. A copy of the .p12 without the
password is not a signing key.

It does **not** protect the key **on the server**. `CONTENT_SIGNING_P12_PASSWORD`
sits in the same `.env` as `CONTENT_SIGNING_P12`, so anyone who can read that
`.env` - or the API's environment - can open the file. Protect the server the
way you would protect an unencrypted key: the .p12, the `.env` and the process
readable only by the user the API runs as.

How the API handles it: the password goes to openssl as `-passin env:NAME` -
the *name* of a variable on the command line and the value only in the child
process's environment (a command line is visible to every user through `ps`; a
process environment only to its own user and root). It is never written to a
file, never logged, and never part of an error message (the tests check all of
these). The decrypted private key comes back on openssl's standard output into
memory and never touches the disk, not even as a temporary file; only public
certificates are written to temporary files, for `openssl verify`, and removed
straight after. What this cannot promise: the key passes through a pipe and
openssl's memory on its way in, and OpenSSL and V8 hold their own copies of a
loaded key for as long as the API runs.

### Renewing a certificate

**A renewed certificate is a new key id**, even when the CA reissues it for the
same key and with the same name. The procedure is [Rotation](#rotation), with a
.p12:

1. Receive the renewed `.p12`. Check and pin it:
   `npm run content-keys -- --from-p12 renewed.p12 --ca-chain caChain.crt --key-id content-key-v3`.
2. **Add** that entry to the storefront's `REACT_APP_CONTENT_SIGNING_KEYS`
   (keeping `content-key-v2`), rebuild and deploy crystal-web.
3. Keep the old certificate for verification - extract it into the key
   directory under its old id:
   `openssl pkcs12 -in content-signing.p12 -clcerts -nokeys -out /secure/content-keys/content-key-v2.crt.pem`.
4. Switch the API: `CONTENT_SIGNING_KEY_ID=content-key-v3`,
   `CONTENT_SIGNING_P12=/secure/renewed.p12`, its password,
   `CONTENT_SIGNING_KEY_DIR=/secure/content-keys`,
   `CONTENT_SIGNING_VERIFY_KEY_IDS=content-key-v2`. Restart. The old
   certificate may expire later; that is a warning, and what it signed keeps
   verifying.
5. Carry on with [Rotation](#rotation) from step 4 (`sign:backfill -- --rotate`,
   audit, retire the old key from both sides).

Deploying the storefront before the API switches is what keeps everything newly
signed from showing as invalid in between. Start this well before the 30-day
warning.

**Seeing how long is left.** The console's header shows the active
certificate's whole days left on every screen - green, amber once fewer than 30
remain (the day the startup warning begins), solid red once fewer than 7 remain
and after it has expired - and clicking it opens the dashboard's **Signing
certificates** card: the active certificate, every previous key and, while
`X509_LOGIN` is on, the member sign-in's CA certificates, each with its issuer,
expiry and chain status. Both read `GET /api/admin/dashboard/certificates`
(the dashboard's read permission), which answers from what startup already
loaded and checked - openssl is not run again for the signing certificates, so
a file replaced on disk shows only after the restart that would use it.

### Trying it locally: `--dev-p12`

```
npm run content-keys -- --dev-p12                   # ECDSA: content-key-dev-p12
npm run content-keys -- --dev-p12 --algorithm RSA   # RSA-3072: content-key-dev-p12-rsa
```

writes, in `crystal-backend/.content-keys/` (ignored by git and svn): a
throwaway development CA (`caChain.crt`, and its key `dev-ca.key.pem`, reused
by later runs), and `<keyId>.p12`, a certificate issued by that CA with its key,
under a random password. It opens the new file back through the same checks and
prints the exact `.env` lines - the password shown that once and stored nowhere
- plus the storefront entry to add (or `--write-web-env` adds it). An existing
key id is never overwritten. Development only: a CA whose key lies beside the
certificates it issued proves nothing.

## Switching algorithms

Switching is a **rotation to a new key id of the other type**. Business logic
does not change; existing signatures keep the algorithm and key id they were
made with, and keep verifying for as long as their key is trusted.

1. Generate the new key: `npm run content-keys -- --algorithm RSA --key-id content-key-rsa-v1 --dir /secure/content-keys --no-web-env`.
2. Carry on with [Rotation](#rotation) from step 2.

## Rotation

A key is never replaced under the same key id. From `content-key-v1` to
`content-key-v2`:

1. **Generate** `content-key-v2` in the key directory.
2. **Trust it in the storefront first.** Add its entry to
   `REACT_APP_CONTENT_SIGNING_KEYS` (keeping v1), rebuild and deploy
   crystal-web. It now believes both.
3. **Switch the backend**: `CONTENT_SIGNING_KEY_ID=content-key-v2`,
   `CONTENT_SIGNING_VERIFY_KEY_IDS=content-key-v1` (v1's certificate stays in
   the directory; its private key can be removed from the server). Restart.
   New content is signed by v2; v1 content still verifies.
4. **Re-sign**: `npm run sign:backfill -- --rotate`. This re-signs items
   currently signed by v1 **only if their v1 signature still verifies against
   the current content** - rotation never launders a change made while v1 was
   in charge. Anything it will not re-sign is listed.
5. **Confirm**: `npm run sign:audit` reports nothing `valid-old-key`.
6. **Retire v1**: remove it from `CONTENT_SIGNING_VERIFY_KEY_IDS` and from the
   storefront's list, rebuild and deploy.

Do not skip step 2: a backend that signs with a key the deployed storefront
does not yet trust makes every new item show as invalid.

## Revocation, and after a compromise

`CONTENT_SIGNING_REVOKED_KEY_IDS=content-key-v1` makes the server refuse v1
everywhere - even if it is also listed for verification. Remove it from the
storefront's list too and redeploy: the storefront has no revocation list of
its own, only the pin. Content signed only by a revoked key shows as invalid
until it is re-signed.

**After a compromise, do not use `--rotate`.** A signature by a stolen key
proves nothing, so "it still verifies" is not a reason to carry it forward.
Instead:

1. Generate a new key, trust it in the storefront, switch the backend, and
   revoke the compromised id (steps 1-3 of [Rotation](#rotation), with the old
   id in `REVOKED` rather than `VERIFY`).
2. Review the content: `npm run sign:audit` lists everything signed by the
   revoked key.
3. Re-sign what you have reviewed:
   `npm run sign:backfill -- --force-resign` (everything - it trusts the
   database and the upload directory **as they stand**, and says so loudly), or
   one item at a time with `--type notification --ref 12`.

An edit through the console also re-signs an item signed by a revoked key
(logged), because saving it is exactly that review.

## Which writes sign, and how atomically

| Write path | Signed | Atomic? |
| --- | --- | --- |
| Console create / update / delete / restore of a notice or FAQ (the generic CRUD routes, `signed:` option) | yes | **Yes** - the row and its signature in one transaction |
| Permanent delete of a notice or FAQ | signature removed | Yes |
| Spreadsheet import of FAQs (`/faqs/import`) | every row it writes | Yes - inside the import's all-or-nothing transaction |
| Image upload (`POST /admin/media/upload/:folder`, `/upload-document/:folder`) | yes, as the file is stored | File and signature together; the media row that may follow is separate |
| `npm run seed` (`99_signatures`), `npm run mock:images` | what they write | per item |
| `npm run sign:backfill` | unsigned items | per item |

**The console refuses to re-sign a tampered row.** Before an update, restore or
spreadsheet row, the row's current state is checked against its signature; a
row that no longer matches is refused with 409 ("this item no longer matches its
signature...") instead of coming out of the save with a valid signature. Delete
is always allowed. A reviewed row is re-signed with
`npm run sign:backfill -- --force-resign --type <type> --ref <id>`.

**Not signed by any write path:** rows or files changed by hand; a future delta
that rewrites notice or FAQ content (it must re-sign what it changes, or the
content shows invalid - which is the correct failure).

## The audit and the backfill

```
npm run sign:audit                    # everything; exit 1 on any invalid or missing
npm run sign:audit -- --type image    # one type
npm run sign:audit -- --verbose       # list the valid items too
npm run sign:audit -- --dry-run       # check, record nothing
```

Recomputes every image's hash from disk and every text item's canonical
payload from the database, verifies each stored signature, and reports
**invalid** (changed since signing), **missing** (a signed or referenced file
is gone), **revoked-key**, **untrusted-key**, **unsigned**, **orphaned** and
**valid-old-key** (signed by a trusted non-active key). Run it after
deployments; the API also runs it **every night at 04:10** (its housekeeping,
`src/services/sweeps.service.js`, logged as `[sweep] signature audit`). It
never signs and never changes content; the one thing it writes is each
verdict, onto the signature row it is about - see
[Signatures in the database](#signatures-in-the-database).

```
npm run sign:backfill                                   # sign what has no signature
npm run sign:backfill -- --dry-run
npm run sign:backfill -- --rotate                       # see Rotation
npm run sign:backfill -- --force-resign [--type t --ref r]
```

The backfill **never** re-signs an item whose signature fails - that is what the
audit exists to surface. On a live site, read the audit's `unsigned` list
before running it: an unsigned file nobody uploaded through the console is a
file the backfill would sign.

## Signatures in the database

For whoever looks at the database with a SQL client rather than the console:
five views put each signed thing beside its signature (`sql/deltas/030`).

| View | One row per | Identified by |
| --- | --- | --- |
| `v_notice_signatures` | `site_notices` row | `id`, `title`, `status`, `is_deleted`, `updated_at` |
| `v_faq_signatures` | `faqs` row | `id`, `question`, `category`, `status`, `is_deleted`, `updated_at` |
| `v_advert_signatures` | `site_adverts` row, joined by `file_path` to its image's signature | `id`, `placement`, `device_type`, `file_path`, `alt_text`, `status`, `is_deleted`, `updated_at` |
| `v_product_image_signatures` | `product_images` row, likewise | `id`, `product_id`, `product_name`, `kind`, `device_type`, `file_path`, `is_deleted`, `updated_at` |
| `v_image_signatures` | `media_assets` row (the media library), likewise | `id`, `owner_type`, `owner_id`, `purpose`, `device_type`, `file_path`, `alt_text`, `created_at` |

and then, in every view: `key_id`, `algorithm`, `signed_at`, `payload_sha256`,
`signature_short` (the first 24 characters and `...`), `audit_status`,
`audit_reason`, `audited_at` and **`signature_state`**.

**A view cannot verify a signature** - that takes the canonical payload, the
file's bytes and ECDSA or RSA-PSS. So the audit (the nightly one, or
`npm run sign:audit`) writes its verdict onto each `content_signatures` row, and
`signature_state` reads, first match wins:

| `signature_state` | When |
| --- | --- |
| `unsigned` | there is no signature row |
| the audit's verdict: `valid`, `valid (old key)`, `INVALID`, `MISSING`, `revoked key`, `unknown key` | the audit ran after the item was signed - and, for notices and FAQs, after the row was last updated |
| `changed after signing` | notices and FAQs only: `updated_at` is later than `signed_at`, and no audit since. `updated_at` is inside the signed payload, so this alone proves the row no longer matches |
| `signed - not yet audited` | anything else - including an item re-signed since the last audit |

What the views cannot show:

- **A file changed on disk.** It leaves no trace in the database, so an image
  view says what the last audit found until the next audit runs. For the same
  reason an image view never says `changed after signing`: an advert's or a
  product image's `updated_at` moves when it is reordered or its alt text is
  reworded, and the signature covers the file, not the row.
- **An edit that keeps `updated_at`** (the trigger held off, as below). The row
  still reads `valid` until the next audit - which is why the audit records
  what it finds rather than the views guessing.
- Images referenced only from other columns (`products.main_image`, banners,
  About and article images) are audited but have no view.

`signed_at` and `audited_at` come from the API's clock and `updated_at` from the
database's; the comparisons assume the two agree (NTP).

### Tamper demonstration

From `crystal-backend/`, against the development database, with `psql`
connected to it and a clean audit. (Run as written, the SQL through the same
connection the API uses; the output is abridged.)

**1. Change a notice's text behind the application's back.**

```
psql -c "CREATE TABLE crystal_v1.notice_backup AS SELECT * FROM crystal_v1.site_notices WHERE id = 1"
psql -c "UPDATE crystal_v1.site_notices SET content = content || '<p>Edited in the database.</p>' WHERE id = 1"
```

**2. The view flags it straight away** - the trigger moved `updated_at`, which
is signed:

```
psql -c "SELECT id, title, updated_at, signed_at, audit_status, signature_state
           FROM crystal_v1.v_notice_signatures WHERE id = 1"
#  id |             title             |  updated_at  |  signed_at   | audit_status |    signature_state
#   1 | Crystal OS 5.2 is rolling out | 09:54:09.801 | 04:40:12.786 | valid        | changed after signing
```

(`audit_status` still says `valid`: that verdict is older than the edit.)

**3. Run the audit.** It exits 1 and records its verdict:

```
npm run sign:audit
# notification: 16 item(s) - 1 invalid, 15 valid
#   INVALID - changed since it was signed (tampering, or a write that skipped signing):
#     1  [content-key-dev-p12]  signature-invalid
# ...
# recorded 1525 verdict(s) in content_signatures - see v_notice_signatures, ...
# AUDIT FAILED: 1 invalid, 0 missing
```

**4. The view now says what the audit found.**

```
psql -c "SELECT id, title, signature_state, audit_reason, audited_at
           FROM crystal_v1.v_notice_signatures WHERE id = 1"
#  id |             title             | signature_state |   audit_reason    |  audited_at
#   1 | Crystal OS 5.2 is rolling out | INVALID         | signature-invalid | 09:54:12.290
```

A quick overview of any view: `SELECT signature_state, count(*) FROM
crystal_v1.v_notice_signatures GROUP BY 1;` - here `INVALID 1`, `valid 15`.

**5. Restore, and audit again.**

```
psql <<'EOF'
BEGIN;
ALTER TABLE crystal_v1.site_notices DISABLE TRIGGER trg_site_notices_updated;
UPDATE crystal_v1.site_notices n SET content = b.content, updated_at = b.updated_at
  FROM crystal_v1.notice_backup b WHERE n.id = b.id;
ALTER TABLE crystal_v1.site_notices ENABLE TRIGGER trg_site_notices_updated;
DROP TABLE crystal_v1.notice_backup;
COMMIT;
EOF

npm run sign:audit
# audit clean: nothing invalid, nothing missing

psql -c "SELECT id, signature_state FROM crystal_v1.v_notice_signatures WHERE id = 1"
#  id | signature_state
#   1 | valid
```

Doing step 1 the careful way - inside step 5's `DISABLE TRIGGER` bracket, so
`updated_at` does not move - skips step 2: the view keeps saying `valid` until
the audit in step 3 runs. `npm run test:signing` checks both.

## Tests and checks

```
npm run test:signing                       # no server needed; throwaway keys only (the views section needs the migrated development database)
node scripts/check.js http://localhost:5400   # the live API, "signed content" section
npm run content-keys -- --vectors          # regenerate the shared vectors
```

`test:signing` covers both algorithms; RSA-PSS salt and MGF1 checked
independently with `openssl dgst`; P1363 length and its DER equivalent verified
by openssl; configuration that must not start; certificate checks (wrong pair,
wrong type, small RSA, wrong CN, expired, not yet valid, missing key, missing
openssl); .p12 files for both algorithms built with openssl inside the test (loading,
signing, a wrong password whose message, stack and logs never contain it, the
password only in openssl's environment and no key written to disk, a leaf from
another CA, an expired leaf, a CA certificate as the signer, a keyUsage without
signatures, an algorithm that does not match, the 30-day warning, renewal with
previous keys, one key per key id, a legacy file - loaded through the retry, or
refused with the legacy-provider message on an openssl without that provider,
and the test says which it checked); `content-keys --from-p12` refusing to pin
what fails the chain and adding what passes, and `--dev-p12`;
unknown and revoked key ids; rotation; every envelope refusal; every
notification tamper case; images (one byte, replacement, recomputed hash,
size, MIME, storage key, missing file, missing signature, a declared type the
bytes contradict); the console's certificate report (roles, thresholds falling
on the startup warning's day, member CA chains, nothing path-shaped); every
shared vector; and the signature views, on rows the tests create and delete in
the development database (a notice going unsigned, signed, valid, changed after
signing and INVALID once audited; an edit that keeps `updated_at` reading valid
until the audit; an advert whose row edit does not flag its image and whose
changed byte does once audited; one row per content row in every view; the
audit's verdict words), recording verdicts only on their own rows.

`check.js` verifies the live replies against the key **the storefront** trusts,
downloads and hashes every image it checks, and exercises the write paths: a
console save and edit, a database edit served as invalid and refused by the
console, a spreadsheet import, uploads (signed; lying about the type refused;
renamed for their real type), and a file changed on disk. Its "signing
certificates" section checks the certificate report: signed-in only, its shape,
`daysLeft` against `notAfter` on the reply's own clock, and no private key,
password or path anywhere in it.

After changing `schemas.js` or `canonicalPayload.js`, regenerate the vectors and
copy `test/fixtures/signing-vectors.json` to
`crystal-web/src/security/__fixtures__/signing-vectors.json`; both test suites
must pass on the same file.

## Walkthrough: catching a tampered image and a tampered notice

Against a development database with keys and a clean audit, from
`crystal-backend/`, with `psql` connected to the development database. (Every
step below was run as written, the SQL through the same connection the API
uses.)

**1. Start clean.**

```
npm run sign:audit
# ...
# audit clean: nothing invalid, nothing missing
```

**2. Change one byte of a homepage advert, and a notice's text, behind the
application's back.**

```
# keep copies to restore from
cp uploads/adverts/home-crystal.svg /tmp/home-crystal.svg
psql -c "CREATE TABLE crystal_v1.notice_backup AS SELECT * FROM crystal_v1.site_notices WHERE id = 1"

# one byte: 'home crystal' -> 'Home crystal' in the SVG's label
sed -i '0,/home crystal/s//Home crystal/' uploads/adverts/home-crystal.svg

# an edit that never went through the console
psql -c "UPDATE crystal_v1.site_notices SET content = content || '<p>Edited in the database.</p>' WHERE id = 1"
```

**3. The audit catches both, and exits 1.**

```
npm run sign:audit
# notification: 16 item(s) - 1 invalid, 15 valid
#   INVALID - changed since it was signed (tampering, or a write that skipped signing):
#     1  [content-key-dev]  signature-invalid
# ...
# image: 1393 item(s) - 1 invalid, 1392 valid
#   INVALID - ...
#     /uploads/adverts/home-crystal.svg  [content-key-dev]  signature-invalid
#
# AUDIT FAILED: 2 invalid, 0 missing
```

**4. The storefront refuses both.** `GET /api/site/adverts/home` now carries the
file's *new* hash beside the *old* signature, so the signature fails (and were
the envelope stale, the bytes the browser downloads would not hash to it); `GET
/api/notices` carries the edited text beside the old signature. The storefront
shows its neutral invalid state in place of the advert, leaves the notice out of
the arrival dialog and the notification page, and logs the failed check to the
browser console only.

**5. The console will not launder it.** Saving notice 1 in the console - even
just its order - answers 409 "this item no longer matches its signature". The
spreadsheet import refuses the row the same way. Deleting it is allowed.

**6. Restore.**

```
cp /tmp/home-crystal.svg uploads/adverts/home-crystal.svg

# updated_at is signed and the trigger moves it on every UPDATE, so hold the trigger off
psql <<'EOF'
BEGIN;
ALTER TABLE crystal_v1.site_notices DISABLE TRIGGER trg_site_notices_updated;
UPDATE crystal_v1.site_notices n SET content = b.content, updated_at = b.updated_at
  FROM crystal_v1.notice_backup b WHERE n.id = b.id;
ALTER TABLE crystal_v1.site_notices ENABLE TRIGGER trg_site_notices_updated;
DROP TABLE crystal_v1.notice_backup;
COMMIT;
EOF

npm run sign:audit
# audit clean: nothing invalid, nothing missing
```

(If the original cannot be restored, and the new content is what you want,
re-sign it deliberately: `npm run sign:backfill -- --force-resign --type notification --ref 1`,
or edit it back through the console after the byte-for-byte restore.)

## Signatures versus ordinary application security

| Protection | Comes from |
| --- | --- |
| A changed row or file is detected and not rendered | **signatures** (storefront verification, the audit) |
| A signature cannot be moved to another item, type, key or algorithm | **signatures** (storage key, type, `kid`, `alg` inside the signed bytes) |
| A request cannot choose a weaker check | **signatures** (the trusted key picks the algorithm) |
| An edit through the console cannot re-sign a tampered row | **signatures** plus the write path's check |
| Only administrators with the page's write grant can change notices, FAQs, adverts or upload | **application security** (JWT sign-in, the permission grid) |
| Nothing a member submits is accepted as a signature | **application security** (no route takes one) |
| An upload is the type it claims; its name and folder are server-chosen; paths cannot leave the upload directory | **application security** (byte sniffing, generated names, the folder whitelist, storage-key checks) |
| Notice HTML cannot run script in the storefront | **application security** (the storefront's sanitiser) - a signed `<script>` is still a script |
| Private keys never reach a client | **application security** (keys are files on the server; no route reads them) |
| Transport confidentiality and the browser's `crypto.subtle` | **HTTPS** |

### Plain HTTP deployments

The backend may sign over HTTP; signing itself does not depend on the
transport. A native app can also verify over HTTP when its trusted public key
and verifier are embedded in the signed application binary. The app binary is
the trust anchor, rather than JavaScript downloaded with the response.

An ordinary website loaded over HTTP has no equivalent trust anchor. A pure
JavaScript RSA/ECDSA implementation could perform the arithmetic without
WebCrypto, but an active network attacker could replace that implementation,
the pinned public key, and the content together. Changing algorithms, using a
hash, asking the server to report its own verification result, or using HMAC
does not fix that bootstrap problem.

When HTTP is operationally required and the threat is a database or upload
changed outside the admin application, move the enforcement boundary to the
backend:

```env
REACT_APP_CONTENT_VERIFICATION=server
```

Rebuild `crystal-web` after changing it. Public API reads verify current signed
content and replace an invalid envelope with `null`; the storefront therefore
does not render it. Images use `/api/site/verified-image`, which reads, hashes
and verifies the exact bytes it then sends. This detects direct database and
filesystem edits without WebCrypto. It does **not** protect traffic after it
leaves the server: an active HTTP network attacker can still replace the page,
JavaScript, API response or image.

The server path is designed not to repeat expensive work unnecessarily:

- Text verdicts are cached by the exact canonical content and complete
  signature envelope. Any changed field is a different key and is verified
  again.
- Verified image buffers are held in a bounded LRU. Every request still does a
  cheap file-stat and indexed signature-row lookup; matching requests reuse
  the exact bytes already verified instead of reading, hashing and performing
  public-key verification again. Concurrent cold requests share one check.
- The verified-image URL includes the signed SHA-256. After the first verified
  response the browser can cache those immutable bytes without another API
  call. Replacing an image changes its hash and therefore produces a new URL;
  removing it removes the URL from subsequent storefront data. An ETag is also
  returned for intermediaries that support conditional requests.

Tune the bounded caches in the backend environment (or set either to `0`):

```env
CONTENT_VERIFICATION_CACHE_ENTRIES=5000
VERIFIED_IMAGE_CACHE_MB=64
```

`REACT_APP_CONTENT_VERIFICATION=off` remains available as a controlled
troubleshooting flag. It renders schema-valid content and direct upload URLs
without integrity enforcement. Omit the variable, or set it to `required`, to
retain browser-side fail-closed verification on HTTPS or localhost.

## Limitations

- **Frontend verification is not a complete security boundary.** It protects visitors
  using the normal storefront from content changed after signing. Anyone can
  fetch `/api` or `/uploads` directly, and an attacker who controls what the
  browser runs (the storefront bundle, the page) can skip the checks entirely.
  The backend's own checks - the console's refusal to re-sign, and the audit -
  are the part that does not depend on a browser.
- **`/uploads` is still a public static route.** It is not an integrity
  boundary and serves whatever is on disk. Strict browser mode verifies those
  bytes; server mode uses `/api/site/verified-image` instead. Other callers
  can still request `/uploads` directly.
- **HTTPS is required for strict browser verification.** `window.crypto.subtle`
  exists only in a secure context (HTTPS, or `localhost`). Strict mode fails
  closed on ordinary HTTP. Server mode addresses only changes behind the API;
  it cannot make an HTTP connection resistant to a network attacker. `off` is
  an explicit unverified compatibility mode.
- **The storefront verifies the signed surfaces in strict mode:** hero and
  advert images, product detail and listing images, category and series
  banners, OS artwork, notices and FAQs. Blog and About images are not part of
  this upload-signing pipeline. The chrome widget and crystal-admin do not
  verify.
- **Not signed:** feedback, staff replies included (it lives in the vendor's
  database - see [What is signed](#what-is-signed)); blog articles; product,
  category and specification data; prices; the footer; any page copy in the
  frontends; which row points at which image (an image signature covers the
  file at its path, not the advert or product that uses it).
- **Precision.** Timestamps are signed to the millisecond; PostgreSQL keeps
  microseconds, and a change to those alone is not detected.
- **An edit made in the database and then approved by nobody stays invalid** -
  deliberately. The fix is a restore or a reviewed `--force-resign`, never a
  routine backfill.
- **Key storage is files.** There is no HSM or KMS integration: whoever can read
  the key directory as the API's user can sign. Protect it accordingly. A .p12
  does not change that on the server - its password is in the same `.env` (see
  [What the password protects](#what-the-password-protects-and-what-it-does-not)).
- **The CA chain is checked by the backend, not by browsers,** and without CRL
  or OCSP. A certificate the CA revokes keeps verifying in the storefront until
  its key id is revoked here and its pin removed.
- **Replay of stale content.** An old, validly signed version of an item can be
  replayed by someone who controls the response, if its key is still trusted;
  signatures prove authenticity, not freshness. Rotation and revocation bound
  the window.
