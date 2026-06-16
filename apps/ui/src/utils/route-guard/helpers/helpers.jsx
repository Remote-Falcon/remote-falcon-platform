const controlPanelSubdomain = 'controlpanel';

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
  return subdomain === controlPanelSubdomain;
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
    return !!subdomain;
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
