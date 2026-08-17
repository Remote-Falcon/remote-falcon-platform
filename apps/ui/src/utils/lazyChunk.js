import { lazy } from 'react';

// React.lazy for route chunks, hardened against the stale-chunk reload path.
//
// index.jsx listens for Vite's `vite:preloadError` and calls
// preventDefault() + location.reload() so a visitor holding a stale
// index.html gets one clean reload instead of the root error boundary.
// The catch is in Vite's own preload helper:
//
//   baseModule().catch(handlePreloadError)
//
// ...where handlePreloadError only rethrows `if (!e.defaultPrevented)`.
// Because we DO prevent the default, the rejection is swallowed and the
// dynamic import resolves with `undefined` rather than rejecting.
// location.reload() does not halt script execution, so React carries on and
// dereferences `.default` on that `undefined` before the navigation lands —
// throwing the exact "Something went wrong" boundary the reload exists to
// avoid. (PostHog issues 019f5b28-6ff9 and 019f91cc-c5fe.)
//
// Returning a never-settling promise parks the tree on its Suspense fallback
// instead, so the reload is the only thing the visitor ever sees.
const lazyChunk = (loader) => lazy(() => loader().then((module) => (module === undefined ? new Promise(() => {}) : module)));

export default lazyChunk;
