import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';

import { INSERT_VIEWER_PAGE_STATS } from '../../../../utils/graphql/viewer/mutations';
import { GET_ACTIVE_VIEWER_PAGE, GET_SHOW_FOR_VIEWER } from '../../../../utils/graphql/viewer/queries';

// Wiring test for the viewer page's load/poll loop. Apollo's hooks are
// replaced with controllable fakes keyed by document, because the question is
// what the PAGE does with success/failure, not what Apollo does. (MockedProvider
// would not exercise MultiAPILink anyway, see the ui-multiapilink memory.)
const calls = { getShow: 0, activePage: 0, stats: 0 };
let getShowImpl;
let activePageImpl;

vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useLazyQuery: (doc) => [
      (...args) => {
        if (doc === GET_SHOW_FOR_VIEWER) {
          calls.getShow += 1;
          return getShowImpl(...args);
        }
        if (doc === GET_ACTIVE_VIEWER_PAGE) {
          calls.activePage += 1;
          return activePageImpl(...args);
        }
        return Promise.resolve({ data: {} });
      }
    ],
    useMutation: (doc) => [
      () => {
        if (doc === INSERT_VIEWER_PAGE_STATS) {
          calls.stats += 1;
        }
        return Promise.resolve({ data: {} });
      }
    ]
  };
});

// Shrink the backoff so the test runs in real time: 30ms healthy, 10ms per
// failure. The real schedule is covered by pollBackoff/useBackoffPoll tests.
vi.mock('../../../../utils/pollBackoff', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, nextPollDelay: (failures) => (failures > 0 ? 10 : 30) };
});

vi.mock('../../../../utils/route-guard/helpers/helpers', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSubdomain: () => 'holtz' };
});

vi.mock('../../../../utils/analytics/posthog', () => ({ trackPosthogEvent: vi.fn() }));
vi.mock('axios', () => ({ default: { get: vi.fn().mockResolvedValue({ data: [] }) } }));

const SHOW = {
  showSubdomain: 'holtz',
  showName: 'Holtz',
  playingNow: '',
  playingNext: '',
  playingNextFromSchedule: '',
  sequences: [],
  sequenceGroups: [],
  votes: [],
  requests: [],
  preferences: { viewerControlMode: 'JUKEBOX', pageTitle: 'Holtz' }
};

const ok = (data) => Promise.resolve({ data });
const fail = () => Promise.resolve({ error: new Error('503') });

const renderPage = async () => {
  const { default: ExternalViewerPage } = await import('../index');
  return render(<ExternalViewerPage />);
};

describe('viewer page load/poll loop', () => {
  beforeEach(() => {
    calls.getShow = 0;
    calls.activePage = 0;
    calls.stats = 0;
    window.sessionStorage.clear();
    getShowImpl = () => ok({ getShow: SHOW });
    activePageImpl = () => ok({ getActiveViewerPage: '<div>page</div>' });
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it('retries a failed first load instead of stranding the page, and shows reconnecting meanwhile', async () => {
    let attempts = 0;
    getShowImpl = () => {
      attempts += 1;
      return attempts <= 2 ? fail() : ok({ getShow: SHOW });
    };
    const { unmount } = await renderPage();

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Reconnecting'));
    await waitFor(() => expect(calls.activePage).toBe(1));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(attempts).toBeGreaterThanOrEqual(3);
    expect(calls.stats).toBe(1);
    unmount();
  });

  it('keeps polling getShow after load without refetching the page HTML or re-writing stats', async () => {
    const { unmount } = await renderPage();
    await waitFor(() => expect(calls.getShow).toBeGreaterThanOrEqual(4));
    expect(calls.activePage).toBe(1);
    expect(calls.stats).toBe(1);
    unmount();
  });

  it('retries only the page HTML when that is the part that failed', async () => {
    let pageAttempts = 0;
    activePageImpl = () => {
      pageAttempts += 1;
      return pageAttempts === 1 ? fail() : ok({ getActiveViewerPage: '<div>page</div>' });
    };
    const { unmount } = await renderPage();
    await waitFor(() => expect(calls.activePage).toBe(2));
    // getShow ran once for init; the retry tick went straight to the page HTML
    expect(calls.getShow).toBe(1);
    expect(calls.stats).toBe(1);
    unmount();
  });

  it('writes viewer page stats at most once per session per show', async () => {
    const first = await renderPage();
    await waitFor(() => expect(calls.stats).toBe(1));
    first.unmount();

    const second = await renderPage();
    await waitFor(() => expect(calls.getShow).toBeGreaterThanOrEqual(3));
    expect(calls.stats).toBe(1);
    second.unmount();
  });

  it('stops polling while the tab is hidden', async () => {
    const { unmount } = await renderPage();
    await waitFor(() => expect(calls.activePage).toBe(1));

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    const frozen = calls.getShow;
    await act(async () => new Promise((r) => setTimeout(r, 150)));
    expect(calls.getShow).toBe(frozen);

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    await waitFor(() => expect(calls.getShow).toBe(frozen + 1));
    unmount();
  });
});
