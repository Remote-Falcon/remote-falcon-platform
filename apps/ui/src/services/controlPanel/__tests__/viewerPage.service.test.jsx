import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('axios', () => ({
  default: { get: vi.fn() }
}));

vi.mock('../../../utils/analytics/posthog', () => ({
  trackPosthogEvent: vi.fn()
}));

import axios from 'axios';

import { trackPosthogEvent } from '../../../utils/analytics/posthog';
import { FALLBACK_TEMPLATES, TEMPLATES_BASE_URL, getRemoteViewerPageTemplatesFromGithubService } from '../viewerPage.service';

const MANIFEST_URL = `${TEMPLATES_BASE_URL}/templates.json`;
const fileUrl = (file) => `${TEMPLATES_BASE_URL}/templates/${file}`;

const manifest = {
  version: 1,
  templates: [
    {
      file: 'santa.html',
      title: 'Santa',
      author: 'Jim Pier',
      season: 'christmas'
    },
    { file: 'the-og.html', title: 'The OG', author: 'Rick Harris' },
    {
      file: 'pumpkin-patch.html',
      title: 'Pumpkin Patch',
      author: 'Jim Pier',
      season: 'halloween'
    }
  ]
};

const notFound = () =>
  Object.assign(new Error('Request failed with status code 404'), {
    response: { status: 404 }
  });

// Routes axios.get by URL. `manifestData` is the manifest response body (or an
// Error to reject with); `failing` lists template files that 404.
const route = ({ manifestData = manifest, failing = [] } = {}) => {
  axios.get.mockImplementation((url) => {
    if (url === MANIFEST_URL) {
      return manifestData instanceof Error ? Promise.reject(manifestData) : Promise.resolve({ data: manifestData });
    }
    const file = url.slice(`${TEMPLATES_BASE_URL}/templates/`.length);
    if (failing.includes(file)) return Promise.reject(notFound());
    return Promise.resolve({ data: `<html>${file}</html>` });
  });
};

const requestedTemplateUrls = () => axios.get.mock.calls.map(([url]) => url).filter((url) => url !== MANIFEST_URL);

describe('getRemoteViewerPageTemplatesFromGithubService', () => {
  beforeEach(() => {
    axios.get.mockReset();
    trackPosthogEvent.mockReset();
  });

  it('returns manifest templates in manifest order with "<title> by <author>" labels', async () => {
    route();
    const templates = await getRemoteViewerPageTemplatesFromGithubService();

    expect(templates).toEqual([
      {
        key: 1,
        title: 'Santa by Jim Pier',
        content: '<html>santa.html</html>',
        season: 'christmas'
      },
      {
        key: 2,
        title: 'The OG by Rick Harris',
        content: '<html>the-og.html</html>',
        season: undefined
      },
      {
        key: 3,
        title: 'Pumpkin Patch by Jim Pier',
        content: '<html>pumpkin-patch.html</html>',
        season: 'halloween'
      }
    ]);
    expect(requestedTemplateUrls()).toEqual(manifest.templates.map((t) => fileUrl(t.file)));
    expect(trackPosthogEvent).not.toHaveBeenCalled();
  });

  it('still returns the other templates when one template 404s, and reports the failed file', async () => {
    route({ failing: ['the-og.html'] });
    const templates = await getRemoteViewerPageTemplatesFromGithubService();

    expect(templates.map((t) => t.title)).toEqual(['Santa by Jim Pier', 'Pumpkin Patch by Jim Pier']);
    expect(templates.map((t) => t.key)).toEqual([1, 2]);
    expect(trackPosthogEvent).toHaveBeenCalledTimes(1);
    expect(trackPosthogEvent).toHaveBeenCalledWith(
      'viewer_page_templates_fetch_failed',
      expect.objectContaining({
        operation: 'fetch_remote_templates',
        manifest_failed: false,
        used_fallback: false,
        failed_files: ['the-og.html'],
        loaded_count: 2
      })
    );
  });

  it('accepts a manifest delivered as a JSON string', async () => {
    route({ manifestData: JSON.stringify(manifest) });
    const templates = await getRemoteViewerPageTemplatesFromGithubService();
    expect(templates.map((t) => t.title)).toEqual(['Santa by Jim Pier', 'The OG by Rick Harris', 'Pumpkin Patch by Jim Pier']);
  });

  const expectFallback = async () => {
    const templates = await getRemoteViewerPageTemplatesFromGithubService();
    expect(templates.map((t) => t.title)).toEqual([
      'The OG by Rick Harris',
      'Purple Halloween by StramMade3D',
      'Red & White by StramMade3D',
      'On Air by Jason Toy',
      'Lumos Light Show by James Vance',
      'Dynamic Menu by Matt Orelup'
    ]);
    expect(templates.map((t) => t.key)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(requestedTemplateUrls()).toEqual(FALLBACK_TEMPLATES.map((t) => fileUrl(t.file)));
    expect(trackPosthogEvent).toHaveBeenCalledTimes(1);
    expect(trackPosthogEvent).toHaveBeenCalledWith(
      'viewer_page_templates_fetch_failed',
      expect.objectContaining({
        manifest_failed: true,
        used_fallback: true,
        failed_files: []
      })
    );
  };

  it('uses the built-in fallback list when the manifest 404s', async () => {
    route({ manifestData: notFound() });
    await expectFallback();
  });

  it('uses the built-in fallback list when the manifest is invalid JSON', async () => {
    route({ manifestData: '{ "version": 1, "templates": [' });
    await expectFallback();
  });

  it('uses the built-in fallback list when the manifest version is unknown', async () => {
    route({ manifestData: { ...manifest, version: 2 } });
    await expectFallback();
  });

  it('uses the built-in fallback list when a manifest entry is missing a required field', async () => {
    route({
      manifestData: {
        version: 1,
        templates: [{ file: 'santa.html', title: 'Santa' }]
      }
    });
    await expectFallback();
  });

  it('throws (and reports once) when no template loads', async () => {
    route({ failing: manifest.templates.map((t) => t.file) });
    const error = await getRemoteViewerPageTemplatesFromGithubService().catch((e) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error.reported).toBe(true);
    expect(trackPosthogEvent).toHaveBeenCalledTimes(1);
    expect(trackPosthogEvent).toHaveBeenCalledWith(
      'viewer_page_templates_fetch_failed',
      expect.objectContaining({
        loaded_count: 0,
        failed_files: manifest.templates.map((t) => t.file)
      })
    );
  });
});
