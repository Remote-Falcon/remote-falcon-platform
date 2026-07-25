// PostHog ingest proxy for remotefalcon.com — issue #130.
//
// Mounted on the route `remotefalcon.com/<PREFIX>/*` (see wrangler.toml). Only
// that path hits this Worker; everything else on remotefalcon.com still goes to
// the k8s origin.
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
//
// CORS: the relay is same-origin for the control panel and landing page (both on
// the apex), but every viewer page is served from a SHOW SUBDOMAIN
// (`<show>.remotefalcon.com`), which is a different origin. Those calls are
// cross-origin and DO need CORS headers — see `withCors` / `retrieveAsset`.

// If you change this, change the route `pattern` in wrangler.toml to match.
const PREFIX = '/rf-relay';

const API_HOST = 'us-proxy-direct.i.posthog.com';
const ASSET_HOST = 'us-assets.i.posthog.com';

// The apex plus any single-label show subdomain. Anything else gets no CORS
// headers, so the browser blocks it — the relay is not an open proxy.
const ALLOWED_ORIGIN = /^https:\/\/([a-z0-9-]+\.)?remotefalcon\.com$/i;

// Response headers that must never be replayed from the edge cache to a
// different origin than the one they were minted for.
const UPSTREAM_CORS_HEADERS = [
  'access-control-allow-origin',
  'access-control-allow-credentials',
  'access-control-allow-methods',
  'access-control-allow-headers',
  'access-control-expose-headers',
  'access-control-max-age',
];

function allowedOrigin(request) {
  const origin = request.headers.get('Origin');
  return origin && ALLOWED_ORIGIN.test(origin) ? origin : null;
}

// Re-add CORS per request, reflecting the caller's origin. Always sets
// `Vary: Origin` so any downstream cache keys on it.
function withCors(response, request) {
  const headers = new Headers(response.headers);
  const origin = allowedOrigin(request);
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true');
  }
  headers.append('Vary', 'Origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// posthog-js only sends simple GETs/POSTs to the asset paths, but answer
// preflights anyway so a future SDK version adding a custom header doesn't
// silently break viewer pages.
function handlePreflight(request) {
  const origin = allowedOrigin(request);
  if (!origin) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') || 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    },
  });
}

async function handleRequest(request, ctx) {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return handlePreflight(request);
  }

  // Strip the route prefix so PostHog sees /static/... , /i/... , /flags , etc.
  let path = url.pathname.startsWith(PREFIX) ? url.pathname.slice(PREFIX.length) : url.pathname;
  if (path === '') path = '/';
  const pathWithParams = path + url.search;

  if (path.startsWith('/static/') || path.startsWith('/array/')) {
    return retrieveAsset(request, pathWithParams, ctx);
  }
  return forwardRequest(request, pathWithParams);
}

// Edge-cached SDK assets and remote config.
//
// The cache key is the UPSTREAM url alone, deliberately excluding the incoming
// request's Origin. Keying on the raw request instead is what broke viewer
// pages: the first caller is normally the apex (same-origin, so PostHog returns
// no Access-Control-Allow-Origin), that bare response gets stored, and every
// subsequent `<show>.remotefalcon.com` read of it is blocked by the browser
// (net::ERR_FAILED) because the cached copy carries no ACAO for their origin.
// So: strip upstream CORS before storing, then mint fresh headers per request.
async function retrieveAsset(request, pathname, ctx) {
  const cacheKey = new Request(`https://${ASSET_HOST}${pathname}`, { method: 'GET' });

  let response = await caches.default.match(cacheKey);
  if (!response) {
    response = stripUpstreamCors(await fetch(`https://${ASSET_HOST}${pathname}`));
    if (response.ok) {
      ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
    }
  }
  return withCors(response, request);
}

function stripUpstreamCors(response) {
  const headers = new Headers(response.headers);
  UPSTREAM_CORS_HEADERS.forEach((header) => headers.delete(header));
  // Upstream sends a malformed, duplicated `Vary` (`Origin, Referer,origin, …`).
  // Drop it — withCors sets the one value that actually matters here.
  headers.delete('vary');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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
