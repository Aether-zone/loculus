# @loculus/web

The loculus console: upload a file, fetch it back, delete it.

loculus is a service other services talk to — akouo presigns a recording upload
through it and never renders anything of its own. This app is the one place a
person can drive it by hand, which makes it useful for exactly the things an api
client is bad at: checking that the bucket is reachable, putting a file
somewhere to test a downstream consumer, and getting a fresh download URL for a
key out of a log line.

## Running it

```sh
cp .env.example .env      # then fill in OAUTH_CLIENT_SECRET
pnpm install              # from the repository root
./dev.sh                  # api on 3111, console on 3112
```

The console needs three other things up: the **loculus api** (`dev.sh` starts
it), **pistis** for sign-in, and the **object store** from the workspace's
`docker-compose.yml`. Without pistis there is no way in at all; without the
store, everything renders and every upload fails — which the status strip at the
top of the page says out loud.

### Registering the client

Sign-in goes through pistis, so `loculus` has to exist there as an OAuth client
with `http://localhost:3112/api/auth/callback` as a registered redirect URI. Put
the secret pistis hands back into `.env` — it is stored there only as a bcrypt
hash, so a lost one is rotated rather than recovered.

Keep it a client of its own rather than reusing akouo's: **an object belongs to
the OAuth client that presigned it**, so the client id decides which objects
this console can see or delete. Sharing one would let the console delete akouo's
recordings.

## How an upload works

1. `POST /api/objects/presign` — this app's route handler, which attaches the
   access token from an httpOnly cookie and relays it to the api. loculus mints
   a key, writes a `PENDING` row and signs a URL with the content type and
   length baked in.
2. The browser `PUT`s the bytes **straight to the object store**. They cross
   neither this app nor the api, which is the entire point: a 4 GB upload costs
   loculus one JSON request.
3. The console asks for a download URL, which makes loculus HEAD the object and
   move the row to `UPLOADED`. Nothing else tells it the upload happened — the
   sweeper would find out five minutes later.

Step 2 is the one that needs configuration outside these two applications: the
bucket must allow `PUT` from this origin, with `Content-Type` and
`Content-Length` among its allowed headers. A browser reports a missing CORS
policy as a bare network error, so that failure is called out by name in the
upload's error text.

## What it cannot do

There is no list of objects, because loculus has no endpoint for one. Its api
answers about a key — presign an upload, presign a download, delete — and never
about a bucket, since the bucket is shared by every aether-zone service and an
object's meaning belongs to whichever service put it there.

So the table is a note this browser keeps in `localStorage` about what it
uploaded. It is not the truth: an object uploaded from another machine will not
appear, though its key still works in the lookup. If a real listing is ever
wanted, it belongs in the api — a `GET /objects` scoped to the token's
`client_id` — and this table should then read from it.

## Layout

```
app/(console)      the signed-in console: one page, its shell, and its parts
app/signed-out     where signing out and a failed authorization land
app/api/auth       the OAuth round trip with pistis
app/api/objects    thin relays to the loculus api that attach the access token
lib/oauth.ts       pistis as an authorization server
lib/session.ts     tokens in httpOnly cookies, refreshed when they are close
lib/objects.ts     the three-step upload, and it runs in the browser
lib/ledger.ts      the browser-local note of what was uploaded
```

Everything visual comes from `@aether-zone/kosmos`. Unlike akouo there is no
theme package in between — loculus has no palette of its own, and takes the
design system's.
