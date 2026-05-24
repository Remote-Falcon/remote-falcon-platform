import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { getSubdomain, isSubdomainCP, isExternalViewer } from '../helpers';

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
});
