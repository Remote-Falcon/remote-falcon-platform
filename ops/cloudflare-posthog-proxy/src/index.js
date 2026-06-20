// Same-origin PostHog ingest proxy for remotefalcon.com — issue #130.
//
// Mounted on the route `remotefalcon.com/<PREFIX>/*` (see wrangler.toml). Only
// that path hits this Worker; everything else on remotefalcon.com still goes to
// the k8s origin. Because it's served from the SAME origin as the app, the
// browser does no CORS preflight — so there are no CORS headers to manage.
//
// Routing (the /<PREFIX> route prefix is stripped before forwarding):
//   /<PREFIX>/static/*  ->  us-assets.i.posthog.com   (SDK assets; edge-cached)
//   /<PREFIX>/array/*   ->  us-assets.i.posthog.com
//   everything else     ->  us-proxy-direct.i.posthog.com  (events, /flags,
//                           /decide, /s replay)
//
// us-proxy-direct + the forwarded X-Forwarded-For (from Cloudflare's
// CF-Connecting-IP) makes PostHog record the viewer's REAL IP for geo/web
// analytics — plain us.i.posthog.com would log Cloudflare's edge IP.

// If you change this, change the route `pattern` in wrangler.toml to match.
const PREFIX = '/rf-relay';

const API_HOST = 'us-proxy-direct.i.posthog.com';
const ASSET_HOST = 'us-assets.i.posthog.com';

async function handleRequest(request, ctx) {
  const url = new URL(request.url);

  // Strip the route prefix so PostHog sees /static/... , /i/... , /flags , etc.
  let path = url.pathname.startsWith(PREFIX) ? url.pathname.slice(PREFIX.length) : url.pathname;
  if (path === '') path = '/';
  const pathWithParams = path + url.search;

  if (path.startsWith('/static/') || path.startsWith('/array/')) {
    return retrieveAsset(request, pathWithParams, ctx);
  }
  return forwardRequest(request, pathWithParams);
}

async function retrieveAsset(request, pathname, ctx) {
  let response = await caches.default.match(request);
  if (!response) {
    response = await fetch(`https://${ASSET_HOST}${pathname}`);
    ctx.waitUntil(caches.default.put(request, response.clone()));
  }
  return response;
}

async function forwardRequest(request, pathWithSearch) {
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const headers = new Headers(request.headers);
  // Same-origin requests carry remotefalcon.com cookies (incl. any session
  // cookies) — never forward those to a third party. PostHog identifies via
  // localStorage, not cookies, so dropping them is safe.
  headers.delete('cookie');
  headers.set('X-Forwarded-For', ip);

  const originRequest = new Request(`https://${API_HOST}${pathWithSearch}`, {
    method: request.method,
    headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.arrayBuffer() : null,
    redirect: request.redirect,
  });

  return fetch(originRequest);
}

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, ctx);
  },
};
