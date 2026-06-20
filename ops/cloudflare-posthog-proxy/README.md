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
IP for PostHog geo. Same-origin ⇒ no CORS. Cookies are stripped before
forwarding (don't leak app cookies to a third party).

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
