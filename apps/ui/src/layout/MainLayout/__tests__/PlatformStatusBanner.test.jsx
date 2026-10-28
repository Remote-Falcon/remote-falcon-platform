import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import React from 'react';

vi.mock('../../../utils/platformStatus', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchPlatformStatus: vi.fn()
}));

import { fetchPlatformStatus } from '../../../utils/platformStatus';
import PlatformStatusBanner, { POLL_MS } from '../PlatformStatusBanner';

const renderBanner = () =>
  render(
    <ThemeProvider theme={createTheme()}>
      <PlatformStatusBanner />
    </ThemeProvider>
  );

// Let the mocked fetch promise resolve and React commit the state update.
const flush = () => act(async () => {});

describe('PlatformStatusBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchPlatformStatus.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing while everything is operational', async () => {
    fetchPlatformStatus.mockResolvedValue({ state: 'operational', affected: [] });
    renderBanner();
    await flush();
    expect(screen.queryByTestId('platform-status-banner')).toBeNull();
  });

  it('names the affected services and links to the status page during an outage', async () => {
    fetchPlatformStatus.mockResolvedValue({ state: 'downtime', affected: ['Viewer Pages', 'Viewer API'] });
    renderBanner();
    await flush();
    expect(screen.getByTestId('platform-status-banner')).toHaveTextContent(
      'Remote Falcon is having trouble with Viewer Pages, Viewer API'
    );
    expect(screen.getByRole('link', { name: /status page/i })).toHaveAttribute(
      'href',
      'https://status.remotefalcon.com'
    );
  });

  it('uses maintenance wording during scheduled maintenance', async () => {
    fetchPlatformStatus.mockResolvedValue({ state: 'maintenance', affected: ['FPP Plugin API'] });
    renderBanner();
    await flush();
    expect(screen.getByTestId('platform-status-banner')).toHaveTextContent('Scheduled maintenance: FPP Plugin API');
  });

  it('stays hidden when the status feed cannot be reached', async () => {
    fetchPlatformStatus.mockRejectedValue(new Error('network'));
    renderBanner();
    await flush();
    expect(screen.queryByTestId('platform-status-banner')).toBeNull();
  });

  it('polls again after POLL_MS and clears once the incident resolves', async () => {
    fetchPlatformStatus
      .mockResolvedValueOnce({ state: 'downtime', affected: ['Website'] })
      .mockResolvedValueOnce({ state: 'operational', affected: [] });
    renderBanner();
    await flush();
    expect(screen.getByTestId('platform-status-banner')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(POLL_MS);
    });
    await flush();
    expect(fetchPlatformStatus).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('platform-status-banner')).toBeNull();
  });

  it('skips polls while the tab is hidden', async () => {
    fetchPlatformStatus.mockResolvedValue({ state: 'operational', affected: [] });
    renderBanner();
    await flush();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS * 3);
    });
    expect(fetchPlatformStatus).toHaveBeenCalledTimes(1);
    visibility.mockRestore();
  });
});
