import { Environments } from './enum';

// Resolves the public viewer-page URL for any show subdomain, environment-aware.
// Extracted from useShowPublicUrl so unauthenticated surfaces (the public shows
// map) can build viewer links for shows other than the signed-in one. Local dev
// uses a `subdomain.localhost:5173` form, dev test environment uses
// `*.remotefalcon.dev`, production uses `*.remotefalcon.com`. The
// `VITE_SWAP_CP` flag (used by some local setups) collapses everything to
// `localhost:5173`. Subdomain-mode self-hosts serve shows from their own domain.
export const getShowPublicUrl = (showSubdomain) => {
  if (!showSubdomain) return null;
  // Path-routed self-host (issue #151): viewers live at VITE_VIEWER_HOST/<show>.
  if (import.meta.env.VITE_CONTROL_HOST && import.meta.env.VITE_VIEWER_HOST) {
    const scheme = import.meta.env.VITE_HOST_ENV === Environments.LOCAL ? 'http' : 'https';
    return `${scheme}://${import.meta.env.VITE_VIEWER_HOST}/${showSubdomain}`;
  }
  // Subdomain-mode self-host (issue #151): viewers live at <show>.<base domain>,
  // where the base domain is the last VITE_HOSTNAME_PARTS labels of this host
  // (control.lights.example.com:3000 -> lights.example.com:3000; `host` keeps
  // the port on the last label). VITE_SELF_HOSTED is set by ops/self-host, so
  // the default 'controlpanel' label is covered too; a custom
  // VITE_CONTROL_PANEL_SUBDOMAIN only ever comes from a self-host. With SWAP_CP
  // every non-CP host serves the one show at its root, so the link is the bare
  // base domain.
  const swapCP = import.meta.env.VITE_SWAP_CP === 'true';
  if (import.meta.env.VITE_SELF_HOSTED === 'true' || import.meta.env.VITE_CONTROL_PANEL_SUBDOMAIN) {
    const baseDomain = window.location.host.split('.').slice(-import.meta.env.VITE_HOSTNAME_PARTS).join('.');
    return `${window.location.protocol}//${swapCP ? '' : `${showSubdomain}.`}${baseDomain}`;
  }
  if (import.meta.env.VITE_HOST_ENV === Environments.LOCAL) {
    return swapCP ? 'http://localhost:5173' : `http://${showSubdomain}.localhost:5173`;
  }
  if (import.meta.env.VITE_HOST_ENV === Environments.TEST) {
    return `https://${showSubdomain}.remotefalcon.dev`;
  }
  return `https://${showSubdomain}.remotefalcon.com`;
};

export default getShowPublicUrl;
