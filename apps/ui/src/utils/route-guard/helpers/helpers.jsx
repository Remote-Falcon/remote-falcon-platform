// The hostname label that designates the control panel in subdomain mode.
// SaaS and every existing self-host use the default 'controlpanel'
// (controlpanel.remotefalcon.com). Self-hosters who want the control panel on a
// different label (issue #151 — e.g. control.example.com) set
// VITE_CONTROL_PANEL_SUBDOMAIN=control; any OTHER first label is then treated as
// a show name, so each show is served directly at <show>.example.com — no path
// segment and no wildcard DNS. Ignored in path-routed mode (the branches below
// that check VITE_CONTROL_HOST/VITE_VIEWER_HOST return before reaching it).
const controlPanelSubdomain = () => import.meta.env.VITE_CONTROL_PANEL_SUBDOMAIN || 'controlpanel';

// Option B (issue #151): path-routed self-host. When both VITE_CONTROL_HOST and
// VITE_VIEWER_HOST are set, the control panel and viewer pages live on two fixed
// hosts instead of per-show subdomains — the control panel at VITE_CONTROL_HOST,
// and viewers at VITE_VIEWER_HOST/<showSubdomain>. When either is blank (SaaS and
// existing self-host setups), every branch below falls through to the original
// subdomain-based logic, unchanged.
const controlHost = () => import.meta.env.VITE_CONTROL_HOST || '';
const viewerHost = () => import.meta.env.VITE_VIEWER_HOST || '';

export const isPathRouted = () => !!controlHost() && !!viewerHost();

// In path-routed mode the show is the first path segment of the URL, e.g.
// lightshow.example.com/holtz -> "holtz". This stays correct after the internal
// redirect to /remote-falcon because the show prefix remains first in the path.
export const getPathShow = () => window.location.pathname.split('/').filter(Boolean)[0] || '';

export const getSubdomain = () => {
  if (isPathRouted()) {
    return window.location.hostname === viewerHost() ? getPathShow() : '';
  }
  const swapCP = import.meta.env.VITE_SWAP_CP === 'true';
  const hostname = window.location.hostname;
  const hostnameSplit = hostname.split('.');
  return swapCP ?
    import.meta.env.VITE_VIEWER_PAGE_SUBDOMAIN :
    hostnameSplit.length > import.meta.env.VITE_HOSTNAME_PARTS ? hostnameSplit[0] : '';
};

export const isSubdomainCP = () => {
  if (isPathRouted()) {
    return window.location.hostname === controlHost();
  }
  const hostname = window.location.hostname;
  const hostnameSplit = hostname.split('.');
  const subdomain = hostnameSplit.length > import.meta.env.VITE_HOSTNAME_PARTS ? hostnameSplit[0] : '';
  return subdomain === controlPanelSubdomain();
}

export const isExternalViewer = () => {
  if (isPathRouted()) {
    return window.location.hostname === viewerHost() && !!getPathShow();
  }
  const swapCP = import.meta.env.VITE_SWAP_CP === 'true';
  const subdomain = getSubdomain();
  if(swapCP && !isSubdomainCP()) {
    return true;
  }else if(!swapCP) {
    // A non-empty subdomain means "viewer" UNLESS that subdomain is the control
    // panel's own label. Without the isSubdomainCP() guard, a configurable CP
    // label (issue #151 — e.g. control.example.com) is treated as a show and
    // redirected to /remote-falcon, so the control panel never loads. This must
    // stay in agreement with isSubdomainCP(): the CP host is never a viewer.
    return !!subdomain && !isSubdomainCP();
  }
};

// Router basename. In path-routed mode the viewer host serves each show under
// /<showSubdomain>, so React Router treats that prefix as the app root. The
// control host and every subdomain-mode host run at the root ('').
export const getRouterBasename = () => {
  if (isPathRouted() && window.location.hostname === viewerHost()) {
    const show = getPathShow();
    return show ? `/${show}` : '';
  }
  return '';
};
