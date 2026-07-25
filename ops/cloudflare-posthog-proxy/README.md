# remote-falcon-posthog-proxy

Cloudflare Worker that proxies PostHog **same-origin** from `remotefalcon.com`,
so ad-blockers / DNS filters can't pattern-match the `*.posthog.com` host and
silently drop ~25-30% of events. Implements **Option A** of issue #130 — see
`docs/OBSERVABILITY-PLAN.md` in the platform repo for the decision + rationale.

## How it works

Route `remotefalcon.com/rf-relay/*` → this Worker (everything else on the
domain still goes to the k8s origin). The Worker strips the `/rf-relay` prefix
and forwards:

| Incoming | Upstream |
|---|---|
| `/rf-relay/static/*`, `/rf-relay/array/*` | `us-assets.i.posthog.com` (edge-cached) |
| everything else (`/i/…`, `/flags`, `/decide`, `/s` replay) | `us-proxy-direct.i.posthog.com` |

`us-proxy-direct` + the forwarded `X-Forwarded-For` preserves the viewer's real
IP for PostHog geo. Cookies are stripped before forwarding (don't leak app
cookies to a third party).

### CORS

The relay is only same-origin for the **apex** (control panel, landing, map).
Every **viewer page** is served from `<show>.remotefalcon.com`, which is a
separate origin, so those calls are cross-origin.

- `/flags`, `/i/…`, `/s` go through `forwardRequest`, and PostHog echoes the
  request `Origin` back — nothing for the Worker to do.
- `/static/*` and `/array/*` are **edge-cached**, so the Worker has to own CORS.
  It caches on the upstream URL only, strips upstream `Access-Control-*` before
  storing, and mints `Access-Control-Allow-Origin` per request from the caller's
  `Origin` (apex or any `*.remotefalcon.com` subdomain; anything else gets no
  header and is blocked by the browser).

  Getting this wrong is silent: before this was fixed, an apex-cached
  `/array/<token>/config` response carried no ACAO, so every viewer page's
  remote-config fetch failed `net::ERR_FAILED` and posthog-js fell back to
  bundled defaults. **After deploying a change to the asset path, purge the
  Cloudflare cache** or the old header-less entries keep being served.

## Choosing the path

`/rf-relay` is a placeholder — anything app-specific and not obviously analytics
works. **Avoid** `/ingest` (PostHog's default, increasingly blocked),
`/analytics`, `/tracking`, `/telemetry`, `/posthog`. To change it, edit `PREFIX`
in `src/index.js` **and** the route `pattern` in `wrangler.toml` (keep them in
sync).

## Deploy

```bash
npm install
npx wrangler login      # one-time browser OAuth into the Cloudflare account that owns remotefalcon.com
npx wrangler deploy
```

(Or set `CLOUDFLARE_API_TOKEN` with Workers Scripts:Edit + the remotefalcon.com
zone, and skip `login`.)

## Verify (BEFORE the UI cutover)

```bash
# 1. static asset proxies (200, JS)
curl -sI https://remotefalcon.com/rf-relay/static/array.js | head

# 2. a test event is accepted (expect 200)
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  'https://remotefalcon.com/rf-relay/i/v0/e/' \
  -H 'Content-Type: application/json' \
  --data '{"api_key":"<VITE_PUBLIC_POSTHOG_KEY>","event":"proxy_smoke_test","distinct_id":"proxy-test"}'

# 3. cached asset paths answer a SHOW SUBDOMAIN origin (expect the Origin
#    echoed back in access-control-allow-origin — a missing header is the
#    viewer-page regression described above)
curl -sI -H 'Origin: https://rfdemoshow.remotefalcon.com' \
  'https://remotefalcon.com/rf-relay/array/<VITE_PUBLIC_POSTHOG_KEY>/config' \
  | grep -i 'access-control-allow-origin'
```

Confirm the `proxy_smoke_test` event lands in PostHog → Activity. Only **after**
this is green does the UI `api_host` cutover ship (otherwise events POST to a
404 and we lose 100% instead of 25-30%).

## Then: UI cutover (separate platform PR)

In `apps/ui/src/index.jsx`:

```js
api_host: 'https://remotefalcon.com/rf-relay',  // was https://us.i.posthog.com
ui_host:  'https://us.posthog.com',             // unchanged
```

`api_host` is baked into the bundle at build time, so this needs a UI rebuild +
deploy.

## Monitor

`npx wrangler tail` streams live requests. Every event / replay chunk / flag
poll counts toward the Workers request quota (free tier 100k req/day); session
replay (1–5 MB each) is the big driver.
