import newAxios from 'axios';

import { trackPosthogEvent } from '../../utils/analytics/posthog';

export const TEMPLATES_BASE_URL = 'https://raw.githubusercontent.com/Remote-Falcon/remote-falcon-page-templates/main';

// Used when templates.json can't be fetched, parsed or validated, so a broken
// manifest means a stale list rather than an empty picker.
export const FALLBACK_TEMPLATES = [
  { file: 'the-og.html', title: 'The OG', author: 'Rick Harris' },
  {
    file: 'purple-halloween.html',
    title: 'Purple Halloween',
    author: 'StramMade3D',
    season: 'halloween'
  },
  {
    file: 'red-and-white.html',
    title: 'Red & White',
    author: 'StramMade3D',
    season: 'christmas'
  },
  { file: 'on-air.html', title: 'On Air', author: 'Jason Toy' },
  {
    file: 'lumos-light-show.html',
    title: 'Lumos Light Show',
    author: 'James Vance'
  },
  { file: 'dynamic-menu.html', title: 'Dynamic Menu', author: 'Matt Orelup' }
];

const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;

// Returns the manifest's template entries, or throws if the manifest is not
// a version 1 manifest. axios hands back a string when the body isn't JSON
// it could parse, so parse it here and let invalid JSON throw.
const parseManifest = (data) => {
  const manifest = typeof data === 'string' ? JSON.parse(data) : data;
  if (manifest?.version !== 1) throw new Error(`Unsupported templates.json version: ${manifest?.version}`);
  const { templates } = manifest;
  const valid =
    Array.isArray(templates) &&
    templates.length > 0 &&
    templates.every((t) => isNonEmptyString(t?.file) && isNonEmptyString(t?.title) && isNonEmptyString(t?.author));
  if (!valid) throw new Error('templates.json does not match the expected shape');
  return templates;
};

// eslint-disable-next-line import/prefer-default-export
export const getRemoteViewerPageTemplatesFromGithubService = async () => {
  let entries;
  let manifestError;
  try {
    const response = await newAxios.get(`${TEMPLATES_BASE_URL}/templates.json`);
    entries = parseManifest(response.data);
  } catch (err) {
    manifestError = err;
    entries = FALLBACK_TEMPLATES;
  }

  const results = await Promise.allSettled(
    entries.map((entry) =>
      newAxios.get(`${TEMPLATES_BASE_URL}/templates/${entry.file}`, {
        responseType: 'text'
      })
    )
  );

  const viewerPages = [];
  const failedFiles = [];
  results.forEach((result, index) => {
    const { file, title, author, season } = entries[index];
    if (result.status === 'fulfilled') {
      viewerPages.push({
        key: viewerPages.length + 1,
        title: `${title} by ${author}`,
        content: result.value.data,
        season
      });
    } else {
      failedFiles.push(file);
    }
  });

  if (manifestError || failedFiles.length > 0) {
    trackPosthogEvent('viewer_page_templates_fetch_failed', {
      operation: 'fetch_remote_templates',
      manifest_failed: Boolean(manifestError),
      manifest_error: manifestError?.message,
      used_fallback: Boolean(manifestError),
      failed_files: failedFiles,
      loaded_count: viewerPages.length
    });
  }

  if (viewerPages.length === 0) {
    // Already reported above; `reported` lets callers skip a duplicate event.
    throw Object.assign(new Error('No viewer page templates could be loaded'), {
      reported: true
    });
  }

  return viewerPages;
};
