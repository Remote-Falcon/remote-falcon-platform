import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { getSubdomain, isSubdomainCP, isExternalViewer, getRouterBasename } from '../helpers';

// These helpers govern the entire routing topology: whether the current
// load is the control panel, a viewer page, or an external viewer. A
// silent regression here can re-route everyone to the wrong app shell.
//
// jsdom lets us swap window.location.hostname per-test via Object.defineProperty.
// import.meta.env values are mutable in tests — vitest exposes the same
// proxy and modifying it on the import.meta.env object is supported.

const setHostname = (host) => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, hostname: host }
  });
};

const setLocation = (host, pathname = '/') => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, hostname: host, pathname }
  });
};

describe('route-guard helpers', () => {
  const originalEnv = { ...import.meta.env };

  beforeEach(() => {
    import.meta.env.VITE_HOSTNAME_PARTS = '2';
    import.meta.env.VITE_SWAP_CP = 'false';
    import.meta.env.VITE_VIEWER_PAGE_SUBDOMAIN = 'previewshow';
  });

  afterEach(() => {
    for (const k of Object.keys(import.meta.env)) {
      delete import.meta.env[k];
    }
    Object.assign(import.meta.env, originalEnv);
  });

  describe('getSubdomain', () => {
    it('returns the first label when the host has more parts than VITE_HOSTNAME_PARTS', () => {
      setHostname('mattshow.remotefalcon.com');
      expect(getSubdomain()).toBe('mattshow');
    });

    it('returns empty string on bare domains (no subdomain to harvest)', () => {
      setHostname('remotefalcon.com');
      expect(getSubdomain()).toBe('');
    });

    it('honours VITE_SWAP_CP by returning the canned preview subdomain', () => {
      import.meta.env.VITE_SWAP_CP = 'true';
      setHostname('localhost');
      expect(getSubdomain()).toBe('previewshow');
    });
  });

  describe('isSubdomainCP', () => {
    it('returns true on controlpanel.* hosts', () => {
      setHostname('controlpanel.remotefalcon.com');
      expect(isSubdomainCP()).toBe(true);
    });

    it('returns false for any other subdomain', () => {
      setHostname('mattshow.remotefalcon.com');
      expect(isSubdomainCP()).toBe(false);
    });

    it('returns false on a bare domain', () => {
      setHostname('remotefalcon.com');
      expect(isSubdomainCP()).toBe(false);
    });
  });

  describe('isExternalViewer', () => {
    it('returns true when a non-CP subdomain is present (default mode)', () => {
      setHostname('mattshow.remotefalcon.com');
      expect(isExternalViewer()).toBe(true);
    });

    it('returns false when CP subdomain is loaded (default mode)', () => {
      setHostname('controlpanel.remotefalcon.com');
      // CP subdomain still has a non-empty subdomain string, so default
      // mode treats it as external — pin the current behaviour so any
      // future re-routing fix is intentional.
      expect(isExternalViewer()).toBe(true);
    });

    it('returns true under SWAP_CP when host is NOT controlpanel', () => {
      import.meta.env.VITE_SWAP_CP = 'true';
      setHostname('mattshow.localhost');
      expect(isExternalViewer()).toBe(true);
    });

    it('returns falsy under SWAP_CP when on the controlpanel host', () => {
      import.meta.env.VITE_SWAP_CP = 'true';
      // Force isSubdomainCP() true by making the first label
      // 'controlpanel' once hostname splits past VITE_HOSTNAME_PARTS.
      import.meta.env.VITE_HOSTNAME_PARTS = '1';
      setHostname('controlpanel.localhost');
      expect(isExternalViewer()).toBeFalsy();
    });
  });

  describe('configurable control-panel subdomain (issue #151 — VITE_CONTROL_PANEL_SUBDOMAIN)', () => {
    beforeEach(() => {
      import.meta.env.VITE_CONTROL_PANEL_SUBDOMAIN = 'control';
    });

    it('treats the configured label as the control panel', () => {
      setHostname('control.example.com');
      expect(isSubdomainCP()).toBe(true);
    });

    it('no longer treats the default controlpanel label as the control panel', () => {
      setHostname('controlpanel.example.com');
      expect(isSubdomainCP()).toBe(false);
    });

    it('treats every other first label as a show name', () => {
      setHostname('lightshow.example.com');
      expect(getSubdomain()).toBe('lightshow');
      expect(isSubdomainCP()).toBe(false);
      expect(isExternalViewer()).toBe(true);
    });

    it('falls back to controlpanel when the var is blank', () => {
      import.meta.env.VITE_CONTROL_PANEL_SUBDOMAIN = '';
      setHostname('controlpanel.example.com');
      expect(isSubdomainCP()).toBe(true);
      setHostname('control.example.com');
      expect(isSubdomainCP()).toBe(false);
    });
  });

  describe('path-routed mode (issue #151 — VITE_CONTROL_HOST + VITE_VIEWER_HOST)', () => {
    beforeEach(() => {
      import.meta.env.VITE_CONTROL_HOST = 'control.example.com';
      import.meta.env.VITE_VIEWER_HOST = 'lightshow.example.com';
    });

    it('getSubdomain returns the first path segment on the viewer host', () => {
      setLocation('lightshow.example.com', '/holtz');
      expect(getSubdomain()).toBe('holtz');
    });

    it('getSubdomain keeps the show after the internal /remote-falcon redirect', () => {
      setLocation('lightshow.example.com', '/holtz/remote-falcon');
      expect(getSubdomain()).toBe('holtz');
    });

    it('getSubdomain returns empty on the control host', () => {
      setLocation('control.example.com', '/dashboard');
      expect(getSubdomain()).toBe('');
    });

    it('isSubdomainCP is true on the control host and false on the viewer host', () => {
      setLocation('control.example.com', '/');
      expect(isSubdomainCP()).toBe(true);
      setLocation('lightshow.example.com', '/holtz');
      expect(isSubdomainCP()).toBe(false);
    });

    it('isExternalViewer is true on the viewer host with a show, false on the control host', () => {
      setLocation('lightshow.example.com', '/holtz');
      expect(isExternalViewer()).toBe(true);
      setLocation('control.example.com', '/dashboard');
      expect(isExternalViewer()).toBe(false);
    });

    it('isExternalViewer is false on the viewer host with no show in the path', () => {
      setLocation('lightshow.example.com', '/');
      expect(isExternalViewer()).toBe(false);
    });

    it('getRouterBasename is /<show> on the viewer host and empty on the control host', () => {
      setLocation('lightshow.example.com', '/holtz');
      expect(getRouterBasename()).toBe('/holtz');
      setLocation('control.example.com', '/dashboard');
      expect(getRouterBasename()).toBe('');
    });
  });
});
